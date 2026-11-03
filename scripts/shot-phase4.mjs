import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

/**
 * Phase 4 页面截图 —— 任务页、项目列表页、项目详情页。
 *
 * 跑法：先 `npm run dev`，再 `node scripts/shot-phase4.mjs`。
 * 输出：docs/screenshots/
 *
 * 会先造一份演示数据（项目 + 4 个任务），截完清理掉。
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

// 造演示数据
const proj = await page.request.post('http://localhost:5173/api/projects', {
  data: { name: 'MES 采集节点改造', owner: '老六', dueDate: '2026-11-30' },
});
const projectId = (await proj.json()).data.project.id;

const tasks = [
  { title: '核对三个采集点的点位图', priority: 'high', status: 'doing' },
  { title: '写点位变更的作业指导书', priority: 'medium', status: 'todo' },
  { title: 'PLC 程序版本回滚演练', priority: 'high', status: 'done' },
  { title: '车间 WiFi 信号复测', priority: 'low', status: 'todo' },
];
const taskIds = [];
for (const t of tasks) {
  const res = await page.request.post('http://localhost:5173/api/tasks', {
    data: { ...t, projectId },
  });
  taskIds.push((await res.json()).data.task.id);
}
await page.request.patch(`http://localhost:5173/api/tasks/${taskIds[2]}/status`, {
  data: { status: 'done' },
});

// 1. 任务页
await page.goto('http://localhost:5173/tasks', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(OUT, '11-任务页.png') });
console.log('11 任务页 ✓', page.url());

// 2. 项目列表页
await page.goto('http://localhost:5173/projects', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(OUT, '12-项目列表页.png') });
console.log('12 项目列表页 ✓', page.url());

// 3. 项目详情页
await page.goto(`http://localhost:5173/projects/${projectId}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(OUT, '13-项目详情页.png') });
console.log('13 项目详情页 ✓', page.url());

await browser.close();

// 清理演示数据 + 恢复标记
await pool.query('DELETE FROM task WHERE id = ANY($1::bigint[])', [taskIds]);
await pool.query('DELETE FROM project WHERE id = $1', [projectId]);
await pool.query("UPDATE app_user SET must_change_password = true WHERE account = 'admin'");
await pool.end();
console.log('已清理演示数据并恢复 must_change 标记');
console.log('输出目录:', OUT);
