import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { brand } from '@/config/brand';

const Layout = () => import('@/layout/MainLayout.vue');

/** 静态路由表；meta.permission 为后端菜单权限码，守卫据此拦截 */
export const menuRoutes: RouteRecordRaw[] = [
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/dashboard/index.vue'),
    meta: { title: '数据看板', permission: 'dashboard' },
  },
  {
    path: '/base/category',
    name: 'base-category',
    component: () => import('@/views/base/Category.vue'),
    meta: { title: '商品分类', permission: 'base:category' },
  },
  {
    path: '/base/product',
    name: 'base-product',
    component: () => import('@/views/base/Product.vue'),
    meta: { title: '商品管理', permission: 'base:product' },
  },
  {
    path: '/base/supplier',
    name: 'base-supplier',
    component: () => import('@/views/base/Supplier.vue'),
    meta: { title: '供应商管理', permission: 'base:supplier' },
  },
  {
    path: '/base/customer',
    name: 'base-customer',
    component: () => import('@/views/base/Customer.vue'),
    meta: { title: '客户管理', permission: 'base:customer' },
  },
  {
    path: '/purchase/order',
    name: 'purchase-order',
    component: () => import('@/views/purchase/Order.vue'),
    meta: { title: '采购订单', permission: 'purchase:order' },
  },
  {
    path: '/purchase/inbound',
    name: 'purchase-inbound',
    component: () => import('@/views/purchase/Inbound.vue'),
    meta: { title: '采购入库单', permission: 'purchase:inbound' },
  },
  {
    path: '/sale/order',
    name: 'sale-order',
    component: () => import('@/views/sale/Order.vue'),
    meta: { title: '销售订单', permission: 'sale:order' },
  },
  {
    path: '/sale/outbound',
    name: 'sale-outbound',
    component: () => import('@/views/sale/Outbound.vue'),
    meta: { title: '销售出库单', permission: 'sale:outbound' },
  },
  {
    path: '/inventory/current',
    name: 'inventory-current',
    component: () => import('@/views/inventory/Current.vue'),
    meta: { title: '实时库存', permission: 'inventory:current' },
  },
  {
    path: '/inventory/record',
    name: 'inventory-record',
    component: () => import('@/views/inventory/Record.vue'),
    meta: { title: '库存流水', permission: 'inventory:record' },
  },
  {
    path: '/inventory/alert',
    name: 'inventory-alert',
    component: () => import('@/views/inventory/Alert.vue'),
    meta: { title: '库存预警', permission: 'inventory:alert' },
  },
  {
    path: '/inventory/stocktake',
    name: 'inventory-stocktake',
    component: () => import('@/views/inventory/Stocktake.vue'),
    meta: { title: '库存盘点', permission: 'inventory:stocktake' },
  },
  {
    path: '/finance/payment',
    name: 'finance-payment',
    component: () => import('@/views/finance/Payment.vue'),
    meta: { title: '收付款单', permission: 'finance:payment' },
  },
  {
    path: '/finance/account',
    name: 'finance-account',
    component: () => import('@/views/finance/Account.vue'),
    meta: { title: '应收应付', permission: 'finance:account' },
  },
  {
    path: '/system/user',
    name: 'system-user',
    component: () => import('@/views/system/User.vue'),
    meta: { title: '用户管理', permission: 'system:user' },
  },
  {
    path: '/system/role',
    name: 'system-role',
    component: () => import('@/views/system/Role.vue'),
    meta: { title: '角色管理', permission: 'system:role' },
  },
  {
    path: '/system/permission',
    name: 'system-permission',
    component: () => import('@/views/system/Permission.vue'),
    meta: { title: '菜单权限', permission: 'system:permission' },
  },
  {
    path: '/system/log',
    name: 'system-log',
    component: () => import('@/views/system/Log.vue'),
    meta: { title: '操作日志', permission: 'system:log' },
  },
];

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('@/views/login/index.vue'), meta: { title: '登录' } },
  {
    path: '/',
    component: Layout,
    redirect: '/dashboard',
    children: menuRoutes,
  },
  {
    path: '/403',
    component: () => import('@/views/error/403.vue'),
    meta: { title: '无权限' },
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/views/error/404.vue'),
    meta: { title: '页面不存在' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const store = useUserStore();

  if (to.path === '/login') {
    return store.isLoggedIn ? '/' : true;
  }

  if (!store.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  if (!store.user) {
    try {
      await store.fetchProfile();
    } catch {
      store.logout();
      return '/login';
    }
  }

  const permission = to.meta.permission as string | undefined;
  if (permission && !store.isSuperAdmin && !store.permissions.includes(permission)) {
    return '/403';
  }
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title as string} · ${brand.appName}` : brand.appName;
});

export default router;
