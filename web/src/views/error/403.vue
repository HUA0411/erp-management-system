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
  font-size: 88px;
  font-weight: 800;
  color: var(--el-color-primary);
  line-height: 1;
}

.msg {
  font-size: 18px;
  color: #2b3445;
}

.hint {
  font-size: 13px;
  color: #8a97ab;
  margin-bottom: 18px;
}
</style>
