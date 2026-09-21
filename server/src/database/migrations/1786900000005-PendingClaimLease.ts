import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AI 提案的「抢占 + 租约」所需字段。
 *
 * 背景：确认提案原本用一个大事务把工具执行包起来（外层 `SELECT ... FOR UPDATE` 锁行，
 * 内层工具又各自 `dataSource.transaction()`）。那是**两条连接上的两个独立事务**：
 *
 *   1. 外层回滚撤不掉内层已提交的写入 —— 工具把库存扣了、出库单建了并提交，
 *      外层若失败（写状态失败 / 进程被杀 / 连接断），业务已落地而提案仍为 pending，
 *      用户再点一次「确定」就是重复执行一遍。
 *   2. 一个请求占 2 条连接（池子 20 条），10 个并发确认就能抽干连接池，
 *      请求互相等连接、永不返回也不释放。
 *
 * 改成「抢占 + 执行 + 写回」三步之后不再有嵌套事务（全程 1 条连接）。
 * 抢占和执行之间若进程崩溃，提案会停在 executing —— 靠 claimed_at 判断租约是否过期，
 * 过期即判为 failed 交给用户重新发起（绝不自动重放：无法确定工具执行到哪一步）。
 */
export class PendingClaimLease1786900000005 implements MigrationInterface {
  name = 'PendingClaimLease1786900000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const cols: Array<{ n: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS n FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'ai_pending_action' AND column_name = 'claimed_at'`,
    );
    if (Number(cols[0]?.n ?? 0) === 0) {
      await queryRunner.query(
        `ALTER TABLE \`ai_pending_action\`
         ADD COLUMN \`claimed_at\` datetime NULL COMMENT 'executing 抢占时间（租约起点）' AFTER \`confirmed_at\``,
      );
    }

    // 历史数据里可能残留 executing（老代码不会产生，但手动改过库的话会有），统一释放
    await queryRunner.query(
      `UPDATE \`ai_pending_action\`
       SET \`status\` = 'failed',
           \`result\` = '{"error":"执行中断，请重新发起"}',
           \`claimed_at\` = NULL
       WHERE \`status\` = 'executing'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `ai_pending_action` DROP COLUMN `claimed_at`');
  }
}
