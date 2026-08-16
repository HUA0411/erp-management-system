<template>
  <div class="page">
    <div class="page-card">
      <div class="summary-row">
        <div class="summary-item">
          <div class="s-label">应收合计</div>
          <div class="s-value num" style="color: #2456a6">¥{{ fmtMoney(totalReceivable) }}</div>
        </div>
        <div class="summary-item">
          <div class="s-label">应付合计</div>
          <div class="s-value num" style="color: #e07b1f">¥{{ fmtMoney(totalPayable) }}</div>
        </div>
        <div class="summary-item">
          <div class="s-label">往来净额</div>
          <div class="s-value num" style="color: #2f9e6e">¥{{ fmtMoney(totalReceivable - totalPayable) }}</div>
        </div>
      </div>
    </div>

    <div class="page-card">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="应收（客户）" name="receivable">
          <el-table :data="receivableList" v-loading="loading" :row-class-name="balanceClass">
            <el-table-column prop="partnerName" label="客户" min-width="200" show-overflow-tooltip />
            <el-table-column label="订单总额" width="140" align="right">
              <template #default="{ row }"><span class="num">¥{{ fmtMoney(row.totalAmount) }}</span></template>
            </el-table-column>
            <el-table-column label="已收款" width="140" align="right">
              <template #default="{ row }"><span class="num" style="color: #2f9e6e">¥{{ fmtMoney(row.paidAmount) }}</span></template>
            </el-table-column>
            <el-table-column label="未收余额" width="150" align="right">
              <template #default="{ row }">
                <span class="num" :style="row.balance > 0 ? 'color:#d9534f;font-weight:700' : ''">¥{{ fmtMoney(row.balance) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="应付（供应商）" name="payable">
          <el-table :data="payableList" v-loading="loading" :row-class-name="balanceClass">
            <el-table-column prop="partnerName" label="供应商" min-width="200" show-overflow-tooltip />
            <el-table-column label="订单总额" width="140" align="right">
              <template #default="{ row }"><span class="num">¥{{ fmtMoney(row.totalAmount) }}</span></template>
            </el-table-column>
            <el-table-column label="已付款" width="140" align="right">
              <template #default="{ row }"><span class="num" style="color: #2f9e6e">¥{{ fmtMoney(row.paidAmount) }}</span></template>
            </el-table-column>
            <el-table-column label="未付余额" width="150" align="right">
              <template #default="{ row }">
                <span class="num" :style="row.balance > 0 ? 'color:#e07b1f;font-weight:700' : ''">¥{{ fmtMoney(row.balance) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { financeApi } from '@/api';
import { fmtMoney } from '@/utils';
import type { AccountSummary } from '@erp/shared';

const loading = ref(false);
const activeTab = ref('receivable');
const accounts = ref<AccountSummary[]>([]);

const receivableList = computed(() => accounts.value.filter((a) => a.partnerType === 'customer'));
const payableList = computed(() => accounts.value.filter((a) => a.partnerType === 'supplier'));
const totalReceivable = computed(() => receivableList.value.reduce((s, a) => s + a.balance, 0));
const totalPayable = computed(() => payableList.value.reduce((s, a) => s + a.balance, 0));

function balanceClass({ row }: { row: AccountSummary }) {
  return row.balance > 0 ? 'balance-row' : '';
}

async function load() {
  loading.value = true;
  try {
    accounts.value = await financeApi.accounts();
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.summary-row {
  display: flex;
  gap: 14px;
}

.summary-item {
  flex: 1;
  background: linear-gradient(135deg, #f7fafd, #eef3fb);
  border-radius: 10px;
  padding: 16px 20px;

  .s-label {
    font-size: 12.5px;
    color: #8a97ab;
    margin-bottom: 6px;
  }

  .s-value {
    font-size: 24px;
    font-weight: 700;
  }
}

:deep(.balance-row) {
  --el-table-tr-bg-color: #fdf6ee;
}
</style>
