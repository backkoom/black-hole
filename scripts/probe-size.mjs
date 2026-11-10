import { chromium } from '@playwright/test';
const f = 'file:///D:/workspace/workbench-app/docs/demo/workbench-demo.html';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 } });
const p = await c.newPage();
await p.goto(f, { waitUntil: 'load' });
await p.waitForTimeout(500);
console.log(await p.evaluate(() => {
  const box = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().height);
  const risk = document.querySelector('.risk-mini');
  return {
    ganttCard: box('.gantt-card'),
    statusCard: box('.status-card'),
    chart: box('.gantt'),
    donut: box('.donut svg'),
    riskH: box('.risk-mini'),
    riskScrollable: risk.scrollHeight > risk.clientHeight + 1,
  };
}));
await b.close();
