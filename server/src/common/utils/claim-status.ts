import { EntityManager, EntityTarget, In, ObjectLiteral } from 'typeorm';

/**
 * 原子抢占状态：只有当前状态确实是 from 时才改成 to，返回是否抢到。
 *
 * 为什么必须有这个工具函数：
 *
 * 原先全站的状态流转都写成「事务外先查状态 → 事务内无条件 UPDATE status」。
 * 事务外那次 SELECT 读到的是快照，**两个并发请求会读到同一个旧状态**，
 * 于是双双通过校验、双双跑完整套流程。
 *
 * 实测（未修复前，5 个并发对同一张已确认订单请求出库）：
 *   成功 5 / 失败 0
 *   生成出库单 OB…0001 ~ OB…0005（5 张，本该 1 张）
 *   库存 75 → 50（本该 75 → 70，被扣了 5 次）
 *
 * 改成 `UPDATE … WHERE id = ? AND company_id = ? AND status IN (…)` 之后：
 * InnoDB 对该行的排他锁保证只有一个请求能把 status 从 from 改成 to，
 * 其余请求 affectedRows = 0，直接抛业务异常并回滚。
 *
 * 用法：必须在事务内的**第一件事**就调用，抢不到立刻抛异常，不要先做别的写操作。
 *
 *   const claimed = await claimStatus(manager, SaleOrderEntity, { id, companyId }, 'confirmed', 'outbound');
 *   if (!claimed) throw new BusinessException('该订单已被处理，请刷新后重试', 40040);
 *
 * 注意 from 用数组时可以同时接受多个来源状态（如取消订单允许 draft 和 confirmed）。
 */
export async function claimStatus(
  manager: EntityManager,
  entity: EntityTarget<ObjectLiteral>,
  where: { id: number; companyId: number },
  from: string | string[],
  to: string,
): Promise<boolean> {
  const fromList = Array.isArray(from) ? from : [from];
  const result = await manager
    .getRepository(entity)
    .update({ id: where.id, companyId: where.companyId, status: In(fromList) }, { status: to });
  return (result.affected ?? 0) > 0;
}
