import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Body } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { LogsService } from '../logs/logs.service';

class AdjustDto {
  @Type(() => Number)
  @IsInt()
  productId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  delta: number;

  @IsOptional()
  @IsString()
  remark?: string;
}

@ApiTags('库存')
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly logsService: LogsService,
  ) {}

  @Get()
  @RequirePermissions('inventory:current:view')
  current(@Query() query: PaginationDto & { lowOnly?: string }) {
    return this.inventoryService.current({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      lowOnly: query.lowOnly === 'true',
    });
  }

  @Get('records')
  @RequirePermissions('inventory:record:view')
  records(
    @Query()
    query: PaginationDto & { type?: string; startDate?: string; endDate?: string },
  ) {
    return this.inventoryService.records({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      type: query.type,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('alerts')
  @RequirePermissions('inventory:alert:view')
  alerts() {
    return this.inventoryService.alerts();
  }

  @Post('adjust')
  @RequirePermissions('inventory:adjust')
  async adjust(@Body() dto: AdjustDto) {
    const result = await this.inventoryService.adjust(dto.productId, dto.delta, dto.remark);
    await this.logsService.record('库存', '库存调整', dto);
    return result;
  }
}
