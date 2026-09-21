import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 账号级登录锁定（跨进程有效）。
 *
 * 三个登录侧缺陷一起收掉：
 *
 * 1. **错误码可枚举公司编码**：原来「公司编码不存在」返回 40101、「密码错误」返回 40102。
 *    攻击者拿一份公司名列表逐个试，靠错误码差别就能筛出哪些公司真实存在，
 *    再针对性地爆破用户名密码。现在四种失败统一成 40101 + 同一句文案。
 *
 * 2. **bcrypt 只在用户存在时执行 → 时序枚举用户名**：`!user || !compareSync(...)` 是短路的，
 *    用户名不存在时直接跳过 bcrypt（bcrypt 占了整个请求大部分耗时），
 *    「响应特别快」就等于「这个用户名不存在」。现在用户不存在时也拿固定假哈希跑一次。
 *
 * 3. **PM2 集群下限流被放大**：控制器上的 @Throttle 计数器在**单进程内存**里，
 *    `instances: 'max'` 起 N 个进程 → 实际限额变成 8×N；换 IP 也能绕过。
 *    这里加数据库层的账号锁定：连续失败 5 次锁 15 分钟，与进程数、来源 IP 都无关。
 *    IP 限流仍然保留，两者互补（前者挡单账号爆破，后者挡广撒网）。
 */
export class LoginLockout1786900000007 implements MigrationInterface {
  name = 'LoginLockout1786900000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const has = async (col: string): Promise<boolean> => {
      const rows: Array<{ n: number }> = await queryRunner.query(
        `SELECT COUNT(*) AS n FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'sys_user' AND column_name = ?`,
        [col],
      );
      return Number(rows[0]?.n ?? 0) > 0;
    };

    if (!(await has('failed_attempts'))) {
      await queryRunner.query(
        `ALTER TABLE \`sys_user\`
         ADD COLUMN \`failed_attempts\` int NOT NULL DEFAULT 0 COMMENT '连续登录失败次数'
         AFTER \`pwd_changed_at\``,
      );
    }
    if (!(await has('locked_until'))) {
      await queryRunner.query(
        `ALTER TABLE \`sys_user\`
         ADD COLUMN \`locked_until\` datetime NULL COMMENT '锁定截止时间'
         AFTER \`failed_attempts\``,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `sys_user` DROP COLUMN `locked_until`');
    await queryRunner.query('ALTER TABLE `sys_user` DROP COLUMN `failed_attempts`');
  }
}
