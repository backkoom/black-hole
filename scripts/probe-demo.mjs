import { chromium } from '@playwright/test';
const f = 'file:///D:/workspace/workbench-app/docs/demo/workbench-demo.html';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1.4 });
const p = await c.newPage();
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push(String(e)));
await p.goto(f, { waitUntil: 'load' });
await p.waitForTimeout(600);
const cards = await p.locator('.card, .kpi').count();
const rows = await p.locator('.tbl tbody tr').count();
const svg = await p.evaluate(() => ({
  line: (document.getElementById('linePath')?.getAttribute('d') || '').length,
  points: document.querySelectorAll('#dots circle').length,
}));
console.log('卡片数', cards, '| 表格行', rows, '| 折线长度', svg);
console.log('console 错误', errs.length ? errs : '无');
await p.screenshot({ path: 'D:/workspace/workbench-app/docs/demo/preview-1600.png', fullPage: true });
await p.setViewportSize({ width: 1920, height: 1300 });
await p.waitForTimeout(400);
await p.screenshot({ path: 'D:/workspace/workbench-app/docs/demo/preview-1920.png', fullPage: true });
await b.close();
