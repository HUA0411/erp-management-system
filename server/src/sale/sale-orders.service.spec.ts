import { FindOperator } from 'typeorm';
import { SaleOrdersService } from './sale-orders.service';
import { TenantContext } from '../tenant/tenant-context';

/**
 * 销售订单状态机 + 并发抢占 + 租户隔离。
 *
 * 这页的规则全靠守卫分支实现，分支之间还互相依赖（删单只能草稿、确认只能草稿、
 * 出库只能已确认、取消只能草稿或已确认）。这类逻辑写错的表现是
 * 「不该能做的操作能做了」—— 界面上看不出来，只有数据坏了才发现。
 *
 * 重要：状态流转**不是**「先查状态再无条件 UPDATE」，而是「事务内用条件 UPDATE 抢占」
 * （common/utils/claim-status.ts）。所以这里断言的是 CAS 语句本身带没带对的前置状态，
 * 以及抢不到时（affected=0）有没有抛出正确的业务错误码。
 * 断言 `orderRepo.update` 是没意义的 —— 那条路径已经不存在了。
 *
 * 真实并发行为在 server/test/concurrency.e2e-spec.ts 里用真 MySQL 验证。
 */
describe('SaleOrdersService（订单状态机与租户隔离）', () => {
  const COMPANY = 1;

  /** 从 CAS 的 criteria 里取出允许的来源状态（claimStatus 用 In() 包了一层） */
  const allowedFrom = (criteria: Record<string, unknown>): string[] => {
    const s = criteria.status;
    if (s === undefined) return [];
    if (s instanceof FindOperator) return (s.value as string[]) ?? [];
    return [s as string];
  };

  function build(order: Record<string, unknown> | null) {
    /** 记录每一次 CAS 请求，供断言 */
    const casCalls: Array<{ criteria: Record<string, unknown>; patch: Record<string, unknown> }> = [];
    /** 模拟受影响行数；置 false 即「状态不匹配、抢不到」 */
    let casHits = true;

    const cas = jest.fn(async (criteria: Record<string, unknown>, patch: Record<string, unknown>) => {
      casCalls.push({ criteria, patch });
      if (!order) return { affected: 0 };
      const from = allowedFrom(criteria);
      const statusOk = from.length === 0 || from.includes(order.status as string);
      const hit = casHits && statusOk && criteria.id === order.id;
      return { affected: hit ? 1 : 0 };
    });

    const orderRepo = {
      findOne: jest.fn().mockResolvedValue(order),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const itemRepo = {
      find: jest.fn().mockResolvedValue([{ orderId: 9, productId: 1, quantity: 2 }]),
      count: jest.fn().mockResolvedValue(1),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      transaction: jest.fn((fn: (m: unknown) => unknown) =>
        fn({
          getRepository: () => ({ update: cas, delete: cas }),
          query: jest.fn().mockResolvedValue([]),
        }),
      ),
    };

    const svc = new SaleOrdersService(
      dataSource as never,
      orderRepo as never,
      itemRepo as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return {
      svc,
      orderRepo,
      itemRepo,
      cas,
      casCalls,
      setCasHits: (v: boolean) => {
        casHits = v;
      },
    };
  }

  const orderWith = (status: string) => ({
    id: 9,
    companyId: COMPANY,
    status,
    orderNo: 'SO202601010001',
    customerId: 1,
    orderDate: '2026-01-01',
    totalAmount: 100,
    paidAmount: 0,
  });

  /** 所有用例都在租户上下文里跑，模拟已登录请求 */
  function inTenant<T>(fn: () => Promise<T>): Promise<T> {
    return TenantContext.run({ companyId: COMPANY, userId: 1 }, fn);
  }

  describe('确认（confirm）', () => {
    it('草稿且有明细时可确认，CAS 的前置状态必须是 draft', async () => {
      const { svc, casCalls } = build(orderWith('draft'));
      await inTenant(() => svc.confirm(9));
      expect(casCalls).toHaveLength(1);
      expect(allowedFrom(casCalls[0].criteria)).toEqual(['draft']);
      expect(casCalls[0].patch).toEqual({ status: 'confirmed' });
    });

    it('已确认的单抢不到锁 → 40031（否则状态机被绕过）', async () => {
      // 状态已经是 confirmed，CAS 的 WHERE status='draft' 命不中
      const { svc } = build(orderWith('confirmed'));
      await expect(inTenant(() => svc.confirm(9))).rejects.toMatchObject({
        response: { code: 40031 },
      });
    });

    it('并发场景：两个人同时确认，只有抢到 affected=1 的那个成功', async () => {
      const { svc, setCasHits } = build(orderWith('draft'));
      setCasHits(false); // 模拟另一个请求已经把状态改走
      await expect(inTenant(() => svc.confirm(9))).rejects.toMatchObject({
        response: { code: 40031 },
      });
    });

    it('没有明细的单不能确认', async () => {
      const { svc, itemRepo } = build(orderWith('draft'));
      itemRepo.count.mockResolvedValue(0);
      await expect(inTenant(() => svc.confirm(9))).rejects.toMatchObject({
        response: { code: 40032 },
      });
    });
  });

  describe('删除（remove）', () => {
    it('仅草稿可删', async () => {
      const { svc } = build(orderWith('confirmed'));
      await expect(inTenant(() => svc.remove(9))).rejects.toMatchObject({
        response: { code: 40030 },
      });
    });

    it('草稿可删，且删除条件里带 status=draft（CAS 删除，防止删掉刚被确认的单）', async () => {
      const { svc, casCalls } = build(orderWith('draft'));
      await expect(inTenant(() => svc.remove(9))).resolves.toBeUndefined();
      const deleteCall = casCalls.find((c) => c.criteria.status !== undefined);
      expect(deleteCall).toBeDefined();
      expect(allowedFrom(deleteCall!.criteria)).toEqual(['draft']);
    });
  });

  describe('取消（cancel）', () => {
    it.each(['draft', 'confirmed'])('%s 可取消，前置状态两个都允许', async (status) => {
      const { svc, casCalls } = build(orderWith(status));
      await inTenant(() => svc.cancel(9));
      expect(allowedFrom(casCalls[0].criteria).sort()).toEqual(['confirmed', 'draft']);
      expect(casCalls[0].patch).toEqual({ status: 'cancelled' });
    });

    it.each(['outbound', 'cancelled'])('%s 不可取消（已出库/已取消）', async (status) => {
      const { svc } = build(orderWith(status));
      await expect(inTenant(() => svc.cancel(9))).rejects.toMatchObject({
        response: { code: 40033 },
      });
    });
  });

  describe('出库（outbound）', () => {
    it('仅已确认可出库', async () => {
      const { svc } = build(orderWith('draft'));
      await expect(inTenant(() => svc.outbound(9))).rejects.toMatchObject({
        response: { code: 40034 },
      });
    });

    it('出库的 CAS 前置状态是 confirmed，抢不到返回 40040', async () => {
      const { svc, setCasHits } = build(orderWith('confirmed'));
      setCasHits(false);
      await expect(inTenant(() => svc.outbound(9))).rejects.toMatchObject({
        response: { code: 40040 },
      });
    });

    it('订单不存在返回 40408', async () => {
      const { svc } = build(null);
      await expect(inTenant(() => svc.outbound(9))).rejects.toMatchObject({
        response: { code: 40408 },
      });
    });
  });

  describe('租户隔离', () => {
    it('mustFind 一定带 company_id（跨租户查到就等于越权）', async () => {
      const { svc, orderRepo } = build(null);
      await expect(inTenant(() => svc.cancel(9))).rejects.toMatchObject({ response: { code: 40408 } });
      expect(orderRepo.findOne).toHaveBeenCalledWith({
        where: { id: 9, companyId: COMPANY },
      });
    });

    it('未认证上下文（companyId=0）查不到任何单', async () => {
      const { svc, orderRepo } = build(orderWith('draft'));
      orderRepo.findOne.mockImplementation(({ where }: { where: { companyId: number } }) =>
        Promise.resolve(where.companyId === 0 ? null : orderWith('draft')),
      );
      await expect(svc.cancel(9)).rejects.toMatchObject({ response: { code: 40408 } });
    });

    it('CAS 的 criteria 里必须带 companyId，不能只按 id 改', async () => {
      const { svc, casCalls } = build(orderWith('draft'));
      await inTenant(() => svc.confirm(9));
      expect(casCalls[0].criteria.companyId).toBe(COMPANY);
    });
  });
});
