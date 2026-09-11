import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NextFunction, Request, Response } from 'express';
import { TenantContext, TenantContextData } from './tenant-context';

export interface JwtPayload {
  sub: number;
  username: string;
  companyId: number;
  isSuperAdmin?: boolean;
  /** 签发时刻该用户的 pwd_changed_at（毫秒时间戳，从未改过密码为 0） */
  pwdAt?: number;
}

interface SessionSnapshot {
  /** 当前库里的 pwd_changed_at（毫秒），无值记 0 */
  pwdAt: number;
  /** 账号状态，1 启用 0 停用 */
  status: number;
  /** 缓存过期时刻 */
  exp: number;
}

/** 会话状态缓存有效期：5 秒。密码变更最多 5 秒后在所有请求上生效。 */
const SESSION_TTL_MS = 5_000;
/** 缓存条数上限，防止长期运行内存无界增长 */
const SESSION_CACHE_MAX = 5_000;

/**
 * 从 Authorization: Bearer <token> 解析 JWT，并将租户上下文写入 AsyncLocalStorage。
 * 后续所有请求处理（guards/services/repositories）共享该上下文。
 * 令牌无效/缺失 → companyId=0，由 JwtAuthGuard 统一拒绝。
 *
 * 除验签外还做一次「会话仍然有效」校验（原先完全没有）：
 *   - 账号被停用（status=0）→ 立即失效，不再能用满 8 小时
 *   - 密码被修改/重置 → 立即失效（token 里的 pwdAt 与库中 pwd_changed_at 不一致）
 * 每次请求多一次按主键的查询，用 5 秒内存缓存压掉绝大多数。
 * 注意：多进程（PM2 cluster）下各进程缓存独立，最长有 5 秒不一致窗口，
 * 需要强一致时应改为 Redis 存会话版本号。
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly sessionCache = new Map<string, SessionSnapshot>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    let data: TenantContextData = { companyId: 0 };
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      try {
        const payload = this.jwtService.verify<JwtPayload>(header.slice(7), {
          secret: this.configService.get<string>('JWT_SECRET'),
        });
        if (await this.isSessionAlive(payload)) {
          data = {
            companyId: payload.companyId,
            userId: payload.sub,
            username: payload.username,
            isSuperAdmin: !!payload.isSuperAdmin,
          };
        }
      } catch {
        // 令牌无效视为未认证
      }
    }
    // 记录请求来源，供操作审计（logs 模块）使用
    const forwardedIp = (req.headers['x-forwarded-for'] as string) || '';
    data.method = req.method;
    data.path = req.originalUrl || req.url;
    data.ip = req.ip || forwardedIp.split(',')[0]?.trim() || undefined;
    TenantContext.run(data, () => next());
  }

  /** 会话是否仍然有效：账号未停用，且密码未在 token 签发后被修改 */
  private async isSessionAlive(payload: JwtPayload): Promise<boolean> {
    if (!payload.companyId || !payload.sub) return false;

    const key = `${payload.companyId}:${payload.sub}`;
    const now = Date.now();
    let snap: SessionSnapshot | null = this.sessionCache.get(key) ?? null;
    if (!snap || snap.exp <= now) {
      snap = await this.loadSession(key, payload.companyId, payload.sub);
      if (!snap) return false;
      if (this.sessionCache.size >= SESSION_CACHE_MAX) this.sessionCache.clear();
      this.sessionCache.set(key, snap);
    }

    if (snap.status !== 1) return false;
    // token 里没带 pwdAt（安全修复上线前签发的旧 token）→ 视为缺失，按 0 处理，
    // 与库里已回填的 created_at 不一致，会被判失效，强制重新登录一次。
    const tokenPwdAt = payload.pwdAt ?? 0;
    return tokenPwdAt === snap.pwdAt;
  }

  private async loadSession(
    key: string,
    companyId: number,
    userId: number,
  ): Promise<SessionSnapshot | null> {
    try {
      const rows = await this.dataSource.query<Array<{ pwd_changed_at: Date | string | null; status: number }>>(
        'SELECT pwd_changed_at, status FROM sys_user WHERE id = ? AND company_id = ? LIMIT 1',
        [userId, companyId],
      );
      const row = rows[0];
      if (!row) return null;
      const snap: SessionSnapshot = {
        pwdAt: row.pwd_changed_at ? new Date(row.pwd_changed_at).getTime() : 0,
        status: Number(row.status),
        exp: Date.now() + SESSION_TTL_MS,
      };
      this.sessionCache.set(key, snap);
      return snap;
    } catch {
      // 数据库异常时保守拒绝，避免把失效会话当成有效
      return null;
    }
  }
}
