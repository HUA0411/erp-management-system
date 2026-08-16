<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="出库单号 / 客户" clearable style="width: 220px" @keyup.enter="load" @clear="load" />
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 250px" />
        <el-button type="primary" :icon="Search" @click="load">查询</el-button>
      </div>

      <el-table :data="list" v-loading="loading">
        <el-table-column prop="outboundNo" label="出库单号" width="170" />
        <el-table-column prop="customerName" label="客户" min-width="180" show-overflow-tooltip />
        <el-table-column prop="outboundDate" label="出库日期" width="110" />
        <el-table-column label="金额" width="130" align="right">
          <template #default="{ row }"><span class="num">¥{{ fmtMoney(row.totalAmount) }}</span></template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="165" />
        <el-table-column label="操作" width="90" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row.id)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination class="pager" background layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]" @change="load" />
    </div>

    <el-drawer v-model="detailVisible" title="出库单详情" size="620px">
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="出库单号">{{ detail.outboundNo }}</el-descriptions-item>
          <el-descriptions-item label="出库日期">{{ detail.outboundDate }}</el-descriptions-item>
          <el-descriptions-item label="客户">{{ detail.customerName }}</el-descriptions-item>
          <el-descriptions-item label="关联订单">{{ detail.orderId ? `#${detail.orderId}` : '直接出库' }}</el-descriptions-item>
          <el-descriptions-item label="总金额">¥{{ fmtMoney(detail.totalAmount) }}</el-descriptions-item>
        </el-descriptions>
        <h4 class="detail-title">商品明细</h4>
        <el-table :data="detail.items" size="small" border>
          <el-table-column prop="productName" label="商品" min-width="160" />
          <el-table-column prop="spec" label="规格" width="100" />
          <el-table-column prop="quantity" label="数量" width="90" align="right" />
          <el-table-column label="单价" width="100" align="right">
            <template #default="{ row }"><span class="num">¥{{ fmtMoney(row.price) }}</span></template>
          </el-table-column>
          <el-table-column label="金额" width="110" align="right">
            <template #default="{ row }"><span class="num">¥{{ fmtMoney(row.amount) }}</span></template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { saleApi } from '@/api';
import { fmtMoney } from '@/utils';
import type { SaleOrderItem } from '@erp/shared';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const dateRange = ref<[string, string] | null>(null);
const query = reactive({ page: 1, pageSize: 10, keyword: '' });

const detailVisible = ref(false);
const detail = ref<SaleOrderItem | null>(null);

async function load() {
  loading.value = true;
  try {
    const res = await saleApi.outbounds({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      startDate: dateRange.value?.[0],
      endDate: dateRange.value?.[1],
    });
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function openDetail(id: number) {
  detail.value = await saleApi.outboundDetail(id);
  detailVisible.value = true;
}

onMounted(load);
</script>

<style scoped>
.pager {
  margin-top: 14px;
  justify-content: flex-end;
}

.detail-title {
  margin: 18px 0 8px;
  color: #33415c;
}
</style>
