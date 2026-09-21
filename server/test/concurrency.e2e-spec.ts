import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import dataSource from '../src/database/data-source';
import { assertTestDatabase } from './assert-test-db';

/**
 * 并发回归测试。
 *
 * 这里每个用例都对应一个**实际发生过的**并发缺陷，不是假想的：
 *
 *   1. 并发建单重复单号 —— 原先 nextNo() 用 `SELECT COUNT(*)+1` 推算序号。
 *      实测 20 个并发请求拿到重复单号、部分直接 500。已改用 seq_counter 原子自增。
 *
 *   2. 同一订单重复出库 —— 原先 outbound() 在事务外读 status、事务内无条件改 status。
 *      实测 5 个并发请求全部成功、生成 5 张出库单、库存 75→50（本该 75→70）。
 *      已改为事务内第一步用条件 UPDATE 抢占状态（claim-status.ts）。
 *
 *   3. 并发确认订单 —— 同一模式，5 个请求都能把 draft 改成 confirmed。
 *
 *   4. 超卖 —— 并发扣减同一商品的库存，成功数量之和不得超过可用量。
 *
 * 这些用例的价值在于：**它们会真的失败**（在修复前跑必红），
 * 而不是那种无论代码怎么写都通过的断言。
 *
 * 注意：依赖真实 MySQL（库名必须以 _test 结尾），与其它 e2e 共用 erp_system_test。
 */
