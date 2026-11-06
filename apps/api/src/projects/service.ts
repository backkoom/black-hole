import type { Project, ProjectDetail, Task } from '@blackhole/shared/types';
import { query, queryOne, withTransaction } from '../db.js';
import { notFound, unprocessable } from '../lib/errors.js';
import { formatTimestamp, formatDate } from '../lib/serialize.js';
import { TASK_SELECT, type TaskRow } from '../tasks/service.js';

/**
 * 项目 —— 执行包 §6.4 的 25~29 号接口。
 *
 * 进度**实时计算，不落库**（§3.6 / §6.2）：
 *   totalItems = 该项目下未删除任务数
 *   doneItems  = 其中 status='done' 的数量
 *   progress   = Math.round(doneItems / totalItems * 100)；totalItems=0 时 0
 *   status     = totalItems >= 1 且 doneItems = totalItems → done，否则 active
 *   （全部完成后把某个任务改回 todo，项目会**重新变回 active**）
 *
 * D-13（500 人规模）：**必须一条 GROUP BY 聚合 + JOIN 取回，禁止在循环里查库（N+1）**。
 * 500 人 × 上千项目时，N+1 会直接卡死页面。
 */

interface ProjectRow {
  id: number;
  user_id: number;
  name: string;
  owner: string | null;
  due_date: string | null;
  created_at: Date;
  updated_at: Date;
  total_items: string;
  done_items: string;
  icon: string | null;
  color: string | null;
  phase: string | null;
  members: string[];
}

/**
 * 列表与进度用同一条 SQL：聚合子查询 LEFT JOIN 回来。
 * ⚠️ 必须是 LEFT JOIN + COALESCE —— 用 INNER JOIN 的话，**0 任务的新项目在列表里会消失**
 * （聚合子查询里根本没有它的行）。
 */
const PROJECT_SELECT = `
SELECT p.id, p.user_id, p.name, p.owner, p.due_date, p.created_at, p.updated_at,
       COALESCE(agg.total_items, 0) AS total_items,
       COALESCE(agg.done_items, 0) AS done_items,
       p.icon, p.color, p.phase,
       COALESCE((
         SELECT array_agg(u2.name ORDER BY u2.name)
           FROM project_member pm
           JOIN app_user u2 ON u2.id = pm.user_id
          WHERE pm.project_id = p.id
       ), '{}') AS members
  FROM project p
  LEFT JOIN (
    SELECT t.project_id,
           count(*) FILTER (WHERE t.deleted_at IS NULL) AS total_items,
           count(*) FILTER (WHERE t.deleted_at IS NULL AND t.status = 'done') AS done_items
      FROM task t
     WHERE t.project_id IS NOT NULL
     GROUP BY t.project_id
  ) agg ON agg.project_id = p.id
`;

function toProject(r: ProjectRow): Project {
  const totalItems = Number(r.total_items);
  const doneItems = Number(r.done_items);
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    name: r.name,
    owner: r.owner,
    dueDate: formatDate(r.due_date),
    totalItems,
    doneItems,
    progress: totalItems === 0 ? 0 : Math.round((doneItems / totalItems) * 100),
    status: totalItems >= 1 && doneItems === totalItems ? 'done' : 'active',
    createdAt: formatTimestamp(r.created_at) as string,
    updatedAt: formatTimestamp(r.updated_at) as string,
    icon: r.icon,
    color: r.color,
    phase: r.phase,
    members: Array.isArray(r.members) ? r.members : [],
    memberCount: Array.isArray(r.members) ? r.members.length : 0,
  };
}

export interface ListProjectsQuery {
  page: number;
  pageSize: number;
  /** 管理员可指定看谁；普通用户强制只看自己 */
  userId?: number;
}

