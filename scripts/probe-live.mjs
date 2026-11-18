import { chromium } from '@playwright/test';
const BASE = process.env.SHOT_BASE; const PW = process.env.SEED_ADMIN_PASSWORD;
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true, locale: 'zh-CN' });
const p = await c.newPage();
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/用户名|账号/).first().fill('admin');
await p.getByPlaceholder(/密码/).first().fill(PW);
await p.getByRole('button', { name: /登\s*录/ }).click();
await p.waitForTimeout(2200);
await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2600);
console.log(await p.evaluate(() => {
  const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
  const fs = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).fontSize : null; };
  return {
    kpi: r('.wb-kpi'), kpiTitle: fs('.wb-kpi-label'), kpiNum: fs('.wb-kpi-num b'),
    ganttCard: r('.wb-gantt'), statusCard: r('.wb-status-body'),
    todayCard: r('.wb-panel-plain'), stack: r('.wb-stack'),
    cardTitle: fs('.wb-panel-plain-head h3'),
    pageW: Math.round(document.querySelector('.wb-content-inner').getBoundingClientRect().width),
  };
}));
await b.close();
