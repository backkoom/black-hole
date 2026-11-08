import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 工作台实拍 + 「点数字进页面」穿透校验。
 *
 * 为什么带点击校验：六张卡片是二级/三级目录的唯一入口，
 * 光截图看不出跳转对不对，所以每张卡真点一次，记录落地 URL 与标题。
 *
 * 用法：
 *   SHOT_BASE=https://192.168.102.102 SHOT_INSECURE=1 \
 *   SEED_ADMIN_PASSWORD=xxx node scripts/shot-workbench.mjs
 *   （本地开发库省略 SHOT_BASE，默认 http://localhost:5173）
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.SHOT_BASE ?? 'http://localhost:5173';
const ACCOUNT = process.env.SHOT_ACCOUNT ?? 'admin';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? process.env.DEMO_PASSWORD ?? '';
if (!PASSWORD) {
  console.error('缺少 SEED_ADMIN_PASSWORD / DEMO_PASSWORD');
  process.exit(2);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1880, height: 1080 },
  deviceScaleFactor: 1,
  locale: 'zh-CN',
  ignoreHTTPSErrors: process.env.SHOT_INSECURE === '1',
});
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.getByPlaceholder(/用户名|账号/).first().fill(ACCOUNT);
await page.getByPlaceholder(/密码/).first().fill(PASSWORD);
await page.getByRole('button', { name: /登\s*录/ }).click();
await page.waitForTimeout(2500);
if (!page.url().endsWith('/') && !page.url().match(/\/$/)) {
  console.log('登录后落地:', page.url(), '（若不是工作台，可能被强制改密拦住了）');
}

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2800);

// ---- 六张卡片的读数（前端实际渲染出来的值）----
const labels = ['我的工作', '今日任务', '周工作', '月度工作', '季度工作', '年度工作'];
const cards = page.locator('.wb-metric-row > div');
const cardCount = await cards.count();
const readings = [];
for (let i = 0; i < Math.min(cardCount, labels.length); i += 1) {
  const text = (await cards.nth(i).innerText()).replace(/\s+/g, ' ').trim();
  readings.push(text);
}
console.log(`卡片数 ${cardCount}`);
console.log('读数:', readings.join(' | '));

// ---- 截图 ----
await page.screenshot({ path: join(OUT, '40-工作台-首屏.png') });

// fullPage 抓不到「内层滚动容器」—— 本项目 #root 是 flex 高度链，
// 真正的滚动条在内容容器上。这里量出最长的滚动容器，把视口撑到整页高再拍。
const scrollInfo = await page.evaluate(() => {
  let best = null;
  for (const el of document.querySelectorAll('*')) {
    const diff = el.scrollHeight - el.clientHeight;
    if (diff > 80 && el.clientHeight > 200 && (!best || el.scrollHeight > best.scrollHeight)) {
      best = { scrollHeight: el.scrollHeight, className: String(el.className).slice(0, 60) };
    }
  }
  return {
    innerHeight: window.innerHeight,
    docScrollHeight: document.documentElement.scrollHeight,
    inner: best,
  };
});
if (scrollInfo.inner && scrollInfo.inner.scrollHeight > scrollInfo.innerHeight + 80) {
  await page.setViewportSize({ width: 1880, height: Math.min(scrollInfo.inner.scrollHeight + 130, 4000) });
  await page.waitForTimeout(1200);
}
await page.screenshot({ path: join(OUT, '41-工作台-整页.png') });
await page.setViewportSize({ width: 1880, height: 1080 });
await page.waitForTimeout(600);
console.log(
  `截图 ✓ 40-工作台-首屏 / 41-工作台-整页` +
    `（内层滚动容器高 ${scrollInfo.inner?.scrollHeight ?? 0}px，视口 ${scrollInfo.innerHeight}px）`,
);

// ---- 逐卡点击，记录落地页 ----
// 按序号点，不用 hasText：第一张卡的说明文字含「年度工作规划」，
// 模糊匹配会把「年度工作」那张误伤成第一张（踩过一次）。
const expectations = [
  { index: 0, label: '我的工作', path: '/projects?view=projects', heading: /年度工作规划/ },
  { index: 1, label: '今日任务', path: '/projects?view=tasks', query: 'due=today', heading: /任务/ },
  { index: 2, label: '周工作', path: '/projects?view=progress', heading: /进度/ },
  { index: 3, label: '月度工作', path: '/projects?view=tasks', query: 'due=month', heading: /任务/ },
  { index: 4, label: '季度工作', path: '/projects?view=tasks', query: 'due=quarter', heading: /任务/ },
  { index: 5, label: '年度工作', path: '/projects?view=tasks', query: 'due=year', heading: /任务/ },
];

let pass = 0;
for (const exp of expectations) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const card = page.locator('.wb-metric-row > div').nth(exp.index);
  if ((await card.count()) === 0) {
    console.log(`✗ ${exp.label}: 找不到卡片`);
    continue;
  }
  const cardText = (await card.innerText()).replace(/\s+/g, ' ').trim();
  if (!cardText.startsWith(exp.label)) {
    console.log(`✗ ${exp.label}: 第 ${exp.index} 张卡实际是「${cardText}」`);
    continue;
  }
  await card.click();
  await page.waitForTimeout(1600);
  const url = page.url();
  const hasPath = url.includes(exp.path);
  const hasQuery = exp.query ? url.includes(exp.query) : true;
  const h1 = (await page.locator('h1, .wb-page-title').first().innerText().catch(() => '')).trim();
  const okHeading = exp.heading.test(h1);
  const ok = hasPath && hasQuery && okHeading;
  if (ok) pass += 1;
  console.log(
    `${ok ? '✓' : '✗'} ${exp.label} → ${url.replace(BASE, '')} | 标题「${h1}」` +
      `${hasPath ? '' : ' [路径不符]'}${hasQuery ? '' : ' [缺 due]'}${okHeading ? '' : ' [标题不符]'}`,
  );
}
console.log(`点击穿透 ${pass}/${expectations.length} 通过`);

// ---- 顺带拍一张任务列表（今日筛选）看落地效果 ----
await page.goto(`${BASE}/projects?view=tasks&due=today`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.screenshot({ path: join(OUT, '42-今日任务-落地.png') });
console.log('截图 ✓ 42-今日任务-落地');

// 到期标签必须常显（筛选条上没有对应控件），且能一键清掉并把 ?due= 从 URL 摘掉
const chip = page.locator('.wb-due-chip');
const chipText = (await chip.count()) ? (await chip.innerText()).replace(/\s+/g, ' ').trim() : '';
const rowsBefore = await page.locator('.ant-table-tbody tr.ant-table-row').count();
console.log(`到期标签：「${chipText || '缺失'}」| 表格行数 ${rowsBefore}`);
if ((await chip.count()) === 0) {
  console.log('✗ 到期标签没显示 —— 用户会看不懂为什么只有几行');
} else {
  await page.locator('.wb-due-chip-close').click();
  await page.waitForTimeout(1500);
  const afterUrl = page.url().replace(BASE, '');
  const rowsAfter = await page.locator('.ant-table-tbody tr.ant-table-row').count();
  const stillThere = await page.locator('.wb-due-chip').count();
  console.log(
    `${afterUrl.includes('due=') ? '✗' : '✓'} 清除后 URL ${afterUrl} | 行数 ${rowsBefore}→${rowsAfter} | 标签仍在 ${stillThere > 0}`,
  );
}

await browser.close();
if (pass !== expectations.length) process.exit(1);
