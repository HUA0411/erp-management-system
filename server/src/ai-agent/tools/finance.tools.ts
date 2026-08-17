import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ToolRegistryService } from '../tool-registry.service';
import { FinanceService } from '../../finance/finance.service';
import { PaymentEntity } from '../../entities/payment.entity';
import { SupplierEntity, CustomerEntity } from '../../entities/partner.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { todayLocal } from '../../common/utils/no-generator';
import type { AgentTool, PreviewCard } from '../agent-tool';

/** 财务工具包：收付款记录、应收应付汇总、登记收付款、删除单据（写操作走提案确认） */
@Injectable()
export class FinanceAgentTools implements OnModuleInit {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly financeService: FinanceService,
    @InjectRepository(PaymentEntity) private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(SupplierEntity) private readonly supplierRepo: Repository<SupplierEntity>,
    @InjectRepository(CustomerEntity) private readonly customerRepo: Repository<CustomerEntity>,
  ) {}

  onModuleInit(): void {
    this.registry.register([
      this.queryPayments(),
      this.queryAccounts(),
      this.createPayment(),
      this.removePayment(),
    ]);
  }

  /** 收付款记录 */
  private queryPayments(): AgentTool {
    return {
      name: 'query_payments',
      description:
        '查询收付款记录。可按往来单位/单号关键字筛选，可按类型（pay付款/receive收款）、往来类型（supplier供应商/customer客户）筛选，支持分页。返回单据号、类型、往来单位、金额、日期、方式。',
      schema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '单据号或往来单位关键字，可选' },
          type: { type: 'string', description: '类型：pay（付款）或 receive（收款），可选' },
          partnerType: { type: 'string', description: '往来类型：supplier（供应商）或 customer（客户），可选' },
          page: { type: 'number', description: '页码，默认 1' },
          pageSize: { type: 'number', description: '每页条数，默认 10，最大 50' },
        },
        additionalProperties: false,
      },
      kind: 'read',
      requiredPermission: 'finance:payment:view',
      handler: async (_ctx, args) => {
        const pageNum = Math.max(Number(args.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(args.pageSize) || 10, 1), 50);
        const page = await this.financeService.list({
          page: pageNum,
          pageSize,
          keyword: typeof args.keyword === 'string' && args.keyword ? args.keyword : undefined,
          type: args.type === 'pay' || args.type === 'receive' ? args.type : undefined,
          partnerType:
            args.partnerType === 'supplier' || args.partnerType === 'customer'
              ? args.partnerType
              : undefined,
        });
        return { type: 'data', data: { count: page.total, items: page.list } };
      },
    };
  }

  /** 应收应付汇总 */
  private queryAccounts(): AgentTool {
    return {
      name: 'query_accounts',
      description:
        '查询应收应付汇总。返回每个客户/供应商的往来总额、已收/已付金额、余额（应收未收或应付未付）。可用于回答"谁还欠我们钱/我们欠谁钱"类问题。',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      kind: 'read',
      requiredPermission: 'finance:account:view',
      handler: async () => {
        const rows = await this.financeService.accounts();
        return { type: 'data', data: { count: rows.length, items: rows } };
      },
    };
  }

  // ==================== 写操作 ====================

  /** 登记收付款单 */
  private createPayment(): AgentTool {
    return {
      name: 'create_payment',
      description:
        '登记收付款单。type：pay（付给供应商）或 receive（客户收款）；partnerType：supplier（供应商）或 customer（客户）；partnerId 为往来单位ID；amount 金额。可选：payDate（日期）、method（支付方式）、orderNo（关联单号）、remark。生成操作提案，必须用户确认后创建。',
      schema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['pay', 'receive'], description: 'pay=付款给供应商，receive=客户收款' },
          partnerType: { type: 'string', enum: ['supplier', 'customer'], description: 'supplier=供应商，customer=客户' },
          partnerId: { type: 'number', description: '往来单位ID（供应商或客户）' },
          amount: { type: 'number', description: '金额，必须大于 0' },
          payDate: { type: 'string', description: '日期（YYYY-MM-DD），可选，默认今天' },
          method: { type: 'string', description: '支付方式，可选' },
          orderNo: { type: 'string', description: '关联订单号，可选' },
          remark: { type: 'string', description: '备注，可选' },
        },
        required: ['type', 'partnerType', 'partnerId', 'amount'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'finance:payment:create',
      handler: async (ctx, args, mode) => {
        const type: 'pay' | 'receive' = args.type === 'receive' ? 'receive' : 'pay';
        const partnerType: 'supplier' | 'customer' =
          args.partnerType === 'customer' ? 'customer' : 'supplier';
        const partnerId = Number(args.partnerId);
        const amount = Number(args.amount);
        if (!Number.isFinite(partnerId) || partnerId <= 0) throw new BusinessException('往来单位ID无效');
        if (!Number.isFinite(amount) || amount <= 0) throw new BusinessException('金额必须大于 0');

        let partnerName: string;
        if (partnerType === 'supplier') {
          const s = await this.supplierRepo.findOne({ where: { id: partnerId, companyId: ctx.companyId } });
          if (!s) throw new BusinessException('供应商不存在', 40404);
          partnerName = s.name;
        } else {
          const c = await this.customerRepo.findOne({ where: { id: partnerId, companyId: ctx.companyId } });
          if (!c) throw new BusinessException('客户不存在', 40405);
          partnerName = c.name;
        }

        const params = {
          type,
          partnerType,
          partnerId,
          amount: Math.round(amount * 100) / 100,
          payDate: typeof args.payDate === 'string' && args.payDate ? args.payDate : todayLocal(),
          method: typeof args.method === 'string' && args.method ? args.method : undefined,
          orderNo: typeof args.orderNo === 'string' && args.orderNo ? args.orderNo : undefined,
          remark: typeof args.remark === 'string' && args.remark ? args.remark : undefined,
        };
        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: type === 'receive' ? '登记收款' : '登记付款',
            rows: [
              { label: '类型', value: type === 'receive' ? '客户收款' : '付款给供应商' },
              { label: '往来单位', value: partnerName },
              { label: '金额', value: `¥${params.amount.toFixed(2)}` },
              { label: '日期', value: params.payDate },
              ...(params.method ? [{ label: '方式', value: params.method }] : []),
            ],
          };
          return { type: 'propose', params, preview };
        }
        const entity = await this.financeService.create(params);
        return { type: 'data', data: { ok: true, id: entity.id, docNo: entity.docNo, type: entity.type, amount: entity.amount } };
      },
    };
  }

  /** 删除收付款单 */
  private removePayment(): AgentTool {
    return {
      name: 'remove_payment',
      description:
        '删除收付款单。需要单据ID（paymentId）。删除后不可恢复。生成操作提案，必须用户确认后执行。',
      schema: {
        type: 'object',
        properties: { paymentId: { type: 'number', description: '收付款单ID' } },
        required: ['paymentId'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'finance:payment:delete',
      handler: async (ctx, args, mode) => {
        const paymentId = Number(args.paymentId);
        if (!Number.isFinite(paymentId) || paymentId <= 0) throw new BusinessException('单据ID无效');
        const payment = await this.paymentRepo.findOne({
          where: { id: paymentId, companyId: ctx.companyId },
        });
        if (!payment) throw new BusinessException('收付款单不存在', 40411);

        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '删除收付款单',
            rows: [
              { label: '单号', value: payment.docNo },
              { label: '类型', value: payment.type === 'receive' ? '客户收款' : '付款给供应商' },
              { label: '往来单位', value: payment.partnerName },
              { label: '金额', value: `¥${Number(payment.amount).toFixed(2)}` },
              { label: '操作', value: '删除后不可恢复' },
            ],
          };
          return { type: 'propose', params: { paymentId }, preview };
        }
        await this.financeService.remove(paymentId);
        return { type: 'data', data: { ok: true, paymentId, docNo: payment.docNo } };
      },
    };
  }
}
