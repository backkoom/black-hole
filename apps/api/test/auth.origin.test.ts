import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_PASSWORD, clearSessions, closeApp, ensureUser, getApp } from './helpers.js';

/**
 * Origin / Referer 同源校验 —— D-05。
 * 顺序：Origin 校验 → 登录态 → must_change。
 */

describe('Origin 同源校验', () => {
  beforeEach(async () => {
    await clearSessions();
    await ensureUser('tester01');
  });

  afterAll(async () => {
    await closeApp();
  });

  it('非 GET 请求带不同源的 Origin → 403', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .post('/api/auth/login')
      .set('Origin', 'http://evil.example.com')
      .send({ account: 'tester01', password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(403);
  });

  it('非 GET 请求带同源 Origin → 通过', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ account: 'tester01', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
  });

  it('带不同源 Referer → 403', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .post('/api/auth/login')
      .set('Referer', 'http://evil.example.com/login')
      .send({ account: 'tester01', password: TEST_PASSWORD });

    expect(res.status).toBe(403);
  });

  it('GET 请求不做 Origin 校验', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .get('/api/auth/me')
      .set('Origin', 'http://evil.example.com');
    // 未登录 → 401（说明 Origin 校验没拦）
    expect(res.status).toBe(401);
  });

  it('Origin 校验在认证之前：未登录 + 不同源 Origin → 403', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .post('/api/auth/logout')
      .set('Origin', 'http://evil.example.com');
    expect(res.status).toBe(403);
  });
});
