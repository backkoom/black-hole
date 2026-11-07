import type { FastifyInstance } from 'fastify';
import { ok, requireAdmin } from '../auth/middleware.js';
import { getSystemSettings, updateBackupSettings } from './service.js';

/**
 * 系统设置路由（D-22）。
 * - GET   /api/system/settings  读（管理员可看：备份/存储/证书/版本）
 * - PATCH /api/system/settings  改备份三项（**仅超级管理员**）
 */
export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/system/settings', async (req, reply) => {
    await requireAdmin(req);
    return ok(reply, await getSystemSettings());
  });

  app.patch('/api/system/settings', async (req, reply) => {
    const actor = await requireAdmin(req);
    return ok(reply, { backup: await updateBackupSettings(req.body, actor) });
  });
}
