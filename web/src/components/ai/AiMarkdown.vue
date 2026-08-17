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
  font-size: 13px;
  line-height: 1.7;
  color: #2b3445;
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
    font-size: 14px;
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
    background: #eef1f6;
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 12px;
    font-family: Consolas, Monaco, 'Courier New', monospace;
  }

  :deep(pre) {
    background: #14263f;
    color: #d6e2f2;
    border-radius: 8px;
    padding: 10px 12px;
    overflow-x: auto;
    margin: 6px 0;

    code {
      background: transparent;
      padding: 0;
      color: inherit;
    }
  }

  :deep(table) {
    border-collapse: collapse;
    margin: 6px 0;
    width: 100%;
  }

  :deep(th),
  :deep(td) {
    border: 1px solid #dbe3ee;
    padding: 4px 8px;
    font-size: 12.5px;
    text-align: left;
  }

  :deep(th) {
    background: #f2f6fb;
  }

  :deep(blockquote) {
    border-left: 3px solid #c9d7ea;
    margin: 6px 0;
    padding: 2px 10px;
    color: #7a8699;
  }

  :deep(a) {
    color: var(--el-color-primary);
  }

  :deep(hr) {
    border: none;
    border-top: 1px solid #e3e9f2;
    margin: 8px 0;
  }
}
</style>
