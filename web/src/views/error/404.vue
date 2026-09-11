<template>
  <div class="error-page">
    <div class="code">404</div>
    <div class="msg">页面不存在或已被移除</div>
    <div class="hint">请检查访问地址是否正确</div>
    <el-button type="primary" @click="$router.push('/')">返回首页</el-button>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.error-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--page-bg);
}

.code {
  font-size: var(--fs-display);
  font-weight: 800;
  color: var(--border-strong);
  line-height: 1;
}

.msg {
  font-size: var(--fs-lg);
  color: var(--text-1);
}

.hint {
  font-size: var(--fs-base);
  color: var(--text-3);
  margin-bottom: 18px;
}
</style>
