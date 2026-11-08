import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 工作台实拍 + 交互验证（D-31）。
 *
 * 验的事都是老六点名的：
 * 1) 五张时间卡点数字能否下钻（我的工作已删）；
 * 2) 快速添加：输入一条 → 回车 → 今日待办多一条（验完删掉，不留垃圾）；
 * 3) 随记便签：写一张 → 出现在墙上 → 删掉；
 * 4) 今天面板：待办与日程同屏；
 * 5) 数据看板三块有数。
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
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2600);

/* 1) 五张卡 */
const cards = page.locator('.wb-metric-row > div');
const cardCount = await cards.count();
const readings = [];
for (let i = 0; i < cardCount; i += 1) {
  readings.push((await cards.nth(i).innerText()).replace(/\s+/g, ' ').trim());
}
console.log(`卡片 ${cardCount} 张：${readings.join(' | ')}`);

await page.screenshot({ path: join(OUT, '50-工作台-首屏.png') });

/* 2) 快速添加一条任务 */
const beforeTodos = await page.locator('.wb-todo-item').count();
const input = page.locator('input.wb-quickadd-input');
await input.fill('E2E 快速添加验证');
await input.press('Enter');
await page.waitForTimeout(2200);
const afterTodos = await page.locator('.wb-todo-item').count();
console.log(
  `${afterTodos > beforeTodos ? '✓' : '✗'} 快速添加：待办 ${beforeTodos} → ${afterTodos} 条`,
);

/* 3) 便签写一张 */
const notesBefore = await page.locator('.wb-sticky-note').count();
const noteInput = page.locator('.wb-sticky-input textarea');
await noteInput.fill('E2E 便签验证');
await noteInput.press('Enter');
await page.waitForTimeout(2200);
const notesAfter = await page.locator('.wb-sticky-note').count();
console.log(`${notesAfter > notesBefore ? '✓' : '✗'} 便签：${notesBefore} → ${notesAfter} 张`);

/* 4) 今天面板：待办 + 日程同屏 */
const agendaCount = await page.locator('.wb-agenda-item').count();
console.log(`${agendaCount > 0 ? '✓' : '✗'} 今天面板同屏：待办 ${afterTodos} 条 / 日程 ${agendaCount} 场`);

/* 5) 数据看板三块 */
const chartCards = await page.locator('.wb-charts-card').count();
const chartTitles = [];
for (let i = 0; i < chartCards; i += 1) {
  chartTitles.push((await page.locator('.wb-charts-card h4').nth(i).innerText()).trim());
}
const progressRows = await page.locator('.wb-charts-row').count();
const categoryRows = await page.locator('.wb-charts-legend li').count();
const rateText = (await page.locator('.wb-charts-rate b').innerText().catch(() => '')).trim();
console.log(
  `${chartCards === 3 ? '✓' : '✗'} 数据看板 ${chartCards} 块：${chartTitles.join(' / ')}` +
    `（进度 ${progressRows} 行 / 类别 ${categoryRows} 项 / 完成率 ${rateText || '无'}）`,
);

await page.screenshot({ path: join(OUT, '51-工作台-整页.png') });

/* 6) 清理 E2E 造的两条数据（用接口删，避免污染演示数据） */
const tasks = await (await page.request.get(`${BASE}/api/tasks?page=1&pageSize=100&keyword=E2E`)).json();
for (const task of tasks.data?.items ?? []) {
  await page.request.delete(`${BASE}/api/tasks/${task.id}`);
}
const ideas = await (await page.request.get(`${BASE}/api/ideas?page=1&pageSize=100`)).json();
for (const idea of ideas.data?.items ?? []) {
  if (idea.content.includes('E2E')) await page.request.delete(`${BASE}/api/ideas/${idea.id}`);
}
console.log('已清理 E2E 验证数据');

await browser.close();
