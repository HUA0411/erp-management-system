import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { LogsService } from '../logs/logs.service';

@ApiTags('商品分类')
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly logsService: LogsService,
  ) {}

  @Get('tree')
  tree() {
    return this.categoriesService.tree();
  }

  @Post()
  @RequirePermissions('product:create')
  async create(@Body() dto: CreateCategoryDto) {
    const result = await this.categoriesService.create(dto);
    await this.logsService.record('商品分类', '新增分类', dto);
    return result;
  }

  @Put(':id')
  @RequirePermissions('product:update')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    await this.categoriesService.update(id, dto);
    await this.logsService.record('商品分类', '编辑分类', { id, ...dto });
    return { ok: true };
  }

  @Delete(':id')
  @RequirePermissions('product:delete')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.categoriesService.remove(id);
    await this.logsService.record('商品分类', '删除分类', { id });
    return { ok: true };
  }
}
