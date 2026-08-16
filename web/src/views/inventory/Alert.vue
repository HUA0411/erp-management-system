<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-alert type="warning" :closable="false" show-icon style="flex: 1">
          <template #title>
            当前共 <b>{{ list.length }}</b> 个商品低于安全库存，请及时安排采购补货
          </template>
        </el-alert>
      </div>

      <el-table :data="list" v-loading="loading">
        <el-table-column prop="productCode" label="编码" width="110" />
        <el-table-column prop="productName" label="商品名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="spec" label="规格" width="120" show-overflow-tooltip />
        <el-table-column prop="unit" label="单位" width="70" align="center" />
        <el-table-column label="当前库存" width="120" align="right">
          <template #default="{ row }"><span class="num" style="color: #d9534f; font-weight: 700">{{ fmtQty(row.quantity) }}</span></template>
        </el-table-column>
        <el-table-column label="安全库存" width="110" align="right">
          <template #default="{ row }"><span class="num">{{ fmtQty(row.safetyStock) }}</span></template>
        </el-table-column>
        <el-table-column label="缺口" width="120" align="right">
          <template #default="{ row }"><span class="num" style="color: #e07b1f">{{ fmtQty(row.safetyStock - row.quantity) }}</span></template>
        </el-table-column>
        <el-table-column label="建议补货量" width="120" align="right">
          <template #default="{ row }">
            <span class="num">{{ fmtQty(Math.max(row.safetyStock * 2 - row.quantity, 0)) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { inventoryApi } from '@/api';
import { fmtQty } from '@/utils';
import type { InventoryItem } from '@erp/shared';

const loading = ref(false);
const list = ref<InventoryItem[]>([]);

async function load() {
  loading.value = true;
  try {
    list.value = await inventoryApi.alerts();
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
