<template>
  <div class="page">
    <!-- 统计卡片 -->
    <div class="stat-grid">
      <div class="stat-card" v-for="(s, i) in stats" :key="s.label" :style="{ animationDelay: `${i * 60}ms` }">
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
import { echarts, useEChart, type EChartsCoreOption } from '@/utils/echarts';
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
    bg: '#e8f1fd',
    color: '#2456a6',
    tip: summary.value ? `本月 ¥${fmtMoney(summary.value.monthSaleAmount)}` : '',
  },
  {
    label: '待入库订单',
    value: summary.value?.pendingInboundCount ?? '—',
    icon: ShoppingCart,
    bg: '#fdf0e0',
    color: '#e07b1f',
    tip: '采购已确认未入库',
  },
  {
    label: '低库存预警',
    value: summary.value?.lowStockCount ?? '—',
    icon: Warning,
    bg: '#fdeaea',
    color: '#d9534f',
    tip: `商品总数 ${summary.value?.productCount ?? 0}`,
  },
  {
    label: '应收 / 应付',
    value: summary.value ? `¥${fmtMoney(summary.value.receivable)}` : '—',
    icon: Coin,
    bg: '#e9f7f0',
    color: '#2f9e6e',
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
    xAxis: { type: 'category', data: dates, boundaryGap: false, axisLine: { lineStyle: { color: '#d9e2ef' } }, axisLabel: { color: '#8a97ab', fontSize: 11 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#eef2f8' } }, axisLabel: { color: '#8a97ab', fontSize: 11 } },
    series: [
      {
        name: '销售额',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        data: amounts,
        lineStyle: { width: 2.5, color: '#2456a6' },
        itemStyle: { color: '#2456a6' },
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
    grid: { left: 16, right: 30, top: 10, bottom: 8, containLabel: true },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#eef2f8' } }, axisLabel: { color: '#8a97ab', fontSize: 11 } },
    yAxis: { type: 'category', data: names, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#51607a', fontSize: 11 } },
    series: [
      {
        type: 'bar',
        data: qtys,
        barWidth: 12,
        itemStyle: { borderRadius: [0, 6, 6, 0], color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#2c68c4' }, { offset: 1, color: '#5d81bd' }] } },
        label: { show: true, position: 'right', fontSize: 11, color: '#8a97ab' },
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
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 14px;
}

.stat-card {
  background: #fff;
  border-radius: var(--card-radius);
  padding: 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 1px 2px rgba(20, 38, 63, 0.06);
  opacity: 0;
  animation: fadeUp 0.4s ease forwards;
  position: relative;

  .stat-icon {
    width: 46px;
    height: 46px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .stat-value {
    font-size: 22px;
    font-weight: 700;
    color: #1d2a44;
    line-height: 1.2;
  }

  .stat-label {
    font-size: 12.5px;
    color: #8a97ab;
    margin-top: 3px;
  }

  .stat-trend {
    position: absolute;
    right: 14px;
    top: 14px;
    font-size: 11px;
    color: #a3aec0;
    background: #f5f8fc;
    padding: 3px 8px;
    border-radius: 10px;
  }
}

.chart-row {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 14px;

  &.lower {
    grid-template-columns: 1.5fr 1fr;
  }
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;

  .card-title {
    font-size: 15px;
    font-weight: 600;
    color: #1d2a44;
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
    background: #fdf6ee;
    border: 1px solid #fbe8cd;
    border-radius: 8px;
    padding: 10px 12px;

    .alert-name {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13.5px;
      color: #33415c;
      font-weight: 500;
    }

    .alert-qty {
      margin-top: 4px;
      font-size: 12px;
      color: #c97a1e;
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
</style>
