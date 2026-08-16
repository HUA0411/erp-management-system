import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { PermissionEntity } from '../entities/permission.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { RoleEntity, RolePermissionEntity, UserRoleEntity } from '../entities/role.entity';
import { UserEntity } from '../entities/user.entity';
import { CategoryEntity } from '../entities/category.entity';
import { ProductEntity } from '../entities/product.entity';
import { SupplierEntity, CustomerEntity } from '../entities/partner.entity';
import { PurchaseOrderEntity, PurchaseOrderItemEntity } from '../entities/purchase.entity';
import { SaleOrderEntity, SaleOrderItemEntity } from '../entities/sale.entity';
import { PurchaseInboundEntity, PurchaseInboundItemEntity } from '../entities/inbound.entity';
import { SaleOutboundEntity, SaleOutboundItemEntity } from '../entities/outbound.entity';
import { PaymentEntity } from '../entities/payment.entity';
import {
  demoUsers,
  flattenPermissions,
  roleTemplates,
  t2Users,
} from './seed-data';

interface ProductSeed {
  code: string;
  name: string;
  category: string;
  spec: string;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  safetyStock: number;
  initQty: number;
}

const productsSeed: ProductSeed[] = [
  { code: 'P001', name: '智能路由器 AX3000', category: '电子产品', spec: 'AX3000', unit: '台', purchasePrice: 120, salePrice: 199, safetyStock: 50, initQty: 80 },
  { code: 'P002', name: 'USB-C 快充数据线', category: '电子产品', spec: '1.5m', unit: '条', purchasePrice: 8, salePrice: 19.9, safetyStock: 200, initQty: 150 },
  { code: 'P003', name: '无线机械键盘', category: '电子产品', spec: '87键', unit: '个', purchasePrice: 150, salePrice: 269, safetyStock: 30, initQty: 25 },
  { code: 'P004', name: '4K 显示器', category: '电子产品', spec: '27英寸', unit: '台', purchasePrice: 950, salePrice: 1399, safetyStock: 20, initQty: 35 },
  { code: 'P005', name: 'A4 复印纸', category: '办公用品', spec: '70g 500张', unit: '箱', purchasePrice: 18, salePrice: 29, safetyStock: 100, initQty: 200 },
  { code: 'P006', name: '中性笔', category: '办公用品', spec: '0.5mm 黑色', unit: '盒', purchasePrice: 6, salePrice: 12, safetyStock: 300, initQty: 250 },
  { code: 'P007', name: '订书机', category: '办公用品', spec: '标准型', unit: '个', purchasePrice: 4, salePrice: 8, safetyStock: 150, initQty: 180 },
  { code: 'P008', name: '304 不锈钢螺栓', category: '五金配件', spec: 'M8x30', unit: '盒', purchasePrice: 15, salePrice: 26, safetyStock: 120, initQty: 90 },
  { code: 'P009', name: '工业轴承', category: '五金配件', spec: '6204-2RS', unit: '个', purchasePrice: 8.5, salePrice: 16, safetyStock: 80, initQty: 150 },
  { code: 'P010', name: '瓦楞纸箱', category: '包装耗材', spec: '60x40x40', unit: '个', purchasePrice: 3.2, salePrice: 6.5, safetyStock: 400, initQty: 500 },
  { code: 'P011', name: '气泡膜', category: '包装耗材', spec: '50cm宽 100m', unit: '卷', purchasePrice: 22, salePrice: 39, safetyStock: 60, initQty: 40 },
  { code: 'P012', name: '便携充电宝', category: '电子产品', spec: '20000mAh', unit: '个', purchasePrice: 65, salePrice: 129, safetyStock: 40, initQty: 55 },
];

const suppliersSeed = [
  { code: 'SUP001', name: '深圳华强电子有限公司', contact: '陈经理', phone: '0755-88886666', address: '深圳市福田区华强北路 1 号' },
  { code: 'SUP002', name: '上海办公用品批发商行', contact: '刘经理', phone: '021-66668888', address: '上海市普陀区中山北路 88 号' },
  { code: 'SUP003', name: '东莞五金制造厂', contact: '周经理', phone: '0769-22223333', address: '东莞市长安镇工业大道 36 号' },
];

