import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { PurchaseOrderEntity, PurchaseOrderItemEntity } from '../entities/purchase.entity';
import { PurchaseInboundEntity, PurchaseInboundItemEntity } from '../entities/inbound.entity';
import { SupplierEntity } from '../entities/partner.entity';
import { ProductEntity } from '../entities/product.entity';
import { InventoryService } from '../inventory/inventory.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { TenantContext } from '../tenant/tenant-context';
import { formatDateTime, formatDate, nextNo, round2, sleep, todayLocal } from '../common/utils/no-generator';
import { claimStatus } from '../common/utils/claim-status';
import type { PageResult, PurchaseOrderItem } from '@erp/shared';

export interface OrderLineInput {
  productId: number;
  quantity: number;
  price: number;
}

export interface PurchaseOrderQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class PurchaseOrdersService {
  private readonly logger = new Logger(PurchaseOrdersService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(PurchaseOrderEntity)
    private readonly orderRepo: Repository<PurchaseOrderEntity>,
    @InjectRepository(PurchaseOrderItemEntity)
    private readonly itemRepo: Repository<PurchaseOrderItemEntity>,
    @InjectRepository(SupplierEntity) private readonly supplierRepo: Repository<SupplierEntity>,
    @InjectRepository(ProductEntity) private readonly productRepo: Repository<ProductEntity>,
    private readonly inventoryService: InventoryService,
  ) {}

  async list(query: PurchaseOrderQuery): Promise<PageResult<PurchaseOrderItem>> {
    const { page, pageSize, keyword, status, startDate, endDate } = query;
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .where('o.company_id = :cid', { cid: TenantContext.companyId });
    if (keyword) {
      qb.andWhere('(o.order_no LIKE :kw OR o.supplier_name LIKE :kw)', { kw: `%${keyword}%` });
    }
    if (status) qb.andWhere('o.status = :status', { status });
    if (startDate) qb.andWhere('o.order_date >= :startDate', { startDate });
    if (endDate) qb.andWhere('o.order_date <= :endDate', { endDate });

    const [rows, total] = await qb
      .orderBy('o.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      list: rows.map((o) => this.toItem(o)),
      total,
      page,
      pageSize,
    };
  }

