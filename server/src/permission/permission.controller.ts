import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PermissionService } from './permission.service';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

@ApiTags('权限')
@Controller('permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  /** 全部权限树（含按钮），角色授权页面使用 */
  @Get('all')
  @RequirePermissions('system:permission:view')
  getAllTree() {
    return this.permissionService.getAllTree();
  }

  @Put(':id')
  @RequirePermissions('system:permission:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; icon?: string; sort?: number; path?: string },
  ) {
    return this.permissionService.updatePermission(id, body);
  }
}
