<template>
  <el-container class="app-shell">
    <el-aside
      :width="collapsed ? '64px' : '228px'"
      class="sidebar"
      :class="{ 'is-hidden-mobile': isNarrow && !mobileOpen }"
    >
      <div class="logo">
        <div class="logo-mark">{{ brand.logoMark }}</div>
        <transition name="fade-slide">
          <div v-if="!collapsed" class="logo-text">
            <div class="logo-title">{{ brand.logoTitle }}</div>
            <div class="logo-sub">{{ userStore.user?.companyName || brand.logoSub }}</div>
          </div>
        </transition>
      </div>

      <el-scrollbar class="menu-scroll">
        <el-menu
          :default-active="$route.path"
          :collapse="menuCollapsed"
          :collapse-transition="false"
          background-color="transparent"
          text-color="var(--sidebar-text)"
          active-text-color="var(--surface)"
          class="side-menu"
        >
          <template v-for="node in userStore.menus" :key="node.id">
            <SideMenuItem :node="node" />
          </template>
        </el-menu>
      </el-scrollbar>
    </el-aside>

    <!-- 移动端浮层遮罩：点任意处收起侧边栏 -->
    <div v-if="isNarrow && mobileOpen" class="sidebar-mask" @click="mobileOpen = false" />

    <el-container class="main-area">
      <el-header class="header">
        <div class="header-left">
          <el-icon class="collapse-btn" @click="toggleSidebar">
            <Expand v-if="collapsed" />
            <Fold v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="$route.meta.title">{{ $route.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-tag size="small" effect="plain" class="company-tag">
            {{ userStore.user?.companyCode }} · {{ userStore.user?.companyName }}
          </el-tag>
          <el-dropdown trigger="click" @command="onCommand">
            <span class="user-entry">
              <el-avatar :size="30" class="user-avatar">{{ avatarText }}</el-avatar>
              <span class="user-name">{{ userStore.user?.realName || userStore.user?.username }}</span>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="password">
                  <el-icon><Lock /></el-icon>修改密码
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main-content">
        <router-view v-slot="{ Component }">
          <transition name="fade-slide" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>

    <!-- 修改密码 -->
    <el-dialog v-model="pwdVisible" title="修改密码" width="420px" :close-on-click-modal="false">
      <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-width="90px">
        <el-form-item label="原密码" prop="oldPassword">
          <el-input v-model="pwdForm.oldPassword" type="password" show-password placeholder="请输入原密码" />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="6-64 位" />
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirm">
          <el-input v-model="pwdForm.confirm" type="password" show-password placeholder="再次输入新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdLoading" @click="submitPwd">确定</el-button>
      </template>
    </el-dialog>

    <!-- AI 智能助手（右下角悬浮） -->
    <AiAssistant />
  </el-container>
</template>

<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { ElSubMenu, ElMenuItem, ElIcon } from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import { authApi } from '@/api';
import { brand } from '@/config/brand';
import AiAssistant from '@/components/ai/AiAssistant.vue';
import type { MenuNode } from '@erp/shared';

const userStore = useUserStore();
const route = useRoute();
const router = useRouter();

/**
 * 侧边栏折叠状态。
 *
 * 拆成两个量，避免"自动收起"和"用户手动选择"互相覆盖：
 *   userCollapsed —— 用户点折叠按钮的结果，窗口变宽后要恢复成它
 *   autoCollapsed —— 窗口宽度不够时系统强制收起，变宽自动解除
 * 最终态 = 二者取或。
 */
const NARROW_BREAKPOINT = 1024; // 实测 1024 起内容区就不够用了
const MOBILE_BREAKPOINT = 630;  // 以下侧边栏改浮层，见样式里的 @media

const userCollapsed = ref(false);
const autoCollapsed = ref(false);
const isNarrow = ref(false);
/** 移动端浮层是否打开（仅 MOBILE_BREAKPOINT 以下有意义） */
const mobileOpen = ref(false);

const collapsed = computed(() => userCollapsed.value || autoCollapsed.value);

/* 移动端浮层是"展开"状态，菜单必须显示文字。
   如果沿用 collapsed（窄屏时恒为 true），浮层里会只剩图标、没有菜单名，
   用户点了汉堡也看不懂该点哪个。 */
const menuCollapsed = computed(() => (isNarrow.value && mobileOpen.value ? false : collapsed.value));

function syncBreakpoint() {
  const w = window.innerWidth;
  isNarrow.value = w <= MOBILE_BREAKPOINT;
  autoCollapsed.value = w <= NARROW_BREAKPOINT;
  if (!isNarrow.value) mobileOpen.value = false;
}

function toggleSidebar() {
  if (isNarrow.value) {
    mobileOpen.value = !mobileOpen.value;
  } else {
    userCollapsed.value = !userCollapsed.value;
  }
}

onMounted(() => {
  syncBreakpoint();
  window.addEventListener('resize', syncBreakpoint);
});

onUnmounted(() => {
  window.removeEventListener('resize', syncBreakpoint);
});
const avatarText = computed(() => (userStore.user?.realName || userStore.user?.username || 'U').slice(0, 1));

function onCommand(command: string) {
  if (command === 'logout') {
    ElMessageBox.confirm('确定退出登录吗？', '提示', { type: 'warning' })
      .then(() => {
        userStore.logout();
        router.push('/login');
      })
      .catch(() => undefined);
  } else if (command === 'password') {
    pwdVisible.value = true;
  }
}

// 修改密码
const pwdVisible = ref(false);
const pwdLoading = ref(false);
const pwdFormRef = ref<FormInstance>();
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirm: '' });
const pwdRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 64, message: '密码长度 6-64 位', trigger: 'blur' },
  ],
  confirm: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, cb) =>
        value === pwdForm.newPassword ? cb() : cb(new Error('两次输入的密码不一致')),
      trigger: 'blur',
    },
  ],
};

