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
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
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
  list(@Query() query: PaginationDto & { status?: number }) {
    return this.suppliersService.list({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      status: query.status != null ? Number(query.status) : undefined,
    });
  }

  @Get('options')
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
