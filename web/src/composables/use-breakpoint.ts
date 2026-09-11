import { onMounted, onUnmounted, ref, type Ref } from 'vue';

/**
 * 响应式断点侦测（matchMedia）。
 *
 * 为什么不用 CSS 媒体查询：窄屏要换的不是样式，而是**结构** ——
 * 表格要换成卡片列表。CSS 能隐藏列，但补不回每列的表头标签，
 * 用户看到一排没有标题的值，等于信息丢失。
 *
 * 用 matchMedia 而不是监听 resize：后者每次拖动窗口都触发，
 * 而 matchMedia 只在跨过断点的那一刻触发一次。
 */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false);
  let mql: MediaQueryList | null = null;
  const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
    matches.value = e.matches;
  };

  onMounted(() => {
    mql = window.matchMedia(query);
    onChange(mql);
    mql.addEventListener('change', onChange);
  });

  onUnmounted(() => {
    mql?.removeEventListener('change', onChange);
  });

  return matches;
}

/** 窄屏（手机）。与 styles/index.scss 里的断点保持一致。 */
export function useIsMobile(): Ref<boolean> {
  return useMediaQuery('(max-width: 640px)');
}
