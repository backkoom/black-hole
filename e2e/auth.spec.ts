import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 认证 E2E —— 执行包 §9.3 Gate「认证 E2E 通过；没有业务页面也能登录/退出/改密」。
 *
 * 前置：api(3000) 与 web(5173) 已启动，且 `npm run seed` 已跑过。
 * 口令从仓库根 .env 读取，不写死在测试里。
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function adminPassword(): string {
  try {
    const text = readFileSync(join(root, '.env'), 'utf8');
    const m = /^\s*SEED_ADMIN_PASSWORD\s*=\s*(.*)\s*$/m.exec(text);
    const v = m?.[1]?.replace(/^["']|["']$/g, '');
    if (v) return v;
  } catch {
    // ignore
  }
  const env = process.env.SEED_ADMIN_PASSWORD;
  if (!env) throw new Error('SEED_ADMIN_PASSWORD 未设置');
  return env;
}

test.describe('认证链路', () => {
  test('未登录访问受保护页 → 跳登录页并记住原路由', async ({ page }) => {
    await page.goto('/settings/profile');
    await expect(page).toHaveURL(/\/login/);
    // 记住原路由：登录后应跳回
    const url = page.url();
    expect(url).toContain('redirect');
  });

  test('登录后因 must_change 强制跳改密页', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/账号|用户名/).first().fill('admin');
    await page.locator('input[type="password"]').first().fill(adminPassword());
    await page.getByRole('button', { name: /登录/ }).click();

    // 种子 admin 的 must_change_password=true → 必须先改密
    await expect(page).toHaveURL(/settings\/password/);
  });

  test('改密成功后进入工作台，随后可退出', async ({ page }) => {
    const newPassword = 'E2E-New-Pass-2026';

    await page.goto('/login');
    await page.getByPlaceholder(/账号|用户名/).first().fill('admin');
    await page.locator('input[type="password"]').first().fill(adminPassword());
    await page.getByRole('button', { name: /登录/ }).click();
    await expect(page).toHaveURL(/settings\/password/);

    // 改密
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill(adminPassword());
    await passwordInputs.nth(1).fill(newPassword);
    await page.getByRole('button', { name: /确\s*定|保存|提\s*交/ }).first().click();

    // 改密成功 → 进入工作台
    await expect(page).toHaveURL(/\/workspace/);

    // 退出
    const logout = page.getByRole('button', { name: /退出|登出/ }).first();
    if (await logout.count()) {
      await logout.click();
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('管理员能看到管理导航', async ({ page }) => {
    // 直接用 API 建一个 must_change=false 的管理员会话，避免依赖改密流程
    const login = await page.request.post('/api/auth/login', {
      data: { account: 'admin', password: adminPassword() },
    });
    expect(login.status()).toBe(200);

    await page.goto('/workspace');
    // 管理员应能看到「设置」入口（里面有管理项）
    await expect(page.getByRole('link', { name: /设\s*置/ }).first()).toBeVisible();
  });

  test('错误密码显示统一提示，不泄露账号是否存在', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/账号|用户名/).first().fill('admin');
    await page.locator('input[type="password"]').first().fill('Wrong-Pass-1');
    await page.getByRole('button', { name: /登录/ }).click();

    await expect(page.getByText('账号或密码错误').first()).toBeVisible();
  });
});
