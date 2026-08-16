import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SaleOutboundsService } from './sale-outbounds.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

@ApiTags('销售出库单')
@Controller('sale-outbounds')
export class SaleOutboundsController {
  constructor(private readonly outboundsService: SaleOutboundsService) {}

  @Get()
  @RequirePermissions('sale:outbound:view')
  list(@Query() query: PaginationDto & { startDate?: string; endDate?: string }) {
    return this.outboundsService.list({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get(':id')
  @RequirePermissions('sale:outbound:view')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.outboundsService.detail(id);
  }
}
