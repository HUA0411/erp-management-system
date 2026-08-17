import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ToolRegistryService } from '../tool-registry.service';
import { ProductsService } from '../../products/products.service';
import { SuppliersService } from '../../suppliers/suppliers.service';
import { CustomersService } from '../../customers/customers.service';
import { ProductEntity } from '../../entities/product.entity';
import { SupplierEntity, CustomerEntity } from '../../entities/partner.entity';
import { InventoryEntity } from '../../entities/inventory.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { AgentTool, PreviewCard } from '../agent-tool';

/** 基础资料工具包：商品 / 供应商 / 客户的增删改（写操作全部走提案确认） */
@Injectable()
export class BaseAgentTools implements OnModuleInit {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly productsService: ProductsService,
    private readonly suppliersService: SuppliersService,
    private readonly customersService: CustomersService,
    @InjectRepository(ProductEntity) private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(SupplierEntity) private readonly supplierRepo: Repository<SupplierEntity>,
    @InjectRepository(CustomerEntity) private readonly customerRepo: Repository<CustomerEntity>,
    @InjectRepository(InventoryEntity) private readonly inventoryRepo: Repository<InventoryEntity>,
  ) {}

  onModuleInit(): void {
    this.registry.register([
      this.queryCustomers(),
      this.createProduct(),
      this.updateProduct(),
      this.removeProduct(),
      this.createSupplier(),
      this.updateSupplier(),
      this.removeSupplier(),
      this.createCustomer(),
      this.updateCustomer(),
      this.removeCustomer(),
    ]);
  }

  /** 客户列表（建销售订单前置） */
  private queryCustomers(): AgentTool {
    return {
      name: 'query_customers',
      description:
        '查询客户列表（启用中）。可按名称/编码关键字筛选。返回客户ID、编码、名称、联系人、电话、等级。创建销售订单前应先调用本工具确认客户ID。',
      schema: {
        type: 'object',
        properties: { keyword: { type: 'string', description: '名称或编码关键字，可选' } },
        additionalProperties: false,
      },
      kind: 'read',
      requiredPermission: 'base:customer',
      handler: async (ctx, args) => {
        const pageNum = Math.max(Number(args.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(args.pageSize) || 50, 1), 100);
        const qb = this.customerRepo
          .createQueryBuilder('c')
          .where('c.company_id = :cid', { cid: ctx.companyId })
          .andWhere('c.status = 1')
          .orderBy('c.id', 'ASC')
          .skip((pageNum - 1) * pageSize)
          .take(pageSize);
        if (typeof args.keyword === 'string' && args.keyword) {
          qb.andWhere('(c.name LIKE :kw OR c.code LIKE :kw)', { kw: `%${args.keyword}%` });
        }
        const [rows, total] = await qb.getManyAndCount();
        return {
          type: 'data',
          data: {
            count: total,
            items: rows.map((c) => ({
              id: c.id,
              code: c.code,
              name: c.name,
              contact: c.contact ?? undefined,
              phone: c.phone ?? undefined,
              level: c.level ?? undefined,
            })),
          },
        };
      },
    };
  }

  // ==================== 商品 ====================

  private createProduct(): AgentTool {
    return {
      name: 'create_product',
      description:
        '新增商品。必填：编码（code，唯一）、名称（name）、采购价（purchasePrice）、销售价（salePrice）。可选：分类ID（categoryId）、规格（spec）、单位（unit）、安全库存（safetyStock）、默认供应商ID（supplierId，可后续更换或解除）、备注（remark）。生成操作提案，必须用户确认后创建。',
      schema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '商品编码，唯一' },
          name: { type: 'string', description: '商品名称' },
          categoryId: { type: 'number', description: '分类ID，可选' },
          spec: { type: 'string', description: '规格型号，可选' },
          unit: { type: 'string', description: '单位，可选' },
          purchasePrice: { type: 'number', description: '采购价' },
          salePrice: { type: 'number', description: '销售价' },
          safetyStock: { type: 'number', description: '安全库存，可选，默认 0' },
          supplierId: { type: 'number', description: '默认供应商ID，可选（先查 query_suppliers 获取）' },
          remark: { type: 'string', description: '备注，可选' },
        },
        required: ['code', 'name', 'purchasePrice', 'salePrice'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'product:create',
      handler: async (ctx, args, mode) => {
        const code = String(args.code ?? '').trim();
        const name = String(args.name ?? '').trim();
        if (!code || !name) throw new BusinessException('商品编码与名称为必填');
        const purchasePrice = Number(args.purchasePrice);
        const salePrice = Number(args.salePrice);
        if (!Number.isFinite(purchasePrice) || purchasePrice < 0 || !Number.isFinite(salePrice) || salePrice < 0) {
          throw new BusinessException('采购价/销售价必须为不小于 0 的数字');
        }
        const supplierId = args.supplierId == null ? undefined : Number(args.supplierId);
        let supplierName: string | undefined;
        if (supplierId != null && supplierId > 0) {
          const s = await this.supplierRepo.findOne({ where: { id: supplierId, companyId: ctx.companyId } });
          if (!s) throw new BusinessException('默认供应商不存在', 40404);
          supplierName = s.name;
        }
        const params = {
          code,
          name,
          categoryId: args.categoryId == null ? undefined : Number(args.categoryId),
          spec: typeof args.spec === 'string' ? args.spec : undefined,
          unit: typeof args.unit === 'string' ? args.unit : undefined,
          purchasePrice,
          salePrice,
          safetyStock: args.safetyStock == null ? 0 : Number(args.safetyStock),
          supplierId,
          remark: typeof args.remark === 'string' && args.remark ? args.remark : undefined,
        };
        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '新增商品',
            rows: [
              { label: '编码', value: code },
              { label: '名称', value: name },
              { label: '采购价', value: `¥${purchasePrice.toFixed(2)}` },
              { label: '销售价', value: `¥${salePrice.toFixed(2)}` },
              { label: '安全库存', value: String(params.safetyStock) },
              ...(params.spec ? [{ label: '规格', value: params.spec }] : []),
              ...(params.unit ? [{ label: '单位', value: params.unit }] : []),
              ...(supplierName ? [{ label: '默认供应商', value: supplierName }] : []),
            ],
          };
          return { type: 'propose', params, preview };
        }
        const entity = await this.productsService.create(params);
        return { type: 'data', data: { ok: true, id: entity.id, code: entity.code, name: entity.name } };
      },
    };
  }

  private updateProduct(): AgentTool {
    return {
      name: 'update_product',
      description:
        '编辑商品信息。需要商品ID（productId），可修改：名称、规格、单位、采购价、销售价、安全库存、默认供应商ID（supplierId，传 0 表示解除绑定，可随时更换供应商）、备注、状态（1启用/0停用）。只传需要修改的字段。生成操作提案，必须用户确认后修改。',
      schema: {
        type: 'object',
        properties: {
          productId: { type: 'number', description: '商品ID' },
          name: { type: 'string', description: '名称，可选' },
          spec: { type: 'string', description: '规格，可选' },
          unit: { type: 'string', description: '单位，可选' },
          purchasePrice: { type: 'number', description: '采购价，可选' },
          salePrice: { type: 'number', description: '销售价，可选' },
          safetyStock: { type: 'number', description: '安全库存，可选' },
          supplierId: { type: 'number', description: '默认供应商ID，可选（先查 query_suppliers；传 0 解除绑定）' },
          status: { type: 'number', description: '状态：1启用/0停用，可选' },
          remark: { type: 'string', description: '备注，可选' },
        },
        required: ['productId'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'product:update',
      handler: async (ctx, args, mode) => {
        const productId = Number(args.productId);
        if (!Number.isFinite(productId) || productId <= 0) throw new BusinessException('商品ID无效');
        const product = await this.productRepo.findOne({ where: { id: productId, companyId: ctx.companyId } });
        if (!product) throw new BusinessException('商品不存在', 40403);

        const fields: Array<{ label: string; value: string }> = [];
        const params: Record<string, unknown> = {};
        if (args.name != null) { params.name = String(args.name); fields.push({ label: '名称', value: String(args.name) }); }
        if (args.spec != null) { params.spec = String(args.spec); fields.push({ label: '规格', value: String(args.spec) }); }
        if (args.unit != null) { params.unit = String(args.unit); fields.push({ label: '单位', value: String(args.unit) }); }
        if (args.purchasePrice != null) {
          const v = Number(args.purchasePrice);
          if (!Number.isFinite(v) || v < 0) throw new BusinessException('采购价无效');
          params.purchasePrice = v; fields.push({ label: '采购价', value: `¥${v.toFixed(2)}` });
        }
        if (args.salePrice != null) {
          const v = Number(args.salePrice);
          if (!Number.isFinite(v) || v < 0) throw new BusinessException('销售价无效');
          params.salePrice = v; fields.push({ label: '销售价', value: `¥${v.toFixed(2)}` });
        }
        if (args.safetyStock != null) {
          const v = Number(args.safetyStock);
          if (!Number.isFinite(v) || v < 0) throw new BusinessException('安全库存无效');
          params.safetyStock = v; fields.push({ label: '安全库存', value: String(v) });
        }
        if ('supplierId' in args) {
          const v = Number(args.supplierId);
          if (!Number.isFinite(v) || v < 0) throw new BusinessException('默认供应商ID无效');
          if (v === 0) {
            params.supplierId = null;
            fields.push({ label: '默认供应商', value: '解除绑定' });
          } else {
            const s = await this.supplierRepo.findOne({ where: { id: v, companyId: ctx.companyId } });
            if (!s) throw new BusinessException('默认供应商不存在', 40404);
            params.supplierId = v;
            fields.push({ label: '默认供应商', value: s.name });
          }
        }
        if (args.status != null) {
          const v = Number(args.status);
          if (v !== 0 && v !== 1) throw new BusinessException('状态仅可为 0 或 1');
          params.status = v; fields.push({ label: '状态', value: v === 1 ? '启用' : '停用' });
        }
        if (args.remark != null) { params.remark = String(args.remark); fields.push({ label: '备注', value: String(args.remark) }); }
        if (!fields.length) throw new BusinessException('没有需要修改的字段');

        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '编辑商品',
            rows: [{ label: '商品', value: `${product.name}（${product.code}）` }, ...fields],
          };
          return { type: 'propose', params: { productId, ...params }, preview };
        }
        await this.productsService.update(productId, params);
        return { type: 'data', data: { ok: true, productId } };
      },
    };
  }

  private removeProduct(): AgentTool {
    return {
      name: 'remove_product',
      description:
        '删除（停用）商品。仅当商品无剩余库存时可删除；有库存的会被拒绝。删除后商品从可选列表消失。生成操作提案，必须用户确认后执行。',
      schema: {
        type: 'object',
        properties: { productId: { type: 'number', description: '商品ID' } },
        required: ['productId'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'product:delete',
      handler: async (ctx, args, mode) => {
        const productId = Number(args.productId);
        if (!Number.isFinite(productId) || productId <= 0) throw new BusinessException('商品ID无效');
        const product = await this.productRepo.findOne({ where: { id: productId, companyId: ctx.companyId } });
        if (!product) throw new BusinessException('商品不存在', 40403);
        const inv = await this.inventoryRepo.findOne({ where: { companyId: ctx.companyId, productId } });
        const quantity = Number(inv?.quantity ?? 0);

        if (mode === 'propose') {
          if (quantity > 0) {
            throw new BusinessException(`商品「${product.name}」仍有库存 ${quantity}，无法删除，请先清零或停用`, 40013);
          }
          const preview: PreviewCard = {
            title: '删除商品',
            rows: [
              { label: '商品', value: `${product.name}（${product.code}）` },
              { label: '当前库存', value: '0' },
              { label: '操作', value: '删除（停用）后不可再使用' },
            ],
          };
          return { type: 'propose', params: { productId }, preview };
        }
        await this.productsService.remove(productId);
        return { type: 'data', data: { ok: true, productId, code: product.code } };
      },
    };
  }

  // ==================== 供应商 ====================

  private createSupplier(): AgentTool {
    return {
      name: 'create_supplier',
      description:
        '新增供应商。必填：编码（code，唯一）、名称（name）。可选：联系人（contact）、电话（phone）、地址（address）、备注（remark）。生成操作提案，必须用户确认后创建。',
      schema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '供应商编码，唯一' },
          name: { type: 'string', description: '供应商名称' },
          contact: { type: 'string', description: '联系人，可选' },
          phone: { type: 'string', description: '电话，可选' },
          address: { type: 'string', description: '地址，可选' },
          remark: { type: 'string', description: '备注，可选' },
        },
        required: ['code', 'name'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'supplier:create',
      handler: async (ctx, args, mode) => {
        const code = String(args.code ?? '').trim();
        const name = String(args.name ?? '').trim();
        if (!code || !name) throw new BusinessException('供应商编码与名称为必填');
        const params = {
          code,
          name,
          contact: typeof args.contact === 'string' && args.contact ? args.contact : undefined,
          phone: typeof args.phone === 'string' && args.phone ? args.phone : undefined,
          address: typeof args.address === 'string' && args.address ? args.address : undefined,
          remark: typeof args.remark === 'string' && args.remark ? args.remark : undefined,
        };
        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '新增供应商',
            rows: [
              { label: '编码', value: code },
              { label: '名称', value: name },
              ...(params.contact ? [{ label: '联系人', value: params.contact }] : []),
              ...(params.phone ? [{ label: '电话', value: params.phone }] : []),
            ],
          };
          return { type: 'propose', params, preview };
        }
        const entity = await this.suppliersService.create(params);
        return { type: 'data', data: { ok: true, id: entity.id, code: entity.code, name: entity.name } };
      },
    };
  }

  private updateSupplier(): AgentTool {
    return {
      name: 'update_supplier',
      description:
        '编辑供应商信息。需要供应商ID（supplierId），可修改：名称、联系人、电话、地址、备注、状态。只传需要修改的字段。生成操作提案，必须用户确认后修改。',
      schema: {
        type: 'object',
        properties: {
          supplierId: { type: 'number', description: '供应商ID' },
          name: { type: 'string', description: '名称，可选' },
          contact: { type: 'string', description: '联系人，可选' },
          phone: { type: 'string', description: '电话，可选' },
          address: { type: 'string', description: '地址，可选' },
          remark: { type: 'string', description: '备注，可选' },
          status: { type: 'number', description: '状态：1启用/0停用，可选' },
        },
        required: ['supplierId'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'supplier:update',
      handler: async (ctx, args, mode) => {
        const supplierId = Number(args.supplierId);
        if (!Number.isFinite(supplierId) || supplierId <= 0) throw new BusinessException('供应商ID无效');
        const supplier = await this.supplierRepo.findOne({ where: { id: supplierId, companyId: ctx.companyId } });
        if (!supplier) throw new BusinessException('供应商不存在', 40404);

        const fields: Array<{ label: string; value: string }> = [];
        const params: Record<string, unknown> = {};
        if (args.name != null) { params.name = String(args.name); fields.push({ label: '名称', value: String(args.name) }); }
        if (args.contact != null) { params.contact = String(args.contact); fields.push({ label: '联系人', value: String(args.contact) }); }
        if (args.phone != null) { params.phone = String(args.phone); fields.push({ label: '电话', value: String(args.phone) }); }
        if (args.address != null) { params.address = String(args.address); fields.push({ label: '地址', value: String(args.address) }); }
        if (args.remark != null) { params.remark = String(args.remark); fields.push({ label: '备注', value: String(args.remark) }); }
        if (args.status != null) {
          const v = Number(args.status);
          if (v !== 0 && v !== 1) throw new BusinessException('状态仅可为 0 或 1');
          params.status = v; fields.push({ label: '状态', value: v === 1 ? '启用' : '停用' });
        }
        if (!fields.length) throw new BusinessException('没有需要修改的字段');

        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '编辑供应商',
            rows: [{ label: '供应商', value: supplier.name }, ...fields],
          };
          return { type: 'propose', params: { supplierId, ...params }, preview };
        }
        await this.suppliersService.update(supplierId, params);
        return { type: 'data', data: { ok: true, supplierId } };
      },
    };
  }

  private removeSupplier(): AgentTool {
    return {
      name: 'remove_supplier',
      description:
        '删除（停用）供应商。仅当该供应商没有关联采购订单时可删除；已有采购记录的会被拒绝。生成操作提案，必须用户确认后执行。',
      schema: {
        type: 'object',
        properties: { supplierId: { type: 'number', description: '供应商ID' } },
        required: ['supplierId'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'supplier:delete',
      handler: async (ctx, args, mode) => {
        const supplierId = Number(args.supplierId);
        if (!Number.isFinite(supplierId) || supplierId <= 0) throw new BusinessException('供应商ID无效');
        const supplier = await this.supplierRepo.findOne({ where: { id: supplierId, companyId: ctx.companyId } });
        if (!supplier) throw new BusinessException('供应商不存在', 40404);

        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '删除供应商',
            rows: [
              { label: '供应商', value: `${supplier.name}（${supplier.code}）` },
              { label: '操作', value: '删除（停用）后不可再使用' },
            ],
          };
          return { type: 'propose', params: { supplierId }, preview };
        }
        await this.suppliersService.remove(supplierId);
        return { type: 'data', data: { ok: true, supplierId, code: supplier.code } };
      },
    };
  }

  // ==================== 客户 ====================

  private createCustomer(): AgentTool {
    return {
      name: 'create_customer',
      description:
        '新增客户。必填：编码（code，唯一）、名称（name）。可选：联系人（contact）、电话（phone）、地址（address）、等级（level）、备注（remark）。生成操作提案，必须用户确认后创建。',
      schema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '客户编码，唯一' },
          name: { type: 'string', description: '客户名称' },
          contact: { type: 'string', description: '联系人，可选' },
          phone: { type: 'string', description: '电话，可选' },
          address: { type: 'string', description: '地址，可选' },
          level: { type: 'string', description: '客户等级，可选' },
          remark: { type: 'string', description: '备注，可选' },
        },
        required: ['code', 'name'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'customer:create',
      handler: async (ctx, args, mode) => {
        const code = String(args.code ?? '').trim();
        const name = String(args.name ?? '').trim();
        if (!code || !name) throw new BusinessException('客户编码与名称为必填');
        const params = {
          code,
          name,
          contact: typeof args.contact === 'string' && args.contact ? args.contact : undefined,
          phone: typeof args.phone === 'string' && args.phone ? args.phone : undefined,
          address: typeof args.address === 'string' && args.address ? args.address : undefined,
          level: typeof args.level === 'string' && args.level ? args.level : undefined,
          remark: typeof args.remark === 'string' && args.remark ? args.remark : undefined,
        };
        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '新增客户',
            rows: [
              { label: '编码', value: code },
              { label: '名称', value: name },
              ...(params.contact ? [{ label: '联系人', value: params.contact }] : []),
              ...(params.level ? [{ label: '等级', value: params.level }] : []),
            ],
          };
          return { type: 'propose', params, preview };
        }
        const entity = await this.customersService.create(params);
        return { type: 'data', data: { ok: true, id: entity.id, code: entity.code, name: entity.name } };
      },
    };
  }

  private updateCustomer(): AgentTool {
    return {
      name: 'update_customer',
      description:
        '编辑客户信息。需要客户ID（customerId），可修改：名称、联系人、电话、地址、等级、备注、状态。只传需要修改的字段。生成操作提案，必须用户确认后修改。',
      schema: {
        type: 'object',
        properties: {
          customerId: { type: 'number', description: '客户ID' },
          name: { type: 'string', description: '名称，可选' },
          contact: { type: 'string', description: '联系人，可选' },
          phone: { type: 'string', description: '电话，可选' },
          address: { type: 'string', description: '地址，可选' },
          level: { type: 'string', description: '等级，可选' },
          remark: { type: 'string', description: '备注，可选' },
          status: { type: 'number', description: '状态：1启用/0停用，可选' },
        },
        required: ['customerId'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'customer:update',
      handler: async (ctx, args, mode) => {
        const customerId = Number(args.customerId);
        if (!Number.isFinite(customerId) || customerId <= 0) throw new BusinessException('客户ID无效');
        const customer = await this.customerRepo.findOne({ where: { id: customerId, companyId: ctx.companyId } });
        if (!customer) throw new BusinessException('客户不存在', 40405);

        const fields: Array<{ label: string; value: string }> = [];
        const params: Record<string, unknown> = {};
        if (args.name != null) { params.name = String(args.name); fields.push({ label: '名称', value: String(args.name) }); }
        if (args.contact != null) { params.contact = String(args.contact); fields.push({ label: '联系人', value: String(args.contact) }); }
        if (args.phone != null) { params.phone = String(args.phone); fields.push({ label: '电话', value: String(args.phone) }); }
        if (args.address != null) { params.address = String(args.address); fields.push({ label: '地址', value: String(args.address) }); }
        if (args.level != null) { params.level = String(args.level); fields.push({ label: '等级', value: String(args.level) }); }
        if (args.remark != null) { params.remark = String(args.remark); fields.push({ label: '备注', value: String(args.remark) }); }
        if (args.status != null) {
          const v = Number(args.status);
          if (v !== 0 && v !== 1) throw new BusinessException('状态仅可为 0 或 1');
          params.status = v; fields.push({ label: '状态', value: v === 1 ? '启用' : '停用' });
        }
        if (!fields.length) throw new BusinessException('没有需要修改的字段');

        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '编辑客户',
            rows: [{ label: '客户', value: customer.name }, ...fields],
          };
          return { type: 'propose', params: { customerId, ...params }, preview };
        }
        await this.customersService.update(customerId, params);
        return { type: 'data', data: { ok: true, customerId } };
      },
    };
  }

  private removeCustomer(): AgentTool {
    return {
      name: 'remove_customer',
      description:
        '删除（停用）客户。仅当该客户没有关联销售订单时可删除；已有销售记录的会被拒绝。生成操作提案，必须用户确认后执行。',
      schema: {
        type: 'object',
        properties: { customerId: { type: 'number', description: '客户ID' } },
        required: ['customerId'],
        additionalProperties: false,
      },
      kind: 'write',
      requiredPermission: 'customer:delete',
      handler: async (ctx, args, mode) => {
        const customerId = Number(args.customerId);
        if (!Number.isFinite(customerId) || customerId <= 0) throw new BusinessException('客户ID无效');
        const customer = await this.customerRepo.findOne({ where: { id: customerId, companyId: ctx.companyId } });
        if (!customer) throw new BusinessException('客户不存在', 40405);

        if (mode === 'propose') {
          const preview: PreviewCard = {
            title: '删除客户',
            rows: [
              { label: '客户', value: `${customer.name}（${customer.code}）` },
              { label: '操作', value: '删除（停用）后不可再使用' },
            ],
          };
          return { type: 'propose', params: { customerId }, preview };
        }
        await this.customersService.remove(customerId);
        return { type: 'data', data: { ok: true, customerId, code: customer.code } };
      },
    };
  }
}
