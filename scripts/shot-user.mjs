import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

/**
 * 用户端页面截图 —— 项目总览 / 任务清单。
 *
 * 跑法：先 `npm run dev`，再 `node scripts/shot-user.mjs`。
 * 会造一批演示数据（项目 + 任务，带负责人/分类/日期），截完清理。
 * 只允许对开发库（库名含 blackhole_dev）执行。
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

await page.request.post('http://localhost:5173/api/auth/login', {
  data: { account: 'admin', password: adminPw },
});

// ---- 造演示数据 ----
const projects = [
  { name: '内容管理系统', owner: '张三', icon: 'folder', color: '#2563eb', dueDate: '2026-11-20' },
  { name: '数据分析平台', owner: '李四', icon: 'bar', color: '#10b981', dueDate: '2026-11-20' },
  { name: '官网升级改版', owner: '王五', icon: 'stack', color: '#8b5cf6', dueDate: '2026-11-21' },
  { name: '运营活动策划', owner: '赵六', icon: 'flag', color: '#f59e0b', dueDate: '2026-11-25' },
];
const projectIds = [];
for (const p of projects) {
  const res = await page.request.post('http://localhost:5173/api/projects', { data: p });
  const body = await res.json();
  projectIds.push(body.data.project.id);
}

const users = await (await page.request.get('http://localhost:5173/api/users?pageSize=50')).json();
const userIds = (users.data?.items ?? []).map((u) => u.id);

const cats = ['产品需求', '会议', '数据分析', '产品设计', '开发', '测试'];
const titles = [
  '完成产品需求文档初稿',
  '项目周会准备',
  '数据报表整理',
  '功能模块评审',
  '整理会议纪要',
  '运营活动方案策划',
  'UI 设计稿确认',
  '前后开发联调同步',
  '测试用例编写',
  '上线前准备工作',
  '收集用户调研报告',
  '官网文案撰写',
];
const statuses = ['todo', 'doing', 'done', 'doing', 'todo', 'done', 'todo', 'doing', 'todo', 'todo'];
const taskIds = [];
for (let i = 0; i < titles.length; i += 1) {
  const res = await page.request.post('http://localhost:5173/api/tasks', {
    data: {
      title: titles[i],
      projectId: projectIds[i % projectIds.length],
      priority: ['high', 'medium', 'medium', 'high', 'low', 'low'][i % 6],
      dueDate: `2026-11-${String((i % 3) + 1).padStart(2, '0')}`,
      assigneeId: userIds[i % Math.max(userIds.length, 1)],
      category: cats[i % cats.length],
    },
  });
  const body = await res.json();
  if (body.data?.task?.id) taskIds.push(body.data.task.id);
}
// 把已完成的任务状态置上
for (let i = 0; i < taskIds.length; i += 1) {
  if (statuses[i] === 'done' || statuses[i] === 'doing') {
    await page.request.patch(`http://localhost:5173/api/tasks/${taskIds[i]}/status`, {
      data: { status: statuses[i] },
    });
  }
}

// ---- 截图 ----
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.screenshot({ path: join(OUT, '14-项目总览.png') });
console.log('14 项目总览 ✓', page.url());

await page.goto('http://localhost:5173/tasks', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.screenshot({ path: join(OUT, '15-任务清单.png') });
console.log('15 任务清单 ✓', page.url());

await browser.close();

// ---- 清理 ----
await pool.query('DELETE FROM task WHERE id = ANY($1::bigint[])', [taskIds]);
await pool.query('DELETE FROM project WHERE id = ANY($1::bigint[])', [projectIds]);
await pool.query("UPDATE app_user SET must_change_password = true WHERE account = 'admin'");
await pool.end();
console.log('已清理演示数据并恢复 must_change 标记');
console.log('输出目录:', OUT);
