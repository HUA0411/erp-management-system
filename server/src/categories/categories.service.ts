import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryEntity } from '../entities/category.entity';
import { ProductEntity } from '../entities/product.entity';
import { BusinessException } from '../common/exceptions/business.exception';
import { TenantContext } from '../tenant/tenant-context';

export interface CategoryNode {
  id: number;
  parentId: number;
  name: string;
  sort: number;
  status: number;
  children?: CategoryNode[];
}

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectRepository(CategoryEntity) private readonly categoryRepo: Repository<CategoryEntity>,
    @InjectRepository(ProductEntity) private readonly productRepo: Repository<ProductEntity>,
  ) {}

  async tree(): Promise<CategoryNode[]> {
    const rows = await this.categoryRepo.find({
      where: { companyId: TenantContext.companyId },
      order: { sort: 'ASC', id: 'ASC' },
    });
    const map = new Map<number, CategoryNode>();
    const roots: CategoryNode[] = [];
    for (const r of rows) map.set(r.id, { ...r, children: [] });
    for (const node of map.values()) {
      if (node.parentId && map.has(node.parentId)) map.get(node.parentId)!.children!.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async create(data: { name: string; parentId?: number; sort?: number }): Promise<CategoryEntity> {
    const entity = await this.categoryRepo.save(
      this.categoryRepo.create({
        companyId: TenantContext.companyId,
        name: data.name,
        parentId: data.parentId ?? 0,
        sort: data.sort ?? 0,
      }),
    );
    this.logger.log(`category created: ${data.name}`);
    return entity;
  }

  async update(id: number, data: { name?: string; sort?: number; status?: number }): Promise<void> {
    const entity = await this.mustFind(id);
    await this.categoryRepo.update({ id }, {
      name: data.name ?? entity.name,
      sort: data.sort ?? entity.sort,
      status: data.status ?? entity.status,
    });
  }

  async remove(id: number): Promise<void> {
    await this.mustFind(id);
    const child = await this.categoryRepo.count({ where: { companyId: TenantContext.companyId, parentId: id } });
    if (child > 0) throw new BusinessException('存在子分类，无法删除', 40010);
    const used = await this.productRepo.count({
      where: { companyId: TenantContext.companyId, categoryId: id, status: 1 },
    });
    if (used > 0) throw new BusinessException(`该分类下还有 ${used} 个在用商品，无法删除`, 40011);
    await this.categoryRepo.delete({ id });
  }

  private async mustFind(id: number): Promise<CategoryEntity> {
    const entity = await this.categoryRepo.findOne({
      where: { id, companyId: TenantContext.companyId },
    });
    if (!entity) throw new BusinessException('分类不存在', 40402);
    return entity;
  }
}
