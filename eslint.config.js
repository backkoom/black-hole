import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/test-results/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // TypeScript 编译器已经检查未定义变量，no-undef 对 TS 是噪音
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Node 侧脚本（目前只有迁移包装器 .js 与截图脚本 .mjs）
    files: ['**/*.js', '**/*.mjs'],
    rules: {
      'no-undef': 'off',
      'no-console': 'off',
    },
  },
  {
    // CLI 脚本与后端：允许 console 输出（种子要打印一次性初始密码）
    files: ['db/**/*.ts', 'apps/api/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['**/test/**/*.ts', '**/*.test.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
