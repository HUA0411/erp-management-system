import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 修复历史订单的已收/已付金额。
 *
 * 背景：全代码库原先**没有任何地方写 paid_amount** —— 建单时写死 0，之后再也不更新。
 * 而财务模块的应收/应付汇总（finance.service.ts 的 accounts()）是按 payment 表求和算的，
 * 两套口径长期不一致：订单列表里「已收」永远 0，财务页却是真实数字。
 *
 * 应用层已改为在收付款单创建/删除时按 order_no 重算回写（syncPaidAmount）。
 * 这个迁移负责把**已有的**历史数据一次性对齐 —— 否则新逻辑只对新单据生效，
 * 老订单仍然显示 0。
 *
 * 只回写金额，不动 status；重算口径与 syncPaidAmount 完全一致（按 order_no + type 求和）。
 */
export class BackfillPaidAmount1786900000004 implements MigrationInterface {
  name = 'BackfillPaidAmount1786900000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE sale_order o
      SET o.paid_amount = COALESCE((
        SELECT SUM(p.amount) FROM payment p
        WHERE p.company_id = o.company_id AND p.order_no = o.order_no AND p.type = 'receive'
      ), 0)
    `);
    await queryRunner.query(`
      UPDATE purchase_order o
      SET o.paid_amount = COALESCE((
        SELECT SUM(p.amount) FROM payment p
        WHERE p.company_id = o.company_id AND p.order_no = o.order_no AND p.type = 'pay'
      ), 0)
    `);
  }

  public async down(): Promise<void> {
    // 数据修复类迁移不提供回滚：把金额改回全 0 只会重新制造不一致
  }
}
