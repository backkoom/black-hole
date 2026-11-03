import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

/**
 * Phase 3 页面截图 —— 工作台页 + 工作台模板页。
 *
 * 跑法：先 `npm run dev`，再 `node scripts/shot-phase3.mjs`。
 * 输出：docs/screenshots/
 *
 * 管理接口要 must_change=false 才能访问，脚本会临时清掉 admin 的该标记、跑完恢复。
 * 只允许对开发库（库名含 workbench_dev）执行。
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const env = readFileSync(join(ROOT, '.env'), 'utf8');
const adminPw =
  (/^\s*SEED_ADMIN_PASSWORD\s*=\s*(.*)\s*$/m.exec(env)?.[1] ?? '').replace(/^["']|["']$/g, '');
const databaseUrl = (/^\s*DATABASE_URL\s*=\s*(.*)\s*$/m.exec(env)?.[1] ?? '').trim();

if (!databaseUrl.includes('workbench_dev')) {
  console.error('拒绝执行：DATABASE_URL 不是开发库（workbench_dev）');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
await pool.query("UPDATE app_user SET must_change_password = false WHERE account = 'admin'");

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: 'zh-CN',
});
const page = await ctx.newPage();

await page.request.post('http://localhost:5173/api/auth/login', {
  data: { account: 'admin', password: adminPw },
});

// 1. 工作台页
await page.goto('http://localhost:5173/workspace', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(OUT, '08-工作台页.png') });
console.log('08 工作台页 ✓', page.url());

// 2. 模块库抽屉展开
const libBtn = page.getByRole('button', { name: /模\s*块\s*库/ }).first();
if (await libBtn.count()) {
  await libBtn.click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, '09-模块库抽屉.png') });
  console.log('09 模块库抽屉 ✓');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// 3. 工作台模板页
await page.goto('http://localhost:5173/settings/workspace-template', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(OUT, '10-工作台模板页.png') });
console.log('10 工作台模板页 ✓', page.url());

await browser.close();
await pool.query("UPDATE app_user SET must_change_password = true WHERE account = 'admin'");
await pool.end();
console.log('输出目录:', OUT);
console.log('已恢复 admin 的 must_change 标记');
