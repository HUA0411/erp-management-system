import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { StocktakeEntity, StocktakeItemEntity } from '../entities/stocktake.entity';
import { InventoryEntity } from '../entities/inventory.entity';
import { ProductEntity } from '../entities/product.entity';
import { InventoryService } from './inventory.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { TenantContext } from '../tenant/tenant-context';
import { formatDateTime,  nextNo, round2  } from '../common/utils/no-generator';
import type { PageResult, StocktakeStatus } from '@erp/shared';

export interface StocktakeQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: StocktakeStatus;
}

export interface StocktakeDetail {
  id: number;
  stocktakeNo: string;
  status: StocktakeStatus;
  remark?: string;
  createdAt: string;
  items: Array<{
    productId: number;
    productName: string;
    bookQty: number;
    actualQty: number;
    diffQty: number;
  }>;
}

@Injectable()
export class StocktakesService {
  private readonly logger = new Logger(StocktakesService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(StocktakeEntity) private readonly stocktakeRepo: Repository<StocktakeEntity>,
    @InjectRepository(StocktakeItemEntity) private readonly itemRepo: Repository<StocktakeItemEntity>,
    @InjectRepository(InventoryEntity) private readonly inventoryRepo: Repository<InventoryEntity>,
    @InjectRepository(ProductEntity) private readonly productRepo: Repository<ProductEntity>,
    private readonly inventoryService: InventoryService,
  ) {}

  async list(query: StocktakeQuery): Promise<PageResult<StocktakeDetail>> {
    const { page, pageSize, keyword, status } = query;
    const qb = this.stocktakeRepo
      .createQueryBuilder('s')
      .where('s.company_id = :cid', { cid: TenantContext.companyId });
    if (keyword) qb.andWhere('s.stocktake_no LIKE :kw', { kw: `%${keyword}%` });
    if (status) qb.andWhere('s.status = :status', { status });

    const [rows, total] = await qb
      .orderBy('s.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { list: rows.map((r) => this.toDetail(r)), total, page, pageSize };
  }

  async detail(id: number): Promise<StocktakeDetail> {
    const stocktake = await this.stocktakeRepo.findOne({
      where: { id, companyId: TenantContext.companyId },
    });
    if (!stocktake) throw new BusinessException('盘点单不存在', 40410);
    const items = await this.itemRepo.find({ where: { stocktakeId: id } });
    return {
      ...this.toDetail(stocktake),
      items: items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        bookQty: i.bookQty,
        actualQty: i.actualQty,
        diffQty: i.diffQty,
      })),
    };
  }

  async create(data: { remark?: string; items: Array<{ productId: number; actualQty: number }> }): Promise<StocktakeDetail> {
    const companyId = TenantContext.companyId;
    const productIds = [...new Set(data.items.map((i) => i.productId))];
    const products = await this.productRepo.find({
      where: { id: In(productIds), companyId, status: 1 },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const inventories = await this.inventoryRepo.find({
      where: { companyId, productId: In(productIds) },
    });
    const invMap = new Map(inventories.map((i) => [i.productId, Number(i.quantity)]));

    const lines = data.items.map((i) => {
      const product = productMap.get(i.productId);
      if (!product) throw new BusinessException(`商品 ID ${i.productId} 不存在或已停用`, 40019);
      const bookQty = invMap.get(i.productId) ?? 0;
      return {
        productId: product.id,
        productName: product.name,
        bookQty,
        actualQty: round2(i.actualQty),
        diffQty: round2(i.actualQty - bookQty),
      };
    });

    const stocktake = await this.dataSource.transaction(async (manager) => {
      const stocktakeNo = await nextNo(manager, 'stocktake', 'stocktake_no', companyId, 'ST');
      const id = await manager
        .getRepository(StocktakeEntity)
        .insert({
          companyId,
          stocktakeNo,
          status: 'draft',
          remark: data.remark,
          createdBy: TenantContext.userId,
        })
        .then((r) => r.identifiers[0].id as number);
      await manager.getRepository(StocktakeItemEntity).insert(
        lines.map((l) => ({ stocktakeId: id, ...l })),
      );
      return id;
    });
    this.logger.log(`stocktake created: #${stocktake}`);
    return this.detail(stocktake);
  }

  /** 盘点确认：按差异调整库存（差异=实盘-账面），事务内逐行 FOR UPDATE */
  async confirm(id: number): Promise<void> {
    const companyId = TenantContext.companyId;
    const stocktake = await this.stocktakeRepo.findOne({ where: { id, companyId } });
    if (!stocktake) throw new BusinessException('盘点单不存在', 40410);
    if (stocktake.status !== 'draft') throw new BusinessException('仅草稿状态的盘点单可确认', 40036);

    const items = await this.itemRepo.find({ where: { stocktakeId: id } });
    await this.dataSource.transaction(async (manager) => {
      for (const item of items) {
        if (item.diffQty === 0) continue;
        await this.inventoryService.movement(manager, {
          companyId,
          productId: item.productId,
          productName: item.productName,
          delta: item.diffQty,
          type: 'stocktake',
          refType: 'STOCKTAKE',
          refNo: stocktake.stocktakeNo,
          operator: TenantContext.username,
          remark: `盘点差异调整`,
        });
      }
      await manager.getRepository(StocktakeEntity).update({ id }, { status: 'confirmed' });
    });
    this.logger.log(`stocktake confirmed: ${stocktake.stocktakeNo}`);
  }

  private toDetail(r: StocktakeEntity): StocktakeDetail {
    return {
      id: r.id,
      stocktakeNo: r.stocktakeNo,
      status: r.status,
      remark: r.remark ?? undefined,
      createdAt: formatDateTime(r.createdAt),
      items: [],
    };
  }
}
