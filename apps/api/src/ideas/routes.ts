import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, requireActiveSession } from '../auth/middleware.js';
import { createIdea, deleteIdea, listIdeas } from './service.js';
import { badRequest } from '../lib/errors.js';
import { PAGINATION } from '@workbench/shared/errors';

/**
 * 灵感路由 —— 执行包 §6.4 的 30~32 号接口。
 */

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.defaultPage),
  pageSize: z.coerce.number().int().min(1).max(PAGINATION.maxPageSize).default(PAGINATION.defaultPageSize),
});

const createSchema = z.object({
  content: z.string().min(1).max(2000),
});

const idParamSchema = z.object({ id: z.string().regex(/^[0-9]+$/, 'id 必须是数字') });

function parseId(raw: string): number {
  const parsed = idParamSchema.safeParse({ id: raw });
  if (!parsed.success) throw badRequest('id 必须是数字');
  return Number(parsed.data.id);
}

export async function registerIdeaRoutes(app: FastifyInstance): Promise<void> {
  // 30 GET /api/ideas
  app.get('/api/ideas', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = listQuerySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    // 只返回自己的，管理员也不越权
    return ok(reply, await listIdeas(actor.user.id, q.data.page, q.data.pageSize));
  });

  // 31 POST /api/ideas
  app.post('/api/ideas', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const body = createSchema.safeParse(req.body);
    if (!body.success) throw badRequest('内容需 1 至 2000 字');
    return ok(reply, { idea: await createIdea(body.data.content, actor) });
  });

  // 32 DELETE /api/ideas/:id
  app.delete('/api/ideas/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    await deleteIdea(id, actor);
    return ok(reply, null);
  });
}
