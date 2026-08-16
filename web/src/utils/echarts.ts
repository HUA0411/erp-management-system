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

/** 初始化图表并自动 resize/销毁 */
export function useEChart(el: HTMLElement, option: EChartsCoreOption) {
  const chart = echarts.init(el);
  chart.setOption(option);
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
