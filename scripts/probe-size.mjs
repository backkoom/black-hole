import { chromium } from '@playwright/test';
const f = 'file:///D:/workspace/workbench-app/docs/demo/workbench-demo.html';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 } });
const p = await c.newPage();
await p.goto(f, { waitUntil: 'load' });
await p.waitForTimeout(500);
console.log(await p.evaluate(() => {
  const g = document.querySelector('.gantt');
  const body = document.querySelector('.status-body');
  const risk = document.querySelector('.risk-mini');
  const m = (n, el) => ({ n, h: Math.round(el.getBoundingClientRect().height), scrollable: el.scrollHeight > el.clientHeight + 1 });
  return [m('gantt', g), m('statusBody', body), m('risk', risk),
    { n: 'ganttCard', h: Math.round(document.querySelector('.gantt-card').getBoundingClientRect().height) }];
}));
await b.close();
