import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 单号序列计数器。
 *
 * 背景：原先 nextNo() 用 `SELECT COUNT(*)+1` 推算当日序号。并发下所有请求读到
 * 同一个 count，算出同一个单号 —— 唯一索引挡下大部分，然后重试，但重试也是同步的
 * （大家一起重读、一起算出下一个号、再一起撞）。实测 8 个并发建单请求：
 * 3 个成功、5 个直接抛 500「服务器内部错误」，覆盖销售/采购/出库/入库/收付款 5 个入口。
 *
 * 改成独立的计数表，用 INSERT ... ON DUPLICATE KEY UPDATE n = n + 1 做原子自增：
 * 该语句持有行锁直到事务提交，并发请求在此排队，不可能拿到同一个号。
 * 唯一索引保留作为最后一道兜底。
 *
 * 序号按 (公司, 计数器, 日期) 分组 —— 与原实现的「当日序号」语义一致。
 */
export class SeqCounter1786900000001 implements MigrationInterface {
  name = 'SeqCounter1786900000001';

  /** 需要建立计数器的单号列（与 no-generator 的调用点一一对应） */
  private readonly targets: Array<{ table: string; col: string; prefix: string }> = [
    { table: 'sale_order', col: 'order_no', prefix: 'SO' },
    { table: 'purchase_order', col: 'order_no', prefix: 'PO' },
    { table: 'sale_outbound', col: 'outbound_no', prefix: 'OB' },
    { table: 'purchase_inbound', col: 'inbound_no', prefix: 'IB' },
    { table: 'payment', col: 'doc_no', prefix: 'PAY' },
    { table: 'stocktake', col: 'stocktake_no', prefix: 'ST' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`seq_counter\` (
        \`company_id\` int NOT NULL COMMENT '租户',
        \`name\` varchar(64) NOT NULL COMMENT '计数器标识，如 sale_order.order_no',
        \`day\` char(8) NOT NULL COMMENT '日期 YYYYMMDD，序号按天重置',
        \`n\` int NOT NULL DEFAULT 0 COMMENT '当前已分配到的序号',
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`company_id\`,\`name\`,\`day\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='单号序列计数器'
    `);

    /**
     * 回填已有数据：把历史上已用掉的序号同步进计数器。
     * 不做这一步的话，今天已经有 SO202609110002 时会从 0001 重新开始，
     * 撞上已有单号后要连撞两次才能走到 0003。
     *
     * 日期从单号本身截取（而不是 order_date）—— 两者可能不一致
     * （今天补录一张日期为昨天的单子），序号归属必须跟着单号走。
     */
    for (const t of this.targets) {
      const seqFrom = t.prefix.length + 9; // prefix + YYYYMMDD 之后的第一位（1-based）
      await queryRunner.query(
        `INSERT INTO \`seq_counter\` (company_id, name, day, n)
         SELECT company_id,
                ?,
                SUBSTRING(\`${t.col}\`, ${t.prefix.length + 1}, 8),
                MAX(CAST(SUBSTRING(\`${t.col}\`, ${seqFrom}) AS UNSIGNED))
         FROM \`${t.table}\`
         WHERE \`${t.col}\` LIKE ?
         GROUP BY company_id, SUBSTRING(\`${t.col}\`, ${t.prefix.length + 1}, 8)
         ON DUPLICATE KEY UPDATE n = GREATEST(n, VALUES(n))`,
        [`${t.table}.${t.col}`, `${t.prefix}%`],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `seq_counter`');
  }
}
