/** 种子数据定义：权限树 / 角色 / 用户 / 演示业务数据 */

export interface SeedPermissionNode {
  name: string;
  code: string;
  type: 'menu' | 'button';
  path?: string;
  icon?: string;
  children?: SeedPermissionNode[];
}

/** 菜单 + 按钮权限树（全局模板） */
export const permissionTree: SeedPermissionNode[] = [
  {
    name: '数据看板',
    code: 'dashboard',
    type: 'menu',
    path: '/dashboard',
    icon: 'Odometer',
  },
  {
    name: '基础资料',
    code: 'base',
    type: 'menu',
    path: '/base',
    icon: 'Box',
    children: [
      { name: '商品分类', code: 'base:category', type: 'menu', path: '/base/category' },
      {
        name: '商品管理',
        code: 'base:product',
        type: 'menu',
        path: '/base/product',
        children: [
          { name: '新增商品', code: 'product:create', type: 'button' },
          { name: '编辑商品', code: 'product:update', type: 'button' },
          { name: '删除商品', code: 'product:delete', type: 'button' },
        ],
      },
      {
        name: '供应商管理',
        code: 'base:supplier',
        type: 'menu',
        path: '/base/supplier',
        children: [
          { name: '新增供应商', code: 'supplier:create', type: 'button' },
          { name: '编辑供应商', code: 'supplier:update', type: 'button' },
          { name: '删除供应商', code: 'supplier:delete', type: 'button' },
        ],
      },
      {
        name: '客户管理',
        code: 'base:customer',
        type: 'menu',
        path: '/base/customer',
        children: [
          { name: '新增客户', code: 'customer:create', type: 'button' },
          { name: '编辑客户', code: 'customer:update', type: 'button' },
          { name: '删除客户', code: 'customer:delete', type: 'button' },
        ],
      },
    ],
  },
  {
    name: '采购管理',
    code: 'purchase',
    type: 'menu',
    path: '/purchase',
    icon: 'ShoppingCart',
    children: [
      {
        name: '采购订单',
        code: 'purchase:order',
        type: 'menu',
        path: '/purchase/order',
        children: [
          { name: '查看订单', code: 'purchase:order:view', type: 'button' },
          { name: '新增订单', code: 'purchase:order:create', type: 'button' },
          { name: '编辑订单', code: 'purchase:order:update', type: 'button' },
          { name: '删除订单', code: 'purchase:order:delete', type: 'button' },
          { name: '确认订单', code: 'purchase:order:confirm', type: 'button' },
          { name: '取消订单', code: 'purchase:order:cancel', type: 'button' },
          { name: '采购入库', code: 'purchase:order:inbound', type: 'button' },
        ],
      },
      {
        name: '采购入库单',
        code: 'purchase:inbound',
        type: 'menu',
        path: '/purchase/inbound',
        children: [{ name: '查看入库单', code: 'purchase:inbound:view', type: 'button' }],
      },
    ],
  },
  {
    name: '销售管理',
    code: 'sale',
    type: 'menu',
    path: '/sale',
    icon: 'Goods',
    children: [
      {
        name: '销售订单',
        code: 'sale:order',
        type: 'menu',
        path: '/sale/order',
        children: [
          { name: '查看订单', code: 'sale:order:view', type: 'button' },
          { name: '新增订单', code: 'sale:order:create', type: 'button' },
          { name: '编辑订单', code: 'sale:order:update', type: 'button' },
          { name: '删除订单', code: 'sale:order:delete', type: 'button' },
          { name: '确认订单', code: 'sale:order:confirm', type: 'button' },
          { name: '取消订单', code: 'sale:order:cancel', type: 'button' },
          { name: '销售出库', code: 'sale:order:outbound', type: 'button' },
        ],
      },
      {
        name: '销售出库单',
        code: 'sale:outbound',
        type: 'menu',
        path: '/sale/outbound',
        children: [{ name: '查看出库单', code: 'sale:outbound:view', type: 'button' }],
      },
    ],
  },
  {
    name: '库存管理',
    code: 'inventory',
    type: 'menu',
    path: '/inventory',
    icon: 'Files',
    children: [
      {
        name: '实时库存',
        code: 'inventory:current',
        type: 'menu',
        path: '/inventory/current',
        children: [{ name: '查看库存', code: 'inventory:current:view', type: 'button' }],
      },
      {
        name: '库存流水',
        code: 'inventory:record',
        type: 'menu',
        path: '/inventory/record',
        children: [{ name: '查看流水', code: 'inventory:record:view', type: 'button' }],
      },
      {
        name: '库存预警',
        code: 'inventory:alert',
        type: 'menu',
        path: '/inventory/alert',
        children: [{ name: '查看预警', code: 'inventory:alert:view', type: 'button' }],
      },
      {
        name: '库存盘点',
        code: 'inventory:stocktake',
        type: 'menu',
        path: '/inventory/stocktake',
        children: [
          { name: '查看盘点', code: 'inventory:stocktake:view', type: 'button' },
          { name: '新建盘点', code: 'inventory:stocktake:create', type: 'button' },
          { name: '确认盘点', code: 'inventory:stocktake:confirm', type: 'button' },
        ],
      },
      { name: '库存调整', code: 'inventory:adjust', type: 'button' },
    ],
  },
  {
    name: '财务管理',
    code: 'finance',
    type: 'menu',
    path: '/finance',
    icon: 'Wallet',
    children: [
      {
        name: '收付款单',
        code: 'finance:payment',
        type: 'menu',
        path: '/finance/payment',
        children: [
          { name: '查看单据', code: 'finance:payment:view', type: 'button' },
          { name: '登记单据', code: 'finance:payment:create', type: 'button' },
          { name: '删除单据', code: 'finance:payment:delete', type: 'button' },
        ],
      },
      {
        name: '应收应付',
        code: 'finance:account',
        type: 'menu',
        path: '/finance/account',
        children: [{ name: '查看汇总', code: 'finance:account:view', type: 'button' }],
      },
    ],
  },
  {
    name: '系统管理',
    code: 'system',
    type: 'menu',
    path: '/system',
    icon: 'Setting',
    children: [
      {
        name: '用户管理',
        code: 'system:user',
        type: 'menu',
        path: '/system/user',
        children: [
          { name: '查看用户', code: 'system:user:view', type: 'button' },
          { name: '新增用户', code: 'system:user:create', type: 'button' },
          { name: '编辑用户', code: 'system:user:update', type: 'button' },
          { name: '删除用户', code: 'system:user:delete', type: 'button' },
          { name: '重置密码', code: 'system:user:reset-password', type: 'button' },
        ],
      },
      {
        name: '角色管理',
        code: 'system:role',
        type: 'menu',
        path: '/system/role',
        children: [
          { name: '查看角色', code: 'system:role:view', type: 'button' },
          { name: '新增角色', code: 'system:role:create', type: 'button' },
          { name: '编辑角色', code: 'system:role:update', type: 'button' },
          { name: '删除角色', code: 'system:role:delete', type: 'button' },
        ],
      },
      {
        name: '菜单权限',
        code: 'system:permission',
        type: 'menu',
        path: '/system/permission',
        children: [
          { name: '查看权限', code: 'system:permission:view', type: 'button' },
          { name: '编辑权限', code: 'system:permission:update', type: 'button' },
        ],
      },
      {
        name: '操作日志',
        code: 'system:log',
        type: 'menu',
        path: '/system/log',
        children: [{ name: '查看日志', code: 'system:log:view', type: 'button' }],
      },
      { name: 'AI 助手配置', code: 'ai:config', type: 'button' },
    ],
  },
];

