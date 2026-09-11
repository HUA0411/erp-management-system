<template>
  <div class="login-page">
    <!-- ============ 左：整面货架墙 ============
         登录页是整个系统里唯一没有信息密度压力的屏幕，也是任何人打开 demo 的
         第一眼 —— 身份感只能立在这里。货架压成背景，"每一箱货都看得见"是文案
         和视觉的接点：柱高 = 库存水位，隔板线 = 安全库存，颜色 = 周转速度。 -->
    <div class="shelf-panel">
      <div class="shelf-wall" aria-hidden="true">
        <div v-for="(c, i) in crates" :key="i" class="crate" :class="c.cls">
          <i :style="{ height: c.h + '%' }"></i>
        </div>
      </div>

      <div class="brand-inner">
        <div class="brand-logo" :style="{ animationDelay: '0ms' }">
          <svg class="logo-mark" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <rect x="7" y="9" width="22" height="2.4" rx="1.2" fill="#7FBBA4" />
            <rect x="7" y="17" width="22" height="2.4" rx="1.2" fill="#7FBBA4" />
            <rect x="7" y="25" width="22" height="2.4" rx="1.2" fill="#7FBBA4" />
            <rect x="10" y="4.6" width="5.5" height="4.4" rx="1.2" fill="var(--el-color-warning)" />
            <rect x="17.5" y="12.6" width="7.5" height="4.4" rx="1.2" fill="var(--el-color-warning)" />
            <rect x="12" y="20.6" width="5.5" height="4.4" rx="1.2" fill="#E8C89E" />
          </svg>
          <div class="brand-name">
            <h1>{{ brand.logoTitle }}</h1>
            <p>{{ brand.logoSub }}</p>
          </div>
        </div>

        <h2 class="headline" :style="{ animationDelay: '120ms' }">
          {{ brand.loginHeadline }}<br /><em>{{ brand.loginHeadlineAccent }}</em
          >。
        </h2>
        <p class="headline-sub" :style="{ animationDelay: '200ms' }">{{ brand.loginSubtitle }}</p>

        <!-- 三个数字都取自这个仓库本身，不是编的营销话术 -->
        <div class="facts" :style="{ animationDelay: '280ms' }">
          <div v-for="f in facts" :key="f.k" class="fact">
            <div class="fact-v">
              {{ f.v }}<small v-if="f.unit">{{ f.unit }}</small>
            </div>
            <div class="fact-k">{{ f.k }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 右：登录表单 ============ -->
    <div class="form-panel">
      <div class="form-box">
        <h2 class="form-title">登录</h2>
        <p class="form-sub">还没有账号？请联系贵司管理员开通。</p>

        <el-form ref="formRef" :model="form" :rules="rules" size="large" @keyup.enter="submit">
          <el-form-item prop="companyCode">
            <el-input
              v-model="form.companyCode"
              placeholder="公司编码"
              :prefix-icon="OfficeBuilding"
              clearable
            />
          </el-form-item>
          <el-form-item prop="username">
            <el-input v-model="form.username" placeholder="用户名" :prefix-icon="User" clearable />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="密码"
              :prefix-icon="Lock"
              show-password
            />
          </el-form-item>
          <el-button class="submit-btn" type="primary" size="large" :loading="loading" @click="submit">
            进入系统
          </el-button>
        </el-form>

        <div class="form-tips">
          <div class="tips-head">演示账号 · 点一下自动填入</div>
          <div class="tips-tags">
            <el-tooltip v-for="a in demoAccounts" :key="a.user" :content="a.role" placement="top">
              <el-tag size="small" class="tip-tag" @click="fill('DEMO', a.user)">{{ a.user }}</el-tag>
            </el-tooltip>
          </div>
          <div class="pwd-hint">密码均为 123456 · 数据为演示数据，可随意操作</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { OfficeBuilding, User, Lock } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import { brand } from '@/config/brand';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

/** 三个数字都来自这个仓库本身，写死在代码里但可核对（页面数 / 自动化测试数） */
const facts = [
  { v: '7', unit: '大', k: '业务模块' },
  { v: '22', unit: '个', k: '功能页面' },
  { v: '68', unit: '项', k: '自动化测试' },
];

const demoAccounts = [
  { user: 'admin', role: '全部权限' },
  { user: 'zhangsan', role: '采购员' },
  { user: 'lisi', role: '销售员' },
  { user: 'wangwu', role: '仓管员' },
  { user: 'zhaoliu', role: '财务' },
];

/**
 * 货架墙。
 *
 * 用固定种子的伪随机生成，而不是 Math.random —— 否则每次进登录页
 * 货架都不一样，截图和录屏都对不上，观感上也"在闪"。
 */
const CRATE_H = [30, 44, 58, 66, 78, 92];
const CRATE_CLS = ['c-fast', 'c-fast', 'c-fast', 'c-slow', 'c-slow', 'c-dead'];
function buildCrates(cols: number, rows: number, seed0: number) {
  let seed = seed0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: cols * rows }, () => ({
    cls: CRATE_CLS[Math.floor(rnd() * CRATE_CLS.length)],
    h: CRATE_H[Math.floor(rnd() * CRATE_H.length)],
  }));
}
const crates = buildCrates(8, 7, 20260911);

