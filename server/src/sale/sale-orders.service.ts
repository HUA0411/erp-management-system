import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { SaleOrderEntity, SaleOrderItemEntity } from '../entities/sale.entity';
import { SaleOutboundEntity, SaleOutboundItemEntity } from '../entities/outbound.entity';
import { CustomerEntity } from '../entities/partner.entity';
import { ProductEntity } from '../entities/product.entity';
import { InventoryService } from '../inventory/inventory.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { TenantContext } from '../tenant/tenant-context';
import { formatDateTime, formatDate, nextNo, round2, sleep, todayLocal } from '../common/utils/no-generator';
import { claimStatus } from '../common/utils/claim-status';
import type { PageResult, SaleOrderItem } from '@erp/shared';

export interface OrderLineInput {
  productId: number;
  quantity: number;
  price: number;
}

export interface SaleOrderQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class SaleOrdersService {
  private readonly logger = new Logger(SaleOrdersService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(SaleOrderEntity) private readonly orderRepo: Repository<SaleOrderEntity>,
    @InjectRepository(SaleOrderItemEntity) private readonly itemRepo: Repository<SaleOrderItemEntity>,
    @InjectRepository(CustomerEntity) private readonly customerRepo: Repository<CustomerEntity>,
    @InjectRepository(ProductEntity) private readonly productRepo: Repository<ProductEntity>,
    private readonly inventoryService: InventoryService,
  ) {}

  async list(query: SaleOrderQuery): Promise<PageResult<SaleOrderItem>> {
    const { page, pageSize, keyword, status, startDate, endDate } = query;
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .where('o.company_id = :cid', { cid: TenantContext.companyId });
    if (keyword) {
      qb.andWhere('(o.order_no LIKE :kw OR o.customer_name LIKE :kw)', { kw: `%${keyword}%` });
    }
    if (status) qb.andWhere('o.status = :status', { status });
    if (startDate) qb.andWhere('o.order_date >= :startDate', { startDate });
    if (endDate) qb.andWhere('o.order_date <= :endDate', { endDate });

    const [rows, total] = await qb
      .orderBy('o.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { list: rows.map((o) => this.toItem(o)), total, page, pageSize };
  }

  async detail(id: number): Promise<SaleOrderItem> {
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
    customerId: number;
    orderDate: string;
    remark?: string;
    items: OrderLineInput[];
  }): Promise<SaleOrderItem> {
    const companyId = TenantContext.companyId;
    const customer = await this.customerRepo.findOne({
      where: { id: dto.customerId, companyId, status: 1 },
    });
    if (!customer) throw new BusinessException('客户不存在或已停用', 40028);

    const prepared = await this.prepareItems(dto.items);
    const total = round2(prepared.lines.reduce((s, l) => s + l.amount, 0));

    const orderId = await this.withNoRetry(async (manager) => {
      const orderNo = await nextNo(manager, 'sale_order', 'order_no', companyId, 'SO');
      const id = await manager
        .getRepository(SaleOrderEntity)
        .insert({
          companyId,
          orderNo,
          customerId: customer.id,
          customerName: customer.name,
          orderDate: dto.orderDate,
          totalAmount: total,
          paidAmount: 0,
          status: 'draft',
          remark: dto.remark,
          createdBy: TenantContext.userId,
        })
        .then((r) => r.identifiers[0].id as number);

      await manager
        .getRepository(SaleOrderItemEntity)
        .insert(prepared.lines.map((l) => ({ orderId: id, ...l })));
      return id;
    });
    const order = await this.detail(orderId);
    this.logger.log(`sale order created: ${order.orderNo}`);
    return order;
  }

