import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DashboardService } from './dashboard.service';

class TrendQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}

class TopQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

@ApiTags('数据看板')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  summary() {
    return this.dashboardService.summary();
  }

  @Get('sale-trend')
  saleTrend(@Query() query: TrendQuery) {
    return this.dashboardService.saleTrend(query.days ?? 30);
  }

  @Get('top-products')
  topProducts(@Query() query: TopQuery) {
    return this.dashboardService.topProducts(query.limit ?? 10);
  }

  @Get('recent-orders')
  recentOrders() {
    return this.dashboardService.recentOrders();
  }
}
