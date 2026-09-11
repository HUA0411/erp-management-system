<template>
  <div class="page">
    <!-- 统计卡片 -->
    <div class="stat-grid">
      <div class="page-card stat-card" v-for="(s, i) in stats" :key="s.label" :style="{ animationDelay: `${i * 60}ms` }">
        <div class="stat-icon" :style="{ background: s.bg, color: s.color }">
          <el-icon :size="22"><component :is="s.icon" /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value num">{{ s.value }}</div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
        <div class="stat-trend" v-if="s.tip">{{ s.tip }}</div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-row">
      <div class="page-card chart-main">
        <div class="card-head">
          <span class="card-title">近 30 天销售趋势</span>
          <el-radio-group v-model="trendDays" size="small" @change="loadTrend">
            <el-radio-button :value="7">7 天</el-radio-button>
            <el-radio-button :value="30">30 天</el-radio-button>
          </el-radio-group>
        </div>
        <div ref="trendRef" class="chart-box"></div>
      </div>
      <div class="page-card chart-side">
        <div class="card-head"><span class="card-title">热销商品 TOP</span></div>
        <div ref="topRef" class="chart-box"></div>
      </div>
    </div>

    <div class="chart-row lower">
      <div class="page-card">
        <div class="card-head"><span class="card-title">最近单据</span></div>
        <el-table :data="recentOrders" size="small">
          <el-table-column label="类型" width="90">
            <template #default="{ row }">
              <el-tag :type="row.type === 'purchase' ? 'warning' : 'success'" size="small" effect="plain">
                {{ row.type === 'purchase' ? '采购' : '销售' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="orderNo" label="单号" min-width="150" />
          <el-table-column prop="partnerName" label="往来单位" min-width="140" show-overflow-tooltip />
          <el-table-column label="金额" width="120" align="right">
            <template #default="{ row }"><span class="num">¥{{ fmtMoney(row.amount) }}</span></template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="ORDER_STATUS[row.status]?.type || 'info'" size="small">
                {{ ORDER_STATUS[row.status]?.text || row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="date" label="日期" width="110" />
        </el-table>
      </div>
      <div class="page-card">
        <div class="card-head">
          <span class="card-title">库存预警</span>
          <el-button link type="primary" size="small" @click="$router.push('/inventory/alert')">查看全部</el-button>
        </div>
        <div v-if="alerts.length" class="alert-list">
          <div class="alert-item" v-for="a in alerts.slice(0, 6)" :key="a.productId">
            <div class="alert-name">
              <span>{{ a.productName }}</span>
              <el-tag type="danger" size="small" effect="plain">低库存</el-tag>
            </div>
            <div class="alert-qty num">库存 {{ fmtQty(a.quantity) }} / 安全 {{ fmtQty(a.safetyStock) }}</div>
          </div>
        </div>
        <el-empty v-else description="库存充足，暂无预警" :image-size="70" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Money, Tickets, Warning, TrendCharts, Box, Coin, ShoppingCart } from '@element-plus/icons-vue';
import { dashboardApi, inventoryApi } from '@/api';
import { echarts, fontsReady, token, useEChart, type EChartsCoreOption } from '@/utils/echarts';
import { fmtMoney, fmtQty, ORDER_STATUS } from '@/utils';
import type { DashboardSummary, InventoryItem, RecentOrder, TopProduct, TrendPoint } from '@erp/shared';

const router = useRouter();

const summary = ref<DashboardSummary | null>(null);
const trendPoints = ref<TrendPoint[]>([]);
const topProducts = ref<TopProduct[]>([]);
const recentOrders = ref<RecentOrder[]>([]);
const alerts = ref<InventoryItem[]>([]);
const trendDays = ref(30);

const stats = computed(() => [
  {
    label: '今日销售额',
    value: summary.value ? `¥${fmtMoney(summary.value.todaySaleAmount)}` : '—',
    icon: Money,
    bg: 'var(--brand-tint)',
    color: 'var(--el-color-primary)',
    tip: summary.value ? `本月 ¥${fmtMoney(summary.value.monthSaleAmount)}` : '',
  },
  {
    label: '待入库订单',
    value: summary.value?.pendingInboundCount ?? '—',
    icon: ShoppingCart,
    bg: 'var(--accent-tint)',
    color: 'var(--warning-text)',
    tip: '采购已确认未入库',
  },
  {
    label: '低库存预警',
    value: summary.value?.lowStockCount ?? '—',
    icon: Warning,
    bg: 'var(--danger-tint)',
    color: 'var(--danger-text)',
    tip: `商品总数 ${summary.value?.productCount ?? 0}`,
  },
  {
    label: '应收 / 应付',
    value: summary.value ? `¥${fmtMoney(summary.value.receivable)}` : '—',
    icon: Coin,
    bg: 'var(--success-tint)',
    color: 'var(--success-text)',
    tip: `应付 ¥${fmtMoney(summary.value?.payable ?? 0)}`,
  },
]);

const trendRef = ref<HTMLElement>();
const topRef = ref<HTMLElement>();
let trendChart: ReturnType<typeof useEChart> | null = null;
let topChart: ReturnType<typeof useEChart> | null = null;

function renderTrend() {
  if (!trendRef.value) return;
  const dates = trendPoints.value.map((p) => p.date.slice(5));
  const amounts = trendPoints.value.map((p) => p.amount);
  const option: EChartsCoreOption = {
    tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => `¥${fmtMoney(Number(v))}` },
    grid: { left: 16, right: 16, top: 30, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: dates, boundaryGap: false, axisLine: { lineStyle: { color: token('--border') } }, axisLabel: { color: token('--text-3'), fontSize: 11 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: token('--border-soft') } }, axisLabel: { color: token('--text-3'), fontSize: 11 } },
    series: [
      {
        name: '销售额',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        data: amounts,
        lineStyle: { width: 2.5, color: token('--el-color-primary') },
        itemStyle: { color: token('--el-color-primary') },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(36,86,166,0.28)' },
              { offset: 1, color: 'rgba(36,86,166,0.02)' },
            ],
          },
        },
      },
    ],
  };
  if (!trendChart) trendChart = useEChart(trendRef.value, option);
  else trendChart.setOption(option);
}

