import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, requireActiveSession } from '../auth/middleware.js';
import { createRisk, deleteRisk, getRiskStats, listRisks, updateRisk } from './service.js';
import { badRequest } from '../lib/errors.js';

/**
 * 风险与问题路由 —— 用户端「风险问题管理」页。
 */

const levelEnum = z.enum(['low', 'medium', 'high']);

const listQuerySchema = z.object({
  kind: z.enum(['risk', 'issue']).optional(),
  level: levelEnum.optional(),
  status: z.enum(['open', 'handling', 'resolved']).optional(),
  projectId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
});

const createSchema = z.object({
  title: z.string().min(1).max(256),
  kind: z.enum(['risk', 'issue']).optional(),
  code: z.string().max(32).nullable().optional(),
  projectId: z.number().int().positive().nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  level: levelEnum.optional(),
  impact: levelEnum.nullable().optional(),
  probability: levelEnum.nullable().optional(),
  ownerId: z.number().int().positive().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  responsePlan: z.string().max(4000).nullable().optional(),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(['open', 'handling', 'resolved']).optional(),
});

const idParamSchema = z.object({ id: z.string().regex(/^[0-9]+$/, 'id 必须是数字') });

function parseId(raw: string): number {
  const parsed = idParamSchema.safeParse({ id: raw });
  if (!parsed.success) throw badRequest('id 必须是数字');
  return Number(parsed.data.id);
}

export async function registerRiskRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/risks
  app.get('/api/risks', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = listQuerySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    const userId = actor.user.role === 'admin' ? q.data.userId : actor.user.id;
    return ok(reply, { items: await listRisks({ ...q.data, userId }) });
  });

  // GET /api/risks/summary
  app.get('/api/risks/summary', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = z.object({ userId: z.coerce.number().int().positive().optional() }).safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    const userId = actor.user.role === 'admin' ? q.data.userId : actor.user.id;
    return ok(reply, await getRiskStats(userId));
  });

  // POST /api/risks
  app.post('/api/risks', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const body = createSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { risk: await createRisk(body.data, actor) });
  });

  // PUT /api/risks/:id
  app.put('/api/risks/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    const body = updateSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { risk: await updateRisk(id, body.data, actor) });
  });

  // PATCH /api/risks/:id/status
  app.patch('/api/risks/:id/status', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    const body = z.object({ status: z.enum(['open', 'handling', 'resolved']) }).safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { risk: await updateRisk(id, { status: body.data.status }, actor) });
  });

  // DELETE /api/risks/:id
  app.delete('/api/risks/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    await deleteRisk(id, actor);
    return ok(reply, null);
  });
}
