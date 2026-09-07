import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperationLogEntity } from '../entities/operation-log.entity';
import { TenantContext } from '../tenant/tenant-context';

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
