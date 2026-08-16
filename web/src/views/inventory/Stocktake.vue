<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 130px" @change="load">
          <el-option label="草稿" value="draft" />
          <el-option label="已确认" value="confirmed" />
        </el-select>
        <el-input v-model="query.keyword" placeholder="盘点单号" clearable style="width: 180px" @keyup.enter="load" @clear="load" />
        <el-button type="primary" :icon="Search" @click="load">查询</el-button>
        <div class="spacer"></div>
        <el-button v-permission="'inventory:stocktake:create'" type="primary" :icon="Plus" @click="openCreate">新建盘点单</el-button>
      </div>

      <el-table :data="list" v-loading="loading">
        <el-table-column prop="stocktakeNo" label="盘点单号" width="170" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'draft' ? 'info' : 'success'" size="small">{{ row.status === 'draft' ? '草稿' : '已确认' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="创建时间" width="165" />
        <el-table-column label="操作" width="160" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row.id)">详情</el-button>
            <el-popconfirm v-if="row.status === 'draft'" title="确认后按差异调整库存，确定？" @confirm="confirm(row)">
              <template #reference>
                <el-button v-permission="'inventory:stocktake:confirm'" link type="warning" size="small">确认盘点</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination class="pager" background layout="total, prev, pager, next" :total="total" v-model:current-page="query.page" v-model:page-size="query.pageSize" @change="load" />
    </div>

    <!-- 新建盘点 -->
    <el-dialog v-model="createVisible" title="新建盘点单" width="760px" :close-on-click-modal="false">
      <div class="toolbar" style="margin-bottom: 10px">
        <el-input v-model="pickKeyword" placeholder="搜索商品添加盘点" clearable style="width: 240px" />
        <el-button :icon="Plus" size="small" @click="addPick">添加</el-button>
      </div>
      <el-table :data="form.items" size="small" border max-height="360">
        <el-table-column label="商品" min-width="200">
          <template #default="{ row }">
            <el-select v-model="row.productId" filterable placeholder="选择商品" style="width: 100%" @change="(id: number) => onPick(row, id)">
              <el-option v-for="p in filteredOptions" :key="p.id" :label="`${p.name}（${p.code}）库存 ${fmtQty(p.quantity)}`" :value="p.id" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="账面数量" width="110" align="right">
          <template #default="{ row }"><span class="num">{{ fmtQty(row.bookQty) }}</span></template>
        </el-table-column>
        <el-table-column label="实盘数量" width="130">
          <template #default="{ row }">
            <el-input-number v-model="row.actualQty" :min="0" :precision="2" size="small" style="width: 100%" @change="recalcDiff" />
          </template>
        </el-table-column>
        <el-table-column label="差异" width="100" align="right">
          <template #default="{ row }">
            <span class="num" :style="row.diffQty > 0 ? 'color:#2f9e6e' : row.diffQty < 0 ? 'color:#d9534f' : ''">{{ fmtQty(row.diffQty) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="60" align="center">
          <template #default="{ $index }">
            <el-button link type="danger" size="small" @click="form.items.splice($index, 1)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-input v-model="form.remark" placeholder="盘点备注（可选）" style="margin-top: 12px" />
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">创建盘点单</el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-drawer v-model="detailVisible" title="盘点单详情" size="620px">
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="盘点单号">{{ detail.stocktakeNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="detail.status === 'draft' ? 'info' : 'success'" size="small">{{ detail.status === 'draft' ? '草稿' : '已确认' }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ detail.remark || '-' }}</el-descriptions-item>
        </el-descriptions>
        <h4 class="detail-title">盘点明细</h4>
        <el-table :data="detail.items" size="small" border>
          <el-table-column prop="productName" label="商品" min-width="160" />
          <el-table-column prop="bookQty" label="账面" width="90" align="right" />
          <el-table-column prop="actualQty" label="实盘" width="90" align="right" />
          <el-table-column label="差异" width="90" align="right">
            <template #default="{ row }">
              <span class="num" :style="row.diffQty > 0 ? 'color:#2f9e6e' : row.diffQty < 0 ? 'color:#d9534f' : ''">{{ fmtQty(row.diffQty) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import { productApi, stocktakeApi } from '@/api';
import { fmtQty } from '@/utils';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 10, status: '', keyword: '' });

const createVisible = ref(false);
const detailVisible = ref(false);
const saving = ref(false);
const pickKeyword = ref('');
const productOptions = ref<any[]>([]);
const detail = ref<any>(null);
const formRef = ref<FormInstance>();
const form = reactive<{ remark: string; items: any[] }>({ remark: '', items: [] });

const filteredOptions = computed(() => {
  const kw = pickKeyword.value.trim();
  if (!kw) return productOptions.value;
  return productOptions.value.filter((p) => p.name.includes(kw) || p.code.includes(kw));
});

async function load() {
  loading.value = true;
  try {
    const res = await stocktakeApi.list({ ...query, status: query.status || undefined, keyword: query.keyword || undefined });
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function openCreate() {
  productOptions.value = await productApi.options();
  Object.assign(form, { remark: '', items: [] });
  addPick();
  createVisible.value = true;
}

function addPick() {
  form.items.push({ productId: undefined as unknown as number, productName: '', bookQty: 0, actualQty: 0, diffQty: 0 });
}

function onPick(row: any, id: number) {
  const p = productOptions.value.find((x) => x.id === id);
  if (p) {
    row.productName = p.name;
    row.bookQty = Number(p.quantity ?? 0);
    row.actualQty = row.bookQty;
    row.diffQty = 0;
  }
}

function recalcDiff() {
  for (const i of form.items) {
    i.diffQty = Math.round((Number(i.actualQty || 0) - Number(i.bookQty || 0)) * 100) / 100;
  }
}

async function save() {
  if (!form.items.length || form.items.some((i) => !i.productId)) {
    ElMessage.warning('请至少添加一个盘点商品');
    return;
  }
  saving.value = true;
  try {
    const res = await stocktakeApi.create({
      remark: form.remark || undefined,
      items: form.items.map((i) => ({ productId: i.productId, actualQty: i.actualQty })),
    });
    ElMessage.success(`盘点单已创建：${res.stocktakeNo}`);
    createVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function confirm(row: any) {
  await stocktakeApi.confirm(row.id);
  ElMessage.success('盘点已确认，库存已按差异调整');
  load();
}

async function openDetail(id: number) {
  detail.value = await stocktakeApi.detail(id);
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
