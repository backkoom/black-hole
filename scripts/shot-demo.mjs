import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 演示数据实景截图 —— 团队协作 / 甘特图 / 有数据的各页。
 *
 * ⚠️ 输出到**仓库外**（D:/workspace/inspect-out）：截图里是演示数据，
 *    但仍不进版本库更稳妥。
 *
 * 用法：
 *   unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
 *   export NO_PROXY="192.168.0.0/16,127.0.0.1,localhost"
 *   SMOKE_PW=<口令> node scripts/shot-demo.mjs http://192.168.102.102
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.env.INSPECT_OUT ?? join(ROOT, '..', 'inspect-out');
mkdirSync(OUT, { recursive: true });

const BASE = process.argv[2] ?? 'http://192.168.102.102';
const ACCOUNT = process.argv[3] ?? 'smoke_test';
const PW = process.env.SMOKE_PW ?? '';
if (!PW) {
  console.error('需要 SMOKE_PW 环境变量');
  process.exit(1);
}

const PAGES = [
  ['/', 'demo-01-项目总览'],
  ['/kanban', 'demo-02-项目看板'],
  ['/progress', 'demo-03-进度追踪'],
  ['/team', 'demo-04-团队协作'],
  ['/tasks', 'demo-05-任务清单'],
  ['/calendar', 'demo-06-日程安排'],
  ['/risks', 'demo-07-风险问题'],
  ['/files', 'demo-08-文件资料'],
  ['/analytics', 'demo-09-数据统计'],
  ['/settings/profile', 'demo-10-个人资料'],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
});
const page = await ctx.newPage();

const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`${page.url().replace(BASE, '')} → ${m.text().slice(0, 160)}`);
});
page.on('pageerror', (e) => problems.push(`${page.url().replace(BASE, '')} → PAGEERROR ${String(e).slice(0, 160)}`));
page.on('response', (r) => {
  if (r.status() >= 400 && r.url().includes('/api/')) {
    problems.push(`${page.url().replace(BASE, '')} → HTTP${r.status()} ${r.url().replace(BASE, '')}`);
  }
});

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.getByPlaceholder(/用户名|账号/).first().fill(ACCOUNT);
await page.getByPlaceholder(/密码/).first().fill(PW);
await page.getByRole('button', { name: /登\s*录/ }).click();
await page.waitForTimeout(3000);
if (page.url().includes('/login')) {
  console.error('✗ 登录失败');
  await browser.close();
  process.exit(1);
}
console.log(`登录成功 → ${page.url()}`);

for (const [route, name] of PAGES) {
  const before = problems.length;
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  const text = await page.locator('body').innerText();
  console.log(`[${name}] ${route}  文本 ${text.length} 字  新增问题 ${problems.length - before}`);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

console.log('\n================ 问题汇总 ================');
const real = problems.filter(
  (p) =>
    !p.includes('/api/auth/me') &&
    !p.includes('/api/users') &&
    !p.includes('/api/org/tree'),
);
if (real.length === 0) {
  console.log('  ✓ 无控制台错误 / 无失败请求（已豁免未登录 401 与普通用户 403）');
} else {
  for (const p of [...new Set(real)]) console.log(`  x ${p}`);
  console.log(`  合计 ${real.length} 条`);
}

await browser.close();
console.log('输出目录:', OUT);
