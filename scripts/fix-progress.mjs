import { request } from '@playwright/test';
const BASE='https://192.168.102.102'; const PW=process.env.PW;
const ctx = await request.newContext({ baseURL: BASE, ignoreHTTPSErrors: true, extraHTTPHeaders: { 'content-type':'application/json' } });
await ctx.post('/api/auth/login', { data: { account:'admin', password: PW } });
const proj = (await (await ctx.get('/api/projects?page=1&pageSize=100')).json()).data.items.find(p=>p.name==='演示·运维巡检自动化');
const ts = (await (await ctx.get(`/api/tasks?page=1&pageSize=100&projectId=${proj.id}`)).json()).data.items;
for (const t of ts) {
  const want = t.title.includes('巡检报告模板') ? 'doing' : 'done';
  const r = await ctx.patch(`/api/tasks/${t.id}/status`, { data: { status: want } });
  console.log(r.ok()? '✓':'✗', t.title, '→', want, r.status());
}
const after=(await (await ctx.get('/api/projects?page=1&pageSize=100')).json()).data.items.find(p=>p.name==='演示·运维巡检自动化');
console.log('进度', after.progress + '%');
await ctx.dispose();
