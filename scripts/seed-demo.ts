/**
 * 演示数据播种 —— 让界面「有数据可看」。
 *
 * 用法：
 *   # 本地开发库
 *   npm run seed:demo
 *   # 服务器（生产库，慎用）
 *   DEMO_BASE=http://192.168.102.102 npm run seed:demo
 *
 * 特点：
 * - **幂等**：先清掉上一轮 demo 数据（按统一前缀 `演示`/`DEMO-`）再重建
 * - **走真实 API**（不是直接写库）→ progress / 统计等派生数据由后端真实算出
 * - 数据之间有故事：3 个项目跨 2026-09 ~ 2027-02，任务分阶段、有子任务、
 *   带里程碑（甘特图的菱形）、有会议、风险、文件、公告、讨论、审批
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// ⚠️ 变量名统一用 DEMO_BASE（之前用 BASE 传值不生效，连到了默认地址）
const BASE = process.env.DEMO_BASE ?? 'http://127.0.0.1:3000';
const ACCOUNT = process.env.DEMO_ACCOUNT ?? 'admin';

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const text = readFileSync(join(root, '.env'), 'utf8');
    for (const line of text.split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      const k = m?.[1];
      if (k) out[k] = (m?.[2] ?? '').replace(/^["']|["']$/g, '');
    }
  } catch {
    /* 用进程环境变量 */
  }
  // ⚠️ 进程环境变量**优先于** .env 文件 —— 否则命令行传的 DEMO_PASSWORD / SEED_ADMIN_PASSWORD
  // 会被 .env 里的旧种子口令覆盖（账号改密后就登不上了）
  return { ...out, ...process.env } as Record<string, string>;
}

const PASSWORD = readEnv().SEED_ADMIN_PASSWORD ?? readEnv().DEMO_PASSWORD;
if (!PASSWORD) {
  console.error('缺少 SEED_ADMIN_PASSWORD（或 DEMO_PASSWORD）环境变量');
  process.exit(1);
}

let cookie = '';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE,
      Cookie: cookie,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${res.status}`;
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${msg}`);
  }
  return body as T;
}

interface Created {
  id: number;
}

const created = {
  projects: [] as number[],
  tasks: [] as number[],
  milestones: [] as number[],
  meetings: [] as number[],
  risks: [] as number[],
  folders: [] as number[],
  files: [] as number[],
  announcements: [] as number[],
  discussions: [] as number[],
  approvals: [] as number[],
};

