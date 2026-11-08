import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 甘特图拖拽改期实拍 + 真实验证（D-29）。
 *
 * 做法：真按住条形拖 60px → 松手 → 调接口读回日期 → 比对是否按天数平移 →
 *      再拖回原处（还原演示数据），最后截图。
 *
 * 用法：SHOT_BASE=https://192.168.102.102 SHOT_INSECURE=1 SEED_ADMIN_PASSWORD=xxx
 *        node scripts/shot-gantt-drag.mjs
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.SHOT_BASE ?? 'http://localhost:5173';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? '';
if (!PASSWORD) {
  console.error('缺少 SEED_ADMIN_PASSWORD');
  process.exit(2);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1880, height: 1080 },
  locale: 'zh-CN',
  ignoreHTTPSErrors: process.env.SHOT_INSECURE === '1',
});
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.getByPlaceholder(/用户名|账号/).first().fill('admin');
await page.getByPlaceholder(/密码/).first().fill(PASSWORD);
await page.getByRole('button', { name: /登\s*录/ }).click();
await page.waitForTimeout(2500);

await page.goto(`${BASE}/projects?view=progress`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const bars = page.locator('[data-gantt-bar]');
const barCount = await bars.count();
console.log(`甘特条数量 ${barCount}`);

if (barCount === 0) {
  console.error('✗ 没有可拖拽的条');
  await browser.close();
  process.exit(1);
}

const first = bars.first();
const projectId = Number(await first.getAttribute('data-gantt-bar'));
const readProject = async () => {
  const res = await page.request.get(`${BASE}/api/projects?page=1&pageSize=100`);
  const body = await res.json();
  return (body.data?.items ?? []).find((p) => p.id === projectId);
};

const before = await readProject();
console.log(`项目 #${projectId}「${before.name}」改期前：${before.startDate} → ${before.dueDate}`);

// 拖整条：向右 60px
const barRect = await first.locator('rect').first().boundingBox();
if (!barRect) {
  console.error('✗ 拿不到条形位置');
  await browser.close();
  process.exit(1);
}
// 从条身 25% 处起拖：中心常压着里程碑菱形（polygon 会截走 pointerdown）
const cx = barRect.x + barRect.width * 0.6;
const cy = barRect.y + barRect.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
for (let step = 1; step <= 6; step += 1) {
  await page.mouse.move(cx + step * 10, cy);
  await page.waitForTimeout(60);
}
await page.screenshot({ path: join(OUT, '45-甘特拖拽中.png') });
await page.mouse.up();
await page.waitForTimeout(2000);

const after = await readProject();
console.log(`改期后：${after.startDate} → ${after.dueDate}`);

const daysBetween = (a, b) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
const shift = daysBetween(before.startDate, after.startDate);
const dueShift = daysBetween(before.dueDate, after.dueDate);
const durationSame =
  daysBetween(before.startDate, before.dueDate) === daysBetween(after.startDate, after.dueDate);
console.log(
  `${shift > 0 && shift === dueShift && durationSame ? '✓' : '✗'} 平移 ${shift} 天，截止同步 ${dueShift} 天，工期不变 ${durationSame}`,
);

await page.screenshot({ path: join(OUT, '46-甘特改期后.png') });
console.log('截图 ✓ 45-甘特拖拽中 / 46-甘特改期后');

// 还原：把日期写回原值（别把演示数据改坏）
if (shift !== 0) {
  const res = await page.request.put(`${BASE}/api/projects/${projectId}`, {
    data: { startDate: before.startDate, dueDate: before.dueDate },
  });
  const restored = await readProject();
  console.log(
    `${res.status() === 200 && restored.startDate === before.startDate ? '✓' : '✗'} 已还原为 ${restored.startDate} → ${restored.dueDate}`,
  );
}

// ---- 边缘拉伸：拖右端手柄 → 只改截止日 ----
// 先刷新页面：上一步用 API 还原过日期，React Query 缓存里还是拖后的值，
// 不刷新的话手柄位置与数据对不上（脚本会误判成"拉伸无效"）。
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
const beforeEdge = await readProject();
const handle = first.locator('rect').nth(2); // 第 3 个 rect = 右端手柄
const hb = await handle.boundingBox();
if (hb) {
  const hx = hb.x + hb.width / 2;
  const hy = hb.y + hb.height / 2;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  for (let step = 1; step <= 4; step += 1) {
    await page.mouse.move(hx + step * 12, hy);
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  await page.waitForTimeout(1800);
  const afterEdge = await readProject();
  const dueMoved = daysBetween(beforeEdge.dueDate, afterEdge.dueDate);
  const startSame = beforeEdge.startDate === afterEdge.startDate;
  console.log(
    `${dueMoved > 0 && startSame ? '✓' : '✗'} 右端拉伸：${beforeEdge.dueDate} → ${afterEdge.dueDate}（+${dueMoved} 天），开始日不变 ${startSame}`,
  );
  await page.request.put(`${BASE}/api/projects/${projectId}`, {
    data: { startDate: beforeEdge.startDate, dueDate: beforeEdge.dueDate },
  });
  console.log('已还原');
}

await browser.close();
