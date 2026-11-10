import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
/** 统计视图实拍（D-35）：项目管理的第 6 个 tab，仅管理员可见。 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.SHOT_BASE ?? 'http://localhost:5173';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? '';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1880, height: 1080 }, locale: 'zh-CN', ignoreHTTPSErrors: process.env.SHOT_INSECURE === '1' });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.getByPlaceholder(/用户名|账号/).first().fill('admin');
await page.getByPlaceholder(/密码/).first().fill(PASSWORD);
await page.getByRole('button', { name: /登\s*录/ }).click();
await page.waitForTimeout(2500);

// 老链接 /analytics 应重定向到 ?view=stats
await page.goto(`${BASE}/analytics`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
console.log('老的 /analytics 落地：', page.url().replace(BASE, ''));

const tabs = await page.locator('.wb-project-shell .ant-tabs-tab').allInnerTexts();
console.log('tab：', tabs.map((t) => t.trim()).join(' / '));

const panels = await page.locator('.wb-agg-grid > div h3, .wb-agg-grid h3').allInnerTexts().catch(() => []);
console.log('统计面板：', [...new Set(panels.map((p) => p.trim()))].join(' / ') || '（未取到）');

await page.screenshot({ path: join(OUT, '54-统计视图.png') });
console.log('截图 ✓ 54-统计视图');
await browser.close();
