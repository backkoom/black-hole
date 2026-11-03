import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 1 页面截图 —— 用于人工核对视觉，也是 Phase 5 UI 还原的参照基准。
 *
 * 跑法：先 `npm run dev`（api 3000 + web 5173 都要在跑），再 `node scripts/shot.mjs`。
 * 输出：docs/screenshots/*.png
 *
 * ⚠️ 脚本会走一遍真实登录与改密流程，**会真的改掉 user01 的密码**。
 *    跑完请执行 `npm run seed` 或用同样的 SQL 把 user01 的种子口令还原
 *    （SEED_USER_PASSWORD），否则下次 seed 的幂等判断会被影响。
 *
 * ⚠️ 两个页面坑：
 *    1. AntD 5 给双字中文按钮插空格 → 选择器写 /登\s*录/、/提\s*交/
 *    2. 已登录状态访问 /login 会被直接弹到改密页，登录表单根本不渲染 → 先 clearCookies()
 */

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/,'$1/');
const OUT = join(ROOT, 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const env = readFileSync(join(ROOT, '.env'), 'utf8');
const adminPw =
  (/^\s*SEED_ADMIN_PASSWORD\s*=\s*(.*)\s*$/m.exec(env)?.[1] ?? '').replace(/^["']|["']$/g, '');

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: 'zh-CN',
});
const page = await ctx.newPage();

// 1. 登录页（未登录）
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT, '01-登录页.png') });
console.log('01 登录页 ✓');

// 2. 登录失败提示
await page.getByPlaceholder(/请输入账号/).first().fill('admin');
await page.locator('input[type="password"]').first().fill('Wrong-Pass-1');
await page.getByRole('button', { name: /登\s*录/ }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: join(OUT, '02-登录失败提示.png') });
console.log('02 登录失败提示 ✓');

// 3. 改密页（登录后因 must_change 强制跳转）
await page.getByPlaceholder(/请输入账号/).first().fill('admin');
await page.locator('input[type="password"]').first().fill(adminPw);
await page.getByRole('button', { name: /登\s*录/ }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: join(OUT, '03-修改密码页.png') });
console.log('03 修改密码页 ✓  当前 URL:', page.url());

// 4. 403 页：普通用户改密后访问管理路由
const userPw =
  (/^\s*SEED_USER_PASSWORD\s*=\s*(.*)\s*$/m.exec(env)?.[1] ?? '').replace(/^["']|["']$/g, '');

// 上一步还处于登录态 → 先清会话，否则访问 /login 会被直接弹到改密页，登录表单不渲染
await ctx.clearCookies();

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
await page.getByPlaceholder(/请输入账号/).first().fill('user01');
await page.locator('input[type="password"]').first().fill(userPw);
await page.getByRole('button', { name: /登\s*录/ }).click();
await page.waitForTimeout(1000);

// 普通用户也是 must_change → 先改密
await page.getByPlaceholder(/请输入旧密码/).fill(userPw);
await page.getByPlaceholder(/请输入新密码/).fill('Shot-User-2026');
await page.getByPlaceholder(/请再次输入新密码/).fill('Shot-User-2026');
await page.getByRole('button', { name: /提\s*交/ }).click();
await page.waitForTimeout(1200);

// 普通用户访问管理员路由 → 403
await page.goto('http://localhost:5173/settings/users', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.screenshot({ path: join(OUT, '04-403无权限页.png') });
console.log('04 403 页 ✓  当前 URL:', page.url());

await browser.close();
console.log('输出目录:', OUT);
