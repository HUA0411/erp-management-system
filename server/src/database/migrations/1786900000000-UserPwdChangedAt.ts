import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 会话吊销支持：记录密码最后修改时间。
 *
 * 背景：JWT 是无状态的，签发后 8 小时内无法撤销。原实现里
 *   - 用户改了密码，旧 token 照样能用到过期
 *   - 管理员把账号「停用」（status=0），已登录的用户不受任何影响
 *   - 超管被降权，token 里的 isSuperAdmin=true 仍然放行所有权限校验
 * 加这一列之后，token 里带上签发时的 pwd_changed_at，每次请求比对一次即可发现失效。
 */
export class UserPwdChangedAt1786900000000 implements MigrationInterface {
  name = 'UserPwdChangedAt1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `sys_user` ADD `pwd_changed_at` datetime(6) NULL COMMENT '密码最后修改时间，用于吊销旧 JWT'",
    );
    // 回填：老用户视为从未改过密码，取创建时间，避免与新签发 token 的时间戳比较时误判
    await queryRunner.query('UPDATE `sys_user` SET `pwd_changed_at` = `created_at` WHERE `pwd_changed_at` IS NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `sys_user` DROP COLUMN `pwd_changed_at`');
  }
}
