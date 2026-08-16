import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PurchaseInboundsService } from './purchase-inbounds.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

@ApiTags('采购入库单')
@Controller('purchase-inbounds')
export class PurchaseInboundsController {
  constructor(private readonly inboundsService: PurchaseInboundsService) {}

  @Get()
  @RequirePermissions('purchase:inbound:view')
  list(@Query() query: PaginationDto & { startDate?: string; endDate?: string }) {
    return this.inboundsService.list({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get(':id')
  @RequirePermissions('purchase:inbound:view')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.inboundsService.detail(id);
  }
}