async function submitPwd() {
  await pwdFormRef.value?.validate();
  pwdLoading.value = true;
  try {
    await authApi.changePassword(pwdForm.oldPassword, pwdForm.newPassword);
    ElMessage.success('密码修改成功，请重新登录');
    pwdVisible.value = false;
    userStore.logout();
    router.push('/login');
  } finally {
    pwdLoading.value = false;
  }
}

// 递归侧边栏菜单项：有子节点渲染 el-sub-menu（标题用 #title 插槽），叶子节点渲染 el-menu-item
// 注意：渲染函数中必须使用组件对象（ElSubMenu/ElMenuItem/ElIcon）而非字符串标签，保证组件被正确解析
const SideMenuItem = (props: { node: MenuNode }) => {
  const children = props.node.children ?? [];
  const label = () => [
    props.node.icon && Icons[props.node.icon as keyof typeof Icons]
      ? h(ElIcon, null, { default: () => h(Icons[props.node.icon as keyof typeof Icons]) })
      : h(ElIcon, null, { default: () => h('span', { style: 'width: 16px' }) }),
    h('span', props.node.name),
  ];

  if (children.length) {
    return h(
      ElSubMenu,
      { index: props.node.code },
      {
        title: label,
        default: () => children.map((child) => h(SideMenuItem, { node: child })),
      },
    );
  }
  return h(
    ElMenuItem,
    {
      index: props.node.path || props.node.code,
      onClick: () => props.node.path && router.push(props.node.path),
    },
    { default: label },
  );
};
</script>

<style scoped lang="scss">
.app-shell {
  height: 100vh;
}

.sidebar {
  background: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
  overflow: hidden;
  flex-shrink: 0;
}

/* 630px 以下：侧边栏 228px 会占掉屏幕一半以上（实测 390px 时占 59%），
   所以这个宽度下直接隐藏侧边栏，改由头部的折叠按钮唤出。
   唤出时用固定定位浮在内容之上，不挤压主区。 */
@media (max-width: 630px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 2000;
    width: var(--sidebar-width) !important;
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.35);
  }

  .sidebar.is-hidden-mobile {
    transform: translateX(-100%);
  }

  /* 浮层打开时的遮罩：点任意处收起 */
  .sidebar-mask {
    position: fixed;
    inset: 0;
    background: rgba(16, 31, 56, 0.45);
    z-index: 1999;
  }
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  overflow: hidden;

  .logo-mark {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-lg);
    background: linear-gradient(135deg, var(--el-color-warning), var(--warning-text));
    color: var(--sidebar-bg);
    font-weight: 800;
    font-size: var(--fs-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .logo-title {
    color: var(--surface);
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 1px;
    white-space: nowrap;
  }

  .logo-sub {
    color: var(--text-3);
    font-size: var(--fs-2xs);
    white-space: nowrap;
    margin-top: 2px;
  }
}

.menu-scroll {
  flex: 1;
}

.side-menu {
  border-right: none;
  padding: 8px;

  :deep(.el-menu-item),
  :deep(.el-sub-menu__title) {
    height: 44px;
    line-height: 44px;
    border-radius: var(--radius-lg);
    margin-bottom: 2px;

    &:hover {
      background: var(--sidebar-bg-hover);
    }
  }

  :deep(.el-menu-item.is-active) {
    background: linear-gradient(90deg, var(--el-color-primary), var(--brand-strong));
    box-shadow: var(--shadow-md);
  }

  :deep(.el-menu) {
    background: transparent;
  }
}

.main-area {
  min-width: 0;
}

.header {
  height: var(--header-height);
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: var(--shadow-sm);
  z-index: 5;

  .header-left {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .collapse-btn {
    font-size: var(--fs-lg);
    cursor: pointer;
    color: var(--text-2);
    &:hover {
      color: var(--el-color-primary);
    }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 16px;

    .company-tag {
      border-color: var(--border-strong);
      color: var(--el-color-primary);
      background: var(--brand-tint);
    }

    /* 响应式：公司名标签最长，窄屏先砍它（头像+姓名保留，用户仍能看出是谁） */
    @media (max-width: 900px) {
      .company-tag {
        display: none;
      }
    }

    @media (max-width: 640px) {
      gap: 8px;

      .user-name {
        display: none;
      }
    }

    .user-entry {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      outline: none;

      .user-avatar {
        background: var(--el-color-primary);
        color: var(--surface);
        font-size: var(--fs-md);
      }

      .user-name {
        font-size: var(--fs-md);
        color: var(--text-1);
      }
    }
  }
}

.main-content {
  background: var(--page-bg);
  padding: 16px;
  overflow-y: auto;
}
</style>
