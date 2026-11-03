import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, requireAdmin, requireActiveSession } from '../auth/middleware.js';
import {
  getMyWorkspace,
  getTemplate,
  updateMyLayout,
  updateMyWorkspaceMeta,
  updateTemplate,
} from './service.js';
import { badRequest } from '../lib/errors.js';

/**
 * 工作台与模板路由 —— 执行包 §6.4 的 15~19 号接口。
 *
 * 15 GET  /api/workspace/template   仅管理员
 * 16 PUT  /api/workspace/template   仅管理员，带 version，冲突 409
 * 17 GET  /api/workspace            当前用户（没有则复制模板）
 * 18 PUT  /api/workspace            名称/副标题，**不参与 version**
 * 19 PUT  /api/workspace/layout     带 version，冲突 409
 */

const layoutSchema = z.object({
  version: z.number().int().min(1),
  items: z.array(z.unknown()),
});

const metaSchema = z.object({
  name: z.string().max(128).optional(),
  subtitle: z.string().max(256).optional(),
});

const templateSchema = z.object({
  name: z.string().max(128).optional(),
  subtitle: z.string().max(256).optional(),
  version: z.number().int().min(1),
  items: z.array(z.unknown()),
});

export async function registerWorkspaceRoutes(app: FastifyInstance): Promise<void> {
  // 15 GET /api/workspace/template
  app.get('/api/workspace/template', async (req, reply) => {
    await requireAdmin(req);
    return ok(reply, await getTemplate());
  });

  // 16 PUT /api/workspace/template
  app.put('/api/workspace/template', async (req, reply) => {
    await requireAdmin(req);
    const body = templateSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, await updateTemplate(body.data));
  });

  // 17 GET /api/workspace
  app.get('/api/workspace', async (req, reply) => {
    const session = await requireActiveSession(req);
    return ok(reply, await getMyWorkspace(session.user.id));
  });

  // 18 PUT /api/workspace
  app.put('/api/workspace', async (req, reply) => {
    const session = await requireActiveSession(req);
    const body = metaSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, await updateMyWorkspaceMeta(session.user.id, body.data));
  });

  // 19 PUT /api/workspace/layout
  app.put('/api/workspace/layout', async (req, reply) => {
    const session = await requireActiveSession(req);
    const body = layoutSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, await updateMyLayout(session.user.id, body.data));
  });
}
