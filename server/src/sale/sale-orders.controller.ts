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
import { SaleOrdersService } from './sale-orders.service';
import { CreateSaleOrderDto, UpdateSaleOrderDto } from './dto/sale-order.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { LogsService } from '../logs/logs.service';

@ApiTags('销售订单')
@Controller('sale-orders')
export class SaleOrdersController {
  constructor(
    private readonly ordersService: SaleOrdersService,
    private readonly logsService: LogsService,
  ) {}

  @Get()
  @RequirePermissions('sale:order:view')
  list(@Query() query: PaginationDto & { status?: string; startDate?: string; endDate?: string }) {
    return this.ordersService.list({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      status: query.status,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get(':id')
  @RequirePermissions('sale:order:view')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.detail(id);
  }

  @Post()
  @RequirePermissions('sale:order:create')
  async create(@Body() dto: CreateSaleOrderDto) {
    const result = await this.ordersService.create(dto);
    await this.logsService.record('销售订单', '新增销售订单', { orderNo: result.orderNo });
    return result;
  }

  @Put(':id')
  @RequirePermissions('sale:order:update')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSaleOrderDto) {
    const result = await this.ordersService.update(id, dto);
    await this.logsService.record('销售订单', '编辑销售订单', { orderNo: result.orderNo });
    return result;
  }

  @Delete(':id')
  @RequirePermissions('sale:order:delete')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.ordersService.remove(id);
    await this.logsService.record('销售订单', '删除销售订单', { id });
    return { ok: true };
  }

  @Put(':id/confirm')
  @RequirePermissions('sale:order:confirm')
  async confirm(@Param('id', ParseIntPipe) id: number) {
    await this.ordersService.confirm(id);
    await this.logsService.record('销售订单', '确认销售订单', { id });
    return { ok: true };
  }

  @Put(':id/cancel')
  @RequirePermissions('sale:order:cancel')
  async cancel(@Param('id', ParseIntPipe) id: number) {
    await this.ordersService.cancel(id);
    await this.logsService.record('销售订单', '取消销售订单', { id });
    return { ok: true };
  }

  @Put(':id/outbound')
  @RequirePermissions('sale:order:outbound')
  async outbound(@Param('id', ParseIntPipe) id: number) {
    const result = await this.ordersService.outbound(id);
    await this.logsService.record('销售订单', '销售出库', result);
    return result;
  }
}
