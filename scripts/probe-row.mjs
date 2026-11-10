import { chromium } from '@playwright/test';
const f = 'file:///D:/workspace/workbench-app/docs/demo/workbench-demo.html';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 } });
const p = await c.newPage();
await p.goto(f, { waitUntil: 'load' });
await p.waitForTimeout(500);
// 找到包含「今天」的那一行，按 x 排序输出
console.log(await p.evaluate(() => {
  const cards = [...document.querySelectorAll('.card.fixh, .stack-card')].map(el => {
    const r = el.getBoundingClientRect();
    const title = el.querySelector('h3')?.textContent || (el.classList.contains('stack-card') ? '堆叠卡' : '?');
    return { title: title.trim(), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height),
      scrollable: el.querySelector('.stack-body,.list')?.scrollHeight > el.querySelector('.stack-body,.list')?.clientHeight + 1 };
  });
  return cards.sort((a, b) => a.x - b.x);
}));
await p.evaluate(() => { const m = document.querySelector('.main'); m.scrollTop = m.scrollHeight; });
await p.waitForTimeout(300);
await p.screenshot({ path: 'D:/workspace/workbench-app/docs/demo/preview-row.png' });
await b.close();
