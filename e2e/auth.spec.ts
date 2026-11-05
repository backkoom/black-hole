import { expect, test, type Page } from '@playwright/test';
import { adminPassword, resetAdmin } from './helpers';

/**
 * 认证 E2E —— 执行包 §9.3 Gate「认证 E2E 通过；没有业务页面也能登录/退出/改密」。
 *
 * 前置：api(3000) 与 web(5173) 已启动，且 `npm run seed` 已跑过。
 * 口令从仓库根 .env 读取，不写死在测试里。
 *
 * ⚠️ 选择器两个坑：
 *  1. AntD 5 会给**双字中文按钮自动插入空格**（「登录」渲染成「登 录」、
 *     「提交」渲染成「提 交」），所有中文按钮选择器都要写成 /登\s*录/ 这种容忍空白的正则。
 *  2. 左侧导航是 AntD `Menu`，渲染成 `role="menuitem"`，**不是 link**。
 */

/** 填账号密码并点登录 */
async function fillLogin(page: Page, account: string, password: string): Promise<void> {
  await page.getByPlaceholder(/请输入账号/).first().fill(account);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /登\s*录/ }).click();
}

test.describe('认证链路', () => {
  // 改密测试会真的改掉 admin 密码，所以每个测试前后都要重置回种子状态
  test.beforeEach(async () => {
    await resetAdmin();
  });
  test.afterAll(async () => {
    await resetAdmin();
  });

  // 改密测试会真的改掉 admin 密码，所以每个测试前后都要重置回种子状态
  test.beforeEach(async () => {
    await resetAdmin();
  });
  test.afterAll(async () => {
    await resetAdmin();
  });

  test('未登录访问受保护页 → 跳登录页', async ({ page }) => {
    await page.goto('/settings/profile');
    await expect(page).toHaveURL(/\/login/);
  });

  test('登录后因 must_change 强制跳改密页', async ({ page }) => {
    await page.goto('/login');
    await fillLogin(page, 'admin', adminPassword());

    // 种子 admin 的 must_change_password=true → 必须先改密
    await expect(page).toHaveURL(/settings\/password/);
  });

  test('改密成功后进入工作台，随后可退出', async ({ page }) => {
    const newPassword = 'E2E-New-Pass-2026';

    await page.goto('/login');
    await fillLogin(page, 'admin', adminPassword());
    await expect(page).toHaveURL(/settings\/password/);

    // 改密：旧密码 / 新密码 / 确认新密码（三个框，确认密码为空会被表单校验拦住）
    await page.getByPlaceholder(/请输入旧密码/).fill(adminPassword());
    await page.getByPlaceholder(/请输入新密码/).fill(newPassword);
    await page.getByPlaceholder(/请再次输入新密码/).fill(newPassword);
    await page.getByRole('button', { name: /提\s*交/ }).click();

    // 改密成功 → 进入工作台
    await expect(page).toHaveURL(/\/workspace/);

    // 退出
    await page.getByRole('button', { name: /退\s*出/ }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('管理员能看到管理导航', async ({ page }) => {
    // 用 API 直接建会话，绕开改密流程
    const loginRes = await page.request.post('/api/auth/login', {
      data: { account: 'admin', password: adminPassword() },
    });
    expect(loginRes.status()).toBe(200);

    await page.goto('/workspace');
    // 左侧导航是 AntD Menu → role=menuitem
    await expect(page.getByRole('menuitem', { name: /设\s*置/ }).first()).toBeVisible();
    // 2026-11-05 改名：工作台 → 自定义工作台（与「项目总览」消歧）
    await expect(page.getByRole('menuitem', { name: /自定义工作台/ }).first()).toBeVisible();
  });

  test('错误密码显示统一提示，不泄露账号是否存在', async ({ page }) => {
    await page.goto('/login');
    await fillLogin(page, 'admin', 'Wrong-Pass-1');

    await expect(page.getByText('账号或密码错误').first()).toBeVisible();
  });
});
