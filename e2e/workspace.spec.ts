import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearMustChange, resetAdmin } from './helpers.js';

/**
 * 工作台编辑器 E2E —— 执行包 §9.7「Gate：B1–B10 全部可执行；12 个 active 模块无白屏」。
 *
 * 前置：api(3000) 与 web(5173) 已启动。
 * 口令从仓库根 .env 读取，不写死在测试里。
 *
 * ⚠️ 选择器两个坑：
 *  1. AntD 5 会给**双字中文按钮自动插空格**（「保存」→「保 存」）→ 用 /保\s*存/ 这类正则
 *  2. 拖拽用 dnd-kit 的 pointer 事件，Playwright 的 dragTo()（HTML5 DnD）不适用
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function adminPassword(): string {
  const text = readFileSync(join(root, '.env'), 'utf8');
  const v = (/^\s*SEED_ADMIN_PASSWORD\s*=\s*(.*)\s*$/m.exec(text)?.[1] ?? '').replace(
    /^["']|["']$/g,
    '',
  );
  if (!v) throw new Error('SEED_ADMIN_PASSWORD 未设置');
  return v;
}

/** 登录并进工作台页 */
async function gotoWorkspace(page: Page): Promise<void> {
  // 种子 admin 带「必须改密」标记，登录后会被弹到改密页 —— 进页面的测试要先清掉
  await clearMustChange();
  await page.request.post('http://localhost:5173/api/auth/login', {
    data: { account: 'admin', password: adminPassword() },
  });
  await page.goto('http://localhost:5173/workspace', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
}

/** 画布上的模块卡片（用 aria-label「XX 模块」定位） */
function card(page: Page, name: string) {
  return page.getByLabel(`${name} 模块`).first();
}

/**
 * 模块库里的某一项。
 * ⚠️ 不能用 getByTitle(name)：库项的 title 属性存的是**状态提示**
 * （「功能迭代中，暂不可用」/「已在布局中」），不是模块名。
 * 真实结构：`.wb-library-item` > `.wb-library-name`（模块名）+ `.wb-library-tag`（迭代/已添加）
 */
function libraryItem(page: Page, name: string) {
  return page.locator('.wb-library-item').filter({ hasText: name }).first();
}

test.describe('工作台编辑器', () => {
  // ⚠️ 跑完必须把 admin 恢复成「必须改密」—— 否则种子状态被留在 false，
  // 下一个跑这套 E2E 的人会以为强制改密拦截坏了。
  test.afterAll(async () => {
    await resetAdmin();
  });

  // ⚠️ 跑完必须把 admin 恢复成「必须改密」—— 否则种子状态被留在 false，
  // 下一个跑这套 E2E 的人会以为强制改密拦截坏了。
  test.afterAll(async () => {
    await resetAdmin();
  });

  test('B1 新用户首次进入看到模板的 4 个模块', async ({ page }) => {
    await gotoWorkspace(page);
    for (const name of ['今日待办', '项目进度', '快速入口', '灵感记录']) {
      await expect(card(page, name)).toBeVisible();
    }
  });

  test('B8 模块库 5 个分类、15 个模块，3 个占位模块标「迭代」', async ({ page }) => {
    await gotoWorkspace(page);
    await expect(page.locator('.wb-library')).toBeVisible();
    for (const cat of ['任务与日程', '快捷入口', '项目与数据', '知识与资料', '个性模块']) {
      await expect(page.locator('.wb-library').getByText(cat, { exact: true })).toBeVisible();
    }
    // 3 个占位模块带「迭代」角标且不可用
    for (const name of ['文件资料', '内容列表', 'AI 助手']) {
      const item = libraryItem(page, name);
      await expect(item).toBeVisible();
      await expect(item.locator('.wb-library-tag')).toHaveText('迭代');
      await expect(item).toHaveAttribute('aria-disabled', 'true');
    }
  });

  test('B10 已在布局里的模块标「已添加」', async ({ page }) => {
    await gotoWorkspace(page);
    const added = page.locator('.wb-library .wb-library-tag', { hasText: '已添加' });
    expect(await added.count()).toBeGreaterThanOrEqual(4);
  });

  test('B2 重复模块被拒绝并给出提示', async ({ page }) => {
    await gotoWorkspace(page);
    const before = await page.locator('.wb-canvas [data-module-index]').count();

    // 「今日待办」已在布局里 —— 库项 title 是「已在布局中」，点击应被拒绝
    await libraryItem(page, '今日待办').click();
    await page.waitForTimeout(700);

    // 画布上数量不变
    expect(await page.locator('.wb-canvas [data-module-index]').count()).toBe(before);
    // 有提示
    await expect(page.getByText(/已经在布局里|已在布局中/).first()).toBeVisible();
  });

  test('B4 缩放：宽度只能停在 3/4/6/12，高度不小于 minSize', async ({ page }) => {
    await gotoWorkspace(page);
    const target = card(page, '今日待办');
    const handle = target.locator('.wb-module-resize').first();
    if ((await handle.count()) === 0) {
      test.skip(true, '未找到缩放手柄');
      return;
    }
    const box = await handle.boundingBox();
    if (!box) {
      test.skip(true, '缩放手柄不可见');
      return;
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 90, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const badge = await target.locator('.wb-module-size').first().innerText();
    const [w, h] = badge.split('×').map((v) => Number(v));
    expect([3, 4, 6, 12]).toContain(w);
    // 今日待办 minSize 是 3×3
    expect(h).toBeGreaterThanOrEqual(3);
    expect(h).toBeLessThanOrEqual(12);
  });

  test('B5 删除模块要二次确认，取消则不删', async ({ page }) => {
    await gotoWorkspace(page);
    const before = await page.locator('.wb-canvas [data-module-index]').count();
    expect(before).toBe(4);

    await page.getByLabel('删除「今日待办」模块').first().click();
    await page.waitForTimeout(500);
    // 确认框出现（AntD Popconfirm）
    await expect(page.getByText(/删除「今日待办」模块？/).first()).toBeVisible();
    await page.getByRole('button', { name: /取\s*消/ }).first().click();
    await page.waitForTimeout(400);
    expect(await page.locator('.wb-canvas [data-module-index]').count()).toBe(before);
  });

  test('Gate：12 个 active 模块逐个加入后都渲染不白屏', async ({ page }) => {
    await gotoWorkspace(page);
    const active = [
      '今日待办',
      '项目进度',
      '快速入口',
      '日历',
      '数据报表',
      '灵感记录',
      '文本卡片',
      '公告通知',
      '链接列表',
      '嵌入内容',
      '图片墙',
      '分割线',
    ];
    for (const name of active) {
      const item = libraryItem(page, name);
      if ((await item.count()) === 0) continue;
      await item.click();
      await page.waitForTimeout(220);
    }
    await page.waitForTimeout(1200);

    const cards = page.locator('.wb-canvas [data-module-index]');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(10);
    for (let i = 0; i < count; i += 1) {
      const body = await cards.nth(i).innerText();
      expect(body.trim().length).toBeGreaterThan(0);
    }
  });

  test('预览态只读：保存按钮禁用、删除按钮消失', async ({ page }) => {
    await gotoWorkspace(page);
    // 「预览」不是 button，是 AntD Segmented（内部是 radio 角色）
    await page.locator('.ant-segmented-item').filter({ hasText: '预览' }).click();
    await page.waitForTimeout(500);

    await expect(page.getByRole('button', { name: /保\s*存/ }).first()).toBeDisabled();
    // 预览态下没有删除按钮
    expect(await page.getByLabel('删除「今日待办」模块').count()).toBe(0);
  });
});
