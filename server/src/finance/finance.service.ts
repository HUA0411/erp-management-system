import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PaymentEntity } from '../entities/payment.entity';
import { SupplierEntity, CustomerEntity } from '../entities/partner.entity';
import { PurchaseOrderEntity } from '../entities/purchase.entity';
import { SaleOrderEntity } from '../entities/sale.entity';
import { BusinessException } from '../common/exceptions/business.exception';
import { TenantContext } from '../tenant/tenant-context';
import { formatDateTime, formatDate, nextNo, sleep } from '../common/utils/no-generator';
import type { AccountSummary, PageResult, PartnerType, PaymentItem, PaymentType } from '@erp/shared';

export interface PaymentQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  type?: PaymentType;
  partnerType?: PartnerType;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(PaymentEntity) private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(SupplierEntity) private readonly supplierRepo: Repository<SupplierEntity>,
    @InjectRepository(CustomerEntity) private readonly customerRepo: Repository<CustomerEntity>,
    @InjectRepository(PurchaseOrderEntity)
    private readonly purchaseRepo: Repository<PurchaseOrderEntity>,
    @InjectRepository(SaleOrderEntity) private readonly saleRepo: Repository<SaleOrderEntity>,
  ) {}

  async list(query: PaymentQuery): Promise<PageResult<PaymentItem>> {
    const { page, pageSize, keyword, type, partnerType, startDate, endDate } = query;
    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .where('p.company_id = :cid', { cid: TenantContext.companyId });
    if (keyword) {
      qb.andWhere('(p.doc_no LIKE :kw OR p.partner_name LIKE :kw OR p.order_no LIKE :kw)', {
        kw: `%${keyword}%`,
      });
    }
    if (type) qb.andWhere('p.type = :type', { type });
    if (partnerType) qb.andWhere('p.partner_type = :partnerType', { partnerType });
    if (startDate) qb.andWhere('p.pay_date >= :startDate', { startDate });
    if (endDate) qb.andWhere('p.pay_date <= :endDate', { endDate });

    const [rows, total] = await qb
      .orderBy('p.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      list: rows.map((p) => ({
        id: p.id,
        docNo: p.docNo,
        type: p.type,
        partnerType: p.partnerType,
        partnerId: p.partnerId,
        partnerName: p.partnerName,
        amount: p.amount,
        orderNo: p.orderNo ?? undefined,
        payDate: typeof p.payDate === 'string' ? p.payDate : formatDate(p.payDate),
        method: p.method ?? undefined,
        remark: p.remark ?? undefined,
        createdAt: formatDateTime(p.createdAt),
      })),
      total,
      page,
      pageSize,
    };
  }

  async create(data: {
    type: PaymentType;
    partnerType: PartnerType;
    partnerId: number;
    amount: number;
    orderNo?: string;
    payDate: string;
    method?: string;
    remark?: string;
    requestId?: string;
  }): Promise<PaymentEntity> {
    const companyId = TenantContext.companyId;

    /**
     * 幂等：带 requestId 的重复提交直接返回首次创建的那条。
     *
     * 典型触发场景是「双击提交」「请求超时后用户又点一次」——
     * 这两次请求的业务意图只有一个，绝不能落两条单。
     * `(company_id, doc_no)` 唯一索引在这件事上完全帮不上忙：docNo 是服务端每次
     * 现取的序号，两次请求必然不同号，两张单都会成功写入，往来账直接翻倍。
     */
    if (data.requestId) {
      const existed = await this.paymentRepo.findOne({ where: { companyId, requestId: data.requestId } });
      if (existed) {
        this.logger.log(`payment replay ignored: requestId=${data.requestId} docNo=${existed.docNo}`);
        return existed;
      }
    }

    let partnerName = '';
    if (data.partnerType === 'supplier') {
      const s = await this.supplierRepo.findOne({ where: { id: data.partnerId, companyId } });
      if (!s) throw new BusinessException('供应商不存在', 40404);
      partnerName = s.name;
    } else {
      const c = await this.customerRepo.findOne({ where: { id: data.partnerId, companyId } });
      if (!c) throw new BusinessException('客户不存在', 40405);
      partnerName = c.name;
    }

    /**
     * 单号分配、单据落库、订单已收/已付回写必须在**同一个事务**里。
     *
     * 原先这三步是分开的：nextNo 在一个短事务里提交、payment 在事务外 insert，
     * 而全代码库**没有任何地方写 paid_amount** —— 订单列表的「已收/已付」恒为 0，
     * 与财务模块按往来单位汇总的口径对不上账。
     * （实测：47 张订单 paidAmount 全是 0，而 payment 表里有挂 order_no 的收款记录。）
     */
    let entity: PaymentEntity;
    try {
      entity = await this.dataSource.transaction(async (manager) => {
        const docNo = await nextNo(manager, 'payment', 'doc_no', companyId, 'PAY');
        const saved = await manager.getRepository(PaymentEntity).insert({
          companyId,
          docNo,
          type: data.type,
          partnerType: data.partnerType,
          partnerId: data.partnerId,
          partnerName,
          amount: data.amount,
          orderNo: data.orderNo,
          // 幂等键必须一起落库，否则唯一索引上全是 NULL，去重完全失效
          requestId: data.requestId,
          payDate: data.payDate,
          method: data.method,
          remark: data.remark,
          createdBy: TenantContext.userId,
        });
        if (data.orderNo) await this.syncPaidAmount(manager, companyId, data.orderNo);
        this.logger.log(`payment created: ${docNo}`);
        return manager
          .getRepository(PaymentEntity)
          .findOneByOrFail({ id: saved.identifiers[0].id as number });
      });
    } catch (err) {
      /**
       * 真正的并发由唯一索引兜底。
       *
       * 两个请求同时通过了上面的存在性检查（都在对方提交前读的），
       * 于是都去 INSERT —— 后到的那个吃 1062 ER_DUP_ENTRY。
       * 这里把它转成「返回首次创建的那条」，对调用方而言仍然是幂等成功，
       * 而不是一个看不懂的 500。并发写同一唯一键还可能撞上死锁(1213)/
       * 锁等待超时(1205)，一并按同样方式处理。
       */
      const errno = (err as { errno?: number })?.errno;
      if (data.requestId && (errno === 1062 || errno === 1213 || errno === 1205)) {
        // 稍微等一下胜出的那个事务提交，再读一次
        for (let attempt = 0; attempt < 5; attempt++) {
          const existed = await this.paymentRepo.findOne({
            where: { companyId, requestId: data.requestId },
          });
          if (existed) {
            this.logger.log(`payment concurrent duplicate resolved: requestId=${data.requestId}`);
            return existed;
          }
          await sleep(20 * (attempt + 1));
        }
      }
      throw err;
    }
    return entity;
  }

  /**
   * 重算某张订单的已收/已付金额。
   *
   * 用「按 order_no 求和后整体赋值」而不是「+= 本次金额」：
   *  - 幂等：重复执行结果一致，重试或补录不会把金额叠加两次；
   *  - 自愈：删单、改单后自动回到正确值，不会越算越偏。
   * 采购付款（type=pay）挂在 purchase_order，销售收款（type=receive）挂在 sale_order，
   * 两条 UPDATE 都跑，命中的那条才有行。
   */
  private async syncPaidAmount(manager: EntityManager, companyId: number, orderNo: string): Promise<void> {
    await manager.query(
      `UPDATE sale_order o
       SET o.paid_amount = COALESCE((
         SELECT SUM(p.amount) FROM payment p
         WHERE p.company_id = o.company_id AND p.order_no = o.order_no AND p.type = 'receive'
       ), 0)
       WHERE o.company_id = ? AND o.order_no = ?`,
      [companyId, orderNo],
    );
    await manager.query(
      `UPDATE purchase_order o
       SET o.paid_amount = COALESCE((
         SELECT SUM(p.amount) FROM payment p
         WHERE p.company_id = o.company_id AND p.order_no = o.order_no AND p.type = 'pay'
       ), 0)
       WHERE o.company_id = ? AND o.order_no = ?`,
      [companyId, orderNo],
    );
  }

  async remove(id: number): Promise<void> {
    const companyId = TenantContext.companyId;
    const payment = await this.paymentRepo.findOne({ where: { id, companyId } });
    if (!payment) throw new BusinessException('收付款单不存在', 40411);

    // 删除也要回写订单金额，否则删掉收款后订单仍显示「已收」
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(PaymentEntity).delete({ id, companyId });
      if (payment.orderNo) await this.syncPaidAmount(manager, companyId, payment.orderNo);
    });
  }
  /**
   * 应收应付汇总：
   * 应付 = Σ 已确认/已入库采购订单总额 − Σ 已付款
   * 应收 = Σ 已确认/已出库销售订单总额 − Σ 已收款
   */
  async accounts(): Promise<AccountSummary[]> {
    const companyId = TenantContext.companyId;
    const [payableRows, receivableRows, payPayments, receivePayments] = await Promise.all([
      this.purchaseRepo
        .createQueryBuilder('o')
        .select('o.supplier_id', 'partnerId')
        .addSelect('o.supplier_name', 'partnerName')
        .addSelect('SUM(o.total_amount)', 'totalAmount')
        .where('o.company_id = :cid', { cid: companyId })
        .andWhere("o.status IN ('confirmed','warehoused')")
        .groupBy('o.supplier_id')
        .addGroupBy('o.supplier_name')
        .getRawMany<{ partnerId: string; partnerName: string; totalAmount: string }>(),
      this.saleRepo
        .createQueryBuilder('o')
        .select('o.customer_id', 'partnerId')
        .addSelect('o.customer_name', 'partnerName')
        .addSelect('SUM(o.total_amount)', 'totalAmount')
        .where('o.company_id = :cid', { cid: companyId })
        .andWhere("o.status IN ('confirmed','outbound')")
        .groupBy('o.customer_id')
        .addGroupBy('o.customer_name')
        .getRawMany<{ partnerId: string; partnerName: string; totalAmount: string }>(),
      this.paymentRepo
        .createQueryBuilder('p')
        .select('p.partner_id', 'partnerId')
        .addSelect('SUM(p.amount)', 'paid')
        .where('p.company_id = :cid', { cid: companyId })
        .andWhere("p.type = 'pay'")
        .groupBy('p.partner_id')
        .getRawMany<{ partnerId: string; paid: string }>(),
      this.paymentRepo
        .createQueryBuilder('p')
        .select('p.partner_id', 'partnerId')
        .addSelect('SUM(p.amount)', 'paid')
        .where('p.company_id = :cid', { cid: companyId })
        .andWhere("p.type = 'receive'")
        .groupBy('p.partner_id')
        .getRawMany<{ partnerId: string; paid: string }>(),
    ]);

    const payMap = new Map(payPayments.map((r) => [Number(r.partnerId), Number(r.paid)]));
    const receiveMap = new Map(receivePayments.map((r) => [Number(r.partnerId), Number(r.paid)]));

    const payable: AccountSummary[] = payableRows.map((r) => {
      const totalAmount = Number(r.totalAmount);
      const paidAmount = payMap.get(Number(r.partnerId)) ?? 0;
      return {
        partnerType: 'supplier',
        partnerId: Number(r.partnerId),
        partnerName: r.partnerName,
        totalAmount,
        paidAmount,
        balance: Math.round((totalAmount - paidAmount) * 100) / 100,
      };
    });

    const receivable: AccountSummary[] = receivableRows.map((r) => {
      const totalAmount = Number(r.totalAmount);
      const paidAmount = receiveMap.get(Number(r.partnerId)) ?? 0;
      return {
        partnerType: 'customer',
        partnerId: Number(r.partnerId),
        partnerName: r.partnerName,
        totalAmount,
        paidAmount,
        balance: Math.round((totalAmount - paidAmount) * 100) / 100,
      };
    });

    return [...receivable, ...payable];
  }
}
