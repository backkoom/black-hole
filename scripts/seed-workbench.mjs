/**
 * 工作台演示数据（D-31 重做）—— 按「年度 → 季度 → 月度 → 周 → 天」拆解，不是一堆散任务。
 *
 * 层级怎么落：
 *   年度：3 个项目（项目本身就是年度方向）
 *   季度/月度：milestone（甘特图上的菱形，每个项目 2 个：Q4 验收 + 11 月里程碑）
 *   周：task（category=周计划，parentId 指向对应月度任务）
 *   天：task（category=日常，parentId 指向对应周任务，due=today）
 *
 * 为什么要 parentId：老六的原话是"这是有逻辑关系的"——
 * 光有不同到期日不算拆解，得能顺着链找回上一级。
 *
 * 用法（本地）：npm run seed:workbench
 * 用法（服务器）：DEMO_BASE=https://x DEMO_INSECURE=1 SEED_ADMIN_PASSWORD=… node scripts/seed-workbench.mjs
 *
 * 幂等：先按固定标题/名称删掉上一轮（兼容旧的【今日】等前缀），再重建。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const BASE = process.env.DEMO_BASE ?? 'http://127.0.0.1:3000';
const ACCOUNT = process.env.DEMO_ACCOUNT ?? 'admin';

if (process.env.DEMO_INSECURE === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

function readEnv() {
  const out = {};
  try {
    const text = readFileSync(join(root, '.env'), 'utf8');
    for (const line of text.split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m?.[1]) out[m[1]] = (m[2] ?? '').replace(/^["']|["']$/g, '');
    }
  } catch {
    /* 用进程环境变量 */
  }
  return { ...out, ...process.env };
}

const PASSWORD = readEnv().SEED_ADMIN_PASSWORD ?? readEnv().DEMO_PASSWORD;
if (!PASSWORD) {
  console.error('缺少 SEED_ADMIN_PASSWORD / DEMO_PASSWORD');
  process.exit(2);
}

