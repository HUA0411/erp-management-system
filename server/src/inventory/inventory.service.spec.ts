import { InventoryService } from './inventory.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { TenantContext } from '../tenant/tenant-context';

describe('InventoryService.movement（库存变动核心）', () => {
  let service: InventoryService;

  const makeManager = (rows: Array<{ id: number; quantity: string }>): any => ({
    query: jest.fn().mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('FOR UPDATE')) return rows;
      if (sql.includes('SELECT quantity FROM inventory')) return rows;
      return [];
    }),
  });

  const baseOpts = {
    companyId: 1,
    productId: 1,
    productName: '测试商品',
    type: 'out' as const,
    refType: 'SALE_OUTBOUND',
    refNo: 'OB202608160001',
  };

  beforeEach(() => {
    service = new InventoryService(
      { transaction: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('库存充足时正常扣减并写入流水', async () => {
    const manager = makeManager([{ id: 9, quantity: '10' }]);
    const result = await service.movement(manager, { ...baseOpts, delta: -4 });

    expect(result.balanceAfter).toBe(6);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE inventory SET quantity'),
      [6, 9],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO inventory_record'),
      expect.arrayContaining([1, 1, '测试商品', 'out', -4, 6, 'SALE_OUTBOUND', 'OB202608160001']),
    );
  });

  it('库存不足时抛业务异常且不写入', async () => {
    const manager = makeManager([{ id: 9, quantity: '10' }]);
    await expect(service.movement(manager, { ...baseOpts, delta: -20 })).rejects.toThrow(
      BusinessException,
    );
    // 只允许 SELECT 查询执行，UPDATE/INSERT 不应发生
    const updateCalls = (manager.query as jest.Mock).mock.calls.filter(([sql]) =>
      String(sql).startsWith('UPDATE') || String(sql).startsWith('INSERT'),
    );
    expect(updateCalls).toHaveLength(0);
  });

  it('无库存行且为负数变动时拒绝', async () => {
    const manager = makeManager([]);
    await expect(service.movement(manager, { ...baseOpts, delta: -1 })).rejects.toThrow(
      BusinessException,
    );
  });

  it('无库存行且为正数变动时插入新行', async () => {
    const manager = makeManager([]);
    const result = await service.movement(manager, { ...baseOpts, delta: 5, type: 'in' });
    expect(result.balanceAfter).toBe(5);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO inventory'),
      [1, 1, 5],
    );
  });

  it('租户上下文缺失时 companyId 为 0（隔离兜底）', () => {
    expect(TenantContext.companyId).toBe(0);
  });
});
