import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

/**
 * Phase 2 页面截图 —— 组织架构页 + 账号管理页。
 *
 * 跑法：先 `npm run dev`（api 3000 + web 5173 都要在跑），再 `node scripts/shot-phase2.mjs`。
 * 输出：docs/screenshots/
 *
 * 管理接口要 must_change=false 才能访问，所以脚本会临时清掉 admin 的该标记，
 * **跑完恢复为 true**。为安全起见，只允许对开发库（库名含 blackhole_dev）执行。
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const env = readFileSync(join(ROOT, '.env'), 'utf8');
const adminPw =
  (/^\s*SEED_ADMIN_PASSWORD\s*=\s*(.*)\s*$/m.exec(env)?.[1] ?? '').replace(/^["']|["']$/g, '');
const databaseUrl = (/^\s*DATABASE_URL\s*=\s*(.*)\s*$/m.exec(env)?.[1] ?? '').trim();

if (!databaseUrl.includes('blackhole_dev')) {
  console.error('拒绝执行：DATABASE_URL 不是开发库（blackhole_dev）');
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

// 登录（种子的 admin 需要先改密，这里用 API 直接建会话）
await page.request.post('http://localhost:5173/api/auth/login', {
  data: { account: 'admin', password: adminPw },
});

// 1. 组织架构页
await page.goto('http://localhost:5173/settings/org', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: join(OUT, '05-组织架构页.png') });
console.log('05 组织架构页 ✓', page.url());

// 2. 账号管理页
await page.goto('http://localhost:5173/settings/users', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: join(OUT, '06-账号管理页.png') });
console.log('06 账号管理页 ✓', page.url());

// 3. 批量导入弹窗
const importBtn = page.getByRole('button', { name: /批\s*量\s*导\s*入/ }).first();
if (await importBtn.count()) {
  await importBtn.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, '07-批量导入弹窗.png') });
  console.log('07 批量导入弹窗 ✓');
}

await browser.close();
// 恢复 admin 的强制改密标记
await pool.query("UPDATE app_user SET must_change_password = true WHERE account = 'admin'");
await pool.end();
console.log('输出目录:', OUT);
console.log('已恢复 admin 的 must_change 标记');
