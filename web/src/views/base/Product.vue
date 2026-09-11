<template>
  <div class="page">
    <div class="page-card">
      <div class="toolbar">
        <el-input
          v-model="query.keyword"
          placeholder="名称 / 编码 / 规格"
          clearable
          style="width: 220px"
          @keyup.enter="load"
          @clear="load"
        />
        <el-tree-select
          v-model="query.categoryId"
          :data="categories"
          :props="{ label: 'name', children: 'children' }"
          check-strictly
          clearable
          placeholder="全部分类"
          style="width: 180px"
          @change="load"
        />
        <el-select
          v-model="query.status"
          placeholder="全部状态"
          clearable
          style="width: 120px"
          @change="load"
        >
          <el-option label="启用" :value="1" />
          <el-option label="停用" :value="0" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="load">查询</el-button>
        <div class="spacer"></div>
        <el-button v-permission="'product:create'" type="primary" :icon="Plus" @click="openCreate"
          >新增商品</el-button
        >
      </div>

      <ResponsiveList
        :items="list"
        :fields="cardFields"
        :loading="loading"
        empty-text="暂无商品，点右上角「新增商品」添加"
      >
        <el-table v-loading="loading" :data="list">
          <el-table-column prop="code" label="编码" width="110" />
          <el-table-column prop="name" label="商品名称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="categoryName" label="分类" width="110" />
          <el-table-column prop="spec" label="规格" width="120" show-overflow-tooltip />
          <el-table-column prop="unit" label="单位" width="70" align="center" />
          <el-table-column label="采购价" width="100" align="right">
            <template #default="{ row }"
              ><span class="num">¥{{ fmtMoney(row.purchasePrice) }}</span></template
            >
          </el-table-column>
          <el-table-column label="销售价" width="100" align="right">
            <template #default="{ row }"
              ><span class="num">¥{{ fmtMoney(row.salePrice) }}</span></template
            >
          </el-table-column>
          <el-table-column prop="safetyStock" label="安全库存" width="90" align="right" />
          <el-table-column label="默认供应商" width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.supplierName || '—' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{
                row.status === 1 ? '启用' : '停用'
              }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="130" align="center" fixed="right">
            <template #default="{ row }">
              <el-button
                v-permission="'product:update'"
                link
                type="primary"
                size="small"
                @click="openEdit(row)"
                >编辑</el-button
              >
              <el-popconfirm title="停用该商品？（有库存不可删除）" @confirm="remove(row)">
                <template #reference>
                  <el-button v-permission="'product:delete'" link type="danger" size="small">删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>

        <!-- 窄屏卡片里的操作按钮：与表格里的是同一套逻辑，只是换了排版 -->
        <template #actions="{ row }">
          <el-button v-permission="'product:update'" link type="primary" size="small" @click="openEdit(row)"
            >编辑</el-button
          >
          <el-popconfirm title="停用该商品？（有库存不可删除）" @confirm="remove(row)">
            <template #reference>
              <el-button v-permission="'product:delete'" link type="danger" size="small">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </ResponsiveList>

      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        class="pager"
        background
        layout="total, sizes, prev, pager, next"
        :total="total"
        :page-sizes="[10, 20, 50]"
        @change="load"
      />
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑商品' : '新增商品'"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="商品编码" prop="code"
              ><el-input v-model="form.code" :disabled="!!form.id" placeholder="如 P013"
            /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="商品名称" prop="name"
              ><el-input v-model="form.name" placeholder="商品名称"
            /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="分类">
              <el-tree-select
                v-model="form.categoryId"
                :data="categories"
                :props="{ label: 'name', children: 'children' }"
                check-strictly
                clearable
                placeholder="选择分类"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="规格"><el-input v-model="form.spec" placeholder="规格型号" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="单位"
              ><el-input v-model="form.unit" placeholder="如 台/个/箱"
            /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="安全库存"
              ><el-input-number v-model="form.safetyStock" :min="0" :precision="2" style="width: 100%"
            /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="采购价" prop="purchasePrice">
              <el-input-number v-model="form.purchasePrice" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="销售价" prop="salePrice">
              <el-input-number v-model="form.salePrice" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注"
          ><el-input v-model="form.remark" type="textarea" :rows="2" maxlength="255"
        /></el-form-item>
        <el-form-item label="默认供应商">
          <el-select
            v-model="form.supplierId"
            clearable
            placeholder="选择默认供应商（可更换或解除）"
            style="width: 100%"
          >
            <el-option v-for="s in suppliers" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
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
import { Plus, Search } from '@element-plus/icons-vue';
import { categoryApi, productApi, supplierApi } from '@/api';
import { fmtMoney } from '@/utils';
import ResponsiveList, { type ListField } from '@/components/ResponsiveList.vue';
import type { ProductItem, SupplierItem } from '@erp/shared';

