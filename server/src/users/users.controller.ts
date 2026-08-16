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
import { UsersService } from './users.service';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { LogsService } from '../logs/logs.service';
import { TenantContext } from '../tenant/tenant-context';

@ApiTags('用户管理')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly logsService: LogsService,
  ) {}

  @Get()
  @RequirePermissions('system:user:view')
  list(@Query() query: PaginationDto) {
    return this.usersService.list({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
    });
  }

  @Post()
  @RequirePermissions('system:user:create')
  async create(@Body() dto: CreateUserDto) {
    const result = await this.usersService.create(dto);
    await this.logsService.record('用户管理', '新增用户', {
      username: dto.username,
      roleIds: dto.roleIds,
    });
    return result;
  }

  @Put(':id')
  @RequirePermissions('system:user:update')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    const result = await this.usersService.update(id, dto);
    await this.logsService.record('用户管理', '编辑用户', { id, ...dto });
    return result;
  }

  @Put(':id/password')
  @RequirePermissions('system:user:reset-password')
  async resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto) {
    await this.usersService.resetPassword(id, dto.password);
    await this.logsService.record('用户管理', '重置密码', { id });
    return { ok: true };
  }

  @Delete(':id')
  @RequirePermissions('system:user:delete')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.usersService.remove(id);
    await this.logsService.record('用户管理', '停用用户', { id, operator: TenantContext.username });
    return { ok: true };
  }
}
