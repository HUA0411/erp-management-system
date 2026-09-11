import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * ESLint 扁平配置（monorepo 根）。
 *
 * 定位：**抓真问题，不管排版**。
 * 格式由 Prettier 负责（末尾 eslint-config-prettier 关掉了所有与格式冲突的规则），
 * 这里只保留能抓出 bug 的规则，避免一个存量项目一上来报几千条风格警告、
 * 最后所有人都学会加 eslint-disable。
 *
 * 重点保留的几类：
 *   - no-floating-promises / no-misused-promises：漏 await 的 Promise
 *     （异步失败被吞掉、事务没等提交就返回，这类 bug 最难查）
 *   - no-unused-vars：死代码
 *   - vue/no-mutating-props 等：Vue 状态误用
 *   - eqeqeq、no-debugger：低级失误
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'web/src/components.d.ts',
      'web/src/auto-imports.d.ts',
      '**/*.min.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 后端（Node）
  {
    files: ['server/**/*.ts', 'shared/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        // 开启类型信息，才能用 no-floating-promises 这类需要类型的规则
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // 存量 28 处，多为测试桩
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'no-debugger': 'error',
    },
  },

  // 前端（Vue 3 + 浏览器）
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['web/**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // 单文件组件名允许单词（Product.vue / Order.vue），与文件名一致更直观
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off', // 唯一的 v-html 已过 DOMPurify，见 AiMarkdown.vue
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },

  // 测试文件放宽
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'server/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },

  // 脚本 / 配置文件（CommonJS 的 config.js 需要 module/exports 等全局变量）
  {
    files: ['**/*.mjs', '**/*.cjs', '**/*.config.js', 'scripts/**'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs',
    },
    rules: { 'no-console': 'off' },
  },

  // 必须放最后：关掉所有与 Prettier 冲突的格式化规则
  prettier,
);
