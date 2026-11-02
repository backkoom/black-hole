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
  return row.id;
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
