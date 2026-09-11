<template>
  <!--
    统一空状态。

    为什么值得单独做个组件：新系统里"没有数据"是出现频率最高的屏幕
    （刚建好、筛选无结果、权限不足、加载失败……）。Element Plus 默认甩一句
    "暂无数据"，等于告诉用户"这里什么都没有，请自便"。

    这里给每个场景配插画 + 一句人话 + 一个明确的下一步。
  -->
  <div class="empty-state" :class="{ 'is-compact': compact }">
    <ShelfArt :variant="variant" :width="compact ? 132 : 168" :alt="title" />
    <div class="empty-state__title">{{ title }}</div>
    <p v-if="desc" class="empty-state__desc">{{ desc }}</p>
    <div v-if="$slots.action" class="empty-state__action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ShelfArt, { type ShelfVariant } from '@/components/ShelfArt.vue';

withDefaults(
  defineProps<{
    variant?: ShelfVariant;
    title: string;
    desc?: string;
    /** 表格内、卡片内的空状态要更紧凑，否则一屏放不下 */
    compact?: boolean;
  }>(),
  { variant: 'first', desc: '', compact: false },
);
</script>

<style scoped lang="scss">
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 34px 20px;

  &__title {
    margin-top: 16px;
    font-size: var(--fs-base);
    font-weight: 600;
    color: var(--text-1);
  }

  &__desc {
    margin: 8px 0 0;
    font-size: var(--fs-xs);
    line-height: 1.85;
    color: var(--text-3);
    max-width: 260px;
  }

  &__action {
    margin-top: 16px;
  }

  &.is-compact {
    padding: 18px 16px;

    .empty-state__title {
      margin-top: 10px;
    }
  }
}
</style>