async function main(): Promise<void> {
  console.log(`==> 登录 ${BASE} （账号 ${ACCOUNT}）`);
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ account: ACCOUNT, password: PASSWORD }),
  });
  if (!loginRes.ok) {
    console.error('登录失败：', await loginRes.text());
    process.exit(1);
  }
  cookie = loginRes.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const me = await call<{ data: { user: { id: number; name: string } } }>('/api/auth/me');
  console.log(`    登录成功：${me.data.user.name}（id=${me.data.user.id}）`);

  const usersRes = await call<{ data: { items: Array<{ id: number; name: string; role: string }> } }>(
    '/api/users?pageSize=50',
  );
  // 审批的指派人用**真正的管理员**（可能是另一个账号）——
  // 否则「待我审批」在管理员本人登录时会是空的
  const adminUser = usersRes.data.items.find((u) => u.role === 'admin');
  const adminId = adminUser?.id ?? me.data.user.id;
  console.log(`    审批指派给：${adminUser?.name ?? me.data.user.name}（id=${adminId}）`);

  // 拿普通用户当「团队成员」
  const members = usersRes.data.items.filter((u) => u.id !== adminId);
  const m1 = members[0]?.id ?? adminId;
  const m2 = members[1]?.id ?? adminId;
  const m3 = members[2]?.id ?? adminId;

  // ---- 先清上一轮 ----
  console.log('==> 清理上一轮演示数据');
  await clearDemo();

  // ---- 项目 ----
  console.log('==> 建项目');
  const projectDefs = [
    { name: '演示·企业数据中台', owner: '张伟', icon: 'bar', color: '#2563eb', phase: '开发实现阶段', dueDate: '2027-02-26' },
    { name: '演示·客户运营门户', owner: '李娜', icon: 'stack', color: '#10b981', phase: '产品设计阶段', dueDate: '2026-12-18' },
    { name: '演示·移动端适配改造', owner: '王强', icon: 'folder', color: '#8b5cf6', phase: '需求分析阶段', dueDate: '2026-11-27' },
  ];
  for (const p of projectDefs) {
    const r = await call<{ data: { project: Created } }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(p),
    });
    created.projects.push(r.data.project.id);
    console.log(`    ${p.name}（${p.phase}，截止 ${p.dueDate}）`);
  }
  const [p1, p2, p3] = created.projects;

  // ---- 任务（含子任务、提醒、起止时间）----
  console.log('==> 建任务');
  const taskDefs: Array<{
    title: string;
    project: number;
    status: 'todo' | 'doing' | 'done';
    priority: 'low' | 'medium' | 'high';
    category: string;
    assignee: number;
    dueDate: string;
    startAt?: string;
    reminderAt?: string;
    parent?: number;
  }> = [
    // 项目一：已过大半
    { title: '数据中台需求调研与访谈', project: p1, status: 'done', priority: 'high', category: '产品需求', assignee: m1, dueDate: '2026-09-25', startAt: '2026-09-01T09:00:00+08:00' },
    { title: '数据模型与指标口径设计', project: p1, status: 'done', priority: 'high', category: '产品设计', assignee: m2, dueDate: '2026-10-18', startAt: '2026-09-28T09:00:00+08:00' },
    { title: '数据采集任务开发', project: p1, status: 'done', priority: 'medium', category: '开发', assignee: m3, dueDate: '2026-11-15', startAt: '2026-10-20T09:00:00+08:00' },
    { title: '指标计算引擎开发', project: p1, status: 'doing', priority: 'high', category: '开发', assignee: m1, dueDate: '2026-12-20', startAt: '2026-11-03T09:00:00+08:00' },
    { title: '数据权限与脱敏模块', project: p1, status: 'doing', priority: 'high', category: '开发', assignee: m2, dueDate: '2027-01-10', startAt: '2026-11-18T09:00:00+08:00', reminderAt: '2026-11-18T09:00:00+08:00' },
    { title: '可视化报表设计', project: p1, status: 'todo', priority: 'medium', category: '产品设计', assignee: m3, dueDate: '2027-01-25', startAt: '2026-12-05T09:00:00+08:00' },
    { title: '数据中台联调与压测', project: p1, status: 'todo', priority: 'high', category: '测试', assignee: m1, dueDate: '2027-02-10', startAt: '2027-01-28T09:00:00+08:00' },
    { title: '数据中台验收上线', project: p1, status: 'todo', priority: 'high', category: '测试', assignee: m2, dueDate: '2027-02-26', startAt: '2027-02-12T09:00:00+08:00' },

    // 项目二：进行中
    { title: '客户门户竞品分析', project: p2, status: 'done', priority: 'medium', category: '数据分析', assignee: m2, dueDate: '2026-10-30', startAt: '2026-10-12T09:00:00+08:00' },
    { title: '门户信息架构梳理', project: p2, status: 'done', priority: 'medium', category: '产品需求', assignee: m3, dueDate: '2026-11-12', startAt: '2026-11-02T09:00:00+08:00' },
    { title: '门户交互原型设计', project: p2, status: 'doing', priority: 'high', category: '产品设计', assignee: m1, dueDate: '2026-11-28', startAt: '2026-11-14T09:00:00+08:00' },
    { title: '客户账号体系开发', project: p2, status: 'doing', priority: 'high', category: '开发', assignee: m2, dueDate: '2026-12-10', startAt: '2026-11-22T09:00:00+08:00' },
    { title: '运营活动位配置', project: p2, status: 'todo', priority: 'low', category: '开发', assignee: m3, dueDate: '2026-12-18', startAt: '2026-12-02T09:00:00+08:00' },

    // 项目三：刚起步
    { title: '移动端现状调研', project: p3, status: 'done', priority: 'medium', category: '数据分析', assignee: m3, dueDate: '2026-10-24', startAt: '2026-10-08T09:00:00+08:00' },
    { title: '适配技术方案选型', project: p3, status: 'doing', priority: 'high', category: '产品需求', assignee: m1, dueDate: '2026-11-20', startAt: '2026-10-27T09:00:00+08:00', reminderAt: '2026-11-05T09:00:00+08:00' },
    { title: '兼容性测试方案', project: p3, status: 'todo', priority: 'medium', category: '测试', assignee: m2, dueDate: '2026-11-27', startAt: '2026-11-10T09:00:00+08:00' },
  ];
  for (const t of taskDefs) {
    const r = await call<{ data: { task: Created } }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: t.title,
        projectId: t.project,
        priority: t.priority,
        category: t.category,
        assigneeId: t.assignee,
        dueDate: t.dueDate,
        startAt: t.startAt,
        reminderAt: t.reminderAt,
        parentId: t.parent,
      }),
    });
    created.tasks.push(r.data.task.id);
    if (t.status !== 'todo') {
      await call(`/api/tasks/${r.data.task.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: t.status }),
      });
    }
  }
  console.log(`    ${created.tasks.length} 个任务`);

  // 子任务（演示层级与子任务计数）
  const child = await call<{ data: { task: Created } }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: '指标口径评审',
      projectId: p1,
      priority: 'medium',
      category: '会议',
      assigneeId: m2,
      dueDate: '2026-10-16',
      parentId: created.tasks[1],
    }),
  });
  created.tasks.push(child.data.task.id);

  // ---- 里程碑（甘特图菱形）----
  console.log('==> 建里程碑');
  const milestones = [
    { name: '需求评审通过', dueDate: '2026-10-10', status: 'done', projectId: p1 },
    { name: '数据模型定稿', dueDate: '2026-11-08', status: 'done', projectId: p1 },
    { name: '一期上线', dueDate: '2026-12-28', status: 'pending', projectId: p1 },
    { name: '原型评审', dueDate: '2026-11-22', status: 'pending', projectId: p2 },
    { name: '技术方案确认', dueDate: '2026-11-15', status: 'pending', projectId: p3 },
  ];
  for (const m of milestones) {
    const r = await call<{ data: { milestone: Created } }>('/api/milestones', {
      method: 'POST',
      body: JSON.stringify(m),
    });
    created.milestones.push(r.data.milestone.id);
  }
  console.log(`    ${created.milestones.length} 个里程碑`);

  // ---- 会议 ----
  console.log('==> 建会议');
  const meetings = [
    { title: '数据中台周例会', startAt: '2026-11-05T10:00:00+08:00', endAt: '2026-11-05T11:00:00+08:00', location: '大会议室', projectId: p1 },
    { title: '客户门户需求澄清', startAt: '2026-11-06T14:00:00+08:00', endAt: '2026-11-06T15:30:00+08:00', location: '小会议室', projectId: p2 },
    { title: '移动端选型评审', startAt: '2026-11-07T09:30:00+08:00', endAt: '2026-11-07T10:30:00+08:00', location: '线上会议', projectId: p3 },
  ];
  for (const mt of meetings) {
    const r = await call<{ data: { meeting: Created } }>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(mt),
    });
    created.meetings.push(r.data.meeting.id);
  }
  console.log(`    ${created.meetings.length} 个会议`);

  // ---- 风险与问题 ----
  console.log('==> 建风险与问题');
  const risks = [
    { title: '历史数据质量不齐，指标口径反复', kind: 'risk', level: 'high', impact: 'high', probability: 'medium', status: 'handling', projectId: p1, ownerId: m1, dueDate: '2026-11-20', responsePlan: '先出核心 20 个指标，全量口径二期再对齐' },
    { title: '第三方采集接口限流', kind: 'risk', level: 'medium', impact: 'medium', probability: 'high', status: 'open', projectId: p1, ownerId: m3, dueDate: '2026-12-05', responsePlan: '加本地缓存 + 退避重试' },
    { title: '移动端老版本兼容问题多', kind: 'issue', level: 'high', impact: 'high', probability: 'high', status: 'open', projectId: p3, ownerId: m2, dueDate: '2026-11-25', responsePlan: '按机型分批适配，优先覆盖 TOP 机型' },
    { title: '设计资源交付延期', kind: 'issue', level: 'low', impact: 'medium', probability: 'low', status: 'resolved', projectId: p2, ownerId: m3, responsePlan: '已改为按模块分批交付' },
  ];
  for (const rk of risks) {
    const r = await call<{ data: { risk: Created } }>('/api/risks', {
      method: 'POST',
      body: JSON.stringify(rk),
    });
    created.risks.push(r.data.risk.id);
  }
  console.log(`    ${created.risks.length} 条风险与问题`);

  // ---- 文件与文件夹 ----
  console.log('==> 建文件与文件夹');
  const folders = ['需求文档', '设计资源', '会议纪要', '测试报告'];
  for (const name of folders) {
    const r = await call<{ data: { folder: Created } }>('/api/folders', {
      method: 'POST',
      body: JSON.stringify({ name: `演示·${name}`, projectId: p1 }),
    });
    created.folders.push(r.data.folder.id);
  }
  const files = [
    ['演示·数据中台需求规格说明书.docx', 'doc', 2_400_000],
    ['演示·指标口径字典.xlsx', 'sheet', 860_000],
    ['演示·门户交互原型.pdf', 'pdf', 5_100_000],
    ['演示·数据模型ER图.png', 'image', 1_800_000],
    ['演示·周会纪要.docx', 'doc', 320_000],
    ['演示·性能测试报告.pdf', 'pdf', 3_600_000],
  ];
  for (let i = 0; i < files.length; i += 1) {
    const r = await call<{ data: { file: Created } }>('/api/files', {
      method: 'POST',
      body: JSON.stringify({
        name: files[i][0],
        kind: files[i][1],
        sizeBytes: files[i][2],
        folderId: created.folders[i % created.folders.length],
        projectId: p1,
        version: `v1.${i % 3}`,
      }),
    });
    created.files.push(r.data.file.id);
  }
  console.log(`    ${created.folders.length} 个文件夹 / ${created.files.length} 个文件`);

  // ---- 公告 ----
  console.log('==> 建团队公告');
  const announcements = [
    { title: '【置顶】数据中台一期上线定于 12 月 28 日', content: '请各项目组在 12 月 20 日前完成自测并提交验收材料，逾期视为放弃本期。', pinned: true, projectId: p1 },
    { title: '本周值班安排', content: '周一至周五每天 18:00 前更新当日风险与阻塞项。', pinned: false, projectId: null },
    { title: '指标口径变更通知', content: '「活跃用户」口径由次日活跃调整为 7 日内活跃，12 月起生效，请各报表同步。', pinned: false, projectId: p1 },
    { title: '移动端适配排期确认', content: '适配范围收敛为 TOP 20 机型，其余机型保留旧版。', pinned: false, projectId: p3 },
  ];
  for (const a of announcements) {
    const r = await call<{ data: { announcement: Created } }>('/api/announcements', {
      method: 'POST',
      body: JSON.stringify(a),
    });
    created.announcements.push(r.data.announcement.id);
  }
  console.log(`    ${created.announcements.length} 条公告`);

  // ---- 讨论（顶层 + 回复）----
  console.log('==> 建讨论');
  const d1 = await call<{ data: { discussion: Created } }>('/api/discussions', {
    method: 'POST',
    body: JSON.stringify({
      targetType: 'task',
      targetId: created.tasks[3],
      content: '指标计算引擎的实时与离线口径是否需要分开配置？',
    }),
  });
  await call('/api/discussions', {
    method: 'POST',
    body: JSON.stringify({
      targetType: 'task',
      targetId: created.tasks[3],
      parentId: d1.data.discussion.id,
      content: '建议分开，离线口径可以后补，先保证实时链路能跑通。',
    }),
  });
  await call('/api/discussions', {
    method: 'POST',
    body: JSON.stringify({
      targetType: 'task',
      targetId: created.tasks[3],
      parentId: d1.data.discussion.id,
      content: '同意，先实时后离线，本期不做离线。',
    }),
  });
  await call('/api/discussions', {
    method: 'POST',
    body: JSON.stringify({
      targetType: 'project',
      targetId: p2,
      content: '门户的权限模型要不要复用中台的？',
    }),
  });
  const d3 = await call<{ data: { discussion: Created } }>('/api/discussions', {
    method: 'POST',
    body: JSON.stringify({
      targetType: 'task',
      targetId: created.tasks[10],
      content: '客户门户的账号体系要支持单点登录吗？',
    }),
  });
  created.discussions.push(d1.data.discussion.id, d3.data.discussion.id);

  // ---- 审批 ----
  console.log('==> 建审批');
  const approvals = [
    { kind: '变更申请', title: '数据中台一期上线延期至 12 月 28 日', detail: '因第三方采集接口联调延迟，申请延期一周。', assigneeId: adminId, status: 'pending' },
    { kind: '预算申请', title: '客户门户视觉外包采购', detail: '预计 3.2 万元，用于交互稿细化与动效设计。', assigneeId: adminId, status: 'pending' },
    { kind: '资源申请', title: '移动端适配申请 2 名前端', detail: '适配工作量集中在本月，需要临时增援。', assigneeId: adminId, status: 'pending' },
    { kind: '变更申请', title: '指标口径调整申请', detail: '活跃用户口径由次日改为 7 日。', assigneeId: adminId, status: 'approved', comment: '同意，请同步更新报表与文档。' },
  ];
  for (const ap of approvals) {
    const r = await call<{ data: { approval: Created } }>('/api/approvals', {
      method: 'POST',
      body: JSON.stringify(ap),
    });
    created.approvals.push(r.data.approval.id);
  }
  // 处理一条（演示已处理状态）
  await call(`/api/approvals/${created.approvals[3]}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision: 'approved', comment: '同意，请同步更新报表与文档。' }),
  });
  console.log(`    ${created.approvals.length} 条审批（含 1 条已处理）`);

  console.log('');
  console.log('✅ 演示数据完成：');
  console.log(`   项目 ${created.projects.length} · 任务 ${created.tasks.length} · 里程碑 ${created.milestones.length}`);
  console.log(`   会议 ${created.meetings.length} · 风险 ${created.risks.length} · 文件夹 ${created.folders.length} · 文件 ${created.files.length}`);
  console.log(`   公告 ${created.announcements.length} · 讨论 ${created.discussions.length} · 审批 ${created.approvals.length}`);
}

