import { chromium } from '@playwright/test';
const f = 'file:///D:/workspace/workbench-app/docs/demo/workbench-demo.html';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.4 });
const p = await c.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(f, { waitUntil: 'load' });
await p.waitForTimeout(600);
const m = await p.evaluate(() => ({
  kpiCols: getComputedStyle(document.querySelector('.kpi-strip')).gridTemplateColumns.split(' ').length,
  bodyScroll: document.body.scrollHeight > window.innerHeight,
  mainOverflow: getComputedStyle(document.querySelector('.main')).overflowY,
}));
console.log('当前版本状态', JSON.stringify(m));
await p.screenshot({ path: 'D:/workspace/workbench-app/docs/demo/preview-1600.png', fullPage: true });
await p.setViewportSize({ width: 1920, height: 1080 });
await p.waitForTimeout(300);
await p.screenshot({ path: 'D:/workspace/workbench-app/docs/demo/preview-1920.png', fullPage: true });
console.log('截图 ✓ 已回退版本；错误', errs.length ? errs : '无');
await b.close();