  async update(
    id: number,
    dto: { customerId?: number; orderDate?: string; remark?: string; items?: OrderLineInput[] },
  ): Promise<SaleOrderItem> {
    const companyId = TenantContext.companyId;
    const order = await this.mustFind(id);
    if (order.status !== 'draft') throw new BusinessException('仅草稿状态的订单可编辑', 40029);

    const customer = dto.customerId
      ? await this.customerRepo.findOne({ where: { id: dto.customerId, companyId, status: 1 } })
      : undefined;
    if (dto.customerId && !customer) throw new BusinessException('客户不存在或已停用', 40028);

    let total = order.totalAmount;
    let newLines: Awaited<ReturnType<typeof this.prepareItems>>['lines'] | undefined;
    if (dto.items) {
      const prepared = await this.prepareItems(dto.items);
      newLines = prepared.lines;
      total = round2(prepared.lines.reduce((s, l) => s + l.amount, 0));
    }

    /**
     * 编辑也必须抢锁。原先的写法有两个并发问题：
     *
     * 1) `total` 取自事务外的快照。T1 换明细把 total 写成 200，
     *    T2 在 T1 提交前也读到 100、且没传 items → 无条件 UPDATE 把 totalAmount 写回 100。
     *    结果表头金额与明细汇总不一致，出库单又复制这个错值 → 应收全错。
     * 2) 明细的 delete+insert 不带状态条件，T2 的编辑落在 T1 confirm 之后时，
     *    会把一张已确认订单的明细整体删改。
     *
     * 现在事务内第一步先把订单行锁住并校验状态，全程持锁，两者都不会发生。
     */
    await this.withNoRetry(async (manager) => {
      const locked: Array<{ status: string }> = await manager.query(
        'SELECT status FROM sale_order WHERE id = ? AND company_id = ? FOR UPDATE',
        [id, companyId],
      );
      if (!locked.length) throw new BusinessException('订单不存在', 40404);
      if (locked[0].status !== 'draft') throw new BusinessException('仅草稿状态的订单可编辑', 40029);

      await manager.getRepository(SaleOrderEntity).update(
        { id, companyId },
        {
          customerId: customer?.id ?? order.customerId,
          customerName: customer?.name ?? order.customerName,
          orderDate: dto.orderDate ?? order.orderDate,
          remark: dto.remark ?? order.remark,
          totalAmount: total,
        },
      );
      if (newLines) {
        await manager.getRepository(SaleOrderItemEntity).delete({ orderId: id });
        await manager.getRepository(SaleOrderItemEntity).insert(newLines.map((l) => ({ orderId: id, ...l })));
      }
    });
    return this.detail(id);
  }

  /**
   * 删除订单。必须用条件 DELETE 抢占草稿状态：
   * 否则 T1 读到 draft 通过校验、T2 confirm 抢先提交，T1 再把已确认订单连明细物理删掉，
   * 出库单的 order_id 就成了悬挂引用。
   */
  async remove(id: number): Promise<void> {
    const companyId = TenantContext.companyId;
    await this.mustFind(id);
    await this.dataSource.transaction(async (manager) => {
      const res = await manager.getRepository(SaleOrderEntity).delete({ id, companyId, status: 'draft' });
      if ((res.affected ?? 0) === 0) {
        throw new BusinessException('仅草稿状态的订单可删除', 40030);
      }
      await manager.getRepository(SaleOrderItemEntity).delete({ orderId: id });
    });
  }

  /**
   * 确认 / 取消：状态流转必须在事务内用条件 UPDATE 抢占，
   * 否则并发请求会读到同一个旧状态、双双通过校验、双双改状态。
   * 详见 common/utils/claim-status.ts 的说明与实测数据。
   */
  async confirm(id: number): Promise<void> {
    const companyId = TenantContext.companyId;
    await this.mustFind(id);
    const count = await this.itemRepo.count({ where: { orderId: id } });
    if (!count) throw new BusinessException('订单没有明细，无法确认', 40032);

    const claimed = await this.dataSource.transaction((manager) =>
      claimStatus(manager, SaleOrderEntity, { id, companyId }, 'draft', 'confirmed'),
    );
    if (!claimed) throw new BusinessException('仅草稿状态可确认', 40031);
  }

  async cancel(id: number): Promise<void> {
    const companyId = TenantContext.companyId;
    await this.mustFind(id);

    const claimed = await this.dataSource.transaction((manager) =>
      claimStatus(manager, SaleOrderEntity, { id, companyId }, ['draft', 'confirmed'], 'cancelled'),
    );
    if (!claimed) throw new BusinessException('当前状态不可取消', 40033);
  }

