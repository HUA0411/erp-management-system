<template>
  <!--
    货架：把库存画出来。

    这是整套视觉的母题，也是这个组件存在的理由 —— 库存不再只是表格里的一个数字，
    而是一条能同时看出"还剩多少"和"周转快慢"的货位：

      柱高   = 现有库存 / (安全库存 × 3)，顶格是 3 倍安全库存
      虚线   = 安全库存的位置（永远是 1/3 处）
      颜色   = 绿=周转快 / 琥珀=慢 / 砖红=低于安全线

    为什么以 3 倍安全库存为顶：如果按"现有库存 / 最大值"归一，
    一个爆仓商品会把同排其他货位压成一条线，整排读数全废。
  -->
  <div class="rack-grid">
    <div v-for="item in items" :key="item.productId" class="rack">
      <div class="rack__unit">
        <span class="rack__safe" aria-hidden="true"></span>
        <span
          class="rack__fill"
          :class="turnoverClass(item.quantity, item.safetyStock)"
          :style="{ height: stockLevelPercent(item.quantity, item.safetyStock) + '%' }"
        ></span>
      </div>
      <div class="rack__name" :title="item.productName">{{ item.productName }}</div>
      <div class="rack__meta">
        <span class="rack__qty">{{ fmtQty(item.quantity) }}</span>
        <span class="rack__tag">{{ verifyLabel(item) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { InventoryItem } from '@erp/shared';
import { fmtQty } from '@/utils';
import { stockLevelPercent, turnoverClass } from '@/utils/shelf';

defineProps<{ items: InventoryItem[] }>();

/** 和数据层同一套判断，不再另写一份阈值 */
function verifyLabel(item: InventoryItem): string {
  if (item.quantity <= 0) return '缺货';
  if (item.safetyStock > 0 && item.quantity < item.safetyStock) return '低于安全线';
  return '充足';
}
</script>

<style scoped lang="scss">
/* 用固定列数而不是 auto-fill：看板固定取 12 个商品，
   6 / 4 / 3 / 2 列都能整除，不会出现"最后一行孤零零两个"的大片空白。 */
.rack-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px 12px;
}

@media (max-width: 1280px) {
  .rack-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .rack-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.rack__unit {
  position: relative;
  height: 104px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  border-bottom: 2px solid var(--border);
}

/* 安全库存刻度：因为顶格固定是 3 倍安全库存，这条线永远在 1/3 处 */
.rack__safe {
  position: absolute;
  left: -5px;
  right: -5px;
  bottom: 33.33%;
  border-top: 1.5px dashed var(--border-strong);
}

.rack__fill {
  width: 48px;
  border-radius: 5px 5px 0 0;
  box-shadow: inset 0 0 0 1px rgba(24, 36, 32, 0.06);
  transition: height 0.4s ease;

  &.c-fast {
    background: linear-gradient(180deg, #46bc90, #2c7059);
  }
  &.c-slow {
    background: linear-gradient(180deg, #efc46c, #be8d31);
  }
  &.c-dead {
    background: linear-gradient(180deg, #e28069, #a24734);
  }
  &.c-empty {
    background: repeating-linear-gradient(
      45deg,
      var(--surface-sunken),
      var(--surface-sunken) 5px,
      var(--border-soft) 5px,
      var(--border-soft) 10px
    );
  }
}

.rack__name {
  margin-top: 9px;
  font-size: var(--fs-2xs);
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rack__meta {
  margin-top: 3px;
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: var(--fs-2xs);
  color: var(--text-3);
}

.rack__qty {
  font-variant-numeric: tabular-nums;
  color: var(--text-1);
  font-weight: 600;
}

.rack__tag {
  white-space: nowrap;
}

@media (max-width: 640px) {
  .rack-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 10px;
  }

  .rack__unit {
    height: 84px;
  }

  .rack__fill {
    width: 34px;
  }
}
</style>
