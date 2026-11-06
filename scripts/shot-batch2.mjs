import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

/**
 * 批次 2 页面截图 —— 项目看板 / 进度追踪 / 数据统计。
 *
 * 跑法：先 `npm run dev`，再 `node scripts/shot-batch2.mjs`。
 * 造一批演示数据（项目 + 任务，含 created_at 分散以便趋势图有数据），截完清理。
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

// ⚠️ 失败路径也必须清理，否则残留数据会让下次截图的数字翻倍
const taskIds = [];
try {
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

const users = await (await page.request.get('http://localhost:5173/api/users?pageSize=50')).json();
const userIds = (users.data?.items ?? []).map((u) => u.id);

// ---- 项目 ----
const projects = [
  { name: '内容管理系统', owner: '张三', icon: 'folder', color: '#2563eb', phase: '需求分析阶段', dueDate: '2026-11-20' },
  { name: '数据分析平台', owner: '李四', icon: 'bar', color: '#10b981', phase: '产品设计阶段', dueDate: '2026-11-28' },
  { name: '官网升级改版', owner: '王五', icon: 'stack', color: '#8b5cf6', phase: '开发实现阶段', dueDate: '2026-12-05' },
  { name: '运营活动策划', owner: '赵六', icon: 'flag', color: '#f59e0b', phase: '测试上线阶段', dueDate: '2026-12-12' },
];
const projectIds = [];
for (const p of projects) {
  const res = await page.request.post('http://localhost:5173/api/projects', { data: p });
  projectIds.push((await res.json()).data.project.id);
}

// ---- 任务 ----
const titles = [
  '完成产品需求文档初稿', '项目周会准备', '数据报表整理', '功能模块评审', '整理会议纪要',
  '运营活动方案策划', 'UI 设计稿确认', '前后开发联调同步', '测试用例编写', '上线前准备工作',
  '收集用户调研报告', '官网文案撰写', '接口性能压测', '数据迁移脚本', '缺陷回归验证',
  '需求变更评审', '验收标准对齐', '上线公告发布', '客户培训材料', '运维手册更新',
];
const cats = ['产品需求', '会议', '数据分析', '产品设计', '开发', '测试'];
const statuses = ['todo', 'doing', 'done', 'doing', 'todo', 'done', 'todo', 'doing', 'todo', 'todo',
  'done', 'todo', 'doing', 'todo', 'done', 'todo', 'doing', 'todo', 'done', 'todo'];
for (let i = 0; i < titles.length; i += 1) {
  const res = await page.request.post('http://localhost:5173/api/tasks', {
    data: {
      title: titles[i],
      projectId: projectIds[i % projectIds.length],
      priority: ['high', 'medium', 'medium', 'high', 'low', 'low'][i % 6],
      dueDate: `2026-11-${String((i % 12) + 1).padStart(2, '0')}`,
      assigneeId: userIds[i % Math.max(userIds.length, 1)],
      category: cats[i % cats.length],
    },
  });
  const body = await res.json();
  if (body.data?.task?.id) taskIds.push(body.data.task.id);
}
for (let i = 0; i < taskIds.length; i += 1) {
  if (statuses[i] !== 'todo') {
    await page.request.patch(`http://localhost:5173/api/tasks/${taskIds[i]}/status`, {
      data: { status: statuses[i] },
    });
  }
}
// 把 created_at 按 id 模数分散到近 9 天，让趋势图有真实曲线（不是编的）
await pool.query(
  `UPDATE task SET created_at = now() - (((id % 9) || ' days')::interval)
    WHERE id = ANY($1::bigint[])`,
  [taskIds],
);

// ---- 截图 ----
const shots = [
  ['/kanban', '16-项目看板'],
  ['/progress', '17-进度追踪'],
  ['/analytics', '18-数据统计'],
];
for (const [route, name] of shots) {
  await page.goto(`http://localhost:5173${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2400);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`${name} ✓`, page.url());
}

await browser.close();
} finally {
  await pool.query('DELETE FROM task');
  await pool.query('DELETE FROM project');
  await pool.query("UPDATE app_user SET must_change_password = true WHERE account = 'admin'");
  await pool.end();
  console.log('已清理演示数据并恢复 must_change 标记（失败路径也会清）');
  console.log('输出目录:', OUT);
}
