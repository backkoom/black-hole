import type { Role, User, UserListItem } from '@blackhole/shared/types';
import { query, queryOne, withTransaction } from '../db.js';
import { forbidden, notFound, unprocessable } from '../lib/errors.js';
import { generateInitialPassword, hashPassword } from '../lib/password.js';
import { formatTimestamp } from '../lib/serialize.js';
import { createUserWorkspaces } from '../lib/workspace.js';
import type { SessionContext } from '../auth/service.js';

/**
 * 账号管理 —— 执行包 §6.4 的 9~12 号接口。
 *
 * 权限规则（§6.5）：
 *  - 本人只能改 name，带其他字段 403
 *  - role 仅超管可设置；is_super 不允许通过 API 设置
 *  - is_super=true 的账号 role 固定 admin
 *  - 不能停用自己；不能停用/降级最后一个 active 超管
 *  - 管理员不能停用/重置其他管理员；管理员不能重置超管
 *  - 超管账号不提供重置，只能本人改密
 *  - orgId 必须挂在末级（无子节点）节点上
 */

interface UserListRow {
  id: number;
  account: string;
  name: string;
  role: Role;
  is_super: boolean;
  org_id: number;
  status: 'active' | 'disabled';
  must_change_password: boolean;
  last_login_at: Date | null;
  org_name: string;
  company_name: string | null;
  user_count: string;
}

