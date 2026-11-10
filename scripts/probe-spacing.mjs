import { chromium } from '@playwright/test';
const BASE = process.env.SHOT_BASE; const PW = process.env.SEED_ADMIN_PASSWORD;
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1880, height: 1200 }, ignoreHTTPSErrors: true, locale: 'zh-CN' });
const p = await c.newPage();
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/用户名|账号/).first().fill('admin');
await p.getByPlaceholder(/密码/).first().fill(PW);
await p.getByRole('button', { name: /登\s*录/ }).click();
await p.waitForTimeout(2000);
await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);

const data = await p.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height) };
  };
  const blocks = {
    header: pick('.wb-user-head'),
    dashHeading: pick('.wb-dashboard-heading'),
    charts: pick('.wb-charts'),
    metrics: pick('.wb-metric-row'),
    grid: pick('.wb-hb-grid'),
    foot: pick('.wb-page-foot'),
  };
  // 三列网格内每一行第一块的 top，算出行间距
  const cells = [...document.querySelectorAll('.wb-hb-grid > *')].map((el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), title: (el.querySelector('h3')?.textContent || '').trim() };
  });
  const B = blocks;
  const gaps = {
    '页头→看板标题': B.dashHeading && B.header ? B.dashHeading.top - B.header.bottom : null,
    '看板标题→看板': B.charts && B.dashHeading ? B.charts.top - B.dashHeading.bottom : null,
    '看板→四卡': B.metrics && B.charts ? B.metrics.top - B.charts.bottom : null,
    '四卡→网格': B.grid && B.metrics ? B.grid.top - B.metrics.bottom : null,
    '网格→底部动作': B.foot && B.grid ? B.foot.top - B.grid.bottom : null,
  };
  // 网格内行间距
  const rowTops = [...new Set(cells.map((c) => c.top))].sort((a, b) => a - b);
  const rowGaps = rowTops.slice(1).map((t, i) => t - rowTops[i]);
  return { gaps, rowGaps, cells };
});
console.log(JSON.stringify(data, null, 2));
await b.close();