const formRef = ref<FormInstance>();
const loading = ref(false);
const form = reactive({ companyCode: 'DEMO', username: 'admin', password: '123456' });

const rules: FormRules = {
  companyCode: [{ required: true, message: '请输入公司编码', trigger: 'blur' }],
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

function fill(companyCode: string, username: string) {
  form.companyCode = companyCode;
  form.username = username;
  form.password = '123456';
}

async function submit() {
  await formRef.value?.validate();
  loading.value = true;
  try {
    await userStore.login({ ...form });
    ElMessage.success(`欢迎回来，${userStore.user?.realName}`);
    router.push((route.query.redirect as string) || '/');
  } catch {
    // 错误提示由拦截器统一处理
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.login-page {
  display: flex;
  height: 100vh;
  background: var(--surface-muted);
}

/* ============ 货架墙 ============ */
.shelf-panel {
  flex: 1.22;
  position: relative;
  overflow: hidden;
  background: var(--sidebar-bg);
  display: flex;
  align-items: center;
}

.shelf-wall {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-auto-rows: 1fr;
  gap: 10px;
  padding: 22px;
}

.crate {
  position: relative;
  border-radius: 7px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.07);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.09);

  /* 货物从底部堆起来，高度就是"库存水位" */
  i {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: block;
    border-radius: 0 0 6px 6px;
  }

  /* 隔板 */
  &::after {
    content: '';
    position: absolute;
    left: -10px;
    right: -10px;
    bottom: -5px;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  &.c-fast i {
    background: linear-gradient(180deg, #46bc90, #2c7059);
  }
  &.c-slow i {
    background: linear-gradient(180deg, #efc46c, #be8d31);
  }
  &.c-dead i {
    background: linear-gradient(180deg, #e28069, #a24734);
  }
}

/* 暗角：左边压暗保证文字可读，右边把货架让出来 */
.shelf-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    96deg,
    rgba(12, 38, 29, 0.9) 0%,
    rgba(12, 38, 29, 0.84) 34%,
    rgba(12, 38, 29, 0.46) 56%,
    rgba(12, 38, 29, 0.1) 100%
  );
}

.brand-inner {
  position: relative;
  z-index: 2;
  padding: 0 0 0 58px;
  width: 100%;
  max-width: 560px;
  color: #fff;
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 34px;
  opacity: 0;
  animation: rise 0.6s ease forwards;

  .logo-mark {
    width: 42px;
    height: 42px;
    flex: none;
    border-radius: var(--radius-card-lg);
    background: var(--el-color-primary);
  }

  h1 {
    font-size: var(--fs-lg);
    margin: 0 0 3px;
    letter-spacing: 0.02em;
  }

  p {
    margin: 0;
    font-size: var(--fs-2xs);
    color: rgba(255, 255, 255, 0.5);
    letter-spacing: 0.14em;
  }
}

.headline {
  font-size: 38px;
  line-height: 1.28;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
  text-shadow: 0 2px 20px rgba(9, 30, 23, 0.85);
  opacity: 0;
  animation: rise 0.6s ease forwards;

  em {
    font-style: normal;
    color: #e9b57e;
  }
}

.headline-sub {
  margin: 16px 0 0;
  font-size: var(--fs-sm);
  line-height: 1.9;
  color: rgba(255, 255, 255, 0.6);
  max-width: 400px;
  opacity: 0;
  animation: rise 0.6s ease forwards;
}

.facts {
  display: flex;
  gap: 34px;
  margin-top: 36px;
  padding-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.14);
  opacity: 0;
  animation: rise 0.6s ease forwards;

  .fact-v {
    font-size: 27px;
    font-weight: 600;
    line-height: 1;
    font-variant-numeric: tabular-nums;

    small {
      font-size: var(--fs-base);
      font-weight: 500;
      color: rgba(255, 255, 255, 0.55);
      margin-left: 2px;
    }
  }

  .fact-k {
    font-size: var(--fs-2xs);
    color: rgba(255, 255, 255, 0.5);
    margin-top: 9px;
    letter-spacing: 0.04em;
  }
}

/* ============ 表单区 ============ */
.form-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-muted);
}

