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
          <el-button size="small" type="primary" @click="$emit('confirm', card.pendingId)">
            确定
          </el-button>
          <el-button size="small" @click="$emit('cancel', card.pendingId)">取消</el-button>
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
        <el-button
          v-if="card.link"
          size="small"
          plain
          type="primary"
          @click="$router.push(card.link!.path)"
        >
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
  background: #f7f9fc;
  border: 1px solid #e3e9f2;
  border-radius: 8px;
  padding: 10px 12px;

  .card-title {
    font-size: 13px;
    font-weight: 600;
    color: #2b3445;
    margin-bottom: 8px;

    &.ok {
      color: #2f9e6e;
    }

    &.fail {
      color: #d9534f;
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
      font-size: 12.5px;

      .row-label {
        color: #7a8699;
        flex-shrink: 0;
      }

      .row-value {
        color: #2b3445;
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
      border: 1px solid #c9d7ea;
      background: #fff;
      color: #2456a6;
      border-radius: 6px;
      padding: 4px 12px;
      font-size: 12.5px;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: #e9eff8;
        border-color: #2456a6;
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
