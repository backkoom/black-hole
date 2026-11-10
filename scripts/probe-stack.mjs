import { chromium } from '@playwright/test';
const f = 'file:///D:/workspace/workbench-app/docs/demo/workbench-demo.html';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 } });
const p = await c.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(f, { waitUntil: 'load' });
await p.waitForTimeout(500);

const tabs = await p.locator('.stack-tab').allInnerTexts();
console.log('堆叠卡标签', tabs.map(t => t.replace(/\s+/g, ' ').trim()).join(' | '));
for (const key of ['projects', 'notes', 'files']) {
  await p.click(`.stack-tab[data-tab="${key}"]`);
  await p.waitForTimeout(220);
  const info = await p.evaluate((k) => {
    const el = document.querySelector(`.stack-panel[data-panel="${k}"]`);
    return { h: el.offsetHeight, items: el.querySelectorAll('.pj,.sticky,.file').length };
  }, key);
  console.log(`${info.h > 0 && info.items > 0 ? '✓' : '✗'} ${key}：高 ${info.h}px，条目 ${info.items}`);
}
// 今天/日程 仍是独立卡
const today = await p.locator('.card h3', { hasText: '今天' }).count();
const agenda = await p.locator('.card h3', { hasText: '日程' }).count();
console.log(`${today && agenda ? '✓' : '✗'} 今天/日程 仍为独立卡片（${today} / ${agenda}）`);

await p.click('.stack-tab[data-tab="projects"]');
await p.evaluate(() => { const m = document.querySelector('.main'); m.scrollTop = m.scrollHeight; });
await p.waitForTimeout(400);
await p.screenshot({ path: 'D:/workspace/workbench-app/docs/demo/preview-1600.png' });
console.log('错误', errs.length ? errs : '无');
await b.close();
