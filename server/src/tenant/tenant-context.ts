import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContextData {
  /** 当前租户 company_id；0 表示未认证 */
  companyId: number;
  userId?: number;
  username?: string;
  isSuperAdmin?: boolean;
}

/**
 * 租户上下文：基于 AsyncLocalStorage，随请求贯穿 middleware → guard → service。
 * 仓储/服务通过 TenantContext.get() 获取当前租户，强制数据隔离。
 */
export class TenantContext {
  private static store = new AsyncLocalStorage<TenantContextData>();

  static run<T>(data: TenantContextData, fn: () => T): T {
    return this.store.run(data, fn);
  }

  static get(): TenantContextData {
    return this.store.getStore() ?? { companyId: 0 };
  }

  static get companyId(): number {
    return this.get().companyId || 0;
  }

  static get userId(): number | undefined {
    return this.get().userId;
  }

  static get username(): string | undefined {
    return this.get().username;
  }

  static get isSuperAdmin(): boolean {
    return !!this.get().isSuperAdmin;
  }
}
