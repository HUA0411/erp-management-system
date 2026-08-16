import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { LogsService } from '../logs/logs.service';

@ApiTags('角色管理')
@Controller('roles')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly logsService: LogsService,
  ) {}

  @Get()
  @RequirePermissions('system:role:view')
  list(@Query() query: PaginationDto) {
    return this.rolesService.list({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
    });
  }

  @Get('options')
  allOptions() {
    return this.rolesService.allOptions();
  }

  @Post()
  @RequirePermissions('system:role:create')
  async create(@Body() dto: CreateRoleDto) {
    const result = await this.rolesService.create(dto);
    await this.logsService.record('角色管理', '新增角色', { name: dto.name, code: dto.code });
    return result;
  }

  @Put(':id')
  @RequirePermissions('system:role:update')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    const result = await this.rolesService.update(id, dto);
    await this.logsService.record('角色管理', '编辑角色', { id, permissionIds: dto.permissionIds });
    return result;
  }

  @Delete(':id')
  @RequirePermissions('system:role:delete')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.rolesService.remove(id);
    await this.logsService.record('角色管理', '删除角色', { id });
    return { ok: true };
  }
}
