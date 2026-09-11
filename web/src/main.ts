// 字体自持：不依赖操作系统字体。Linux 服务器/容器一般没装中文字体，
// 靠系统字体兜底会让整个界面中文显示成方框。
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/noto-sans-sc/chinese-simplified-400.css';
import '@fontsource/noto-sans-sc/chinese-simplified-500.css';
import '@fontsource/noto-sans-sc/chinese-simplified-600.css';

/**
 * Element Plus 样式：只引这两个编程式组件的样式。
 * 模板里的 el-* 组件由 unplugin-vue-components 自动按需引入（见 vite.config.ts），
 * 不再需要 `import 'element-plus/dist/index.css'`（那是全量 366KB）。
 * ElMessage / ElMessageBox 是函数式调用、各文件显式 import，插件管不到它们的样式，所以这里补。
 */
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
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

/**
 * 图标不再全局注册。
 * 原先 `for (const [name, comp] of Object.entries(Icons))` 把全部约 300 个图标
 * 注册成了全局组件 —— 这会让整个图标库无论如何都无法被 tree-shaking 掉。
 * 现在改为各文件按需 import；侧边栏那种「按名称动态渲染」的场景用显式的
 * 图标映射表（见 layout/menu-icons.ts）。
 */

app.directive('permission', permission);

app.mount('#app');
