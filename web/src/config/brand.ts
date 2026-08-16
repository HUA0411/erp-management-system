/**
 * 品牌配置：整个系统的品牌信息与主题色集中在此文件。
 * 出售/交付给客户时，只需修改本文件即可完成品牌化（名称、logo、主题色），无需改动其他代码。
 */
export interface BrandConfig {
  /** 系统名称（浏览器标题、登录页主标题） */
  appName: string;
  /** 登录页副标题 */
  loginSubtitle: string;
  /** 侧边栏 logo 方块中的字符 */
  logoMark: string;
  /** 侧边栏主标题 */
  logoTitle: string;
  /** 侧边栏副标题（未登录公司名时显示） */
  logoSub: string;
  /** 主色（深蓝系，需 6 位 hex） */
  primaryColor: string;
  /** 强调色（琥珀/橙色系） */
  accentColor: string;
  /** 侧边栏深色背景 */
  sidebarBg: string;
}

export const brand: BrandConfig = {
  appName: '企业 ERP 管理系统',
  loginSubtitle: '进销存 · 库存 · 财务 · 一体化经营管理平台',
  logoMark: 'E',
  logoTitle: '企业 ERP',
  logoSub: '进销存一体化',
  primaryColor: '#2456a6',
  accentColor: '#f2a33c',
  sidebarBg: '#14263f',
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** 与白/黑混合：ratio>0 混白，ratio<0 混黑 */
function mix(hex: string, ratio: number): string {
  const { r, g, b } = hexToRgb(hex);
  const target = ratio >= 0 ? 255 : 0;
  const w = Math.abs(ratio);
  const nr = Math.round(r + (target - r) * w);
  const ng = Math.round(g + (target - g) * w);
  const nb = Math.round(b + (target - b) * w);
  return `#${[nr, ng, nb].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** 应用品牌配置：写入 CSS 变量（含 Element Plus 主色明暗变体） */
export function applyBrand(cfg: BrandConfig = brand): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  root.setProperty('--el-color-primary', cfg.primaryColor);
  root.setProperty('--el-color-primary-light-3', mix(cfg.primaryColor, 0.3));
  root.setProperty('--el-color-primary-light-5', mix(cfg.primaryColor, 0.5));
  root.setProperty('--el-color-primary-light-7', mix(cfg.primaryColor, 0.7));
  root.setProperty('--el-color-primary-light-8', mix(cfg.primaryColor, 0.8));
  root.setProperty('--el-color-primary-light-9', mix(cfg.primaryColor, 0.9));
  root.setProperty('--el-color-primary-dark-2', mix(cfg.primaryColor, -0.2));
  root.setProperty('--el-color-warning', cfg.accentColor);
  root.setProperty('--sidebar-bg', cfg.sidebarBg);
  document.title = cfg.appName;
}