.form-box {
  width: 352px;
  padding: 40px 0;

  .form-title {
    font-size: var(--fs-2xl);
    margin: 0 0 8px;
    color: var(--text-1);
    letter-spacing: -0.01em;
  }

  .form-sub {
    margin: 0 0 30px;
    color: var(--text-3);
    font-size: var(--fs-sm);
  }

  .submit-btn {
    width: 100%;
    margin-top: 6px;
    font-weight: 600;
    border-radius: var(--card-radius);
    height: 46px;
  }

  .form-tips {
    margin-top: 26px;
    padding: 13px 15px;
    border-radius: var(--card-radius);
    background: var(--brand-tint);
    font-size: var(--fs-sm);
    color: var(--text-2);

    .tips-head {
      font-size: var(--fs-xs);
      color: var(--brand-strong);
      font-weight: 600;
      margin-bottom: 9px;
    }

    .tips-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .tip-tag {
      cursor: pointer;
    }

    .pwd-hint {
      margin-top: 10px;
      font-size: var(--fs-2xs);
      color: var(--text-3);
    }
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ============ 响应式 ============
   窄屏不隐藏品牌区（那是最有记忆点的部分），而是把货架墙压成顶部一条：
   标题和三个数字留着，表单落到下面。这样手机上打开还是同一个品牌，
   而不是"桌面版挤扁了"。 */
@media (max-width: 900px) {
  .login-page {
    flex-direction: column;
    height: auto;
    min-height: 100vh;
  }

  .shelf-panel {
    flex: none;
    min-height: 320px;
    align-items: flex-end;
    padding: 26px 24px 30px;
  }

  .shelf-wall {
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
    padding: 16px;
  }

  .shelf-panel::after {
    background: linear-gradient(
      180deg,
      rgba(12, 38, 29, 0.7) 0%,
      rgba(12, 38, 29, 0.9) 62%,
      rgba(12, 38, 29, 0.96) 100%
    );
  }

  .brand-inner {
    padding: 0;
    max-width: none;
  }

  .brand-logo {
    margin-bottom: 20px;
  }

  .headline {
    font-size: 27px;
  }

  .headline-sub {
    display: none;
  }

  .facts {
    gap: 22px;
    margin-top: 20px;
    padding-top: 16px;

    .fact-v {
      font-size: 21px;
    }
  }

  .form-panel {
    flex: 1;
    align-items: flex-start;
  }

  .form-box {
    width: 100%;
    max-width: 420px;
    padding: 30px 22px 40px;
  }
}
</style>
