<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="用户名 / 姓名 / 电话" clearable style="width: 220px" @keyup.enter="load" @clear="load" />
        <el-button type="primary" :icon="Search" @click="load">查询</el-button>
        <div class="spacer"></div>
        <el-button v-permission="'system:user:create'" type="primary" :icon="Plus" @click="openCreate">新增用户</el-button>
      </div>

      <el-table :data="list" v-loading="loading">
        <el-table-column prop="username" label="用户名" width="130" />
        <el-table-column prop="realName" label="姓名" width="130" />
        <el-table-column label="角色" min-width="180">
          <template #default="{ row }">
            <el-tag v-for="r in row.roles" :key="r.id" size="small" effect="plain" style="margin-right: 4px">{{ r.name }}</el-tag>
            <el-tag v-if="row.isSuperAdmin" size="small" type="warning">平台超管</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="电话" width="130" />
        <el-table-column prop="email" label="邮箱" min-width="160" show-overflow-tooltip />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="165" />
        <el-table-column label="操作" width="210" align="center" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'system:user:update'" link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button v-permission="'system:user:reset-password'" link type="warning" size="small" @click="openReset(row)">重置密码</el-button>
            <el-popconfirm v-if="!row.isSuperAdmin" title="停用该用户？" @confirm="remove(row)">
              <template #reference>
                <el-button v-permission="'system:user:delete'" link type="danger" size="small">停用</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination class="pager" background layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]" @change="load" />
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑用户' : '新增用户'" width="520px" :close-on-click-modal="false">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="用户名" prop="username">
              <el-input v-model="form.username" :disabled="!!form.id" placeholder="登录名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item v-if="!form.id" label="密码" prop="password">
              <el-input v-model="form.password" type="password" show-password placeholder="6-64 位" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="姓名"><el-input v-model="form.realName" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="电话"><el-input v-model="form.phone" /></el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="邮箱"><el-input v-model="form.email" /></el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.roleIds" multiple placeholder="分配角色" style="width: 100%">
            <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resetVisible" title="重置密码" width="420px">
      <el-form label-width="90px">
        <el-form-item label="用户">{{ current?.realName || current?.username }}</el-form-item>
        <el-form-item label="新密码" required>
          <el-input v-model="resetPwd" type="password" show-password placeholder="6-64 位" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetVisible = false">取消</el-button>
        <el-button type="primary" :loading="resetting" @click="submitReset">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import { roleApi, userApi } from '@/api';
import type { UserItem } from '@erp/shared';

const loading = ref(false);
const list = ref<UserItem[]>([]);
const total = ref(0);
const roles = ref<any[]>([]);
const query = reactive({ page: 1, pageSize: 10, keyword: '' });

const dialogVisible = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<Record<string, any>>({});
const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

const resetVisible = ref(false);
const resetting = ref(false);
const resetPwd = ref('');
const current = ref<UserItem | null>(null);

async function load() {
  loading.value = true;
  try {
    const res = await userApi.list({ ...query, keyword: query.keyword || undefined });
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function loadRoles() {
  roles.value = await roleApi.options();
}

function openCreate() {
  Object.assign(form, { id: undefined, username: '', password: '', realName: '', phone: '', email: '', roleIds: [], status: 1 });
  dialogVisible.value = true;
}

function openEdit(row: UserItem) {
  Object.assign(form, { id: row.id, username: row.username, realName: row.realName, phone: row.phone, email: row.email, roleIds: row.roles.map((r) => r.id), status: row.status });
  dialogVisible.value = true;
}

async function save() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    const payload = { realName: form.realName, phone: form.phone, email: form.email, roleIds: form.roleIds, status: form.status };
    if (form.id) await userApi.update(form.id, payload);
    else await userApi.create({ ...payload, username: form.username, password: form.password });
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function remove(row: UserItem) {
  await userApi.remove(row.id);
  ElMessage.success('用户已停用');
  load();
}

function openReset(row: UserItem) {
  current.value = row;
  resetPwd.value = '';
  resetVisible.value = true;
}

async function submitReset() {
  if (!resetPwd.value || resetPwd.value.length < 6) {
    ElMessage.warning('密码长度至少 6 位');
    return;
  }
  resetting.value = true;
  try {
    await userApi.resetPassword(current.value!.id, resetPwd.value);
    ElMessage.success('密码已重置');
    resetVisible.value = false;
  } finally {
    resetting.value = false;
  }
}

onMounted(() => {
  loadRoles();
  load();
});
</script>

<style scoped>
.pager {
  margin-top: 14px;
  justify-content: flex-end;
}
</style>
