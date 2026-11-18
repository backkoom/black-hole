import { chromium } from '@playwright/test';
const BASE = process.env.SHOT_BASE;
const PW = process.env.SEED_ADMIN_PASSWORD;
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1880, height: 1080 }, ignoreHTTPSErrors: true, locale: 'zh-CN' });
const p = await c.newPage();
p.on('console', (m) => console.log('[console]', m.text()));
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/用户名|账号/).first().fill('admin');
await p.getByPlaceholder(/密码/).first().fill(PW);
await p.getByRole('button', { name: /登\s*录/ }).click();
await p.waitForTimeout(2000);
await p.goto(`${BASE}/projects?view=progress`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);

const g = p.locator('[data-gantt-bar]').first();
const r = g.locator('rect').first();
const box = await r.boundingBox();
console.log('bar box', JSON.stringify(box));
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
const info = await p.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  const chain = [];
  let cur = el;
  for (let i = 0; i < 5 && cur; i += 1) {
    chain.push(`${cur.tagName}${cur.getAttribute?.('class') ? '.' + cur.getAttribute('class') : ''}${cur.getAttribute?.('data-gantt-bar') ? '[bar=' + cur.getAttribute('data-gantt-bar') + ']' : ''}`);
    cur = cur.parentElement;
  }
  return chain;
}, [cx, cy]);
console.log('elementFromPoint chain:', info.join(' < '));

await p.evaluate(() => {
  window.__ev = [];
  window.addEventListener('pointerdown', (e) => window.__ev.push('down:' + e.target.tagName), true);
  window.addEventListener('pointermove', (e) => { if (window.__ev.length < 40) window.__ev.push('move'); }, true);
  window.addEventListener('pointerup', () => window.__ev.push('up'), true);
});
await p.mouse.move(cx, cy);
await p.mouse.down();
for (let i = 1; i <= 5; i += 1) { await p.mouse.move(cx + i * 12, cy); await p.waitForTimeout(50); }
const mid = await p.evaluate(() => ({ ev: window.__ev.slice(0, 8), moves: window.__ev.filter((x) => x === 'move').length, text: document.body.innerText.includes('天') }));
await p.mouse.up();
await p.waitForTimeout(1200);
console.log('events:', JSON.stringify(mid));
await b.close();
