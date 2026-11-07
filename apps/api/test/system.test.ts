import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_PASSWORD, cleanTestData, clearSessions, closeApp, ensureUser, getApp, leafOrgId } from './helpers.js';
import { query } from '../src/db.js';

/**
 * 系统设置（D-22）。
 *
 * 覆盖：
 *  - 普通用户：读也 403（这是系统级信息，不该给普通用户看）
 *  - 管理员（非超管）：能读，不能改（403）
 *  - 超级管理员：能改，改完 source 变 db，值持久化
 *  - 校验：目录必须是绝对路径（相对路径在 systemd 下会解析到奇怪的地方）
 */

const ADMIN = 'admin';

async function login(account: string, password: string) {
  const app = await getApp();
  const agent = request.agent(app.server);
  const res = await agent.post('/api/auth/login').send({ account, password });
  expect(res.status).toBe(200);
  return agent;
}

async function loginSeedAdmin() {
  await query('UPDATE app_user SET must_change_password = false WHERE account = $1', [ADMIN]);
  return login(ADMIN, process.env.SEED_ADMIN_PASSWORD as string);
}

describe('系统设置', () => {
  beforeEach(async () => {
    await cleanTestData();
    await clearSessions();
    await query('DELETE FROM system_setting');
  });

  afterAll(async () => {
    await query('DELETE FROM system_setting');
    await closeApp();
  });

  it('普通用户：读系统设置 403', async () => {
    const orgId = await leafOrgId();
    await ensureUser('sysuser01', { mustChange: false });
    const agent = await login('sysuser01', TEST_PASSWORD);
    const res = await agent.get('/api/system/settings');
    expect(res.status).toBe(403);
    expect(orgId).toBeGreaterThan(0);
  });

  it('管理员（非超管）：能读、不能改', async () => {
    await leafOrgId();
    await ensureUser('sysadmin01', { mustChange: false, role: 'admin', isSuper: false });
    const agent = await login('sysadmin01', TEST_PASSWORD);

    const read = await agent.get('/api/system/settings');
    expect(read.status).toBe(200);
    expect(read.body.data.backup).toBeDefined();
    expect(read.body.data.storage.maxUploadMb).toBeGreaterThan(0);

    const write = await agent
      .patch('/api/system/settings')
      .send({ dir: '/data/backups/x', keep: 7, enabled: true });
    expect(write.status).toBe(403);
    expect(write.body.message).toContain('超级管理员');
  });

  it('超管：能改，改完 source=db 且持久化', async () => {
    const agent = await loginSeedAdmin();
    const res = await agent
      .patch('/api/system/settings')
      .send({ dir: '/data/backups/blackhole', keep: 3, enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data.backup).toMatchObject({ keep: 3, enabled: false, source: 'db' });

    const again = await agent.get('/api/system/settings');
    expect(again.body.data.backup).toMatchObject({ dir: '/data/backups/blackhole', keep: 3, enabled: false });
  });

  it('校验：备份目录必须是绝对路径', async () => {
    const agent = await loginSeedAdmin();
    const res = await agent
      .patch('/api/system/settings')
      .send({ dir: 'relative/path', keep: 3, enabled: true });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('绝对路径');
  });
});
