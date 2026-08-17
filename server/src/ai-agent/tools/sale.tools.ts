import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ToolRegistryService } from '../tool-registry.service';
import { SaleOrdersService } from '../../sale/sale-orders.service';
import { SaleOutboundsService } from '../../sale/sale-outbounds.service';
import { DashboardService } from '../../dashboard/dashboard.service';
import { CustomerEntity } from '../../entities/partner.entity';
import { ProductEntity } from '../../entities/product.entity';
import { InventoryEntity } from '../../entities/inventory.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { round2, todayLocal } from '../../common/utils/no-generator';
import type { AgentTool, PreviewCard } from '../agent-tool';

/**
 * 销售 + 经营看板工具包：销售额、销售订单、出库、趋势、热销、最近单据，
 * 以及销售订单的创建/确认/取消/删除/出库（写操作全部走提案确认）。
 */
@Injectable()
export class SaleAgentTools implements OnModuleInit {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly saleOrdersService: SaleOrdersService,
    private readonly saleOutboundsService: SaleOutboundsService,
    private readonly dashboardService: DashboardService,
    @InjectRepository(CustomerEntity) private readonly customerRepo: Repository<CustomerEntity>,
    @InjectRepository(ProductEntity) private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(InventoryEntity) private readonly inventoryRepo: Repository<InventoryEntity>,
  ) {}

  onModuleInit(): void {
    this.registry.register([
      this.queryDashboardSummary(),
      this.querySaleTrend(),
      this.queryTopProducts(),
      this.queryRecentOrders(),
      this.querySaleOrders(),
      this.querySaleOutbounds(),
      this.createSaleOrder(),
      this.confirmSaleOrder(),
      this.cancelSaleOrder(),
      this.removeSaleOrder(),
      this.outboundSaleOrder(),
    ]);
  }

  /** 经营看板汇总：销售额 / 单据 / 库存 / 应收应付 */
  private queryDashboardSummary(): AgentTool {
    return {
      name: 'query_dashboard_summary',
      description:
        '查询经营看板汇总数据：今日销售额、本月销售额、今日单据数、待入库采购单数、缺货商品数、商品总数、应收、应付。回答销售/经营汇总类问题时使用。',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      kind: 'read',
      requiredPermission: 'dashboard',
      handler: async () => {
        const s = await this.dashboardService.summary();
        return { type: 'data', data: s };
      },
    };
  }

  /** 近 N 天销售趋势 */
  private querySaleTrend(): AgentTool {
    return {
      name: 'query_sale_trend',
      description:
        '查询最近 N 天的销售趋势（按出库日统计）。返回每天日期、销售额、销售笔数。支持最长 730 天（约两年）；查询长区间（如一年）时请按月归纳汇报。可用于回答"本月/今年/近一年卖了多少"类问题。',
      schema: {
        type: 'object',
        properties: { days: { type: 'number', description: '统计天数，默认 30，最大 730' } },
        additionalProperties: false,
      },
      kind: 'read',
      requiredPermission: 'dashboard',
      handler: async (_ctx, args) => {
        const days = Math.min(Math.max(Number(args.days) || 30, 1), 730);
        const rows = await this.dashboardService.saleTrend(days);
        return { type: 'data', data: { days, items: rows } };
      },
    };
  }

  /** 热销商品 TOP N */
  private queryTopProducts(): AgentTool {
    return {
      name: 'query_top_products',
      description: '查询热销商品排行榜（按销售出库数量排序）。返回商品名称、出库数量、销售金额。可用于回答"哪些商品卖得好/销量最高"类问题。',
      schema: {
        type: 'object',
        properties: { limit: { type: 'number', description: '返回条数，默认 10，最大 20' } },
        additionalProperties: false,
      },
      kind: 'read',
      requiredPermission: 'dashboard',
      handler: async (_ctx, args) => {
        const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
        const rows = await this.dashboardService.topProducts(limit);
        return { type: 'data', data: { count: rows.length, items: rows } };
      },
    };
  }

  /** 最近采购/销售单据 */
  private queryRecentOrders(): AgentTool {
    return {
      name: 'query_recent_orders',
      description: '查询最近的采购与销售单据（按日期倒序合并）。返回单据类型（采购/销售）、单号、往来单位、金额、状态、日期。',
      schema: {
        type: 'object',
        properties: { limit: { type: 'number', description: '返回条数，默认 8，最大 20' } },
        additionalProperties: false,
      },
      kind: 'read',
      requiredPermission: 'dashboard',
      handler: async (_ctx, args) => {
        const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 20);
        const rows = await this.dashboardService.recentOrders(limit);
        return { type: 'data', data: { count: rows.length, items: rows } };
      },
    };
  }

  /** 销售订单列表 */
  private querySaleOrders(): AgentTool {
    return {
      name: 'query_sale_orders',
      description:
        '查询销售订单列表。可按客户名称/单号关键字筛选，可按状态（draft草稿/confirmed已确认/outbound已出库/cancelled已取消）筛选，支持分页。返回单号、客户、金额、状态、日期。',
      schema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '单号或客户名称关键字，可选' },
          status: { type: 'string', description: '订单状态：draft/confirmed/outbound/cancelled，可选' },
          page: { type: 'number', description: '页码，默认 1' },
          pageSize: { type: 'number', description: '每页条数，默认 10，最大 50' },
        },
        additionalProperties: false,
      },
      kind: 'read',
      requiredPermission: 'sale:order:view',
      handler: async (_ctx, args) => {
        const pageNum = Math.max(Number(args.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(args.pageSize) || 10, 1), 50);
        const page = await this.saleOrdersService.list({
          page: pageNum,
          pageSize,
          keyword: typeof args.keyword === 'string' && args.keyword ? args.keyword : undefined,
          status: typeof args.status === 'string' && args.status ? args.status : undefined,
        });
        return { type: 'data', data: { count: page.total, items: page.list } };
      },
    };
  }

  /** 销售出库单列表 */
  private querySaleOutbounds(): AgentTool {
    return {
      name: 'query_sale_outbounds',
      description:
        '查询销售出库单列表。可按出库单号/客户名称关键字筛选，支持分页。返回出库单号、客户、金额、出库日期。',
      schema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '出库单号或客户名称关键字，可选' },
          page: { type: 'number', description: '页码，默认 1' },
          pageSize: { type: 'number', description: '每页条数，默认 10，最大 50' },
        },
        additionalProperties: false,
      },
      kind: 'read',
      requiredPermission: 'sale:outbound:view',
      handler: async (_ctx, args) => {
        const pageNum = Math.max(Number(args.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(args.pageSize) || 10, 1), 50);
        const page = await this.saleOutboundsService.list({
          page: pageNum,
          pageSize,
          keyword: typeof args.keyword === 'string' && args.keyword ? args.keyword : undefined,
        });
        return { type: 'data', data: { count: page.total, items: page.list } };
      },
    };
  }

  // ==================== 销售订单写操作 ====================

  /** 创建销售订单 */
  private createSaleOrder(): AgentTool {
    return {
      name: 'create_sale_order',
      description:
        '创建销售订单（草稿状态）。需要客户ID（customerId）和商品明细（items：商品ID+数量，单价可不传则用商品销售价）。生成操作提案，必须用户确认后创建。执行前请先用 query_customers 和 query_products 确认ID。',
      schema: {
        type: 'object',
        properties: {
          customerId: { type: 'number', description: '客户ID' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                productId: { type: 'number', description: '商品ID' },
                quantity: { type: 'number', description: '销售数量，必须大于 0' },
                price: { type: 'number', description: '单价，可选，缺省用商品销售价' },
              },
              required: ['productId', 'quantity'],
              additionalProperties: false,
            },
            description: '销售商品明细',
          },
          remark: { type: 'string', description: '备注，可选' },
        },
        required: ['customerId', 'items'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'sale:order:create',
      handler: async (ctx, args, mode) => {
        const customerId = Number(args.customerId);
        const rawItems = Array.isArray(args.items) ? args.items : [];
        if (!Number.isFinite(customerId) || customerId <= 0) throw new BusinessException('客户ID无效');
        if (!rawItems.length) throw new BusinessException('销售明细不能为空');

        const customer = await this.customerRepo.findOne({
          where: { id: customerId, companyId: ctx.companyId, status: 1 },
        });
        if (!customer) throw new BusinessException('客户不存在或已停用', 40028);

        const items = rawItems.map((it) => {
          const row = it as Record<string, unknown>;
          const productId = Number(row.productId);
          const quantity = Number(row.quantity);
          if (!Number.isFinite(productId) || productId <= 0) throw new BusinessException('商品ID无效');
          if (!Number.isFinite(quantity) || quantity <= 0) throw new BusinessException('销售数量必须大于 0');
          const price = row.price == null || row.price === '' ? undefined : Number(row.price);
          return { productId, quantity, price };
        });

        const productIds = [...new Set(items.map((i) => i.productId))];
        const products = await this.productRepo.find({
          where: { id: In(productIds), companyId: ctx.companyId, status: 1 },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));
        const lines = items.map((i) => {
          const product = productMap.get(i.productId);
          if (!product) throw new BusinessException(`商品 ID ${i.productId} 不存在或已停用`, 40019);
          const price =
            i.price == null || !Number.isFinite(i.price) || i.price < 0 ? product.salePrice : round2(i.price);
          return {
            productId: product.id,
            name: product.name,
            quantity: i.quantity,
            price,
            amount: round2(i.quantity * price),
          };
        });
        const total = round2(lines.reduce((s, l) => s + l.amount, 0));

        const params = {
          customerId: customer.id,
          orderDate: todayLocal(),
          remark: typeof args.remark === 'string' && args.remark ? args.remark : undefined,
          items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, price: l.price })),
        };

        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '创建销售订单',
            rows: [
              { label: '客户', value: customer.name },
              { label: '明细', value: lines.map((l) => `${l.name}×${l.quantity}`).join('、') },
              { label: '预计金额', value: `¥${total.toFixed(2)}` },
            ],
          };
          return { type: 'propose', params, preview };
        }
        const order = await this.saleOrdersService.create(params);
        return {
          type: 'data',
          data: { ok: true, id: order.id, orderNo: order.orderNo, totalAmount: order.totalAmount, status: order.status },
        };
      },
    };
  }

  /** 确认销售订单 */
  private confirmSaleOrder(): AgentTool {
    return {
      name: 'confirm_sale_order',
      description:
        '确认销售订单（草稿 → 已确认）。只有草稿状态的订单可确认，且必须有明细。生成操作提案，必须用户确认后执行。',
      schema: {
        type: 'object',
        properties: { orderId: { type: 'number', description: '销售订单ID' } },
        required: ['orderId'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'sale:order:confirm',
      handler: async (ctx, args, mode) => {
        const orderId = Number(args.orderId);
        if (!Number.isFinite(orderId) || orderId <= 0) throw new BusinessException('订单ID无效');
        const order = await this.saleOrdersService.detail(orderId).catch(() => null);
        if (!order) throw new BusinessException('销售订单不存在', 40407);
        if (order.status !== 'draft') throw new BusinessException('仅草稿状态的订单可确认', 40031);

        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '确认销售订单',
            rows: [
              { label: '单号', value: order.orderNo },
              { label: '客户', value: order.customerName },
              { label: '金额', value: `¥${order.totalAmount.toFixed(2)}` },
              { label: '操作', value: '确认后订单生效，可进行出库' },
            ],
          };
          return { type: 'propose', params: { orderId }, preview };
        }
        await this.saleOrdersService.confirm(orderId);
        return { type: 'data', data: { ok: true, orderId, orderNo: order.orderNo, status: 'confirmed' } };
      },
    };
  }

  /** 取消销售订单 */
  private cancelSaleOrder(): AgentTool {
    return {
      name: 'cancel_sale_order',
      description:
        '取消销售订单。仅草稿或已确认状态的订单可取消。生成操作提案，必须用户确认后执行。',
      schema: {
        type: 'object',
        properties: { orderId: { type: 'number', description: '销售订单ID' } },
        required: ['orderId'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'sale:order:cancel',
      handler: async (ctx, args, mode) => {
        const orderId = Number(args.orderId);
        if (!Number.isFinite(orderId) || orderId <= 0) throw new BusinessException('订单ID无效');
        const order = await this.saleOrdersService.detail(orderId).catch(() => null);
        if (!order) throw new BusinessException('销售订单不存在', 40407);
        if (!['draft', 'confirmed'].includes(order.status)) {
          throw new BusinessException('当前状态不可取消', 40033);
        }

        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '取消销售订单',
            rows: [
              { label: '单号', value: order.orderNo },
              { label: '客户', value: order.customerName },
              { label: '金额', value: `¥${order.totalAmount.toFixed(2)}` },
              { label: '操作', value: '取消后订单失效' },
            ],
          };
          return { type: 'propose', params: { orderId }, preview };
        }
        await this.saleOrdersService.cancel(orderId);
        return { type: 'data', data: { ok: true, orderId, orderNo: order.orderNo, status: 'cancelled' } };
      },
    };
  }

  /** 删除销售订单（仅草稿） */
  private removeSaleOrder(): AgentTool {
    return {
      name: 'remove_sale_order',
      description:
        '删除销售订单。仅草稿状态的订单可删除，已确认/已出库的订单不能删除。生成操作提案，必须用户确认后执行。',
      schema: {
        type: 'object',
        properties: { orderId: { type: 'number', description: '销售订单ID' } },
        required: ['orderId'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'sale:order:delete',
      handler: async (ctx, args, mode) => {
        const orderId = Number(args.orderId);
        if (!Number.isFinite(orderId) || orderId <= 0) throw new BusinessException('订单ID无效');
        const order = await this.saleOrdersService.detail(orderId).catch(() => null);
        if (!order) throw new BusinessException('销售订单不存在', 40407);
        if (order.status !== 'draft') throw new BusinessException('仅草稿状态的订单可删除', 40030);

        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '删除销售订单',
            rows: [
              { label: '单号', value: order.orderNo },
              { label: '客户', value: order.customerName },
              { label: '金额', value: `¥${order.totalAmount.toFixed(2)}` },
              { label: '操作', value: '删除后不可恢复' },
            ],
          };
          return { type: 'propose', params: { orderId }, preview };
        }
        await this.saleOrdersService.remove(orderId);
        return { type: 'data', data: { ok: true, orderId, orderNo: order.orderNo } };
      },
    };
  }

  /** 销售出库 */
  private outboundSaleOrder(): AgentTool {
    return {
      name: 'outbound_sale_order',
      description:
        '销售出库：将已确认的销售订单出库，自动扣减商品库存并生成出库单。仅已确认订单可出库；库存不足会被拒绝（防超卖）。生成操作提案，必须用户确认后执行。',
      schema: {
        type: 'object',
        properties: { orderId: { type: 'number', description: '销售订单ID' } },
        required: ['orderId'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'sale:order:outbound',
      handler: async (ctx, args, mode) => {
        const orderId = Number(args.orderId);
        if (!Number.isFinite(orderId) || orderId <= 0) throw new BusinessException('订单ID无效');
        const order = await this.saleOrdersService.detail(orderId).catch(() => null);
        if (!order) throw new BusinessException('销售订单不存在', 40407);
        if (order.status !== 'confirmed') throw new BusinessException('仅已确认的订单可出库', 40034);

        if (mode === 'propose') {
          const rows = [
            { label: '单号', value: order.orderNo },
            { label: '客户', value: order.customerName },
            { label: '金额', value: `¥${order.totalAmount.toFixed(2)}` },
            { label: '明细', value: (order.items ?? []).map((i) => `${i.productName}×${i.quantity}`).join('、') },
          ];
          const preview: PreviewCard = {
            title: '销售出库',
            rows,
          };
          return { type: 'propose', params: { orderId }, preview };
        }
        const result = await this.saleOrdersService.outbound(orderId);
        return { type: 'data', data: { ok: true, orderId, orderNo: order.orderNo, ...result, status: 'outbound' } };
      },
    };
  }
}