const customersSeed = [
  { code: 'CUS001', name: '北京云启科技有限公司', contact: '王总', phone: '010-88889999', address: '北京市海淀区中关村大街 27 号', level: 'VIP' },
  { code: 'CUS002', name: '上海星海贸易有限公司', contact: '李总', phone: '021-55557777', address: '上海市浦东新区世纪大道 100 号', level: '普通' },
  { code: 'CUS003', name: '广州蓝海电子商务有限公司', contact: '赵总', phone: '020-33334444', address: '广州市天河区体育西路 66 号', level: '重点' },
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ymd(date: string): string {
  return date.replace(/-/g, '');
}

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly dataSource: DataSource) {}

  async seed(): Promise<void> {
    const exists = await this.dataSource.getRepository(TenantEntity).findOne({ where: { code: 'DEMO' } });
    if (exists) {
      this.logger.log('已存在种子数据，跳过（幂等）');
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      await this.seedTemplate(manager);
      const demo = await manager.getRepository(TenantEntity).findOne({ where: { code: 'DEMO' } });
      await this.seedBusiness(manager, demo!.id);
    });

    this.logger.log('种子数据初始化完成：租户 DEMO/T2、5 个角色、7 个用户、12 个商品、历史订单/入库/出库/收付款');
  }

  /**
   * 模板数据（幂等前提：权限/租户/角色/用户表为空）：
   * 权限树（全局）→ 租户 DEMO/T2 → 角色 → 用户。不含任何业务演示数据。
   * db:reset 后系统保留模板，客户可干净起步自行录入业务数据。
   */
  async seedTemplate(manager: EntityManager): Promise<void> {
    // 1. 权限（全局）
    const permIdByCode = await this.insertPermissions(manager);

    // 2. 租户
    const demoId = await this.insertTenant(manager, 'DEMO', '演示科技有限公司');
    const t2Id = await this.insertTenant(manager, 'T2', '测试公司（租户隔离验证）');

    // 3. 角色 + 用户
    const roleIdByCode = await this.insertRoles(manager, permIdByCode, demoId);
    await this.insertRoles(manager, permIdByCode, t2Id);
    await this.insertUsers(manager, demoId, roleIdByCode, demoUsers);
    await this.insertUsers(manager, t2Id, roleIdByCode, t2Users);
  }

  /** 演示业务数据（仅 DEMO 租户）：分类/供应商/客户/商品/历史订单/库存/收付款 */
  async seedBusiness(manager: EntityManager, companyId: number): Promise<void> {
    await this.insertBusinessData(manager, companyId);
  }

  private async insertPermissions(manager: EntityManager): Promise<Map<string, number>> {
    const repo = manager.getRepository(PermissionEntity);
    const map = new Map<string, number>();
    for (const p of flattenPermissions()) {
      const parentId = p.parentCode ? (map.get(p.parentCode) ?? 0) : 0;
      const result = await repo.insert({
        parentId,
        name: p.name,
        code: p.code,
        type: p.type,
        path: p.path,
        icon: p.icon,
        sort: 0,
      });
      map.set(p.code, result.identifiers[0].id as number);
    }
    return map;
  }

  private async insertTenant(manager: EntityManager, code: string, name: string): Promise<number> {
    const result = await manager.getRepository(TenantEntity).insert({ code, name, status: 1 });
    return result.identifiers[0].id as number;
  }

  private async insertRoles(
    manager: EntityManager,
    permIdByCode: Map<string, number>,
    companyId: number,
  ): Promise<Map<string, number>> {
    const roleRepo = manager.getRepository(RoleEntity);
    const rpRepo = manager.getRepository(RolePermissionEntity);
    const map = new Map<string, number>();
    for (const tpl of roleTemplates) {
      const result = await roleRepo.insert({
        companyId,
        name: tpl.name,
        code: tpl.code,
        remark: tpl.remark,
        status: 1,
      });
      const roleId = result.identifiers[0].id as number;
      map.set(tpl.code, roleId);
      const permissionIds = tpl.permissions
        .map((c) => permIdByCode.get(c))
        .filter((id): id is number => !!id);
      await rpRepo.insert(permissionIds.map((permissionId) => ({ roleId, permissionId })));
    }
    return map;
  }

  private async insertUsers(
    manager: EntityManager,
    companyId: number,
    roleIdByCode: Map<string, number>,
    users: Array<{ username: string; password: string; realName: string; roleCodes: string[] }>,
  ): Promise<void> {
    const userRepo = manager.getRepository(UserEntity);
    const urRepo = manager.getRepository(UserRoleEntity);
    for (const u of users) {
      const result = await userRepo.insert({
        companyId,
        username: u.username,
        password: bcrypt.hashSync(u.password, 10),
        realName: u.realName,
        status: 1,
        isSuperAdmin: u.roleCodes.includes('SUPER_ADMIN'),
      });
      const userId = result.identifiers[0].id as number;
      const roleIds = u.roleCodes.map((c) => roleIdByCode.get(c)).filter((id): id is number => !!id);
      await urRepo.insert(roleIds.map((roleId) => ({ userId, roleId })));
    }
  }

  // ==================== 演示业务数据 ====================

  private async insertBusinessData(manager: EntityManager, companyId: number): Promise<void> {
    // 分类
    const categoryIdByCode = new Map<string, number>();
    for (const name of ['电子产品', '办公用品', '五金配件', '包装耗材']) {
      const r = await manager.getRepository(CategoryEntity).insert({ companyId, parentId: 0, name, sort: 0, status: 1 });
      categoryIdByCode.set(name, r.identifiers[0].id as number);
    }

    // 供应商 / 客户
    const supplierIdByCode = new Map<string, number>();
    for (const s of suppliersSeed) {
      const r = await manager.getRepository(SupplierEntity).insert({ companyId, ...s, status: 1 });
      supplierIdByCode.set(s.code, r.identifiers[0].id as number);
    }
    const customerIdByCode = new Map<string, number>();
    for (const c of customersSeed) {
      const r = await manager.getRepository(CustomerEntity).insert({ companyId, ...c, status: 1 });
      customerIdByCode.set(c.code, r.identifiers[0].id as number);
    }

    // 商品 + 期初库存
    const productByCode = new Map<string, { id: number; name: string; spec: string; unit: string; purchasePrice: number; salePrice: number }>();
    const balance = new Map<number, number>();
    for (const p of productsSeed) {
      const r = await manager.getRepository(ProductEntity).insert({
        companyId,
        categoryId: categoryIdByCode.get(p.category)!,
        code: p.code,
        name: p.name,
        spec: p.spec,
        unit: p.unit,
        purchasePrice: p.purchasePrice,
        salePrice: p.salePrice,
        safetyStock: p.safetyStock,
        status: 1,
      });
      const id = r.identifiers[0].id as number;
      productByCode.set(p.code, { id, name: p.name, spec: p.spec, unit: p.unit, purchasePrice: p.purchasePrice, salePrice: p.salePrice });
      balance.set(id, p.initQty);
      await manager.query(
        'INSERT INTO inventory (company_id, product_id, quantity, updated_at) VALUES (?,?,?,NOW())',
        [companyId, id, p.initQty],
      );
      await manager.query(
        `INSERT INTO inventory_record (company_id, product_id, product_name, type, quantity, balance_after, ref_type, ref_no, remark, operator, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,NOW())`,
        [companyId, id, p.name, 'init', p.initQty, p.initQty, 'INIT', '期初建账', '初始化库存', 'system'],
      );
    }

    // 历史采购单（已入库）
    const purchaseDocs: Array<{ daysAgo: number; supplier: string; lines: Array<[string, number, number]>; payAmount?: number }> = [
      { daysAgo: 30, supplier: 'SUP001', lines: [['P001', 30, 120], ['P004', 5, 950]], payAmount: 4000 },
      { daysAgo: 20, supplier: 'SUP002', lines: [['P002', 200, 8], ['P005', 80, 18], ['P006', 100, 6]], payAmount: 3000 },
      { daysAgo: 10, supplier: 'SUP003', lines: [['P008', 60, 15], ['P009', 40, 8.5], ['P010', 100, 3.2]] },
    ];
    let poSeq = 0;
    for (const doc of purchaseDocs) {
      poSeq += 1;
      const date = daysAgo(doc.daysAgo);
      const supplier = suppliersSeed.find((s) => s.code === doc.supplier)!;
      const lines = doc.lines.map(([code, qty, price]) => {
        const p = productByCode.get(code)!;
        return { ...p, quantity: qty, price, amount: Math.round(qty * price * 100) / 100 };
      });
      const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
      const orderNo = `PO${ymd(date)}${String(poSeq).padStart(4, '0')}`;
      const orderId = (
        await manager.getRepository(PurchaseOrderEntity).insert({
          companyId, orderNo, supplierId: supplierIdByCode.get(doc.supplier)!,
          supplierName: supplier.name, orderDate: date, totalAmount: total, paidAmount: 0,
          status: 'warehoused', remark: '种子演示数据', createdBy: 1,
        })
      ).identifiers[0].id as number;
      await manager.getRepository(PurchaseOrderItemEntity).insert(
        lines.map((l) => ({ orderId, productId: l.id, productName: l.name, spec: l.spec, unit: l.unit, quantity: l.quantity, price: l.price, amount: l.amount })),
      );
      const inboundNo = `IB${ymd(date)}${String(poSeq).padStart(4, '0')}`;
      const inboundId = (
        await manager.getRepository(PurchaseInboundEntity).insert({
          companyId, inboundNo, orderId, supplierId: supplierIdByCode.get(doc.supplier)!,
          supplierName: supplier.name, inboundDate: date, totalAmount: total, createdBy: 1,
        })
      ).identifiers[0].id as number;
      await manager.getRepository(PurchaseInboundItemEntity).insert(
        lines.map((l) => ({ inboundId, productId: l.id, productName: l.name, spec: l.spec, unit: l.unit, quantity: l.quantity, price: l.price, amount: l.amount })),
      );
      for (const l of lines) await this.applyMovement(manager, companyId, l, +l.quantity, 'in', 'PURCHASE_INBOUND', inboundNo, balance);
      if (doc.payAmount) {
        await manager.getRepository(PaymentEntity).insert({
          companyId, docNo: `PAY${ymd(date)}${String(poSeq).padStart(4, '0')}`, type: 'pay',
          partnerType: 'supplier', partnerId: supplierIdByCode.get(doc.supplier)!,
          partnerName: supplier.name, amount: doc.payAmount, orderNo, payDate: date, method: '银行转账',
        });
      }
    }

    // 历史销售单（已出库）
    const saleDocs: Array<{ daysAgo: number; customer: string; lines: Array<[string, number, number]>; receiveAmount?: number }> = [
      { daysAgo: 25, customer: 'CUS001', lines: [['P001', 20, 199], ['P004', 3, 1399]], receiveAmount: 5000 },
      { daysAgo: 15, customer: 'CUS002', lines: [['P002', 120, 19.9], ['P003', 10, 269], ['P011', 10, 39]], receiveAmount: 6000 },
      { daysAgo: 5, customer: 'CUS003', lines: [['P005', 50, 29], ['P006', 80, 12], ['P010', 50, 6.5]] },
    ];
    let soSeq = 0;
    for (const doc of saleDocs) {
      soSeq += 1;
      const date = daysAgo(doc.daysAgo);
      const customer = customersSeed.find((c) => c.code === doc.customer)!;
      const lines = doc.lines.map(([code, qty, price]) => {
        const p = productByCode.get(code)!;
        return { ...p, quantity: qty, price, amount: Math.round(qty * price * 100) / 100 };
      });
      const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
      const orderNo = `SO${ymd(date)}${String(soSeq).padStart(4, '0')}`;
      const orderId = (
        await manager.getRepository(SaleOrderEntity).insert({
          companyId, orderNo, customerId: customerIdByCode.get(doc.customer)!,
          customerName: customer.name, orderDate: date, totalAmount: total, paidAmount: 0,
          status: 'outbound', remark: '种子演示数据', createdBy: 1,
        })
      ).identifiers[0].id as number;
      await manager.getRepository(SaleOrderItemEntity).insert(
        lines.map((l) => ({ orderId, productId: l.id, productName: l.name, spec: l.spec, unit: l.unit, quantity: l.quantity, price: l.price, amount: l.amount })),
      );
      const outboundNo = `OB${ymd(date)}${String(soSeq).padStart(4, '0')}`;
      const outboundId = (
        await manager.getRepository(SaleOutboundEntity).insert({
          companyId, outboundNo, orderId, customerId: customerIdByCode.get(doc.customer)!,
          customerName: customer.name, outboundDate: date, totalAmount: total, createdBy: 1,
        })
      ).identifiers[0].id as number;
      await manager.getRepository(SaleOutboundItemEntity).insert(
        lines.map((l) => ({ outboundId, productId: l.id, productName: l.name, spec: l.spec, unit: l.unit, quantity: l.quantity, price: l.price, amount: l.amount })),
      );
      for (const l of lines) await this.applyMovement(manager, companyId, l, -l.quantity, 'out', 'SALE_OUTBOUND', outboundNo, balance);
      if (doc.receiveAmount) {
        await manager.getRepository(PaymentEntity).insert({
          companyId, docNo: `PAY${ymd(date)}${String(soSeq + 10).padStart(4, '0')}`, type: 'receive',
          partnerType: 'customer', partnerId: customerIdByCode.get(doc.customer)!,
          partnerName: customer.name, amount: doc.receiveAmount, orderNo, payDate: date, method: '银行转账',
        });
      }
    }

    // 待办单据（已确认待入库 / 待出库）
    const today = daysAgo(0);
    const pendingPurchase = [
      { code: 'P004', qty: 10, price: 950 },
      { code: 'P012', qty: 20, price: 65 },
    ];
    const ppLines = pendingPurchase.map((l) => {
      const p = productByCode.get(l.code)!;
      return { ...p, quantity: l.qty, price: l.price, amount: Math.round(l.qty * l.price * 100) / 100 };
    });
    const ppTotal = Math.round(ppLines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    const ppOrderId = (
      await manager.getRepository(PurchaseOrderEntity).insert({
        companyId, orderNo: `PO${ymd(today)}0001`, supplierId: supplierIdByCode.get('SUP001')!,
        supplierName: '深圳华强电子有限公司', orderDate: today, totalAmount: ppTotal, paidAmount: 0,
        status: 'confirmed', remark: '待入库（演示）', createdBy: 1,
      })
    ).identifiers[0].id as number;
    await manager.getRepository(PurchaseOrderItemEntity).insert(
      ppLines.map((l) => ({ orderId: ppOrderId, productId: l.id, productName: l.name, spec: l.spec, unit: l.unit, quantity: l.quantity, price: l.price, amount: l.amount })),
    );

    const pendingSale = [
      { code: 'P001', qty: 15, price: 199 },
      { code: 'P003', qty: 8, price: 269 },
    ];
    const psLines = pendingSale.map((l) => {
      const p = productByCode.get(l.code)!;
      return { ...p, quantity: l.qty, price: l.price, amount: Math.round(l.qty * l.price * 100) / 100 };
    });
    const psTotal = Math.round(psLines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    const psOrderId = (
      await manager.getRepository(SaleOrderEntity).insert({
        companyId, orderNo: `SO${ymd(today)}0001`, customerId: customerIdByCode.get('CUS001')!,
        customerName: '北京云启科技有限公司', orderDate: today, totalAmount: psTotal, paidAmount: 0,
        status: 'confirmed', remark: '待出库（演示）', createdBy: 1,
      })
    ).identifiers[0].id as number;
    await manager.getRepository(SaleOrderItemEntity).insert(
      psLines.map((l) => ({ orderId: psOrderId, productId: l.id, productName: l.name, spec: l.spec, unit: l.unit, quantity: l.quantity, price: l.price, amount: l.amount })),
    );
  }

  /** 种子内的库存变动（与 InventoryService.movement 等价，保证演示数据一致） */
  private async applyMovement(
    manager: EntityManager,
    companyId: number,
    line: { id: number; name: string },
    delta: number,
    type: string,
    refType: string,
    refNo: string,
    balance: Map<number, number>,
  ): Promise<void> {
    const current = balance.get(line.id) ?? 0;
    const next = Math.round((current + delta) * 100) / 100;
    balance.set(line.id, next);
    await manager.query('UPDATE inventory SET quantity = ?, updated_at = NOW() WHERE company_id = ? AND product_id = ?', [next, companyId, line.id]);
    await manager.query(
      `INSERT INTO inventory_record (company_id, product_id, product_name, type, quantity, balance_after, ref_type, ref_no, remark, operator, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,NOW())`,
      [companyId, line.id, line.name, type, delta, next, refType, refNo, '种子演示数据', 'system'],
    );
  }
}
