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
import { PurchaseOrdersService } from './purchase-orders.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { LogsService } from '../logs/logs.service';

@ApiTags('采购订单')
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly ordersService: PurchaseOrdersService,
    private readonly logsService: LogsService,
  ) {}

  @Get()
  @RequirePermissions('purchase:order:view')
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
  @RequirePermissions('purchase:order:view')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.detail(id);
  }

  @Post()
  @RequirePermissions('purchase:order:create')
  async create(@Body() dto: CreatePurchaseOrderDto) {
    const result = await this.ordersService.create(dto);
    await this.logsService.record('采购订单', '新增采购订单', { orderNo: result.orderNo });
    return result;
  }

  @Put(':id')
  @RequirePermissions('purchase:order:update')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePurchaseOrderDto) {
    const result = await this.ordersService.update(id, dto);
    await this.logsService.record('采购订单', '编辑采购订单', { orderNo: result.orderNo });
    return result;
  }

  @Delete(':id')
  @RequirePermissions('purchase:order:delete')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.ordersService.remove(id);
    await this.logsService.record('采购订单', '删除采购订单', { id });
    return { ok: true };
  }

  @Put(':id/confirm')
  @RequirePermissions('purchase:order:confirm')
  async confirm(@Param('id', ParseIntPipe) id: number) {
    await this.ordersService.confirm(id);
    await this.logsService.record('采购订单', '确认采购订单', { id });
    return { ok: true };
  }

  @Put(':id/cancel')
  @RequirePermissions('purchase:order:cancel')
  async cancel(@Param('id', ParseIntPipe) id: number) {
    await this.ordersService.cancel(id);
    await this.logsService.record('采购订单', '取消采购订单', { id });
    return { ok: true };
  }

  @Put(':id/warehouse')
  @RequirePermissions('purchase:order:inbound')
  async warehouse(@Param('id', ParseIntPipe) id: number) {
    const result = await this.ordersService.warehouse(id);
    await this.logsService.record('采购订单', '采购入库', result);
    return result;
  }
}
