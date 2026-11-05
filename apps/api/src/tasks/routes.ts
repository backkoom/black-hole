import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, requireActiveSession } from '../auth/middleware.js';
import {
  createTask,
  deleteTask,
  listTasks,
  updateTask,
  updateTaskStatus,
} from './service.js';
import { badRequest } from '../lib/errors.js';
import { PAGINATION } from '@workbench/shared/errors';

/**
 * 任务路由 —— 执行包 §6.4 的 20~24 号接口。
 */

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.defaultPage),
  pageSize: z.coerce.number().int().min(1).max(PAGINATION.maxPageSize).default(PAGINATION.defaultPageSize),
  keyword: z.string().min(1).max(64).optional(),
  due: z.enum(['today', 'overdue', 'week']).optional(),
  projectId: z.coerce.number().int().positive().optional(),
  status: z.enum(['todo', 'doing', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assigneeId: z.coerce.number().int().positive().optional(),
  category: z.string().min(1).max(32).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  userId: z.coerce.number().int().positive().optional(),
});

const createSchema = z.object({
  title: z.string().min(1).max(256),
  projectId: z.number().int().positive().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须是 YYYY-MM-DD').nullable().optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  category: z.string().min(1).max(32).nullable().optional(),
  reminderAt: z.string().datetime({ offset: true }).nullable().optional(),
  parentId: z.number().int().positive().nullable().optional(),
  startAt: z.string().datetime({ offset: true }).nullable().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(256).optional(),
  projectId: z.number().int().positive().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须是 YYYY-MM-DD').nullable().optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  category: z.string().min(1).max(32).nullable().optional(),
  reminderAt: z.string().datetime({ offset: true }).nullable().optional(),
  parentId: z.number().int().positive().nullable().optional(),
  startAt: z.string().datetime({ offset: true }).nullable().optional(),
});

const statusSchema = z.object({
  status: z.enum(['todo', 'doing', 'done']),
});

const idParamSchema = z.object({ id: z.string().regex(/^[0-9]+$/, 'id 必须是数字') });

function parseId(raw: string): number {
  const parsed = idParamSchema.safeParse({ id: raw });
  if (!parsed.success) throw badRequest('id 必须是数字');
  return Number(parsed.data.id);
}

export async function registerTaskRoutes(app: FastifyInstance): Promise<void> {
  // 20 GET /api/tasks
  app.get('/api/tasks', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = listQuerySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    // ⚠️ 口径必须与 /api/stats/* 一致：
    // 管理员**不传 userId 时看全员**（否则看板显示 0、统计显示 7，同页自相矛盾）；
    // 普通用户强制只看自己。传了 userId 就按它过滤（管理员可自查某人）。
    const scopeUserId = actor.user.role === 'admin' ? q.data.userId : actor.user.id;
    return ok(reply, await listTasks({ ...q.data, userId: scopeUserId }));
  });

  // 21 POST /api/tasks
  app.post('/api/tasks', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const body = createSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { task: await createTask(body.data, actor) });
  });

  // 22 PUT /api/tasks/:id
  app.put('/api/tasks/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    const body = updateSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { task: await updateTask(id, body.data, actor) });
  });

  // 23 PATCH /api/tasks/:id/status
  app.patch('/api/tasks/:id/status', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    const body = statusSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { task: await updateTaskStatus(id, body.data.status, actor) });
  });

  // 24 DELETE /api/tasks/:id
  app.delete('/api/tasks/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    await deleteTask(id, actor);
    return ok(reply, null);
  });
}
