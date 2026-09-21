import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 一张订单只能出库/入库一次 —— 数据库层兜底。
 *
 * 背景（实测复现）：`sale_orders.service.ts` 的 outbound() 原先在**事务外**读订单状态、
 * 在事务内无条件 `UPDATE sale_order SET status='outbound'`。事务外那次读到的是快照，
 * 5 个并发出库请求全部通过 `status === 'confirmed'` 校验，于是：
 *   成功 5 / 失败 0，生成 5 张出库单（OB…0001~0005），库存 75 → 50（本该 75 → 70）。
 *
 * 应用层已改为「事务内第一步用条件 UPDATE 抢占状态」（common/utils/claim-status.ts）。
 * 这个唯一索引是最后一道防线：即使将来有人再写出漏掉抢占的代码路径，
 * 数据库也会直接拒绝第二张出库/入库单（errno 1062），而不是静默把库存扣两遍。
 *
 * 注意 order_id 可空（「直接入库」不关联订单）。MySQL 唯一索引允许多个 NULL，
 * 所以直接入库的历史行为不受影响。
 *
 * 加索引前先清理可能已存在的重复行：把重复的**较晚**那些行的 order_id 置空
 * （保留单据本身和明细，只是解除订单关联），避免迁移在已有脏数据的库上直接失败。
 */
export class OrderSingleFlow1786900000002 implements MigrationInterface {
  name = 'OrderSingleFlow1786900000002';

  private readonly targets: Array<{ table: string; col: string; label: string }> = [
    { table: 'sale_outbound', col: 'outbound_no', label: '出库单' },
    { table: 'purchase_inbound', col: 'inbound_no', label: '入库单' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const t of this.targets) {
      // 1. 先把重复关联里的「后一张」解除订单关联（保留单据，只断开关联）
      await queryRunner.query(`
        UPDATE \`${t.table}\` o
        JOIN (
          SELECT company_id, order_id, MIN(id) AS keep_id
          FROM \`${t.table}\`
          WHERE order_id IS NOT NULL
          GROUP BY company_id, order_id
          HAVING COUNT(*) > 1
        ) d
          ON o.company_id = d.company_id
         AND o.order_id = d.order_id
         AND o.id <> d.keep_id
        SET o.order_id = NULL
      `);

      // 2. 加唯一索引（幂等：已存在则跳过）
      const exists: Array<{ n: number }> = await queryRunner.query(
        `SELECT COUNT(*) AS n FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
        [t.table, `uk_${t.table}_order`],
      );
      if (Number(exists[0]?.n ?? 0) > 0) continue;

      await queryRunner.query(
        `ALTER TABLE \`${t.table}\` ADD UNIQUE INDEX \`uk_${t.table}_order\` (\`company_id\`, \`order_id\`)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of this.targets) {
      const exists: Array<{ n: number }> = await queryRunner.query(
        `SELECT COUNT(*) AS n FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
        [t.table, `uk_${t.table}_order`],
      );
      if (Number(exists[0]?.n ?? 0) > 0) {
        await queryRunner.query(`ALTER TABLE \`${t.table}\` DROP INDEX \`uk_${t.table}_order\``);
      }
    }
  }
}
