import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContextData } from '../../tenant/tenant-context';

/** 从请求上下文取当前登录用户（由 TenantMiddleware 注入） */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContextData => {
    return ctx.switchToHttp().getRequest().user as TenantContextData;
  },
);
