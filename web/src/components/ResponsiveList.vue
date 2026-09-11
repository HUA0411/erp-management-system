<template>
  <!-- 宽屏：直接用页面自己的表格 -->
  <slot v-if="!isMobile" />

  <!-- 窄屏：卡片列表 -->
  <div v-else class="rlist">
    <div v-if="loading" class="rlist__state">
      <el-icon class="is-loading" :size="22"><Loading /></el-icon>
      <span>加载中…</span>
    </div>

    <EmptyState
      v-else-if="!items.length"
      :variant="emptyVariant"
      :title="emptyText"
      :desc="emptyDesc"
      compact
    />

    <template v-else>
      <article v-for="(row, idx) in items" :key="idx" class="rcard">
        <header class="rcard__head">
          <h4 class="rcard__title">{{ titleOf(row) }}</h4>
          <el-tag v-if="badgeOf(row)" :type="badgeOf(row)!.type ?? 'info'" size="small" effect="light">
            {{ badgeOf(row)!.text }}
          </el-tag>
        </header>

        <dl class="rcard__body">
          <div v-for="f in bodyFields" :key="f.label" class="rcard__row">
            <dt>{{ f.label }}</dt>
            <dd :class="{ num: f.numeric }">{{ valueOf(row, f) || '—' }}</dd>
          </div>
        </dl>

        <footer v-if="$slots.actions" class="rcard__actions">
          <slot name="actions" :row="row" :index="idx" />
        </footer>
      </article>
    </template>
  </div>
</template>

<script setup lang="ts" generic="T extends object">
import { computed } from 'vue';
import { Loading } from '@element-plus/icons-vue';
import EmptyState from '@/components/EmptyState.vue';
import type { ShelfVariant } from '@/components/ShelfArt.vue';
import { useIsMobile } from '@/composables/use-breakpoint';

export interface ListField<T> {
  /** 左侧标签 */
  label: string;
  /** 直接取 row[prop] */
  prop?: keyof T & string;
  /** 需要格式化时用这个（优先于 prop） */
  format?: (row: T) => string;
  /**
   * 主字段：显示为卡片标题（大号字），不进 label/value 列表。
   * 一个列表通常指定 1~2 个，比如「商品名称」「客户名称」。
   */
  primary?: boolean;
  /** 状态徽标，显示在卡片右上角 */
  badge?: (row: T) => { text: string; type?: 'success' | 'info' | 'warning' | 'danger' } | undefined;
  /** 数字右对齐显示（金额、数量） */
  numeric?: boolean;
}

const props = withDefaults(
  defineProps<{
    items: T[];
    fields: ListField<T>[];
    loading?: boolean;
    emptyText?: string;
    emptyDesc?: string;
    emptyVariant?: ShelfVariant;
  }>(),
  { loading: false, emptyText: '还没有数据', emptyDesc: '', emptyVariant: 'first' },
);

const isMobile = useIsMobile();

const primaryFields = computed(() => props.fields.filter((f) => f.primary));
/** 带 badge 的字段已经在右上角以标签显示了，不再重复出现在下面的字段列表里 */
const bodyFields = computed(() => props.fields.filter((f) => !f.primary && !f.badge));

function valueOf(row: T, f: ListField<T>): string {
  if (f.format) return f.format(row);
  if (!f.prop) return '';
  const v = row[f.prop];
  return v === null || v === undefined ? '' : String(v);
}

function titleOf(row: T): string {
  const first = primaryFields.value[0];
  if (first) return valueOf(row, first) || '—';
  const fallback = bodyFields.value[0];
  return fallback ? valueOf(row, fallback) || '—' : '—';
}

/** 状态徽标：优先用标记了 badge 的字段，否则从 primary 之外的字段里找 */
function badgeOf(row: T) {
  const f = props.fields.find((x) => x.badge);
  return f?.badge?.(row);
}
</script>

<style scoped lang="scss">
.rlist {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rlist__state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 0;
  color: var(--text-3);
  font-size: var(--fs-sm);
}

.rcard {
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  box-shadow: var(--shadow-sm);
}

.rcard__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-soft);
}

.rcard__title {
  margin: 0;
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--text-1);
  line-height: 1.4;
  word-break: break-word;
}

.rcard__body {
  margin: 0;
  padding: 10px 0 0;
  display: grid;
  gap: 6px;
}

.rcard__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;

  dt {
    flex: none;
    color: var(--text-3);
    font-size: var(--fs-xs);
  }

  dd {
    margin: 0;
    text-align: right;
    color: var(--text-1);
    font-size: var(--fs-sm);
    word-break: break-word;
  }
}

.rcard__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  justify-content: flex-end;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-soft);
}
</style>
