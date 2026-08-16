import { nextNo, round2, todayLocal, todayYmd } from './no-generator';

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

  it('nextNo 按前缀+日期+序号生成', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([{ cnt: 3 }]),
    } as any;
    const no = await nextNo(manager, 'purchase_order', 'order_no', 1, 'PO', new Date(2026, 7, 16));
    expect(no).toBe('PO202608160004');
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('COUNT(*)'),
      [1, 'PO20260816%'],
    );
  });

  it('nextNo 当日无记录时从 0001 开始', async () => {
    const manager = { query: jest.fn().mockResolvedValue([{ cnt: 0 }]) } as any;
    const no = await nextNo(manager, 'sale_order', 'order_no', 1, 'SO', new Date(2026, 7, 16));
    expect(no).toBe('SO202608160001');
  });
});
