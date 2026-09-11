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

      <el-table v-loading="loading" :data="list">
        <template #empty>
          <EmptyState
            variant="all-good"
            title="每个货位都在安全线以上"
            desc="当前没有低于安全库存的商品。补货计划可以缓一缓 —— 这是好事，不是「没数据」。"
            compact
          />
        </template>
        <el-table-column prop="productCode" label="编码" width="110" />
        <el-table-column prop="productName" label="商品名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="spec" label="规格" width="120" show-overflow-tooltip />
        <el-table-column prop="unit" label="单位" width="70" align="center" />
        <el-table-column label="当前库存" width="120" align="right">
          <template #default="{ row }"
            ><span class="num" style="color: var(--danger-text); font-weight: 700">{{
              fmtQty(row.quantity)
            }}</span></template
          >
        </el-table-column>
        <el-table-column label="安全库存" width="110" align="right">
          <template #default="{ row }"
            ><span class="num">{{ fmtQty(row.safetyStock) }}</span></template
          >
        </el-table-column>
        <el-table-column label="缺口" width="120" align="right">
          <template #default="{ row }"
            ><span class="num" style="color: var(--warning-text)">{{
              fmtQty(row.safetyStock - row.quantity)
            }}</span></template
          >
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
import EmptyState from '@/components/EmptyState.vue';
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
