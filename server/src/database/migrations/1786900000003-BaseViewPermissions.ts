import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 补齐缺失的「查看」权限码，并修好下拉选项接口的越权。
 *
 * 背景（实测发现的真实故障，不是理论风险）：
 *
 * `products` / `customers` / `suppliers` 三个 controller 的列表接口要求
 * `product:view` / `customer:view` / `supplier:view`，但**这三个权限码在权限表里根本不存在**：
 *
 *   SELECT code FROM sys_permission WHERE code LIKE '%:view';
 *   → finance:* / inventory:* / purchase:* / sale:* / system:* 都有，
 *     独独没有 product:view、customer:view、supplier:view
 *
 * PermissionsGuard 是精确匹配（permissions.guard.ts:28-29 `required.every(code => codes.includes(code))`），
 * 于是只有 isSuperAdmin 能过（guard 第 20 行直接放行）。后果：
 * 采购员/销售员/仓管员/财务 登录后**打开「商品管理」「客户管理」「供应商管理」全部 403**，
 * 而左侧菜单里这些项是显示出来的（他们有 base:product 等菜单权限）—— 点进去就是报错。
 *
 * 同时这三个 controller 的 `options` 下拉接口**完全没有 @RequirePermissions**，
 * 而 guard 对未声明权限的接口直接放行 → 任何登录用户都能拉全量商品（含 purchase_price 采购成本价）、
 * 客户、供应商清单。应用层已补上装饰器，本迁移负责补权限数据，否则补完装饰器连正常角色也进不去了。
 *
 * 幂等：权限按 code 判存在才插；角色授权用 INSERT IGNORE 依赖 (role_id, permission_id) 唯一索引。
 */
export class BaseViewPermissions1786900000003 implements MigrationInterface {
  name = 'BaseViewPermissions1786900000003';

  /** 缺失的按钮权限：code → 中文名 + 所属菜单 code */
  private readonly missing: Array<{ code: string; name: string; parent: string }> = [
    { code: 'product:view', name: '查看商品', parent: 'base:product' },
    { code: 'supplier:view', name: '查看供应商', parent: 'base:supplier' },
    { code: 'customer:view', name: '查看客户', parent: 'base:customer' },
  ];

  /**
   * 角色 → 该补的权限。与 seed-data.ts 的 roleTemplates 保持一致。
   * 只补「这个角色本来就有对应菜单」的那些，不凭空提权。
   */
  private readonly grants: Array<{ role: string; codes: string[] }> = [
    { role: 'PURCHASER', codes: ['product:view', 'supplier:view'] },
    { role: 'SALES', codes: ['product:view', 'customer:view'] },
    { role: 'WAREHOUSE', codes: ['product:view'] },
    { role: 'FINANCE', codes: ['supplier:view', 'customer:view'] },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 插入缺失的权限行
    for (const p of this.missing) {
      const exists: Array<{ n: number }> = await queryRunner.query(
        'SELECT COUNT(*) AS n FROM `sys_permission` WHERE `code` = ?',
        [p.code],
      );
      if (Number(exists[0]?.n ?? 0) > 0) continue;

      const parent: Array<{ id: number }> = await queryRunner.query(
        'SELECT `id` FROM `sys_permission` WHERE `code` = ? LIMIT 1',
        [p.parent],
      );
      const parentId = parent[0]?.id ?? 0;
      await queryRunner.query(
        `INSERT INTO \`sys_permission\` (\`parent_id\`, \`name\`, \`code\`, \`type\`, \`sort\`, \`status\`)
         VALUES (?, ?, ?, 'button', 0, 1)`,
        [parentId, p.name, p.code],
      );
    }

    // 2. 超管拿全量（新加的三个码一并给上）
    await queryRunner.query(
      `INSERT IGNORE INTO \`sys_role_permission\` (\`role_id\`, \`permission_id\`)
       SELECT r.id, p.id FROM \`sys_role\` r CROSS JOIN \`sys_permission\` p
       WHERE r.code = 'SUPER_ADMIN'
         AND p.code IN (${this.missing.map(() => '?').join(',')})`,
      this.missing.map((m) => m.code),
    );

    // 3. 业务角色按职责补
    for (const g of this.grants) {
      await queryRunner.query(
        `INSERT IGNORE INTO \`sys_role_permission\` (\`role_id\`, \`permission_id\`)
         SELECT r.id, p.id FROM \`sys_role\` r CROSS JOIN \`sys_permission\` p
         WHERE r.code = ? AND p.code IN (${g.codes.map(() => '?').join(',')})`,
        [g.role, ...g.codes],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 只删授权关系，不删权限行本身（可能有租户已自行分配给自定义角色）
    for (const g of [...this.grants, { role: 'SUPER_ADMIN', codes: this.missing.map((m) => m.code) }]) {
      await queryRunner.query(
        `DELETE rp FROM \`sys_role_permission\` rp
         JOIN \`sys_role\` r ON r.id = rp.role_id
         JOIN \`sys_permission\` p ON p.id = rp.permission_id
         WHERE r.code = ? AND p.code IN (${g.codes.map(() => '?').join(',')})`,
        [g.role, ...g.codes],
      );
    }
  }
}
