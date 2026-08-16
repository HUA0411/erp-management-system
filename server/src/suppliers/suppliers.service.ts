import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupplierEntity } from '../entities/partner.entity';
import { PurchaseOrderEntity } from '../entities/purchase.entity';
import { BusinessException } from '../common/exceptions/business.exception';
import { TenantContext } from '../tenant/tenant-context';
import type { PageResult, SupplierItem } from '@erp/shared';

export interface PartnerQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: number;
}

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(
    @InjectRepository(SupplierEntity) private readonly supplierRepo: Repository<SupplierEntity>,
    @InjectRepository(PurchaseOrderEntity)
    private readonly purchaseRepo: Repository<PurchaseOrderEntity>,
  ) {}

  async list(query: PartnerQuery): Promise<PageResult<SupplierItem>> {
    const { page, pageSize, keyword, status } = query;
    const qb = this.supplierRepo
      .createQueryBuilder('s')
      .where('s.company_id = :cid', { cid: TenantContext.companyId });
    if (keyword) {
      qb.andWhere('(s.name LIKE :kw OR s.code LIKE :kw OR s.contact LIKE :kw OR s.phone LIKE :kw)', {
        kw: `%${keyword}%`,
      });
    }
    if (status != null) qb.andWhere('s.status = :status', { status });
    const [rows, total] = await qb
      .orderBy('s.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return {
      list: rows.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        contact: s.contact ?? undefined,
        phone: s.phone ?? undefined,
        address: s.address ?? undefined,
        remark: s.remark ?? undefined,
        status: s.status,
      })),
      total,
      page,
      pageSize,
    };
  }

  async options(keyword?: string): Promise<SupplierItem[]> {
    const qb = this.supplierRepo
      .createQueryBuilder('s')
      .where('s.company_id = :cid', { cid: TenantContext.companyId })
      .andWhere('s.status = 1');
    if (keyword) qb.andWhere('(s.name LIKE :kw OR s.code LIKE :kw)', { kw: `%${keyword}%` });
    const rows = await qb.orderBy('s.id', 'ASC').take(100).getMany();
    return rows.map((s) => ({ id: s.id, code: s.code, name: s.name, status: s.status }));
  }

  async create(data: Partial<SupplierEntity>): Promise<SupplierEntity> {
    const companyId = TenantContext.companyId;
    const exists = await this.supplierRepo.findOne({ where: { companyId, code: data.code } });
    if (exists) throw new BusinessException('供应商编码已存在', 40014);
    const entity = await this.supplierRepo.save(this.supplierRepo.create({ ...data, companyId }));
    this.logger.log(`supplier created: ${entity.code}`);
    return entity;
  }

  async update(id: number, data: Partial<SupplierEntity>): Promise<void> {
    await this.mustFind(id);
    await this.supplierRepo.update({ id }, data);
  }

  async remove(id: number): Promise<void> {
    await this.mustFind(id);
    const used = await this.purchaseRepo.count({
      where: { companyId: TenantContext.companyId, supplierId: id },
    });
    if (used > 0) throw new BusinessException(`该供应商已有 ${used} 笔采购订单，无法删除`, 40015);
    await this.supplierRepo.update({ id }, { status: 0 });
  }

  async mustFind(id: number): Promise<SupplierEntity> {
    const entity = await this.supplierRepo.findOne({
      where: { id, companyId: TenantContext.companyId },
    });
    if (!entity) throw new BusinessException('供应商不存在', 40404);
    return entity;
  }
}
