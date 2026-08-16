import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TenantContext } from '../../tenant/tenant-context';

/** 全局认证守卫：未认证（companyId=0）一律 401；@Public() 接口跳过 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const data = TenantContext.get();
    if (!data.companyId || data.companyId <= 0) {
      throw new UnauthorizedException('未登录或登录已过期');
    }
    context.switchToHttp().getRequest().user = data;
    return true;
  }
}
