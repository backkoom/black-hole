import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { query, queryOne } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';

/**
 * 测试公共工具。
 * 约定：
 *  - 测试账号固定为 tester01 / Test-1234567（已改密状态，must_change=false）
 *  - 测试锁定用 locker01，锁定后手工把 locked_until 拨回过去来验证「到期归零」
 */

export const TEST_PASSWORD = 'Test-1234567';

let appInstance: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!appInstance) {
    appInstance = await buildApp();
    await appInstance.ready();
  }
  return appInstance;
}

export async function closeApp(): Promise<void> {
  if (appInstance) {
    await appInstance.close();
    appInstance = null;
  }
}

/** 末级组织节点 id（人员必须挂末级） */
export async function leafOrgId(): Promise<number> {
  const row = await queryOne<{ id: number }>(
    'SELECT id FROM org WHERE NOT EXISTS (SELECT 1 FROM org c WHERE c.parent_id = org.id) ORDER BY id LIMIT 1',
  );
  if (!row) throw new Error('组织树为空：先跑 npm run seed');
  // pg 默认把 bigint 返回成字符串，必须转成 number 才能过 zod 的 z.number() 校验
  return Number(row.id);
}

/** 确保测试账号存在，返回 account */
export async function ensureUser(
  account: string,
  opts: { mustChange?: boolean; role?: 'admin' | 'user'; isSuper?: boolean } = {},
): Promise<string> {
  const orgId = await leafOrgId();
  const existing = await queryOne<{ id: number }>('SELECT id FROM app_user WHERE account = $1', [account]);
  if (existing) {
    await query(
      `UPDATE app_user
          SET password_hash = $2, must_change_password = $3, status = 'active',
              failed_attempts = 0, locked_until = NULL
        WHERE id = $1`,
      [existing.id, await hashPassword(TEST_PASSWORD), opts.mustChange ?? false],
    );
    return account;
  }
  await query(
    `INSERT INTO app_user (account, password_hash, name, org_id, role, is_super, status, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)`,
    [
      account,
      await hashPassword(TEST_PASSWORD),
      '测试用户',
      orgId,
      opts.role ?? 'user',
      opts.isSuper ?? false,
      opts.mustChange ?? false,
    ],
  );
  return account;
}

export async function clearSessions(): Promise<void> {
  await query('DELETE FROM session');
}

/** 把账号的锁定时间拨到过去，模拟锁定已到期 */
export async function expireLock(account: string): Promise<void> {
  await query(
    "UPDATE app_user SET locked_until = now() - interval '1 minute' WHERE account = $1",
    [account],
  );
}

export async function failedAttempts(account: string): Promise<number> {
  const row = await queryOne<{ failed_attempts: number }>(
    'SELECT failed_attempts FROM app_user WHERE account = $1',
    [account],
  );
  return row?.failed_attempts ?? -1;
}

/**
 * 把「工作台模板」恢复成标准的 4 个模块。
 *
 * workspace.test.ts 里「管理员改模板」这类用例会改模板内容，
 * 同一文件的后续用例（以及别的文件）依赖「模板 4 模块」这个前提，
 * 所以每个测试前都要恢复 —— 否则会出现「expected 2 to be 4」这种看着莫名其妙的失败。
 */
export async function resetTemplateState(): Promise<void> {
  await query("DELETE FROM workspace_layout WHERE workspace_id IN (SELECT id FROM workspace WHERE kind = 'template')");
  await query(
    `INSERT INTO workspace_layout (workspace_id, module_key, sort, w, h, config)
     SELECT ws.id, t.module_key, t.sort, t.w, t.h, t.config::jsonb
       FROM workspace ws
       CROSS JOIN (VALUES
         ('todo', 0, 6, 4, '{}'),
         ('project-progress', 1, 6, 4, '{}'),
         ('quick-entry', 2, 3, 4, $1),
         ('idea', 3, 3, 4, '{}')
       ) AS t(module_key, sort, w, h, config)
      WHERE ws.kind = 'template'`,
    [
      JSON.stringify({
        items: [
          { label: '项目', url: '/projects' },
          { label: '任务', url: '/tasks' },
          { label: '灵感', url: '/workspace' },
          { label: '设置', url: '/settings/profile' },
        ],
      }),
    ],
  );
}

