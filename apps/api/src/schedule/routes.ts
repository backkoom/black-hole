import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, requireActiveSession } from '../auth/middleware.js';
import {
  createMeeting,
  createMilestone,
  deleteMeeting,
  deleteMilestone,
  listMeetings,
  listMilestones,
  updateMilestone,
} from './service.js';
import { badRequest } from '../lib/errors.js';

/**
 * 里程碑与会议路由 —— 用户端「日程安排」「进度追踪」页。
 */

const milestoneCreateSchema = z.object({
  name: z.string().min(1).max(128),
  projectId: z.number().int().positive().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须是 YYYY-MM-DD').nullable().optional(),
  status: z.enum(['pending', 'done']).optional(),
});

const milestoneUpdateSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须是 YYYY-MM-DD').nullable().optional(),
  status: z.enum(['pending', 'done']).optional(),
});

const meetingCreateSchema = z.object({
  title: z.string().min(1).max(128),
  startAt: z.string().min(1),
  endAt: z.string().min(1).nullable().optional(),
  location: z.string().max(128).nullable().optional(),
  projectId: z.number().int().positive().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

const userQuerySchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
});

const meetingQuerySchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
});

const idParamSchema = z.object({ id: z.string().regex(/^[0-9]+$/, 'id 必须是数字') });

function parseId(raw: string): number {
  const parsed = idParamSchema.safeParse({ id: raw });
  if (!parsed.success) throw badRequest('id 必须是数字');
  return Number(parsed.data.id);
}

export async function registerScheduleRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/milestones
  app.get('/api/milestones', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = userQuerySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    const userId = actor.user.role === 'admin' ? q.data.userId : actor.user.id;
    return ok(reply, { items: await listMilestones(userId) });
  });

  // POST /api/milestones
  app.post('/api/milestones', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const body = milestoneCreateSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { milestone: await createMilestone(body.data, actor) });
  });

  // PATCH /api/milestones/:id
  app.patch('/api/milestones/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    const body = milestoneUpdateSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { milestone: await updateMilestone(id, body.data, actor) });
  });

  // DELETE /api/milestones/:id
  app.delete('/api/milestones/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    await deleteMilestone(id, actor);
    return ok(reply, null);
  });

  // GET /api/meetings
  app.get('/api/meetings', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = meetingQuerySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    const userId = actor.user.role === 'admin' ? q.data.userId : actor.user.id;
    return ok(reply, { items: await listMeetings(userId, { from: q.data.from, to: q.data.to }) });
  });

  // POST /api/meetings
  app.post('/api/meetings', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const body = meetingCreateSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { meeting: await createMeeting(body.data, actor) });
  });

  // DELETE /api/meetings/:id
  app.delete('/api/meetings/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    await deleteMeeting(id, actor);
    return ok(reply, null);
  });
}
