import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { ProductQueryDto } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { LogsService } from '../logs/logs.service';

@ApiTags('商品')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly logsService: LogsService,
  ) {}

  @Get()
  @RequirePermissions('product:view')
  list(@Query() query: ProductQueryDto) {
    return this.productsService.list({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      categoryId: query.categoryId ? Number(query.categoryId) : undefined,
      status: query.status != null ? Number(query.status) : undefined,
    });
  }

  /**
   * 下拉选项。必须显式声明权限：
   * PermissionsGuard 对**没有** @RequirePermissions 的接口直接放行（permissions.guard.ts:26），
   * 所以漏写装饰器 = 任何登录用户都能拉全量数据。
   * products/options 还会回传 purchasePrice（采购成本价），泄漏面更大。
   */
  @Get('options')
  @RequirePermissions('product:view')
  options(@Query('keyword') keyword?: string) {
    return this.productsService.options(keyword);
  }

  @Post()
  @RequirePermissions('product:create')
  async create(@Body() dto: CreateProductDto) {
    const result = await this.productsService.create(dto);
    await this.logsService.record('商品', '新增商品', { code: dto.code, name: dto.name });
    return result;
  }

  @Put(':id')
  @RequirePermissions('product:update')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    await this.productsService.update(id, dto);
    await this.logsService.record('商品', '编辑商品', { id });
    return { ok: true };
  }

  @Delete(':id')
  @RequirePermissions('product:delete')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.productsService.remove(id);
    await this.logsService.record('商品', '删除商品', { id });
    return { ok: true };
  }
}
