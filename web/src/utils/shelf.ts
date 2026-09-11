/**
 * 货架母题的工具函数。
 *
 * 视觉语言：货位高度 = 库存水位，隔板虚线 = 安全库存，箱体颜色 = 周转速度。
 * 这里只放"算"的部分，颜色和形状在 CSS / ShelfArt.vue 里。
 */

/** 箱子高度档位（百分比）。用档位而不是连续值，看起来才像一箱一箱码上去的 */
const CRATE_HEIGHTS = [30, 44, 58, 66, 78, 92];

/** 周转档位。快 / 慢占多数，呆滞是少数 —— 真实仓库就是这样 */
const CRATE_KINDS = ['c-fast', 'c-fast', 'c-fast', 'c-slow', 'c-slow', 'c-dead'];

/**
 * 生成货架墙。
 *
 * 用固定种子的伪随机，不用 Math.random —— 否则每次渲染货架都不一样，
 * 截图、录屏、以及"我上次看到的那面墙"都对不上，观感上像在闪。
 */
export function buildCrates(cols: number, rows: number, seed0: number) {
  let seed = seed0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: cols * rows }, () => ({
    cls: CRATE_KINDS[Math.floor(rnd() * CRATE_KINDS.length)],
    h: CRATE_HEIGHTS[Math.floor(rnd() * CRATE_HEIGHTS.length)],
  }));
}

/**
 * 把一个库存量换算成货位高度（0~100）。
 *
 * 以安全库存为 100% 基准，超过 3 倍安全库存就顶格 —— 否则一个爆仓商品
 * 会把同排其他货位压成一条线，整排读数全废。
 */
export function stockLevelPercent(quantity: number, safetyStock: number): number {
  if (!safetyStock || safetyStock <= 0) return quantity > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((quantity / (safetyStock * 3)) * 100)));
}

/** 周转档位 → 颜色类名。数据层拿不到真实周转时，先按"是否低于安全库存"粗分 */
export function turnoverClass(quantity: number, safetyStock: number): string {
  if (quantity <= 0) return 'c-empty';
  if (safetyStock > 0 && quantity < safetyStock) return 'c-dead';
  return 'c-fast';
}
