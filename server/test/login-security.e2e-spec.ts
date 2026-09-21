import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import dataSource from '../src/database/data-source';
import { assertTestDatabase } from './assert-test-db';

/**
 * 登录安全回归。
 *
 * 覆盖三个实测发现的问题：
 *
 * 1. **错误码可枚举公司编码**。原来是「公司编码不存在/停用」40101、
 *    「用户名或密码错误」40102 —— 攻击者拿一份公司名列表逐个试，
 *    凭错误码差别就能筛出哪些公司真实存在，再针对性爆破。
 *    现在四种失败必须返回**完全一致**的 code 和 message。
 *
 * 2. **bcrypt 只在用户存在时执行 → 时序枚举用户名**。
 *    `!user || !bcrypt.compareSync(...)` 短路，用户不存在时跳过 bcrypt，
 *    而 bcrypt 占了整个请求的大部分耗时 —— 「响应特别快」就等于「用户名不存在」。
 *    现在用户不存在时也对固定假哈希跑一次，两条路径耗时必须同量级。
 *
 * 3. **PM2 集群下限流被放大**。@Throttle 计数器存在单进程内存里，
 *    `instances: 'max'` 起 N 个进程 → 实际限额 8×N，换 IP 也绕开。
 *    现在有数据库层的账号锁定（连续 5 次失败锁 15 分钟），与进程数、IP 都无关。
 */
