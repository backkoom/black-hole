import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 布局体检 —— 逐页检查自适应与对齐问题。
 *
 * 检查项：
 *   1. 页面级横向溢出（scrollWidth > clientWidth）
 *   2. 滚动条数量（页面 + 内容区，出现两条就是双滚动条）
 *   3. 指标卡是否被切（卡片右边界超出内容区）
 *   4. 同排面板底部是否平齐
 *   5. 面板内固定列的行是否对齐（如团队成员的角色/组织列）
 *
 * 用法：
 *   SMOKE_PW=<口令> node scripts/check-layout.mjs http://192.168.102.102 admin
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, '..', 'inspect-out');
mkdirSync(OUT, { recursive: true });

const BASE = process.argv[2] ?? 'http://192.168.102.102';
const ACCOUNT = process.argv[3] ?? 'admin';
const PW = process.env.SMOKE_PW ?? '';
if (!PW) {
  console.error('需要 SMOKE_PW 环境变量');
  process.exit(1);
}

const PAGES = [
  '/', '/kanban', '/tasks', '/calendar', '/progress',
  '/team', '/files', '/risks', '/analytics', '/settings/profile',
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.getByPlaceholder(/用户名|账号/).first().fill(ACCOUNT);
await page.getByPlaceholder(/密码/).first().fill(PW);
await page.getByRole('button', { name: /登\s*录/ }).click();
await page.waitForTimeout(3000);
if (page.url().includes('/login')) {
  console.error('✗ 登录失败');
  await browser.close();
  process.exit(1);
}

let total = 0;
// 表头宽度必须与下面的 padEnd 完全一致，否则整张表的可视位置会错位
console.log(
  '路由'.padEnd(20) +
  '无溢出'.padEnd(9) +
  '单滚动'.padEnd(8) +
  '无切卡'.padEnd(8) +
  '栏底齐'.padEnd(8) +
  '行对齐',
);
console.log('─'.repeat(74));

for (const route of PAGES) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);

  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const pageOverflow = doc.scrollWidth > doc.clientWidth + 1;

    // 统计可滚动的竖向容器（排除元素自身可滚但高度未被撑开的情况）
    const scrollers = [...document.querySelectorAll('*')].filter((el) => {
      const st = getComputedStyle(el);
      if (!(st.overflowY === 'auto' || st.overflowY === 'scroll')) return false;
      return el.scrollHeight > el.clientHeight + 2;
    }).length;

    // 指标卡是否被切：卡片的右边界超出内容区右边界
    const content = document.querySelector('.wb-content');
    const cards = [...document.querySelectorAll('.wb-metric-row > *, .wb-metric-grid > *')];
    let cardClipped = 0;
    if (content && cards.length) {
      const cr = content.getBoundingClientRect();
      for (const c of cards) {
        const b = c.getBoundingClientRect();
        if (b.right > cr.right + 1) cardClipped += 1;
      }
    }

    // 同排两栏底部是否平齐：取 .wb-grid-left/.wb-team-8 等成对容器
    const pairs = [
      ['.wb-grid-left', '.wb-grid-right'],
      ['.wb-team-8', '.wb-team-4'],
    ];
    let colsAligned = true;
    for (const [a, b] of pairs) {
      const ea = document.querySelector(a);
      const eb = document.querySelector(b);
      if (!ea || !eb) continue;
      const ra = ea.getBoundingClientRect();
      const rb = eb.getBoundingClientRect();
      // 允许 2px 误差
      if (Math.abs(ra.bottom - rb.bottom) > 2) colsAligned = false;
    }

    // 行内固定列对齐：取所有 .wb-team-row 的第 3、4 列左边距，比对是否一致
    const rows = [...document.querySelectorAll('.wb-team-row')];
    let rowAligned = true;
    if (rows.length > 1) {
      const xs = rows.map((el) => {
        const kids = [...el.children].map((c) => c.getBoundingClientRect().left);
        return kids.slice(2).map((x) => Math.round(x)).join(',');
      });
      rowAligned = new Set(xs).size === 1;
    }

    return { pageOverflow, scrollers, cardClipped, colsAligned, rowAligned, cards: cards.length };
  });

  const issues = [];
  if (r.pageOverflow) issues.push('页面横向溢出');
  if (r.scrollers > 1) issues.push(`双滚动条(${r.scrollers})`);
  if (r.cardClipped > 0) issues.push(`${r.cardClipped} 张卡片被切`);
  if (!r.colsAligned) issues.push('两栏底部不齐');
  if (!r.rowAligned) issues.push('行内列未对齐');
  total += issues.length;

  // ⚠️ 用 ASCII 标记：✓/✗ 是东亚歧义宽度字符，终端按 2 列渲染，
  // 会把整张表的可视位置推歪（我因此误判过两次）。
  // 统一语义：**OK = 没问题**。下面每个检查项都转成「true = 有问题」。
  const ok = (hasProblem) => (hasProblem ? 'NO' : 'OK');
  console.log(
    route.padEnd(20) +
      ok(r.pageOverflow).padEnd(9) +
      ok(r.scrollers > 1).padEnd(8) +
      ok(r.cardClipped > 0).padEnd(8) +
      ok(!r.colsAligned).padEnd(8) +
      ok(!r.rowAligned),
  );
  if (issues.length) console.log('   ↳ ' + issues.join(' / '));
}

console.log('─'.repeat(74));
console.log(total === 0 ? '全部页面通过' : `共 ${total} 处待修`);

await browser.close();
