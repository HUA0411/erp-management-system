import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import dataSource from '../src/database/data-source';
import { assertTestDatabase } from './assert-test-db';

/**
 * 接口契约与权限矩阵回归测试。
 *
 * 这里的每个用例都对应一个**实测发生过的**缺陷：
 *
 * 1. 分页参数写成交叉类型 `PaginationDto & {...}` → 编译后 metatype 是 Object，
 *    ValidationPipe 整个跳过校验 → DTO 默认值不生效 → `skip(NaN)` →
 *    `GET /api/products`（不带任何参数）直接 500。同类共 11 个接口。
 *    另外 `@Max(100)` 失效，`pageSize=100000` 一次拉走整张表。
 *
 * 2. `products` / `inventory` 的列表用 `getRawMany()` 且带 join，
 *    TypeORM 只在无 join 时才把 skip/take 当 LIMIT/OFFSET，于是**分页被静默丢弃** ——
 *    第 1/2/3 页返回完全相同的一整批数据，分页器是假的。
 *
 * 3. 权限码 `product:view` / `customer:view` / `supplier:view` 在权限表里**根本不存在**，
 *    而这三个 controller 的列表接口要求它们 → 除超管外**所有角色打开商品/客户/供应商管理都是 403**，
 *    但左侧菜单又是显示的（他们有 base:product 等菜单权限），点进去就报错。
 *
 * 4. 同样这三个 controller 的 `options` 下拉接口**没有 @RequirePermissions**，
 *    而 PermissionsGuard 对没声明权限的接口直接放行 → 任何登录用户都能拉到
 *    全量商品（含 purchasePrice 采购成本价）、客户、供应商。
 */
