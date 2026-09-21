import { PermissionService } from './permission.service';
import { TenantContext } from '../tenant/tenant-context';
import type { PermissionNode } from '@erp/shared';

/**
 * 权限聚合与菜单树。
 *
 * 这里决定「谁能看到什么」，出错的方式很隐蔽：
 *  - 权限码查漏了 → 用户点进去 403
 *  - 权限码查多了 → **越权**，而且界面上完全看不出来
 *  - company_id 过滤丢了 → 横向越权，拿到别家公司的权限
 *
 * 此外这个 service 带 30 秒内存缓存（避免每个请求都去 join 三张表），
 * 缓存失效逻辑写错会导致「改了角色权限但一段时间内不生效」，
 * 所以单独覆盖。
 */
describe('PermissionService（权限聚合 / 菜单树 / 缓存）', () => {
  const COMPANY = 1;
  const USER = 42;

  /** 模拟 TypeORM 的 createQueryBuilder 链，并把 where 参数记录下来 */
  function makeRepos(rawCodes: string[], permissions: PermissionNode[]) {
    const captured: Array<{ sql: string; params: Record<string, unknown> }> = [];
    let joinCalls = 0;
    const permissionQb = () => {
      const chain: Record<string, jest.Mock> = {};
      // 注意：innerJoin(表名, 别名, 条件) —— 表名可能是个实体类，条件里是别名
      chain.innerJoin = jest.fn((table: unknown, alias: string, cond: string) => {
        joinCalls++;
        const tableName =
          typeof table === 'string' ? table : ((table as { name?: string })?.name ?? String(table));
        captured.push({ sql: `${alias} <= ${tableName} :: ${cond}`, params: {} });
        return chain;
      });
      chain.where = jest.fn((sql: string, params: Record<string, unknown>) => {
        captured.push({ sql, params });
        return chain;
      });
      chain.andWhere = jest.fn(() => chain);
      chain.select = jest.fn(() => chain);
      chain.getRawMany = jest.fn().mockResolvedValue(rawCodes.map((code) => ({ code })));
      return chain;
    };

    const permissionRepo = {
      createQueryBuilder: jest.fn(permissionQb),
      find: jest.fn().mockResolvedValue(permissions),
      update: jest.fn(),
    };
    const rolePermissionRepo = {
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
      insert: jest.fn(),
    };
    const userRoleRepo = { find: jest.fn().mockResolvedValue([]), delete: jest.fn(), insert: jest.fn() };

    const roleRepo = { find: jest.fn().mockResolvedValue([]) };
    // setRolePermissions / setUserRoles 的「先 delete 再 insert」包在事务里，
    // 这里给一个直接把回调跑一遍的假 DataSource
    const dataSource = {
      transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
        fn({
          getRepository: () => ({
            delete: jest.fn(),
            insert: jest.fn(),
          }),
        }),
      ),
    };

    const svc = new PermissionService(
      permissionRepo as never,
      rolePermissionRepo as never,
      userRoleRepo as never,
      roleRepo as never,
      dataSource as never,
    );
    return { svc, permissionRepo, captured, joinCalls: () => joinCalls };
  }

  const inTenant = <T>(fn: () => Promise<T>) => TenantContext.run({ companyId: COMPANY, userId: USER }, fn);

  describe('getUserPermissionCodes', () => {
    it('把原始行映射成权限码数组', async () => {
      const { svc } = makeRepos(['product:view', 'product:create'], []);
      const codes = await svc.getUserPermissionCodes(USER, COMPANY);
      expect(codes).toEqual(['product:view', 'product:create']);
    });

    it('查询条件必须同时按 user_id 和 company_id 过滤', async () => {
      const { svc, captured } = makeRepos(['a'], []);
      await svc.getUserPermissionCodes(USER, COMPANY);

      const whereCall = captured.find((c) => c.sql.includes('ur.user_id'));
      expect(whereCall).toBeDefined();
      expect(whereCall!.sql).toContain('ur.user_id = :uid');
      expect(whereCall!.params).toEqual({ uid: USER, cid: COMPANY });

      // 角色表的 company_id 过滤在 join 条件里，不能丢
      const joinCall = captured.find((c) => c.sql.includes('sys_role'));
      expect(joinCall!.sql).toContain('r <= sys_role');
      expect(joinCall!.sql).toContain('r.company_id = :cid');
    });

    it('同一用户重复查询走缓存（30 秒内不重复打库）', async () => {
      const { svc, permissionRepo } = makeRepos(['a'], []);
      await svc.getUserPermissionCodes(USER, COMPANY);
      await svc.getUserPermissionCodes(USER, COMPANY);
      await svc.getUserPermissionCodes(USER, COMPANY);
      expect(permissionRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    });

    it('缓存按 (companyId,userId) 分开，不会把 A 的权限给 B', async () => {
      const { svc, permissionRepo } = makeRepos(['a'], []);
      await svc.getUserPermissionCodes(1, COMPANY);
      await svc.getUserPermissionCodes(2, COMPANY);
      await svc.getUserPermissionCodes(1, 99); // 同 userId、不同租户
      expect(permissionRepo.createQueryBuilder).toHaveBeenCalledTimes(3);
    });

    it('invalidateUser 只清指定用户，不影响其他人', async () => {
      const { svc, permissionRepo } = makeRepos(['a'], []);
      await svc.getUserPermissionCodes(1, COMPANY);
      await svc.getUserPermissionCodes(2, COMPANY);
      expect(permissionRepo.createQueryBuilder).toHaveBeenCalledTimes(2);

      svc.invalidateUser(1);
      await svc.getUserPermissionCodes(1, COMPANY); // 重新查
      await svc.getUserPermissionCodes(2, COMPANY); // 命中缓存
      expect(permissionRepo.createQueryBuilder).toHaveBeenCalledTimes(3);
    });

    it('invalidateAll 清空全部（权限树改名后所有用户都要刷新）', async () => {
      const { svc, permissionRepo } = makeRepos(['a'], []);
      await svc.getUserPermissionCodes(1, COMPANY);
      svc.invalidateAll();
      await svc.getUserPermissionCodes(1, COMPANY);
      expect(permissionRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
    });
  });

  describe('getMenuTreeForUser', () => {
    const tree: PermissionNode[] = [
      { id: 1, parentId: 0, name: '基础资料', code: 'base', type: 'menu', sort: 1 },
      { id: 2, parentId: 1, name: '商品管理', code: 'base:product', type: 'menu', sort: 1 },
      { id: 3, parentId: 1, name: '客户管理', code: 'base:customer', type: 'menu', sort: 2 },
      { id: 4, parentId: 0, name: '系统管理', code: 'system', type: 'menu', sort: 9 },
      { id: 5, parentId: 0, name: '新增商品', code: 'product:create', type: 'button', sort: 1 },
    ];

    it('只保留 menu 类型，button 不进菜单', async () => {
      const { svc } = makeRepos(['base', 'base:product', 'product:create'], tree);
      const menus = await inTenant(() => svc.getMenuTreeForUser(USER, COMPANY));
      const flat = JSON.stringify(menus);
      expect(flat).toContain('基础资料');
      expect(flat).toContain('商品管理');
      expect(flat).not.toContain('新增商品'); // type=button
    });

    it('有权限的子节点会被保留，无权限的父节点因仍有可见子节点而保留', async () => {
      // 只给了 base:product，没给 base 本身
      const { svc } = makeRepos(['base:product'], tree);
      const menus = await inTenant(() => svc.getMenuTreeForUser(USER, COMPANY));
      const base = menus.find((m) => m.code === 'base');
      expect(base).toBeDefined(); // 因为有一个可见子节点
      expect(base!.children!.map((c) => c.code)).toEqual(['base:product']);
      expect(base!.children!.some((c) => c.code === 'base:customer')).toBe(false);
    });

    it('完全无权限的菜单不出现', async () => {
      const { svc } = makeRepos(['base:product'], tree);
      const menus = await inTenant(() => svc.getMenuTreeForUser(USER, COMPANY));
      expect(menus.find((m) => m.code === 'system')).toBeUndefined();
    });

    it('平台超管看到全部菜单（不看权限码）', async () => {
      const { svc } = makeRepos([], tree); // 一个权限码都没有
      const menus = await TenantContext.run({ companyId: COMPANY, userId: USER, isSuperAdmin: true }, () =>
        svc.getMenuTreeForUser(USER, COMPANY),
      );
      const codes = menus.map((m) => m.code);
      expect(codes).toContain('base');
      expect(codes).toContain('system');
    });
  });
});