  async detail(id: number): Promise<PurchaseOrderItem> {
    const order = await this.mustFind(id);
    const items = await this.itemRepo.find({ where: { orderId: id } });
    return {
      ...this.toItem(order),
      items: items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        spec: i.spec ?? undefined,
        unit: i.unit ?? undefined,
        quantity: i.quantity,
        price: i.price,
        amount: i.amount,
      })),
    };
  }

  async create(dto: {
    supplierId: number;
    orderDate: string;
    remark?: string;
    items: OrderLineInput[];
  }): Promise<PurchaseOrderItem> {
    const companyId = TenantContext.companyId;
    const supplier = await this.supplierRepo.findOne({
      where: { id: dto.supplierId, companyId, status: 1 },
    });
    if (!supplier) throw new BusinessException('供应商不存在或已停用', 40018);

    const prepared = await this.prepareItems(dto.items);
    const total = round2(prepared.lines.reduce((s, l) => s + l.amount, 0));

    const orderId = await this.withNoRetry(async (manager) => {
      const orderNo = await nextNo(manager, 'purchase_order', 'order_no', companyId, 'PO');
      const id = await manager
        .getRepository(PurchaseOrderEntity)
        .insert({
          companyId,
          orderNo,
          supplierId: supplier.id,
          supplierName: supplier.name,
          orderDate: dto.orderDate,
          totalAmount: total,
          paidAmount: 0,
          status: 'draft',
          remark: dto.remark,
          createdBy: TenantContext.userId,
        })
        .then((r) => r.identifiers[0].id as number);

      await manager.getRepository(PurchaseOrderItemEntity).insert(
        prepared.lines.map((l) => ({
          orderId: id,
          productId: l.productId,
          productName: l.productName,
          spec: l.spec,
          unit: l.unit,
          quantity: l.quantity,
          price: l.price,
          amount: l.amount,
        })),
      );
      return id;
    });
    const order = await this.detail(orderId);
    this.logger.log(`purchase order created: ${order.orderNo}`);
    return order;
  }

  async update(
    id: number,
    dto: { supplierId?: number; orderDate?: string; remark?: string; items?: OrderLineInput[] },
  ): Promise<PurchaseOrderItem> {
    const companyId = TenantContext.companyId;
    const order = await this.mustFind(id);
    if (order.status !== 'draft') throw new BusinessException('仅草稿状态的订单可编辑', 40021);

    const supplier = dto.supplierId
      ? await this.supplierRepo.findOne({ where: { id: dto.supplierId, companyId, status: 1 } })
      : undefined;
    if (dto.supplierId && !supplier) throw new BusinessException('供应商不存在或已停用', 40018);

    let lines:
      | {
          productId: number;
          productName: string;
          spec?: string;
          unit?: string;
          quantity: number;
          price: number;
          amount: number;
        }[]
      | undefined;
    let total = order.totalAmount;
    if (dto.items) {
      const prepared = await this.prepareItems(dto.items);
      lines = prepared.lines;
      total = round2(prepared.lines.reduce((s, l) => s + l.amount, 0));
    }

    await this.withNoRetry(async (manager) => {
      await manager.getRepository(PurchaseOrderEntity).update(
        { id },
        {
          supplierId: supplier?.id ?? order.supplierId,
          supplierName: supplier?.name ?? order.supplierName,
          orderDate: dto.orderDate ?? order.orderDate,
          remark: dto.remark ?? order.remark,
          totalAmount: total,
        },
      );
      if (lines) {
        await manager.getRepository(PurchaseOrderItemEntity).delete({ orderId: id });
        await manager
          .getRepository(PurchaseOrderItemEntity)
          .insert(lines.map((l) => ({ orderId: id, ...l })));
      }
    });
    return this.detail(id);
  }

  async remove(id: number): Promise<void> {
    const order = await this.mustFind(id);
    if (order.status !== 'draft') throw new BusinessException('仅草稿状态的订单可删除', 40022);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(PurchaseOrderItemEntity).delete({ orderId: id });
      await manager.getRepository(PurchaseOrderEntity).delete({ id });
    });
  }

  async confirm(id: number): Promise<void> {
    const companyId = TenantContext.companyId;
    await this.mustFind(id);
    const count = await this.itemRepo.count({ where: { orderId: id } });
    if (!count) throw new BusinessException('订单没有明细，无法确认', 40024);

    const claimed = await this.dataSource.transaction((manager) =>
      claimStatus(manager, PurchaseOrderEntity, { id, companyId }, 'draft', 'confirmed'),
    );
    if (!claimed) throw new BusinessException('仅草稿状态可确认', 40023);
  }

  async cancel(id: number): Promise<void> {
    const companyId = TenantContext.companyId;
    await this.mustFind(id);

    const claimed = await this.dataSource.transaction((manager) =>
      claimStatus(manager, PurchaseOrderEntity, { id, companyId }, ['draft', 'confirmed'], 'cancelled'),
    );
    if (!claimed) throw new BusinessException('当前状态不可取消', 40025);
  }

  /**
   * 采购入库（核心事务）：
   * **先原子抢占订单状态** → 生成入库单 + 明细 → 逐行库存增加（FOR UPDATE）→ 写流水。
   * 任一步失败整体回滚。
   *
   * 抢占放在事务内第一步的原因同销售出库：事务外读到的 status 是快照，
   * 并发请求会全部通过校验，导致重复入库、库存被重复增加。
   */
  async warehouse(id: number): Promise<{ inboundNo: string }> {
    const companyId = TenantContext.companyId;
    const order = await this.mustFind(id);
    if (order.status !== 'confirmed') {
      throw new BusinessException('仅已确认的订单可入库', 40026);
    }
    const items = await this.itemRepo.find({ where: { orderId: id } });
    if (!items.length) throw new BusinessException('订单没有明细', 40027);

    return this.withNoRetry(async (manager) => {
      const claimed = await claimStatus(
        manager,
        PurchaseOrderEntity,
        { id, companyId },
        'confirmed',
        'warehoused',
      );
      if (!claimed) throw new BusinessException('该订单已被处理，请刷新后重试', 40041);

      const inboundNo = await nextNo(manager, 'purchase_inbound', 'inbound_no', companyId, 'IB');
      const inboundId = await manager
        .getRepository(PurchaseInboundEntity)
        .insert({
          companyId,
          inboundNo,
          orderId: order.id,
          supplierId: order.supplierId,
          supplierName: order.supplierName,
          inboundDate: todayLocal(),
          totalAmount: order.totalAmount,
          remark: order.remark,
          createdBy: TenantContext.userId,
        })
        .then((r) => r.identifiers[0].id as number);

      await manager.getRepository(PurchaseInboundItemEntity).insert(
        items.map((i) => ({
          inboundId,
          productId: i.productId,
          productName: i.productName,
          spec: i.spec,
          unit: i.unit,
          quantity: i.quantity,
          price: i.price,
          amount: i.amount,
        })),
      );

      // 订单状态已在事务开头由 claimStatus 置为 warehoused，这里不再重复 UPDATE

      /**
       * 按 productId 排序后再逐行加锁。
       *
       * movement() 每行都会 `SELECT ... FOR UPDATE`。如果两张订单的明细顺序相反
       * （A：p1→p2，B：p2→p1），两个事务就会互相等对方的锁 → InnoDB 判定死锁 1213 回滚。
       * 统一按 productId 升序加锁，所有事务的加锁顺序一致，环形等待不可能形成。
       * 返回值与顺序无关（单号已在上面生成），所以排序不影响业务语义。
       */
      const lockedItems = [...items].sort((a, b) => a.productId - b.productId);

      for (const item of lockedItems) {
        await this.inventoryService.movement(manager, {
          companyId,
          productId: item.productId,
          productName: item.productName,
          delta: item.quantity,
          type: 'in',
          refType: 'PURCHASE_INBOUND',
          refNo: inboundNo,
          operator: TenantContext.username,
        });
      }
      this.logger.log(`purchase inbound done: ${inboundNo}`);
      return { inboundNo };
    });
  }

  /** 校验明细：商品存在且在租户内，补充冗余字段并计算金额 */
  private async prepareItems(items: OrderLineInput[]) {
    const productIds = [...new Set(items.map((i) => i.productId))];
    const products = await this.productRepo.find({
      where: { id: In(productIds), companyId: TenantContext.companyId, status: 1 },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));
    const lines = items.map((i) => {
      const product = productMap.get(i.productId);
      if (!product) throw new BusinessException(`商品 ID ${i.productId} 不存在或已停用`, 40019);
      return {
        productId: product.id,
        productName: product.name,
        spec: product.spec ?? undefined,
        unit: product.unit ?? undefined,
        quantity: i.quantity,
        price: round2(i.price),
        amount: round2(i.quantity * i.price),
      };
    });
    return { lines, products };
  }

  /**
   * 事务重试：仅针对可重试的数据库错误（1062 唯一键冲突 / 1213 死锁 / 1205 锁等待超时）。
   * 每次重试前加随机退避 —— 失败事务若同时重试会再次撞在一起。
   * 次数用尽后抛业务异常，避免 QueryFailedError 变成「服务器内部错误」。
   */
  private async withNoRetry<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    const MAX_ATTEMPTS = 4;
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await this.dataSource.transaction(fn);
      } catch (err) {
        lastError = err;
        const errno = (err as { errno?: number })?.errno;
        const retryable = errno === 1062 || errno === 1213 || errno === 1205;
        if (retryable && attempt < MAX_ATTEMPTS - 1) {
          await sleep(15 + Math.floor(Math.random() * 45) * (attempt + 1));
          continue;
        }
        if (retryable) {
          throw new BusinessException('当前操作较为频繁，请稍后重试', 40039);
        }
        throw err;
      }
    }
    throw lastError;
  }

  private async mustFind(id: number): Promise<PurchaseOrderEntity> {
    const order = await this.orderRepo.findOne({
      where: { id, companyId: TenantContext.companyId },
    });
    if (!order) throw new BusinessException('采购订单不存在', 40406);
    return order;
  }

  private toItem(o: PurchaseOrderEntity): PurchaseOrderItem {
    const dateStr = typeof o.orderDate === 'string' ? o.orderDate : formatDate(o.orderDate);
    return {
      id: o.id,
      orderNo: o.orderNo,
      supplierId: o.supplierId,
      supplierName: o.supplierName,
      orderDate: dateStr,
      totalAmount: o.totalAmount,
      paidAmount: o.paidAmount,
      status: o.status,
      remark: o.remark ?? undefined,
      createdAt: formatDateTime(o.createdAt),
    };
  }
}