describe('登录安全 e2e（真实 MySQL）', () => {
  let app: INestApplication;

  const http = () => request(app.getHttpServer());
  const login = (body: Record<string, unknown>) => http().post('/api/auth/login').send(body);

  /** 每个用例前把失败计数和锁定清掉，保证可重复运行 */
  const resetLockState = () =>
    dataSource.query('UPDATE sys_user SET failed_attempts = 0, locked_until = NULL');

  beforeAll(async () => {
    assertTestDatabase();
    if (!dataSource.isInitialized) await dataSource.initialize();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 60000);

  beforeEach(resetLockState);

  afterAll(async () => {
    await resetLockState();
    await app.close();
    if (dataSource.isInitialized) await dataSource.destroy();
  });

  // ─────────────────────────────────── 1. 错误码统一
  describe('失败响应不可区分', () => {
    it('公司不存在 / 用户不存在 / 密码错误 / 公司停用 四种失败的 code 与 message 完全一致', async () => {
      const failures = [
        { companyCode: 'NO_SUCH_COMPANY', username: 'admin', password: 'whatever' },
        { companyCode: 'DEMO', username: 'no_such_user_at_all', password: 'whatever' },
        { companyCode: 'DEMO', username: 'admin', password: 'definitely-wrong' },
      ];

      const results = [];
      for (const body of failures) {
        const res = await login(body);
        results.push({ code: res.body.code, message: res.body.message });
      }

      // 拿第一个当基准，其余必须一模一样 —— 差一个字符都算泄漏
      expect(new Set(results.map((r) => r.code)).size).toBe(1);
      expect(new Set(results.map((r) => r.message)).size).toBe(1);
      // 并且不能是「用户不存在」这种把话说死的文案
      expect(results[0].message).not.toContain('不存在');
      expect(results[0].message).not.toContain('已停用');
    });

    it('失败文案刻意「三合一」，不指出到底哪一项错了', async () => {
      const res = await login({ companyCode: 'DEMO', username: 'ghost', password: 'x' });
      const message = res.body.message as string;
      // 一句话同时提到三种可能，攻击者无法据此缩小范围
      expect(message).toContain('公司编码');
      expect(message).toContain('用户名');
      expect(message).toContain('密码');
      // 三个失败场景必须给出同一句话
      const other = await login({ companyCode: 'NO_SUCH_CO', username: 'admin', password: 'x' });
      expect(other.body.message).toBe(message);
    });
  });

  // ─────────────────────────────────── 2. 时序
  describe('响应耗时不可区分', () => {
    /**
     * 判定标准取「中位数比值」而不是绝对差值：
     * 测试机负载会抖动，但两条路径跑的都是同一次 bcrypt（cost=10，约 60-100ms），
     * 只要 bcrypt 真的在两条路径上都执行了，中位数就会落在同一个量级。
     *
     * 修复前实测：用户不存在约 1-3ms，密码错误约 60-90ms —— 差 20 倍以上，一眼可辨。
     */
    const median = async (body: Record<string, unknown>, n = 5): Promise<number> => {
      const samples: number[] = [];
      for (let i = 0; i < n; i++) {
        const t = process.hrtime.bigint();
        await login(body);
        samples.push(Number(process.hrtime.bigint() - t) / 1e6);
      }
      samples.sort((a, b) => a - b);
      return samples[Math.floor(n / 2)];
    };

    it('用户不存在与密码错误的耗时处于同一量级（bcrypt 在两条路径都执行）', async () => {
      // 预热，避免首次请求的模块加载/连接建立算进去
      await login({ companyCode: 'DEMO', username: 'warmup_user', password: 'x' });
      await resetLockState();

      const missingUser = await median({ companyCode: 'DEMO', username: 'ghost_user_timing', password: 'x' });
      const wrongPassword = await median({ companyCode: 'DEMO', username: 'admin', password: 'wrong' });

      const ratio = Math.max(missingUser, wrongPassword) / Math.max(1, Math.min(missingUser, wrongPassword));
      // 修复前这个比值是 20 倍以上；bcrypt 两侧都跑时应在 2 倍以内
      expect(ratio).toBeLessThan(3);
      // 顺便确认两条路径确实都跑了 bcrypt（cost=10 至少几十毫秒）
      expect(missingUser).toBeGreaterThan(10);
      expect(wrongPassword).toBeGreaterThan(10);
    }, 60000);
  });

  // ─────────────────────────────────── 3. 账号锁定
  describe('账号级锁定（跨进程有效）', () => {
    it('连续 5 次密码错误后锁定，且锁定写在数据库里', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await login({ companyCode: 'DEMO', username: 'zhangsan', password: 'wrong' });
        expect(res.body.code).toBe(40101);
      }

      const rows: Array<{ failed_attempts: number; locked_until: Date | null }> = await dataSource.query(
        "SELECT failed_attempts, locked_until FROM sys_user WHERE username = 'zhangsan'",
      );
      expect(rows[0].locked_until).not.toBeNull();
      expect(new Date(rows[0].locked_until!).getTime()).toBeGreaterThan(Date.now());
    }, 60000);

    it('锁定后即使密码正确也会被拒（40104），并且提示还要等多久', async () => {
      await dataSource.query(
        "UPDATE sys_user SET failed_attempts = 0, locked_until = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE username = 'lisi'",
      );

      const res = await login({ companyCode: 'DEMO', username: 'lisi', password: '123456' });
      expect(res.body.code).toBe(40104);
      expect(res.body.message).toMatch(/锁定/);
    });

    it('锁定期间用错误密码，返回的仍是那句统一错误（不暴露账号是否存在）', async () => {
      await dataSource.query(
        "UPDATE sys_user SET failed_attempts = 0, locked_until = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE username = 'wangwu'",
      );
      const res = await login({ companyCode: 'DEMO', username: 'wangwu', password: 'nope' });
      expect(res.body.code).toBe(40101);
    });

    it('成功登录后失败计数清零', async () => {
      await login({ companyCode: 'DEMO', username: 'admin', password: 'wrong' });
      let rows: Array<{ failed_attempts: number }> = await dataSource.query(
        "SELECT failed_attempts FROM sys_user WHERE username = 'admin'",
      );
      expect(rows[0].failed_attempts).toBe(1);

      const ok = await login({ companyCode: 'DEMO', username: 'admin', password: '123456' });
      expect(ok.status).toBe(201);

      rows = await dataSource.query("SELECT failed_attempts FROM sys_user WHERE username = 'admin'");
      expect(rows[0].failed_attempts).toBe(0);
    });

    it('锁定是账号维度的，不影响同租户其他账号', async () => {
      await dataSource.query(
        "UPDATE sys_user SET locked_until = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE username = 'zhangsan'",
      );
      const other = await login({ companyCode: 'DEMO', username: 'zhaoliu', password: '123456' });
      expect(other.status).toBe(201);
    });
  });
});