/** 清掉上一轮演示数据（按标题前缀「演示·」/ 文件名以「演示·」开头） */
async function clearDemo(): Promise<void> {
  const p = await call<{ data: { items: Array<{ id: number }> } }>('/api/projects?pageSize=100');
  for (const proj of p.data.items) {
    const full = await call<{ data: { project: { name: string } } }>(`/api/projects/${proj.id}`);
    if (full.data.project.name.startsWith('演示·')) {
      await call(`/api/projects/${proj.id}`, { method: 'DELETE' });
    }
  }
  const a = await call<{ data: { items: Array<{ id: number; title: string }> } }>(
    '/api/announcements?pageSize=100',
  );
  for (const x of a.data.items) {
    if (x.title.startsWith('演示·') || x.title.startsWith('【置顶】') || x.title.startsWith('本周') || x.title.startsWith('指标口径变更') || x.title.startsWith('移动端适配排期')) {
      await call(`/api/announcements/${x.id}`, { method: 'DELETE' });
    }
  }
  const f = await call<{ data: { items: Array<{ id: number; name: string }> } }>('/api/files?pageSize=100');
  for (const x of f.data.items) {
    if (x.name.startsWith('演示·')) {
      await call(`/api/files/${x.id}`, { method: 'DELETE' });
    }
  }
  const fo = await call<{ data: { items: Array<{ id: number; name: string }> } }>('/api/folders?pageSize=100');
  for (const x of fo.data.items) {
    if (x.name.startsWith('演示·')) {
      await call(`/api/folders/${x.id}`, { method: 'DELETE' });
    }
  }
  console.log('    已清理');
}

main().catch((err: unknown) => {
  console.error('❌ 演示数据播种失败：', err instanceof Error ? err.message : err);
  process.exit(1);
});
