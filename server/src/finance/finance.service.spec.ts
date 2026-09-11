import { FinanceService } from './finance.service';
import { TenantContext } from '../tenant/tenant-context';
import type { AccountSummary } from '@erp/shared';

/**
 * 财务应收应付。
 *
 * 这两个数是给老板看的：应付 = 已确认/已入库采购单总额 − 已付款；
 * 应收 = 已确认/已出库销售单总额 − 已收款。算错不会报错，只会让账对不上，
 * 所以把口径和边界（没付过款的往来单位、金额为小数时的精度、租户过滤）都钉住。
 *
 * 注意 accounts() 返回的是**扁平列表**（每个往来单位一条，supplier 与 customer 混在一起），
 * 不是按类型分组的对象。
 */
describe('FinanceService（应收应付口径）', () => {
  const COMPANY = 1;

  /**
   * 按调用顺序消费预设的 raw 结果。
   * accounts() 固定发 4 个聚合查询：采购、销售、付款(pay)、收款(receive)。
   */
  function queryBuilderFactory(rawResults: unknown[][]) {
    let call = 0;
    return () => {
      const result = rawResults[call++] ?? [];
      const chain: Record<string, jest.Mock> = {};
      for (const m of ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'addGroupBy']) {
        chain[m] = jest.fn(() => chain);
      }
      chain.getRawMany = jest.fn().mockResolvedValue(result);
      return chain;
    };
  }

  function build(rawResults: unknown[][]) {
    const factory = queryBuilderFactory(rawResults);
    const repo = () => ({ createQueryBuilder: jest.fn(factory) });
    return new FinanceService(
      {} as never,
      repo() as never,
      repo() as never,
      repo() as never,
      repo() as never,
      repo() as never,
    );
  }

  const inTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    TenantContext.run({ companyId: COMPANY, userId: 1 }, fn);

  const find = (rows: AccountSummary[], partnerId: number) => rows.find((r) => r.partnerId === partnerId)!;

  it('应付 = 采购总额 − 已付款，按往来单位匹配', async () => {
    const svc = build([
      [
        { partnerId: '1', partnerName: '深圳华强', totalAmount: '1000.00' },
        { partnerId: '2', partnerName: '上海办公', totalAmount: '500.50' },
      ],
      [], // 无销售
      [{ partnerId: '1', paid: '400.00' }], // 只给 1 号付过款
      [],
    ]);

    const rows = await inTenant(() => svc.accounts());
    expect(rows).toHaveLength(2);

    const hq = find(rows, 1);
    expect(hq.partnerType).toBe('supplier');
    expect(hq).toMatchObject({ totalAmount: 1000, paidAmount: 400, balance: 600 });

    // 没付过款的：paidAmount 必须是 0，不能是 NaN / undefined
    const sh = find(rows, 2);
    expect(sh).toMatchObject({ totalAmount: 500.5, paidAmount: 0, balance: 500.5 });
  });

  it('应收 = 销售总额 − 已收款', async () => {
    const svc = build([
      [],
      [{ partnerId: '7', partnerName: '北京云启', totalAmount: '2735.00' }],
      [],
      [{ partnerId: '7', paid: '1000.00' }],
    ]);

    const rows = await inTenant(() => svc.accounts());
    expect(rows).toHaveLength(1);
    expect(rows[0].partnerType).toBe('customer');
    expect(rows[0]).toMatchObject({ totalAmount: 2735, paidAmount: 1000, balance: 1735 });
  });

  it('余额保留两位小数，不出现浮点尾差', async () => {
    const svc = build([
      [{ partnerId: '1', partnerName: 'A', totalAmount: '0.30' }],
      [],
      [{ partnerId: '1', paid: '0.10' }],
      [],
    ]);
    const rows = await inTenant(() => svc.accounts());
    // 0.3 - 0.1 在 IEEE754 下是 0.19999999999999998
    expect(rows[0].balance).toBe(0.2);
  });

  it('付多了余额为负（多付/预付是合法场景，不能被截断为 0）', async () => {
    const svc = build([
      [{ partnerId: '1', partnerName: 'A', totalAmount: '100.00' }],
      [],
      [{ partnerId: '1', paid: '150.00' }],
      [],
    ]);
    const rows = await inTenant(() => svc.accounts());
    expect(rows[0].balance).toBe(-50);
  });

  it('4 个聚合查询全部带 company_id（跨租户串账是最严重的财务 bug）', async () => {
    const captured: Array<{ sql: string; params: Record<string, unknown> }> = [];
    const factory = () => {
      const chain: Record<string, jest.Mock> = {};
      for (const m of ['select', 'addSelect', 'groupBy', 'addGroupBy']) {
        chain[m] = jest.fn(() => chain);
      }
      chain.where = jest.fn((sql: string, params: Record<string, unknown>) => {
        captured.push({ sql, params });
        return chain;
      });
      chain.andWhere = jest.fn(() => chain);
      chain.getRawMany = jest.fn().mockResolvedValue([]);
      return chain;
    };
    const repo = () => ({ createQueryBuilder: jest.fn(factory) });
    const svc = new FinanceService(
      {} as never,
      repo() as never,
      repo() as never,
      repo() as never,
      repo() as never,
      repo() as never,
    );

    await inTenant(() => svc.accounts());

    expect(captured).toHaveLength(4);
    for (const c of captured) {
      expect(c.sql).toContain('company_id = :cid');
      expect(c.params).toEqual({ cid: COMPANY });
    }
  });

  it('关联单不存在时抛出 40404（往来单位不存在或不属于本租户）', async () => {
    const paymentRepo = {
      createQueryBuilder: jest.fn(queryBuilderFactory([[], [], [], []])),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    };
    const svc = new FinanceService(
      {} as never,
      paymentRepo as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      {} as never,
    );
    await expect(
      inTenant(() =>
        svc.create({
          type: 'pay',
          partnerType: 'supplier',
          partnerId: 999,
          amount: 100,
          payDate: '2026-01-01',
        } as never),
      ),
    ).rejects.toMatchObject({ response: { code: 40404 } });
  });
});
