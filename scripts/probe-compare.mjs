import { chromium } from '@playwright/test';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true, locale: 'zh-CN' });
const p = await c.newPage();

await p.goto('file:///D:/workspace/workbench-app/docs/demo/workbench-demo.html', { waitUntil: 'load' });
await p.waitForTimeout(600);
await p.screenshot({ path: 'D:/tmp/cmp-demo.png' });

const BASE = process.env.SHOT_BASE; const PW = process.env.SEED_ADMIN_PASSWORD;
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.getByPlaceholder(/用户名|账号/).first().fill('admin');
await p.getByPlaceholder(/密码/).first().fill(PW);
await p.getByRole('button', { name: /登\s*录/ }).click();
await p.waitForTimeout(2200);
await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2600);
await p.screenshot({ path: 'D:/tmp/cmp-live.png' });
console.log('对照截图 ✓ cmp-demo / cmp-live');
await b.close();
