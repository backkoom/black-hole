import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 布局体检 v2 —— 只用「用户能看见的事实」判断，不靠类名假设。
 *
 * 检查项（每页每视口）：
 *   1. 文档级纵向滚动：documentElement.scrollHeight > innerHeight（= 外层滚动条）
 *   2. 内容区滚动 + 文档滚动同时存在（= 双滚动条）
 *   3. 任何元素自身横向溢出（scrollWidth > clientWidth + 1，且 overflow 非 visible）
 *   4. 指标卡换行分组，以及卡片最小宽度是否被压破（< 150px 就是挤）
 *   5. 右侧是否有被视口裁掉的内容（元素 right > innerWidth）
 *   6. 文本被省略号截断的数量（scrollWidth > clientWidth 且 overflow hidden）
 *
 * 用法：
 *   SMOKE_PW=<口令> node scripts/probe-layout.mjs http://192.168.102.102 admin
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.env.INSPECT_OUT ?? join(ROOT, '..', 'inspect-out');
mkdirSync(OUT, { recursive: true });

const BASE = process.argv[2] ?? 'http://192.168.102.102';
const ACCOUNT = process.argv[3] ?? 'admin';
const PW = process.env.SMOKE_PW ?? '';
if (!PW) {
  console.error('需要 SMOKE_PW 环境变量');
  process.exit(1);
}

// 页面用 | 分隔（Git Bash 会把逗号分隔的 POSIX 路径当路径列表改写）
const PAGES = (process.env.PROBE_PAGES ?? '|team|files|risks')
  .split('|')
  .map((s) => s.trim())
  .map((s) => (s.startsWith('/') ? s : `/${s}`));
const VIEWPORTS = (process.env.PROBE_VP ?? '1920x1080,1600x900,1440x900,1366x768,1280x720')
  .split(',')
  .map((s) => {
    const [w, h] = s.split('x').map(Number);
    return { width: w, height: h };
  });

const browser = await chromium.launch();
// 现网是自签证书，探针要忽略证书错误，否则 goto 直接失败
const ctx = await browser.newContext({ viewport: VIEWPORTS[0], locale: 'zh-CN', ignoreHTTPSErrors: true });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.getByPlaceholder(/用户名|账号/).first().fill(ACCOUNT);
await page.getByPlaceholder(/密码/).first().fill(PW);
await page.getByRole('button', { name: /登\s*录/ }).click();
await page.waitForTimeout(2500);
if (page.url().includes('/login')) {
  console.error('登录失败');
  await browser.close();
  process.exit(1);
}

