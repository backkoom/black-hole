import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 工作台（D-36 定稿版）实拍 + 结构校验。 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.SHOT_BASE ?? 'http://localhost:5173';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? '';
if (!PASSWORD) { console.error('缺少 SEED_ADMIN_PASSWORD'); process.exit(2); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'zh-CN', ignoreHTTPSErrors: process.env.SHOT_INSECURE === '1' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.getByPlaceholder(/用户名|账号/).first().fill('admin');
await page.getByPlaceholder(/密码/).first().fill(PASSWORD);
await page.getByRole('button', { name: /登\s*录/ }).click();
await page.waitForTimeout(2500);
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2600);

const kpi = await page.locator('.wb-kpi-label').allInnerTexts();
const kpiNums = await page.locator('.wb-kpi-num b').allInnerTexts();
console.log(`KPI ${kpi.length} 张：${kpi.map((t) => t.trim()).join(' / ')} → ${kpiNums.join(' / ')}`);

const chips = await page.locator('.wb-hero-chip').allInnerTexts();
console.log('胶囊：', chips.map((t) => t.replace(/\s+/g, ' ').trim()).join(' | '));

const ganttRows = await page.locator('.wb-gantt svg g').count();
const donut = await page.locator('.wb-status-donut svg').count();
const riskRows = await page.locator('.wb-risk-row').count();
console.log(`甘特分组 ${ganttRows} / 环图 ${donut} / 风险 ${riskRows} 条`);

const stackTabs = await page.locator('.wb-stack-tab').allInnerTexts();
console.log('项目栈标签：', stackTabs.map((t) => t.replace(/\s+/g, ' ').trim()).join(' | '));
for (const idx of [0, 1, 2]) {
  await page.locator('.wb-stack-tab').nth(idx).click();
  await page.waitForTimeout(220);
  const n = await page.locator('.wb-stack-body > *').count();
  console.log(`  切换第 ${idx + 1} 页 → 内容块 ${n}`);
}

const rows = await page.locator('.wb-table tbody tr').count();
console.log(`任务表 ${rows} 行`);

await page.screenshot({ path: join(OUT, '55-工作台-定稿.png'), fullPage: false });
await page.evaluate(() => { const c = document.querySelector('.wb-content'); if (c) c.scrollTop = c.scrollHeight; });
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, '56-工作台-定稿-下半.png') });
console.log('错误：', errs.length ? errs.slice(0, 3) : '无');
await browser.close();