/**
 * 窄屏卡片的字段定义。
 * 桌面端表格列多（11 列），手机上塞不下 —— 这里只保留「一眼要看的」，
 * 其余靠点「编辑」进详情。
 */
const cardFields: ListField<ProductItem>[] = [
  { label: '商品名称', prop: 'name', primary: true },
  {
    label: '状态',
    badge: (r) => ({ text: r.status === 1 ? '启用' : '停用', type: r.status === 1 ? 'success' : 'info' }),
  },
  { label: '编码', prop: 'code' },
  { label: '分类', prop: 'categoryName' },
  { label: '规格', prop: 'spec' },
  { label: '采购价', format: (r) => `¥${fmtMoney(r.purchasePrice)}`, numeric: true },
  { label: '销售价', format: (r) => `¥${fmtMoney(r.salePrice)}`, numeric: true },
  { label: '安全库存', prop: 'safetyStock', numeric: true },
  { label: '默认供应商', format: (r) => r.supplierName || '—' },
];

const loading = ref(false);
const list = ref<ProductItem[]>([]);
const total = ref(0);
const categories = ref<any[]>([]);
const suppliers = ref<SupplierItem[]>([]);
const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  categoryId: undefined as number | undefined,
  status: undefined as number | undefined,
});

const dialogVisible = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<Record<string, any>>({});
const rules: FormRules = {
  code: [{ required: true, message: '请输入商品编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入商品名称', trigger: 'blur' }],
  purchasePrice: [{ required: true, message: '请输入采购价', trigger: 'blur' }],
  salePrice: [{ required: true, message: '请输入销售价', trigger: 'blur' }],
};

async function load() {
  loading.value = true;
  try {
    const res = await productApi.list({
      ...query,
      keyword: query.keyword || undefined,
      categoryId: query.categoryId,
      status: query.status,
    });
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function loadCategories() {
  categories.value = (await categoryApi.tree()) as any[];
}

async function loadSuppliers() {
  suppliers.value = await supplierApi.options();
}

function openCreate() {
  Object.assign(form, {
    id: undefined,
    code: '',
    name: '',
    categoryId: undefined,
    spec: '',
    unit: '',
    purchasePrice: 0,
    salePrice: 0,
    safetyStock: 0,
    supplierId: undefined,
    remark: '',
  });
  dialogVisible.value = true;
}

function openEdit(row: ProductItem) {
  Object.assign(form, {
    ...row,
    categoryId: row.categoryId || undefined,
    supplierId: row.supplierId || undefined,
  });
  dialogVisible.value = true;
}

async function save() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    const payload = {
      name: form.name,
      categoryId: form.categoryId || 0,
      spec: form.spec,
      unit: form.unit,
      purchasePrice: form.purchasePrice,
      salePrice: form.salePrice,
      safetyStock: form.safetyStock,
      supplierId: form.supplierId ?? 0,
      remark: form.remark,
    };
    if (form.id) await productApi.update(form.id, payload);
    else await productApi.create({ ...payload, code: form.code });
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function remove(row: ProductItem) {
  await productApi.remove(row.id);
  ElMessage.success('商品已停用');
  load();
}

onMounted(() => {
  loadCategories();
  loadSuppliers();
  load();
});
</script>

<style scoped>
.pager {
  margin-top: 14px;
  justify-content: flex-end;
}
</style>
