import { chromium } from '@playwright/test';
const f = 'file:///D:/workspace/workbench-app/docs/demo/workbench-demo.html';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 } });
const p = await c.newPage();
await p.goto(f, { waitUntil: 'load' });
await p.waitForTimeout(500);
console.log(await p.evaluate(() => {
  const risk = document.querySelector('.risk-mini');
  const cs = getComputedStyle(risk);
  return {
    items: risk.querySelectorAll('.rm').length,
    h: Math.round(risk.getBoundingClientRect().height),
    scrollH: risk.scrollHeight,
    maxH: cs.maxHeight, overflow: cs.overflowY, flex: cs.flex,
    bodyScroll: (() => { const b = document.querySelector('.status-body'); return { h: b.clientHeight, sh: b.scrollHeight }; })(),
  };
}));
await b.close();