  /**
   * 销售出库（核心事务）：**先原子抢占订单状态**，再逐行 FOR UPDATE 锁库存并校验充足
   * → 扣减 → 生成出库单 → 写流水。任一行库存不足则整体回滚，杜绝超卖。
   *
   * 抢占必须放在事务内的第一步：
   * 事务外那次 `order.status !== 'confirmed'` 检查读的是快照，
   * 5 个并发出库请求会全部通过它，然后各生成一张出库单、各扣一次库存（实测 75→50）。
   * 改成条件 UPDATE 后，只有第一个请求能把 confirmed 改成 outbound，其余 affectedRows=0。
   * 事务后续失败时状态随事务一起回滚，不会卡在中间态。
   */
  async outbound(id: number): Promise<{ outboundNo: string }> {
    const companyId = TenantContext.companyId;
    const order = await this.mustFind(id);
    if (order.status !== 'confirmed') {
      throw new BusinessException('仅已确认的订单可出库', 40034);
    }
    const items = await this.itemRepo.find({ where: { orderId: id } });
    if (!items.length) throw new BusinessException('订单没有明细', 40035);

    return this.withNoRetry(async (manager) => {
      const claimed = await claimStatus(manager, SaleOrderEntity, { id, companyId }, 'confirmed', 'outbound');
      if (!claimed) throw new BusinessException('该订单已被处理，请刷新后重试', 40040);

      const outboundNo = await nextNo(manager, 'sale_outbound', 'outbound_no', companyId, 'OB');
      const outboundId = await manager
        .getRepository(SaleOutboundEntity)
        .insert({
          companyId,
          outboundNo,
          orderId: order.id,
          customerId: order.customerId,
          customerName: order.customerName,
          outboundDate: todayLocal(),
          totalAmount: order.totalAmount,
          remark: order.remark,
          createdBy: TenantContext.userId,
        })
        .then((r) => r.identifiers[0].id as number);

      await manager.getRepository(SaleOutboundItemEntity).insert(
        items.map((i) => ({
          outboundId,
          productId: i.productId,
          productName: i.productName,
          spec: i.spec,
          unit: i.unit,
          quantity: i.quantity,
          price: i.price,
          amount: i.amount,
        })),
      );

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
          delta: -item.quantity,
          type: 'out',
          refType: 'SALE_OUTBOUND',
          refNo: outboundNo,
          operator: TenantContext.username,
        });
      }
      this.logger.log(`sale outbound done: ${outboundNo}`);
      return { outboundNo };
    });
  }

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
   * 事务重试：仅针对可重试的数据库错误。
   *
   * 1062 唯一键冲突 —— 取号并发兜底（改用 seq_counter 后应极少触发）
   * 1213 死锁、1205 锁等待超时 —— InnoDB 主动回滚，重试是标准处理方式
   *
   * 每次重试前加随机退避：失败的事务如果同时重试会再次撞在一起
   * （原先无退避，8 个并发请求重试时步调一致，3 次机会只够 3 个成功）。
   * 重试次数用尽后抛出可读的业务异常，而不是让 QueryFailedError 冒到
   * 全局过滤器变成光秃秃的「服务器内部错误」。
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

  private async mustFind(id: number): Promise<SaleOrderEntity> {
    const order = await this.orderRepo.findOne({
      where: { id, companyId: TenantContext.companyId },
    });
    if (!order) throw new BusinessException('销售订单不存在', 40408);
    return order;
  }

  private toItem(o: SaleOrderEntity): SaleOrderItem {
    const dateStr = typeof o.orderDate === 'string' ? o.orderDate : formatDate(o.orderDate);
    return {
      id: o.id,
      orderNo: o.orderNo,
      customerId: o.customerId,
      customerName: o.customerName,
      orderDate: dateStr,
      totalAmount: o.totalAmount,
      paidAmount: o.paidAmount,
      status: o.status,
      remark: o.remark ?? undefined,
      createdAt: formatDateTime(o.createdAt),
    };
  }
}
