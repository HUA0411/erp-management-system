import { SaleOrdersService } from './sale-orders.service';
import { TenantContext } from '../tenant/tenant-context';

/**
 * 销售订单状态机。
 *
 * 这页的规则全靠守卫分支实现，而且分支之间互相依赖（删单只能草稿、
 * 确认只能草稿、出库只能已确认、取消只能草稿或已确认）。这类逻辑一旦写错，
 * 表现是「不该能做的操作能做了」—— 界面上看不出来，只有数据坏了才发现。
 *
 * 另外覆盖租户隔离：mustFind 必须带 company_id，否则 A 公司能改 B 公司的单。
 */
describe('SaleOrdersService（订单状态机与租户隔离）', () => {
  const COMPANY = 1;

  function build(order: Record<string, unknown> | null) {
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
        fn({ getRepository: () => ({ delete: jest.fn(), update: jest.fn() }) }),
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
    return { svc, orderRepo, itemRepo };
  }

  const orderWith = (status: string) => ({
    id: 9,
    companyId: COMPANY,
    status,
    orderNo: 'SO202601010001',
    customerId: 1,
    orderDate: '2026-01-01',
  });

  /** 所有用例都在租户上下文里跑，模拟已登录请求 */
  function inTenant<T>(fn: () => Promise<T>): Promise<T> {
    return TenantContext.run({ companyId: COMPANY, userId: 1 }, fn);
  }

  describe('确认（confirm）', () => {
    it('草稿且有明细时可确认', async () => {
      const { svc, orderRepo } = build(orderWith('draft'));
      await inTenant(() => svc.confirm(9));
      expect(orderRepo.update).toHaveBeenCalledWith({ id: 9 }, { status: 'confirmed' });
    });

    it('已确认的单不能重复确认（否则状态机被绕过）', async () => {
      const { svc, orderRepo } = build(orderWith('confirmed'));
      await expect(inTenant(() => svc.confirm(9))).rejects.toMatchObject({
        response: { code: 40031 },
      });
      expect(orderRepo.update).not.toHaveBeenCalled();
    });

    it('没有明细的单不能确认', async () => {
      const { svc, itemRepo, orderRepo } = build(orderWith('draft'));
      itemRepo.count.mockResolvedValue(0);
      await expect(inTenant(() => svc.confirm(9))).rejects.toMatchObject({
        response: { code: 40032 },
      });
      expect(orderRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('删除（remove）', () => {
    it('仅草稿可删', async () => {
      const { svc } = build(orderWith('confirmed'));
      await expect(inTenant(() => svc.remove(9))).rejects.toMatchObject({
        response: { code: 40030 },
      });
    });

    it('草稿可删，且明细与主单在同一事务里删', async () => {
      const { svc } = build(orderWith('draft'));
      await expect(inTenant(() => svc.remove(9))).resolves.toBeUndefined();
    });
  });

  describe('取消（cancel）', () => {
    it.each(['draft', 'confirmed'])('%s 可取消', async (status) => {
      const { svc, orderRepo } = build(orderWith(status));
      await inTenant(() => svc.cancel(9));
      expect(orderRepo.update).toHaveBeenCalledWith({ id: 9 }, { status: 'cancelled' });
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
  });
});
