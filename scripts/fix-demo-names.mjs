import { request } from '@playwright/test';
const BASE='https://192.168.102.102';
const ctx = await request.newContext({ baseURL: BASE, ignoreHTTPSErrors:true, extraHTTPHeaders:{'content-type':'application/json'} });
await ctx.post('/api/auth/login',{data:{account:'admin',password:process.env.PW}});

// 1) 项目去掉「演示·」前缀
const ps=(await (await ctx.get('/api/projects?page=1&pageSize=100')).json()).data.items;
for (const p of ps) {
  if (!p.name.startsWith('演示·')) continue;
  const r = await ctx.put(`/api/projects/${p.id}`, { data: { name: p.name.replace('演示·','') } });
  console.log(r.ok()?'✓':'✗', p.name, '→', p.name.replace('演示·',''));
}

// 2) 里程碑：删掉全部旧数据，按 demo 建 4 个
const ms=(await (await ctx.get('/api/milestones')).json()).data?.items ?? [];
for (const m of ms) {
  const r = await ctx.delete(`/api/milestones/${m.id}`);
  if (!r.ok()) console.log('✗ 删除', m.name, r.status());
}
console.log('已清空旧里程碑', ms.length, '个');

const ps2=(await (await ctx.get('/api/projects?page=1&pageSize=100')).json()).data.items;
const byName=(n)=>ps2.find(p=>p.name===n);
const PLAN=[
  ['接口联调','移动端适配改造','2026-11-20','pending'],
  ['视觉定稿','企业数据中台','2026-12-10','pending'],
  ['灰度上线','客户运营门户','2026-11-28','pending'],
  ['一期验收','运维巡检自动化','2026-11-10','done'],
];
for (const [name, proj, due, status] of PLAN) {
  const p = byName(proj);
  if (!p) { console.log('✗ 找不到项目', proj); continue; }
  const r = await ctx.post('/api/milestones', { data: { name, projectId: p.id, dueDate: due, status } });
  console.log(r.ok()?'✓':'✗', name, '→', proj, r.status());
}
const after=(await (await ctx.get('/api/milestones')).json()).data?.items ?? [];
console.log('里程碑总数', after.length, after.map(m=>m.name).join(' / '));
await ctx.dispose();
