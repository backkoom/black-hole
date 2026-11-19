import type { Priority, Task, TaskStatus } from '@blackhole/shared/types';
import { query, queryOne } from '../db.js';
import { notFound, unprocessable } from '../lib/errors.js';
import {
  formatDate,
  formatTimestamp,
  thisMonthRange,
  thisQuarterRange,
  thisWeekRange,
  thisYearRange,
  todayString,
} from '../lib/serialize.js';
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
  assignee_id: number | null;
  assignee_name: string | null;
  category: string | null;
  reminder_at: Date | null;
  parent_id: number | null;
  subtask_count: string;
  start_at: Date | null;
  source_type: string | null;
  source_id: number | null;
}

export const TASK_SELECT = `
SELECT t.id, t.user_id, t.project_id, t.title, t.status, t.priority,
       p.name AS project_name, t.due_date, t.done_at, t.created_at, t.updated_at,
       t.assignee_id, u.name AS assignee_name, t.category, t.reminder_at, t.parent_id, t.start_at,
       t.source_type, t.source_id,
       (SELECT count(*) FROM task st
         WHERE st.parent_id = t.id AND st.deleted_at IS NULL) AS subtask_count
  FROM task t
  LEFT JOIN project p ON p.id = t.project_id AND p.deleted_at IS NULL
  LEFT JOIN app_user u ON u.id = t.assignee_id
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
    // ⚠️ date 列必须走 formatDate：pg 会把 '2026-11-03' 解析成本地时区的 Date，
    // 直接透传会被 JSON.stringify 成 ISO 时间串，违反契约的 YYYY-MM-DD。
    dueDate: formatDate(r.due_date),
    doneAt: formatTimestamp(r.done_at),
    createdAt: formatTimestamp(r.created_at) as string,
    updatedAt: formatTimestamp(r.updated_at) as string,
    assigneeId: r.assignee_id === null ? null : Number(r.assignee_id),
    assigneeName: r.assignee_name,
    category: r.category,
    reminderAt: formatTimestamp(r.reminder_at),
    parentId: r.parent_id === null ? null : Number(r.parent_id),
    subtaskCount: Number(r.subtask_count ?? 0),
    startAt: formatTimestamp(r.start_at),
  };
}

export type DueFilter = 'today' | 'overdue' | 'week' | 'month' | 'quarter' | 'year';

export interface ListTasksQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  due?: DueFilter;
  projectId?: number;
  status?: TaskStatus;
  priority?: Priority;
  /** 负责人 */
  assigneeId?: number;
  /** 分类 */
  category?: string;
  /** 起始日期（含）YYYY-MM-DD */
  from?: string;
  /** 结束日期（含）YYYY-MM-DD */
  to?: string;
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
  if (q.priority !== undefined) {
    params.push(q.priority);
    where.push(`t.priority = $${params.length}`);
  }
  if (q.assigneeId !== undefined) {
    params.push(q.assigneeId);
    where.push(`t.assignee_id = $${params.length}`);
  }
  if (q.category !== undefined && q.category !== '') {
    params.push(q.category);
    where.push(`t.category = $${params.length}`);
  }
  if (q.from !== undefined && q.from !== '') {
    params.push(q.from);
    where.push(`t.due_date >= $${params.length}`);
  }
  if (q.to !== undefined && q.to !== '') {
    params.push(q.to);
    where.push(`t.due_date <= $${params.length}`);
  }
  if (q.due !== undefined) {
    const today = todayString();
    if (q.due === 'today') {
      where.push(`t.due_date = '${today}'`);
    } else if (q.due === 'overdue') {
      where.push(`t.due_date < '${today}' AND t.status <> 'done'`);
    } else {
      // week / month / quarter / year —— D-24 工作台的时间视图
      const range =
        q.due === 'month'
          ? thisMonthRange()
          : q.due === 'quarter'
            ? thisQuarterRange()
            : q.due === 'year'
              ? thisYearRange()
              : thisWeekRange();
      where.push(`t.due_date BETWEEN '${range.start}' AND '${range.end}'`);
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
  assigneeId?: number | null;
  category?: string | null;
  reminderAt?: string | null;
  parentId?: number | null;
  startAt?: string | null;
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
    `INSERT INTO task
       (user_id, project_id, title, status, priority, due_date,
        assignee_id, category, reminder_at, parent_id, start_at)
     VALUES ($1, $2, $3, 'todo', COALESCE($4, 'medium'), $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      actor.user.id,
      input.projectId ?? null,
      title,
      input.priority ?? null,
      input.dueDate ?? null,
      input.assigneeId ?? null,
      input.category ?? null,
      input.reminderAt ?? null,
      input.parentId ?? null,
      input.startAt ?? null,
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
  assigneeId?: number | null;
  category?: string | null;
  reminderAt?: string | null;
  parentId?: number | null;
  startAt?: string | null;
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
            assignee_id = CASE WHEN $8::boolean THEN $9 ELSE assignee_id END,
            category = CASE WHEN $10::boolean THEN $11 ELSE category END,
            reminder_at = CASE WHEN $12::boolean THEN $13 ELSE reminder_at END,
            parent_id = CASE WHEN $14::boolean THEN $15 ELSE parent_id END,
            start_at = CASE WHEN $16::boolean THEN $17 ELSE start_at END,
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
      input.assigneeId !== undefined,
      input.assigneeId ?? null,
      input.category !== undefined,
      input.category ?? null,
      input.reminderAt !== undefined,
      input.reminderAt ?? null,
      input.parentId !== undefined,
      input.parentId ?? null,
      input.startAt !== undefined,
      input.startAt ?? null,
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


// ==================== 任务详情（迁移 011 / D-37） ====================
//
// 把「这条任务的来龙去脉」一次捞全：右侧三块（来源 / 关联风险 / 附件）
// + 左侧（父任务 / 子任务 / 进展记录）。前端只发一次请求。
//
// 关联风险先按「同项目 + 未关闭」取前 5 条 —— 现在没有任务↔风险的直接关联字段，
// 用项目做近似；以后要精确就在 task 上加 risk_id。

export interface TaskSourceInfo {
  type: 'meeting' | 'risk' | 'idea';
  id: number;
  title: string;
  subtitle: string | null;
}

export interface TaskProgressItem {
  id: number;
  content: string;
  userName: string;
  createdAt: string | null;
}

export interface TaskFileItem {
  id: number;
  name: string;
  sizeBytes: number;
  mimeType: string | null;
  createdAt: string | null;
}

export interface TaskRiskItem {
  id: number;
  code: string | null;
  title: string;
  level: Priority;
  status: string;
}

export interface TaskDetail extends Task {
  parent: { id: number; title: string } | null;
  subtasks: Array<{ id: number; title: string; status: TaskStatus }>;
  progress: TaskProgressItem[];
  files: TaskFileItem[];
  source: TaskSourceInfo | null;
  relatedRisks: TaskRiskItem[];
}

export async function getTaskDetail(taskId: number, actor: SessionContext): Promise<TaskDetail> {
  const row = await queryOne<TaskRow>(
    `${TASK_SELECT} WHERE t.id = $1 AND t.deleted_at IS NULL`,
    [taskId],
  );
  if (!row) throw notFound('任务不存在');
  // 归属校验：管理员看全员，普通用户仅自己
  if (actor.user.role !== 'admin' && Number(row.user_id) !== actor.user.id) {
    throw notFound('任务不存在');
  }
  const task = toTask(row);

  // 父任务
  let parent: { id: number; title: string } | null = null;
  if (row.parent_id !== null) {
    const p = await queryOne<{ id: number; title: string }>(
      'SELECT id, title FROM task WHERE id = $1 AND deleted_at IS NULL',
      [Number(row.parent_id)],
    );
    if (p) parent = { id: Number(p.id), title: p.title };
  }

  // 子任务（只取一层）
  const subRows = await query<{ id: number; title: string; status: TaskStatus }>(
    `SELECT id, title, status FROM task
      WHERE parent_id = $1 AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC`,
    [taskId],
  );

  // 进展记录（倒序，最多 50 条）
  const progressRows = await query<{
    id: number;
    content: string;
    user_name: string;
    created_at: Date;
  }>(
    `SELECT tp.id, tp.content, u.name AS user_name, tp.created_at
       FROM task_progress tp
       JOIN app_user u ON u.id = tp.user_id
      WHERE tp.task_id = $1
      ORDER BY tp.created_at DESC, tp.id DESC
      LIMIT 50`,
    [taskId],
  );

  // 附件（挂在任务下的文件）
  const fileRows = await query<{
    id: number;
    name: string;
    size_bytes: string;
    mime_type: string | null;
    created_at: Date;
  }>(
    `SELECT id, name, size_bytes, mime_type, created_at
       FROM file_asset
      WHERE task_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 50`,
    [taskId],
  );

  // 来源（多态引用：meeting / risk / idea）
  let source: TaskSourceInfo | null = null;
  const sourceType = row.source_type;
  const sourceId = row.source_id === null || row.source_id === undefined ? null : Number(row.source_id);
  if (sourceType && sourceId !== null) {
    if (sourceType === 'meeting') {
      const m = await queryOne<{ title: string; start_at: Date }>(
        'SELECT title, start_at FROM meeting WHERE id = $1',
        [sourceId],
      );
      if (m) {
        source = { type: 'meeting', id: sourceId, title: m.title, subtitle: formatTimestamp(m.start_at) };
      }
    } else if (sourceType === 'risk') {
      const r = await queryOne<{ code: string | null; title: string }>(
        'SELECT code, title FROM risk WHERE id = $1',
        [sourceId],
      );
      if (r) source = { type: 'risk', id: sourceId, title: r.title, subtitle: r.code };
    } else {
      const i = await queryOne<{ content: string; created_at: Date }>(
        'SELECT content, created_at FROM idea WHERE id = $1',
        [sourceId],
      );
      if (i) {
        source = {
          type: 'idea',
          id: sourceId,
          title: i.content.slice(0, 40),
          subtitle: formatTimestamp(i.created_at),
        };
      }
    }
  }

  // 关联风险：同项目、未关闭，按等级排
  let relatedRisks: TaskRiskItem[] = [];
  if (row.project_id !== null) {
    const riskRows = await query<{
      id: number;
      code: string | null;
      title: string;
      level: Priority;
      status: string;
    }>(
      `SELECT id, code, title, level, status FROM risk
        WHERE project_id = $1 AND deleted_at IS NULL AND status <> 'resolved'
        ORDER BY CASE level WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, due_date ASC
        LIMIT 5`,
      [Number(row.project_id)],
    );
    relatedRisks = riskRows.map((x) => ({
      id: Number(x.id),
      code: x.code,
      title: x.title,
      level: x.level,
      status: x.status,
    }));
  }

  return {
    ...task,
    parent,
    subtasks: subRows.map((s) => ({ id: Number(s.id), title: s.title, status: s.status })),
    progress: progressRows.map((p) => ({
      id: Number(p.id),
      content: p.content,
      userName: p.user_name,
      createdAt: formatTimestamp(p.created_at),
    })),
    files: fileRows.map((f) => ({
      id: Number(f.id),
      name: f.name,
      sizeBytes: Number(f.size_bytes),
      mimeType: f.mime_type,
      createdAt: formatTimestamp(f.created_at),
    })),
    source,
    relatedRisks,
  };
}

/** 追加一条进展记录（只增不改） */
export async function addTaskProgress(
  taskId: number,
  content: string,
  actor: SessionContext,
): Promise<TaskProgressItem> {
  const row = await queryOne<{ user_id: number }>(
    'SELECT user_id FROM task WHERE id = $1 AND deleted_at IS NULL',
    [taskId],
  );
  if (!row) throw notFound('任务不存在');
  if (actor.user.role !== 'admin' && Number(row.user_id) !== actor.user.id) {
    throw notFound('任务不存在');
  }

  const text = content.trim();
  if (!text || text.length > 2000) throw unprocessable('进展内容需 1 至 2000 个字符');

  const ins = await queryOne<{ id: number; created_at: Date }>(
    `INSERT INTO task_progress (task_id, user_id, content)
     VALUES ($1, $2, $3)
     RETURNING id, created_at`,
    [taskId, actor.user.id, text],
  );
  if (!ins) throw unprocessable('进展写入失败');

  return {
    id: Number(ins.id),
    content: text,
    userName: actor.user.name,
    createdAt: formatTimestamp(ins.created_at),
  };
}
