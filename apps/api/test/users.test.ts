import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  TEST_PASSWORD,
  cleanTestData,
  deleteUserCascade,
  clearSessions,
  closeApp,
  ensureUser,
  getApp,
  leafOrgId,
} from './helpers.js';
import { query, queryOne } from '../src/db.js';

/**
 * 账号管理 —— 验收 E4、E5、E6、E7、E8。
 *  - E4 管理员新增普通用户，角色默认普通，新用户工作台复制模板
 *  - E5 只有超管能设管理员；管理员不能授予；不能停用/重置其他管理员；最后超管保护
 *  - E6 停用用户后无法登录；重置密码返回一次性临时密码，首次登录强制改密
 *  - E7 批量导入 7 个新账号；重复账号跳过；错误行给行号
 *  - E8 初始密码只返回一次，不落库
 */

const SEED_ADMIN = 'admin';

async function loginAs(account: string): Promise<ReturnType<typeof request.agent>> {
  const app = await getApp();
  const agent = request.agent(app.server);
  const res = await agent.post('/api/auth/login').send({ account, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

/** 登录 admin（种子口令来自 .env） */
async function loginSeedAdmin(): Promise<ReturnType<typeof request.agent>> {
  const app = await getApp();
  const agent = request.agent(app.server);
  await query("UPDATE app_user SET must_change_password = false WHERE account = $1", [SEED_ADMIN]);
  const pw = process.env.SEED_ADMIN_PASSWORD;
  const res = await agent.post('/api/auth/login').send({ account: SEED_ADMIN, password: pw });
  expect(res.status).toBe(200);
  return agent;
}

describe('账号管理', () => {
  beforeEach(async () => {
    await cleanTestData();
    await clearSessions();
  });

  afterAll(async () => {
    await closeApp();
  });

  it('E4 管理员新增普通用户：角色默认 user、must_change=true、复制模板 4 条 layout', async () => {
    const agent = await loginSeedAdmin();
    const leaf = await leafOrgId();

    const res = await agent.post('/api/users').send({ account: 'newuser01', name: '新用户01', orgId: leaf });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('user');
    expect(res.body.data.user.mustChangePassword).toBe(true);
    expect(typeof res.body.data.initialPassword).toBe('string');
    expect(res.body.data.initialPassword.length).toBeGreaterThanOrEqual(12);

    // 复制模板的 4 条 layout
    const layouts = await queryOne<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM workspace_layout l JOIN workspace w ON w.id = l.workspace_id
        WHERE w.user_id = $1`,
      [res.body.data.user.id],
    );
    expect(Number(layouts?.n)).toBe(4);

    // 重复账号 422
    const dup = await agent
      .post('/api/users')
      .send({ account: 'newuser01', name: '重复', orgId: leaf });
    expect(dup.status).toBe(422);

    // 清理
    await deleteUserCascade('newuser01');
  });

  it('E5 只有超管能创建管理员，管理员不能授予', async () => {
    const agent = await loginSeedAdmin();
    const leaf = await leafOrgId();

    // 超管可以
    const asSuper = await agent
      .post('/api/users')
      .send({ account: 'admin01', name: '管理员01', orgId: leaf, role: 'admin' });
    expect(asSuper.status).toBe(200);
    expect(asSuper.body.data.user.role).toBe('admin');

    // 造一个普通管理员（role=admin，非超管）
    await ensureUser('manager01', { role: 'admin' });
    const mgr = await loginAs('manager01');

    // 普通管理员不能创建 admin
    const denied = await mgr
      .post('/api/users')
      .send({ account: 'admin02', name: '管理员02', orgId: leaf, role: 'admin' });
    expect(denied.status).toBe(403);

    // 普通管理员不能停用其他管理员
    const disable = await mgr.put(`/api/users/${asSuper.body.data.user.id}`).send({ status: 'disabled' });
    expect(disable.status).toBe(403);

    // 普通管理员不能重置其他管理员的密码
    const reset = await mgr.post(`/api/users/${asSuper.body.data.user.id}/reset-password`);
    expect(reset.status).toBe(403);

    // 清理
    await deleteUserCascade('admin01');
    await deleteUserCascade('manager01');
  });

  it('E5 不能停用自己；不能停用最后一个 active 超管', async () => {
    const agent = await loginSeedAdmin();
    const adminRow = await queryOne<{ id: number }>(
      'SELECT id FROM app_user WHERE account = $1',
      [SEED_ADMIN],
    );
    const adminId = Number(adminRow?.id);

    // 停用自己 → 422
    const self = await agent.put(`/api/users/${adminId}`).send({ status: 'disabled' });
    expect(self.status).toBe(422);

    // 最后一个超管不能降级 → 422
    const demote = await agent.put(`/api/users/${adminId}`).send({ role: 'user' });
    expect(demote.status).toBe(422);
  });

  it('D-01 本人只能改姓名，带其他字段 403', async () => {
    const leaf = await leafOrgId();
    await ensureUser('selfuser01');
    const agent = await loginAs('selfuser01');
    const row = await queryOne<{ id: number }>('SELECT id FROM app_user WHERE account = $1', [
      'selfuser01',
    ]);
    const id = Number(row?.id);

    // 改姓名 → 200
    const okRes = await agent.put(`/api/users/${id}`).send({ name: '自己改的名字' });
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.user.name).toBe('自己改的名字');

    // 带 status → 403
    const denied = await agent.put(`/api/users/${id}`).send({ status: 'disabled' });
    expect(denied.status).toBe(403);

    // 带 orgId → 403
    const denied2 = await agent.put(`/api/users/${id}`).send({ orgId: leaf });
    expect(denied2.status).toBe(403);

    await deleteUserCascade('selfuser01');
  });

  it('E6 停用用户后无法登录；重置密码返回一次性密码且首次登录强制改密', async () => {
    const agent = await loginSeedAdmin();
    const leaf = await leafOrgId();

    const created = await agent
      .post('/api/users')
      .send({ account: 'resetuser01', name: '重置用户', orgId: leaf });
    const userId = created.body.data.user.id as number;

    // 停用
    const disabled = await agent.put(`/api/users/${userId}`).send({ status: 'disabled' });
    expect(disabled.status).toBe(200);
    expect(disabled.body.data.user.status).toBe('disabled');

    // 停用后无法登录 → 401（按账号或密码错误，不泄露状态）
    const app = await getApp();
    const loginRes = await request(app.server)
      .post('/api/auth/login')
      .send({ account: 'resetuser01', password: TEST_PASSWORD });
    expect(loginRes.status).toBe(401);

    // 重置密码
    const reset = await agent.post(`/api/users/${userId}/reset-password`);
    expect(reset.status).toBe(200);
    const initialPassword = reset.body.data.initialPassword as string;
    expect(initialPassword.length).toBeGreaterThanOrEqual(12);

    // 重置后能登录，但必须改密
    await agent.put(`/api/users/${userId}`).send({ status: 'active' });
    const agent2 = request.agent(app.server);
    const relogin = await agent2
      .post('/api/auth/login')
      .send({ account: 'resetuser01', password: initialPassword });
    expect(relogin.status).toBe(200);
    expect(relogin.body.data.user.mustChangePassword).toBe(true);

    await deleteUserCascade('resetuser01');
  });

  it('E7 批量导入：成功行入库、重复账号跳过、错误行给行号、初始密码不落库', async () => {
    const agent = await loginSeedAdmin();
    const leaf = await leafOrgId();

    const csv = [
      '姓名,账号,角色',
      '导入甲,imp01,user',
      '导入乙,imp02,user',
      '导入丙,imp03,user',
      '坏行,Bad-Account,user',
      '重复甲,imp01,user',
    ].join('\n');

    const res = await agent
      .post('/api/users/import')
      .field('orgId', String(leaf))
      .attach('file', Buffer.from(csv, 'utf8'), { filename: 'u.csv', contentType: 'text/csv' });
    expect(res.status).toBe(200);

    const data = res.body.data;
    // 3 行合法 + 1 个文件内重复 → 成功 3、跳过 1
    expect(data.success).toBe(3);
    expect(data.skipped).toBe(1);
    // 初始密码一次性返回，且每人一个
    expect(data.initialPasswords).toHaveLength(3);
    expect(data.initialPasswords[0].account).toBe('imp01');

    // 密码不落库：库里存的是哈希
    const row = await queryOne<{ password_hash: string }>(
      'SELECT password_hash FROM app_user WHERE account = $1',
      ['imp01'],
    );
    expect(row?.password_hash).not.toBe(data.initialPasswords[0].password);
    expect(row?.password_hash.startsWith('$2')).toBe(true);

    // 每个用户都建了 workspace 并复制 4 条 layout
    const layouts = await queryOne<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM workspace_layout l JOIN workspace w ON w.id = l.workspace_id
         JOIN app_user u ON u.id = w.user_id
        WHERE u.account IN ('imp01','imp02','imp03')`,
    );
    expect(Number(layouts?.n)).toBe(12);

    // 再导一次 → 全部跳过，幂等
    const again = await agent
      .post('/api/users/import')
      .field('orgId', String(leaf))
      .attach('file', Buffer.from(csv, 'utf8'), { filename: 'u.csv', contentType: 'text/csv' });
    expect(again.body.data.success).toBe(0);
    expect(again.body.data.skipped).toBe(4);

    for (const acc of ['imp01', 'imp02', 'imp03']) {
      await deleteUserCascade(acc);
    }
  });

  it('E7 管理员提交含 admin 角色的文件整批 403，不导入任何行', async () => {
    await ensureUser('manager02', { role: 'admin' });
    const mgr = await loginAs('manager02');
    const leaf = await leafOrgId();

    const csv = ['姓名,账号,角色', '甲,aaa001,user', '乙,bbb002,admin'].join('\n');
    const res = await mgr
      .post('/api/users/import')
      .field('orgId', String(leaf))
      .attach('file', Buffer.from(csv, 'utf8'), { filename: 'u.csv', contentType: 'text/csv' });
    expect(res.status).toBe(403);

    // 整批没导入
    const left = await queryOne<{ n: string }>(
      "SELECT count(*)::text AS n FROM app_user WHERE account IN ('aaa001','bbb002')",
    );
    expect(Number(left?.n)).toBe(0);

    await deleteUserCascade('manager02');
  });

  it('普通用户访问账号管理接口返回 403', async () => {
    await ensureUser('plainuser02');
    const agent = await loginAs('plainuser02');

    expect((await agent.get('/api/users')).status).toBe(403);
    expect((await agent.post('/api/users').send({ account: 'x1', name: 'x', orgId: 1 })).status).toBe(403);
    expect((await agent.get('/api/users/import/template')).status).toBe(403);

    await deleteUserCascade('plainuser02');
  });

  it('导入模板返回 CSV 文件流且带 BOM', async () => {
    const agent = await loginSeedAdmin();
    const res = await agent.get('/api/users/import/template');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text.startsWith('﻿')).toBe(true);
    expect(res.text.split('\n')[0]).toContain('姓名,账号,角色');
  });
});
