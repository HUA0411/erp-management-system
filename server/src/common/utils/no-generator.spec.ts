import { formatDate, formatDateTime, nextNo, round2, todayLocal, todayYmd } from './no-generator';

describe('no-generator', () => {
  it('round2 保留两位小数', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(10)).toBe(10);
  });

  it('todayYmd / todayLocal 格式', () => {
    const d = new Date(2026, 7, 16); // 2026-08-16
    expect(todayYmd(d)).toBe('20260816');
    expect(todayLocal(d)).toBe('2026-08-16');
  });

  it('formatDateTime / formatDate 使用本地时间（修复 UTC 偏移）', () => {
    // 本地 2026-08-16 22:09:38；toISOString 会输出 UTC（14:09:38），formatDateTime 必须保持本地值
    const d = new Date(2026, 7, 16, 22, 9, 38);
    expect(formatDateTime(d)).toBe('2026-08-16 22:09:38');
    expect(formatDate(d)).toBe('2026-08-16');
    // 字符串输入
    expect(formatDateTime('2026-08-16 22:09:38')).toBe('2026-08-16 22:09:38');
    expect(formatDate(new Date(2026, 7, 16, 0, 0, 0))).toBe('2026-08-16');
  });

  it('nextNo 原子自增分配序号（不再用 COUNT(*) 推算）', async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ affectedRows: 1 }) // INSERT ... ON DUPLICATE KEY UPDATE
        .mockResolvedValueOnce([{ n: 4 }]), // SELECT ... FOR UPDATE
    } as any;
    const no = await nextNo(manager, 'purchase_order', 'order_no', 1, 'PO', new Date(2026, 7, 16));

    expect(no).toBe('PO202608160004');

    // 第一条：原子自增，冲突则 +1；绝不能出现 COUNT(*)
    const [upsertSql, upsertParams] = manager.query.mock.calls[0];
    expect(upsertSql).toContain('ON DUPLICATE KEY UPDATE n = n + 1');
    expect(upsertSql).not.toContain('COUNT(*)');
    expect(upsertParams).toEqual([1, 'purchase_order.order_no', '20260816']);

    // 第二条：必须带 FOR UPDATE，否则 RR 隔离级别下会读到快照里的旧值
    const [selectSql] = manager.query.mock.calls[1];
    expect(selectSql).toContain('FOR UPDATE');
  });

  it('nextNo 当天第一次分配得到 0001', async () => {
    const manager = {
      query: jest.fn().mockResolvedValueOnce({ affectedRows: 1 }).mockResolvedValueOnce([{ n: 1 }]),
    } as any;
    const no = await nextNo(manager, 'sale_order', 'order_no', 1, 'SO', new Date(2026, 7, 16));
    expect(no).toBe('SO202608160001');
  });

  it('nextNo 序号超过 4 位时不截断', async () => {
    const manager = {
      query: jest.fn().mockResolvedValueOnce({ affectedRows: 1 }).mockResolvedValueOnce([{ n: 12345 }]),
    } as any;
    const no = await nextNo(manager, 'sale_order', 'order_no', 1, 'SO', new Date(2026, 7, 16));
    expect(no).toBe('SO2026081612345');
  });
});
