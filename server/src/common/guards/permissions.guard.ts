import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { TenantContext } from '../../tenant/tenant-context';
import { PermissionService } from '../../permission/permission.service';

/**
 * 全局权限守卫：接口声明 @RequirePermissions(...) 时校验当前用户权限码。
 * 平台超管（isSuperAdmin）直接放行。
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const data = TenantContext.get();
    if (data.isSuperAdmin) return true;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const codes = await this.permissionService.getUserPermissionCodes(data.userId!, data.companyId);
    if (required.every((code) => codes.includes(code))) return true;

    throw new ForbiddenException('无权限执行此操作');
  }
}
