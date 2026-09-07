import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import { TenantContext, TenantContextData } from './tenant-context';

export interface JwtPayload {
  sub: number;
  username: string;
  companyId: number;
  isSuperAdmin?: boolean;
}

/**
 * 从 Authorization: Bearer <token> 解析 JWT，并将租户上下文写入 AsyncLocalStorage。
 * 后续所有请求处理（guards/services/repositories）共享该上下文。
 * 令牌无效/缺失 → companyId=0，由 JwtAuthGuard 统一拒绝。
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    let data: TenantContextData = { companyId: 0 };
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      try {
        const payload = this.jwtService.verify<JwtPayload>(header.slice(7), {
          secret: this.configService.get<string>('JWT_SECRET'),
        });
        data = {
          companyId: payload.companyId,
          userId: payload.sub,
          username: payload.username,
          isSuperAdmin: !!payload.isSuperAdmin,
        };
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
}
