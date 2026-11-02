import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 配置 —— 执行包 §4.4「npm run test:e2e # Playwright，需先起服务」。
 * 前置：api(3000) 与 web(5173) 都要已启动（npm run dev）。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: './e2e/global-setup.ts',
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    locale: 'zh-CN',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
