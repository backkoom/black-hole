import { request } from '@playwright/test';

/** 把演示项目的起止日期/进度改成 demo 的时间窗，让甘特图和 demo 一致。 */
const BASE = process.env.DEMO_BASE ?? 'https://192.168.102.102';
const PW = process.env.SEED_ADMIN_PASSWORD;
const ctx = await request.newContext({ baseURL: BASE, ignoreHTTPSErrors: true, extraHTTPHeaders: { 'content-type': 'application/json' } });

let r = await ctx.post('/api/auth/login', { data: { account: "admin", password: PW } });
if (!r.ok()) { console.error('登录失败', r.status()); process.exit(1); }

const list = await (await ctx.get('/api/projects?page=1&pageSize=100')).json();
const projects = list.data.items;
const WANT = {
  '演示·移动端适配改造': { start: '2026-10-13', due: '2026-11-27' },
  '演示·企业数据中台': { start: '2026-11-01', due: '2026-12-20' },
  '演示·客户运营门户': { start: '2026-10-20', due: '2026-12-05' },
  '演示·运维巡检自动化': { start: '2026-09-22', due: '2026-11-15' },
};

for (const p of projects) {
  const want = WANT[p.name];
  if (!want) continue;
  const res = await ctx.put(`/api/projects/${p.id}`, { data: { startDate: want.start, dueDate: want.due } });
  console.log(`${res.ok() ? '✓' : '✗'} ${p.name} → ${want.start} ~ ${want.due}`);
}

// 给「运维巡检自动化」补任务，让进度不是 0
const target = projects.find((p) => p.name === '演示·运维巡检自动化');
if (target) {
  const tasks = await (await ctx.get(`/api/tasks?page=1&pageSize=100&projectId=${target.id}`)).json();
  const exist = tasks.data.items.length;
  if (exist < 3) {
    const plan = [
      { title: '巡检脚本迁移', status: 'done', dueDate: '2026-10-08' },
      { title: '告警规则梳理', status: 'done', dueDate: '2026-10-28' },
      { title: '巡检报告模板', status: 'todo', dueDate: '2026-11-12' },
    ];
    for (const t of plan) {
      const res = await ctx.post('/api/tasks', { data: { title: `演示·${t.title}`, projectId: target.id, status: t.status, priority: 'medium', dueDate: t.dueDate } });
      console.log(`${res.ok() ? '✓' : '✗'} 任务 ${t.title}`);
    }
  }
}
const after = await (await ctx.get('/api/projects?page=1&pageSize=100')).json();
for (const p of after.data.items.filter((x) => x.name.startsWith('演示'))) {
  console.log(`  ${p.name}: ${p.startDate ?? '—'} ~ ${p.dueDate ?? '—'} · ${p.progress}%`);
}
await ctx.dispose();
