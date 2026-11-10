import { chromium } from '@playwright/test';
const f = 'file:///D:/workspace/workbench-app/docs/demo/workbench-demo.html';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 } });
const p = await c.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(f, { waitUntil: 'load' });
await p.waitForTimeout(500);
const m = await p.evaluate(() => {
  const cell = document.querySelector('.kpi-cell').getBoundingClientRect();
  return { kpiH: Math.round(cell.height), kpiW: Math.round(cell.width) };
});
console.log('KPI 卡', JSON.stringify(m), '| 错误', errs.length ? errs : '无');
await p.screenshot({ path: 'D:/workspace/workbench-app/docs/demo/preview-1600.png' });
await p.setViewportSize({ width: 1920, height: 1080 });
await p.waitForTimeout(300);
await p.screenshot({ path: 'D:/workspace/workbench-app/docs/demo/preview-1920.png' });
await b.close();
