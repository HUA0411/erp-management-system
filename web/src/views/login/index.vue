<template>
  <div class="login-page">
    <!-- 左侧品牌区 -->
    <div class="brand-panel">
      <div class="brand-inner">
        <div class="brand-logo" :style="{ animationDelay: '0ms' }">
          <div class="logo-mark">{{ brand.logoMark }}</div>
          <div class="brand-name">
            <h1>{{ brand.appName }}</h1>
            <p>{{ brand.loginSubtitle }}</p>
          </div>
        </div>

        <div class="brand-points">
          <div class="point" v-for="(p, i) in points" :key="p.title" :style="{ animationDelay: `${150 + i * 120}ms` }">
            <el-icon><component :is="p.icon" /></el-icon>
            <div>
              <div class="point-title">{{ p.title }}</div>
              <div class="point-desc">{{ p.desc }}</div>
            </div>
          </div>
        </div>

        <div class="brand-footer" :style="{ animationDelay: '600ms' }">
          <span class="bar"></span>
          <span>多租户隔离 · RBAC 权限 · 全链路审计</span>
        </div>
      </div>
    </div>

    <!-- 右侧登录区 -->
    <div class="form-panel">
      <div class="form-box">
        <h2 class="form-title">欢迎回来</h2>
        <p class="form-sub">登录企业 ERP 管理系统</p>

        <el-form ref="formRef" :model="form" :rules="rules" size="large" @keyup.enter="submit">
          <el-form-item prop="companyCode">
            <el-input v-model="form.companyCode" placeholder="公司编码（演示：DEMO）" :prefix-icon="OfficeBuilding" clearable />
          </el-form-item>
          <el-form-item prop="username">
            <el-input v-model="form.username" placeholder="用户名（演示：admin）" :prefix-icon="User" clearable />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="密码（演示：123456）"
              :prefix-icon="Lock"
              show-password
            />
          </el-form-item>
          <el-button class="submit-btn" type="primary" size="large" :loading="loading" @click="submit">
            登 录
          </el-button>
        </el-form>

        <div class="form-tips">
          <span>演示账号：</span>
          <el-tooltip content="全部权限" placement="top">
            <el-tag size="small" class="tip-tag" @click="fill('DEMO', 'admin')">admin</el-tag>
          </el-tooltip>
          <el-tooltip content="采购员" placement="top">
            <el-tag size="small" class="tip-tag" @click="fill('DEMO', 'zhangsan')">zhangsan</el-tag>
          </el-tooltip>
          <el-tooltip content="销售员" placement="top">
            <el-tag size="small" class="tip-tag" @click="fill('DEMO', 'lisi')">lisi</el-tag>
          </el-tooltip>
          <el-tooltip content="仓管员" placement="top">
            <el-tag size="small" class="tip-tag" @click="fill('DEMO', 'wangwu')">wangwu</el-tag>
          </el-tooltip>
          <el-tooltip content="财务" placement="top">
            <el-tag size="small" class="tip-tag" @click="fill('DEMO', 'zhaoliu')">zhaoliu</el-tag>
          </el-tooltip>
          <div class="pwd-hint">密码均为 123456</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { OfficeBuilding, User, Lock, DataLine, Box, Wallet, TrendCharts } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import { brand } from '@/config/brand';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const points = [
  { icon: DataLine, title: '全链路业务闭环', desc: '采购入库 → 销售出库 → 库存联动 → 应收应付' },
  { icon: Box, title: '多租户数据隔离', desc: '共享数据库 · 行级隔离 · 互不可见' },
  { icon: Wallet, title: '财务往来清晰', desc: '收付款单 + 往来汇总，账实一致' },
  { icon: TrendCharts, title: '经营数据看板', desc: '销售趋势 / 热销排行 / 库存预警' },
];

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
  background: #fff;
}

.brand-panel {
  flex: 1.15;
  background:
    radial-gradient(ellipse 80% 60% at 20% 10%, rgba(242, 163, 60, 0.18), transparent 60%),
    radial-gradient(ellipse 70% 55% at 85% 90%, rgba(36, 86, 166, 0.35), transparent 65%),
    linear-gradient(150deg, #101f38 0%, #14263f 45%, #1b3560 100%);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
    background-size: 44px 44px;
    mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, #000 30%, transparent 75%);
  }

  &::after {
    content: '';
    position: absolute;
    width: 420px;
    height: 420px;
    border-radius: 50%;
    border: 1px solid rgba(242, 163, 60, 0.16);
    right: -140px;
    top: -120px;
    box-shadow: 0 0 0 60px rgba(242, 163, 60, 0.05), 0 0 0 120px rgba(242, 163, 60, 0.03);
  }
}

.brand-inner {
  position: relative;
  z-index: 2;
  width: 80%;
  max-width: 480px;
  color: #fff;
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 16px;
  opacity: 0;
  animation: rise 0.6s ease forwards;

  .logo-mark {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    background: linear-gradient(135deg, #f2a33c, #e07b1f);
    color: #14263f;
    font-weight: 800;
    font-size: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 24px rgba(242, 163, 60, 0.35);
  }

  h1 {
    font-size: 24px;
    margin: 0 0 6px;
    letter-spacing: 1px;
  }

  p {
    margin: 0;
    font-size: 13px;
    color: #8fa3c2;
    letter-spacing: 0.5px;
  }
}

.brand-points {
  margin-top: 52px;
  display: flex;
  flex-direction: column;
  gap: 22px;

  .point {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    opacity: 0;
    animation: rise 0.6s ease forwards;

    .el-icon {
      font-size: 20px;
      color: #f2a33c;
      margin-top: 2px;
    }

    .point-title {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .point-desc {
      font-size: 12.5px;
      color: #8fa3c2;
    }
  }
}

.brand-footer {
  margin-top: 48px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #6d83a5;
  opacity: 0;
  animation: rise 0.6s ease forwards;

  .bar {
    width: 36px;
    height: 2px;
    background: #f2a33c;
    border-radius: 2px;
  }
}

.form-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fbfcfe;
}

.form-box {
  width: 360px;
  padding: 40px 0;

  .form-title {
    font-size: 26px;
    margin: 0 0 6px;
    color: #1d2a44;
    letter-spacing: 0.5px;
  }

  .form-sub {
    margin: 0 0 32px;
    color: #8a97ab;
    font-size: 13.5px;
  }

  .submit-btn {
    width: 100%;
    margin-top: 6px;
    letter-spacing: 6px;
    font-weight: 600;
    border-radius: 8px;
    height: 44px;
  }

  .form-tips {
    margin-top: 28px;
    font-size: 12.5px;
    color: #8a97ab;

    .tip-tag {
      margin: 0 4px 6px 0;
      cursor: pointer;
    }

    .pwd-hint {
      margin-top: 10px;
      font-size: 12px;
      color: #b0bac9;
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
</style>
