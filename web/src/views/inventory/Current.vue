<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="商品名称 / 编码" clearable style="width: 220px" @keyup.enter="load" @clear="load" />
        <el-checkbox v-model="lowOnly" @change="load">仅看低库存</el-checkbox>
        <div class="spacer"></div>
        <el-button v-permission="'inventory:adjust'" type="warning" :icon="EditPen" @click="openAdjust">库存调整</el-button>
      </div>

      <el-table :data="list" v-loading="loading" :row-class-name="rowClass">
        <el-table-column prop="productCode" label="编码" width="110" />
        <el-table-column prop="productName" label="商品名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="spec" label="规格" width="120" show-overflow-tooltip />
        <el-table-column prop="unit" label="单位" width="70" align="center" />
        <el-table-column label="当前库存" width="130" align="right">
          <template #default="{ row }">
            <span class="num" :style="row.isLow ? 'color:#d9534f;font-weight:700' : ''">{{ fmtQty(row.quantity) }}</span>
            <el-tag v-if="row.isLow" type="danger" size="small" effect="plain" style="margin-left: 6px">预警</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="安全库存" width="110" align="right">
          <template #default="{ row }"><span class="num">{{ fmtQty(row.safetyStock) }}</span></template>
        </el-table-column>
        <el-table-column label="库存金额" width="130" align="right">
          <template #default="{ row }"><span class="num">¥{{ fmtMoney(row.quantity * row.salePrice) }}</span></template>
        </el-table-column>
      </el-table>

      <el-pagination class="pager" background layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]" @change="load" />
    </div>

    <el-dialog v-model="adjustVisible" title="库存调整" width="440px">
      <el-form ref="adjustRef" :model="adjustForm" :rules="adjustRules" label-width="90px">
        <el-form-item label="商品" prop="productId">
          <el-select v-model="adjustForm.productId" filterable placeholder="搜索商品" style="width: 100%">
            <el-option v-for="p in productOptions" :key="p.id" :label="`${p.name}（${p.code}）`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="变动数量" prop="delta">
          <el-input-number v-model="adjustForm.delta" :precision="2" style="width: 100%" placeholder="正数=盘盈，负数=盘亏" />
        </el-form-item>
        <el-form-item label="原因"><el-input v-model="adjustForm.remark" type="textarea" :rows="2" placeholder="调整原因" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustVisible = false">取消</el-button>
        <el-button type="primary" :loading="adjusting" @click="submitAdjust">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { EditPen } from '@element-plus/icons-vue';
import { inventoryApi, productApi } from '@/api';
import { fmtMoney, fmtQty } from '@/utils';
import type { InventoryItem } from '@erp/shared';

const loading = ref(false);
const list = ref<InventoryItem[]>([]);
const total = ref(0);
const lowOnly = ref(false);
const query = reactive({ page: 1, pageSize: 10, keyword: '' });

const adjustVisible = ref(false);
const adjusting = ref(false);
const adjustRef = ref<FormInstance>();
const productOptions = ref<any[]>([]);
const adjustForm = reactive<Record<string, any>>({ productId: undefined, delta: 0, remark: '' });
const adjustRules: FormRules = {
  productId: [{ required: true, message: '请选择商品', trigger: 'change' }],
  delta: [{ required: true, message: '请输入变动数量', trigger: 'blur' }],
};

function rowClass({ row }: { row: InventoryItem }) {
  return row.isLow ? 'low-row' : '';
}

async function load() {
  loading.value = true;
  try {
    const res = await inventoryApi.current({ ...query, keyword: query.keyword || undefined, lowOnly: lowOnly.value });
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function openAdjust() {
  productOptions.value = await productApi.options();
  Object.assign(adjustForm, { productId: undefined, delta: 0, remark: '' });
  adjustVisible.value = true;
}

async function submitAdjust() {
  await adjustRef.value?.validate();
  adjusting.value = true;
  try {
    await inventoryApi.adjust(adjustForm.productId, adjustForm.delta, adjustForm.remark || '手工调整');
    ElMessage.success('调整成功');
    adjustVisible.value = false;
    load();
  } finally {
    adjusting.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.pager {
  margin-top: 14px;
  justify-content: flex-end;
}

:deep(.low-row) {
  --el-table-tr-bg-color: #fdf6ee;
}
</style>
