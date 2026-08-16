import { EntitySubscriberInterface, InsertEvent, EventSubscriber } from 'typeorm';
import { TenantContext } from './tenant-context';

/**
 * 写入兜底：实体未显式携带 companyId 时，自动从租户上下文注入，
 * 杜绝"忘记带 company_id 导致数据跨租户"的写路径漏洞。
 */
@EventSubscriber()
export class TenantSubscriber implements EntitySubscriberInterface {
  beforeInsert(event: InsertEvent<unknown>): void {
    const entity = event.entity as Record<string, unknown> | null | undefined;
    if (!entity || !('companyId' in entity)) return;
    const companyId = entity.companyId;
    if (companyId == null || companyId === 0) {
      const ctx = TenantContext.get();
      if (ctx?.companyId) {
        entity.companyId = ctx.companyId;
      } else {
        throw new Error('缺少租户上下文，无法确定 company_id');
      }
    }
  }
}
