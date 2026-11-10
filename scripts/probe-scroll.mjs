import { chromium } from '@playwright/test';
const f = 'file:///D:/workspace/workbench-app/docs/demo/workbench-demo.html';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 } });
const p = await c.newPage();
await p.goto(f, { waitUntil: 'load' });
await p.waitForTimeout(500);

const state = await p.evaluate(() => [...document.querySelectorAll('.hv-scroll')].map(el => ({
  cls: el.className.split(' ').slice(0, 2).join('.'),
  scrollable: el.scrollHeight > el.clientHeight + 1,
})));
console.log('可滚容器', JSON.stringify(state));

// 滚到底，看下面三个卡
await p.evaluate(() => { const m = document.querySelector('.main'); m.scrollTop = m.scrollHeight; });
await p.waitForTimeout(400);
await p.locator('.proj-card').hover();
await p.waitForTimeout(300);
await p.screenshot({ path: 'D:/workspace/workbench-app/docs/demo/preview-bottom.png' });
console.log('截图 ✓ preview-bottom（滚到底 + hover 在办项目）');
await b.close();
