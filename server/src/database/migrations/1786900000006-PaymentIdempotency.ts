import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 收付款单的业务幂等键。
 *
 * 缺陷：同一个「登记收款」双击两次（或请求超时后用户再点一次）会产生**两张单据**，
 * 往来账被翻倍。原有的 `(company_id, doc_no)` 唯一索引完全挡不住 ——
 * docNo 是服务端每次现取的当日序号，两次请求必然不同号，两张都能插入成功。
 *
 * 修法：客户端在**打开登记弹窗时**生成一个 UUID 作为 requestId，
 * 同一次填写不管提交几次都带同一个键；服务端先按 (company_id, request_id) 查，
 * 命中就直接返回首次创建的那条。唯一索引放在数据库层，
 * 并发请求同时通过存在性检查时，后到的那个吃 1062、被转成幂等返回。
 *
 * 不用「给 order_no 加唯一约束」那种做法：一张订单分多次收款是正常业务，
 * 唯一约束会把合法的部分收款也挡掉。
 */
export class PaymentIdempotency1786900000006 implements MigrationInterface {
  name = 'PaymentIdempotency1786900000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const cols: Array<{ n: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS n FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'payment' AND column_name = 'request_id'`,
    );
    if (Number(cols[0]?.n ?? 0) === 0) {
      await queryRunner.query(
        `ALTER TABLE \`payment\`
         ADD COLUMN \`request_id\` varchar(64) NULL COMMENT '幂等键（客户端生成 UUID）' AFTER \`order_no\``,
      );
    }

    const idx: Array<{ n: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS n FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = 'payment' AND index_name = 'uk_payment_request'`,
    );
    if (Number(idx[0]?.n ?? 0) === 0) {
      // request_id 允许为空（老数据、以及不带幂等键的调用方如 AI 工具），
      // MySQL 唯一索引允许多个 NULL，不影响它们。
      await queryRunner.query(
        'ALTER TABLE `payment` ADD UNIQUE INDEX `uk_payment_request` (`company_id`, `request_id`)',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const idx: Array<{ n: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS n FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = 'payment' AND index_name = 'uk_payment_request'`,
    );
    if (Number(idx[0]?.n ?? 0) > 0) {
      await queryRunner.query('ALTER TABLE `payment` DROP INDEX `uk_payment_request`');
    }
    await queryRunner.query('ALTER TABLE `payment` DROP COLUMN `request_id`');
  }
}
