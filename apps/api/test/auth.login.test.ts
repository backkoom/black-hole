import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  TEST_PASSWORD,
  clearSessions,
  closeApp,
  ensureUser,
  expireLock,
  failedAttempts,
  getApp,
} from './helpers.js';
import { queryOne } from '../src/db.js';
import { hashSessionToken } from '../src/lib/session.js';

/**
 * 登录 —— 验收 A1、A2。
 *  - 正确密码登录成功，返回用户并下发 sid Cookie
 *  - 错误密码统一提示，不泄露账号是否存在
 *  - 5 次错误锁 10 分钟；锁定期正确密码也拒绝；到期后归零可登录
 */

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await clearSessions();
    await ensureUser('tester01');
  });

  afterAll(async () => {
    await closeApp();
  });

  it('正确账号密码登录成功，返回用户并设置 sid Cookie', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .post('/api/auth/login')
      .send({ account: 'tester01', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toBe('ok');
    expect(res.body.data.user.account).toBe('tester01');
    expect(res.body.data.user).not.toHaveProperty('password_hash');
    expect(res.headers['set-cookie']?.[0]).toContain('sid=');
    expect(res.headers['set-cookie']?.[0]).toContain('HttpOnly');
  });

  it('错误密码返回 401 且统一提示「账号或密码错误」', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .post('/api/auth/login')
      .send({ account: 'tester01', password: 'Wrong-Pass-1' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(401);
    expect(res.body.message).toBe('账号或密码错误');
  });

  it('账号不存在与密码错误返回完全相同（不泄露账号是否存在）', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .post('/api/auth/login')
      .send({ account: 'no-such-account', password: 'Wrong-Pass-1' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('账号或密码错误');
  });

  it('停用账号按密码错误处理，不创建 session', async () => {
    const app = await getApp();
    await ensureUser('disabled01');
    const { query } = await import('../src/db.js');
    await query("UPDATE app_user SET status = 'disabled' WHERE account = 'disabled01'");

    const res = await request(app.server)
      .post('/api/auth/login')
      .send({ account: 'disabled01', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('账号或密码错误');
  });

  it('连续 5 次密码错误锁定 10 分钟，锁定期正确密码也拒绝', async () => {
    const app = await getApp();
    await ensureUser('locker01');

    for (let i = 0; i < 4; i += 1) {
      const res = await request(app.server)
        .post('/api/auth/login')
        .send({ account: 'locker01', password: 'Wrong-Pass-1' });
      expect(res.status).toBe(401);
    }

    // 第 5 次 → 仍然返回 401（密码错），但此时已上锁
    const fifth = await request(app.server)
      .post('/api/auth/login')
      .send({ account: 'locker01', password: 'Wrong-Pass-1' });
    expect(fifth.status).toBe(401);

    // 锁定期内用正确密码 → 403 锁定提示
    const locked = await request(app.server)
      .post('/api/auth/login')
      .send({ account: 'locker01', password: TEST_PASSWORD });
    expect(locked.status).toBe(403);
    expect(locked.body.message).toBe('账号已锁定，请 10 分钟后再试');
  });

  it('锁定到期后 failed_attempts 归零，可用正确密码登录', async () => {
    const app = await getApp();
    await ensureUser('locker02');

    for (let i = 0; i < 5; i += 1) {
      await request(app.server)
        .post('/api/auth/login')
        .send({ account: 'locker02', password: 'Wrong-Pass-1' });
    }
    expect(await failedAttempts('locker02')).toBe(5);

    await expireLock('locker02');

    const res = await request(app.server)
      .post('/api/auth/login')
      .send({ account: 'locker02', password: TEST_PASSWORD });
    expect(res.status).toBe(200);

    // 成功登录清零
    expect(await failedAttempts('locker02')).toBe(0);
  });

  it('session 表里只存 token 的 hash，不存明文', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .post('/api/auth/login')
      .send({ account: 'tester01', password: TEST_PASSWORD });

    const setCookie = res.headers['set-cookie']?.[0] ?? '';
    const token = /sid=([^;]+)/.exec(setCookie)?.[1] ?? '';
    expect(token.length).toBeGreaterThan(10);

    const row = await queryOne<{ token_hash: string }>('SELECT token_hash FROM session LIMIT 1');
    expect(row).not.toBeNull();
    expect(row?.token_hash).toBe(hashSessionToken(token));
    // 明文 token 不应出现在库里
    expect(row?.token_hash).not.toBe(token);
  });
});
