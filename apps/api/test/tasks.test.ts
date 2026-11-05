import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  TEST_PASSWORD,
  cleanTestData,
  clearSessions,
  closeApp,
  deleteUserCascade,
  ensureUser,
  getApp,
  leafOrgId,
} from './helpers.js';
import { query, queryOne } from '../src/db.js';

/**
 * 任务 / 项目 / 统计 —— 验收 C1–C5、D1–D5。
 *  - 任务状态与 done_at 一致；软删不进统计/进度；项目归属校验
 *  - 0 任务项目 active/0%；3 任务 1 完成 33%；全部完成 done；重开回 active
 *  - 删除项目任务保留、project_id 置空
 *  - 今日/逾期/本周筛选；统计本周完成率含上周逾期未完成、排除上周已完成
 *  - 管理员越权；普通用户 404；userId 忽略
 */

const SEED_ADMIN = 'admin';

async function loginSeedAdmin() {
  const app = await getApp();
  const agent = request.agent(app.server);
  await query('UPDATE app_user SET must_change_password = false WHERE account = $1', [SEED_ADMIN]);
  const res = await agent
    .post('/api/auth/login')
    .send({ account: SEED_ADMIN, password: process.env.SEED_ADMIN_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

async function loginAs(account: string) {
  const app = await getApp();
  const agent = request.agent(app.server);
  const res = await agent.post('/api/auth/login').send({ account, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

describe('任务与项目', () => {
  beforeEach(async () => {
    await cleanTestData();
    await clearSessions();
  });

  afterAll(async () => {
    await closeApp();
  });

  it('D1 0 任务的项目是 active / 0%', async () => {
    const agent = await loginSeedAdmin();
    const created = await agent.post('/api/projects').send({ name: '空项目' });
    expect(created.status).toBe(200);
    expect(created.body.data.project.totalItems).toBe(0);
    expect(created.body.data.project.doneItems).toBe(0);
    expect(created.body.data.project.progress).toBe(0);
    expect(created.body.data.project.status).toBe('active');
  });

  it('D2 3 个任务 1 个完成 → progress 33%；全部完成 → done；重开 → 回到 active', async () => {
    const agent = await loginSeedAdmin();
    const project = await agent.post('/api/projects').send({ name: '进度项目' });
    const projectId = project.body.data.project.id as number;

    const taskIds: number[] = [];
    for (let i = 1; i <= 3; i += 1) {
      const t = await agent.post('/api/tasks').send({ title: `任务${i}`, projectId });
      expect(t.status).toBe(200);
      taskIds.push(t.body.data.task.id as number);
    }

    // 3 任务 0 完成
    let detail = await agent.get(`/api/projects/${projectId}`);
    expect(detail.body.data.project.progress).toBe(0);
    expect(detail.body.data.project.status).toBe('active');

    // 1 个完成 → 33%
    await agent.patch(`/api/tasks/${taskIds[0]}/status`).send({ status: 'done' });
    detail = await agent.get(`/api/projects/${projectId}`);
    expect(detail.body.data.project.doneItems).toBe(1);
    expect(detail.body.data.project.progress).toBe(33);
    expect(detail.body.data.project.status).toBe('active');

    // 全部完成 → done
    await agent.patch(`/api/tasks/${taskIds[1]}/status`).send({ status: 'done' });
    await agent.patch(`/api/tasks/${taskIds[2]}/status`).send({ status: 'done' });
    detail = await agent.get(`/api/projects/${projectId}`);
    expect(detail.body.data.project.progress).toBe(100);
    expect(detail.body.data.project.status).toBe('done');

    // 重开一个 → 回到 active
    await agent.patch(`/api/tasks/${taskIds[0]}/status`).send({ status: 'todo' });
    detail = await agent.get(`/api/projects/${projectId}`);
    expect(detail.body.data.project.progress).toBe(67);
    expect(detail.body.data.project.status).toBe('active');
  });

  it('C1 任务状态与 done_at 一致：done 写 done_at、再提交 done 保持原值、改回清空', async () => {
    const agent = await loginSeedAdmin();
    const created = await agent.post('/api/tasks').send({ title: '状态任务' });
    const id = created.body.data.task.id as number;
    expect(created.body.data.task.status).toBe('todo');
    expect(created.body.data.task.doneAt).toBeNull();

    // → done，写 done_at
    const done = await agent.patch(`/api/tasks/${id}/status`).send({ status: 'done' });
    expect(done.body.data.task.doneAt).not.toBeNull();
    const firstDoneAt = done.body.data.task.doneAt as string;

    // 再提交 done → 保持原值
    const again = await agent.patch(`/api/tasks/${id}/status`).send({ status: 'done' });
    expect(again.body.data.task.doneAt).toBe(firstDoneAt);

    // 改回 doing → 清空
    const back = await agent.patch(`/api/tasks/${id}/status`).send({ status: 'doing' });
    expect(back.body.data.task.doneAt).toBeNull();
  });

  it('D3 删除项目：任务保留、project_id 置空', async () => {
    const agent = await loginSeedAdmin();
    const project = await agent.post('/api/projects').send({ name: '待删项目' });
    const projectId = project.body.data.project.id as number;
    const task = await agent.post('/api/tasks').send({ title: '保留任务', projectId });
    const taskId = task.body.data.task.id as number;

    const del = await agent.delete(`/api/projects/${projectId}`);
    expect(del.status).toBe(200);

    // 任务还在，但 project_id 置空
    const row = await queryOne<{ project_id: number | null; deleted_at: Date | null }>(
      'SELECT project_id, deleted_at FROM task WHERE id = $1',
      [taskId],
    );
    expect(row).not.toBeNull();
    expect(row?.project_id).toBeNull();
    expect(row?.deleted_at).toBeNull();

    // 项目本身是软删
    const proj = await queryOne<{ deleted_at: Date | null }>(
      'SELECT deleted_at FROM project WHERE id = $1',
      [projectId],
    );
    expect(proj?.deleted_at).not.toBeNull();
  });

  it('C2 软删的任务不进列表、统计与项目进度', async () => {
    const agent = await loginSeedAdmin();
    const project = await agent.post('/api/projects').send({ name: '统计项目' });
    const projectId = project.body.data.project.id as number;
    await agent.post('/api/tasks').send({ title: '留下', projectId });
    const t2 = await agent.post('/api/tasks').send({ title: '删掉', projectId });

    await agent.delete(`/api/tasks/${t2.body.data.task.id}`);

    const list = await agent.get('/api/tasks');
    expect((list.body.data.items as Array<{ title: string }>).map((i) => i.title)).not.toContain('删掉');

    // 项目进度只算未删除的
    const detail = await agent.get(`/api/projects/${projectId}`);
    expect(detail.body.data.project.totalItems).toBe(1);

    // 统计不含软删
    const stats = await agent.get('/api/stats/tasks');
    expect(stats.body.data.todo).toBe(1);
  });

  it('C3 今日/逾期/本周筛选（Asia/Shanghai）', async () => {
    const agent = await loginSeedAdmin();
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    // 「逾期」用**一周前**的日期：自然周是「周一至周日」，今天所在的那一周可能从昨天开始，
    // 用昨天的日期会正好落在本周内，测不出 week 筛选的边界。
    const lastWeek = new Date(Date.now() + 8 * 60 * 60 * 1000 - 7 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const nextWeek = new Date(Date.now() + 8 * 60 * 60 * 1000 + 7 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

    await agent.post('/api/tasks').send({ title: '今天的', dueDate: today });
    await agent.post('/api/tasks').send({ title: '逾期的', dueDate: lastWeek });
    await agent.post('/api/tasks').send({ title: '下周的', dueDate: nextWeek });

    const t = await agent.get('/api/tasks?due=today');
    expect((t.body.data.items as Array<{ title: string }>).map((i) => i.title)).toEqual(['今天的']);

    const o = await agent.get('/api/tasks?due=overdue');
    expect((o.body.data.items as Array<{ title: string }>).map((i) => i.title)).toEqual(['逾期的']);

    const w = await agent.get('/api/tasks?due=week');
    const weekTitles = (w.body.data.items as Array<{ title: string }>).map((i) => i.title);
    expect(weekTitles).toContain('今天的');
    expect(weekTitles).not.toContain('逾期的');
    expect(weekTitles).not.toContain('下周的');
  });

  it('C4 逾期筛选排除已完成的', async () => {
    const agent = await loginSeedAdmin();
    const yesterday = new Date(Date.now() + 8 * 60 * 60 * 1000 - 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const created = await agent.post('/api/tasks').send({ title: '逾期已完成', dueDate: yesterday });
    await agent.patch(`/api/tasks/${created.body.data.task.id}/status`).send({ status: 'done' });

    const o = await agent.get('/api/tasks?due=overdue');
    expect((o.body.data.items as unknown[]).length).toBe(0);
  });

  it('D5 项目归属校验：普通用户不能把任务挂到别人的项目上', async () => {
    const admin = await loginSeedAdmin();
    const adminProject = await admin.post('/api/projects').send({ name: '管理员的项目' });
    const adminProjectId = adminProject.body.data.project.id as number;

    await ensureUser('otheruser01');
    const other = await loginAs('otheruser01');
    const denied = await other
      .post('/api/tasks')
      .send({ title: '越权任务', projectId: adminProjectId });
    expect(denied.status).toBe(422);

    // 自己的项目可以
    const own = await other.post('/api/projects').send({ name: '我自己的项目' });
    const ok = await other
      .post('/api/tasks')
      .send({ title: '正常任务', projectId: own.body.data.project.id });
    expect(ok.status).toBe(200);

    await deleteUserCascade('otheruser01');
  });

  it('C5 普通用户访问别人的任务/项目返回 404，userId 参数被忽略', async () => {
    const admin = await loginSeedAdmin();
    const adminTask = await admin.post('/api/tasks').send({ title: '管理员的任务' });
    const adminProject = await admin.post('/api/projects').send({ name: '管理员的项目2' });

    await ensureUser('otheruser02');
    const other = await loginAs('otheruser02');

    // 404（不泄露存在性）
    expect((await other.put(`/api/tasks/${adminTask.body.data.task.id}`).send({ title: 'x' })).status).toBe(404);
    expect((await other.delete(`/api/tasks/${adminTask.body.data.task.id}`)).status).toBe(404);
    expect((await other.get(`/api/projects/${adminProject.body.data.project.id}`)).status).toBe(404);

    // userId 被忽略：普通用户传 userId 也只能看到自己的
    const mine = await other.post('/api/tasks').send({ title: '我自己的' });
    const list = await other.get(`/api/tasks?userId=1`);
    const titles = (list.body.data.items as Array<{ title: string }>).map((i) => i.title);
    expect(titles).toContain('我自己的');
    expect(titles).not.toContain('管理员的任务');
    expect(mine.status).toBe(200);

    await deleteUserCascade('otheruser02');
  });

  it('统计：本周完成率含上周逾期未完成、排除上周已完成', async () => {
    const agent = await loginSeedAdmin();
    const shift = 8 * 60 * 60 * 1000;
    const fmt = (d: Date): string => new Date(d.getTime() + shift).toISOString().slice(0, 10);

    const now = new Date();
    const lastWeek = fmt(new Date(now.getTime() - 7 * 24 * 3600 * 1000));
    const lastWeek2 = fmt(new Date(now.getTime() - 14 * 24 * 3600 * 1000));
    const today = fmt(now);

    // 上周到期、还没完成 → 计入分母，不计入分子
    const overdue = await agent.post('/api/tasks').send({ title: '上周逾期未完成', dueDate: lastWeek });
    // 上周到期、已完成（done_at 也在上周）→ 整个排除
    const doneLastWeek = await agent.post('/api/tasks').send({ title: '上周已完成', dueDate: lastWeek });
    await agent.patch(`/api/tasks/${doneLastWeek.body.data.task.id}/status`).send({ status: 'done' });
    await query(
      `UPDATE task SET done_at = now() - interval '10 days' WHERE id = $1`,
      [doneLastWeek.body.data.task.id],
    );
    // 上周到期、done_at 是上周（手动改）→ 排除
    const oldDone = await agent.post('/api/tasks').send({ title: '更早完成', dueDate: lastWeek2 });
    await agent.patch(`/api/tasks/${oldDone.body.data.task.id}/status`).send({ status: 'done' });
    await query(
      `UPDATE task SET done_at = now() - interval '10 days' WHERE id = $1`,
      [oldDone.body.data.task.id],
    );
    // 今天到期、已完成 → 计入分子
    const doneToday = await agent.post('/api/tasks').send({ title: '今天已完成', dueDate: today });
    await agent.patch(`/api/tasks/${doneToday.body.data.task.id}/status`).send({ status: 'done' });

    const stats = await agent.get('/api/stats/overview');
    // 分母：上周逾期未完成 + 今天已完成 = 2（上周已完成的两个都被排除）
    expect(stats.body.data.weeklyTotal).toBe(2);
    expect(stats.body.data.weeklyDone).toBe(1);
    expect(stats.body.data.weeklyRate).toBe(50);
    void overdue;
  });

  it('统计：分母为 0 时 weeklyRate 为 null', async () => {
    const agent = await loginSeedAdmin();
    const stats = await agent.get('/api/stats/overview');
    expect(stats.body.data.weeklyTotal).toBe(0);
    expect(stats.body.data.weeklyRate).toBeNull();
  });

  it('项目详情包含任务列表', async () => {
    const agent = await loginSeedAdmin();
    const project = await agent.post('/api/projects').send({ name: '详情项目' });
    const projectId = project.body.data.project.id as number;
    await agent.post('/api/tasks').send({ title: '详情任务1', projectId });
    await agent.post('/api/tasks').send({ title: '详情任务2', projectId });

    const detail = await agent.get(`/api/projects/${projectId}`);
    expect(detail.status).toBe(200);
    expect((detail.body.data.tasks as unknown[]).length).toBe(2);
    expect(detail.body.data.project.totalItems).toBe(2);
  });

  it('新建任务只能归属自己：管理员也不能代建', async () => {
    const agent = await loginSeedAdmin();
    // 请求体里带 userId 会被 zod 剥掉（未知字段），不会创建到别人名下
    const res = await agent.post('/api/tasks').send({ title: '归属自己', userId: 999 });
    expect(res.status).toBe(200);
    expect(res.body.data.task.userId).toBe(1);
  });

  it('任务标题与项目名长度校验', async () => {
    const agent = await loginSeedAdmin();
    expect((await agent.post('/api/tasks').send({ title: '' })).status).toBe(400);
    expect((await agent.post('/api/projects').send({ name: '' })).status).toBe(400);
    const leaf = await leafOrgId();
    expect(leaf).toBeGreaterThan(0);
  });

  it('D9 列表与统计口径一致：admin 看全员，普通用户只看自己', async () => {
    // ⚠️ 回归测试：昨天给 tasks 加筛选参数时，把路由里的 userId 无条件覆盖成了
    // 当前用户 → 管理员在看板看到 0 条、统计却显示 7 条，同一页自相矛盾。
    // 这里锁死「列表口径 == 统计口径」。
    const admin = await loginSeedAdmin();
    await admin.post('/api/tasks').send({ title: '口径任务A' });
    await admin.post('/api/tasks').send({ title: '口径任务B' });

    await ensureUser('scopeuser01');
    const user = await loginAs('scopeuser01');
    await user.post('/api/tasks').send({ title: '口径任务C' });

    // 1) 管理员列表 = 全部 3 条
    const list = await admin.get('/api/tasks?pageSize=100');
    expect(list.status).toBe(200);
    expect(list.body.data.total).toBe(3);

    // 2) 管理员统计之和必须等于列表总数
    const stats = await admin.get('/api/stats/tasks');
    expect(stats.status).toBe(200);
    const s = stats.body.data;
    expect(s.todo + s.doing + s.done).toBe(list.body.data.total);

    // 3) 管理员可显式按 userId 过滤
    const me = await admin.get('/api/auth/me');
    const adminId = me.body.data.user.id;
    const filtered = await admin.get(`/api/tasks?pageSize=100&userId=${adminId}`);
    expect(filtered.body.data.total).toBe(2);

    // 4) 普通用户只看自己的 1 条（强制隔离，不因 admin 改动而放宽）
    const userList = await user.get('/api/tasks?pageSize=100');
    expect(userList.body.data.total).toBe(1);

    // 5) 项目列表同口径
    const projects = await admin.get('/api/projects?pageSize=100');
    expect(projects.status).toBe(200);
  });
});
