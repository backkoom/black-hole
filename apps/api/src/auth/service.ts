import type { Role, User } from '@workbench/shared/types';
import { query, queryOne, withTransaction } from '../db.js';
import { formatTimestamp } from '../lib/serialize.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { generateSessionToken, hashSessionToken } from '../lib/session.js';
import { getConfig } from '../config.js';

/**
 * 认证服务 —— 执行包 §3.3「认证与会话」/ §6.5。
 *  - 登录失败统一「账号或密码错误」，不泄露账号是否存在
 *  - status != active 按账号或密码错误返回 401，不创建 session
 *  - 5 次密码错误锁 10 分钟；成功登录清零；锁定到期后 failed_attempts 归零
 *  - session 只存 token 的 hash
 */

export const LOCK_THRESHOLD = 5;
export const LOCK_MINUTES = 10;

export interface UserRow {
  id: number;
  account: string;
  password_hash: string;
  name: string;
  org_id: number;
  role: Role;
  is_super: boolean;
  status: 'active' | 'disabled';
  must_change_password: boolean;
  failed_attempts: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  org_name: string;
  company_name: string | null;
}

/**
 * 取用户 + 组织信息。
 * company 用递归 CTE 找 level=2 的祖先（不依赖 path 字符串格式，稳）。
 */
const USER_SQL = `
SELECT
  u.id, u.account, u.password_hash, u.name, u.org_id, u.role, u.is_super,
  u.status, u.must_change_password, u.failed_attempts, u.locked_until, u.last_login_at,
  o.name AS org_name,
  comp.name AS company_name
FROM app_user u
JOIN org o ON o.id = u.org_id
LEFT JOIN LATERAL (
  WITH RECURSIVE anc AS (
    SELECT id, parent_id, level, name FROM org WHERE id = u.org_id
    UNION ALL
    SELECT p.id, p.parent_id, p.level, p.name FROM org p JOIN anc a ON p.id = a.parent_id
  )
  SELECT name FROM anc WHERE level = 2 LIMIT 1
) comp ON TRUE
`;

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    account: row.account,
    name: row.name,
    role: row.role,
    isSuper: row.is_super,
    orgId: row.org_id,
    org: {
      company: row.company_name ?? '',
      dept: row.org_name,
    },
    mustChangePassword: row.must_change_password,
  };
}

export async function findUserByAccount(account: string): Promise<UserRow | null> {
  return queryOne<UserRow>(`${USER_SQL} WHERE u.account = $1`, [account]);
}

export async function findUserById(id: number): Promise<UserRow | null> {
  return queryOne<UserRow>(`${USER_SQL} WHERE u.id = $1`, [id]);
}

export type LoginOutcome =
  | { ok: true; user: User; token: string; expiresAt: Date }
  | { ok: false; reason: 'invalid' | 'locked' };

export async function login(account: string, password: string): Promise<LoginOutcome> {
  const row = await findUserByAccount(account);

  // 账号不存在 → 与密码错误完全一致，不泄露账号是否存在
  if (!row) return { ok: false, reason: 'invalid' };

  // 已停用 → 同样按账号或密码错误处理，不创建 session
  if (row.status !== 'active') return { ok: false, reason: 'invalid' };

  const now = new Date();

  // 锁定期内：即使密码正确也拒绝
  if (row.locked_until && row.locked_until.getTime() > now.getTime()) {
    return { ok: false, reason: 'locked' };
  }

  // 锁定已到期 → failed_attempts 归零，避免下一次输错立即再次锁定
  if (row.locked_until && row.locked_until.getTime() <= now.getTime() && row.failed_attempts > 0) {
    await query('UPDATE app_user SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [row.id]);
  }

  const passwordOk = await verifyPassword(password, row.password_hash);

  if (!passwordOk) {
    const attempts = row.failed_attempts + 1;
    if (attempts >= LOCK_THRESHOLD) {
      // 第 5 次错误 → 锁 10 分钟
      await query(
        `UPDATE app_user
            SET failed_attempts = $2, locked_until = now() + ($3 || ' minutes')::interval
          WHERE id = $1`,
        [row.id, attempts, String(LOCK_MINUTES)],
      );
    } else {
      await query('UPDATE app_user SET failed_attempts = $2 WHERE id = $1', [row.id, attempts]);
    }
    return { ok: false, reason: 'invalid' };
  }

  // 密码正确：清零失败计数与锁定，更新登录时间
  await query(
    'UPDATE app_user SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1',
    [row.id],
  );

  const cfg = getConfig();
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(now.getTime() + cfg.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO session (user_id, token_hash, expires_at, last_seen_at)
     VALUES ($1, $2, $3, now())`,
    [row.id, tokenHash, expiresAt],
  );

  const fresh = await findUserById(row.id);
  return {
    ok: true,
    user: toUser((fresh ?? row) as UserRow),
    token,
    expiresAt,
  };
}

/** 改密：校验旧密码 → 更新 hash → 清 must_change → 删其他 session（保留当前） */
export async function changePassword(
  userId: number,
  oldPassword: string,
  newPassword: string,
  currentTokenHash: string,
): Promise<{ ok: boolean; message?: string }> {
  const row = await findUserById(userId);
  if (!row) return { ok: false, message: '账号不存在' };

  const oldOk = await verifyPassword(oldPassword, row.password_hash);
  if (!oldOk) return { ok: false, message: '旧密码不正确' };

  const newHash = await hashPassword(newPassword);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE app_user
          SET password_hash = $2, must_change_password = false, updated_at = now()
        WHERE id = $1`,
      [userId, newHash],
    );
    // 删除该用户其他 session，保留当前
    await client.query('DELETE FROM session WHERE user_id = $1 AND token_hash <> $2', [
      userId,
      currentTokenHash,
    ]);
  });

  return { ok: true };
}

/** 退出：删除当前 session */
export async function destroySession(tokenHash: string): Promise<void> {
  await query('DELETE FROM session WHERE token_hash = $1', [tokenHash]);
}

/** 由 token hash 找会话与用户 */
export interface SessionContext {
  sessionId: string;
  tokenHash: string;
  user: User;
  mustChangePassword: boolean;
}

export async function resolveSession(tokenHash: string): Promise<SessionContext | null> {
  const row = await queryOne<{
    session_id: string;
    user_id: number;
    expires_at: Date;
    last_seen_at: Date;
  }>(
    'SELECT id AS session_id, user_id, expires_at, last_seen_at FROM session WHERE token_hash = $1',
    [tokenHash],
  );
  if (!row) return null;

  if (row.expires_at.getTime() <= Date.now()) {
    await query('DELETE FROM session WHERE id = $1', [row.session_id]);
    return null;
  }

  const user = await findUserById(row.user_id);
  if (!user) return null;

  // 账号在会话期间被停用 → 会话失效
  if (user.status !== 'active') return null;

  await query('UPDATE session SET last_seen_at = now() WHERE id = $1', [row.session_id]);

  return {
    sessionId: row.session_id,
    tokenHash,
    user: toUser(user),
    mustChangePassword: user.must_change_password,
  };
}

/** 会话清理任务（每日一次；先用 setInterval，文档写清） */
export async function purgeExpiredSessions(): Promise<number> {
  const rows = await query<{ count: string }>(
    'SELECT count(*)::text AS count FROM session WHERE expires_at <= now()',
  );
  await query('DELETE FROM session WHERE expires_at <= now()');
  return Number(rows[0]?.count ?? 0);
}

/** 最近一次登录时间（字符串形式） */
export function lastLoginAt(row: { last_login_at: Date | null }): string | null {
  return formatTimestamp(row.last_login_at);
}
