// 字体自持：不依赖操作系统字体。Linux 服务器/容器一般没装中文字体，
// 靠系统字体兜底会让整个界面中文显示成方框。
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/noto-sans-sc/chinese-simplified-400.css';
import '@fontsource/noto-sans-sc/chinese-simplified-500.css';
import '@fontsource/noto-sans-sc/chinese-simplified-600.css';

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
