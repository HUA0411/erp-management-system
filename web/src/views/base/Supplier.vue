<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="名称 / 编码 / 联系人 / 电话" clearable style="width: 240px" @keyup.enter="load" @clear="load" />
        <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 120px" @change="load">
          <el-option label="启用" :value="1" />
          <el-option label="停用" :value="0" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="load">查询</el-button>
        <div class="spacer"></div>
        <el-button v-permission="'supplier:create'" type="primary" :icon="Plus" @click="openCreate">新增供应商</el-button>
      </div>

      <el-table :data="list" v-loading="loading">
        <el-table-column prop="code" label="编码" width="110" />
        <el-table-column prop="name" label="供应商名称" min-width="200" show-overflow-tooltip />
        <el-table-column prop="contact" label="联系人" width="110" />
        <el-table-column prop="phone" label="联系电话" width="140" />
        <el-table-column prop="address" label="地址" min-width="180" show-overflow-tooltip />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" align="center" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'supplier:update'" link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-popconfirm title="停用该供应商？" @confirm="remove(row)">
              <template #reference>
                <el-button v-permission="'supplier:delete'" link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination class="pager" background layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]" @change="load" />
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑供应商' : '新增供应商'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="编码" prop="code"><el-input v-model="form.code" :disabled="!!form.id" placeholder="如 SUP004" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="名称" prop="name"><el-input v-model="form.name" placeholder="供应商名称" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="联系人"><el-input v-model="form.contact" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="电话"><el-input v-model="form.phone" /></el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="地址"><el-input v-model="form.address" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import { supplierApi } from '@/api';
import type { SupplierItem } from '@erp/shared';

const loading = ref(false);
const list = ref<SupplierItem[]>([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 10, keyword: '', status: undefined as number | undefined });

const dialogVisible = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<Record<string, any>>({});
const rules: FormRules = {
  code: [{ required: true, message: '请输入编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
};

async function load() {
  loading.value = true;
  try {
    const res = await supplierApi.list({ ...query, keyword: query.keyword || undefined, status: query.status });
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, { id: undefined, code: '', name: '', contact: '', phone: '', address: '', remark: '' });
  dialogVisible.value = true;
}

function openEdit(row: SupplierItem) {
  Object.assign(form, { ...row });
  dialogVisible.value = true;
}

async function save() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    const payload = { name: form.name, contact: form.contact, phone: form.phone, address: form.address, remark: form.remark };
    if (form.id) await supplierApi.update(form.id, payload);
    else await supplierApi.create({ ...payload, code: form.code });
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function remove(row: SupplierItem) {
  await supplierApi.remove(row.id);
  ElMessage.success('供应商已停用');
  load();
}

onMounted(load);
</script>

<style scoped>
.pager {
  margin-top: 14px;
  justify-content: flex-end;
}
</style>
