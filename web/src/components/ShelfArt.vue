<template>
  <!--
    货架插画。整套系统共用一套"箱体语言"：
    平涂、圆角、无描边，只有三色（绿=周转快 / 琥珀=慢 / 砖红=呆滞）+ 空位虚线。

    为什么做成组件而不是各页各画一张：空状态、错误页散落在十几个页面里，
    各画各的必然走形，最后又变成"每个页面风格都不一样"的模板感。
  -->
  <svg class="shelf-art" :width="width" :viewBox="VIEW[variant].box" fill="none" role="img" :aria-label="alt">
    <!-- eslint-disable-next-line vue/no-v-html -- 内联 SVG 字面量，不含用户输入 -->
    <g v-html="VIEW[variant].body" />
  </svg>
</template>

<script setup lang="ts">
export type ShelfVariant =
  | 'locked' // 权限不足：一格挂着锁
  | 'empty' // 页面不存在：一层空了，只剩一张单据在飘
  | 'first' // 首次使用：货架空着，一个还没拆的箱子放在地上
  | 'no-doc' // 还没有单据：空单据夹
  | 'no-result' // 筛选无结果：放大镜照在空货位上
  | 'broken' // 加载失败：箱子倒了
  | 'all-good'; // 正面空状态：满货架 + 对勾

withDefaults(defineProps<{ variant: ShelfVariant; width?: number; alt?: string }>(), {
  width: 230,
  alt: '',
});

/* 箱体三色。放在这里而不是各处硬编码，改配色只改这一处 */
const FILL = {
  fast: '#2C7059',
  fastTop: '#46BC90',
  slow: '#BE8D31',
  slowTop: '#EFC46C',
  dead: '#A24734',
  deadTop: '#E28069',
  board: 'rgba(255,255,255,.15)',
  slot: 'rgba(255,255,255,.035)',
  dash: 'rgba(233,181,126,.55)',
  copper: '#C97B4A',
};

