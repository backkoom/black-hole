import { chromium } from '@playwright/test';
const f = 'file:///D:/workspace/workbench-app/docs/demo/workbench-demo.html';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 } });
const p = await c.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(f, { waitUntil: 'load' });
await p.waitForTimeout(500);

const tabs = await p.locator('.stack-tab').allInnerTexts();
console.log('标签', tabs.map(t => t.replace(/\s+/g, ' ').trim()).join(' | '));
for (const key of ['today', 'agenda', 'projects', 'notes', 'files']) {
  await p.click(`.stack-tab[data-tab="${key}"]`);
  await p.waitForTimeout(220);
  const info = await p.evaluate((k) => {
    const el = document.querySelector(`.stack-panel[data-panel="${k}"]`);
    const items = el.querySelectorAll('.li,.ev,.pj,.sticky,.file').length;
    return { h: el.offsetHeight, items };
  }, key);
  console.log(`${info.h > 0 && info.items > 0 ? '✓' : '✗'} ${key}：高 ${info.h}px，条目 ${info.items}`);
}

// 滚到堆叠卡并截图（默认停在今天）
await p.click('.stack-tab[data-tab="today"]');
await p.evaluate(() => { const m = document.querySelector('.main'); m.scrollTop = m.scrollHeight; });
await p.waitForTimeout(400);
await p.locator('.stack-card').screenshot({ path: 'D:/workspace/workbench-app/docs/demo/preview-stack.png' });
console.log('截图 ✓ preview-stack；错误', errs.length ? errs : '无');
await b.close();
