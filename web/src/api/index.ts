import http from './http';
import type {
  AccountSummary,
  CustomerItem,
  DashboardSummary,
  InventoryItem,
  InventoryRecordItem,
  LoginPayload,
  LoginResult,
  MenuNode,
  OperationLogItem,
  OrderItemLine,
  PageResult,
  PaymentItem,
  PermissionNode,
  ProductItem,
  PurchaseOrderItem,
  RecentOrder,
  RoleItem,
  SaleOrderItem,
  SupplierItem,
  TopProduct,
  TrendPoint,
  UserInfo,
  UserItem,
} from '@erp/shared';

// ============ 认证 ============
export const authApi = {
  login: (payload: LoginPayload) => http.post<never, LoginResult>('/auth/login', payload),
  profile: () => http.get<never, UserInfo>('/auth/profile'),
  changePassword: (oldPassword: string, newPassword: string) =>
    http.put('/auth/password', { oldPassword, newPassword }),
};

// ============ 看板 ============
export const dashboardApi = {
  summary: () => http.get<never, DashboardSummary>('/dashboard/summary'),
  saleTrend: (days = 30) => http.get<never, TrendPoint[]>('/dashboard/sale-trend', { params: { days } }),
  topProducts: (limit = 10) => http.get<never, TopProduct[]>('/dashboard/top-products', { params: { limit } }),
  recentOrders: () => http.get<never, RecentOrder[]>('/dashboard/recent-orders'),
};

// ============ 基础资料 ============
export const categoryApi = {
  tree: () => http.get<never, unknown[]>('/categories/tree'),
  create: (data: { name: string; parentId?: number; sort?: number }) => http.post('/categories', data),
  update: (id: number, data: Record<string, unknown>) => http.put(`/categories/${id}`, data),
  remove: (id: number) => http.delete(`/categories/${id}`),
};

export interface ProductQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  categoryId?: number;
  status?: number;
}

export const productApi = {
  list: (query: ProductQuery) => http.get<never, PageResult<ProductItem>>('/products', { params: query }),
  options: (keyword?: string) => http.get<never, ProductItem[]>('/products/options', { params: { keyword } }),
  create: (data: Record<string, unknown>) => http.post('/products', data),
  update: (id: number, data: Record<string, unknown>) => http.put(`/products/${id}`, data),
  remove: (id: number) => http.delete(`/products/${id}`),
};

export const supplierApi = {
  list: (params: Record<string, unknown>) => http.get<never, PageResult<SupplierItem>>('/suppliers', { params }),
  options: (keyword?: string) => http.get<never, SupplierItem[]>('/suppliers/options', { params: { keyword } }),
  create: (data: Record<string, unknown>) => http.post('/suppliers', data),
  update: (id: number, data: Record<string, unknown>) => http.put(`/suppliers/${id}`, data),
  remove: (id: number) => http.delete(`/suppliers/${id}`),
};

export const customerApi = {
  list: (params: Record<string, unknown>) => http.get<never, PageResult<CustomerItem>>('/customers', { params }),
  options: (keyword?: string) => http.get<never, CustomerItem[]>('/customers/options', { params: { keyword } }),
  create: (data: Record<string, unknown>) => http.post('/customers', data),
  update: (id: number, data: Record<string, unknown>) => http.put(`/customers/${id}`, data),
  remove: (id: number) => http.delete(`/customers/${id}`),
};

// ============ 采购 ============
export const purchaseApi = {
  list: (params: Record<string, unknown>) =>
    http.get<never, PageResult<PurchaseOrderItem>>('/purchase-orders', { params }),
  detail: (id: number) => http.get<never, PurchaseOrderItem>(`/purchase-orders/${id}`),
  create: (data: { supplierId: number; orderDate: string; remark?: string; items: OrderItemLine[] }) =>
    http.post<never, PurchaseOrderItem>('/purchase-orders', data),
  update: (id: number, data: Record<string, unknown>) => http.put(`/purchase-orders/${id}`, data),
  remove: (id: number) => http.delete(`/purchase-orders/${id}`),
  confirm: (id: number) => http.put(`/purchase-orders/${id}/confirm`),
  cancel: (id: number) => http.put(`/purchase-orders/${id}/cancel`),
  warehouse: (id: number) => http.put<never, { inboundNo: string }>(`/purchase-orders/${id}/warehouse`),
  inbounds: (params: Record<string, unknown>) =>
    http.get<never, PageResult<PurchaseOrderItem>>('/purchase-inbounds', { params }),
  inboundDetail: (id: number) => http.get<never, PurchaseOrderItem>(`/purchase-inbounds/${id}`),
};