const crate = (x: number, y: number, w: number, h: number, base: string, top: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${base}"/>` +
  `<rect x="${x}" y="${y}" width="${w}" height="${Math.min(6, h / 3)}" rx="3" fill="${top}"/>`;

const BOARD = (y: number) => `<rect x="24" y="${y}" width="182" height="5" rx="2.5" fill="${FILL.board}"/>`;

const VIEW: Record<ShelfVariant, { box: string; body: string }> = {
  locked: {
    box: '0 0 230 150',
    body:
      BOARD(46) +
      BOARD(96) +
      BOARD(140) +
      crate(36, 24, 34, 22, FILL.fast, FILL.fastTop) +
      crate(78, 30, 34, 16, FILL.slow, FILL.slowTop) +
      crate(162, 26, 34, 20, FILL.dead, FILL.deadTop) +
      crate(36, 76, 34, 20, FILL.fast, FILL.fastTop) +
      crate(78, 80, 34, 16, FILL.fast, FILL.fastTop) +
      crate(120, 86, 36, 10, FILL.slow, FILL.slowTop) +
      crate(162, 88, 34, 8, FILL.slow, FILL.slowTop) +
      `<rect x="120" y="22" width="36" height="24" rx="5" fill="none" stroke="${FILL.dash}" stroke-width="1.6" stroke-dasharray="5 4"/>` +
      `<path d="M131 36v-5a7 7 0 0 1 14 0v5" stroke="#E9B57E" stroke-width="2.4" stroke-linecap="round"/>` +
      `<rect x="127.5" y="35" width="21" height="15" rx="4" fill="${FILL.copper}"/>` +
      `<circle cx="138" cy="42" r="2.2" fill="#3A2109"/>`,
  },

  empty: {
    box: '0 0 230 150',
    body:
      BOARD(52) +
      BOARD(104) +
      BOARD(144) +
      crate(36, 30, 34, 22, FILL.fast, FILL.fastTop) +
      crate(78, 34, 34, 18, FILL.slow, FILL.slowTop) +
      crate(120, 32, 36, 20, FILL.fast, FILL.fastTop) +
      crate(164, 36, 32, 16, FILL.dead, FILL.deadTop) +
      `<rect x="36" y="62" width="160" height="42" rx="6" fill="${FILL.slot}"/>` +
      `<rect x="36" y="114" width="160" height="26" rx="6" fill="${FILL.slot}"/>` +
      `<g transform="rotate(-11 116 84)">` +
      `<rect x="96" y="70" width="40" height="28" rx="4" fill="#F4F1E8"/>` +
      `<rect x="102" y="77" width="22" height="2.4" rx="1.2" fill="#B9C6BD"/>` +
      `<rect x="102" y="83" width="16" height="2.4" rx="1.2" fill="#CBD5CE"/>` +
      `<rect x="102" y="89" width="19" height="2.4" rx="1.2" fill="#CBD5CE"/>` +
      `</g>` +
      `<path d="M150 40c10 12 6 26-6 34" stroke="rgba(255,255,255,.18)" stroke-width="1.4" stroke-dasharray="4 5" fill="none" stroke-linecap="round"/>`,
  },

  first: {
    box: '0 0 150 100',
    body:
      `<rect x="14" y="30" width="122" height="3.5" rx="1.75" fill="#DCDAD0"/>` +
      `<rect x="14" y="62" width="122" height="3.5" rx="1.75" fill="#DCDAD0"/>` +
      `<rect x="14" y="94" width="122" height="3.5" rx="1.75" fill="#DCDAD0"/>` +
      `<path d="M58 94V72l17-9.5L92 72v22z" fill="#C7CEC9"/>` +
      `<path d="M58 72l17-9.5L92 72 75 81z" fill="#E1E5E2"/>` +
      `<rect x="70" y="72" width="10" height="4" rx="2" fill="#9FB0A8"/>` +
      `<rect x="30" y="38" width="30" height="24" rx="4" fill="none" stroke="#D8D6CC" stroke-width="1.6" stroke-dasharray="4 4"/>` +
      `<rect x="90" y="38" width="30" height="24" rx="4" fill="none" stroke="#D8D6CC" stroke-width="1.6" stroke-dasharray="4 4"/>`,
  },

  'no-doc': {
    box: '0 0 150 100',
    body:
      `<rect x="34" y="26" width="82" height="62" rx="7" fill="#E9E7DF"/>` +
      `<rect x="34" y="26" width="82" height="14" rx="7" fill="#D8D5CA"/>` +
      `<rect x="46" y="16" width="58" height="20" rx="6" fill="#F6F4EE" stroke="#DCDAD0" stroke-width="1.4"/>` +
      `<rect x="56" y="24" width="38" height="3" rx="1.5" fill="#C9C6BA"/>` +
      `<rect x="46" y="52" width="58" height="3" rx="1.5" fill="#DEDCD3"/>` +
      `<rect x="46" y="62" width="44" height="3" rx="1.5" fill="#DEDCD3"/>` +
      `<rect x="46" y="72" width="50" height="3" rx="1.5" fill="#DEDCD3"/>`,
  },

  'no-result': {
    box: '0 0 150 100',
    body:
      `<rect x="12" y="34" width="126" height="3.5" rx="1.75" fill="#E2E0D7"/>` +
      `<rect x="12" y="66" width="126" height="3.5" rx="1.75" fill="#E2E0D7"/>` +
      `<rect x="22" y="42" width="26" height="22" rx="4" fill="none" stroke="#DCDAD0" stroke-width="1.6" stroke-dasharray="4 4"/>` +
      `<rect x="56" y="42" width="26" height="22" rx="4" fill="none" stroke="#DCDAD0" stroke-width="1.6" stroke-dasharray="4 4"/>` +
      `<circle cx="104" cy="50" r="19" fill="rgba(201,123,74,.10)" stroke="${FILL.copper}" stroke-width="3"/>` +
      `<path d="M118 64l12 12" stroke="${FILL.copper}" stroke-width="4.5" stroke-linecap="round"/>`,
  },

  broken: {
    box: '0 0 150 100',
    body:
      `<rect x="12" y="72" width="126" height="3.5" rx="1.75" fill="#E2E0D7"/>` +
      `<g transform="rotate(-18 46 60)">` +
      crate(26, 48, 40, 26, FILL.dead, FILL.deadTop) +
      `</g>` +
      `<g transform="rotate(12 108 56)">` +
      crate(88, 44, 40, 26, FILL.slow, FILL.slowTop) +
      `</g>` +
      `<path d="M62 40c6-8 20-8 26 0" stroke="#C9C6BA" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="5 5" fill="none"/>` +
      `<circle cx="75" cy="24" r="11" fill="#F7E9DE"/>` +
      `<path d="M75 18v7" stroke="${FILL.copper}" stroke-width="2.6" stroke-linecap="round"/>` +
      `<circle cx="75" cy="29.5" r="1.6" fill="${FILL.copper}"/>`,
  },

  'all-good': {
    box: '0 0 150 100',
    body:
      `<rect x="12" y="38" width="126" height="3.5" rx="1.75" fill="#E2E0D7"/>` +
      `<rect x="12" y="70" width="126" height="3.5" rx="1.75" fill="#E2E0D7"/>` +
      crate(20, 18, 28, 20, FILL.fast, FILL.fastTop) +
      crate(54, 22, 28, 16, FILL.fast, FILL.fastTop) +
      crate(88, 20, 28, 18, FILL.slow, FILL.slowTop) +
      crate(20, 50, 28, 20, FILL.fast, FILL.fastTop) +
      crate(54, 54, 28, 16, FILL.slow, FILL.slowTop) +
      `<circle cx="120" cy="30" r="15" fill="#E4F3EC"/>` +
      `<path d="M113 30.5l5 5 9-10" stroke="#2E8B6B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
};
</script>

<style scoped>
.shelf-art {
  display: block;
  height: auto;
}
</style>
