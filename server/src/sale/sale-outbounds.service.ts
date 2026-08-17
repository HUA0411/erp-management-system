import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SaleOutboundEntity, SaleOutboundItemEntity } from '../entities/outbound.entity';
import { BusinessException } from '../common/exceptions/business.exception';
import { TenantContext } from '../tenant/tenant-context';
import type { PageResult } from '@erp/shared';
import { formatDate, formatDateTime } from '../common/utils/no-generator';

export interface OutboundQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  startDate?: string;
  endDate?: string;
}

export interface OutboundDetail {
  id: number;
  outboundNo: string;
  orderId?: number;
  customerId: number;
  customerName: string;
  outboundDate: string;
  totalAmount: number;
  remark?: string;
  createdAt: string;
  items: Array<{
    productId: number;
    productName: string;
    spec?: string;
    unit?: string;
    quantity: number;
    price: number;
    amount: number;
  }>;
}

@Injectable()
export class SaleOutboundsService {
  constructor(
    @InjectRepository(SaleOutboundEntity)
    private readonly outboundRepo: Repository<SaleOutboundEntity>,
    @InjectRepository(SaleOutboundItemEntity)
    private readonly itemRepo: Repository<SaleOutboundItemEntity>,
  ) {}

  async list(query: OutboundQuery): Promise<PageResult<OutboundDetail>> {
    const { page, pageSize, keyword, startDate, endDate } = query;
    const qb = this.outboundRepo
      .createQueryBuilder('o')
      .where('o.company_id = :cid', { cid: TenantContext.companyId });
    if (keyword) qb.andWhere('(o.outbound_no LIKE :kw OR o.customer_name LIKE :kw)', { kw: `%${keyword}%` });
    if (startDate) qb.andWhere('o.outbound_date >= :startDate', { startDate });
    if (endDate) qb.andWhere('o.outbound_date <= :endDate', { endDate });

    const [rows, total] = await qb
      .orderBy('o.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { list: rows.map((r) => this.toDetail(r)), total, page, pageSize };
  }

  async detail(id: number): Promise<OutboundDetail> {
    const outbound = await this.outboundRepo.findOne({
      where: { id, companyId: TenantContext.companyId },
    });
    if (!outbound) throw new BusinessException('出库单不存在', 40409);
    const items = await this.itemRepo.find({ where: { outboundId: id } });
    return {
      ...this.toDetail(outbound),
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

  private toDetail(r: SaleOutboundEntity): OutboundDetail {
    const dateStr =
      typeof r.outboundDate === 'string'
        ? r.outboundDate
        : formatDate(r.outboundDate);
    return {
      id: r.id,
      outboundNo: r.outboundNo,
      orderId: r.orderId ?? undefined,
      customerId: r.customerId,
      customerName: r.customerName,
      outboundDate: dateStr,
      totalAmount: r.totalAmount,
      remark: r.remark ?? undefined,
      createdAt: formatDateTime(r.createdAt),
      items: [],
    };
  }
}