describe('并发一致性 e2e（真实 MySQL）', () => {
  let app: INestApplication;
  let token: string;
  let companyId: number;
  let customerId: number;
  let productId: number;

  const http = () => request(app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

  /** 业务异常返回 HTTP 200 + body.code，所以成功判定必须同时看 code */
  const isOk = (res: request.Response): boolean => res.status < 300 && res.body?.code === 0;

  beforeAll(async () => {
    assertTestDatabase();
    // 直接用 dataSource 读库存/自查单表做断言 —— 绕过接口层，避免分页和字段名干扰
    if (!dataSource.isInitialized) await dataSource.initialize();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const res = await http()
      .post('/api/auth/login')
      .send({ companyCode: 'DEMO', username: 'admin', password: '123456' });
    expect(res.status).toBe(201);
    token = res.body.data.token;
    // companyId 在 data.user 里，不在 data 顶层
    companyId = res.body.data.user.companyId;
    expect(companyId).toBeGreaterThan(0);

    const customers = await auth(http().get('/api/customers?page=1&pageSize=1'));
    customerId = customers.body.data.list[0].id;

    const products = await auth(http().get('/api/products?page=1&pageSize=1'));
    productId = products.body.data.list[0].id;
  }, 60000);

  /** 直接读库存表，绕过接口层，避免分页/字段名干扰 */
  const stockOf = async (pid: number): Promise<number> => {
    const rows = await dataSource.query(
      'SELECT quantity FROM inventory WHERE company_id = ? AND product_id = ?',
      [companyId, pid],
    );
    return Number(rows[0]?.quantity ?? 0);
  };

  const setStock = (pid: number, qty: number) =>
    dataSource.query('UPDATE inventory SET quantity = ? WHERE company_id = ? AND product_id = ?', [
      qty,
      companyId,
      pid,
    ]);

  const createOrder = async (qty: number, remark: string) => {
    const res = await auth(http().post('/api/sale-orders')).send({
      customerId,
      orderDate: '2026-09-21',
      remark,
      items: [{ productId, quantity: qty, price: 10 }],
    });
    expect(isOk(res)).toBe(true);
    return res.body.data as { id: number; orderNo: string };
  };

  const cleanup = async () => {
    await dataSource.query(
      "DELETE FROM sale_outbound_item WHERE outbound_id IN (SELECT id FROM sale_outbound WHERE remark LIKE 'CONC-TEST%')",
    );
    await dataSource.query("DELETE FROM sale_outbound WHERE remark LIKE 'CONC-TEST%'");
    await dataSource.query(
      "DELETE FROM inventory_record WHERE ref_no IN (SELECT order_no FROM sale_order WHERE remark LIKE 'CONC-TEST%')",
    );
    await dataSource.query(
      "DELETE FROM inventory_record WHERE ref_no IN (SELECT outbound_no FROM sale_outbound WHERE remark LIKE 'CONC-TEST%')",
    );
    await dataSource.query(
      "DELETE FROM sale_order_item WHERE order_id IN (SELECT id FROM sale_order WHERE remark LIKE 'CONC-TEST%')",
    );
    await dataSource.query("DELETE FROM sale_order WHERE remark LIKE 'CONC-TEST%'");
  };

  beforeEach(cleanup);

  afterAll(async () => {
    await cleanup();
    await app.close();
    if (dataSource.isInitialized) await dataSource.destroy();
  });

  // ─────────────────────────────────────────────── 1
  it('20 个并发建单：全部成功且单号互不重复', async () => {
    const N = 20;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        auth(http().post('/api/sale-orders')).send({
          customerId,
          orderDate: '2026-09-21',
          remark: `CONC-TEST-${i}`,
          items: [{ productId, quantity: 1, price: 10 }],
        }),
      ),
    );

    const ok = results.filter(isOk);
    const failed = results.filter((r) => !isOk(r));
    // 修复前：3 个成功、5 个 500
    expect(failed.map((r) => r.body?.message)).toEqual([]);
    expect(ok).toHaveLength(N);

    const nos = ok.map((r) => r.body.data.orderNo);
    expect(new Set(nos).size).toBe(N);

    // 单号必须真的落在库里，且序列连续无重号
    const rows: Array<{ order_no: string }> = await dataSource.query(
      "SELECT order_no FROM sale_order WHERE remark LIKE 'CONC-TEST-%'",
    );
    expect(new Set(rows.map((r) => r.order_no)).size).toBe(N);
  }, 60000);

  // ─────────────────────────────────────────────── 2
  it('同一订单 5 个并发出库：只生成一张出库单、只扣一次库存', async () => {
    const order = await createOrder(5, 'CONC-TEST-outbound');
    await auth(http().put(`/api/sale-orders/${order.id}/confirm`));

    const before = await stockOf(productId);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => auth(http().put(`/api/sale-orders/${order.id}/outbound`))),
    );

    const ok = results.filter(isOk);
    const failed = results.filter((r) => !isOk(r));

    // 修复前这里是 ok.length === 5、failed.length === 0
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(4);
    expect(failed.every((r) => r.body.code === 40040)).toBe(true);

    // 数据库里该订单只能有一张出库单
    const outbounds: Array<{ n: number }> = await dataSource.query(
      'SELECT COUNT(*) AS n FROM sale_outbound WHERE company_id = ? AND order_id = ?',
      [companyId, order.id],
    );
    expect(Number(outbounds[0].n)).toBe(1);

    // 修复前这里是 -25
    expect((await stockOf(productId)) - before).toBe(-5);

    // 订单状态正确落到 outbound
    const order2 = await auth(http().get(`/api/sale-orders/${order.id}`));
    expect(order2.body.data.status).toBe('outbound');
  }, 60000);

  // ─────────────────────────────────────────────── 3
  it('同一订单 5 个并发确认：只有 1 个生效', async () => {
    const order = await createOrder(1, 'CONC-TEST-confirm');

    const results = await Promise.all(
      Array.from({ length: 5 }, () => auth(http().put(`/api/sale-orders/${order.id}/confirm`))),
    );
    expect(results.filter(isOk)).toHaveLength(1);
    expect(results.filter((r) => !isOk(r)).every((r) => r.body.code === 40031)).toBe(true);
  }, 60000);

  // ─────────────────────────────────────────────── 4
  it('10 个并发订单抢一半库存：成功扣减总量不超过可用量（不超卖）', async () => {
    await setStock(productId, 40);

    // 每个订单要 21 件 —— 40 件库存最多只够 1 个
    const orders = [];
    for (let i = 0; i < 10; i++) {
      orders.push(await createOrder(21, `CONC-TEST-oversell-${i}`));
    }
    for (const o of orders) {
      await auth(http().put(`/api/sale-orders/${o.id}/confirm`));
    }

    const results = await Promise.all(
      orders.map((o) => auth(http().put(`/api/sale-orders/${o.id}/outbound`))),
    );
    const ok = results.filter(isOk).length;

    expect(ok).toBe(1);
    expect(await stockOf(productId)).toBe(19);
    expect(await stockOf(productId)).toBeGreaterThanOrEqual(0);

    // 出库单数量必须等于成功次数，不能多
    const cnt: Array<{ n: number }> = await dataSource.query(
      `SELECT COUNT(*) AS n FROM sale_outbound WHERE company_id = ? AND order_id IN (${orders.map(() => '?').join(',')})`,
      [companyId, ...orders.map((o) => o.id)],
    );
    expect(Number(cnt[0].n)).toBe(ok);
  }, 120000);
});