export interface ListProjectsResult {
  items: Project[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listProjects(q: ListProjectsQuery): Promise<ListProjectsResult> {
  const where: string[] = ['p.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (q.userId !== undefined) {
    params.push(q.userId);
    where.push(`p.user_id = $${params.length}`);
  }
  const clause = `WHERE ${where.join(' AND ')}`;

  const countRow = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM project p ${clause}`,
    params,
  );
  params.push(q.pageSize, (q.page - 1) * q.pageSize);
  const rows = await query<ProjectRow>(
    `${PROJECT_SELECT} ${clause} ORDER BY p.created_at DESC, p.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    items: rows.map(toProject),
    total: Number(countRow?.n ?? 0),
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** 单个项目 + 它的任务列表 */
export async function getProjectDetail(projectId: number): Promise<ProjectDetail> {
  const row = await queryOne<ProjectRow>(
    `${PROJECT_SELECT} WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [projectId],
  );
  if (!row) throw notFound('项目不存在');
  const tasks = await query<TaskRow>(
    `${TASK_SELECT} WHERE t.project_id = $1 AND t.deleted_at IS NULL
     ORDER BY t.created_at DESC, t.id DESC`,
    [projectId],
  );
  return {
    project: toProject(row),
    tasks: tasks.map((t) => ({
      id: Number(t.id),
      userId: Number(t.user_id),
      projectId: t.project_id === null ? null : Number(t.project_id),
      title: t.title,
      status: t.status,
      priority: t.priority,
      projectName: t.project_name,
      dueDate: formatDate(t.due_date),
      doneAt: formatTimestamp(t.done_at),
      createdAt: formatTimestamp(t.created_at) as string,
      updatedAt: formatTimestamp(t.updated_at) as string,
    })) as Task[],
  };
}

export interface CreateProjectInput {
  name: string;
  owner?: string | null;
  dueDate?: string | null;
  icon?: string | null;
  color?: string | null;
  phase?: string | null;
}

export async function createProject(
  input: CreateProjectInput,
  userId: number,
): Promise<Project> {
  const name = input.name.trim();
  if (!name || name.length > 128) throw unprocessable('项目名需 1 至 128 个字符');
  if (input.owner !== undefined && input.owner !== null && input.owner.length > 64) {
    throw unprocessable('负责人不能超过 64 个字符');
  }
  const ins = await queryOne<{ id: number }>(
    `INSERT INTO project (user_id, name, owner, due_date, icon, color, phase)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      userId,
      name,
      input.owner ?? null,
      input.dueDate ?? null,
      input.icon ?? null,
      input.color ?? null,
      input.phase ?? null,
    ],
  );
  if (!ins) throw notFound('创建失败');
  const row = await queryOne<ProjectRow>(
    `${PROJECT_SELECT} WHERE p.id = $1`,
    [Number(ins.id)],
  );
  if (!row) throw notFound('项目不存在');
  return toProject(row);
}

export interface UpdateProjectInput {
  name?: string;
  owner?: string | null;
  dueDate?: string | null;
  icon?: string | null;
  color?: string | null;
  phase?: string | null;
}

/** 归属校验：管理员可改全员；普通用户仅自己 */
export async function updateProject(
  projectId: number,
  input: UpdateProjectInput,
  actorUserId: number,
  isAdmin: boolean,
): Promise<Project> {
  const row = await queryOne<{ user_id: number }>(
    'SELECT user_id FROM project WHERE id = $1 AND deleted_at IS NULL',
    [projectId],
  );
  if (!row) throw notFound('项目不存在');
  if (!isAdmin && Number(row.user_id) !== actorUserId) {
    throw notFound('项目不存在');
  }
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 128) throw unprocessable('项目名需 1 至 128 个字符');
  }
  if (input.owner !== undefined && input.owner !== null && input.owner.length > 64) {
    throw unprocessable('负责人不能超过 64 个字符');
  }

  await query(
    `UPDATE project
        SET name = COALESCE($2, name),
            owner = CASE WHEN $3::boolean THEN $4 ELSE owner END,
            due_date = CASE WHEN $5::boolean THEN $6 ELSE due_date END,
            icon = CASE WHEN $7::boolean THEN $8 ELSE icon END,
            color = CASE WHEN $9::boolean THEN $10 ELSE color END,
            phase = CASE WHEN $11::boolean THEN $12 ELSE phase END,
            updated_at = now()
      WHERE id = $1`,
    [
      projectId,
      input.name?.trim() ?? null,
      input.owner !== undefined,
      input.owner ?? null,
      input.dueDate !== undefined,
      input.dueDate ?? null,
      input.icon !== undefined,
      input.icon ?? null,
      input.color !== undefined,
      input.color ?? null,
      input.phase !== undefined,
      input.phase ?? null,
    ],
  );

  const after = await queryOne<ProjectRow>(`${PROJECT_SELECT} WHERE p.id = $1`, [projectId]);
  if (!after) throw notFound('项目不存在');
  return toProject(after);
}

/**
 * 删除项目：软删项目，**任务保留但 project_id 置空**（§6.4 接口 29）。
 * 同一事务，不做级联软删任务。
 */
export async function deleteProject(
  projectId: number,
  actorUserId: number,
  isAdmin: boolean,
): Promise<void> {
  await withTransaction(async (client) => {
    const row = await client.query<{ user_id: number }>(
      'SELECT user_id FROM project WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [projectId],
    );
    const found = row.rows[0];
    if (!found) throw notFound('项目不存在');
    if (!isAdmin && Number(found.user_id) !== actorUserId) {
      throw notFound('项目不存在');
    }
    await client.query('UPDATE project SET deleted_at = now(), updated_at = now() WHERE id = $1', [
      projectId,
    ]);
    // 任务保留，project_id 置空 → 变成「未归属项目」
    await client.query(
      'UPDATE task SET project_id = NULL, updated_at = now() WHERE project_id = $1 AND deleted_at IS NULL',
      [projectId],
    );
  });
}
