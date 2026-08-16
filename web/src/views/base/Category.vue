<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-button v-permission="'product:create'" type="primary" :icon="Plus" @click="openCreate()">新增分类</el-button>
      </div>
      <el-table :data="tree" row-key="id" :tree-props="{ children: 'children' }" default-expand-all>
        <el-table-column prop="name" label="分类名称" min-width="200" />
        <el-table-column label="子分类数" width="120" align="center">
          <template #default="{ row }">{{ row.children?.length || 0 }}</template>
        </el-table-column>
        <el-table-column prop="sort" label="排序" width="100" align="center" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" align="center">
          <template #default="{ row }">
            <el-button v-permission="'product:create'" link type="primary" size="small" @click="openCreate(row.id)">加子分类</el-button>
            <el-button v-permission="'product:update'" link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-popconfirm title="确认删除该分类？" @confirm="remove(row)">
              <template #reference>
                <el-button v-permission="'product:delete'" link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑分类' : '新增分类'" width="420px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="上级分类">
          <el-tree-select
            v-model="form.parentId"
            :data="[{ id: 0, name: '顶级分类', children: tree }]"
            :props="{ label: 'name', children: 'children' }"
            check-strictly
            :render-after-expand="false"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入分类名称" maxlength="32" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" style="width: 100%" />
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
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { categoryApi } from '@/api';

interface CategoryRow {
  id: number;
  parentId: number;
  name: string;
  sort: number;
  status: number;
  children?: CategoryRow[];
}

const tree = ref<CategoryRow[]>([]);
const dialogVisible = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<{ id?: number; parentId: number; name: string; sort: number }>({
  parentId: 0,
  name: '',
  sort: 0,
});

const rules: FormRules = {
  name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }],
};

async function load() {
  tree.value = (await categoryApi.tree()) as CategoryRow[];
}

function openCreate(parentId = 0) {
  Object.assign(form, { id: undefined, parentId, name: '', sort: 0 });
  dialogVisible.value = true;
}

function openEdit(row: CategoryRow) {
  Object.assign(form, { id: row.id, parentId: row.parentId, name: row.name, sort: row.sort });
  dialogVisible.value = true;
}

async function save() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    if (form.id) await categoryApi.update(form.id, { name: form.name, sort: form.sort });
    else await categoryApi.create({ name: form.name, parentId: form.parentId, sort: form.sort });
    ElMessage.success(form.id ? '分类已更新' : '分类已创建');
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function remove(row: CategoryRow) {
  await categoryApi.remove(row.id);
  ElMessage.success('分类已删除');
  load();
}

onMounted(load);
</script>
