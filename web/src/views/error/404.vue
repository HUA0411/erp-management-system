<template>
  <div class="error-page">
    <div class="wall" aria-hidden="true">
      <div v-for="(c, i) in crates" :key="i" class="crate" :class="c.cls">
        <i :style="{ height: c.h + '%' }"></i>
      </div>
    </div>

    <div class="inner">
      <ShelfArt variant="empty" :width="300" alt="一层空货架，上面有一张单据" />

      <div class="tag">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
        404 · 页面不存在
      </div>

      <h1>这一层是空的</h1>
      <p>
        地址可能写错了，或者这个页面已经被移走。<br />
        回看板重新找一下入口吧。
      </p>

      <div class="acts">
        <el-button type="primary" size="large" @click="$router.push('/')">回到数据看板</el-button>
        <el-button size="large" @click="$router.back()">返回上一页</el-button>
      </div>

      <div class="path">{{ $route.fullPath }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ShelfArt from '@/components/ShelfArt.vue';
import { buildCrates } from '@/utils/shelf';

const crates = buildCrates(11, 8, 77889911);
</script>

<style scoped lang="scss">
@use '@/styles/error-page';
</style>
