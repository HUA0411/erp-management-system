import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ToolRegistryService } from '../tool-registry.service';
import { InventoryService } from '../../inventory/inventory.service';
import { StocktakesService } from '../../inventory/stocktakes.service';
import { PurchaseOrdersService } from '../../purchase/purchase-orders.service';
import { PurchaseInboundsService } from '../../purchase/purchase-inbounds.service';
import { InventoryEntity } from '../../entities/inventory.entity';
import { ProductEntity } from '../../entities/product.entity';
import { SupplierEntity } from '../../entities/partner.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { round2, todayLocal } from '../../common/utils/no-generator';
import type { AgentTool, PreviewCard, ToolContext } from '../agent-tool';

/**
 * 库存域工具包：一个业务模块 = 一个工具包文件 + 注册，即"万物皆可插件"。
 * 所有读写都复用现有 service（事务、FOR UPDATE、超卖校验、审计全部继承）。
 */
@Injectable()
export class InventoryAgentTools implements OnModuleInit {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly inventoryService: InventoryService,
    private readonly stocktakesService: StocktakesService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly purchaseInboundsService: PurchaseInboundsService,
    @InjectRepository(InventoryEntity) private readonly inventoryRepo: Repository<InventoryEntity>,
    @InjectRepository(ProductEntity) private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(SupplierEntity) private readonly supplierRepo: Repository<SupplierEntity>,
  ) {}

  onModuleInit(): void {
    this.registry.register([
      this.queryLowStock(),
      this.queryInventory(),
      this.queryProductStock(),
      this.queryStockRecords(),
      this.queryProducts(),
      this.querySuppliers(),
      this.queryPurchaseOrders(),
      this.queryPurchaseInbounds(),
      this.adjustStock(),
      this.createPurchaseOrder(),
      this.confirmPurchaseOrder(),
      this.cancelPurchaseOrder(),
      this.warehousePurchaseOrder(),
      this.createStocktake(),
      this.confirmStocktake(),
    ]);
  }

  /** 缺货列表（缺货汇报的数据源） */
  private queryLowStock(): AgentTool {
    return {
      name: 'query_low_stock',
      description:
        '查询当前低于安全库存的商品列表（缺货预警）。返回每个商品的编码、名称、当前库存、安全库存、单位、缺口数量。',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      kind: 'read',
      requiredPermission: 'inventory:alert:view',
      handler: async () => {
        const list = await this.inventoryService.alerts();
        return {
          type: 'data',
          data: {
            count: list.length,
            items: list.slice(0, 50).map((i) => ({
              productId: i.productId,
              code: i.productCode,
              name: i.productName,
              quantity: i.quantity,
              safetyStock: i.safetyStock,
              unit: i.unit ?? '',
              shortage: round2(i.safetyStock - i.quantity),
            })),
          },
        };
      },
    };
  }

  /** 库存列表（可筛选/只看缺货） */
  private queryInventory(): AgentTool {
    return {
      name: 'query_inventory',
      description:
        '查询商品库存列表（实时数据）。可按商品名称/编码关键字筛选，或只返回缺货商品，支持分页。返回商品编码、名称、当前库存、安全库存、是否缺货。',
      schema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '商品名称或编码关键字，可选' },
          lowOnly: { type: 'boolean', description: '是否只返回缺货商品，可选' },
          page: { type: 'number', description: '页码，默认 1' },
          pageSize: { type: 'number', description: '每页条数，默认 50，最大 100' },
        },
        additionalProperties: false,
      },
      kind: 'read',
      requiredPermission: 'inventory:current:view',
      handler: async (_ctx, args) => {
        const pageNum = Math.max(Number(args.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(args.pageSize) || 50, 1), 100);
        const page = await this.inventoryService.current({
          page: pageNum,
          pageSize,
          keyword:
            typeof args.keyword === 'string' && args.keyword ? args.keyword : undefined,
          lowOnly: args.lowOnly === true,
        });
        return { type: 'data', data: { count: page.total, items: page.list } };
      },
    };
  }

  /** 单个商品实时库存 */
  private queryProductStock(): AgentTool {
    return {
      name: 'query_product_stock',
      description:
        '查询单个商品的最新实时库存。可按商品ID或商品名称查询。返回当前库存、安全库存、是否缺货。',
      schema: {
        type: 'object',
        properties: {
          productId: { type: 'number', description: '商品ID，可选' },
          name: { type: 'string', description: '商品名称（模糊匹配），可选' },
        },
        additionalProperties: false,
      },
      kind: 'read',
      requiredPermission: 'inventory:current:view',
      handler: async (ctx, args) => {
        let keyword: string | undefined;
        if (typeof args.productId === 'number' && args.productId > 0) {
          const p = await this.productRepo.findOne({
            where: { id: args.productId, companyId: ctx.companyId },
          });
          if (!p) return { type: 'data', data: { count: 0, items: [] } };
          keyword = p.name;
        } else if (typeof args.name === 'string' && args.name) {
          keyword = args.name;
        }
        if (!keyword) return { type: 'data', data: { count: 0, items: [] } };
        const page = await this.inventoryService.current({ page: 1, pageSize: 10, keyword });
        return { type: 'data', data: { count: page.total, items: page.list } };
      },
    };
  }

  /** 库存流水 */
  private queryStockRecords(): AgentTool {
    return {
      name: 'query_stock_records',
      description:
        '查询库存流水（最近变动记录）。可按商品名称关键字筛选，支持分页。返回变动类型（入库/出库/调整/盘点）、数量、变动后结余、来源单号、时间。',
      schema: {
        type: 'object',
        properties: {
          productName: { type: 'string', description: '商品名称关键字，可选' },
          page: { type: 'number', description: '页码，默认 1' },
          pageSize: { type: 'number', description: '每页条数，默认 20，最大 100' },
        },
        additionalProperties: false,
      },
      kind: 'read',
      requiredPermission: 'inventory:record:view',
      handler: async (_ctx, args) => {
        const pageNum = Math.max(Number(args.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(args.pageSize) || 20, 1), 100);
        const page = await this.inventoryService.records({
          page: pageNum,
          pageSize,
          keyword:
            typeof args.productName === 'string' && args.productName
              ? args.productName
              : undefined,
        });
        return { type: 'data', data: { count: page.total, items: page.list } };
      },
    };
  }

  /** 商品基础资料（供模型选品，防幻觉 ID） */
  private queryProducts(): AgentTool {
    return {
      name: 'query_products',
      description:
        '查询商品基础资料（启用中）。可按名称/编码关键字筛选，支持分页。返回商品ID、编码、名称、规格、单位、采购价、销售价、安全库存。执行写操作前应先调用本工具确认商品ID。',
      schema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '名称或编码关键字，可选' },
          page: { type: 'number', description: '页码，默认 1' },
          pageSize: { type: 'number', description: '每页条数，默认 50，最大 100' },
        },
        additionalProperties: false,
      },
      kind: 'read',
      requiredPermission: 'base:product',
      handler: async (ctx, args) => {
        const pageNum = Math.max(Number(args.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(args.pageSize) || 50, 1), 100);
        const qb = this.productRepo
          .createQueryBuilder('p')
          .where('p.company_id = :cid', { cid: ctx.companyId })
          .andWhere('p.status = 1')
          .orderBy('p.id', 'ASC')
          .skip((pageNum - 1) * pageSize)
          .take(pageSize);
        if (typeof args.keyword === 'string' && args.keyword) {
          qb.andWhere('(p.name LIKE :kw OR p.code LIKE :kw)', { kw: `%${args.keyword}%` });
        }
        const [rows, total] = await qb.getManyAndCount();
        // 供应商名（默认供应商信息）
        const supplierIds = [...new Set(rows.map((p) => p.supplierId).filter((v): v is number => !!v))];
        const suppliers = supplierIds.length
          ? await this.supplierRepo.find({ where: { id: In(supplierIds) } })
          : [];
        const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
        return {
          type: 'data',
          data: {
            count: total,
            items: rows.map((p) => ({
              id: p.id,
              code: p.code,
              name: p.name,
              spec: p.spec ?? undefined,
              unit: p.unit ?? undefined,
              purchasePrice: p.purchasePrice,
              salePrice: p.salePrice,
              safetyStock: p.safetyStock,
              supplierId: p.supplierId ?? undefined,
              supplierName: p.supplierId ? supplierMap.get(p.supplierId) : undefined,
            })),
          },
        };
      },
    };
  }

  /** 供应商列表（建采购单前置） */
  private querySuppliers(): AgentTool {
    return {
      name: 'query_suppliers',
      description:
        '查询供应商列表（启用中）。可按名称/编码关键字筛选，支持分页。返回供应商ID、编码、名称、联系人、电话。创建采购订单前应先调用本工具确认供应商ID。',
      schema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '名称或编码关键字，可选' },
          page: { type: 'number', description: '页码，默认 1' },
          pageSize: { type: 'number', description: '每页条数，默认 50，最大 100' },
        },
        additionalProperties: false,
      },
      kind: 'read',
      requiredPermission: 'base:supplier',
      handler: async (ctx, args) => {
        const pageNum = Math.max(Number(args.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(args.pageSize) || 50, 1), 100);
        const qb = this.supplierRepo
          .createQueryBuilder('s')
          .where('s.company_id = :cid', { cid: ctx.companyId })
          .andWhere('s.status = 1')
          .orderBy('s.id', 'ASC')
          .skip((pageNum - 1) * pageSize)
          .take(pageSize);
        if (typeof args.keyword === 'string' && args.keyword) {
          qb.andWhere('(s.name LIKE :kw OR s.code LIKE :kw)', { kw: `%${args.keyword}%` });
        }
        const [rows, total] = await qb.getManyAndCount();
        return {
          type: 'data',
          data: {
            count: total,
            items: rows.map((s) => ({
              id: s.id,
              code: s.code,
              name: s.name,
              contact: s.contact ?? undefined,
              phone: s.phone ?? undefined,
            })),
          },
        };
      },
    };
  }

  /** 采购订单列表 */
  private queryPurchaseOrders(): AgentTool {
    return {
      name: 'query_purchase_orders',
      description:
        '查询采购订单列表。可按供应商名称/单号关键字筛选，可按状态（draft草稿/confirmed已确认/warehoused已入库/cancelled已取消）筛选，支持分页。返回单号、供应商、金额、状态、日期。',
      schema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '单号或供应商名称关键字，可选' },
          status: { type: 'string', description: '订单状态：draft/confirmed/warehoused/cancelled，可选' },
          page: { type: 'number', description: '页码，默认 1' },
          pageSize: { type: 'number', description: '每页条数，默认 10，最大 50' },
        },
        additionalProperties: false,
      },
      kind: 'read',
      requiredPermission: 'purchase:order:view',
      handler: async (_ctx, args) => {
        const pageNum = Math.max(Number(args.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(args.pageSize) || 10, 1), 50);
        const page = await this.purchaseOrdersService.list({
          page: pageNum,
          pageSize,
          keyword: typeof args.keyword === 'string' && args.keyword ? args.keyword : undefined,
          status: typeof args.status === 'string' && args.status ? args.status : undefined,
        });
        return { type: 'data', data: { count: page.total, items: page.list } };
      },
    };
  }

  /** 采购入库单列表 */
  private queryPurchaseInbounds(): AgentTool {
    return {
      name: 'query_purchase_inbounds',
      description:
        '查询采购入库单列表。可按入库单号/供应商名称关键字筛选，支持分页。返回入库单号、供应商、金额、入库日期。',
      schema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '入库单号或供应商名称关键字，可选' },
          page: { type: 'number', description: '页码，默认 1' },
          pageSize: { type: 'number', description: '每页条数，默认 10，最大 50' },
        },
        additionalProperties: false,
      },
      kind: 'read',
      requiredPermission: 'purchase:inbound:view',
      handler: async (_ctx, args) => {
        const pageNum = Math.max(Number(args.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(args.pageSize) || 10, 1), 50);
        const page = await this.purchaseInboundsService.list({
          page: pageNum,
          pageSize,
          keyword: typeof args.keyword === 'string' && args.keyword ? args.keyword : undefined,
        });
        return { type: 'data', data: { count: page.total, items: page.list } };
      },
    };
  }

  /** 库存调整（写：先提案后确认） */
  private adjustStock(): AgentTool {
    return {
      name: 'adjust_stock',
      description:
        '调整（补充/扣减）某商品的库存数量。delta 为正数表示增加库存，负数表示减少。本工具只生成操作提案，必须由用户确认后才真正执行。执行前请先用 query_products 确认商品ID。',
      schema: {
        type: 'object',
        properties: {
          productId: { type: 'number', description: '商品ID' },
          delta: { type: 'number', description: '库存调整量，正数增加、负数减少，不能为 0' },
          remark: { type: 'string', description: '调整原因备注，可选' },
        },
        required: ['productId', 'delta'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'inventory:adjust',
      handler: async (ctx, args, mode) => {
        const productId = Number(args.productId);
        const delta = Number(args.delta);
        if (!Number.isFinite(productId) || productId <= 0) {
          throw new BusinessException('商品ID无效');
        }
        if (!Number.isFinite(delta) || delta === 0) {
          throw new BusinessException('调整量不能为 0');
        }
        const product = await this.productRepo.findOne({
          where: { id: productId, companyId: ctx.companyId },
        });
        if (!product) throw new BusinessException('商品不存在', 40403);

        if (mode === 'propose') {
          const current = await this.currentQuantity(ctx.companyId, productId);
          const after = round2(current + delta);
          const preview: PreviewCard = {
            title: '库存调整',
            rows: [
              { label: '商品', value: `${product.name}（${product.code}）` },
              { label: '当前库存', value: String(current) },
              { label: '调整量', value: `${delta > 0 ? '+' : ''}${delta}` },
              { label: '调整后库存', value: String(after) },
              ...(typeof args.remark === 'string' && args.remark
                ? [{ label: '备注', value: args.remark }]
                : []),
            ],
          };
          return {
            type: 'propose',
            params: { productId, delta, remark: args.remark },
            preview,
          };
        }

        const result = await this.inventoryService.adjust(
          productId,
          delta,
          typeof args.remark === 'string' ? args.remark : undefined,
        );
        return {
          type: 'data',
          data: { ok: true, productId, delta, balanceAfter: result.balanceAfter },
        };
      },
    };
  }

  /** 创建采购订单（写：先提案后确认） */
  private createPurchaseOrder(): AgentTool {
    return {
      name: 'create_purchase_order',
      description:
        '创建采购订单（草稿状态）。需要供应商ID和商品明细（商品ID+数量，单价可不传则用商品采购价）。注意：本系统商品与供应商没有固定绑定关系，采购时按需自由组合供应商和商品；若商品配置了默认供应商（可通过 query_products 查看 supplierName），可优先选择该供应商，也可指定其他供应商或更换。本工具只生成操作提案，必须由用户确认后才真正创建。执行前请先用 query_products 和 query_suppliers 确认ID。',
      schema: {
        type: 'object',
        properties: {
          supplierId: { type: 'number', description: '供应商ID' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                productId: { type: 'number', description: '商品ID' },
                quantity: { type: 'number', description: '采购数量，必须大于 0' },
                price: { type: 'number', description: '单价，可选，缺省用商品采购价' },
              },
              required: ['productId', 'quantity'],
              additionalProperties: false,
            },
            description: '采购商品明细',
          },
          remark: { type: 'string', description: '备注，可选' },
        },
        required: ['supplierId', 'items'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'purchase:order:create',
      handler: async (ctx, args, mode) => {
        const supplierId = Number(args.supplierId);
        const rawItems = Array.isArray(args.items) ? args.items : [];
        if (!Number.isFinite(supplierId) || supplierId <= 0) {
          throw new BusinessException('供应商ID无效');
        }
        if (!rawItems.length) throw new BusinessException('采购明细不能为空');

        const supplier = await this.supplierRepo.findOne({
          where: { id: supplierId, companyId: ctx.companyId, status: 1 },
        });
        if (!supplier) throw new BusinessException('供应商不存在或已停用', 40018);

        const items = rawItems.map((it) => {
          const row = it as Record<string, unknown>;
          const productId = Number(row.productId);
          const quantity = Number(row.quantity);
          if (!Number.isFinite(productId) || productId <= 0) {
            throw new BusinessException('商品ID无效');
          }
          if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new BusinessException('采购数量必须大于 0');
          }
          const price =
            row.price == null || row.price === '' ? undefined : Number(row.price);
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
            i.price == null || !Number.isFinite(i.price) || i.price < 0
              ? product.purchasePrice
              : round2(i.price);
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
          supplierId: supplier.id,
          orderDate: todayLocal(),
          remark:
            typeof args.remark === 'string' && args.remark ? args.remark : undefined,
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            price: l.price,
          })),
        };

        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '创建采购订单',
            rows: [
              { label: '供应商', value: supplier.name },
              { label: '明细', value: lines.map((l) => `${l.name}×${l.quantity}`).join('、') },
              { label: '预计金额', value: `¥${total.toFixed(2)}` },
            ],
          };
          return { type: 'propose', params, preview };
        }

        const order = await this.purchaseOrdersService.create(params);
        return {
          type: 'data',
          data: {
            ok: true,
            id: order.id,
            orderNo: order.orderNo,
            totalAmount: order.totalAmount,
            status: order.status,
          },
        };
      },
    };
  }

  private async currentQuantity(companyId: number, productId: number): Promise<number> {
    const inv = await this.inventoryRepo.findOne({ where: { companyId, productId } });
    return inv?.quantity ?? 0;
  }

  // ==================== 采购订单写操作 ====================

  /** 确认采购订单 */
  private confirmPurchaseOrder(): AgentTool {
    return {
      name: 'confirm_purchase_order',
      description:
        '确认采购订单（草稿 → 已确认）。仅草稿状态且有明细的订单可确认。生成操作提案，必须用户确认后执行。',
      schema: {
        type: 'object',
        properties: { orderId: { type: 'number', description: '采购订单ID' } },
        required: ['orderId'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'purchase:order:confirm',
      handler: async (ctx, args, mode) => {
        const orderId = Number(args.orderId);
        if (!Number.isFinite(orderId) || orderId <= 0) throw new BusinessException('订单ID无效');
        const order = await this.purchaseOrdersService.detail(orderId).catch(() => null);
        if (!order) throw new BusinessException('采购订单不存在', 40406);
        if (order.status !== 'draft') throw new BusinessException('仅草稿状态可确认', 40023);

        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '确认采购订单',
            rows: [
              { label: '单号', value: order.orderNo },
              { label: '供应商', value: order.supplierName },
              { label: '金额', value: `¥${order.totalAmount.toFixed(2)}` },
              { label: '操作', value: '确认后订单生效，可进行入库' },
            ],
          };
          return { type: 'propose', params: { orderId }, preview };
        }
        await this.purchaseOrdersService.confirm(orderId);
        return { type: 'data', data: { ok: true, orderId, orderNo: order.orderNo, status: 'confirmed' } };
      },
    };
  }

  /** 取消采购订单 */
  private cancelPurchaseOrder(): AgentTool {
    return {
      name: 'cancel_purchase_order',
      description:
        '取消采购订单。仅草稿或已确认状态的订单可取消。生成操作提案，必须用户确认后执行。',
      schema: {
        type: 'object',
        properties: { orderId: { type: 'number', description: '采购订单ID' } },
        required: ['orderId'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'purchase:order:cancel',
      handler: async (ctx, args, mode) => {
        const orderId = Number(args.orderId);
        if (!Number.isFinite(orderId) || orderId <= 0) throw new BusinessException('订单ID无效');
        const order = await this.purchaseOrdersService.detail(orderId).catch(() => null);
        if (!order) throw new BusinessException('采购订单不存在', 40406);
        if (!['draft', 'confirmed'].includes(order.status)) {
          throw new BusinessException('当前状态不可取消', 40025);
        }

        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '取消采购订单',
            rows: [
              { label: '单号', value: order.orderNo },
              { label: '供应商', value: order.supplierName },
              { label: '金额', value: `¥${order.totalAmount.toFixed(2)}` },
              { label: '操作', value: '取消后订单失效' },
            ],
          };
          return { type: 'propose', params: { orderId }, preview };
        }
        await this.purchaseOrdersService.cancel(orderId);
        return { type: 'data', data: { ok: true, orderId, orderNo: order.orderNo, status: 'cancelled' } };
      },
    };
  }

  /** 采购入库 */
  private warehousePurchaseOrder(): AgentTool {
    return {
      name: 'warehouse_purchase_order',
      description:
        '采购入库：将已确认的采购订单入库，自动增加商品库存并生成入库单。仅已确认订单可入库。生成操作提案，必须用户确认后执行。',
      schema: {
        type: 'object',
        properties: { orderId: { type: 'number', description: '采购订单ID' } },
        required: ['orderId'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'purchase:order:inbound',
      handler: async (ctx, args, mode) => {
        const orderId = Number(args.orderId);
        if (!Number.isFinite(orderId) || orderId <= 0) throw new BusinessException('订单ID无效');
        const order = await this.purchaseOrdersService.detail(orderId).catch(() => null);
        if (!order) throw new BusinessException('采购订单不存在', 40406);
        if (order.status !== 'confirmed') throw new BusinessException('仅已确认的订单可入库', 40026);

        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '采购入库',
            rows: [
              { label: '单号', value: order.orderNo },
              { label: '供应商', value: order.supplierName },
              { label: '金额', value: `¥${order.totalAmount.toFixed(2)}` },
              { label: '明细', value: (order.items ?? []).map((i) => `${i.productName}×${i.quantity}`).join('、') },
            ],
          };
          return { type: 'propose', params: { orderId }, preview };
        }
        const result = await this.purchaseOrdersService.warehouse(orderId);
        return { type: 'data', data: { ok: true, orderId, orderNo: order.orderNo, ...result, status: 'warehoused' } };
      },
    };
  }

  // ==================== 库存盘点 ====================

  /** 新建盘点单 */
  private createStocktake(): AgentTool {
    return {
      name: 'create_stocktake',
      description:
        '新建库存盘点单（草稿）。需要盘点商品明细（items：商品ID+实盘数量 actualQty）。系统自动对比账面库存计算差异。生成操作提案，必须用户确认后创建。执行前请先用 query_products 确认商品ID。',
      schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                productId: { type: 'number', description: '商品ID' },
                actualQty: { type: 'number', description: '实盘数量（盘点的实际数量），不能小于 0' },
              },
              required: ['productId', 'actualQty'],
              additionalProperties: false,
            },
            description: '盘点商品明细',
          },
          remark: { type: 'string', description: '备注，可选' },
        },
        required: ['items'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'inventory:stocktake:create',
      handler: async (ctx, args, mode) => {
        const rawItems = Array.isArray(args.items) ? args.items : [];
        if (!rawItems.length) throw new BusinessException('盘点明细不能为空');

        const items = rawItems.map((it) => {
          const row = it as Record<string, unknown>;
          const productId = Number(row.productId);
          const actualQty = Number(row.actualQty);
          if (!Number.isFinite(productId) || productId <= 0) throw new BusinessException('商品ID无效');
          if (!Number.isFinite(actualQty) || actualQty < 0) throw new BusinessException('实盘数量不能小于 0');
          return { productId, actualQty };
        });

        // 校验商品并计算差异（预览用）
        const productIds = [...new Set(items.map((i) => i.productId))];
        const products = await this.productRepo.find({
          where: { id: In(productIds), companyId: ctx.companyId, status: 1 },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));
        const previewRows = await Promise.all(
          items.map(async (i) => {
            const product = productMap.get(i.productId);
            if (!product) throw new BusinessException(`商品 ID ${i.productId} 不存在或已停用`, 40019);
            const book = await this.currentQuantity(ctx.companyId, i.productId);
            return {
              label: product.name,
              value: `账面 ${book} → 实盘 ${i.actualQty}（差异 ${round2(i.actualQty - book)}）`,
            };
          }),
        );

        const params = {
          remark: typeof args.remark === 'string' && args.remark ? args.remark : undefined,
          items,
        };
        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '新建盘点单',
            rows: [{ label: '盘点商品', value: `${items.length} 个` }, ...previewRows],
          };
          return { type: 'propose', params, preview };
        }
        const stocktake = await this.stocktakesService.create(params);
        return {
          type: 'data',
          data: { ok: true, id: stocktake.id, stocktakeNo: stocktake.stocktakeNo, status: stocktake.status },
        };
      },
    };
  }

  /** 确认盘点单 */
  private confirmStocktake(): AgentTool {
    return {
      name: 'confirm_stocktake',
      description:
        '确认库存盘点单：按盘点差异调整库存（差异=实盘-账面，正数补入、负数扣减）。仅草稿状态可确认。生成操作提案，必须用户确认后执行。',
      schema: {
        type: 'object',
        properties: { stocktakeId: { type: 'number', description: '盘点单ID' } },
        required: ['stocktakeId'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'inventory:stocktake:confirm',
      handler: async (ctx, args, mode) => {
        const stocktakeId = Number(args.stocktakeId);
        if (!Number.isFinite(stocktakeId) || stocktakeId <= 0) throw new BusinessException('盘点单ID无效');
        const stocktake = await this.stocktakesService.detail(stocktakeId).catch(() => null);
        if (!stocktake) throw new BusinessException('盘点单不存在', 40410);
        if (stocktake.status !== 'draft') throw new BusinessException('仅草稿状态的盘点单可确认', 40036);

        if (mode === 'propose') {
          const diffRows = stocktake.items
            .filter((i) => i.diffQty !== 0)
            .map((i) => ({
              label: i.productName,
              value: `差异 ${i.diffQty > 0 ? '+' : ''}${i.diffQty}`,
            }));
          const preview: PreviewCard = {
            title: '确认盘点单',
            rows: [
              { label: '单号', value: stocktake.stocktakeNo },
              ...(diffRows.length
                ? diffRows
                : [{ label: '差异', value: '无差异，确认后不改动库存' }]),
              { label: '操作', value: '确认后按差异调整库存' },
            ],
          };
          return { type: 'propose', params: { stocktakeId }, preview };
        }
        await this.stocktakesService.confirm(stocktakeId);
        return { type: 'data', data: { ok: true, stocktakeId, stocktakeNo: stocktake.stocktakeNo, status: 'confirmed' } };
      },
    };
  }
}
