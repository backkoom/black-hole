import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, requireActiveSession } from '../auth/middleware.js';
import { getOverview, getTaskStats } from './service.js';
import { badRequest } from '../lib/errors.js';

/**
 * 统计路由 —— 执行包 §6.4 的 33/34 号接口。
 * 管理员可带 userId 查全员；普通用户忽略 userId，只看自己。
 */

const querySchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
});

export async function registerStatsRoutes(app: FastifyInstance): Promise<void> {
  // 33 GET /api/stats/overview
  app.get('/api/stats/overview', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = querySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    const userId = actor.user.role === 'admin' ? (q.data.userId ?? actor.user.id) : actor.user.id;
    return ok(reply, await getOverview(userId));
  });

  // 34 GET /api/stats/tasks
  app.get('/api/stats/tasks', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = querySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    const userId = actor.user.role === 'admin' ? (q.data.userId ?? actor.user.id) : actor.user.id;
    return ok(reply, await getTaskStats(userId));
  });
}
