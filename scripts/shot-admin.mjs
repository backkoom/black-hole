import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

/**
 * 管理员端 + 登录/异常页截图 —— 主题统一后复检用。
 *
 * 跑法：先 `npm run dev`，再 `node scripts/shot-admin.mjs`。
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

try {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  // 登录页（未登录状态）
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, '23-登录页.png') });
  console.log('23 登录页 ✓');

  await page.request.post('http://localhost:5173/api/auth/login', {
    data: { account: 'admin', password: adminPw },
  });

  const shots = [
    ['/workspace', '24-工作台页'],
    ['/projects', '25-项目列表页'],
    ['/settings/users', '26-账号管理页'],
    ['/settings/org', '27-组织架构页'],
    ['/settings/workspace-template', '28-工作台模板页'],
    ['/settings/profile', '29-个人资料页'],
  ];
  for (const [route, name] of shots) {
    await page.goto(`http://localhost:5173${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`${name} ✓`);
  }

  await browser.close();
} finally {
  await pool.query("UPDATE app_user SET must_change_password = true WHERE account = 'admin'");
  await pool.end();
  console.log('已恢复 must_change 标记');
}
