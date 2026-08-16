import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import * as Icons from '@element-plus/icons-vue';
import 'element-plus/dist/index.css';
import App from './App.vue';
import router from './router';
import './styles/index.scss';
import { permission } from './directives/permission';
import { applyBrand } from './config/brand';

// 应用品牌配置（系统名/主题色），交付客户时改 brand.ts 即可换品牌
applyBrand();

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(ElementPlus, { locale: zhCn });

// 全局注册图标（侧边栏菜单图标按名称动态渲染）
for (const [name, comp] of Object.entries(Icons)) {
  app.component(name, comp);
}

app.directive('permission', permission);

app.mount('#app');
