<template>
  <!--
    ElConfigProvider 必须包住整个应用。
    改用按需引入后 main.ts 不再 app.use(ElementPlus, { locale: zhCn })，
    语言包只能从这里注入，否则分页器、日期选择器、表格空状态会显示英文。
  -->
  <el-config-provider :locale="zhCn">
    <router-view />
  </el-config-provider>
</template>

<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn';
</script>
