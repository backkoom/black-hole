import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

/**
 * 用户端 10 页全套截图 —— 对照设计稿验收用。
 *
 * 跑法：先 `npm run dev`，再 `node scripts/shot-user-all.mjs`。
 * 造一整套演示数据（项目/任务/风险/文件/文件夹/会议/里程碑），截完清理。
 * ⚠️ 清理放在 finally —— 失败路径也必须清，否则残留数据会让下次截图数字翻倍。
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
  const taskIds = [];
  for (let i = 0; i < titles.length; i += 1) {
    const res = await page.request.post('http://localhost:5173/api/tasks', {
      data: {
        title: titles[i],
        projectId: projectIds[i % projectIds.length],
        priority: ['high', 'medium', 'medium', 'high', 'low', 'low'][i % 6],
        dueDate: `2026-11-${String((i % 12) + 1).padStart(2, '0')}`,
        assigneeId: userIds[i % Math.max(userIds.length, 1)],
        category: cats[i % cats.length],
        startAt: `2026-11-${String((i % 12) + 1).padStart(2, '0')}T09:00:00+08:00`,
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
  await pool.query(
    `UPDATE task SET created_at = now() - (((id % 9) || ' days')::interval) WHERE id = ANY($1::bigint[])`,
    [taskIds],
  );

  // ---- 风险与问题（覆盖 3×3 矩阵）----
  const levels = ['low', 'medium', 'high'];
  const kinds = ['risk', 'issue'];
  for (const kind of kinds) {
    for (const level of levels) {
      for (const impact of levels) {
        for (const probability of levels) {
          await page.request.post('http://localhost:5173/api/risks', {
            data: {
              title: `${impact === 'high' ? '核心' : impact === 'medium' ? '第三方' : '关键'}交付${kind === 'risk' ? '风险' : '问题'} ${impact}-${probability}`,
              kind,
              level,
              impact,
              probability,
              code: `${kind === 'risk' ? 'R' : 'I'}-${Math.floor(Math.random() * 900 + 100)}`,
              projectId: projectIds[0],
              ownerId: userIds[0],
              dueDate: '2026-11-20',
              responsePlan: '增加开发资源，优化功能实现，按周跟踪进度',
            },
          });
        }
      }
    }
  }

  // ---- 文件夹与文件 ----
  const folderIds = [];
  for (const name of ['项目文档', '产品资料', '设计资源', '研发文档', '会议记录']) {
    const res = await page.request.post('http://localhost:5173/api/folders', {
      data: { name, projectId: projectIds[0] },
    });
    const body = await res.json();
    if (body.data?.folder?.id) folderIds.push(body.data.folder.id);
  }
  const files = [
    ['项目需求文档_v1.2.docx', 'doc', 2400000],
    ['项目进度计划表.xlsx', 'sheet', 1800000],
    ['产品方案汇报.pptx', 'slide', 5600000],
    ['UI设计规范.pdf', 'pdf', 3200000],
    ['产品原型图.png', 'image', 4100000],
    ['数据需求文档.docx', 'doc', 1200000],
    ['接口说明.pdf', 'pdf', 2600000],
    ['测试计划.xlsx', 'sheet', 900000],
    ['活动海报设计.png', 'image', 3500000],
  ];
  for (let i = 0; i < files.length; i += 1) {
    await page.request.post('http://localhost:5173/api/files', {
      data: {
        name: files[i][0],
        kind: files[i][1],
        sizeBytes: files[i][2],
        folderId: folderIds[i % folderIds.length],
        projectId: projectIds[i % projectIds.length],
        version: `v1.${i % 3}`,
      },
    });
  }

  // ---- 会议与里程碑 ----
  for (let i = 0; i < 4; i += 1) {
    const day = String(4 + i).padStart(2, '0');
    await page.request.post('http://localhost:5173/api/meetings', {
      data: {
        title: ['项目周会', '产品需求评审', '数据报表汇报', '设计方案讨论'][i],
        startAt: `2026-11-${day}T${String(9 + i * 2).padStart(2, '0')}:00:00+08:00`,
        endAt: `2026-11-${day}T${String(10 + i * 2).padStart(2, '0')}:00:00+08:00`,
        location: '会议室 A',
        projectId: projectIds[i % projectIds.length],
      },
    });
  }
  for (let i = 0; i < 4; i += 1) {
    await page.request.post('http://localhost:5173/api/milestones', {
      data: {
        name: ['需求分析完成', '产品设计评审', '开发版本发布', '项目正式上线'][i],
        dueDate: `2026-11-${String(5 + i * 5).padStart(2, '0')}`,
        projectId: projectIds[0],
        status: i < 2 ? 'done' : 'pending',
      },
    });
  }

  // ---- 截图 ----
  const shots = [
    ['/', '14-项目总览'],
    ['/kanban', '16-项目看板'],
    ['/tasks', '15-任务清单'],
    ['/calendar', '19-日程安排'],
    ['/progress', '17-进度追踪'],
    ['/team', '20-团队协作'],
    ['/files', '21-文件资料'],
    ['/risks', '22-风险问题管理'],
    ['/analytics', '18-数据统计'],
  ];
  for (const [route, name] of shots) {
    await page.goto(`http://localhost:5173${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2400);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`${name} ✓`);
  }

  await browser.close();
} finally {
  await pool.query('DELETE FROM task');
  await pool.query('DELETE FROM project');
  await pool.query('DELETE FROM risk');
  await pool.query('DELETE FROM file_asset');
  await pool.query('DELETE FROM file_folder');
  await pool.query('DELETE FROM meeting');
  await pool.query('DELETE FROM milestone');
  await pool.query("UPDATE app_user SET must_change_password = true WHERE account = 'admin'");
  await pool.end();
  console.log('已清理演示数据并恢复 must_change 标记');
  console.log('输出目录:', OUT);
}
