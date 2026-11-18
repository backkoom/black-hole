import { chromium } from '@playwright/test';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true, locale: 'zh-CN' });
const p = await c.newPage();

const readDemo = () => p.evaluate(() => {
  const g = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
  const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return `${Math.round(b.width)}x${Math.round(b.height)}`; };
  return {
    sider: r('.side'), content: r('.main'),
    title: g('.page-head h2', 'fontSize'), subtitle: g('.page-head p', 'fontSize'),
    kpiCard: r('.kpi-cell'), kpiNum: g('.kpi-cell .line b', 'fontSize'), kpiLabel: g('.kpi-cell .lab', 'fontSize'),
    ganttCard: r('.gantt-card'), bar: g('.gantt-card', 'height'),
    statusCard: r('.status-card'), donut: r('.donut svg'),
    stack: r('.stack-card'), today: r('.card.fixh'),
    cardTitle: g('.card-h h3', 'fontSize'), cardPad: g('.card', 'padding'),
    gap: g('.row', 'gap'),
  };
});

await p.goto('file:///D:/workspace/workbench-app/docs/demo/workbench-demo.html', { waitUntil: 'load' });
await p.waitForTimeout(500);
const demo = await readDemo();

const BASE = process.env.SHOT_BASE; const PW = process.env.SEED_ADMIN_PASSWORD;
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/用户名|账号/).first().fill('admin');
await p.getByPlaceholder(/密码/).first().fill(PW);
await p.getByRole('button', { name: /登\s*录/ }).click();
await p.waitForTimeout(2200);
await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
const live = await p.evaluate(() => {
  const g = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
  const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return `${Math.round(b.width)}x${Math.round(b.height)}`; };
  return {
    sider: r('.wb-sider'), content: r('.wb-content'),
    title: g('.wb-user-title', 'fontSize'), subtitle: g('.wb-user-subtitle', 'fontSize'),
    kpiCard: r('.wb-kpi'), kpiNum: g('.wb-kpi-num b', 'fontSize'), kpiLabel: g('.wb-kpi-label', 'fontSize'),
    ganttCard: r('.wb-gantt'), statusCard: r('.wb-status-body'), donut: r('.wb-status-donut svg'),
    stack: r('.wb-stack'), today: r('.wb-panel-plain'),
    cardTitle: g('.wb-panel-plain-head h3', 'fontSize'), cardPad: g('.wb-kpi', 'padding'),
    gap: g('.wb-grid', 'gap'),
  };
});
console.log('项目        demo          live');
for (const k of Object.keys(demo)) console.log(`${k.padEnd(11)} ${String(demo[k]).padEnd(13)} ${live[k]}`);
await b.close();
