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
  font-size: 88px;
  font-weight: 800;
  color: #c6d0de;
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
