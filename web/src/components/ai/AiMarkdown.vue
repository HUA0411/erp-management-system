<template>
  <div class="ai-markdown" v-html="html"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const props = defineProps<{ content: string }>();

marked.setOptions({
  breaks: true, // 单换行渲染为 <br>
  gfm: true,
});

/** Markdown → HTML（DOMPurify 过滤，防止注入） */
const html = computed(() => {
  if (!props.content) return '';
  const raw = marked.parse(props.content) as string;
  return DOMPurify.sanitize(raw);
});
</script>

<style scoped lang="scss">
.ai-markdown {
  font-size: var(--fs-base);
  line-height: 1.7;
  color: var(--text-1);
  word-break: break-word;

  :deep(p) {
    margin: 0 0 6px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4) {
    font-size: var(--fs-md);
    font-weight: 600;
    margin: 8px 0 4px;
  }

  :deep(ul),
  :deep(ol) {
    padding-left: 18px;
    margin: 4px 0;
  }

  :deep(li) {
    margin: 2px 0;
  }

  :deep(code) {
    background: var(--surface-sunken);
    border-radius: var(--radius-sm);
    padding: 1px 5px;
    font-size: var(--fs-xs);
    font-family: Consolas, Monaco, 'Courier New', monospace;
  }

  :deep(pre) {
    background: var(--sidebar-bg);
    color: var(--border);
    border-radius: var(--radius-lg);
    padding: 10px 12px;
    overflow-x: auto;
    margin: 6px 0;

    code {
      background: transparent;
      padding: 0;
      color: inherit;
    }
  }

  /* Markdown 表格：AI 经常返回 4~6 列的清单（商品/编码/库存/安全库存/缺口），
     而抽屉只有 440px 宽。原来 table 是 width:100% + border-collapse，
     列会被挤到"无线机械键盘"折成两行、编码 P003 折成 P00/3 这种程度。
     改成：表格自身横向可滚动，"以内容为准"的最小宽度，单元格内不折行。 */
  :deep(table) {
    border-collapse: collapse;
    margin: 6px 0;
    display: block; /* 让 table 自身成为滚动容器 */
    width: max-content;
    max-width: 100%;
    overflow-x: auto;
    overscroll-behavior-x: contain;
  }

  :deep(thead) {
    display: table;
    width: 100%;
  }

  :deep(tbody) {
    display: table;
    width: 100%;
  }

  :deep(th),
  :deep(td) {
    border: 1px solid var(--border);
    padding: 4px 8px;
    font-size: var(--fs-sm);
    text-align: left;
    white-space: nowrap; /* 关键：单元格内容不折行 */
  }

  :deep(th) {
    background: var(--surface-muted);
    font-weight: 600;
  }

  :deep(blockquote) {
    border-left: 3px solid var(--border-strong);
    margin: 6px 0;
    padding: 2px 10px;
    color: var(--text-3);
  }

  :deep(a) {
    color: var(--el-color-primary);
  }

  :deep(hr) {
    border: none;
    border-top: 1px solid var(--border-soft);
    margin: 8px 0;
  }
}
</style>
