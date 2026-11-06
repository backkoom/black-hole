import type { Paged, Priority, Task, TaskStatus } from '@blackhole/shared/types';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';

/**
 * 任务接口 —— 只用 openapi.yaml 里的 5 个：
 * GET /api/tasks、POST /api/tasks、PUT /api/tasks/:id、
 * PATCH /api/tasks/:id/status、DELETE /api/tasks/:id。
 *
 * 口径（v2 §5.1–§5.3 / 执行包 §6.5）：
 * - keyword 1 至 64，匹配 title 子串；空字符串按未传；
 * - due 筛选三值：today / overdue / week（服务端按 Asia/Shanghai 计算）；
 * - 普通用户强制只看自己，管理员可带 userId；
 * - 新建任务只能归属当前登录用户（POST 没有 userId）；
 * - 状态流转走 PATCH /status：非 done 改 done 写 done_at，已 done 再提交 done 保持原值。
 */

/** due 筛选的三种取值 */
export type TaskDueFilter = 'today' | 'overdue' | 'week';

export interface TaskListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  due?: TaskDueFilter;
  projectId?: number;
  status?: TaskStatus;
  /** 优先级 */
  priority?: Priority;
  /** 负责人 */
  assigneeId?: number;
  /** 分类 */
  category?: string;
  /** 截止日期起（含），YYYY-MM-DD */
  from?: string;
  /** 截止日期止（含），YYYY-MM-DD */
  to?: string;
}

export interface CreateTaskInput {
  title: string;
  projectId?: number | null;
  priority?: Priority;
  dueDate?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  projectId?: number | null;
  priority?: Priority;
  dueDate?: string | null;
}

/** react-query key —— all 是前缀，失效时覆盖下面所有任务查询 */
export const tasksKeys = {
  all: ['tasks'] as const,
  /** 列表：query 里带筛选与分页参数 */
  list: (query: TaskListQuery) => ['tasks', 'list', query] as const,
};

/** 任务列表：默认按 created_at 倒序，分页 20（pageSize 最大 100） */
export async function listTasks(query: TaskListQuery): Promise<Paged<Task>> {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.due) params.set('due', query.due);
  if (query.projectId !== undefined) params.set('projectId', String(query.projectId));
  if (query.status) params.set('status', query.status);
  if (query.priority) params.set('priority', query.priority);
  if (query.assigneeId !== undefined) params.set('assigneeId', String(query.assigneeId));
  if (query.category) params.set('category', query.category);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  return apiGet<Paged<Task>>(`/tasks?${params.toString()}`);
}

/** 新建任务：status 服务端固定为 todo，priority 默认 medium */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  const data = await apiPost<{ task: Task }>('/tasks', input);
  return data.task;
}

/** 修改任务：这里不改 status（状态走 PATCH /status） */
export async function updateTask(id: number, input: UpdateTaskInput): Promise<Task> {
  const data = await apiPut<{ task: Task }>(`/tasks/${id}`, input);
  return data.task;
}

/** 状态流转：todo / doing / done */
export async function updateTaskStatus(id: number, status: TaskStatus): Promise<Task> {
  const data = await apiPatch<{ task: Task }>(`/tasks/${id}/status`, { status });
  return data.task;
}

/** 删除任务：软删（列表、统计、项目进度都不再计入） */
export async function deleteTask(id: number): Promise<null> {
  return apiDelete<null>(`/tasks/${id}`);
}