const jar = new Map();
function absorb(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

async function call(path, init = {}) {
  const headers = { origin: BASE, ...(init.headers ?? {}) };
  if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  if (init.body && typeof init.body === 'string') headers['content-type'] = 'application/json';
  const res = await fetch(BASE + path, { ...init, headers });
  absorb(res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, json, text };
}

/** 翻页取全量（pageSize 上限 100，传更大值会被 zod 拒成 400 —— 之前静默失败过） */
async function fetchAll(basePath) {
  const items = [];
  for (let page = 1; page <= 50; page += 1) {
    const sep = basePath.includes('?') ? '&' : '?';
    const r = await call(`${basePath}${sep}page=${page}&pageSize=100`);
    if (r.status !== 200) {
      console.error('列表失败', basePath, r.status, r.text.slice(0, 120));
      break;
    }
    const data = r.json?.data;
    const batch = data?.items ?? [];
    items.push(...batch);
    const total = data?.total ?? items.length;
    if (items.length >= total || batch.length === 0) break;
  }
  return items;
}

/** YYYY-MM-DD，n 天后 */
function day(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 本周一 + offset 天（夹在自然周内） */
function thisWeek(offsetFromMonday) {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + Math.min(6, Math.max(0, offsetFromMonday)));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 本月第 n 天（超出月末按月末算） */
function thisMonth(dayOfMonth) {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(Math.min(dayOfMonth, last))}`;
}

/** 本季最后一天 */
function endOfQuarter() {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3);
  const end = new Date(d.getFullYear(), q * 3 + 3, 0);
  const p = (n) => String(n).padStart(2, '0');
  return `${end.getFullYear()}-${p(end.getMonth() + 1)}-${p(end.getDate())}`;
}

/* ---------------- 演示数据定义 ---------------- */

/** 年度方向：3 个项目（已存在则直接用） */
const PROJECT_HINT = '演示·';

/** 季度 / 月度节点（里程碑）—— 每项目两条，形成"季 → 月"两级 */
const MILESTONE_PLAN = [
  { suffix: 'Q4 阶段验收', due: endOfQuarter() },
  { suffix: '本月里程碑', due: thisMonth(28) },
];

/** 月度拆解：3 条，一个项目一条 */
const MONTH_TASKS = [
  { title: '数据中台接口联调收口', priority: 'high' },
  { title: '门户改版视觉定稿', priority: 'medium' },
  { title: '移动端适配方案评审', priority: 'medium' },
];

/** 周拆解：4 条，挂到月度任务上 */
const WEEK_TASKS = [
  { title: '支付回调联调', priority: 'high', parent: 0 },
  { title: '首页视觉走查', priority: 'medium', parent: 1 },
  { title: '列表页适配', priority: 'medium', parent: 2 },
  { title: '值班表排班确认', priority: 'low', parent: 0 },
];

/** 日拆解：3 条，挂到周任务上，今天到期 */
const TODAY_TASKS = [
  { title: '整理客户反馈清单', priority: 'high', parent: 0, status: 'todo' },
  { title: '巡检脚本补日志', priority: 'medium', parent: 2, status: 'doing' },
  { title: '周会纪要归档', priority: 'low', parent: 1, status: 'done' },
];

const IDEAS = [
  '客户提出报表要能按月对比',
  '下周评审要提前准备材料',
  '巡检脚本需要补上执行日志',
  '门户首页加载慢，找时间看看首屏资源',
  '把审批流里的驳回原因做成必填',
];

const MEETINGS = [
  { title: '周例会 · 进度对齐', start: '09:30', end: '10:15', location: '3F 小会议室' },
  { title: '门户改版视觉走查', start: '14:00', end: '15:00', location: '线上 · 腾讯会议' },
];

/** 旧版本（D-25/26）用过的标题前缀，清理时要一并认出来 */
const LEGACY_TITLE_RE = /^【(今日|本周|本月|随记)】/;

/** D-25/26 那一版的具体标题 —— 换了文案之后只靠前缀认不出来，会留成孤儿数据 */
const LEGACY_TITLES = new Set([
  '数据中台接口联调',
  '门户改版视觉走查',
  '月度指标口径对齐',
  '季度复盘材料准备',
  '备份恢复演练',
  '资产台账更新',
]);

async function main() {
  const login = await call('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account: ACCOUNT, password: PASSWORD }),
  });
  if (login.status !== 200) {
    console.error('登录失败', login.status, login.text.slice(0, 120));
    process.exit(1);
  }
  console.log('登录 OK');

  const projects = (await call('/api/projects?page=1&pageSize=100')).json?.data?.items ?? [];
  const demoProjects = projects.filter((p) => p.name.startsWith(PROJECT_HINT));
  const targets = demoProjects.length > 0 ? demoProjects : projects.slice(0, 1);
  console.log(`项目 ${projects.length} 个，演示项目 ${targets.length} 个：${targets.map((p) => p.name).join(' / ')}`);

  /* 1) 清理上一轮（任务 / 随记 / 会议 / 里程碑） */
  const monthTitles = new Set(MONTH_TASKS.map((t) => t.title));
  const weekTitles = new Set(WEEK_TASKS.map((t) => t.title));
  const todayTitles = new Set(TODAY_TASKS.map((t) => t.title));
  const seedTitles = new Set([...monthTitles, ...weekTitles, ...todayTitles]);

  const allTasks = await fetchAll('/api/tasks');
  const oldTasks = allTasks.filter(
    (t) => seedTitles.has(t.title) || LEGACY_TITLES.has(t.title) || LEGACY_TITLE_RE.test(t.title),
  );
  for (const task of oldTasks) await call(`/api/tasks/${task.id}`, { method: 'DELETE' });

  const allIdeas = await fetchAll('/api/ideas');
  const oldIdeas = allIdeas.filter((i) => IDEAS.includes(i.content) || i.content.startsWith('【随记】'));
  for (const idea of oldIdeas) await call(`/api/ideas/${idea.id}`, { method: 'DELETE' });

  const todayStr = day(0);
  const meetingList = (await call(
    `/api/meetings?from=${todayStr}T00:00:00%2B08:00&to=${todayStr}T23:59:59%2B08:00`,
  )).json?.data?.items ?? [];
  const meetingTitles = new Set(MEETINGS.map((m) => m.title));
  const oldMeetings = meetingList.filter((m) => meetingTitles.has(m.title));
  for (const meeting of oldMeetings) await call(`/api/meetings/${meeting.id}`, { method: 'DELETE' });

  const milestoneNames = new Set(
    targets.flatMap((p) => MILESTONE_PLAN.map((m) => `${p.name} · ${m.suffix}`)),
  );
  const allMilestones = (await call('/api/milestones')).json?.data?.items ?? [];
  const oldMilestones = allMilestones.filter((m) => milestoneNames.has(m.name));
  for (const milestone of oldMilestones) {
    await call(`/api/milestones/${milestone.id}`, { method: 'DELETE' });
  }

  console.log(
    `清理：任务 ${oldTasks.length} / 随记 ${oldIdeas.length} / 会议 ${oldMeetings.length} / 里程碑 ${oldMilestones.length}`,
  );

  /* 2) 季度 + 月度节点（里程碑） */
  for (const project of targets) {
    for (const plan of MILESTONE_PLAN) {
      await call('/api/milestones', {
        method: 'POST',
        body: JSON.stringify({
          name: `${project.name} · ${plan.suffix}`,
          projectId: project.id,
          dueDate: plan.due,
          status: plan.suffix.includes('Q4') ? 'pending' : 'pending',
        }),
      });
    }
  }

  /* 3) 月度拆解 */
  const monthIds = [];
  for (let i = 0; i < MONTH_TASKS.length; i += 1) {
    const def = MONTH_TASKS[i];
    const project = targets[i % targets.length];
    const res = await call('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: def.title,
        projectId: project?.id ?? null,
        priority: def.priority,
        dueDate: thisMonth(20 + i * 4),
        category: '月度',
      }),
    });
    if (res.status === 200) monthIds.push(res.json.data.task.id);
    else console.error('建月度任务失败', def.title, res.status, res.text.slice(0, 100));
  }

  /* 4) 周拆解（挂到月度任务） */
  const weekIds = [];
  for (let i = 0; i < WEEK_TASKS.length; i += 1) {
    const def = WEEK_TASKS[i];
    const res = await call('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: def.title,
        projectId: targets[i % targets.length]?.id ?? null,
        priority: def.priority,
        // 周任务排在周三~周六，避免和「今天」撞车（演示时看着更清楚）
        dueDate: thisWeek(3 + (i % 3)),
        category: '周计划',
        parentId: monthIds[def.parent] ?? null,
      }),
    });
    if (res.status === 200) weekIds.push(res.json.data.task.id);
    else console.error('建周任务失败', def.title, res.status, res.text.slice(0, 100));
  }

  /* 5) 日拆解（挂到周任务，今天到期） */
  for (let i = 0; i < TODAY_TASKS.length; i += 1) {
    const def = TODAY_TASKS[i];
    const res = await call('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: def.title,
        projectId: targets[i % targets.length]?.id ?? null,
        priority: def.priority,
        dueDate: todayStr,
        category: '日常',
        parentId: weekIds[def.parent] ?? null,
      }),
    });
    if (res.status !== 200) {
      console.error('建今日任务失败', def.title, res.status, res.text.slice(0, 100));
      continue;
    }
    if (def.status !== 'todo') {
      await call(`/api/tasks/${res.json.data.task.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: def.status }),
      });
    }
  }

  /* 6) 随记 + 会议 */
  for (const content of IDEAS) {
    await call('/api/ideas', { method: 'POST', body: JSON.stringify({ content }) });
  }
  for (const meeting of MEETINGS) {
    await call('/api/meetings', {
      method: 'POST',
      body: JSON.stringify({
        title: meeting.title,
        startAt: `${todayStr}T${meeting.start}:00+08:00`,
        endAt: `${todayStr}T${meeting.end}:00+08:00`,
        location: meeting.location,
        projectId: targets[0]?.id ?? null,
      }),
    });
  }

  /* 7) 复核 */
  const check = async (due) => {
    const r = await call(`/api/tasks?due=${due}&page=1&pageSize=1`);
    return r.json?.data?.total ?? 0;
  };
  console.log(
    `完成：今日 ${await check('today')} / 本周 ${await check('week')} / 本月 ${await check('month')} / 本季 ${await check('quarter')} / 本年 ${await check('year')}`,
  );
  console.log(
    `层级：月度任务 ${monthIds.length} 条 → 周任务 ${weekIds.length} 条 → 今日 ${TODAY_TASKS.length} 条；` +
      `季度/月度里程碑 ${targets.length * MILESTONE_PLAN.length} 个`,
  );
}

await main();
