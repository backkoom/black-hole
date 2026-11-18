import { chromium } from '@playwright/test';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true, locale: 'zh-CN' });
const p = await c.newPage();
await p.goto(`${process.env.SHOT_BASE}/login`, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/用户名|账号/).first().fill('admin');
await p.getByPlaceholder(/密码/).first().fill(process.env.SEED_ADMIN_PASSWORD);
await p.getByRole('button', { name: /登\s*录/ }).click();
await p.waitForTimeout(2200);
await p.goto(`${process.env.SHOT_BASE}/`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2400);
console.log(await p.evaluate(() => {
  const svg = document.querySelector('.gantt svg');
  const rects = [...svg.querySelectorAll('rect')].map(r => ({ x: +r.getAttribute('x'), w: +r.getAttribute('width') }));
  const dias = [...svg.querySelectorAll('path[d^="M"]')].map(d => d.getAttribute('d').slice(0, 40));
  return { gw: svg.getAttribute('width'), rects: rects.slice(0, 8), dias };
}));
await b.close();
