<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-radio-group v-model="query.type" @change="load">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="receive">收款</el-radio-button>
          <el-radio-button value="pay">付款</el-radio-button>
        </el-radio-group>
        <el-input v-model="query.keyword" placeholder="单号 / 往来单位" clearable style="width: 200px" @keyup.enter="load" @clear="load" />
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 250px" />
        <el-button type="primary" :icon="Search" @click="load">查询</el-button>
        <div class="spacer"></div>
        <el-button v-permission="'finance:payment:create'" type="primary" :icon="Plus" @click="openCreate">登记收付款</el-button>
      </div>

      <el-table :data="list" v-loading="loading">
        <el-table-column prop="docNo" label="单号" width="170" />
        <el-table-column label="类型" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="PAYMENT_TYPE[row.type]?.type" size="small">{{ PAYMENT_TYPE[row.type]?.text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="partnerName" label="往来单位" min-width="180" show-overflow-tooltip />
        <el-table-column label="金额" width="130" align="right">
          <template #default="{ row }"><span class="num">¥{{ fmtMoney(row.amount) }}</span></template>
        </el-table-column>
        <el-table-column prop="orderNo" label="关联订单" width="170" />
        <el-table-column prop="payDate" label="日期" width="110" />
        <el-table-column prop="method" label="方式" width="100" />
        <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
        <el-table-column label="操作" width="80" align="center">
          <template #default="{ row }">
            <el-popconfirm title="确定删除该单据？" @confirm="remove(row)">
              <template #reference>
                <el-button v-permission="'finance:payment:delete'" link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination class="pager" background layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]" @change="load" />
    </div>

    <el-dialog v-model="dialogVisible" title="登记收付款" width="520px" :close-on-click-modal="false">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="类型" prop="type">
          <el-radio-group v-model="form.type">
            <el-radio value="receive">客户收款</el-radio>
            <el-radio value="pay">供应商付款</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="往来单位" prop="partnerId">
          <el-select v-model="form.partnerId" filterable placeholder="选择往来单位" style="width: 100%">
            <el-option v-for="p in partners" :key="p.id" :label="`${p.name}（${p.code}）`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="金额" prop="amount">
          <el-input-number v-model="form.amount" :min="0.01" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="14">
            <el-form-item label="关联订单">
              <el-input v-model="form.orderNo" placeholder="订单号（可选）" />
            </el-form-item>
          </el-col>
          <el-col :span="10">
            <el-form-item label="日期" prop="payDate">
              <el-date-picker v-model="form.payDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="支付方式">
          <el-select v-model="form.method" clearable style="width: 100%">
            <el-option label="银行转账" value="银行转账" />
            <el-option label="现金" value="现金" />
            <el-option label="微信/支付宝" value="微信/支付宝" />
            <el-option label="承兑汇票" value="承兑汇票" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">登记</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import { customerApi, financeApi, supplierApi } from '@/api';
import { fmtMoney, PAYMENT_TYPE, today } from '@/utils';
import type { PaymentItem } from '@erp/shared';

const loading = ref(false);
const list = ref<PaymentItem[]>([]);
const total = ref(0);
const suppliers = ref<any[]>([]);
const customers = ref<any[]>([]);
const dateRange = ref<[string, string] | null>(null);
const query = reactive({ page: 1, pageSize: 10, type: '', keyword: '' });

const dialogVisible = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<Record<string, any>>({});
const rules: FormRules = {
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  partnerId: [{ required: true, message: '请选择往来单位', trigger: 'change' }],
  amount: [{ required: true, message: '请输入金额', trigger: 'blur' }],
  payDate: [{ required: true, message: '请选择日期', trigger: 'change' }],
};

const partners = computed(() => (form.type === 'pay' ? suppliers.value : customers.value));

async function load() {
  loading.value = true;
  try {
    const res = await financeApi.payments({
      page: query.page,
      pageSize: query.pageSize,
      type: query.type || undefined,
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

async function openCreate() {
  const [s, c] = await Promise.all([supplierApi.options(), customerApi.options()]);
  suppliers.value = s;
  customers.value = c;
  Object.assign(form, { type: 'receive', partnerId: undefined, amount: undefined, orderNo: '', payDate: today(), method: '银行转账', remark: '' });
  dialogVisible.value = true;
}

async function save() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    await financeApi.createPayment({
      type: form.type,
      partnerType: form.type === 'pay' ? 'supplier' : 'customer',
      partnerId: form.partnerId,
      amount: form.amount,
      orderNo: form.orderNo || undefined,
      payDate: form.payDate,
      method: form.method,
      remark: form.remark,
    });
    ElMessage.success('登记成功');
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function remove(row: PaymentItem) {
  await financeApi.removePayment(row.id);
  ElMessage.success('已删除');
  load();
}

watch(
  () => form.type,
  () => {
    form.partnerId = undefined;
  },
);

onMounted(load);
</script>

<style scoped>
.pager {
  margin-top: 14px;
  justify-content: flex-end;
}
</style>
