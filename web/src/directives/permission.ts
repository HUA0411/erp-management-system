import type { Directive, DirectiveBinding } from 'vue';
import { useUserStore } from '@/stores/user';

/** 按钮级权限指令：v-permission="'product:create'" 或数组 */
export const permission: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding<string | string[]>) {
    const store = useUserStore();
    const required = Array.isArray(binding.value) ? binding.value : [binding.value];
    const ok = store.isSuperAdmin || required.some((code) => store.permissions.includes(code));
    if (!ok) {
      el.parentNode?.removeChild(el);
    }
  },
};
