<template>
  <div class="error-page">
    <div class="code">403</div>
    <div class="msg">抱歉，您没有权限访问该页面</div>
    <div class="hint">如需开通权限，请联系系统管理员</div>
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
  color: var(--el-color-primary);
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
