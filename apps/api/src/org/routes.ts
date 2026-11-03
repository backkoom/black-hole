import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, requireAdmin } from '../auth/middleware.js';
import { createOrg, deleteOrg, getOrgTree, updateOrg } from './service.js';
import { badRequest } from '../lib/errors.js';

/**
 * 组织架构路由 —— 执行包 §6.4 的 5~8 号接口。
 * 全部仅管理员可见（v2 §2.2 能力矩阵）。
 */

const idParamSchema = z.object({
  id: z.string().regex(/^[0-9]+$/, 'id 必须是数字'),
});

const createSchema = z.object({
  parentId: z.number().int().positive(),
  name: z.string().min(1).max(64),
});

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  parentId: z.number().int().positive().optional(),
  sort: z.number().int().min(0).optional(),
});

/** :id 用 bigint 字符串解析；非法 id 返回 400，不查库 */
function parseId(raw: string): number {
  const parsed = idParamSchema.safeParse({ id: raw });
  if (!parsed.success) throw badRequest('id 必须是数字');
  return Number(parsed.data.id);
}

export async function registerOrgRoutes(app: FastifyInstance): Promise<void> {
  // 5 GET /api/org/tree
  app.get('/api/org/tree', async (req, reply) => {
    await requireAdmin(req);
    return ok(reply, { nodes: await getOrgTree() });
  });

  // 6 POST /api/org
  app.post('/api/org', async (req, reply) => {
    await requireAdmin(req);
    const body = createSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    const name = body.data.name.trim();
    if (!name) throw badRequest('名称不能为空');
    return ok(reply, { node: await createOrg(body.data.parentId, name) });
  });

  // 7 PUT /api/org/:id
  app.put('/api/org/:id', async (req, reply) => {
    await requireAdmin(req);
    const id = parseId((req.params as { id: string }).id);
    const body = updateSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    const input: { name?: string; parentId?: number; sort?: number } = {};
    if (body.data.name !== undefined) input.name = body.data.name.trim();
    if (body.data.parentId !== undefined) input.parentId = body.data.parentId;
    if (body.data.sort !== undefined) input.sort = body.data.sort;
    return ok(reply, { node: await updateOrg(id, input) });
  });

  // 8 DELETE /api/org/:id
  app.delete('/api/org/:id', async (req, reply) => {
    await requireAdmin(req);
    const id = parseId((req.params as { id: string }).id);
    await deleteOrg(id);
    return ok(reply, null);
  });
}
