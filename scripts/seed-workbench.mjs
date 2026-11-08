/**
 * 工作台演示数据 —— 补「今日 / 本周 / 本月」到期的任务与几条随记。
 *
 * 为什么单独一个脚本：`seed-demo.ts` 造的是三个月的项目故事（任务大多落在
 * 未来几周），所以工作台的时间卡上「今日 / 周工作」是 0，看着像没做完。
 * 这里只补**近端**数据，不碰原来的项目与任务。
 *
 * 用法（本地）：
 *   npm run seed:workbench
 * 用法（服务器）：
 *   DEMO_BASE=https://192.168.102.102 DEMO_INSECURE=1 npm run seed:workbench
 *
 * 幂等：先按固定标题（兼容旧的【今日】/【本周】/【本月】/【随记】前缀）
 *      删掉上一轮，再重建；走真实 API，进度与统计由后端算。
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

/**
 * 翻页取全量。服务端 pageSize 上限是 100（PAGINATION.maxPageSize），
 * 传更大值会被 zod 拒成 400 —— 之前清理阶段就是这么静默失败的。
 */
async function fetchAll(basePath) {
  const items = [];
  const size = 100;
  for (let page = 1; page <= 50; page += 1) {
    const sep = basePath.includes('?') ? '&' : '?';
    const r = await call(`${basePath}${sep}page=${page}&pageSize=${size}`);
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

/** YYYY-MM-DD，n 天后（东八区由服务端解释，这里只给日期串） */
function day(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 本周一 + offset 天（保证落在自然周内） */
function thisWeek(offsetFromMonday) {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + offsetFromMonday);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* 固定文案：清理与创建共用一套，保证幂等且界面上不带「演示」前缀 */
const TODAY_TASKS = [
  { title: '整理客户反馈清单', status: 'todo', priority: 'high' },
  { title: '巡检脚本补日志', status: 'doing', priority: 'medium' },
  { title: '周会纪要归档', status: 'done', priority: 'low' },
];

const WEEK_TASKS = [
  { title: '数据中台接口联调', status: 'doing', priority: 'high', offset: 1 },
  { title: '门户改版视觉走查', status: 'todo', priority: 'medium', offset: 2 },
  { title: '月度指标口径对齐', status: 'todo', priority: 'medium', offset: 3 },
  { title: '值班表排班确认', status: 'done', priority: 'low', offset: 4 },
];

const MONTH_TASKS = [
  { title: '季度复盘材料准备', status: 'todo', priority: 'high', offset: 10 },
  { title: '备份恢复演练', status: 'todo', priority: 'medium', offset: 16 },
  { title: '资产台账更新', status: 'doing', priority: 'low', offset: 20 },
];

const IDEAS = [
  '客户提出报表要能按月对比',
  '下周评审要提前准备材料',
  '巡检脚本需要补上执行日志',
  '门户首页加载慢，找时间看看首屏资源',
  '把审批流里的驳回原因做成必填',
];

/** 今天的两场会 —— 工作台「今日日程」面板要有内容，否则看不出效果 */
const MEETINGS = [
  { title: '周例会 · 进度对齐', start: '09:30', end: '10:15', location: '3F 小会议室' },
  { title: '门户改版视觉走查', start: '14:00', end: '15:00', location: '线上 · 腾讯会议' },
];

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

  // 取项目，把任务挂上去，首页的「年度工作规划」进度也会跟着变
  const projectsRes = await call('/api/projects?page=1&pageSize=100');
  const projects = projectsRes.json?.data?.items ?? [];
  const projectId = projects[0]?.id ?? null;
  console.log(`现有项目 ${projects.length} 个，任务挂到：${projects[0]?.name ?? '（不挂项目）'}`);

  // 1) 清理旧数据（按固定标题 / 旧前缀两种口径都能认）
  const seedTitles = new Set([
    ...TODAY_TASKS.map((t) => t.title),
    ...WEEK_TASKS.map((t) => t.title),
    ...MONTH_TASKS.map((t) => t.title),
  ]);
  const existingTasks = (await fetchAll('/api/tasks')).filter(
    (t) => seedTitles.has(t.title) || /^【(今日|本周|本月)】/.test(t.title),
  );
  for (const t of existingTasks) {
    await call(`/api/tasks/${t.id}`, { method: 'DELETE' });
  }
  const existingIdeas = (await fetchAll('/api/ideas')).filter(
    (i) => IDEAS.includes(i.content) || i.content.startsWith('【随记】'),
  );
  for (const i of existingIdeas) {
    await call(`/api/ideas/${i.id}`, { method: 'DELETE' });
  }
  console.log(`清理：任务 ${existingTasks.length} 条 / 随记 ${existingIdeas.length} 条`);

  // 1b) 今天的会议（按标题识别上一轮，先删后建）
  const todayStr = day(0);
  const meetingList = await call(
    `/api/meetings?from=${todayStr}T00:00:00%2B08:00&to=${todayStr}T23:59:59%2B08:00`,
  );
  const meetingTitles = new Set(MEETINGS.map((m) => m.title));
  const existingMeetings = (meetingList.json?.data?.items ?? []).filter((m) =>
    meetingTitles.has(m.title),
  );
  for (const m of existingMeetings) {
    await call(`/api/meetings/${m.id}`, { method: 'DELETE' });
  }
  for (const m of MEETINGS) {
    await call('/api/meetings', {
      method: 'POST',
      body: JSON.stringify({
        title: m.title,
        startAt: `${todayStr}T${m.start}:00+08:00`,
        endAt: `${todayStr}T${m.end}:00+08:00`,
        location: m.location,
        projectId,
      }),
    });
  }
  console.log(`会议：清 ${existingMeetings.length} 场，建 ${MEETINGS.length} 场（今天）`);

  // 2) 今日到期 3 条（待办 / 进行中 / 已完成各一）
  const today = day(0);
  const todayDefs = TODAY_TASKS;
  for (const t of todayDefs) {
    const r = await call('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: t.title,
        projectId,
        priority: t.priority,
        dueDate: today,
        category: '日常',
      }),
    });
    if (r.status !== 200) {
      console.error('建任务失败', t.title, r.status, r.text.slice(0, 100));
      continue;
    }
    if (t.status !== 'todo') {
      await call(`/api/tasks/${r.json.data.task.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: t.status }),
      });
    }
  }

  // 3) 本周到期 4 条（避开今天是周一/周日导致越界，用「本周一 + n」并夹在 0..6）
  const weekDefs = WEEK_TASKS;
  for (const t of weekDefs) {
    const due = thisWeek(Math.min(6, t.offset));
    const r = await call('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: t.title,
        projectId,
        priority: t.priority,
        dueDate: due,
        category: '项目',
      }),
    });
    if (r.status !== 200) continue;
    if (t.status !== 'todo') {
      await call(`/api/tasks/${r.json.data.task.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: t.status }),
      });
    }
  }

  // 4) 本月其他 3 条（下周/月底，撑起「月度工作」）
  const monthDefs = MONTH_TASKS;
  for (const t of monthDefs) {
    const r = await call('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: t.title,
        projectId,
        priority: t.priority,
        dueDate: day(t.offset),
        category: '运维',
      }),
    });
    if (r.status !== 200) continue;
    if (t.status !== 'todo') {
      await call(`/api/tasks/${r.json.data.task.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: t.status }),
      });
    }
  }

  // 5) 随记 5 条
  const ideas = IDEAS;
  for (const content of ideas) {
    await call('/api/ideas', { method: 'POST', body: JSON.stringify({ content }) });
  }

  // 6) 复核
  const check = async (due) => {
    const r = await call(`/api/tasks?due=${due}&page=1&pageSize=1`);
    return r.json?.data?.total ?? 0;
  };
  console.log(
    `完成：今日 ${await check('today')} 条 / 本周 ${await check('week')} 条 / 本月 ${await check('month')} 条 / 全年 ${await check('year')} 条`,
  );
}

await main();
