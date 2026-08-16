import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('ERP API e2e（真实 MySQL）', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (companyCode: string, username: string, password: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ companyCode, username, password });

  const auth = (token: string) => (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

  it('登录成功返回用户信息与权限', async () => {
    const res = await login('DEMO', 'admin', '123456');
    expect(res.status).toBe(201);
    expect(res.body.code).toBe(0);
    expect(res.body.data.user.username).toBe('admin');
    expect(res.body.data.user.permissions.length).toBeGreaterThan(50);
    expect(res.body.data.user.menus.length).toBeGreaterThan(5);
  });

  it('错误密码被拒绝（业务码 40102）', async () => {
    const res = await login('DEMO', 'admin', 'wrong');
    expect(res.body.code).toBe(40102);
  });

  it('租户隔离：T2 看不到 DEMO 的商品', async () => {
    const t2 = await login('T2', 't2admin', '123456');
    const token = t2.body.data.token;
    const res = await auth(token)(request(app.getHttpServer()).get('/api/products?page=1&pageSize=10'));
    expect(res.body.code).toBe(0);
    expect(res.body.data.total).toBe(0);
  });

  it('跨租户按 ID 取数返回业务 404（code 40406）', async () => {
    const t2 = await login('T2', 't2admin', '123456');
    const token = t2.body.data.token;
    const res = await auth(token)(request(app.getHttpServer()).get('/api/purchase-orders/1'));
    expect(res.body.code).toBe(40406);
  });

  it('未登录访问受保护接口返回 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/products');
    expect(res.status).toBe(401);
  });

  it('防超卖：库存不足出库被拦截且库存不变', async () => {
    const demo = await login('DEMO', 'admin', '123456');
    const token = demo.body.data.token;

    // 读取 P001 当前库存
    const inv = await auth(token)(request(app.getHttpServer()).get('/api/inventory?page=1&pageSize=200'));
    const before = Number(inv.body.data.list.find((i: { productId: number }) => i.productId === 1)?.quantity ?? 0);

    // 创建超量销售订单并确认
    const create = await auth(token)(
      request(app.getHttpServer()).post('/api/sale-orders').send({
        customerId: 1,
        orderDate: '2026-08-16',
        items: [{ productId: 1, quantity: 999999, price: 199 }],
      }),
    );
    expect(create.body.code).toBe(0);
    const orderId = create.body.data.id;

    await auth(token)(request(app.getHttpServer()).put(`/api/sale-orders/${orderId}/confirm`)).expect(200);

    // 出库应被业务码 40020 拦截
    const outbound = await auth(token)(request(app.getHttpServer()).put(`/api/sale-orders/${orderId}/outbound`));
    expect(outbound.body.code).toBe(40020);
    expect(outbound.body.message).toContain('库存不足');

    // 库存不变
    const inv2 = await auth(token)(request(app.getHttpServer()).get('/api/inventory?page=1&pageSize=200'));
    const after = Number(inv2.body.data.list.find((i: { productId: number }) => i.productId === 1)?.quantity ?? 0);
    expect(after).toBe(before);

    // 清理：取消该订单，避免污染演示数据
    await auth(token)(request(app.getHttpServer()).put(`/api/sale-orders/${orderId}/cancel`)).expect(200);
  });

  it('RBAC：仓管员越权访问系统管理接口返回 403', async () => {
    const wangwu = await login('DEMO', 'wangwu', '123456');
    const token = wangwu.body.data.token;
    const res = await auth(token)(request(app.getHttpServer()).get('/api/users?page=1&pageSize=10'));
    expect(res.status).toBe(403);
  });
});
