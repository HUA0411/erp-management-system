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
import { formatDateTime, formatDate,  nextNo, round2, todayLocal  } from '../common/utils/no-generator';
import type { OrderItemLine, PageResult, SaleOrderItem } from '@erp/shared';

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

      await manager.getRepository(SaleOrderItemEntity).insert(
        prepared.lines.map((l) => ({ orderId: id, ...l })),
      );
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

    await this.withNoRetry(async (manager) => {
      await manager.getRepository(SaleOrderEntity).update(
        { id },
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
        await manager.getRepository(SaleOrderItemEntity).insert(
          newLines.map((l) => ({ orderId: id, ...l })),
        );
      }
    });
    return this.detail(id);
  }

  async remove(id: number): Promise<void> {
    const order = await this.mustFind(id);
    if (order.status !== 'draft') throw new BusinessException('仅草稿状态的订单可删除', 40030);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(SaleOrderItemEntity).delete({ orderId: id });
      await manager.getRepository(SaleOrderEntity).delete({ id });
    });
  }

  async confirm(id: number): Promise<void> {
    const order = await this.mustFind(id);
    if (order.status !== 'draft') throw new BusinessException('仅草稿状态可确认', 40031);
    const count = await this.itemRepo.count({ where: { orderId: id } });
    if (!count) throw new BusinessException('订单没有明细，无法确认', 40032);
    await this.orderRepo.update({ id }, { status: 'confirmed' });
  }

  async cancel(id: number): Promise<void> {
    const order = await this.mustFind(id);
    if (!['draft', 'confirmed'].includes(order.status)) {
      throw new BusinessException('当前状态不可取消', 40033);
    }
    await this.orderRepo.update({ id }, { status: 'cancelled' });
  }

  /**
   * 销售出库（核心事务）：逐行 FOR UPDATE 锁库存并校验充足 → 扣减 → 生成出库单 → 写流水。
   * 任一行库存不足则整体回滚，杜绝超卖。
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

      await manager.getRepository(SaleOrderEntity).update({ id }, { status: 'outbound' });

      for (const item of items) {
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

  private async withNoRetry<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.dataSource.transaction(fn);
      } catch (err) {
        lastError = err;
        if ((err as { errno?: number })?.errno === 1062 && attempt < 2) continue;
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
    const dateStr =
      typeof o.orderDate === 'string' ? o.orderDate : formatDate(o.orderDate);
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
