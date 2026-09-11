<template>
  <div class="ai-cards">
    <div v-for="(card, idx) in cards" :key="idx" class="ai-card">
      <!-- 追问卡片：选项 + 自定义输入 -->
      <template v-if="card.type === 'clarification'">
        <div class="card-title">{{ card.question }}</div>
        <div class="option-list">
          <button
            v-for="(opt, i) in card.options"
            :key="i"
            type="button"
            class="option-btn"
            @click="$emit('clarify', opt)"
          >
            {{ opt }}
          </button>
        </div>
        <div class="custom-row">
          <el-input
            v-model="customText"
            size="small"
            placeholder="其他：填写你的真实想法"
            clearable
            @keyup.enter="submitCustom"
          />
          <el-button size="small" type="primary" plain @click="submitCustom">提交</el-button>
        </div>
      </template>

      <!-- 确认卡片：预览 + 确定/取消 -->
      <template v-else-if="card.type === 'confirmation'">
        <div class="card-title">{{ card.title }}</div>

        <!-- 库存调整：把「40 → 120」画成两根货位柱。
             一行文字要靠脑补，两根柱子一眼就能看出"这次调完回到安全线上了"——
             这正是用户点确认前唯一想知道的事。 -->
        <div v-if="stockChange(card.rows)" class="stock-change">
          <div class="slot">
            <div class="slot-well">
              <span class="slot-safe" :style="{ bottom: stockChange(card.rows)!.safeAt + '%' }"></span>
              <span
                class="slot-fill"
                :class="stockChange(card.rows)!.beforeLow ? 'is-low' : 'is-ok'"
                :style="{ height: stockChange(card.rows)!.beforeAt + '%' }"
              ></span>
            </div>
            <div class="slot-k">调整前</div>
            <div class="slot-v" :class="stockChange(card.rows)!.beforeLow ? 'is-low' : ''">
              {{ stockChange(card.rows)!.before }}
            </div>
          </div>

          <div class="slot-arrow">→</div>

          <div class="slot">
            <div class="slot-well">
              <span class="slot-safe" :style="{ bottom: stockChange(card.rows)!.safeAt + '%' }"></span>
              <span
                class="slot-fill"
                :class="stockChange(card.rows)!.afterLow ? 'is-low' : 'is-ok'"
                :style="{ height: stockChange(card.rows)!.afterAt + '%' }"
              ></span>
            </div>
            <div class="slot-k">调整后</div>
            <div class="slot-v" :class="stockChange(card.rows)!.afterLow ? 'is-low' : ''">
              {{ stockChange(card.rows)!.after }}
            </div>
          </div>

          <div class="slot-note">
            <span class="delta">{{ stockChange(card.rows)!.deltaText }}</span>
            <span class="delta-hint">
              虚线是安全库存 {{ stockChange(card.rows)!.safe }}<br />
              {{
                stockChange(card.rows)!.afterLow
                  ? '调整后仍低于安全线'
                  : stockChange(card.rows)!.beforeLow
                    ? '调整后回到安全线上'
                    : '调整后仍在安全线上'
              }}
            </span>
          </div>
        </div>

        <div class="preview">
          <div v-for="(row, i) in card.rows" :key="i" class="preview-row">
            <span class="row-label">{{ row.label }}</span>
            <span class="row-value num">{{ row.value }}</span>
          </div>
        </div>
        <div class="action-row">
          <!-- 防重复执行：请求期间 loading + 两个按钮都禁用。
               后端也有行锁兜底，但前端必须拦住，否则用户看到的是"点了两次"。 -->
          <el-button
            size="small"
            type="primary"
            :loading="busyId === card.pendingId"
            :disabled="busyId !== null"
            @click="confirm(card.pendingId)"
          >
            确定
          </el-button>
          <el-button size="small" :disabled="busyId !== null" @click="cancel(card.pendingId)">
            取消
          </el-button>
        </div>
      </template>

      <!-- 结果卡片：变更明细 -->
      <template v-else>
        <div class="card-title" :class="card.ok ? 'ok' : 'fail'">{{ card.title }}</div>
        <div class="preview">
          <div v-for="(row, i) in card.rows" :key="i" class="preview-row">
            <span class="row-label">{{ row.label }}</span>
            <span class="row-value num">{{ row.value }}</span>
          </div>
        </div>
        <el-button v-if="card.link" size="small" plain type="primary" @click="$router.push(card.link!.path)">
          {{ card.link.label }}
        </el-button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { AiCard } from '@erp/shared';

defineProps<{ cards: AiCard[] }>();

/**
 * 把库存调整的预览行解析成"货位对比"需要的数字。
 *
 * 判据是同时出现「当前库存」和「调整后库存」——后端 adjust_stock 的工具
 * 固定给这两行。别的写操作（下单/收付款）拿不到这些，自然不会画柱子。
 *
 * 顶格按 3 倍安全库存算，和看板的货架保持同一套刻度，
 * 否则同一个商品在两个页面上的柱高对不上，用户会以为哪里算错了。
 */
