import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InventoryEntity, InventoryRecordEntity } from '../entities/inventory.entity';
import { ProductEntity } from '../entities/product.entity';
import { BusinessException } from '../common/exceptions/business.exception';
import { TenantContext } from '../tenant/tenant-context';
import { todayYmd } from '../common/utils/no-generator';
import type {
  InventoryItem,
  InventoryRecordItem,
  InventoryRecordType,
  PageResult,
} from '@erp/shared';

export interface MovementOptions {
  companyId: number;
  productId: number;
  productName: string;
  delta: number; // 正=增加 负=减少
  type: InventoryRecordType;
  refType: string;
  refNo: string;
  operator?: string;
  remark?: string;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(InventoryEntity) private readonly inventoryRepo: Repository<InventoryEntity>,
    @InjectRepository(InventoryRecordEntity)
    private readonly recordRepo: Repository<InventoryRecordEntity>,
    @InjectRepository(ProductEntity) private readonly productRepo: Repository<ProductEntity>,
  ) {}

  /**
   * 库存变动（必须在调用方事务内执行）：
   * SELECT ... FOR UPDATE 锁行 → 校验非负 → 更新/插入 → 写流水。
   * 防并发超卖的核心方法。
   */
  async movement(
    manager: EntityManager,
    opts: MovementOptions,
  ): Promise<{ balanceAfter: number }> {
    const { companyId, productId, delta, type, refType, refNo, operator, remark } = opts;
    if (delta === 0) {
      const row = await manager.query(
        'SELECT quantity FROM inventory WHERE company_id = ? AND product_id = ?',
        [companyId, productId],
      );
      return { balanceAfter: Number(row[0]?.quantity ?? 0) };
    }

    const rows: Array<{ id: number; quantity: string | number }> = await manager.query(
      'SELECT id, quantity FROM inventory WHERE company_id = ? AND product_id = ? FOR UPDATE',
      [companyId, productId],
    );

    let balance: number;
    if (!rows.length) {
      if (delta < 0) {
        throw new BusinessException(`商品「${opts.productName}」库存不足（当前 0）`, 40020);
      }
      await manager.query(
        'INSERT INTO inventory (company_id, product_id, quantity, updated_at) VALUES (?, ?, ?, NOW())',
        [companyId, productId, delta],
      );
      balance = delta;
    } else {
      const current = Number(rows[0].quantity);
      balance = Math.round((current + delta) * 100) / 100;
      if (balance < 0) {
        throw new BusinessException(
          `商品「${opts.productName}」库存不足（当前 ${current}，需 ${-delta}）`,
          40020,
        );
      }
      await manager.query('UPDATE inventory SET quantity = ?, updated_at = NOW() WHERE id = ?', [
        balance,
        rows[0].id,
      ]);
    }

    await manager.query(
      `INSERT INTO inventory_record
        (company_id, product_id, product_name, type, quantity, balance_after, ref_type, ref_no, remark, operator, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        companyId,
        productId,
        opts.productName,
        type,
        delta,
        balance,
        refType,
        refNo,
        remark ?? null,
        operator ?? null,
      ],
    );
    return { balanceAfter: balance };
  }

  /** 实时库存（含预警标记） */
  async current(query: {
    page: number;
    pageSize: number;
    keyword?: string;
    lowOnly?: boolean;
  }): Promise<PageResult<InventoryItem>> {
    const { page, pageSize, keyword, lowOnly } = query;
    const companyId = TenantContext.companyId;

    const qb = this.inventoryRepo
      .createQueryBuilder('i')
      .innerJoin(ProductEntity, 'p', 'p.id = i.product_id AND p.company_id = i.company_id')
      .addSelect('p.code', 'product_code')
      .addSelect('p.name', 'product_name')
      .addSelect('p.spec', 'spec')
      .addSelect('p.unit', 'unit')
      .addSelect('p.safety_stock', 'safety_stock')
      .addSelect('p.sale_price', 'sale_price')
      .where('i.company_id = :cid', { cid: companyId });

    if (keyword) {
      qb.andWhere('(p.name LIKE :kw OR p.code LIKE :kw)', { kw: `%${keyword}%` });
    }
    if (lowOnly) {
      qb.andWhere('i.quantity < p.safety_stock');
    }

    const total = await qb.getCount();
    const rows = await qb
      .orderBy('p.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getRawMany<Record<string, string | number | null>>();

    const list: InventoryItem[] = rows.map((r) => {
      const quantity = Number(r.i_quantity ?? 0);
      const safetyStock = Number(r.safety_stock ?? 0);
      return {
        productId: Number(r.i_product_id),
        productCode: String(r.product_code ?? ''),
        productName: String(r.product_name ?? ''),
        spec: (r.spec as string) ?? undefined,
        unit: (r.unit as string) ?? undefined,
        quantity,
        safetyStock,
        salePrice: Number(r.sale_price ?? 0),
        isLow: quantity < safetyStock,
      };
    });
    return { list, total, page, pageSize };
  }

  /** 库存流水 */
  async records(query: {
    page: number;
    pageSize: number;
    keyword?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PageResult<InventoryRecordItem>> {
    const { page, pageSize, keyword, type, startDate, endDate } = query;
    const qb = this.recordRepo
      .createQueryBuilder('r')
      .where('r.company_id = :cid', { cid: TenantContext.companyId });

    if (keyword) qb.andWhere('(r.product_name LIKE :kw OR r.ref_no LIKE :kw)', { kw: `%${keyword}%` });
    if (type) qb.andWhere('r.type = :type', { type });
    if (startDate) qb.andWhere('r.created_at >= :startDate', { startDate: `${startDate} 00:00:00` });
    if (endDate) qb.andWhere('r.created_at <= :endDate', { endDate: `${endDate} 23:59:59` });

    const [rows, total] = await qb
      .orderBy('r.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      list: rows.map((r) => ({
        id: r.id,
        productId: r.productId,
        productName: r.productName,
        type: r.type,
        quantity: r.quantity,
        balanceAfter: r.balanceAfter,
        refType: r.refType,
        refNo: r.refNo,
        remark: r.remark ?? undefined,
        operator: r.operator ?? undefined,
        createdAt: r.createdAt.toISOString().slice(0, 19).replace('T', ' '),
      })),
      total,
      page,
      pageSize,
    };
  }

  /** 库存预警（低于安全库存） */
  async alerts(): Promise<InventoryItem[]> {
    const companyId = TenantContext.companyId;
    const rows = await this.inventoryRepo
      .createQueryBuilder('i')
      .innerJoin(ProductEntity, 'p', 'p.id = i.product_id AND p.company_id = i.company_id')
      .addSelect('p.code', 'product_code')
      .addSelect('p.name', 'product_name')
      .addSelect('p.spec', 'spec')
      .addSelect('p.unit', 'unit')
      .addSelect('p.safety_stock', 'safety_stock')
      .addSelect('p.sale_price', 'sale_price')
      .where('i.company_id = :cid', { cid: companyId })
      .andWhere('i.quantity < p.safety_stock')
      .orderBy('i.quantity', 'ASC')
      .limit(200)
      .getRawMany<Record<string, string | number | null>>();

    return rows.map((r) => ({
      productId: Number(r.i_product_id),
      productCode: String(r.product_code ?? ''),
      productName: String(r.product_name ?? ''),
      spec: (r.spec as string) ?? undefined,
      unit: (r.unit as string) ?? undefined,
      quantity: Number(r.i_quantity ?? 0),
      safetyStock: Number(r.safety_stock ?? 0),
      salePrice: Number(r.sale_price ?? 0),
      isLow: true,
    }));
  }

  /** 手工调整库存（盈亏） */
  async adjust(productId: number, delta: number, remark?: string): Promise<{ balanceAfter: number }> {
    const companyId = TenantContext.companyId;
    const product = await this.productRepo.findOne({ where: { id: productId, companyId } });
    if (!product) throw new BusinessException('商品不存在', 40403);

    return this.dataSource.transaction(async (manager) => {
      const result = await this.movement(manager, {
        companyId,
        productId,
        productName: product.name,
        delta,
        type: 'adjust',
        refType: 'INVENTORY_ADJUST',
        refNo: `ADJ${todayYmd()}`,
        operator: TenantContext.username,
        remark,
      });
      this.logger.log(`inventory adjust: product#${productId} delta=${delta}`);
      return result;
    });
  }

  /** 统计低库存商品数 */
  async lowStockCount(): Promise<number> {
    const companyId = TenantContext.companyId;
    const row = await this.inventoryRepo
      .createQueryBuilder('i')
      .innerJoin(ProductEntity, 'p', 'p.id = i.product_id AND p.company_id = i.company_id')
      .where('i.company_id = :cid', { cid: companyId })
      .andWhere('i.quantity < p.safety_stock')
      .select('COUNT(*)', 'cnt')
      .getRawOne<{ cnt: string | number }>();
    return Number(row?.cnt ?? 0);
  }
}
