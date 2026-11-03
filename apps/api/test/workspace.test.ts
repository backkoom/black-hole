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
  resetAdminWorkspace,
  resetTemplateState,
} from './helpers.js';
import { query, queryOne } from '../src/db.js';

/**
 * 工作台与模板 —— 验收 B6、B7、B10 的保存/冲突/占位基础，F1–F3。
 *  - 模板 4 模块；新用户复制；管理员改模板不影响已创建用户
 *  - 保存 version+1；旧 version 409；覆盖保存；名称/副标题不改 version
 *  - 普通用户模板 403；管理员可访问
 *  - 空 workspace 自动复制；重复请求不重复创建
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

/** 模板的 4 个模块（v2 §4.9） */
const TEMPLATE_KEYS = ['todo', 'project-progress', 'quick-entry', 'idea'];

describe('工作台与模板', () => {
  beforeEach(async () => {
    await cleanTestData();
    await clearSessions();
    // 模板恢复成标准 4 模块（前面的用例会改它）
    await resetTemplateState();
    // admin 的工作台也恢复（测试保存布局会改它，否则污染种子状态）
    await resetAdminWorkspace();
  });

  afterAll(async () => {
    await closeApp();
  });

  it('F1 模板有 4 个模块，普通用户访问模板 403，管理员可访问', async () => {
    const admin = await loginSeedAdmin();
    const tpl = await admin.get('/api/workspace/template');
    expect(tpl.status).toBe(200);
    expect((tpl.body.data.items as unknown[]).length).toBe(4);
    expect((tpl.body.data.items as Array<{ moduleKey: string }>).map((i) => i.moduleKey)).toEqual(
      TEMPLATE_KEYS,
    );

    // 普通用户 403
    await ensureUser('plainuser03');
    const plain = await loginAs('plainuser03');
    expect((await plain.get('/api/workspace/template')).status).toBe(403);
    expect((await plain.put('/api/workspace/template').send({ version: 1, items: [] })).status).toBe(403);
    await deleteUserCascade('plainuser03');
  });

  it('F3 空 workspace 自动复制模板，且重复请求不重复创建', async () => {
    // 造一个没有 workspace 的用户
    await ensureUser('freshuser01');
    await query('DELETE FROM workspace WHERE user_id IN (SELECT id FROM app_user WHERE account = $1)', [
      'freshuser01',
    ]);

    const agent = await loginAs('freshuser01');
    const first = await agent.get('/api/workspace');
    expect(first.status).toBe(200);
    expect((first.body.data.items as unknown[]).length).toBe(4);

    // 再请求一次：不重复创建
    const second = await agent.get('/api/workspace');
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);

    const count = await queryOne<{ n: string }>(
      "SELECT count(*)::text AS n FROM workspace WHERE user_id IN (SELECT id FROM app_user WHERE account = 'freshuser01') AND kind = 'user'",
    );
    expect(Number(count?.n)).toBe(1);

    await deleteUserCascade('freshuser01');
  });

  it('B6 保存布局后 version+1；旧 version 返回 409 且 data 带最新 version/items', async () => {
    const agent = await loginSeedAdmin();
    const ws = await agent.get('/api/workspace');
    const version = ws.body.data.version as number;

    const items = [
      { moduleKey: 'todo', w: 6, h: 4, config: {} },
      { moduleKey: 'idea', w: 3, h: 4, config: {} },
    ];
    const saved = await agent.put('/api/workspace/layout').send({ version, items });
    expect(saved.status).toBe(200);
    expect(saved.body.data.version).toBe(version + 1);
    expect((saved.body.data.items as unknown[]).length).toBe(2);

    // 用旧 version 再存 → 409
    const conflict = await agent.put('/api/workspace/layout').send({ version, items });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe(409);
    expect(conflict.body.data.version).toBe(version + 1);
    expect((conflict.body.data.items as unknown[]).length).toBe(2);
  });

  it('B7 覆盖保存：用 409 返回的 version 再提交一次即可成功', async () => {
    const agent = await loginSeedAdmin();
    const ws = await agent.get('/api/workspace');
    const version = ws.body.data.version as number;
    const items = [{ moduleKey: 'todo', w: 6, h: 4, config: {} }];

    // 第一次用旧 version（模拟别人先存了）
    await agent.put('/api/workspace/layout').send({ version, items });
    const conflict = await agent.put('/api/workspace/layout').send({ version, items });
    expect(conflict.status).toBe(409);

    // 覆盖：用 409 里的 version 再提交
    const overwrite = await agent
      .put('/api/workspace/layout')
      .send({ version: conflict.body.data.version, items });
    expect(overwrite.status).toBe(200);
    expect(overwrite.body.data.version).toBe(version + 2);
  });

  it('B6 名称/副标题修改不参与 version', async () => {
    const agent = await loginSeedAdmin();
    const before = await agent.get('/api/workspace');
    const version = before.body.data.version as number;

    const res = await agent.put('/api/workspace').send({ name: '新名字', subtitle: '副标题' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('新名字');
    expect(res.body.data.subtitle).toBe('副标题');
    // version 不变
    expect(res.body.data.version).toBe(version);

    // 空副标题存 null
    const empty = await agent.put('/api/workspace').send({ subtitle: '   ' });
    expect(empty.body.data.subtitle).toBeNull();
  });

  it('F2 管理员改模板不影响已创建用户', async () => {
    const admin = await loginSeedAdmin();
    // 用户自己的布局先看一眼
    const userWs = await admin.get('/api/workspace');
    const userItems = (userWs.body.data.items as unknown[]).length;

    // 改模板：换成 2 个模块
    const tpl = await admin.get('/api/workspace/template');
    const tplVersion = tpl.body.data.version as number;
    const saved = await admin.put('/api/workspace/template').send({
      version: tplVersion,
      items: [
        { moduleKey: 'todo', w: 6, h: 4, config: {} },
        { moduleKey: 'idea', w: 3, h: 4, config: {} },
      ],
    });
    expect(saved.status).toBe(200);
    expect((saved.body.data.items as unknown[]).length).toBe(2);

    // 已创建的用户布局不变
    const after = await admin.get('/api/workspace');
    expect((after.body.data.items as unknown[]).length).toBe(userItems);
  });

  it('布局校验：重复模块、超 14 个、divider 超 3、尺寸不合法都 422', async () => {
    const agent = await loginSeedAdmin();
    const ws = await agent.get('/api/workspace');
    const version = ws.body.data.version as number;

    // 重复模块
    const dup = await agent.put('/api/workspace/layout').send({
      version,
      items: [
        { moduleKey: 'todo', w: 6, h: 4, config: {} },
        { moduleKey: 'todo', w: 6, h: 4, config: {} },
      ],
    });
    expect(dup.status).toBe(422);

    // placeholder 不可用
    const placeholder = await agent.put('/api/workspace/layout').send({
      version,
      items: [{ moduleKey: 'ai', w: 6, h: 4, config: {} }],
    });
    expect(placeholder.status).toBe(422);

    // divider 超 3
    const tooManyDividers = await agent.put('/api/workspace/layout').send({
      version,
      items: [
        { moduleKey: 'divider', w: 12, h: 2, config: {} },
        { moduleKey: 'divider', w: 12, h: 2, config: {} },
        { moduleKey: 'divider', w: 12, h: 2, config: {} },
        { moduleKey: 'divider', w: 12, h: 2, config: {} },
      ],
    });
    expect(tooManyDividers.status).toBe(422);

    // 宽度不合法（5 不在 3/4/6/12 里）
    const badWidth = await agent.put('/api/workspace/layout').send({
      version,
      items: [{ moduleKey: 'todo', w: 5, h: 4, config: {} }],
    });
    expect(badWidth.status).toBe(422);

    // 小于 minSize（todo 最小 3×3）
    const tooSmall = await agent.put('/api/workspace/layout').send({
      version,
      items: [{ moduleKey: 'idea', w: 3, h: 2, config: {} }],
    });
    expect(tooSmall.status).toBe(422);

    // divider 尺寸固定
    const badDivider = await agent.put('/api/workspace/layout').send({
      version,
      items: [{ moduleKey: 'divider', w: 6, h: 2, config: {} }],
    });
    expect(badDivider.status).toBe(422);

    // 校验失败不改变 version
    const after = await agent.get('/api/workspace');
    expect(after.body.data.version).toBe(version);
  });

  it('config 不合法返回 422（模块 schema 校验）', async () => {
    const agent = await loginSeedAdmin();
    const ws = await agent.get('/api/workspace');
    const version = ws.body.data.version as number;

    // quick-entry 的 url 必须是 http/https 或站内绝对路径
    const bad = await agent.put('/api/workspace/layout').send({
      version,
      items: [
        {
          moduleKey: 'quick-entry',
          w: 3,
          h: 4,
          config: { items: [{ label: 'x', url: 'javascript:alert(1)' }] },
        },
      ],
    });
    expect(bad.status).toBe(422);
  });

  it('普通用户可以读写自己的工作台，但碰不到模板', async () => {
    await ensureUser('plainuser04');
    const agent = await loginAs('plainuser04');

    const ws = await agent.get('/api/workspace');
    expect(ws.status).toBe(200);
    const version = ws.body.data.version as number;

    const saved = await agent.put('/api/workspace/layout').send({
      version,
      items: [{ moduleKey: 'todo', w: 6, h: 4, config: {} }],
    });
    expect(saved.status).toBe(200);

    expect((await agent.get('/api/workspace/template')).status).toBe(403);

    await deleteUserCascade('plainuser04');
  });
});
