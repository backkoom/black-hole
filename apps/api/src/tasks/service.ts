import type { Priority, Task, TaskStatus } from '@workbench/shared/types';
import { query, queryOne } from '../db.js';
import { notFound, unprocessable } from '../lib/errors.js';
import { formatTimestamp, thisWeekRange, todayString } from '../lib/serialize.js';
import type { SessionContext } from '../auth/service.js';

/**
 * 任务 —— 执行包 §6.4 的 20~24 号接口。
 *
 * 规则（§6.5）：
 *  - title 1 至 256；keyword 1 至 64，大小写不敏感，匹配 title 子串，空字符串按未传
 *  - projectId 可空；非空时**必须属于任务归属人**（不按当前操作人 —— 管理员代改也一样）
 *  - dueDate 可空，YYYY-MM-DD；priority 三值
 *  - projectName 只读，由 JOIN 计算
 *  - status：从非 done 改 done 写 done_at；已 done 再提交 done 保持原值；改回其他状态清空 done_at
 *  - **新建任务只能归属当前登录用户**：POST /tasks 没有 userId，管理员也不能代建
 *  - 软删（deleted_at）后不进列表、统计与项目进度
 *  - 归属校验：管理员/超管可看可改全员；普通用户仅自己
 *  - due 筛选用 Asia/Shanghai：today / overdue / week（周一至周日）
 */

export interface TaskRow {
  id: number;
  user_id: number;
  project_id: number | null;
  title: string;
  status: TaskStatus;
  priority: Priority;
  project_name: string | null;
  due_date: string | null;
  done_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export const TASK_SELECT = `
SELECT t.id, t.user_id, t.project_id, t.title, t.status, t.priority,
       p.name AS project_name, t.due_date, t.done_at, t.created_at, t.updated_at
  FROM task t
  LEFT JOIN project p ON p.id = t.project_id AND p.deleted_at IS NULL
`;

function toTask(r: TaskRow): Task {
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    projectId: r.project_id === null ? null : Number(r.project_id),
    title: r.title,
    status: r.status,
    priority: r.priority,
    projectName: r.project_name,
    dueDate: r.due_date,
    doneAt: formatTimestamp(r.done_at),
    createdAt: formatTimestamp(r.created_at) as string,
    updatedAt: formatTimestamp(r.updated_at) as string,
  };
}

export type DueFilter = 'today' | 'overdue' | 'week';

export interface ListTasksQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  due?: DueFilter;
  projectId?: number;
  status?: TaskStatus;
  /** 管理员可指定看谁；普通用户强制只看自己 */
  userId?: number;
}

