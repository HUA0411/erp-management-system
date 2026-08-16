<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <span class="tip">菜单与按钮权限为系统全局模板，公司间共用；编辑仅影响显示名称、图标与排序。</span>
      </div>
      <el-table
        :data="tree"
        row-key="id"
        :tree-props="{ children: 'children' }"
        default-expand-all
        v-loading="loading"
      >
        <el-table-column label="名称" min-width="200">
          <template #default="{ row }">
            <el-input v-if="editingId === row.id" v-model="editForm.name" size="small" style="width: 160px" />
            <span v-else>{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="code" label="权限码" min-width="200" />
        <el-table-column label="类型" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.type === 'menu' ? 'primary' : 'info'" size="small" effect="plain">{{ row.type === 'menu' ? '菜单' : '按钮' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="path" label="路由" min-width="140">
          <template #default="{ row }">{{ row.path || '-' }}</template>
        </el-table-column>
        <el-table-column label="图标" width="90" align="center">
          <template #default="{ row }">
            <el-icon v-if="row.icon"><component :is="row.icon" /></el-icon>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="sort" label="排序" width="70" align="center" />
        <el-table-column label="操作" width="130" align="center">
          <template #default="{ row }">
            <template v-if="editingId === row.id">
              <el-button link type="primary" size="small" @click="saveEdit">保存</el-button>
              <el-button link size="small" @click="editingId = null">取消</el-button>
            </template>
            <el-button v-else v-permission="'system:permission:update'" link type="primary" size="small" @click="startEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { permissionApi } from '@/api';
import type { PermissionNode } from '@erp/shared';

const loading = ref(false);
const tree = ref<PermissionNode[]>([]);
const editingId = ref<number | null>(null);
const editForm = reactive({ name: '', icon: '', sort: 0, path: '' });

async function load() {
  loading.value = true;
  try {
    tree.value = await permissionApi.all();
  } finally {
    loading.value = false;
  }
}

function startEdit(row: PermissionNode) {
  editingId.value = row.id;
  Object.assign(editForm, { name: row.name, icon: row.icon || '', sort: row.sort, path: row.path || '' });
}

async function saveEdit() {
  await permissionApi.update(editingId.value!, { name: editForm.name, icon: editForm.icon || undefined, sort: editForm.sort, path: editForm.path || undefined });
  ElMessage.success('已保存');
  editingId.value = null;
  load();
}

onMounted(load);
</script>

<style scoped>
.tip {
  font-size: 12.5px;
  color: #8a97ab;
}
</style>
