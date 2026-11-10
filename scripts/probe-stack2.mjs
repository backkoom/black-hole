import { chromium } from '@playwright/test';
const f = 'file:///D:/workspace/workbench-app/docs/demo/workbench-demo.html';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
const p = await c.newPage();
await p.goto(f, { waitUntil: 'load' });
await p.waitForTimeout(400);
await p.evaluate(() => { const m = document.querySelector('.main'); m.scrollTop = m.scrollHeight; });
await p.waitForTimeout(300);
const box = await p.locator('.stack-card').boundingBox();
await p.screenshot({ path: 'D:/workspace/workbench-app/docs/demo/preview-stack.png',
  clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 30 } });
console.log('截图 ✓ 含堆叠边缘');
await b.close();