// ============ 销售 ============
export const saleApi = {
  list: (params: Record<string, unknown>) => http.get<never, PageResult<SaleOrderItem>>('/sale-orders', { params }),
  detail: (id: number) => http.get<never, SaleOrderItem>(`/sale-orders/${id}`),
  create: (data: { customerId: number; orderDate: string; remark?: string; items: OrderItemLine[] }) =>
    http.post<never, SaleOrderItem>('/sale-orders', data),
  update: (id: number, data: Record<string, unknown>) => http.put(`/sale-orders/${id}`, data),
  remove: (id: number) => http.delete(`/sale-orders/${id}`),
  confirm: (id: number) => http.put(`/sale-orders/${id}/confirm`),
  cancel: (id: number) => http.put(`/sale-orders/${id}/cancel`),
  outbound: (id: number) => http.put<never, { outboundNo: string }>(`/sale-orders/${id}/outbound`),
  outbounds: (params: Record<string, unknown>) =>
    http.get<never, PageResult<SaleOrderItem>>('/sale-outbounds', { params }),
  outboundDetail: (id: number) => http.get<never, SaleOrderItem>(`/sale-outbounds/${id}`),
};

// ============ 库存 ============
export const inventoryApi = {
  current: (params: Record<string, unknown>) =>
    http.get<never, PageResult<InventoryItem>>('/inventory', { params }),
  records: (params: Record<string, unknown>) =>
    http.get<never, PageResult<InventoryRecordItem>>('/inventory/records', { params }),
  alerts: () => http.get<never, InventoryItem[]>('/inventory/alerts'),
  adjust: (productId: number, delta: number, remark?: string) =>
    http.post('/inventory/adjust', { productId, delta, remark }),
};

export const stocktakeApi = {
  list: (params: Record<string, unknown>) => http.get<never, PageResult<unknown>>('/stocktakes', { params }),
  detail: (id: number) => http.get<never, unknown>(`/stocktakes/${id}`),
  create: (data: { remark?: string; items: Array<{ productId: number; actualQty: number }> }) =>
    http.post<never, { id: number; stocktakeNo: string }>('/stocktakes', data),
  confirm: (id: number) => http.put(`/stocktakes/${id}/confirm`),
};

// ============ 财务 ============
export const financeApi = {
  payments: (params: Record<string, unknown>) =>
    http.get<never, PageResult<PaymentItem>>('/payments', { params }),
  createPayment: (data: Record<string, unknown>) => http.post<never, PaymentItem>('/payments', data),
  removePayment: (id: number) => http.delete(`/payments/${id}`),
  accounts: () => http.get<never, AccountSummary[]>('/finance/accounts'),
};

// ============ 系统 ============
export const userApi = {
  list: (params: Record<string, unknown>) => http.get<never, PageResult<UserItem>>('/users', { params }),
  create: (data: Record<string, unknown>) => http.post('/users', data),
  update: (id: number, data: Record<string, unknown>) => http.put(`/users/${id}`, data),
  remove: (id: number) => http.delete(`/users/${id}`),
  resetPassword: (id: number, password: string) => http.put(`/users/${id}/password`, { password }),
};

export const roleApi = {
  list: (params: Record<string, unknown>) => http.get<never, PageResult<RoleItem>>('/roles', { params }),
  options: () => http.get<never, RoleItem[]>('/roles/options'),
  create: (data: Record<string, unknown>) => http.post('/roles', data),
  update: (id: number, data: Record<string, unknown>) => http.put(`/roles/${id}`, data),
  remove: (id: number) => http.delete(`/roles/${id}`),
};

export const permissionApi = {
  all: () => http.get<never, PermissionNode[]>('/permissions/all'),
  update: (id: number, data: Record<string, unknown>) => http.put(`/permissions/${id}`, data),
};

export const logApi = {
  list: (params: Record<string, unknown>) =>
    http.get<never, PageResult<OperationLogItem>>('/logs', { params }),
};

export const uploadApi = {
  image: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.post<never, { url: string }>('/upload/image', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export type { MenuNode };
