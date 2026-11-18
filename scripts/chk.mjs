import { request } from '@playwright/test';
const ctx = await request.newContext({ baseURL:'https://192.168.102.102', ignoreHTTPSErrors:true, extraHTTPHeaders:{'content-type':'application/json'} });
await ctx.post('/api/auth/login',{data:{account:'admin',password:process.env.PW}});
const ps=(await (await ctx.get('/api/projects?page=1&pageSize=100')).json()).data.items;
for(const p of ps.filter(x=>x.name.startsWith('演示'))) console.log(p.name,'|',p.startDate,'~',p.dueDate,'|',p.progress+'%');
const ms=(await (await ctx.get('/api/milestones')).json()).data?.items ?? [];
console.log('里程碑', ms.length); ms.slice(0,8).forEach(m=>console.log(' ',m.name,m.dueDate,m.projectId));
await ctx.dispose();
