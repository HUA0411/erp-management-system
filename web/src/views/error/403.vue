<template>
  <div class="error-page">
    <!-- 背景货架墙：和登录页同一套语言，让错误页也属于这个世界 -->
    <div class="wall" aria-hidden="true">
      <div v-for="(c, i) in crates" :key="i" class="crate" :class="c.cls">
        <i :style="{ height: c.h + '%' }"></i>
      </div>
    </div>

    <div class="inner">
      <ShelfArt variant="locked" :width="300" alt="货架上有一格挂着锁" />

      <div class="tag">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
          <rect x="4" y="10" width="16" height="11" rx="3" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
        403 · 无权限
      </div>

      <h1>这个货位，你没钥匙</h1>
      <p>
        当前账号没有查看这个页面的权限。<br />
        如果确实需要，找贵司管理员在「系统管理 → 角色管理」里给这个角色勾上对应的权限码。
      </p>

      <div class="acts">
        <el-button type="primary" size="large" @click="$router.push('/')">回到数据看板</el-button>
        <el-button size="large" @click="$router.push('/login')">切换账号</el-button>
      </div>

      <div class="path">{{ $route.fullPath }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ShelfArt from '@/components/ShelfArt.vue';
import { buildCrates } from '@/utils/shelf';

// 固定种子：每次进错误页都是同一面墙，截图和录屏才对得上
const crates = buildCrates(11, 8, 20260911);
</script>

<style scoped lang="scss">
@use '@/styles/error-page';
</style>
