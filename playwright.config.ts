import { defineConfig, devices } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * E2E 配置 —— 执行包 §4.4「npm run test:e2e # Playwright，需先起服务」。
 * 前置：api(3000) 与 web(5173) 都要已启动（npm run dev）。
 */

/**
 * 把仓库根的 .env 注入 process.env。
 *
 * 为什么需要：E2E 用 admin 账号登录，口令只能从环境变量读
 * （process.env.SEED_ADMIN_PASSWORD），**绝不能写进代码或提交进仓库**。
 * 本地开发用 .env，CI 用外部注入的环境变量 —— 两者同名，
 * process.loadEnvFile 不会覆盖已存在的环境变量，所以 CI 的值优先。
 *
 * .env 不存在时不报错（CI 场景：环境变量由流水线注入）。
 */
try {
  // 相对配置文件解析，不依赖 cwd 从哪执行
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), '.env'));
} catch {
  // 没有 .env（CI / 只用外部环境变量）→ 保持现状
}

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