function stockChange(rows: { label: string; value: string }[]) {
  const pick = (label: string) => rows.find((r) => r.label === label)?.value;
  const beforeRaw = pick('当前库存');
  const afterRaw = pick('调整后库存');
  const safeRaw = pick('安全库存');
  if (beforeRaw === undefined || afterRaw === undefined) return null;

  const before = Number(beforeRaw);
  const after = Number(afterRaw);
  const safe = Number(safeRaw ?? 0);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;

  const cap = safe > 0 ? safe * 3 : Math.max(before, after, 1);
  const at = (v: number) => Math.max(0, Math.min(100, Math.round((v / cap) * 100)));
  const delta = after - before;

  return {
    before,
    after,
    safe,
    beforeAt: at(before),
    afterAt: at(after),
    safeAt: safe > 0 ? at(safe) : 0,
    beforeLow: safe > 0 && before < safe,
    afterLow: safe > 0 && after < safe,
    deltaText: `${delta > 0 ? '+' : ''}${delta}`,
  };
}

const emit = defineEmits<{
  confirm: [pendingId: number];
  cancel: [pendingId: number];
  clarify: [text: string];
}>();

const customText = ref('');

/**
 * 正在处理中的提案 ID。
 * 非空时所有确认/取消按钮一律禁用 —— 防止连点导致同一笔写操作执行两次。
 * 父组件处理完（成功或失败）必须调用 done() 复位。
 */
const busyId = ref<number | null>(null);

function confirm(pendingId: number) {
  if (busyId.value !== null) return;
  busyId.value = pendingId;
  emit('confirm', pendingId);
}

function cancel(pendingId: number) {
  if (busyId.value !== null) return;
  busyId.value = pendingId;
  emit('cancel', pendingId);
}

/** 由父组件在请求结束后调用，恢复按钮可点 */
function done() {
  busyId.value = null;
}
defineExpose({ done });

function submitCustom() {
  const text = customText.value.trim();
  if (!text) return;
  emit('clarify', text);
  customText.value = '';
}
</script>

<style scoped lang="scss">
.ai-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.ai-card {
  background: var(--surface-muted);
  border: 1px solid var(--border-soft);
  border-radius: var(--card-radius);
  padding: 10px 12px;

  .card-title {
    font-size: var(--fs-base);
    font-weight: 600;
    color: var(--text-1);
    margin-bottom: 8px;

    &.ok {
      color: var(--success-text);
    }

    &.fail {
      color: var(--danger-text);
    }
  }

  .preview {
    display: flex;
    flex-direction: column;
    gap: 4px;

    .preview-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: var(--fs-sm);

      .row-label {
        color: var(--text-3);
        flex-shrink: 0;
      }

      .row-value {
        color: var(--text-1);
        text-align: right;
        word-break: break-all;
      }
    }
  }

  .option-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;

    .option-btn {
      border: 1px solid var(--border-strong);
      background: var(--surface);
      color: var(--el-color-primary);
      border-radius: var(--radius-md);
      padding: 4px 12px;
      font-size: var(--fs-sm);
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: var(--el-color-primary-light-9);
        border-color: var(--el-color-primary);
      }
    }
  }

  .custom-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .action-row {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
}

/* ============ 库存调整的货位对比 ============
   复用看板货架的刻度：柱高 = 库存 / (安全库存 × 3)，虚线永远在 1/3 处。 */
.stock-change {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  margin: 12px 0 14px;
  padding: 14px 0 0;
  border-top: 1px dashed var(--border);
}

.slot {
  text-align: center;
  flex: none;
}

.slot-well {
  position: relative;
  width: 52px;
  height: 78px;
  margin: 0 auto;
  border-bottom: 2px solid var(--border);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.slot-safe {
  position: absolute;
  left: -6px;
  right: -6px;
  border-top: 1.5px dashed var(--border-strong);
}

.slot-fill {
  width: 40px;
  border-radius: 5px 5px 0 0;
  transition: height 0.4s ease;

  &.is-ok {
    background: linear-gradient(180deg, #46bc90, #2c7059);
  }

  &.is-low {
    background: linear-gradient(180deg, #e28069, #a24734);
  }
}

.slot-k {
  margin-top: 9px;
  font-size: var(--fs-2xs);
  color: var(--text-3);
}

.slot-v {
  margin-top: 3px;
  font-size: var(--fs-base);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--success-text);

  &.is-low {
    color: var(--danger-text);
  }
}

.slot-arrow {
  padding-bottom: 30px;
  font-size: var(--fs-lg);
  color: var(--accent-strong);
}

.slot-note {
  flex: 1;
  min-width: 0;
  padding-bottom: 4px;
}

.delta {
  display: inline-block;
  padding: 3px 8px;
  border-radius: var(--radius-md);
  background: var(--success-tint);
  color: var(--success-text);
  font-size: var(--fs-2xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.delta-hint {
  display: block;
  margin-top: 8px;
  font-size: var(--fs-2xs);
  line-height: 1.7;
  color: var(--text-3);
}
</style>
