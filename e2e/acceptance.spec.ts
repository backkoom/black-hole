import { expect, test, type Page } from '@playwright/test';
import { ensurePlainUser } from './helpers';

/**
 * 验收补漏 —— 对照 acceptance.md 逐条核对后，发现这两个编号只有"落点计划"
 * 没有实际用例（其余 35 项自动验收都能在现有用例里找到对应断言）：
 *
 *   A5 普通用户访问账号管理页 → 403
 *   B9 数据模块空状态（无任务 / 无项目 / 无灵感）
 *
 * 两条都站在普通用户视角，所以统一先建一个确定口令的普通账号再登录。
 */

// ⚠️ 账号规则：4-32 位、字母开头、只允许字母数字下划线 —— 不能带连字符，
// 否则前端表单校验直接拦住，请求根本发不出去。
const PLAIN = 'e2eplain01';
const PLAIN_PW = 'Accept1Test';

async function loginAsPlain(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder(/请输入账号/).first().fill(PLAIN);
  await page.locator('input[type="password"]').first().fill(PLAIN_PW);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForTimeout(1200);
}

test.describe('验收补漏', () => {
  test.beforeAll(async () => {
    await ensurePlainUser(PLAIN, PLAIN_PW);
  });

  test('A5 普通用户访问账号管理页显示 403（不是空白页、也不是管理表格）', async ({ page }) => {
    await loginAsPlain(page);
    await page.goto('/settings/users', { waitUntil: 'networkidle' });

    // 403 页用 AntD Result：标题「没有权限」，且不出现账号管理页的「新增账号」按钮
    await expect(page.getByText('没有权限').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '新增账号' })).toHaveCount(0);
    // 普通用户的设置子导航里也不该出现「系统管理」这一组
    await expect(page.getByText('系统管理')).toHaveCount(0);
  });

  test('B9 新用户的自定义工作台：数据模块显示空态文案，不是白屏', async ({ page }) => {
    await loginAsPlain(page);
    await page.goto('/workspace', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // 模板默认 4 个模块：今日待办 / 项目进度 / 快捷入口 / 灵感记录
    // 新用户没有任务、没有项目、没写过灵感 → 三个数据模块都应给空态文案
    await expect(page.getByText('今天没有待办')).toBeVisible();
    await expect(page.getByText('还没有进行中的项目')).toBeVisible();
    await expect(page.getByText('还没有灵感')).toBeVisible();

    // 反证：不是整块渲染失败（模块壳标题还在）
    await expect(page.getByText('今日待办').first()).toBeVisible();
  });
});
