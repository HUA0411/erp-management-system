<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="用户名 / 模块 / 动作" clearable style="width: 220px" @keyup.enter="load" @clear="load" />
        <el-button type="primary" :icon="Search" @click="load">查询</el-button>
      </div>

      <el-table :data="list" v-loading="loading">
        <el-table-column prop="createdAt" label="时间" width="170" />
        <el-table-column prop="username" label="操作人" width="110" />
        <el-table-column prop="module" label="模块" width="120" />
        <el-table-column prop="action" label="动作" min-width="150" show-overflow-tooltip />
        <el-table-column prop="method" label="方式" width="80" align="center" />
        <el-table-column prop="path" label="路径" min-width="140" show-overflow-tooltip />
      </el-table>

      <el-pagination class="pager" background layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]" @change="load" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { logApi } from '@/api';
import type { OperationLogItem } from '@erp/shared';

const loading = ref(false);
const list = ref<OperationLogItem[]>([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 10, keyword: '' });

async function load() {
  loading.value = true;
  try {
    const res = await logApi.list({ ...query, keyword: query.keyword || undefined });
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
