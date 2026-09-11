import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  TitleComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  TitleComponent,
  CanvasRenderer,
]);

export { echarts };
export type { EChartsCoreOption };

/**
 * ECharts 用 Canvas 绘制，文字画上去就是位图，Web 字体后加载也不会重绘。
 * 所以必须等字体就绪再 setOption，否则中文标签会变成方框
 * （部署到没装中文字体的 Linux 服务器上必现）。用 await fontsReady 兜住这个竞态。
 */
export const fontsReady: Promise<void> =
  typeof document !== 'undefined' && 'fonts' in document
    ? document.fonts.ready.then(() => undefined).catch(() => undefined)
    : Promise.resolve();

/**
 * ECharts 的默认字体写死是 'sans-serif'，不走 CSS 的字体继承。
 * 浏览器把 'sans-serif' 解析成系统默认无衬线体（Linux 上是 DejaVu Sans，
 * 不含汉字），且此时不会再回退到页面上声明的中文字体 —— 图表里的中文
 * 会直接变成方框。所以必须把页面的字体栈显式喂给 ECharts。
 */
function resolveAppFont(): string {
  if (typeof window === 'undefined') return 'sans-serif';
  const fromVar = getComputedStyle(document.documentElement)
    .getPropertyValue('--app-font')
    .trim();
  const bodyFont = getComputedStyle(document.body).fontFamily;
  return fromVar || bodyFont || 'sans-serif';
}

/**
 * 把 CSS 变量解析成真实色值，给 ECharts 用。
 *
 * 为什么不能直接在 option 里写 'var(--x)'：ECharts 的部分配置（最典型的是
 * 渐变 colorStops）会自己解析颜色字符串，拿不到浏览器对 var() 的解析结果，
 * 结果是**整个 series 静默不渲染** —— 图表变成只有坐标轴的空壳。
 * 所以凡是要进 ECharts 的颜色，都过一遍这个函数。
 *
 * 用法：token('--brand-strong')  →  '#1d4485'
 *       token('--brand-strong', '#2456a6')  →  解析失败时的兜底
 */
export function token(name: string, fallback = '#000000'): string {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
}

/** 统一入口：注入字体栈，并延迟到字体加载完成后再绘制 */
export function useEChart(el: HTMLElement, option: EChartsCoreOption) {
  const chart = echarts.init(el);
  const withFont = {
    textStyle: { fontFamily: resolveAppFont() },
    ...option,
  } as EChartsCoreOption;
  chart.setOption(withFont);
  const onResize = () => chart.resize();
  window.addEventListener('resize', onResize);
  return {
    chart,
    setOption(opt: EChartsCoreOption) {
      chart.setOption(opt);
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    },
  };
}
