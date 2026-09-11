import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig({
  plugins: [
    vue(),
    /**
     * Element Plus 按需引入。
     *
     * 原先 main.ts 里是 `import ElementPlus from 'element-plus'` +
     * `import 'element-plus/dist/index.css'`，把整个组件库和全部样式一次性打进主包 ——
     * 实测单个 chunk 1.27MB（gzip 401KB），CSS 366KB（gzip 50KB）。
     *
     * 这个插件会扫描模板里用到的 el-* 组件，只引入对应组件及其样式。
     * ElMessage / ElMessageBox 是编程式调用，各文件本来就是显式 import 的，
     * 所以不需要 unplugin-auto-import，只要在 main.ts 里补上这两个的样式入口即可。
     */
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'src/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@erp/shared': fileURLToPath(new URL('../shared/src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    fs: {
      // 允许访问仓库根（shared 位于 web 之外）
      allow: [fileURLToPath(new URL('..', import.meta.url))],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
