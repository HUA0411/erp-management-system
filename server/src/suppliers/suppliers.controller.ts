import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { StatusNumberQueryDto } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { LogsService } from '../logs/logs.service';

@ApiTags('供应商')
@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly logsService: LogsService,
  ) {}

  @Get()
  @RequirePermissions('supplier:view')
  list(@Query() query: StatusNumberQueryDto) {
    return this.suppliersService.list({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      status: query.status != null ? Number(query.status) : undefined,
    });
  }

  /**
   * 下拉选项。必须显式声明权限：
   * PermissionsGuard 对**没有** @RequirePermissions 的接口直接放行（permissions.guard.ts:26），
   * 所以漏写装饰器 = 任何登录用户都能拉全量数据。
   * products/options 还会回传 purchasePrice（采购成本价），泄漏面更大。
   */
  @Get('options')
  @RequirePermissions('supplier:view')
  options(@Query('keyword') keyword?: string) {
    return this.suppliersService.options(keyword);
  }

  @Post()
  @RequirePermissions('supplier:create')
  async create(@Body() dto: CreateSupplierDto) {
    const result = await this.suppliersService.create(dto);
    await this.logsService.record('供应商', '新增供应商', { code: dto.code, name: dto.name });
    return result;
  }

  @Put(':id')
  @RequirePermissions('supplier:update')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSupplierDto) {
    await this.suppliersService.update(id, dto);
    await this.logsService.record('供应商', '编辑供应商', { id });
    return { ok: true };
  }

  @Delete(':id')
  @RequirePermissions('supplier:delete')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.suppliersService.remove(id);
    await this.logsService.record('供应商', '删除供应商', { id });
    return { ok: true };
  }
}
