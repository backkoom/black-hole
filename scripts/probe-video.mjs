import { chromium } from '@playwright/test';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await c.newPage();
await p.goto('file:///D:/workspace/workbench-app/docs/demo/_frame.html');
await p.waitForTimeout(1200);
const info = await p.evaluate(() => { const v = document.getElementById('v'); return { d: v.duration, w: v.videoWidth, h: v.videoHeight, err: v.error?.code ?? null }; });
console.log('video', info);
for (const t of [0.5, 2.5, 4.5, 6.5]) {
  await p.evaluate((time) => new Promise((res) => { const v = document.getElementById('v'); v.currentTime = Math.min(time, (v.duration || 8) - 0.2); v.onseeked = () => res(); }), t);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `D:/tmp/frame-${t}.png` });
}
console.log('frames saved');
await b.close();
