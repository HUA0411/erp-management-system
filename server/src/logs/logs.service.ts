import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperationLogEntity } from '../entities/operation-log.entity';
import { TenantContext } from '../tenant/tenant-context';
import { formatDateTime } from '../common/utils/no-generator';

/** 操作日志查询条件 */
export interface LogQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  module?: string;
}

/** 操作日志列表项（对应前端 OperationLogItem） */
export interface LogItem {
  id: number;
  username: string;
  module: string;
  action: string;
  method: string;
  path: string;
  ip: string;
  createdAt: string;
}

/**
 * 操作审计日志。
 *
 * 说明：该模块在本仓库中缺失（`server/src/logs` 未提交），是本地重建版本，用于让项目可编译运行。
 * 与项目其余部分一致：从 TenantContext(AsyncLocalStorage) 取当前用户与租户，
 * 并经中间件增强携带的 method/path/ip 记录请求来源。
 * 审计写入不阻断业务：失败仅告警。
 */
@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);

  constructor(
    @InjectRepository(OperationLogEntity)
    private readonly logRepo: Repository<OperationLogEntity>,
  ) {}

  async record(module: string, action: string, params?: unknown): Promise<void> {
    const ctx = TenantContext.get();
    try {
      const entity = this.logRepo.create();
      entity.companyId = ctx.companyId;
      entity.userId = ctx.userId ?? 0;
      entity.username = ctx.username ?? '';
      entity.module = module;
      entity.action = action;
      entity.params = this.truncate(params);
      entity.method = ctx.method ? ctx.method.slice(0, 8) : 'API';
      entity.path = ctx.path ? ctx.path.slice(0, 128) : '/api';
      entity.ip = ctx.ip ?? '';
      await this.logRepo.save(entity);
    } catch (err) {
      this.logger.warn(`[审计] 操作日志记录失败: ${(err as Error).message}`);
    }
  }

  /**
   * 分页查询操作日志（前端「系统管理 → 操作日志」页）。
   * 严格按租户隔离：company_id 条件恒带，跨租户不可见。
   */
  async list(query: LogQuery): Promise<{ list: LogItem[]; total: number; page: number; pageSize: number }> {
    const { page, pageSize, keyword, module } = query;
    const companyId = TenantContext.companyId;

    const qb = this.logRepo
      .createQueryBuilder('l')
      .where('l.company_id = :cid', { cid: companyId });

    if (module) {
      qb.andWhere('l.module = :module', { module });
    }
    if (keyword) {
      qb.andWhere('(l.username LIKE :kw OR l.module LIKE :kw OR l.action LIKE :kw)', {
        kw: `%${keyword}%`,
      });
    }

    const [rows, total] = await qb
      .orderBy('l.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      list: rows.map((l) => ({
        id: l.id,
        username: l.username ?? '',
        module: l.module,
        action: l.action,
        method: l.method,
        path: l.path,
        ip: l.ip ?? '',
        createdAt: formatDateTime(l.createdAt),
      })),
      total,
      page,
      pageSize,
    };
  }

  private truncate(params: unknown, max = 5000): string {
    if (params === undefined || params === null) {
      return '';
    }
    try {
      const raw = JSON.stringify(params);
      return raw.length > max ? raw.slice(0, max) : raw;
    } catch {
      return String(params).slice(0, max);
    }
  }
}
