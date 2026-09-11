import {
  Box,
  Calendar,
  Coin,
  Connection,
  DataLine,
  Document,
  Files,
  Folder,
  Goods,
  Grid,
  Histogram,
  List,
  Lock,
  Money,
  Monitor,
  Odometer,
  OfficeBuilding,
  Operation,
  PieChart,
  Setting,
  Shop,
  ShoppingCart,
  Tickets,
  TrendCharts,
  User,
  UserFilled,
  Van,
  Wallet,
} from '@element-plus/icons-vue';
import type { Component } from 'vue';

/**
 * 侧边栏菜单图标映射。
 *
 * 为什么需要这张表：菜单图标是**按数据库里的字符串动态渲染**的
 * （`h(icons[node.icon])`），这种动态取值会让打包器无法做 tree-shaking ——
 * 之前直接用 `import * as Icons`，结果是整个图标库（约 300 个）全被打进包里，
 * 一个菜单图标就拖进去 100KB+。
 *
 * 改成显式映射后只保留这些。
 *
 * ⚠️ 维护提示：如果要在「系统管理 → 权限管理」里给菜单选新图标，
 * 必须同时把该图标加进这张表，否则菜单不会显示图标（不会报错，只是空白）。
 * 当前数据库里在用的：Odometer Box ShoppingCart Goods Files Wallet Setting
 */
export const MENU_ICONS: Record<string, Component> = {
  Odometer,
  Box,
  ShoppingCart,
  Goods,
  Files,
  Wallet,
  Setting,
  // 以下是常用备选，供权限管理里挑选
  DataLine,
  TrendCharts,
  Histogram,
  PieChart,
  Grid,
  List,
  Operation,
  Tickets,
  Money,
  Coin,
  Document,
  Folder,
  Calendar,
  User,
  UserFilled,
  Lock,
  Monitor,
  Connection,
  OfficeBuilding,
  Shop,
  Van,
};

export function resolveMenuIcon(name?: string): Component | undefined {
  return name ? MENU_ICONS[name] : undefined;
}
