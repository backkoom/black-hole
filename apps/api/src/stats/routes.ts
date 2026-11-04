import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, requireActiveSession } from '../auth/middleware.js';
import {
  getCategoryDistribution,
  getOverview,
  getProgressDistribution,
  getTaskStats,
  getTeamWorkload,
  getTrend,
} from './service.js';
import { badRequest } from '../lib/errors.js';

/**
 * 统计路由 —— 执行包 §6.4 的 33/34 号接口。
 * 管理员可带 userId 查全员；普通用户忽略 userId，只看自己。
 */

const querySchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
});

const trendQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
  userId: z.coerce.number().int().positive().optional(),
});

export async function registerStatsRoutes(app: FastifyInstance): Promise<void> {
  // 33 GET /api/stats/overview
  app.get('/api/stats/overview', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = querySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    // 管理员不传 userId → 统计全员（与任务列表同口径）；普通用户强制只看自己
    const userId = actor.user.role === 'admin' ? q.data.userId : actor.user.id;
    return ok(reply, await getOverview(userId));
  });

  // 35 GET /api/stats/trend —— 任务完成趋势（按天）
  app.get('/api/stats/trend', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = trendQuerySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    const userId = actor.user.role === 'admin' ? q.data.userId : actor.user.id;
    return ok(reply, await getTrend(q.data.days, userId));
  });

  // 36 GET /api/stats/distribution —— 项目进度分布 + 任务分类分布
  app.get('/api/stats/distribution', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = querySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    const userId = actor.user.role === 'admin' ? q.data.userId : actor.user.id;
    const [buckets, categories] = await Promise.all([
      getProgressDistribution(userId),
      getCategoryDistribution(userId),
    ]);
    return ok(reply, { buckets: buckets.buckets, categories: categories.categories });
  });

  // 37 GET /api/stats/team-workload —— 团队工作量
  app.get('/api/stats/team-workload', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = querySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    const userId = actor.user.role === 'admin' ? q.data.userId : actor.user.id;
    return ok(reply, await getTeamWorkload(userId));
  });

  // 34 GET /api/stats/tasks
  app.get('/api/stats/tasks', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = querySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    const userId = actor.user.role === 'admin' ? q.data.userId : actor.user.id;
    return ok(reply, await getTaskStats(userId));
  });
}
