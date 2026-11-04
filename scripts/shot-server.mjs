import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 部署到内网服务器后的实拍截图（从客户端视角访问服务器）。
 *
 * 用法：node scripts/shot-server.mjs
 * 账号：服务器上的验收账号（口令从服务器本地文件读，不经命令行）
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

// ⚠️ 默认用占位地址 —— 公开仓库里不写死任何内网 IP
const BASE = process.argv[2] ?? 'http://localhost:8080';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: 'zh-CN',
});
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(OUT, '30-部署-登录页.png') });
console.log('30 部署登录页 ✓');

console.log('请在终端输入验收账号口令（不回显）：');
process.stdout.write('> ');
const password = await new Promise((resolve) => {
  process.stdin.setEncoding('utf8');
  process.stdin.once('data', (d) => resolve(d.trim()));
});

await page.getByPlaceholder(/用户名|账号/).first().fill('smoke_test');
await page.getByPlaceholder(/密码/).first().fill(password);
await page.getByRole('button', { name: /登\s*录/ }).click();
await page.waitForTimeout(3000);

const shots = [
  ['/', '31-部署-项目总览'],
  ['/kanban', '32-部署-项目看板'],
  ['/tasks', '33-部署-任务清单'],
  ['/calendar', '34-部署-日程安排'],
  ['/analytics', '35-部署-数据统计'],
];
for (const [route, name] of shots) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`${name} ✓`);
}

await browser.close();
console.log('输出目录:', OUT);
