import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, requireActiveSession } from '../auth/middleware.js';
import { badRequest } from '../lib/errors.js';
import {
  countUnread,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  syncDueNotifications,
} from './service.js';

/**
 * 站内通知路由（D-28）。
 *
 * - GET  /api/notifications             ← 拉列表（顺带补算今天的到期/逾期提醒）
 * - POST /api/notifications/:id/read    ← 单条已读
 * - POST /api/notifications/read-all    ← 全部已读
 *
 * 只有"自己的"通知，没有管理员视角 —— 通知天然是私人的，管理员要看待办就去看任务。
 */

const listQuerySchema = z.object({
  unreadOnly: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const idParamSchema = z.object({ id: z.string().regex(/^[0-9]+$/, 'id 必须是数字') });

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/notifications', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = listQuerySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');

    // 先补算再取，保证"今天刚到的任务"第一次打开就能看到提醒
    await syncDueNotifications(actor.user.id);

    const [items, unreadCount] = await Promise.all([
      listNotifications(actor.user.id, { unreadOnly: q.data.unreadOnly, limit: q.data.limit }),
      countUnread(actor.user.id),
    ]);
    return ok(reply, { items, unreadCount });
  });

  app.post('/api/notifications/read-all', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const updated = await markAllNotificationsRead(actor.user.id);
    return ok(reply, { updated });
  });

  app.post('/api/notifications/:id/read', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const parsed = idParamSchema.safeParse(req.params);
    if (!parsed.success) throw badRequest('id 必须是数字');
    await markNotificationRead(actor.user.id, Number(parsed.data.id));
    return ok(reply, null);
  });
}
