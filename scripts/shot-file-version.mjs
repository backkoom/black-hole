import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 文件版本抽屉实拍（D-27）。
 *
 * 用法：
 *   SHOT_BASE=https://192.168.102.102 SHOT_INSECURE=1 SEED_ADMIN_PASSWORD=xxx \
 *     node scripts/shot-file-version.mjs
 *
 * 会真点一次「更多 → 版本历史」，把抽屉拍下来；不改任何数据。
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.SHOT_BASE ?? 'http://localhost:5173';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? '';
if (!PASSWORD) {
  console.error('缺少 SEED_ADMIN_PASSWORD');
  process.exit(2);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1880, height: 1080 },
  locale: 'zh-CN',
  ignoreHTTPSErrors: process.env.SHOT_INSECURE === '1',
});
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.getByPlaceholder(/用户名|账号/).first().fill('admin');
await page.getByPlaceholder(/密码/).first().fill(PASSWORD);
await page.getByRole('button', { name: /登\s*录/ }).click();
await page.waitForTimeout(2000);

await page.goto(`${BASE}/files`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

const rows = await page.locator('.ant-table-tbody tr.ant-table-row').count();
console.log(`文件行数 ${rows}`);

// 先给第一个文件补一个版本，抽屉里才有东西可看（用真实上传接口，走页面同源会话）
const more = page.locator('.ant-table-tbody tr.ant-table-row').first().getByRole('button').last();
await more.click();
await page.waitForTimeout(600);
// 用 menuitem 定位：抽屉标题也叫「版本历史」，直接 getByText 会撞名
await page.getByRole('menuitem', { name: '版本历史' }).click();
await page.waitForTimeout(1600);

const drawer = await page.locator('.ant-drawer-content').count();
const items = await page.locator('.wb-version-item').count();
console.log(`${drawer > 0 ? '✓' : '✗'} 抽屉已打开，版本条目 ${items} 条`);

await page.screenshot({ path: join(OUT, '43-文件版本历史.png') });
console.log('截图 ✓ 43-文件版本历史');

await browser.close();
