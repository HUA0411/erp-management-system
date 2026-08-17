import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseInboundEntity, PurchaseInboundItemEntity } from '../entities/inbound.entity';
import { BusinessException } from '../common/exceptions/business.exception';
import { TenantContext } from '../tenant/tenant-context';
import type { PageResult } from '@erp/shared';
import { formatDate, formatDateTime } from '../common/utils/no-generator';

export interface InboundQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  startDate?: string;
  endDate?: string;
}

export interface InboundDetail {
  id: number;
  inboundNo: string;
  orderId?: number;
  supplierId: number;
  supplierName: string;
  inboundDate: string;
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
export class PurchaseInboundsService {
  constructor(
    @InjectRepository(PurchaseInboundEntity)
    private readonly inboundRepo: Repository<PurchaseInboundEntity>,
    @InjectRepository(PurchaseInboundItemEntity)
    private readonly itemRepo: Repository<PurchaseInboundItemEntity>,
  ) {}

  async list(query: InboundQuery): Promise<PageResult<InboundDetail>> {
    const { page, pageSize, keyword, startDate, endDate } = query;
    const qb = this.inboundRepo
      .createQueryBuilder('i')
      .where('i.company_id = :cid', { cid: TenantContext.companyId });
    if (keyword) qb.andWhere('(i.inbound_no LIKE :kw OR i.supplier_name LIKE :kw)', { kw: `%${keyword}%` });
    if (startDate) qb.andWhere('i.inbound_date >= :startDate', { startDate });
    if (endDate) qb.andWhere('i.inbound_date <= :endDate', { endDate });

    const [rows, total] = await qb
      .orderBy('i.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      list: rows.map((r) => this.toDetail(r)),
      total,
      page,
      pageSize,
    };
  }

  async detail(id: number): Promise<InboundDetail> {
    const inbound = await this.inboundRepo.findOne({
      where: { id, companyId: TenantContext.companyId },
    });
    if (!inbound) throw new BusinessException('入库单不存在', 40407);
    const items = await this.itemRepo.find({ where: { inboundId: id } });
    return {
      ...this.toDetail(inbound),
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

  private toDetail(r: PurchaseInboundEntity): InboundDetail {
    const dateStr =
      typeof r.inboundDate === 'string' ? r.inboundDate : formatDate(r.inboundDate);
    return {
      id: r.id,
      inboundNo: r.inboundNo,
      orderId: r.orderId ?? undefined,
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      inboundDate: dateStr,
      totalAmount: r.totalAmount,
      remark: r.remark ?? undefined,
      createdAt: formatDateTime(r.createdAt),
      items: [],
    };
  }
}
