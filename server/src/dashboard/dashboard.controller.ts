import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DashboardService } from './dashboard.service';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

class TrendQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(730)
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

/**
 * 数据看板。
 *
 * 四个接口原先都没有 @RequirePermissions —— 权限树里明明有 `dashboard` 这个码、
 * 角色管理页也能勾选，但接口层从不校验它。后果：管理员在「角色管理」里
 * 取消某个角色的「数据看板」勾选后，菜单会消失，**但 API 依然照常返回全公司营收**。
 * 也就是说这个权限码是装饰性的，撤销操作静默失效。
 *
 * 这里补上校验，让声明的权限模型真正生效（当前 5 个内置角色都持有该码，行为不变）。
 */
@ApiTags('数据看板')
@Controller('dashboard')
@RequirePermissions('dashboard')
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
