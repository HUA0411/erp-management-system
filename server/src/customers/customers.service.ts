import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerEntity } from '../entities/partner.entity';
import { SaleOrderEntity } from '../entities/sale.entity';
import { BusinessException } from '../common/exceptions/business.exception';
import { TenantContext } from '../tenant/tenant-context';
import type { CustomerItem, PageResult } from '@erp/shared';

export interface PartnerQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: number;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectRepository(CustomerEntity) private readonly customerRepo: Repository<CustomerEntity>,
    @InjectRepository(SaleOrderEntity) private readonly saleRepo: Repository<SaleOrderEntity>,
  ) {}

  async list(query: PartnerQuery): Promise<PageResult<CustomerItem>> {
    const { page, pageSize, keyword, status } = query;
    const qb = this.customerRepo
      .createQueryBuilder('c')
      .where('c.company_id = :cid', { cid: TenantContext.companyId });
    if (keyword) {
      qb.andWhere('(c.name LIKE :kw OR c.code LIKE :kw OR c.contact LIKE :kw OR c.phone LIKE :kw)', {
        kw: `%${keyword}%`,
      });
    }
    if (status != null) qb.andWhere('c.status = :status', { status });
    const [rows, total] = await qb
      .orderBy('c.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return {
      list: rows.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        contact: c.contact ?? undefined,
        phone: c.phone ?? undefined,
        address: c.address ?? undefined,
        level: c.level ?? undefined,
        remark: c.remark ?? undefined,
        status: c.status,
      })),
      total,
      page,
      pageSize,
    };
  }

  async options(keyword?: string): Promise<CustomerItem[]> {
    const qb = this.customerRepo
      .createQueryBuilder('c')
      .where('c.company_id = :cid', { cid: TenantContext.companyId })
      .andWhere('c.status = 1');
    if (keyword) qb.andWhere('(c.name LIKE :kw OR c.code LIKE :kw)', { kw: `%${keyword}%` });
    const rows = await qb.orderBy('c.id', 'ASC').take(100).getMany();
    return rows.map((c) => ({ id: c.id, code: c.code, name: c.name, status: c.status }));
  }

  async create(data: Partial<CustomerEntity>): Promise<CustomerEntity> {
    const companyId = TenantContext.companyId;
    const exists = await this.customerRepo.findOne({ where: { companyId, code: data.code } });
    if (exists) throw new BusinessException('客户编码已存在', 40016);
    const entity = await this.customerRepo.save(this.customerRepo.create({ ...data, companyId }));
    this.logger.log(`customer created: ${entity.code}`);
    return entity;
  }

  async update(id: number, data: Partial<CustomerEntity>): Promise<void> {
    await this.mustFind(id);
    await this.customerRepo.update({ id }, data);
  }

  async remove(id: number): Promise<void> {
    await this.mustFind(id);
    const used = await this.saleRepo.count({
      where: { companyId: TenantContext.companyId, customerId: id },
    });
    if (used > 0) throw new BusinessException(`该客户已有 ${used} 笔销售订单，无法删除`, 40017);
    await this.customerRepo.update({ id }, { status: 0 });
  }

  async mustFind(id: number): Promise<CustomerEntity> {
    const entity = await this.customerRepo.findOne({
      where: { id, companyId: TenantContext.companyId },
    });
    if (!entity) throw new BusinessException('客户不存在', 40405);
    return entity;
  }
}