/**
 * 把 admin 的工作台恢复成模板副本（4 个模块）。
 *
 * workspace.test.ts 用 admin 登录保存布局，会把 admin 的工作台改成 1~2 个模块 ——
 * 这**污染了种子状态**（截图里能看出画布只剩一个模块）。每个测试前恢复。
 */
export async function resetAdminWorkspace(): Promise<void> {
  const admin = await queryOne<{ id: number }>('SELECT id FROM app_user WHERE account = $1', [
    'admin',
  ]);
  if (!admin) return;
  // 按 workspace 精确取；没有就跳过（不能无条件 INSERT，会撞 uq_layout_module）
  const ws = await queryOne<{ id: number }>(
    "SELECT id FROM workspace WHERE user_id = $1 AND kind = 'user'",
    [Number(admin.id)],
  );
  if (!ws) return;
  const workspaceId = Number(ws.id);

  await query('DELETE FROM workspace_layout WHERE workspace_id = $1', [workspaceId]);
  await query(
    `INSERT INTO workspace_layout (workspace_id, module_key, sort, w, h, config)
     SELECT $1, t.module_key, t.sort, t.w, t.h, t.config::jsonb
       FROM (VALUES
         ('todo', 0, 6, 4, '{}'),
         ('project-progress', 1, 6, 4, '{}'),
         ('quick-entry', 2, 3, 4, $2),
         ('idea', 3, 3, 4, '{}')
       ) AS t(module_key, sort, w, h, config)`,
    [
      workspaceId,
      JSON.stringify({
        items: [
          { label: '项目', url: '/projects' },
          { label: '任务', url: '/tasks' },
          { label: '灵感', url: '/workspace' },
          { label: '设置', url: '/settings/profile' },
        ],
      }),
    ],
  );
  // 名称也恢复成种子值
  await query("UPDATE workspace SET name = '我的工作台', subtitle = NULL WHERE user_id = $1", [
    Number(admin.id),
  ]);
}

/** 删除一个账号及其全部关联数据（layout → workspace → session → app_user 顺序，外键要求） */
export async function deleteUserCascade(account: string): Promise<void> {
  await query(
    `DELETE FROM workspace_layout
      WHERE workspace_id IN (
        SELECT id FROM workspace
         WHERE user_id IN (SELECT id FROM app_user WHERE account = $1))`,
    [account],
  );
  await query(
    'DELETE FROM workspace WHERE user_id IN (SELECT id FROM app_user WHERE account = $1)',
    [account],
  );
  await query('DELETE FROM session WHERE user_id IN (SELECT id FROM app_user WHERE account = $1)', [
    account,
  ]);
  await query('DELETE FROM app_user WHERE account = $1', [account]);
}

/**
 * 把数据库恢复到「只有种子数据」的状态。
 *
 * 测试之间共享同一个开发库，任何一个用例造的账号/组织节点都会漏到下一个用例，
 * 导致 userCount、账号总数这类断言被污染 —— **每个测试文件都要在 beforeEach 调它**。
 *
 * 保留：admin + user01~user07 + 6 个种子组织节点 + 模板 workspace。
 */
export async function cleanTestData(): Promise<void> {
  await query(
    `DELETE FROM workspace_layout
      WHERE workspace_id IN (
        SELECT ws.id FROM workspace ws
         WHERE ws.user_id IN (SELECT id FROM app_user
                               WHERE account <> 'admin' AND account NOT LIKE 'user0%')
           )`,
  );
  await query(
    `DELETE FROM workspace
      WHERE user_id IN (SELECT id FROM app_user
                         WHERE account <> 'admin' AND account NOT LIKE 'user0%')`,
  );
  await query(
    `DELETE FROM session
      WHERE user_id IN (SELECT id FROM app_user
                         WHERE account <> 'admin' AND account NOT LIKE 'user0%')`,
  );
  await query("DELETE FROM app_user WHERE account <> 'admin' AND account NOT LIKE 'user0%'");
  // 非种子的组织节点（测试建的临时节点）。按名字保留种子的 6 个 —— 仅测试库用。
  await query(
    `DELETE FROM org
      WHERE name NOT IN ('示例集团','示例研究院','示例事业部','示例中心','示例部门','示例小组')`,
  );
}