const probe = () => {
  const de = document.documentElement;
  const docScroll = de.scrollHeight - de.clientHeight;
  const content = document.querySelector('.wb-content');
  const contentScroll = content ? content.scrollHeight - content.clientHeight : 0;

  // 横向溢出：元素自身可滚且内容更宽
  // 排除 AntD Progress 内部结构 —— 它的 .ant-progress-bg 带一层"光标"元素，
  // scrollWidth 天生大于自身宽度（视觉上完全正常），算进来会一直误报。
  const hOverflow = [...document.querySelectorAll('.wb-content *')]
    .filter((el) => !el.closest('.ant-progress'))
    // 甘特时间轴、AntD 标签栏是**按设计可横向滚动**的容器（时间跨度/标签数不定）
    .filter((el) => !el.closest('.wb-gantt-chart') && !el.classList.contains('ant-tabs-nav-wrap'))
    // 省略号元素天生 scrollWidth > clientWidth（这正是它的实现方式），
    // 真正的缺陷是"该换行/该收缩却没处理"，所以在这里排除掉
    .filter((el) => getComputedStyle(el).textOverflow !== 'ellipsis')
    .filter((el) => el.scrollWidth > el.clientWidth + 1)
    .filter((el) => {
      const st = getComputedStyle(el);
      return st.overflowX === 'hidden' || st.overflowX === 'auto' || st.overflowX === 'scroll';
    })
    .map((el) => {
      const st = getComputedStyle(el);
      return {
        cls: (el.className || el.tagName).toString().slice(0, 42),
        sw: el.scrollWidth,
        cw: el.clientWidth,
        ox: st.overflowX,
        text: (el.textContent ?? '').trim().slice(0, 18),
      };
    })
    .slice(0, 8);

  // 超出视口右边界的内容
  const offRight = [...document.querySelectorAll('.wb-content *')]
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
    .map((el) => ({
      cls: (el.className || el.tagName).toString().slice(0, 40),
      right: Math.round(el.getBoundingClientRect().right),
    }))
    .slice(0, 6);

  // 指标卡：按 top 分组 = 行
  const cards = [...document.querySelectorAll('.wb-metric-row > *, .wb-metric-grid > *')];
  const rows = new Map();
  for (const c of cards) {
    const b = c.getBoundingClientRect();
    const key = Math.round(b.top);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(Math.round(b.width));
  }
  const cardRows = [...rows.entries()].map(([top, ws]) => ({ top, n: ws.length, w: ws[0], min: Math.min(...ws) }));

  // 文本截断
  // 只报"被切了却看不到全文"的：有 title（悬停能看到全文）不算缺陷
  const truncated = [...document.querySelectorAll('.wb-content *')]
    .filter((el) => {
      const st = getComputedStyle(el);
      if (st.textOverflow !== 'ellipsis' || el.children.length > 0) return false;
      if (el.scrollWidth <= el.clientWidth + 1) return false;
      return !el.getAttribute('title');
    })
    .map((el) => (el.textContent ?? '').trim().slice(0, 18))
    .slice(0, 6);

  // 同排面板底边是否齐平：按 top 分行，比较同一行各 section 的 bottom
  // 排除看板列：那是同一块看板里的泳道，高度天然不同，不是页面级面板
  const secs = [...document.querySelectorAll('.wb-content section')]
    .filter((el) => !el.closest('.wb-kanban-cols'))
    .map((el) => {
    const b = el.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left) };
  });
  const rowsByTop = new Map();
  for (const s of secs) {
    if (!rowsByTop.has(s.top)) rowsByTop.set(s.top, []);
    rowsByTop.get(s.top).push(s);
  }
  const ragged = [];
  for (const [top, list] of rowsByTop) {
    if (list.length < 2) continue;
    const bottoms = list.map((x) => x.bottom);
    const spread = Math.max(...bottoms) - Math.min(...bottoms);
    if (spread > 2) ragged.push({ top, spread });
  }

  // 指标卡与下方面板之间的实际间距（0 = 卡片贴着面板，视觉上像压上去）
  const mrEl = document.querySelector('.wb-metric-row, .wb-metric-grid');
  let metricGap = null;
  if (mrEl) {
    const mb = mrEl.getBoundingClientRect().bottom;
    const nextTop = [...document.querySelectorAll('.wb-content section')]
      .map((e) => e.getBoundingClientRect().top)
      .filter((t) => t >= mb - 1)
      .sort((a, b) => a - b)[0];
    if (nextTop != null) metricGap = Math.round(nextTop - mb);
  }

  return {
    vw: window.innerWidth,
    vh: window.innerHeight,
    docScroll,
    contentScroll: Math.round(contentScroll),
    hOverflow,
    offRight,
    cardRows,
    truncated,
    ragged,
    metricGap,
  };
};

const lines = [];
for (const vp of VIEWPORTS) {
  await page.setViewportSize(vp);
  for (const route of PAGES) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(probe);
    const issues = [];
    if (r.docScroll > 0) issues.push(`文档纵向溢出 ${r.docScroll}px`);
    if (r.docScroll > 0 && r.contentScroll > 0) issues.push('双滚动条');
    if (r.hOverflow.length) issues.push(`横向溢出 ${r.hOverflow.length} 处`);
    if (r.offRight.length) issues.push(`超出视口 ${r.offRight.length} 处`);
    const cramped = r.cardRows.filter((x) => x.min < 150);
    if (cramped.length) issues.push(`指标卡被压到 ${cramped.map((x) => x.min).join('/')}px`);
    if (r.truncated.length) issues.push(`文本截断 ${r.truncated.length} 处`);
    if (r.ragged.length) issues.push(`同排底边参差 ${r.ragged.length} 行`);
    if (r.metricGap !== null && r.metricGap < 12) issues.push(`指标卡贴着下方面板(${r.metricGap}px)`);

    const tag = `${vp.width}x${vp.height}`.padEnd(10) + route.padEnd(10);
    lines.push(
      `${tag} ${issues.length ? 'NO ' : 'OK '} ${issues.join(' / ') || '-'}  | 卡行=${r.cardRows
        .map((x) => `${x.n}×${x.w}`)
        .join('+')} 文档溢出=${r.docScroll} 内容溢出=${r.contentScroll}`,
    );
    if (r.hOverflow.length) {
      lines.push('    ↳ 横向溢出: ' + r.hOverflow.map((h) => `${h.cls}(${h.sw}>${h.cw})`).join(', '));
    }
    if (r.offRight.length) {
      lines.push('    ↳ 超出视口: ' + r.offRight.map((h) => `${h.cls}@${h.right}`).join(', '));
    }
    if (r.truncated.length) lines.push('    ↳ 截断: ' + r.truncated.join(' | '));
    if (r.ragged.length) {
      lines.push('    ↳ 底边参差: ' + r.ragged.map((x) => `top${x.top} 差${x.spread}px`).join(', '));
    }

    if (process.env.PROBE_SHOT === '1') {
      const name = `probe-${vp.width}${route.replace(/\W+/g, '_') || '_'}`;
      await page.screenshot({ path: join(OUT, `${name}.png`) });
    }
  }
}

console.log(lines.join('\n'));
await browser.close();
