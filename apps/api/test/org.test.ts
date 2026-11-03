import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  TEST_PASSWORD,
  cleanTestData,
  clearSessions,
  closeApp,
  ensureUser,
  getApp,
  leafOrgId,
} from './helpers.js';
import { query, queryOne } from '../src/db.js';

/**
 * 组织架构 —— 验收 E1、E2、E3。
 *  - E1 层级树；人员挂末级
 *  - E2 新增第二个公司后移动部门并重算 path/level、不能移到子孙下
 *  - E3 有下级或有人员的节点删除被拒绝、空节点可删
 */

async function adminLogin() {
  const app = await getApp();
  const agent = request.agent(app.server);
  // 种子 admin 是 must_change=true，测试里直接清标记（管理接口需要）
  await query("UPDATE app_user SET must_change_password = false WHERE account = 'admin'");
  const res = await agent
    .post('/api/auth/login')
    .send({ account: 'admin', password: process.env.SEED_ADMIN_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

describe('组织架构', () => {
  beforeEach(async () => {
    await cleanTestData();
    await clearSessions();
  });

  afterAll(async () => {
    await closeApp();
  });

  it('E1 组织树返回层级结构，人员挂在末级节点', async () => {
    const agent = await adminLogin();
    const res = await agent.get('/api/org/tree');
    expect(res.status).toBe(200);

    const nodes = res.body.data.nodes as Array<{
      id: number;
      level: number;
      name: string;
      userCount: number;
      children: unknown[];
    }>;
    expect(nodes.length).toBeGreaterThan(0);

    // 沿链往下走，每级 level +1
    let cur = nodes[0]!;
    let expectedLevel = 1;
    while (cur && (cur.children as unknown[]).length > 0) {
      cur = (cur.children as Array<typeof cur>)[0]!;
      expectedLevel += 1;
      expect(cur.level).toBe(expectedLevel);
    }
    // 末级节点挂着 8 个账号
    expect(cur.userCount).toBe(8);
  });

  it('新增节点：level = 父+1，同级重名 422', async () => {
    const agent = await adminLogin();
    // 挂在「示例部门」这一层（无人），而不是末级「示例小组」（挂着 8 个人）
    const mid = await queryOne<{ id: number }>("SELECT id FROM org WHERE name = '示例部门'");
    const midId = Number(mid?.id);

    const created = await agent.post('/api/org').send({ parentId: midId, name: '临时组' });
    expect(created.status).toBe(200);
    expect(created.body.data.node.level).toBe(6);

    // 同级重名
    const dup = await agent.post('/api/org').send({ parentId: midId, name: '临时组' });
    expect(dup.status).toBe(422);

    await agent.delete(`/api/org/${created.body.data.node.id}`);
  });

  it('E2 移动节点重算整棵子树的 path 与 level', async () => {
    const agent = await adminLogin();
    const mid = await queryOne<{ id: number }>("SELECT id FROM org WHERE name = '示例部门'");
    const midId = Number(mid?.id);

    // 在「示例部门」下建两级：A -> B（这层无人，可以加子节点）
    const a = await agent.post('/api/org').send({ parentId: midId, name: '移动源' });
    const aId = a.body.data.node.id as number;
    const b = await agent.post('/api/org').send({ parentId: aId, name: '移动子' });
    const bId = b.body.data.node.id as number;

    const before = await queryOne<{ path: string; level: number }>(
      'SELECT path, level FROM org WHERE id = $1',
      [bId],
    );
    // A 挂在「示例部门」(L5) 下 → A 是 L6，B 是 L7
    expect(before?.level).toBe(7);

    // 移到另一条分支（示例研究院 下面）
    const dhw = await queryOne<{ id: number }>("SELECT id FROM org WHERE name = '示例研究院'");
    const dhwId = Number(dhw?.id);
    const moved = await agent.put(`/api/org/${aId}`).send({ parentId: dhwId });
    expect(moved.status).toBe(200);

    const after = await queryOne<{ path: string; level: number }>(
      'SELECT path, level FROM org WHERE id = $1',
      [bId],
    );
    // A 移到 示例研究院(L2) 下 → A 变 L3，子节点 B 跟着变 L4，path 整条重算
    const aAfter = await queryOne<{ path: string; level: number }>(
      'SELECT path, level FROM org WHERE id = $1',
      [aId],
    );
    expect(aAfter?.level).toBe(3);
    expect(aAfter?.path).toBe(`/1/2/${aId}/`);
    expect(after?.level).toBe(4);
    expect(after?.path).not.toBe(before?.path);
    expect(after?.path).toBe(`/1/2/${aId}/${bId}/`);

    // 清理
    await agent.delete(`/api/org/${bId}`);
    await agent.delete(`/api/org/${aId}`);
  });

  it('E2 不能移动到自己的子孙下', async () => {
    const agent = await adminLogin();
    const mid = await queryOne<{ id: number }>("SELECT id FROM org WHERE name = '示例部门'");
    const midId = Number(mid?.id);
    const a = await agent.post('/api/org').send({ parentId: midId, name: '环检测父' });
    const aId = a.body.data.node.id as number;
    const b = await agent.post('/api/org').send({ parentId: aId, name: '环检测子' });
    const bId = b.body.data.node.id as number;

    // 把父节点移到自己的子节点下 → 422
    const res = await agent.put(`/api/org/${aId}`).send({ parentId: bId });
    expect(res.status).toBe(422);

    await agent.delete(`/api/org/${bId}`);
    await agent.delete(`/api/org/${aId}`);
  });

  it('E3 有子节点或有人员的节点删除被拒绝，空节点可删', async () => {
    const agent = await adminLogin();
    const mid = await queryOne<{ id: number }>("SELECT id FROM org WHERE name = '示例部门'");
    const midId = Number(mid?.id);

    // 有子节点 → 拒绝
    const parent = await agent.post('/api/org').send({ parentId: midId, name: '删除检测父' });
    const parentId = parent.body.data.node.id as number;
    const child = await agent.post('/api/org').send({ parentId, name: '删除检测子' });
    const childId = child.body.data.node.id as number;

    const delParent = await agent.delete(`/api/org/${parentId}`);
    expect(delParent.status).toBe(422);

    // 空节点可删
    const delChild = await agent.delete(`/api/org/${childId}`);
    expect(delChild.status).toBe(200);

    // 有人员的节点 → 拒绝
    const leaf = await leafOrgId();
    const delLeaf = await agent.delete(`/api/org/${leaf}`);
    expect(delLeaf.status).toBe(422);
  });

  it('有人员的节点不能再加子节点（末级约束）', async () => {
    const agent = await adminLogin();
    const leaf = await leafOrgId();

    // 末级节点挂着人员 → 不能加子节点
    const res = await agent.post('/api/org').send({ parentId: leaf, name: '不该建成' });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('人员');
  });

  it('普通用户访问组织接口返回 403', async () => {
    const app = await getApp();
    await ensureUser('plainuser01');
    const agent = request.agent(app.server);
    await agent.post('/api/auth/login').send({ account: 'plainuser01', password: TEST_PASSWORD });

    const res = await agent.get('/api/org/tree');
    expect(res.status).toBe(403);
  });
});
