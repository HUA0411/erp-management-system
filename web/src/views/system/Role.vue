<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="角色名称 / 编码" clearable style="width: 220px" @keyup.enter="load" @clear="load" />
        <el-button type="primary" :icon="Search" @click="load">查询</el-button>
        <div class="spacer"></div>
        <el-button v-permission="'system:role:create'" type="primary" :icon="Plus" @click="openCreate">新增角色</el-button>
      </div>

      <el-table :data="list" v-loading="loading">
        <el-table-column prop="name" label="角色名称" width="160" />
        <el-table-column prop="code" label="编码" width="160" />
        <el-table-column prop="remark" label="说明" min-width="200" show-overflow-tooltip />
        <el-table-column label="权限数" width="90" align="center">
          <template #default="{ row }">{{ row.permissionIds?.length || 0 }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" align="center">
          <template #default="{ row }">
            <el-button v-permission="'system:role:update'" link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-popconfirm v-if="row.code !== 'SUPER_ADMIN'" title="删除该角色？（需先解绑用户）" @confirm="remove(row)">
              <template #reference>
                <el-button v-permission="'system:role:delete'" link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination class="pager" background layout="total, prev, pager, next" :total="total" v-model:current-page="query.page" v-model:page-size="query.pageSize" @change="load" />
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑角色' : '新增角色'" width="560px" :close-on-click-modal="false">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="名称" prop="name"><el-input v-model="form.name" placeholder="如 采购主管" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="编码" prop="code">
              <el-input v-model="form.code" :disabled="!!form.id" placeholder="如 PURCHASE_MANAGER" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="说明"><el-input v-model="form.remark" /></el-form-item>
        <el-form-item label="权限" prop="permissionIds">
          <div class="perm-box">
            <el-tree
              ref="permTreeRef"
              :data="permTree"
              show-checkbox
              node-key="id"
              :props="{ label: 'name', children: 'children' }"
              default-expand-all
            />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import type { ElTree } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import { permissionApi, roleApi } from '@/api';
import type { PermissionNode, RoleItem } from '@erp/shared';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const permTree = ref<PermissionNode[]>([]);
const query = reactive({ page: 1, pageSize: 10, keyword: '' });

const dialogVisible = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const permTreeRef = ref<InstanceType<typeof ElTree>>();
const form = reactive<Record<string, any>>({});
const rules: FormRules = {
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }],
};

async function load() {
  loading.value = true;
  try {
    const res = await roleApi.list({ ...query, keyword: query.keyword || undefined });
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function openCreate() {
  Object.assign(form, { id: undefined, name: '', code: '', remark: '', permissionIds: [] });
  dialogVisible.value = true;
  await nextTick();
  permTreeRef.value?.setCheckedKeys([]);
}

async function openEdit(row: any) {
  Object.assign(form, { id: row.id, name: row.name, code: row.code, remark: row.remark, permissionIds: row.permissionIds || [] });
  dialogVisible.value = true;
  await nextTick();
  permTreeRef.value?.setCheckedKeys(row.permissionIds || []);
}

function collectChecked(): number[] {
  const tree = permTreeRef.value;
  if (!tree) return [];
  const checked = tree.getCheckedKeys(false) as number[];
  const half = tree.getHalfCheckedKeys() as number[];
  return [...checked, ...half];
}

async function save() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    const payload = { name: form.name, remark: form.remark, permissionIds: collectChecked() };
    if (form.id) await roleApi.update(form.id, payload);
    else await roleApi.create({ ...payload, code: form.code });
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function remove(row: RoleItem) {
  await roleApi.remove(row.id);
  ElMessage.success('角色已删除');
  load();
}

onMounted(async () => {
  permTree.value = await permissionApi.all();
  load();
});
</script>

<style scoped>
.pager {
  margin-top: 14px;
  justify-content: flex-end;
}

.perm-box {
  width: 100%;
  max-height: 380px;
  overflow-y: auto;
  border: 1px solid #e4e9f2;
  border-radius: 6px;
  padding: 8px;
}
</style>
