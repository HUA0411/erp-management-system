import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductEntity } from '../entities/product.entity';
import { CategoryEntity } from '../entities/category.entity';
import { InventoryEntity } from '../entities/inventory.entity';
import { BusinessException } from '../common/exceptions/business.exception';
import { TenantContext } from '../tenant/tenant-context';
import type { PageResult, ProductItem } from '@erp/shared';

export interface ProductQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  categoryId?: number;
  status?: number;
}

export interface ProductOption {
  id: number;
  code: string;
  name: string;
  spec?: string;
  unit?: string;
  purchasePrice: number;
  salePrice: number;
  safetyStock: number;
  quantity: number;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(ProductEntity) private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(CategoryEntity) private readonly categoryRepo: Repository<CategoryEntity>,
    @InjectRepository(InventoryEntity) private readonly inventoryRepo: Repository<InventoryEntity>,
  ) {}

  async list(query: ProductQuery): Promise<PageResult<ProductItem>> {
    const { page, pageSize, keyword, categoryId, status } = query;
    const companyId = TenantContext.companyId;

    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoin(CategoryEntity, 'c', 'c.id = p.category_id')
      .addSelect('c.name', 'category_name')
      .where('p.company_id = :cid', { cid: companyId });
    if (keyword) {
      qb.andWhere('(p.name LIKE :kw OR p.code LIKE :kw OR p.spec LIKE :kw)', { kw: `%${keyword}%` });
    }
    if (categoryId) qb.andWhere('p.category_id = :categoryId', { categoryId });
    if (status != null) qb.andWhere('p.status = :status', { status });

    const total = await qb.getCount();
    const rows = await qb
      .orderBy('p.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getRawMany<Record<string, string | number | null>>();

    const products: ProductItem[] = rows.map((r) => ({
      id: Number(r.p_id),
      categoryId: Number(r.p_category_id ?? 0),
      categoryName: (r.category_name as string) ?? undefined,
      code: String(r.p_code ?? ''),
      name: String(r.p_name ?? ''),
      spec: (r.p_spec as string) ?? undefined,
      unit: (r.p_unit as string) ?? undefined,
      purchasePrice: Number(r.p_purchase_price ?? 0),
      salePrice: Number(r.p_sale_price ?? 0),
      safetyStock: Number(r.p_safety_stock ?? 0),
      status: Number(r.p_status ?? 1),
      remark: (r.p_remark as string) ?? undefined,
    }));
    return { list: products, total, page, pageSize };
  }

  /** 下拉选项（含实时库存） */
  async options(keyword?: string): Promise<ProductOption[]> {
    const companyId = TenantContext.companyId;
    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoin(InventoryEntity, 'i', 'i.product_id = p.id AND i.company_id = :cid', { cid: companyId })
      .addSelect('COALESCE(i.quantity, 0)', 'quantity')
      .where('p.company_id = :cid', { cid: companyId })
      .andWhere('p.status = 1');
    if (keyword) qb.andWhere('(p.name LIKE :kw OR p.code LIKE :kw)', { kw: `%${keyword}%` });

    const rows = await qb
      .orderBy('p.id', 'DESC')
      .take(50)
      .getRawMany<Record<string, string | number | null>>();

    return rows.map((r) => ({
      id: Number(r.p_id),
      code: String(r.p_code ?? ''),
      name: String(r.p_name ?? ''),
      spec: (r.p_spec as string) ?? undefined,
      unit: (r.p_unit as string) ?? undefined,
      purchasePrice: Number(r.p_purchase_price ?? 0),
      salePrice: Number(r.p_sale_price ?? 0),
      safetyStock: Number(r.p_safety_stock ?? 0),
      quantity: Number(r.quantity ?? 0),
    }));
  }

  async create(data: Partial<ProductEntity>): Promise<ProductEntity> {
    const companyId = TenantContext.companyId;
    const exists = await this.productRepo.findOne({ where: { companyId, code: data.code } });
    if (exists) throw new BusinessException('商品编码已存在', 40012);
    const entity = await this.productRepo.save(
      this.productRepo.create({ ...data, companyId, safetyStock: data.safetyStock ?? 0 }),
    );
    this.logger.log(`product created: ${entity.code}`);
    return entity;
  }

  async update(id: number, data: Partial<ProductEntity>): Promise<void> {
    await this.mustFind(id);
    await this.productRepo.update({ id }, data);
  }

  async remove(id: number): Promise<void> {
    await this.mustFind(id);
    const inventory = await this.inventoryRepo.findOne({
      where: { companyId: TenantContext.companyId, productId: id },
    });
    if (inventory && inventory.quantity > 0) {
      throw new BusinessException('商品仍有库存，无法删除，请先清零或停用', 40013);
    }
    await this.productRepo.update({ id }, { status: 0 });
    this.logger.log(`product #${id} disabled`);
  }

  async mustFind(id: number): Promise<ProductEntity> {
    const entity = await this.productRepo.findOne({
      where: { id, companyId: TenantContext.companyId },
    });
    if (!entity) throw new BusinessException('商品不存在', 40403);
    return entity;
  }
}