function renderTop() {
  if (!topRef.value) return;
  const names = topProducts.value.map((p) => p.productName);
  const qtys = topProducts.value.map((p) => p.quantity);
  const option: EChartsCoreOption = {
    tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => `${fmtQty(Number(v))}` },
    // top/bottom 要给首个/末个类目标签留出半个行高，否则 Y 轴第一项文字被裁掉
    grid: { left: 16, right: 30, top: 20, bottom: 6, containLabel: true },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: token('--border-soft') } }, axisLabel: { color: token('--text-3'), fontSize: 11 } },
    yAxis: { type: 'category', data: names, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: token('--text-2'), fontSize: 11 } },
    series: [
      {
        type: 'bar',
        data: qtys,
        barWidth: 12,
        itemStyle: { borderRadius: [0, 6, 6, 0], color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: token('--brand-strong') }, { offset: 1, color: token('--brand-soft') }] } },
        label: { show: true, position: 'right', fontSize: 11, color: token('--text-3') },
      },
    ],
  };
  if (!topChart) topChart = useEChart(topRef.value, option);
  else topChart.setOption(option);
}

async function loadTrend() {
  trendPoints.value = await dashboardApi.saleTrend(trendDays.value);
  renderTrend();
}

onMounted(async () => {
  const [s, tp, top, recent, alertList] = await Promise.all([
    dashboardApi.summary(),
    dashboardApi.saleTrend(30),
    dashboardApi.topProducts(8),
    dashboardApi.recentOrders(),
    inventoryApi.alerts().catch(() => [] as InventoryItem[]),
  ]);
  await fontsReady; // 中文字体就绪后再画，否则 Canvas 上的中文变方框
  summary.value = s;
  trendPoints.value = tp;
  topProducts.value = top;
  recentOrders.value = recent;
  alerts.value = alertList;
  renderTrend();
  renderTop();
});

onUnmounted(() => {
  trendChart?.dispose();
  topChart?.dispose();
});
</script>

<style scoped lang="scss">
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 14px;
}

/* 响应式：统计卡与图表区的降列规则集中在文件末尾的 @media 块里 */

/* 外壳（背景/圆角/阴影/内边距）复用全局 .page-card，这里只留本页特有部分。
   原来它自己写了一套，和 .page-card 只差 2px 内边距，属无意义差异。 */
.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 0;
  opacity: 0;
  animation: fadeUp 0.4s ease forwards;
  position: relative;

  .stat-icon {
    width: 46px;
    height: 46px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .stat-value {
    font-size: var(--fs-xl);
    font-weight: 700;
    color: var(--text-2);
    line-height: 1.2;
  }

  .stat-label {
    font-size: var(--fs-sm);
    color: var(--text-3);
    margin-top: 3px;
  }

  .stat-trend {
    position: absolute;
    right: 14px;
    top: 14px;
    font-size: var(--fs-2xs);
    color: var(--text-4);
    background: var(--surface-muted);
    padding: 3px 8px;
    border-radius: 10px;
  }
}

.chart-row {
  display: grid;
  /* minmax(0, …)：默认的 1fr 最小值是 auto，内容会顶住不缩，
     必须显式把最小值压到 0，列才能真正跟着容器变窄。 */
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 14px;

  &.lower {
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  }
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;

  .card-title {
    font-size: var(--fs-md);
    font-weight: 600;
    color: var(--text-2);
  }
}

.chart-box {
  height: 280px;
}

.alert-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 280px;
  overflow-y: auto;

  .alert-item {
    background: var(--accent-tint);
    border: 1px solid var(--accent-tint);
    border-radius: var(--radius-lg);
    padding: 10px 12px;

    .alert-name {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: var(--fs-base);
      color: var(--text-2);
      font-weight: 500;
    }

    .alert-qty {
      margin-top: 4px;
      font-size: var(--fs-xs);
      color: var(--accent-strong);
    }
  }
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ============ 响应式（原先 0 处媒体查询） ============
   断点依据实测：1440/1280 正常，1024 起统计卡被挤到 106px，
   768 起图表只剩 252px。这里只处理"降列"，侧边栏自动收起在 MainLayout 里做。 */

/* ≤1280：统计卡 4 列 → 2 列（留出每张卡的可用宽度） */
@media (max-width: 1280px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* ≤1100：图表区两列 → 单列堆叠 */
@media (max-width: 1100px) {
  .chart-row,
  .chart-row.lower {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* ≤640：统计卡单列，避免 2 列时每张仍不足 200px */
@media (max-width: 640px) {
  .stat-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
