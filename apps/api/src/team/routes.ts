import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, requireActiveSession } from '../auth/middleware.js';
import {
  createAnnouncement,
  createApproval,
  createDiscussion,
  decideApproval,
  deleteAnnouncement,
  deleteDiscussion,
  listAnnouncements,
  listApprovals,
  listDiscussions,
  updateAnnouncement,
} from './service.js';
import { badRequest } from '../lib/errors.js';

/**
 * 团队协作 —— 公告 / 讨论 / 审批。
 *
 * 口径说明：
 * - 公告/讨论：全员可读
 * - 审批：`scope=mine` = 待我审批（assignee 是我）；`submitted` = 我提交的；
 *   不带 scope 时，管理员看全部、普通用户看「指派给我的 + 我提交的」
 */

const idParamSchema = z.object({ id: z.string().regex(/^[0-9]+$/, 'id 必须是数字') });

function parseId(raw: string): number {
  const parsed = idParamSchema.safeParse({ id: raw });
  if (!parsed.success) throw badRequest('id 必须是数字');
  return Number(parsed.data.id);
}

const announcementQuerySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const announcementCreateSchema = z.object({
  title: z.string().min(1).max(128),
  content: z.string().max(8000).optional(),
  projectId: z.number().int().positive().nullable().optional(),
  pinned: z.boolean().optional(),
});

const announcementUpdateSchema = announcementCreateSchema.partial();

const discussionQuerySchema = z.object({
  targetType: z.enum(['task', 'project']).optional(),
  targetId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const discussionCreateSchema = z.object({
  targetType: z.enum(['task', 'project']),
  targetId: z.number().int().positive(),
  content: z.string().min(1).max(4000),
  parentId: z.number().int().positive().nullable().optional(),
});

const approvalQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  scope: z.enum(['mine', 'submitted', 'all']).optional(),
});

const approvalCreateSchema = z.object({
  kind: z.string().min(1).max(32).optional(),
  title: z.string().min(1).max(128),
  detail: z.string().max(8000).nullable().optional(),
  targetType: z.enum(['task', 'project']).nullable().optional(),
  targetId: z.number().int().positive().nullable().optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
});

const decisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().max(4000).nullable().optional(),
});

export async function registerTeamRoutes(app: FastifyInstance): Promise<void> {
  /* ── 公告 ── */

  app.get('/api/announcements', async (req, reply) => {
    await requireActiveSession(req);
    const q = announcementQuerySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    return ok(reply, await listAnnouncements(q.data));
  });

  app.post('/api/announcements', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const body = announcementCreateSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { announcement: await createAnnouncement(body.data, actor) });
  });

  app.put('/api/announcements/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    const body = announcementUpdateSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { announcement: await updateAnnouncement(id, body.data, actor) });
  });

  app.delete('/api/announcements/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    await deleteAnnouncement(id, actor);
    return ok(reply, null);
  });

  /* ── 讨论 ── */

  app.get('/api/discussions', async (req, reply) => {
    await requireActiveSession(req);
    const q = discussionQuerySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    return ok(reply, await listDiscussions(q.data));
  });

  app.post('/api/discussions', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const body = discussionCreateSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { discussion: await createDiscussion(body.data, actor) });
  });

  app.delete('/api/discussions/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    await deleteDiscussion(id, actor);
    return ok(reply, null);
  });

  /* ── 审批 ── */

  app.get('/api/approvals', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = approvalQuerySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    const scope = q.data.scope ?? (actor.user.role === 'admin' ? 'all' : 'mine');
    return ok(
      reply,
      await listApprovals({ ...q.data, scope, scopeUserId: actor.user.id }),
    );
  });

  app.post('/api/approvals', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const body = approvalCreateSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { approval: await createApproval(body.data, actor) });
  });

  app.post('/api/approvals/:id/decision', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    const body = decisionSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { approval: await decideApproval(id, body.data, actor) });
  });
}
