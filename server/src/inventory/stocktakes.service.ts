import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { StocktakeEntity, StocktakeItemEntity } from '../entities/stocktake.entity';
import { InventoryEntity } from '../entities/inventory.entity';
import { ProductEntity } from '../entities/product.entity';
import { InventoryService } from './inventory.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { TenantContext } from '../tenant/tenant-context';
import { formatDateTime, nextNo, round2, sleep } from '../common/utils/no-generator';
import { claimStatus } from '../common/utils/claim-status';
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

  async create(data: {
    remark?: string;
    items: Array<{ productId: number; actualQty: number }>;
  }): Promise<StocktakeDetail> {
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
      await manager.getRepository(StocktakeItemEntity).insert(lines.map((l) => ({ stocktakeId: id, ...l })));
      return id;
    });
    this.logger.log(`stocktake created: #${stocktake}`);
    return this.detail(stocktake);
  }

  /**
   * 盘点确认：按差异调整库存（差异=实盘-账面），事务内逐行 FOR UPDATE。
   *
   * 状态抢占必须在调整库存**之前**：盘点差异是「绝对量」调整，
   * 重复执行会把同样的差异再加一遍，库存直接错。两个并发确认请求都会通过
   * 事务外的 `status !== 'draft'` 检查，所以必须靠条件 UPDATE 抢夺。
   */
  async confirm(id: number): Promise<void> {
    const companyId = TenantContext.companyId;
    const stocktake = await this.stocktakeRepo.findOne({ where: { id, companyId } });
    if (!stocktake) throw new BusinessException('盘点单不存在', 40410);
    if (stocktake.status !== 'draft') throw new BusinessException('仅草稿状态的盘点单可确认', 40036);

    const items = await this.itemRepo.find({ where: { stocktakeId: id } });

    await this.withRetry(async (manager) => {
      const claimed = await claimStatus(manager, StocktakeEntity, { id, companyId }, 'draft', 'confirmed');
      if (!claimed) throw new BusinessException('该盘点单已被确认', 40042);

      /**
       * 按 productId 排序加锁，避免与其它订单的加锁顺序相反造成死锁（1213）。
       */
      const lockedItems = [...items].sort((a, b) => a.productId - b.productId);

      for (const item of lockedItems) {
        /**
         * 按「实盘数」而不是建单时的 diffQty 来调整。
         *
         * `diffQty` 是建单那一刻算出来的（实盘 - 当时账面）。从建单到确认之间
         * 只要发生过出库/入库，那个 diff 就过期了，直接把它加上去会把盘点结论冲淡：
         *   建单时账面 10、实盘 15 → diff +5；期间出库 3，账面变 7；
         *   确认时 +5 → 12，而实际数了 15 件 —— 盘完还是错的。
         *
         * 正确做法是在确认时**锁住库存行读当前账面**，再算 实盘 - 当前账面。
         * 这样无论中间发生了什么，确认后库存一定等于实盘数（盘点的本意）。
         */
        const rows: Array<{ quantity: string | number }> = await manager.query(
          'SELECT quantity FROM inventory WHERE company_id = ? AND product_id = ? FOR UPDATE',
          [companyId, item.productId],
        );
        const currentBook = Number(rows[0]?.quantity ?? 0);
        const delta = round2(item.actualQty - currentBook);
        if (delta === 0) continue;

        await this.inventoryService.movement(manager, {
          companyId,
          productId: item.productId,
          productName: item.productName,
          delta,
          type: 'stocktake',
          refType: 'STOCKTAKE',
          refNo: stocktake.stocktakeNo,
          operator: TenantContext.username,
          remark: `盘点调整：账面 ${currentBook} → 实盘 ${item.actualQty}`,
        });
      }
    });
    this.logger.log(`stocktake confirmed: ${stocktake.stocktakeNo}`);
  }

  /**
   * 事务重试：1062 唯一键冲突 / 1213 死锁 / 1205 锁等待超时 都可以直接重试。
   * 盘点原来用裸 `dataSource.transaction`，并发下撞到这几个错误直接 500，
   * 而盘点确认是全程持有库存行锁的长事务，恰恰最容易撞上。
   */
  private async withRetry<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    const MAX_ATTEMPTS = 4;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await this.dataSource.transaction(fn);
      } catch (err) {
        const errno = (err as { errno?: number })?.errno;
        const retryable = errno === 1062 || errno === 1213 || errno === 1205;
        if (retryable && attempt < MAX_ATTEMPTS - 1) {
          await sleep(15 + Math.floor(Math.random() * 45) * (attempt + 1));
          continue;
        }
        if (retryable) throw new BusinessException('当前操作较为频繁，请稍后重试', 40039);
        throw err;
      }
    }
    throw new BusinessException('当前操作较为频繁，请稍后重试', 40039);
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
