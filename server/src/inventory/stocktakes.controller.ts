import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StocktakesService } from './stocktakes.service';
import { CreateStocktakeDto } from './dto/stocktake.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { LogsService } from '../logs/logs.service';

@ApiTags('库存盘点')
@Controller('stocktakes')
export class StocktakesController {
  constructor(
    private readonly stocktakesService: StocktakesService,
    private readonly logsService: LogsService,
  ) {}

  @Get()
  @RequirePermissions('inventory:stocktake:view')
  list(@Query() query: PaginationDto & { status?: string }) {
    return this.stocktakesService.list({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      status: query.status as never,
    });
  }

  @Get(':id')
  @RequirePermissions('inventory:stocktake:view')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.stocktakesService.detail(id);
  }

  @Post()
  @RequirePermissions('inventory:stocktake:create')
  async create(@Body() dto: CreateStocktakeDto) {
    const result = await this.stocktakesService.create(dto);
    await this.logsService.record('库存盘点', '新建盘点单', { stocktakeNo: result.stocktakeNo });
    return result;
  }

  @Put(':id/confirm')
  @RequirePermissions('inventory:stocktake:confirm')
  async confirm(@Param('id', ParseIntPipe) id: number) {
    await this.stocktakesService.confirm(id);
    await this.logsService.record('库存盘点', '确认盘点单', { id });
    return { ok: true };
  }
}
