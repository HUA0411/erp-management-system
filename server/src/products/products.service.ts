import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductEntity } from '../entities/product.entity';
import { CategoryEntity } from '../entities/category.entity';
import { SupplierEntity } from '../entities/partner.entity';
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
    @InjectRepository(SupplierEntity) private readonly supplierRepo: Repository<SupplierEntity>,
  ) {}

  async list(query: ProductQuery): Promise<PageResult<ProductItem>> {
    const { page, pageSize, keyword, categoryId, status } = query;
    const companyId = TenantContext.companyId;

    /**
     * 两个 leftJoin 都必须带 company_id 条件。
     *
     * 只写 `c.id = p.category_id` 时，如果 p.supplier_id 指向的是**别的租户**的供应商
     * （历史脏数据、或有人绕过校验写入了跨租户 id），join 照样命中，
     * 于是把对方租户的供应商名称读回来显示 —— 多租户系统的数据泄漏。
     * 带上 `AND s.company_id = :cid` 后，跨租户引用 join 不中，字段为空。
     */
    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoin(CategoryEntity, 'c', 'c.id = p.category_id AND c.company_id = :cid', { cid: companyId })
      .leftJoin(SupplierEntity, 's', 's.id = p.supplier_id AND s.company_id = :cid', { cid: companyId })
      .addSelect('c.name', 'category_name')
      .addSelect('s.name', 'supplier_name')
      .where('p.company_id = :cid', { cid: companyId });
    if (keyword) {
      qb.andWhere('(p.name LIKE :kw OR p.code LIKE :kw OR p.spec LIKE :kw)', { kw: `%${keyword}%` });
    }
    if (categoryId) qb.andWhere('p.category_id = :categoryId', { categoryId });
    if (status != null) qb.andWhere('p.status = :status', { status });

    /**
     * 分页必须用 offset/limit，**不能用 skip/take**。
     *
     * TypeORM 的 skip/take 是「实体分页」：带 join 时它会改写成
     * 「先 SELECT DISTINCT 主键 … LIMIT/OFFSET，再按主键查实体」两步，
     * 而 `getRawMany()` 直接走单条 SQL，跳过了那套机制 —— take/skip 被**静默丢弃**。
     * 实测：/products?page=1|2|3&pageSize=2 三次都返回全部 12 行、首行 id 都是 12，
     * 也就是说列表的分页器是假的，翻页看到的永远是同一批数据（total 却是对的）。
     * offset/limit 是直接拼进 SQL 的 LIMIT/OFFSET，不受 join 影响。
     */
    const total = await qb.getCount();
    const rows = await qb
      .orderBy('p.id', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize)
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
      supplierId: r.p_supplier_id == null ? undefined : Number(r.p_supplier_id),
      supplierName: (r.supplier_name as string) ?? undefined,
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
      .leftJoin(SupplierEntity, 's', 's.id = p.supplier_id AND s.company_id = :cid', { cid: companyId })
      .addSelect('COALESCE(i.quantity, 0)', 'quantity')
      .addSelect('s.name', 'supplier_name')
      .where('p.company_id = :cid', { cid: companyId })
      .andWhere('p.status = 1');
    if (keyword) qb.andWhere('(p.name LIKE :kw OR p.code LIKE :kw)', { kw: `%${keyword}%` });

    /**
     * 分页必须用 offset/limit，**不能用 skip/take**。
     *
     * TypeORM 的 skip/take 是「实体分页」：带 join 时它会改写成
     * 「先 SELECT DISTINCT 主键 … LIMIT/OFFSET，再按主键查实体」两步，
     * 而 `getRawMany()` 直接走单条 SQL，跳过了那套机制 —— take/skip 被**静默丢弃**。
     * 实测：/products?page=1|2|3&pageSize=2 三次都返回全部 12 行、首行 id 都是 12，
     * 也就是说列表的分页器是假的，翻页看到的永远是同一批数据（total 却是对的）。
     * offset/limit 是直接拼进 SQL 的 LIMIT/OFFSET，不受 join 影响。
     */
    const rows = await qb
      .orderBy('p.id', 'DESC')
      .limit(50)
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
      supplierId: r.p_supplier_id == null ? undefined : Number(r.p_supplier_id),
      supplierName: (r.supplier_name as string) ?? undefined,
      quantity: Number(r.quantity ?? 0),
    }));
  }

  /**
   * 校验外键引用属于当前租户。
   *
   * 为什么必须查一次：categoryId / supplierId 是客户端直接传的整数，
   * 不校验归属的话，A 租户可以填 B 租户的 supplierId 并**通过 list 接口读回 B 的供应商名称**
   * （配合 join 缺 company_id 就是完整的数据泄漏链）。即使 join 修好了，
   * 允许写入跨租户 id 仍然是脏数据源头，会让后续所有关联查询出现「查不到名字的空引用」。
   */
  private async assertRefs(data: Partial<ProductEntity>, companyId: number): Promise<void> {
    if (data.supplierId != null) {
      const supplier = await this.supplierRepo.findOne({
        where: { id: data.supplierId, companyId },
      });
      if (!supplier) throw new BusinessException('供应商不存在或不属于当前公司', 40014);
    }
    if (data.categoryId != null) {
      const category = await this.categoryRepo.findOne({
        where: { id: data.categoryId, companyId },
      });
      if (!category) throw new BusinessException('分类不存在或不属于当前公司', 40015);
    }
  }

  async create(data: Partial<ProductEntity>): Promise<ProductEntity> {
    const companyId = TenantContext.companyId;
    const exists = await this.productRepo.findOne({ where: { companyId, code: data.code } });
    if (exists) throw new BusinessException('商品编码已存在', 40012);
    await this.assertRefs(data, companyId);
    const entity = await this.productRepo.save(
      this.productRepo.create({ ...data, companyId, safetyStock: data.safetyStock ?? 0 }),
    );
    this.logger.log(`product created: ${entity.code}`);
    return entity;
  }

  async update(id: number, data: Partial<ProductEntity>): Promise<void> {
    await this.mustFind(id);
    // 只校验本次真的要改的字段，没传的字段保持原样不动
    await this.assertRefs(data, TenantContext.companyId);
    // update 的 where 必须带 companyId：id 来自路径参数，是客户端可控的
    await this.productRepo.update({ id, companyId: TenantContext.companyId }, data);
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
