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
</style>
