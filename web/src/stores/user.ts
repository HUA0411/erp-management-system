import { defineStore } from 'pinia';
import { authApi } from '@/api';
import type { LoginPayload, MenuNode, UserInfo } from '@erp/shared';

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    user: null as UserInfo | null,
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
    permissions: (s): string[] => s.user?.permissions ?? [],
    menus: (s): MenuNode[] => s.user?.menus ?? [],
    isSuperAdmin: (s) => !!s.user?.isSuperAdmin,
    hasPermission: (s) => (code: string) => !!s.user?.isSuperAdmin || (s.user?.permissions ?? []).includes(code),
  },
  actions: {
    async login(payload: LoginPayload) {
      const result = await authApi.login(payload);
      this.token = result.token;
      localStorage.setItem('token', result.token);
      // 以带 token 的 /auth/profile 为准刷新完整用户信息（菜单树等）
      this.user = await authApi.profile();
    },
    async fetchProfile() {
      this.user = await authApi.profile();
    },
    logout() {
      this.token = '';
      this.user = null;
      localStorage.removeItem('token');
    },
  },
});
