import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_PASSWORD, clearSessions, closeApp, ensureUser, getApp } from './helpers.js';

/**
 * 会话与改密 —— 验收 A3、A4。
 *  - 退出后 Cookie 失效，受保护接口返回 401
 *  - must_change=true 时只放行 /auth/me、改密、退出
 *  - 改密后清除 must_change，并删除该用户其他 session
 */

describe('会话与改密', () => {
  beforeEach(async () => {
    await clearSessions();
    await ensureUser('tester01');
  });

  afterAll(async () => {
    await closeApp();
  });

  it('GET /api/auth/me 返回当前用户', async () => {
    const app = await getApp();
    const agent = request.agent(app.server);
    await agent.post('/api/auth/login').send({ account: 'tester01', password: TEST_PASSWORD });

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.user.account).toBe('tester01');
    // 含公司/部门名称
    expect(res.body.data.user.org).toHaveProperty('company');
    expect(res.body.data.user.org).toHaveProperty('dept');
  });

  it('退出后 Cookie 失效，受保护接口返回 401', async () => {
    const app = await getApp();
    const agent = request.agent(app.server);
    await agent.post('/api/auth/login').send({ account: 'tester01', password: TEST_PASSWORD });

    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(200);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(401);
    expect(me.body.code).toBe(401);
  });

  it('未登录访问受保护接口返回 401', async () => {
    const app = await getApp();
    const res = await request(app.server).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('must_change=true 时只放行 /auth/me、改密、退出，其余 403', async () => {
    const app = await getApp();
    await ensureUser('mustchange01', { mustChange: true });
    const agent = request.agent(app.server);
    const login = await agent
      .post('/api/auth/login')
      .send({ account: 'mustchange01', password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.user.mustChangePassword).toBe(true);

    // 放行 3 个
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect(
      (
        await agent
          .put('/api/auth/password')
          .send({ oldPassword: TEST_PASSWORD, newPassword: 'New-Test-123' })
      ).status,
    ).toBe(200);
    expect((await agent.post('/api/auth/logout')).status).toBe(200);
  });

  it('must_change=true 时业务接口返回 403「请先修改初始密码」', async () => {
    const app = await getApp();
    await ensureUser('mustchange02', { mustChange: true });
    const agent = request.agent(app.server);
    await agent.post('/api/auth/login').send({ account: 'mustchange02', password: TEST_PASSWORD });

    // Phase 1 还没有业务路由，用一个存在的受保护路径验证中间件行为
    const res = await agent.get('/api/workspace');
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('请先修改初始密码');
  });

  it('改密后清除 must_change，并删除该用户的其他 session', async () => {
    const app = await getApp();
    await ensureUser('changepw01', { mustChange: true });

    // 两个设备分别登录
    const agentA = request.agent(app.server);
    const agentB = request.agent(app.server);
    await agentA.post('/api/auth/login').send({ account: 'changepw01', password: TEST_PASSWORD });
    await agentB.post('/api/auth/login').send({ account: 'changepw01', password: TEST_PASSWORD });

    const changed = await agentA
      .put('/api/auth/password')
      .send({ oldPassword: TEST_PASSWORD, newPassword: 'New-Test-456' });
    expect(changed.status).toBe(200);

    // A 的会话保留
    expect((await agentA.get('/api/auth/me')).status).toBe(200);
    // B 的其他 session 被删除
    expect((await agentB.get('/api/auth/me')).status).toBe(401);
  });

  it('改密时旧密码错误返回 400', async () => {
    const app = await getApp();
    await ensureUser('changepw02');
    const agent = request.agent(app.server);
    await agent.post('/api/auth/login').send({ account: 'changepw02', password: TEST_PASSWORD });

    const res = await agent
      .put('/api/auth/password')
      .send({ oldPassword: 'Wrong-Old-1', newPassword: 'New-Test-789' });
    expect(res.status).toBe(400);
  });

  it('新密码不满足策略时返回 400', async () => {
    const app = await getApp();
    await ensureUser('changepw03');
    const agent = request.agent(app.server);
    await agent.post('/api/auth/login').send({ account: 'changepw03', password: TEST_PASSWORD });

    const res = await agent
      .put('/api/auth/password')
      .send({ oldPassword: TEST_PASSWORD, newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('8');
  });
});
