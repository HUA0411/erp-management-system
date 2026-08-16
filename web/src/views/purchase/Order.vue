<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="单号 / 供应商" clearable style="width: 200px" @keyup.enter="load" @clear="load" />
        <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 130px" @change="load">
          <el-option v-for="(v, k) in ORDER_STATUS" :key="k" :label="v.text" :value="k" />
        </el-select>
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 250px" />
        <el-button type="primary" :icon="Search" @click="load">查询</el-button>
        <div class="spacer"></div>
        <el-button v-permission="'purchase:order:create'" type="primary" :icon="Plus" @click="openCreate">新增采购订单</el-button>
      </div>

      <el-table :data="list" v-loading="loading">
        <el-table-column prop="orderNo" label="单号" width="170" />
        <el-table-column prop="supplierName" label="供应商" min-width="180" show-overflow-tooltip />
        <el-table-column prop="orderDate" label="订单日期" width="110" />
        <el-table-column label="金额" width="130" align="right">
          <template #default="{ row }"><span class="num">¥{{ fmtMoney(row.totalAmount) }}</span></template>
        </el-table-column>
        <el-table-column label="已付" width="110" align="right">
          <template #default="{ row }"><span class="num">¥{{ fmtMoney(row.paidAmount) }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="95" align="center">
          <template #default="{ row }">
            <el-tag :type="ORDER_STATUS[row.status]?.type || 'info'" size="small">{{ ORDER_STATUS[row.status]?.text || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="165" />
        <el-table-column label="操作" width="250" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row.id)">详情</el-button>
            <el-button v-if="row.status === 'draft'" v-permission="'purchase:order:update'" link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="row.status === 'draft'" v-permission="'purchase:order:confirm'" link type="success" size="small" @click="confirm(row)">确认</el-button>
            <el-button v-if="row.status === 'confirmed'" v-permission="'purchase:order:inbound'" link type="warning" size="small" @click="warehouse(row)">入库</el-button>
            <el-popconfirm v-if="['draft', 'confirmed'].includes(row.status)" title="确定取消该订单？" @confirm="cancel(row)">
              <template #reference>
                <el-button v-permission="'purchase:order:cancel'" link type="danger" size="small">取消</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination class="pager" background layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]" @change="load" />
    </div>

    <!-- 新增/编辑 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑采购订单' : '新增采购订单'" width="860px" :close-on-click-modal="false" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-row :gutter="12">
          <el-col :span="10">
            <el-form-item label="供应商" prop="supplierId">
              <el-select v-model="form.supplierId" filterable placeholder="选择供应商" style="width: 100%">
                <el-option v-for="s in suppliers" :key="s.id" :label="`${s.name}（${s.code}）`" :value="s.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="订单日期" prop="orderDate">
              <el-date-picker v-model="form.orderDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="备注"><el-input v-model="form.remark" maxlength="255" /></el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <div class="items-head">
        <span class="items-title">商品明细</span>
        <el-button size="small" :icon="Plus" @click="addLine">添加商品</el-button>
      </div>
      <el-table :data="form.items" size="small" border>
        <el-table-column label="商品" min-width="220">
          <template #default="{ row }">
            <el-select v-model="row.productId" filterable placeholder="搜索商品" style="width: 100%" @change="(id: number) => onProductChange(row, id)">
              <el-option v-for="p in productOptions" :key="p.id" :label="`${p.name}（${p.code}）`" :value="p.id" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="数量" width="130">
          <template #default="{ row }">
            <el-input-number v-model="row.quantity" :min="0.01" :precision="2" size="small" style="width: 100%" @change="recalc" />
          </template>
        </el-table-column>
        <el-table-column label="单价" width="130">
          <template #default="{ row }">
            <el-input-number v-model="row.price" :min="0" :precision="2" size="small" style="width: 100%" @change="recalc" />
          </template>
        </el-table-column>
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }"><span class="num">¥{{ fmtMoney(row.amount) }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="60" align="center">
          <template #default="{ $index }">
            <el-button link type="danger" size="small" @click="form.items.splice($index, 1); recalc()">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="total-line">
        合计：<span class="num total-amount">¥{{ fmtMoney(totalAmount) }}</span>
      </div>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-drawer v-model="detailVisible" title="采购订单详情" size="640px">
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="单号">{{ detail.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="ORDER_STATUS[detail.status]?.type || 'info'" size="small">{{ ORDER_STATUS[detail.status]?.text || detail.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="供应商">{{ detail.supplierName }}</el-descriptions-item>
          <el-descriptions-item label="订单日期">{{ detail.orderDate }}</el-descriptions-item>
          <el-descriptions-item label="订单总额">¥{{ fmtMoney(detail.totalAmount) }}</el-descriptions-item>
          <el-descriptions-item label="已付金额">¥{{ fmtMoney(detail.paidAmount) }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ detail.remark || '-' }}</el-descriptions-item>
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
        <div v-if="detail.status === 'confirmed'" class="detail-actions">
          <el-button v-permission="'purchase:order:inbound'" type="warning" @click="warehouse(detail)">立即入库</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import { productApi, purchaseApi, supplierApi } from '@/api';
import { fmtMoney, ORDER_STATUS, today } from '@/utils';
import type { OrderItemLine, PurchaseOrderItem } from '@erp/shared';

const loading = ref(false);
const list = ref<PurchaseOrderItem[]>([]);
const total = ref(0);
const suppliers = ref<any[]>([]);
const productOptions = ref<any[]>([]);
const dateRange = ref<[string, string] | null>(null);
const query = reactive({ page: 1, pageSize: 10, keyword: '', status: '' });

const dialogVisible = ref(false);
const detailVisible = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const detail = ref<PurchaseOrderItem | null>(null);

interface OrderForm {
  id?: number;
  supplierId?: number;
  orderDate: string;
  remark: string;
  items: (OrderItemLine & { productName?: string; spec?: string; unit?: string })[];
}

const form = reactive<OrderForm>({ orderDate: today(), remark: '', items: [] });

const rules: FormRules = {
  supplierId: [{ required: true, message: '请选择供应商', trigger: 'change' }],
  orderDate: [{ required: true, message: '请选择日期', trigger: 'change' }],
};

const totalAmount = computed(() => form.items.reduce((s, i) => s + Number(i.amount || 0), 0));

async function load() {
  loading.value = true;
  try {
    const res = await purchaseApi.list({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      status: query.status || undefined,
      startDate: dateRange.value?.[0],
      endDate: dateRange.value?.[1],
    });
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function loadOptions() {
  const [s, p] = await Promise.all([supplierApi.options(), productApi.options()]);
  suppliers.value = s;
  productOptions.value = p;
}

function addLine() {
  form.items.push({ productId: undefined as unknown as number, productName: '', quantity: 1, price: 0, amount: 0 });
}

function onProductChange(row: any, id: number) {
  const p = productOptions.value.find((x) => x.id === id);
  if (p) {
    row.productName = p.name;
    row.spec = p.spec;
    row.unit = p.unit;
    row.price = Number(p.purchasePrice ?? 0);
  }
  recalc();
}

function recalc() {
  for (const i of form.items) {
    i.amount = Math.round(Number(i.quantity || 0) * Number(i.price || 0) * 100) / 100;
  }
}

function openCreate() {
  Object.assign(form, { id: undefined, supplierId: undefined, orderDate: today(), remark: '', items: [] });
  addLine();
  dialogVisible.value = true;
}

function openEdit(row: PurchaseOrderItem) {
  Object.assign(form, {
    id: row.id,
    supplierId: row.supplierId,
    orderDate: row.orderDate,
    remark: row.remark || '',
    items: (row.items || []).map((i) => ({ ...i })),
  });
  if (!form.items.length) addLine();
  dialogVisible.value = true;
}

async function save() {
  await formRef.value?.validate();
  if (!form.items.length || form.items.some((i) => !i.productId)) {
    ElMessage.warning('请填写完整的商品明细');
    return;
  }
  saving.value = true;
  try {
    const payload = { supplierId: form.supplierId, orderDate: form.orderDate, remark: form.remark, items: form.items.map((i) => ({ productId: i.productId, quantity: i.quantity, price: i.price })) };
    if (form.id) await purchaseApi.update(form.id, payload);
    else await purchaseApi.create(payload);
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function confirm(row: PurchaseOrderItem) {
  await purchaseApi.confirm(row.id);
  ElMessage.success('订单已确认');
  load();
}

async function cancel(row: PurchaseOrderItem) {
  await purchaseApi.cancel(row.id);
  ElMessage.success('订单已取消');
  load();
}

async function warehouse(row: PurchaseOrderItem) {
  await ElMessageBox.confirm(`确认对订单 ${row.orderNo} 执行入库？入库后库存将增加且订单锁定。`, '采购入库', { type: 'warning' });
  const res = await purchaseApi.warehouse(row.id);
  ElMessage.success(`入库成功：${res.inboundNo}`);
  detailVisible.value = false;
  load();
}

async function openDetail(id: number) {
  detail.value = await purchaseApi.detail(id);
  detailVisible.value = true;
}

onMounted(() => {
  loadOptions();
  load();
});
</script>

<style scoped>
.pager {
  margin-top: 14px;
  justify-content: flex-end;
}

.items-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 4px 0 10px;

  .items-title {
    font-weight: 600;
    color: #33415c;
  }
}

.total-line {
  text-align: right;
  padding: 10px 4px 0;
  color: #51607a;

  .total-amount {
    font-size: 18px;
    font-weight: 700;
    color: var(--el-color-danger);
  }
}

.detail-title {
  margin: 18px 0 8px;
  color: #33415c;
}

.detail-actions {
  margin-top: 16px;
  text-align: right;
}
</style>