describe('接口契约与权限矩阵 e2e（真实 MySQL）', () => {
  let app: INestApplication;

  const http = () => request(app.getHttpServer());
  const isOk = (res: request.Response): boolean => res.status < 300 && res.body?.code === 0;

  const login = async (username: string): Promise<string> => {
    const res = await http()
      .post('/api/auth/login')
      .send({ companyCode: 'DEMO', username, password: '123456' });
    expect(res.status).toBe(201);
    return res.body.data.token as string;
  };
  const auth = (token: string) => (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    assertTestDatabase();
    if (!dataSource.isInitialized) await dataSource.initialize();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 60000);

  afterAll(async () => {
    await app.close();
    if (dataSource.isInitialized) await dataSource.destroy();
  });

  // ───────────────────────────────────── 1. 分页参数校验
  describe('分页参数校验', () => {
    let token: string;
    beforeAll(async () => {
      token = await login('admin');
    });

    const listPaths = [
      '/api/products',
      '/api/customers',
      '/api/suppliers',
      '/api/inventory',
      '/api/inventory/records',
      '/api/sale-orders',
      '/api/purchase-orders',
      '/api/sale-outbounds',
      '/api/purchase-inbounds',
      '/api/payments',
      '/api/stocktakes',
    ];

    it.each(listPaths)('%s 不带任何查询参数也能返回 200（而不是 500）', async (path) => {
      const res = await auth(token)(http().get(path));
      expect(isOk(res)).toBe(true);
      // 默认值必须真的生效，而不是 undefined
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.pageSize).toBe(10);
    });

    it.each(listPaths)('%s 拒绝越界的 page / pageSize', async (path) => {
      const sep = path.includes('?') ? '&' : '?';
      for (const bad of ['page=0', 'page=-1', 'pageSize=0', 'pageSize=-1', 'pageSize=101', 'pageSize=abc']) {
        const res = await auth(token)(http().get(`${path}${sep}${bad}`));
        expect(res.status).toBe(400);
      }
    });

    it('pageSize 上限 100 会挡住「一次拉全表」的请求', async () => {
      const res = await auth(token)(http().get('/api/customers?page=1&pageSize=100000'));
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain('100');
    });
  });

  // ───────────────────────────────────── 2. 分页真的生效
  describe('列表分页真的在切数据', () => {
    let token: string;
    beforeAll(async () => {
      token = await login('admin');
    });

    /**
     * products / inventory 走的是 getRawMany() + join，
     * 正是「skip/take 被静默丢弃」的那两条路径，必须单独盯住。
     */
    it.each(['/api/products', '/api/inventory'])('%s 第 1 页与第 2 页返回不同的行', async (path) => {
      const p1 = await auth(token)(http().get(`${path}?page=1&pageSize=2`));
      const p2 = await auth(token)(http().get(`${path}?page=2&pageSize=2`));
      expect(isOk(p1)).toBe(true);
      expect(isOk(p2)).toBe(true);

      expect(p1.body.data.list).toHaveLength(2);
      expect(p2.body.data.list).toHaveLength(2);

      const idOf = (item: Record<string, unknown>) => item.id ?? item.productId;
      expect(idOf(p1.body.data.list[0])).not.toBe(idOf(p2.body.data.list[0]));
    });

    it('/api/products 返回行数不超过 pageSize（修复前是整表）', async () => {
      const res = await auth(token)(http().get('/api/products?page=1&pageSize=2'));
      expect(res.body.data.list.length).toBeLessThanOrEqual(2);
      // total 仍然要反映真实总数，否则前端分页器会算错
      expect(res.body.data.total).toBeGreaterThan(2);
    });
  });

  // ───────────────────────────────────── 3. 权限矩阵
  describe('权限矩阵：每个角色都能干菜单里写着能干的活', () => {
    /**
     * 期望值来自 seed 的角色定义（roleTemplates）。
     * 403 不是「越权被拦住」，而是「这个角色本来就不该有这个菜单」。
     */
    const cases: Array<{ user: string; role: string; expect: Record<string, number> }> = [
      { user: 'admin', role: '超管', expect: { products: 200, customers: 200, suppliers: 200 } },
      { user: 'zhangsan', role: '采购员', expect: { products: 200, customers: 403, suppliers: 200 } },
      { user: 'lisi', role: '销售员', expect: { products: 200, customers: 200, suppliers: 403 } },
      { user: 'wangwu', role: '仓管员', expect: { products: 200, customers: 403, suppliers: 403 } },
      { user: 'zhaoliu', role: '财务', expect: { products: 403, customers: 200, suppliers: 200 } },
    ];

    it.each(cases)('$role（$user）访问商品/客户/供应商', async ({ user, expect: want }) => {
      const token = await login(user);
      const paths: Record<string, string> = {
        products: '/api/products?page=1&pageSize=1',
        customers: '/api/customers?page=1&pageSize=1',
        suppliers: '/api/suppliers?page=1&pageSize=1',
      };
      for (const [key, path] of Object.entries(paths)) {
        const res = await auth(token)(http().get(path));
        expect({ key, status: res.status }).toEqual({ key, status: want[key] });
      }
    });

    it('下拉选项接口不能对未授权角色开放（含采购成本价泄漏）', async () => {
      // 财务角色没有商品菜单，就不该拿到商品下拉（里面带 purchasePrice）
      const token = await login('zhaoliu');
      const res = await auth(token)(http().get('/api/products/options'));
      expect(res.status).toBe(403);
    });

    it('下拉选项接口对已授权角色正常返回', async () => {
      const token = await login('lisi');
      const res = await auth(token)(http().get('/api/products/options'));
      expect(isOk(res)).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('roles/options 只对持 system:role:view 的角色开放', async () => {
      const sales = await login('lisi');
      expect((await auth(sales)(http().get('/api/roles/options'))).status).toBe(403);

      const admin = await login('admin');
      expect((await auth(admin)(http().get('/api/roles/options'))).status).toBe(200);
    });
  });

  // ───────────────────────────────────── 4. 权限定义本身完好
  describe('权限定义完整性', () => {
    it('所有 @RequirePermissions 用到的权限码都必须真实存在于权限表', async () => {
      /**
       * 这是本组缺陷的根因防护：`product:view` 等码当初压根没建，
       * 导致守卫永远返回 403。代码里写了权限码、库里没有 —— 必须让测试先炸。
       */
      const rows: Array<{ code: string }> = await dataSource.query('SELECT code FROM sys_permission');
      const existing = new Set(rows.map((r) => r.code));

      const { readFileSync, readdirSync, statSync } = await import('fs');
      const { join } = await import('path');
      const walk = (dir: string, out: string[] = []): string[] => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full, out);
          else if (name.endsWith('.controller.ts')) out.push(full);
        }
        return out;
      };

      const used = new Set<string>();
      for (const file of walk(join(__dirname, '../src'))) {
        const src = readFileSync(file, 'utf8');
        for (const m of src.matchAll(/@RequirePermissions\(([^)]*)\)/g)) {
          for (const c of m[1].matchAll(/'([^']+)'/g)) used.add(c[1]);
        }
      }

      expect(used.size).toBeGreaterThan(20);
      const missing = [...used].filter((c) => !existing.has(c)).sort();
      expect(missing).toEqual([]);
    });
  });

  // ───────────────────────────────────── 5. 收付款幂等
  describe('收付款登记幂等（防双击重复登记）', () => {
    let token: string;
    let partnerId: number;

    const newRequestId = () => `test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    beforeAll(async () => {
      token = await login('admin');
      const c = await auth(token)(http().get('/api/customers/options'));
      partnerId = c.body.data[0].id;
    });

    const payload = (requestId: string) => ({
      type: 'receive',
      partnerType: 'customer',
      partnerId,
      amount: 12.34,
      payDate: '2026-09-21',
      method: '银行转账',
      remark: 'IDEMPOTENCY-E2E',
      requestId,
    });

    const cleanup = () => dataSource.query("DELETE FROM payment WHERE remark = 'IDEMPOTENCY-E2E'");
    beforeEach(cleanup);
    afterAll(cleanup);

    it('同一个 requestId 提交 5 次只落一条单，且 docNo 相同', async () => {
      const rid = newRequestId();
      const results = await Promise.all(
        Array.from({ length: 5 }, () => auth(token)(http().post('/api/payments').send(payload(rid)))),
      );
      expect(results.filter((r) => !isOk(r)).map((r) => JSON.stringify(r.body))).toEqual([]);
      expect(results.every(isOk)).toBe(true);

      const docNos = new Set(results.map((r) => r.body.data.docNo));
      expect(docNos.size).toBe(1);

      const rows: Array<{ n: number }> = await dataSource.query(
        'SELECT COUNT(*) AS n FROM payment WHERE remark = ?',
        ['IDEMPOTENCY-E2E'],
      );
      // 修复前这里是 5 —— 往来账直接翻 5 倍
      expect(Number(rows[0].n)).toBe(1);
    });

    it('串行重复提交（请求超时后用户再点一次）同样只落一条', async () => {
      const rid = newRequestId();
      const first = await auth(token)(http().post('/api/payments').send(payload(rid)));
      const second = await auth(token)(http().post('/api/payments').send(payload(rid)));
      expect(isOk(first)).toBe(true);
      expect(isOk(second)).toBe(true);
      expect(second.body.data.id).toBe(first.body.data.id);

      const rows: Array<{ n: number }> = await dataSource.query(
        'SELECT COUNT(*) AS n FROM payment WHERE remark = ?',
        ['IDEMPOTENCY-E2E'],
      );
      expect(Number(rows[0].n)).toBe(1);
    });

    it('不同 requestId 是两笔独立业务，正常各落一条', async () => {
      await auth(token)(http().post('/api/payments').send(payload(newRequestId())));
      await auth(token)(http().post('/api/payments').send(payload(newRequestId())));
      const rows: Array<{ n: number }> = await dataSource.query(
        'SELECT COUNT(*) AS n FROM payment WHERE remark = ?',
        ['IDEMPOTENCY-E2E'],
      );
      expect(Number(rows[0].n)).toBe(2);
    });

    it('不带 requestId 时保持原行为（AI 工具等调用方不受影响）', async () => {
      const body = payload('');
      delete (body as Record<string, unknown>).requestId;
      const res = await auth(token)(http().post('/api/payments').send(body));
      expect(isOk(res)).toBe(true);
      const rows: Array<{ n: number }> = await dataSource.query(
        'SELECT COUNT(*) AS n FROM payment WHERE remark = ?',
        ['IDEMPOTENCY-E2E'],
      );
      expect(Number(rows[0].n)).toBe(1);
    });

    it('数据库唯一索引存在（应用层判断失误时兜底）', async () => {
      const rows: Array<{ n: number }> = await dataSource.query(
        `SELECT COUNT(*) AS n FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = 'payment' AND index_name = 'uk_payment_request'`,
      );
      expect(Number(rows[0].n)).toBeGreaterThan(0);
    });
  });

  // ───────────────────────────────────── 6. 收付款回写订单已收金额
  describe('收付款回写订单已收/已付', () => {
    let token: string;
    let customerId: number;
    let productId: number;

    const cleanup = async () => {
      await dataSource.query("DELETE FROM payment WHERE remark = 'PAID-SYNC-E2E'");
      await dataSource.query(
        "DELETE FROM sale_order_item WHERE order_id IN (SELECT id FROM sale_order WHERE remark = 'PAID-SYNC-E2E')",
      );
      await dataSource.query("DELETE FROM sale_order WHERE remark = 'PAID-SYNC-E2E'");
    };

    beforeAll(async () => {
      token = await login('admin');
      const c = await auth(token)(http().get('/api/customers?page=1&pageSize=1'));
      customerId = c.body.data.list[0].id;
      const p = await auth(token)(http().get('/api/products?page=1&pageSize=1'));
      productId = p.body.data.list[0].id;
    });
    beforeEach(cleanup);
    afterAll(cleanup);

    it('登记收款后订单 paid_amount 被回写；删除收款后又归零', async () => {
      const order = await auth(token)(http().post('/api/sale-orders')).send({
        customerId,
        orderDate: '2026-09-21',
        remark: 'PAID-SYNC-E2E',
        items: [{ productId, quantity: 1, price: 100 }],
      });
      const orderNo = order.body.data.orderNo as string;

      // 修复前 paid_amount 永远是 0 —— 全代码库没有任何写它的路径
      let rows: Array<{ paid_amount: string }> = await dataSource.query(
        'SELECT paid_amount FROM sale_order WHERE order_no = ?',
        [orderNo],
      );
      expect(Number(rows[0].paid_amount)).toBe(0);

      const pay = await auth(token)(http().post('/api/payments')).send({
        type: 'receive',
        partnerType: 'customer',
        partnerId: customerId,
        amount: 60,
        orderNo,
        payDate: '2026-09-21',
        method: '银行转账',
        remark: 'PAID-SYNC-E2E',
      });
      expect(isOk(pay)).toBe(true);

      rows = await dataSource.query('SELECT paid_amount FROM sale_order WHERE order_no = ?', [orderNo]);
      expect(Number(rows[0].paid_amount)).toBe(60);

      // 再收 40，累计到 100（按 order_no 求和后整体赋值，不是累加）
      await auth(token)(http().post('/api/payments')).send({
        type: 'receive',
        partnerType: 'customer',
        partnerId: customerId,
        amount: 40,
        orderNo,
        payDate: '2026-09-21',
        method: '银行转账',
        remark: 'PAID-SYNC-E2E',
      });
      rows = await dataSource.query('SELECT paid_amount FROM sale_order WHERE order_no = ?', [orderNo]);
      expect(Number(rows[0].paid_amount)).toBe(100);

      // 删掉其中一笔，金额自动回到正确值
      const list = await auth(token)(http().get('/api/payments?page=1&pageSize=100'));
      const target = (list.body.data.list as Array<{ id: number; orderNo: string; amount: number }>).find(
        (p) => p.orderNo === orderNo && Number(p.amount) === 40,
      );
      await auth(token)(http().delete(`/api/payments/${target!.id}`));
      rows = await dataSource.query('SELECT paid_amount FROM sale_order WHERE order_no = ?', [orderNo]);
      expect(Number(rows[0].paid_amount)).toBe(60);
    }, 60000);
  });
});