export interface ListTasksResult {
  items: Task[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listTasks(q: ListTasksQuery): Promise<ListTasksResult> {
  const where: string[] = ['t.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (q.userId !== undefined) {
    params.push(q.userId);
    where.push(`t.user_id = $${params.length}`);
  }
  if (q.keyword !== undefined && q.keyword !== '') {
    params.push(`%${q.keyword}%`);
    where.push(`t.title ILIKE $${params.length}`);
  }
  if (q.projectId !== undefined) {
    params.push(q.projectId);
    where.push(`t.project_id = $${params.length}`);
  }
  if (q.status !== undefined) {
    params.push(q.status);
    where.push(`t.status = $${params.length}`);
  }
  if (q.due !== undefined) {
    const today = todayString();
    if (q.due === 'today') {
      where.push(`t.due_date = '${today}'`);
    } else if (q.due === 'overdue') {
      where.push(`t.due_date < '${today}' AND t.status <> 'done'`);
    } else {
      const { start, end } = thisWeekRange();
      where.push(`t.due_date BETWEEN '${start}' AND '${end}'`);
    }
  }
  const clause = `WHERE ${where.join(' AND ')}`;

  const countRow = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM task t ${clause}`,
    params,
  );
  params.push(q.pageSize, (q.page - 1) * q.pageSize);
  const rows = await query<TaskRow>(
    `${TASK_SELECT} ${clause} ORDER BY t.created_at DESC, t.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    items: rows.map(toTask),
    total: Number(countRow?.n ?? 0),
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** 该项目是否属于指定用户（且未删除） */
export async function projectBelongsTo(projectId: number, userId: number): Promise<boolean> {
  const row = await queryOne<{ n: string }>(
    'SELECT count(*)::text AS n FROM project WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [projectId, userId],
  );
  return Number(row?.n ?? 0) > 0;
}

export interface CreateTaskInput {
  title: string;
  projectId?: number | null;
  priority?: Priority;
  dueDate?: string | null;
}

/** 新建任务：只能归属当前登录用户 */
export async function createTask(
  input: CreateTaskInput,
  actor: SessionContext,
): Promise<Task> {
  const title = input.title.trim();
  if (!title || title.length > 256) throw unprocessable('标题需 1 至 256 个字符');

  // projectId 必须属于**任务归属人**（= 当前登录用户）；管理员也不能代建，所以归属人就是 actor
  if (input.projectId !== undefined && input.projectId !== null) {
    if (!(await projectBelongsTo(input.projectId, actor.user.id))) {
      throw unprocessable('项目不存在或不属于你');
    }
  }

  const ins = await queryOne<{ id: number }>(
    `INSERT INTO task (user_id, project_id, title, status, priority, due_date)
     VALUES ($1, $2, $3, 'todo', COALESCE($4, 'medium'), $5) RETURNING id`,
    [
      actor.user.id,
      input.projectId ?? null,
      title,
      input.priority ?? null,
      input.dueDate ?? null,
    ],
  );
  if (!ins) throw notFound('创建失败');
  const row = await queryOne<TaskRow>(`${TASK_SELECT} WHERE t.id = $1`, [Number(ins.id)]);
  if (!row) throw notFound('任务不存在');
  return toTask(row);
}

export interface UpdateTaskInput {
  title?: string;
  projectId?: number | null;
  priority?: Priority;
  dueDate?: string | null;
}

export async function updateTask(
  taskId: number,
  input: UpdateTaskInput,
  actor: SessionContext,
): Promise<Task> {
  const row = await queryOne<TaskRow>(`${TASK_SELECT} WHERE t.id = $1 AND t.deleted_at IS NULL`, [
    taskId,
  ]);
  if (!row) throw notFound('任务不存在');

  // 归属校验：管理员/超管可改全员；普通用户仅自己
  if (actor.user.role !== 'admin' && Number(row.user_id) !== actor.user.id) {
    throw notFound('任务不存在');
  }

  const title = input.title !== undefined ? input.title.trim() : row.title;
  if (!title || title.length > 256) throw unprocessable('标题需 1 至 256 个字符');

  // projectId 按**任务归属人**校验，不按当前操作人
  if (input.projectId !== undefined) {
    if (input.projectId !== null) {
      if (!(await projectBelongsTo(input.projectId, Number(row.user_id)))) {
        throw unprocessable('项目不存在或不属于任务归属人');
      }
    }
  }

  await query(
    `UPDATE task
        SET title = $2,
            project_id = CASE WHEN $3::boolean THEN $4 ELSE project_id END,
            priority = COALESCE($5, priority),
            due_date = CASE WHEN $6::boolean THEN $7 ELSE due_date END,
            updated_at = now()
      WHERE id = $1`,
    [
      taskId,
      title,
      input.projectId !== undefined,
      input.projectId ?? null,
      input.priority ?? null,
      input.dueDate !== undefined,
      input.dueDate ?? null,
    ],
  );

  const after = await queryOne<TaskRow>(`${TASK_SELECT} WHERE t.id = $1`, [taskId]);
  if (!after) throw notFound('任务不存在');
  return toTask(after);
}

/** 状态流转：非 done → done 写 done_at；已 done 再提交 done 保持原值；改回其他清空 */
export async function updateTaskStatus(
  taskId: number,
  status: TaskStatus,
  actor: SessionContext,
): Promise<Task> {
  const row = await queryOne<TaskRow>(`${TASK_SELECT} WHERE t.id = $1 AND t.deleted_at IS NULL`, [
    taskId,
  ]);
  if (!row) throw notFound('任务不存在');
  if (actor.user.role !== 'admin' && Number(row.user_id) !== actor.user.id) {
    throw notFound('任务不存在');
  }

  if (status === 'done') {
    if (row.status === 'done') {
      // 已经是 done → 保持原 done_at 不变
      await query('UPDATE task SET status = $2, updated_at = now() WHERE id = $1', [taskId, status]);
    } else {
      await query(
        "UPDATE task SET status = $2, done_at = now(), updated_at = now() WHERE id = $1",
        [taskId, status],
      );
    }
  } else {
    // 改回 todo/doing → 清空 done_at
    await query(
      'UPDATE task SET status = $2, done_at = NULL, updated_at = now() WHERE id = $1',
      [taskId, status],
    );
  }

  const after = await queryOne<TaskRow>(`${TASK_SELECT} WHERE t.id = $1`, [taskId]);
  if (!after) throw notFound('任务不存在');
  return toTask(after);
}

/** 软删 */
export async function deleteTask(taskId: number, actor: SessionContext): Promise<void> {
  const row = await queryOne<{ user_id: number }>(
    'SELECT user_id FROM task WHERE id = $1 AND deleted_at IS NULL',
    [taskId],
  );
  if (!row) throw notFound('任务不存在');
  if (actor.user.role !== 'admin' && Number(row.user_id) !== actor.user.id) {
    throw notFound('任务不存在');
  }
  await query('UPDATE task SET deleted_at = now(), updated_at = now() WHERE id = $1', [taskId]);
}