const USER_LIST_SQL = `
SELECT
  u.id, u.account, u.name, u.role, u.is_super, u.org_id, u.status,
  u.must_change_password, u.last_login_at,
  o.name AS org_name,
  comp.name AS company_name,
  (SELECT count(*) FROM app_user x WHERE x.org_id = u.id) AS user_count
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

function toListItem(r: UserListRow): UserListItem {
  return {
    id: Number(r.id),
    account: r.account,
    name: r.name,
    role: r.role,
    isSuper: r.is_super,
    orgId: Number(r.org_id),
    org: { company: r.company_name ?? '', dept: r.org_name },
    mustChangePassword: r.must_change_password,
    status: r.status,
    lastLoginAt: formatTimestamp(r.last_login_at),
  };
}

export interface ListUsersQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  orgId?: number;
  role?: Role;
  status?: 'active' | 'disabled';
  /** 管理员可指定查看谁；普通用户强制只看自己 */
  userId?: number;
}

export interface ListUsersResult {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listUsers(q: ListUsersQuery): Promise<ListUsersResult> {
  const where: string[] = [];
  const params: unknown[] = [];

  // 普通用户强制只看自己
  if (q.userId !== undefined) {
    params.push(q.userId);
    where.push(`u.id = $${params.length}`);
  }
  if (q.keyword !== undefined && q.keyword !== '') {
    params.push(`%${q.keyword}%`);
    where.push(`(u.account ILIKE $${params.length} OR u.name ILIKE $${params.length})`);
  }
  if (q.orgId !== undefined) {
    params.push(q.orgId);
    where.push(`u.org_id = $${params.length}`);
  }
  if (q.role !== undefined) {
    params.push(q.role);
    where.push(`u.role = $${params.length}`);
  }
  if (q.status !== undefined) {
    params.push(q.status);
    where.push(`u.status = $${params.length}`);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM app_user u ${clause}`,
    params,
  );
  params.push(q.pageSize, (q.page - 1) * q.pageSize);
  const rows = await query<UserListRow>(
    `${USER_LIST_SQL} ${clause} ORDER BY u.created_at DESC, u.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    items: rows.map(toListItem),
    total: Number(countRow?.n ?? 0),
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** 该节点是否为末级（无子节点） */
async function isLeafOrg(orgId: number): Promise<boolean> {
  const row = await queryOne<{ n: string }>(
    'SELECT count(*)::text AS n FROM org WHERE parent_id = $1',
    [orgId],
  );
  return Number(row?.n ?? 0) === 0;
}

async function orgExists(orgId: number): Promise<boolean> {
  const row = await queryOne<{ n: string }>('SELECT count(*)::text AS n FROM org WHERE id = $1', [
    orgId,
  ]);
  return Number(row?.n ?? 0) > 0;
}

export interface CreateUserInput {
  account: string;
  name: string;
  orgId: number;
  role?: Role;
}

export async function createUser(
  input: CreateUserInput,
  actor: SessionContext,
): Promise<{ user: User; initialPassword: string }> {
  const account = input.account.trim().toLowerCase();
  const name = input.name.trim();
  const role: Role = input.role ?? 'user';

  // 管理员只能创建 user；只有超管能创建 admin
  if (role === 'admin' && !actor.user.isSuper) {
    throw forbidden('只有超级管理员才能创建管理员');
  }
  if (!(await orgExists(input.orgId))) {
    throw unprocessable('部门不存在');
  }
  if (!(await isLeafOrg(input.orgId))) {
    throw unprocessable('人员必须挂在末级节点上');
  }
  const dup = await queryOne<{ n: string }>('SELECT count(*)::text AS n FROM app_user WHERE account = $1', [
    account,
  ]);
  if (Number(dup?.n ?? 0) > 0) {
    throw unprocessable('账号已存在');
  }

  const initialPassword = generateInitialPassword(12);
  const hash = await hashPassword(initialPassword);

  const userId = await withTransaction(async (client) => {
    const ins = await client.query<{ id: string }>(
      `INSERT INTO app_user (account, password_hash, name, org_id, role, is_super, status, must_change_password)
       VALUES ($1, $2, $3, $4, $5, false, 'active', true) RETURNING id`,
      [account, hash, name, input.orgId, role],
    );
    const id = Number(ins.rows[0]?.id);
    await createUserWorkspaces(client, [id]);
    return id;
  });

  const row = await queryOne<UserListRow>(`${USER_LIST_SQL} WHERE u.id = $1`, [userId]);
  if (!row) throw notFound('用户不存在');
  return { user: toListItem(row), initialPassword };
}

export interface UpdateUserInput {
  name?: string;
  orgId?: number;
  status?: 'active' | 'disabled';
  role?: Role;
}

export async function updateUser(
  targetId: number,
  input: UpdateUserInput,
  actor: SessionContext,
): Promise<User> {
  const row = await queryOne<UserListRow>(`${USER_LIST_SQL} WHERE u.id = $1`, [targetId]);
  if (!row) throw notFound('用户不存在');

  const isSelf = targetId === actor.user.id;
  const keys = Object.keys(input).filter((k) => input[k as keyof UpdateUserInput] !== undefined);

  // 本人只能改 name，带其他字段 403（D-01 严格校验）
  if (isSelf && (keys.length === 0 || keys.some((k) => k !== 'name'))) {
    throw forbidden('本人只能修改姓名');
  }
  // role 仅超管可改
  if (input.role !== undefined && !actor.user.isSuper) {
    throw forbidden('只有超级管理员才能设置管理员角色');
  }
  // 管理员不能停用其他管理员
  if (
    input.status === 'disabled' &&
    !actor.user.isSuper &&
    row.role === 'admin' &&
    row.is_super === false
  ) {
    throw forbidden('管理员不能停用其他管理员');
  }
  // 不能停用自己
  if (input.status === 'disabled' && isSelf) {
    throw unprocessable('不能停用自己');
  }
  // 不能停用/降级最后一个 active 超管
  if (
    (input.status === 'disabled' || input.role === 'user') &&
    row.is_super &&
    row.status === 'active'
  ) {
    const superRow = await queryOne<{ n: string }>(
      "SELECT count(*)::text AS n FROM app_user WHERE is_super = true AND status = 'active'",
    );
    if (Number(superRow?.n ?? 0) <= 1) {
      throw unprocessable('不能停用或降级最后一个超级管理员');
    }
  }
  // orgId 必须是末级
  if (input.orgId !== undefined) {
    if (!(await orgExists(input.orgId))) {
      throw unprocessable('部门不存在');
    }
    if (!(await isLeafOrg(input.orgId))) {
      throw unprocessable('人员必须挂在末级节点上');
    }
  }
  // is_super=true 的账号 role 固定 admin，不能改成 user
  if (row.is_super && input.role === 'user') {
    throw unprocessable('超级管理员的角色不能改为普通用户');
  }

  await query(
    `UPDATE app_user
        SET name = COALESCE($2, name),
            org_id = COALESCE($3, org_id),
            status = COALESCE($4, status),
            role = COALESCE($5, role),
            updated_at = now()
      WHERE id = $1`,
    [
      targetId,
      input.name?.trim() ?? null,
      input.orgId ?? null,
      input.status ?? null,
      input.role ?? null,
    ],
  );

  const after = await queryOne<UserListRow>(`${USER_LIST_SQL} WHERE u.id = $1`, [targetId]);
  if (!after) throw notFound('用户不存在');
  return toListItem(after);
}

/** 重置密码：返回一次性初始密码 */
export async function resetPassword(
  targetId: number,
  actor: SessionContext,
): Promise<{ initialPassword: string }> {
  const row = await queryOne<UserListRow>(`${USER_LIST_SQL} WHERE u.id = $1`, [targetId]);
  if (!row) throw notFound('用户不存在');

  // 超管账号不提供重置，只能本人改密
  if (row.is_super) {
    throw forbidden('超级管理员账号不能被重置密码，请由本人修改');
  }
  // 管理员账号仅超管可重置
  if (row.role === 'admin' && !actor.user.isSuper) {
    throw forbidden('管理员不能重置其他管理员的密码');
  }

  const initialPassword = generateInitialPassword(12);
  const hash = await hashPassword(initialPassword);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE app_user
          SET password_hash = $2, must_change_password = true,
              failed_attempts = 0, locked_until = NULL, updated_at = now()
        WHERE id = $1`,
      [targetId, hash],
    );
    // 删掉该用户全部 session
    await client.query('DELETE FROM session WHERE user_id = $1', [targetId]);
  });

  return { initialPassword };
}
