import { chromium } from '@playwright/test';
const f = 'file:///D:/workspace/workbench-app/docs/demo/workbench-demo.html';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 } });
const p = await c.newPage();
await p.goto(f, { waitUntil: 'load' });
await p.waitForTimeout(600);
console.log(await p.evaluate(() => {
  const r = sel => Math.round(document.querySelector(sel).getBoundingClientRect().height);
  const sc = sel => { const el = document.querySelector(sel); return el.scrollHeight > el.clientHeight + 1; };
  return {
    ganttCard: r('.gantt-card'), statusCard: r('.status-card'),
    chart: r('.gantt'), chartScroll: sc('.gantt'),
    donut: r('.donut svg'), riskH: r('.risk-mini'), riskScroll: sc('.risk-mini'),
    statusBodyOver: (() => { const b = document.querySelector('.status-body'); return b ? b.scrollHeight - b.clientHeight : null; })(),
  };
}));
await p.screenshot({ path: 'D:/workspace/workbench-app/docs/demo/preview-1600.png' });
await b.close();
