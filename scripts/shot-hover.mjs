import { chromium } from '@playwright/test';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true, locale: 'zh-CN', deviceScaleFactor: 2 });
const p = await c.newPage();
await p.goto(`${process.env.SHOT_BASE}/login`, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/用户名|账号/).first().fill('admin');
await p.getByPlaceholder(/密码/).first().fill(process.env.SEED_ADMIN_PASSWORD);
await p.getByRole('button', { name: /登\s*录/ }).click();
await p.waitForTimeout(2200);
await p.goto(`${process.env.SHOT_BASE}/`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2400);

const box = await p.locator('.status-card').boundingBox();
// SVG 圆环只响应描边，hover 中心点打不中 → 直接派发 mouseover（React 会合成 onMouseEnter）
await p.evaluate(() => {
  const el = document.querySelector('[data-seg="doing"]');
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
});
await p.waitForTimeout(450);
await p.screenshot({ path: 'D:/tmp/hover.png', clip: box });
const tip = await p.locator('.ring-tip').count();
console.log(`${tip > 0 ? '✓' : '✗'} tooltip 出现（${tip} 个）`);
await b.close();