/** 展平权限树（带父子关系） */
export interface FlatPermission {
  parentCode: string | null;
  name: string;
  code: string;
  type: 'menu' | 'button';
  path?: string;
  icon?: string;
}

export function flattenPermissions(): FlatPermission[] {
  const flat: FlatPermission[] = [];
  const walk = (nodes: SeedPermissionNode[], parentCode: string | null) => {
    nodes.forEach((node, index) => {
      flat.push({
        parentCode,
        name: node.name,
        code: node.code,
        type: node.type,
        path: node.path,
        icon: node.icon,
      });
      if (node.children) walk(node.children, node.code);
    });
  };
  walk(permissionTree, null);
  return flat;
}

export const allPermissionCodes = flattenPermissions().map((p) => p.code);

/** 角色模板：code → 权限码集合（按租户实例化） */
export const roleTemplates: Array<{ name: string; code: string; remark: string; permissions: string[] }> = [
  {
    name: '超级管理员',
    code: 'SUPER_ADMIN',
    remark: '拥有全部权限',
    permissions: allPermissionCodes,
  },
  {
    name: '采购员',
    code: 'PURCHASER',
    remark: '负责采购与入库',
    permissions: [
      'dashboard',
      'base',
      'base:category',
      'base:product',
      'product:create',
      'product:update',
      'base:supplier',
      'supplier:create',
      'supplier:update',
      'purchase',
      'purchase:order',
      'purchase:order:view',
      'purchase:order:create',
      'purchase:order:update',
      'purchase:order:confirm',
      'purchase:order:cancel',
      'purchase:order:inbound',
      'purchase:inbound',
      'purchase:inbound:view',
      'inventory',
      'inventory:current',
      'inventory:current:view',
      'inventory:record',
      'inventory:record:view',
      'inventory:alert',
      'inventory:alert:view',
      'finance',
      'finance:payment',
      'finance:payment:view',
      'finance:account',
      'finance:account:view',
    ],
  },
  {
    name: '销售员',
    code: 'SALES',
    remark: '负责销售与出库',
    permissions: [
      'dashboard',
      'base',
      'base:category',
      'base:product',
      'base:customer',
      'customer:create',
      'customer:update',
      'sale',
      'sale:order',
      'sale:order:view',
      'sale:order:create',
      'sale:order:update',
      'sale:order:confirm',
      'sale:order:cancel',
      'sale:order:outbound',
      'sale:outbound',
      'sale:outbound:view',
      'inventory',
      'inventory:current',
      'inventory:current:view',
      'inventory:record',
      'inventory:record:view',
      'inventory:alert',
      'inventory:alert:view',
      'finance',
      'finance:payment',
      'finance:payment:view',
      'finance:account',
      'finance:account:view',
    ],
  },
  {
    name: '仓管员',
    code: 'WAREHOUSE',
    remark: '负责库存与出入库执行',
    permissions: [
      'dashboard',
      'inventory',
      'inventory:current',
      'inventory:current:view',
      'inventory:record',
      'inventory:record:view',
      'inventory:alert',
      'inventory:alert:view',
      'inventory:stocktake',
      'inventory:stocktake:view',
      'inventory:stocktake:create',
      'inventory:stocktake:confirm',
      'inventory:adjust',
      'purchase',
      'purchase:inbound',
      'purchase:inbound:view',
      'sale',
      'sale:outbound',
      'sale:outbound:view',
    ],
  },
  {
    name: '财务',
    code: 'FINANCE',
    remark: '负责收付款与往来账',
    permissions: [
      'dashboard',
      'base',
      'base:supplier',
      'base:customer',
      'purchase',
      'purchase:order',
      'purchase:order:view',
      'sale',
      'sale:order',
      'sale:order:view',
      'inventory',
      'inventory:current',
      'inventory:current:view',
      'finance',
      'finance:payment',
      'finance:payment:view',
      'finance:payment:create',
      'finance:payment:delete',
      'finance:account',
      'finance:account:view',
    ],
  },
];

export interface SeedUser {
  username: string;
  password: string;
  realName: string;
  roleCodes: string[];
}

export const demoUsers: SeedUser[] = [
  { username: 'admin', password: '123456', realName: '系统管理员', roleCodes: ['SUPER_ADMIN'] },
  { username: 'zhangsan', password: '123456', realName: '张三（采购）', roleCodes: ['PURCHASER'] },
  { username: 'lisi', password: '123456', realName: '李四（销售）', roleCodes: ['SALES'] },
  { username: 'wangwu', password: '123456', realName: '王五（仓管）', roleCodes: ['WAREHOUSE'] },
  { username: 'zhaoliu', password: '123456', realName: '赵六（财务）', roleCodes: ['FINANCE'] },
];

export const t2Users: SeedUser[] = [
  { username: 't2admin', password: '123456', realName: 'T2 管理员', roleCodes: ['SUPER_ADMIN'] },
  { username: 't2sales', password: '123456', realName: 'T2 销售', roleCodes: ['SALES'] },
];
