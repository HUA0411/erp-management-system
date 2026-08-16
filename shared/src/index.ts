/**
 * @erp/shared —— 前后端共享类型定义（仅类型，无运行时值）。
 * 使用方一律 `import type { ... } from '@erp/shared'`，编译期擦除，无运行时依赖。
 */

// ============ 通用响应 ============
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

// ============ 业务枚举（联合类型，非 TS enum） ============
export type OrderStatus = 'draft' | 'confirmed' | 'warehoused' | 'outbound' | 'cancelled';
export type PermissionType = 'menu' | 'button';
export type InventoryRecordType = 'init' | 'in' | 'out' | 'adjust' | 'stocktake';
export type PaymentType = 'pay' | 'receive';
export type PartnerType = 'supplier' | 'customer';
export type StocktakeStatus = 'draft' | 'confirmed';

// ============ 认证 ============
export interface LoginPayload {
  companyCode: string;
  username: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: UserInfo;
}

export interface UserInfo {
  id: number;
  companyId: number;
  companyCode: string;
  companyName: string;
  username: string;
  realName: string;
  phone?: string;
  email?: string;
  isSuperAdmin: boolean;
  roles: RoleBrief[];
  permissions: string[];
  menus: MenuNode[];
}

export interface RoleBrief {
  id: number;
  name: string;
  code: string;
}

export interface MenuNode {
  id: number;
  parentId: number;
  name: string;
  code: string;
  type: PermissionType;
  path?: string;
  icon?: string;
  sort: number;
  children?: MenuNode[];
}

// ============ 基础资料 ============
export interface ProductItem {
  id: number;
  categoryId: number;
  categoryName?: string;
  code: string;
  name: string;
  spec?: string;
  unit?: string;
  purchasePrice: number;
  salePrice: number;
  safetyStock: number;
  status: number;
  remark?: string;
}

export interface SupplierItem {
  id: number;
  code: string;
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
  remark?: string;
  status: number;
}

export interface CustomerItem {
  id: number;
  code: string;
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
  level?: string;
  remark?: string;
  status: number;
}

// ============ 订单/单据 ============
export interface OrderItemLine {
  productId: number;
  productName: string;
  spec?: string;
  unit?: string;
  quantity: number;
  price: number;
  amount: number;
}

export interface PurchaseOrderItem {
  id: number;
  orderNo: string;
  supplierId: number;
  supplierName: string;
  orderDate: string;
  totalAmount: number;
  paidAmount: number;
  status: OrderStatus;
  remark?: string;
  items?: OrderItemLine[];
  createdAt?: string;
}

export interface SaleOrderItem {
  id: number;
  orderNo: string;
  customerId: number;
  customerName: string;
  orderDate: string;
  totalAmount: number;
  paidAmount: number;
  status: OrderStatus;
  remark?: string;
  items?: OrderItemLine[];
  createdAt?: string;
}

// ============ 库存 ============
export interface InventoryItem {
  productId: number;
  productCode: string;
  productName: string;
  spec?: string;
  unit?: string;
  quantity: number;
  safetyStock: number;
  salePrice: number;
  isLow: boolean;
}

export interface InventoryRecordItem {
  id: number;
  productId: number;
  productName: string;
  type: InventoryRecordType;
  quantity: number;
  balanceAfter: number;
  refType: string;
  refNo: string;
  remark?: string;
  operator?: string;
  createdAt: string;
}

// ============ 财务 ============
export interface PaymentItem {
  id: number;
  docNo: string;
  type: PaymentType;
  partnerType: PartnerType;
  partnerId: number;
  partnerName: string;
  amount: number;
  orderNo?: string;
  payDate: string;
  method?: string;
  remark?: string;
  createdAt?: string;
}

export interface AccountSummary {
  partnerType: PartnerType;
  partnerId: number;
  partnerName: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
}

// ============ 看板 ============
export interface DashboardSummary {
  todaySaleAmount: number;
  monthSaleAmount: number;
  todayOrderCount: number;
  pendingInboundCount: number;
  lowStockCount: number;
  productCount: number;
  receivable: number;
  payable: number;
}

export interface TrendPoint {
  date: string;
  amount: number;
  count: number;
}

export interface TopProduct {
  productId: number;
  productName: string;
  quantity: number;
  amount: number;
}

export interface RecentOrder {
  type: 'purchase' | 'sale';
  orderNo: string;
  partnerName: string;
  amount: number;
  status: OrderStatus;
  date: string;
}

// ============ 系统管理 ============
export interface PermissionNode {
  id: number;
  parentId: number;
  name: string;
  code: string;
  type: PermissionType;
  path?: string;
  icon?: string;
  sort: number;
  children?: PermissionNode[];
}

export interface RoleItem {
  id: number;
  name: string;
  code: string;
  remark?: string;
  createdAt?: string;
}

export interface UserItem {
  id: number;
  username: string;
  realName: string;
  phone?: string;
  email?: string;
  status: number;
  isSuperAdmin: boolean;
  roles: RoleBrief[];
  createdAt?: string;
}

export interface OperationLogItem {
  id: number;
  username: string;
  module: string;
  action: string;
  method: string;
  path: string;
  ip?: string;
  createdAt: string;
}
