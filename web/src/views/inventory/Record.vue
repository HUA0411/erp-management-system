<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="商品名称 / 来源单号" clearable style="width: 220px" @keyup.enter="load" @clear="load" />
        <el-select v-model="query.type" placeholder="变动类型" clearable style="width: 130px" @change="load">
          <el-option v-for="(v, k) in INVENTORY_TYPE" :key="k" :label="v.text" :value="k" />
        </el-select>
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 250px" />
        <el-button type="primary" :icon="Search" @click="load">查询</el-button>
      </div>

      <el-table :data="list" v-loading="loading">
        <el-table-column prop="createdAt" label="时间" width="165" />
        <el-table-column prop="productName" label="商品" min-width="170" show-overflow-tooltip />
        <el-table-column label="类型" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="INVENTORY_TYPE[row.type]?.type || 'info'" size="small">{{ INVENTORY_TYPE[row.type]?.text || row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="变动数量" width="110" align="right">
          <template #default="{ row }">
            <span class="num" :style="row.quantity < 0 ? 'color:#d9534f' : 'color:#2f9e6e'">
              {{ row.quantity > 0 ? '+' : '' }}{{ fmtQty(row.quantity) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="结余" width="100" align="right">
          <template #default="{ row }"><span class="num">{{ fmtQty(row.balanceAfter) }}</span></template>
        </el-table-column>
        <el-table-column prop="refType" label="来源" width="150" />
        <el-table-column prop="refNo" label="来源单号" width="170" />
        <el-table-column prop="operator" label="操作人" width="100" />
        <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
      </el-table>

      <el-pagination class="pager" background layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]" @change="load" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { inventoryApi } from '@/api';
import { fmtQty, INVENTORY_TYPE } from '@/utils';
import type { InventoryRecordItem } from '@erp/shared';

const loading = ref(false);
const list = ref<InventoryRecordItem[]>([]);
const total = ref(0);
const dateRange = ref<[string, string] | null>(null);
const query = reactive({ page: 1, pageSize: 10, keyword: '', type: '' });

async function load() {
  loading.value = true;
  try {
    const res = await inventoryApi.records({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      type: query.type || undefined,
      startDate: dateRange.value?.[0],
      endDate: dateRange.value?.[1],
    });
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.pager {
  margin-top: 14px;
  justify-content: flex-end;
}
</style>
