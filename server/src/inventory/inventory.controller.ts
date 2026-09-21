import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MaxLength } from 'class-validator';
import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { Body } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryCurrentQueryDto, InventoryRecordQueryDto } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { LogsService } from '../logs/logs.service';

class AdjustDto {
  @Type(() => Number)
  @IsInt()
  productId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  delta: number;

  /**
   * 备注必须限长：inventory_record.remark 是 varchar(255)，
   * 超长会在「库存已经改完、写流水时」才报 1406 Data too long，
   * 整个事务回滚 → 该接口带长备注就永久 500。
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
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
  current(@Query() query: InventoryCurrentQueryDto) {
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
    query: InventoryRecordQueryDto,
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
