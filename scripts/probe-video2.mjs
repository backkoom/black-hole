import { chromium } from '@playwright/test';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1400, height: 900 } });
const p = await c.newPage();
await p.goto('file:///D:/workspace/workbench-app/docs/demo/_vframe.html');
await p.waitForTimeout(1500);
const info = await p.evaluate(() => { const v = document.getElementById('v'); return { d: v.duration, w: v.videoWidth, h: v.videoHeight, err: v.error?.code ?? null }; });
console.log('video', info);
const times = [0.4, (info.d||4)*0.35, (info.d||4)*0.65, (info.d||4)-0.3];
for (let i = 0; i < times.length; i++) {
  await p.evaluate((t) => new Promise((res) => { const v = document.getElementById('v'); v.currentTime = Math.max(0, Math.min(t, (v.duration||4)-0.1)); v.onseeked = () => res(); }), times[i]);
  await p.waitForTimeout(350);
  await p.screenshot({ path: `D:/tmp/vf-${i}.png` });
}
console.log('frames ok');
await b.close();
