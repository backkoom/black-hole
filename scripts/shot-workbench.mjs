import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 工作台实拍 + 交互验证（D-32 版式）。
 *
 * 按老六的规划图逐项验：数据看板在标题下、四张时间卡、今天/任务状态/风险预警、
 * 日程/随记/文件资料；另外真写一条任务、一张便签（验完删掉）。
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

/* 版式：看板在最上 → 四卡 → 六个模块 */
const chartCards = await page.locator('.wb-charts-card').count();
const titles = [];
for (let i = 0; i < chartCards; i += 1) {
  titles.push((await page.locator('.wb-charts-card h4').nth(i).innerText()).trim());
}
const cards = page.locator('.wb-metric-row > div');
const cardCount = await cards.count();
const readings = [];
for (let i = 0; i < cardCount; i += 1) {
  readings.push((await cards.nth(i).innerText()).replace(/\s+/g, ' ').trim());
}
const panelTitles = await page.locator('.wb-hb-4 > section > header > h3').allInnerTexts();
console.log(`${chartCards === 3 ? '✓' : '✗'} 数据看板 ${chartCards} 块：${titles.join(' / ')}`);
console.log(`${cardCount === 4 ? '✓' : '✗'} 时间卡 ${cardCount} 张：${readings.join(' | ')}`);
console.log(`模块：${panelTitles.map((t) => t.trim()).join(' / ') || '（未取到标题）'}`);

/* 「今天」行内添加一条任务 */
const beforeTodos = await page.locator('.wb-todo-item').count();
await page.getByRole('button', { name: /加一条/ }).click();
const inline = page.locator('.wb-inline-add input').first();
await inline.fill('E2E 行内添加验证');
await inline.press('Enter');
await page.waitForTimeout(2200);
const afterTodos = await page.locator('.wb-todo-item').count();
console.log(`${afterTodos > beforeTodos ? '✓' : '✗'} 今天·行内添加：待办 ${beforeTodos} → ${afterTodos} 条`);

/* 随记便签 */
const notesBefore = await page.locator('.wb-sticky-note').count();
const noteInput = page.locator('.wb-sticky-input textarea');
await noteInput.fill('E2E 便签验证');
await noteInput.press('Enter');
await page.waitForTimeout(2000);
const notesAfter = await page.locator('.wb-sticky-note').count();
const newestNote = (await page.locator('.wb-sticky-text').first().innerText().catch(() => '')).trim();
console.log(
  `${newestNote.includes('E2E') ? '✓' : '✗'} 随记便签：墙上有 ${notesBefore} → ${notesAfter} 张，最新一张是「${newestNote}」`,
);

/* 日程 / 文件资料 有没有内容 */
const agenda = await page.locator('.wb-agenda-item').count();
const files = await page.locator('.wb-file-row').count();
const risks = await page.locator('.wb-risk-item').count();
const statusCells = await page.locator('.wb-status-cell').count();
console.log(
  `${agenda > 0 && files > 0 && risks > 0 && statusCells === 4 ? '✓' : '✗'} 模块有数：日程 ${agenda} 场 / 文件 ${files} 个 / 风险 ${risks} 条 / 状态格 ${statusCells} 个`,
);

/* 清理 E2E 数据 */
const tasks = await (await page.request.get(`${BASE}/api/tasks?page=1&pageSize=100&keyword=E2E`)).json();
for (const task of tasks.data?.items ?? []) await page.request.delete(`${BASE}/api/tasks/${task.id}`);
const ideas = await (await page.request.get(`${BASE}/api/ideas?page=1&pageSize=100`)).json();
for (const idea of ideas.data?.items ?? []) {
  if (idea.content.includes('E2E')) await page.request.delete(`${BASE}/api/ideas/${idea.id}`);
}
console.log('已清理 E2E 验证数据');

/* 刷回干净状态再截图（否则会拍到 E2E 临时数据） */
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2600);
await page.screenshot({ path: join(OUT, '52-工作台-首屏.png') });
await page.screenshot({ path: join(OUT, '53-工作台-整页.png') });
console.log('截图 ✓ 52-工作台-首屏 / 53-工作台-整页');

await browser.close();
