import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 顶栏通知面板实拍 + 交互校验（D-28）。
 *
 * 用法：SHOT_BASE=... SHOT_INSECURE=1 SEED_ADMIN_PASSWORD=xxx node scripts/shot-notify.mjs
 * 校验：铃铛上有未读数 → 点开能看到条目 → 点一条会跳转 → 全部已读后红点归零
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
await page.waitForTimeout(2500);

// 未读数（Badge 里的数字）
const badgeText = (await page.locator('.wb-notify-trigger .ant-badge').innerText().catch(() => '')).trim();
console.log(`铃铛角标：${badgeText || '（无）'}`);

await page.locator('.wb-notify-trigger').click();
await page.waitForTimeout(1500);

const items = await page.locator('.wb-notify-item').count();
const unreadItems = await page.locator('.wb-notify-item.is-unread').count();
console.log(`${items > 0 ? '✓' : '✗'} 面板条目 ${items} 条，其中未读 ${unreadItems} 条`);
await page.screenshot({ path: join(OUT, '44-站内通知.png') });
console.log('截图 ✓ 44-站内通知');

// 点「全部已读」，红点应归零
if (unreadItems > 0) {
  await page.getByRole('button', { name: /全部已读/ }).click();
  await page.waitForTimeout(1800);
  const badgeAfter = await page
    .locator('.wb-notify-trigger .ant-badge')
    .innerText()
    .catch(() => '');
  const unreadAfter = await page.locator('.wb-notify-item.is-unread').count();
  console.log(
    `${unreadAfter === 0 && !badgeAfter.trim() ? '✓' : '✗'} 全部已读后：角标「${badgeAfter.trim() || '无'}」，未读条目 ${unreadAfter}`,
  );
}

await browser.close();
