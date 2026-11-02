import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/api/test/**/*.test.ts', 'packages/shared/test/**/*.test.ts'],
    setupFiles: ['apps/api/test/setup.ts'],
    // 数据库测试必须串行，避免互相污染
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
