import { chromium } from '@playwright/test';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true, locale: 'zh-CN' });
const p = await c.newPage();
const read = (map) => p.evaluate((m) => {
  const out = {};
  for (const [k, [sel, prop]] of Object.entries(m)) {
    const el = document.querySelector(sel);
    out[k] = el ? getComputedStyle(el)[prop] : '×(无此元素)';
  }
  return out;
}, map);

const DEMO_MAP = {
  title: ['.page-head h2', 'fontSize'],
  kpiAreas: ['.kpi-cell', 'gridTemplateAreas'],
  kpiH: ['.kpi-cell', 'height'],
  kpiNum: ['.kpi-cell .line b', 'fontSize'],
  kpiCap: ['.kpi-cell .hint', 'fontSize'],
  menuItem: ['.nav-group a', 'height'],
  menuFont: ['.nav-group a', 'fontSize'],
  menuActiveBg: ['.nav-group a.on', 'backgroundColor'],
  groupTitle: ['.nav-group .gt', 'fontSize'],
  sideCardRadius: ['.side-card', 'borderRadius'],
  cardRadius: ['.card', 'borderRadius'],
  cardShadow: ['.card', 'boxShadow'],
  chipCount: ['.pill', 'height'],
};
await p.goto('file:///D:/workspace/workbench-app/docs/demo/workbench-demo.html', { waitUntil: 'load' });
await p.waitForTimeout(400);
const demo = await read(DEMO_MAP);

const BASE = process.env.SHOT_BASE; const PW = process.env.SEED_ADMIN_PASSWORD;
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/用户名|账号/).first().fill('admin');
await p.getByPlaceholder(/密码/).first().fill(PW);
await p.getByRole('button', { name: /登\s*录/ }).click();
await p.waitForTimeout(2200);
await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2400);

const LIVE_MAP = {
  title: ['.wb-user-title', 'fontSize'],
  kpiAreas: ['.wb-kpi', 'gridTemplateAreas'],
  kpiH: ['.wb-kpi', 'height'],
  kpiNum: ['.wb-kpi-num b', 'fontSize'],
  kpiCap: ['.wb-kpi-cap', 'fontSize'],
  menuItem: ['.ant-menu-item', 'height'],
  menuFont: ['.ant-menu-title-content', 'fontSize'],
  menuActiveBg: ['.ant-menu-item-selected', 'backgroundColor'],
  groupTitle: ['.ant-menu-item-group-title', 'fontSize'],
  sideCardRadius: ['.wb-monthly-card', 'borderRadius'],
  cardRadius: ['.wb-panel-plain', 'borderRadius'],
  cardShadow: ['.wb-panel-plain', 'boxShadow'],
  chipCount: ['.wb-hero-chip', 'height'],
};
const live = await read(LIVE_MAP);
console.log('项              demo                     live');
for (const k of Object.keys(DEMO_MAP)) console.log(`${k.padEnd(14)} ${String(demo[k]).slice(0,22).padEnd(24)} ${live[k]}`);
await b.close();
