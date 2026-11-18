import { chromium } from '@playwright/test';
const BASE = process.env.SHOT_BASE; const PW = process.env.SEED_ADMIN_PASSWORD;
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1880, height: 1080 }, ignoreHTTPSErrors: true, locale: 'zh-CN' });
const p = await c.newPage();
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/用户名|账号/).first().fill('admin');
await p.getByPlaceholder(/密码/).first().fill(PW);
await p.getByRole('button', { name: /登\s*录/ }).click();
await p.waitForTimeout(2000);
await p.goto(`${BASE}/projects?view=progress`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
const g = p.locator('[data-gantt-bar]').first();
const rects = g.locator('rect');
console.log('rect count', await rects.count());
for (let i = 0; i < await rects.count(); i += 1) {
  const el = rects.nth(i);
  console.log(i, 'x=', await el.getAttribute('x'), 'w=', await el.getAttribute('width'), 'box=', JSON.stringify(await el.boundingBox()));
}
const box = await rects.first().boundingBox();
for (const ratio of [0.1, 0.25, 0.5, 0.9]) {
  const x = box.x + box.width * ratio;
  const y = box.y + box.height / 2;
  const info = await p.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    if (!el) return 'null';
    return `${el.tagName} x=${el.getAttribute?.('x')} w=${el.getAttribute?.('width')}`;
  }, [x, y]);
  console.log(`ratio ${ratio} →`, info);
}
await b.close();
