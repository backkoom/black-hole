import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, requireActiveSession } from '../auth/middleware.js';
import {
  createFile,
  createFolder,
  deleteFile,
  deleteFolder,
  getFileStats,
  listFiles,
  listFolders,
} from './service.js';
import { badRequest } from '../lib/errors.js';

/**
 * 文件资料路由 —— 用户端「文件资料」页。
 * ⚠️ 本期只登记元数据，不上传二进制。
 */

const kindEnum = z.enum(['doc', 'sheet', 'slide', 'image', 'pdf', 'archive', 'other']);

const listQuerySchema = z.object({
  folderId: z.coerce.number().int().positive().optional(),
  kind: kindEnum.optional(),
  projectId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(256),
  kind: kindEnum.optional(),
  sizeBytes: z.number().int().min(0).optional(),
  folderId: z.number().int().positive().nullable().optional(),
  projectId: z.number().int().positive().nullable().optional(),
  version: z.string().max(16).optional(),
});

const folderCreateSchema = z.object({
  name: z.string().min(1).max(128),
  projectId: z.number().int().positive().nullable().optional(),
  parentId: z.number().int().positive().nullable().optional(),
});

const folderQuerySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
});

const idParamSchema = z.object({ id: z.string().regex(/^[0-9]+$/, 'id 必须是数字') });

function parseId(raw: string): number {
  const parsed = idParamSchema.safeParse({ id: raw });
  if (!parsed.success) throw badRequest('id 必须是数字');
  return Number(parsed.data.id);
}

export async function registerFileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/files', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = listQuerySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    const userId = actor.user.role === 'admin' ? q.data.userId : actor.user.id;
    return ok(reply, { items: await listFiles({ ...q.data, userId }) });
  });

  app.get('/api/files/summary', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = z.object({ userId: z.coerce.number().int().positive().optional() }).safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    const userId = actor.user.role === 'admin' ? q.data.userId : actor.user.id;
    return ok(reply, await getFileStats(userId));
  });

  app.post('/api/files', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const body = createSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { file: await createFile(body.data, actor) });
  });

  app.delete('/api/files/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    await deleteFile(id, actor);
    return ok(reply, null);
  });

  app.get('/api/folders', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = folderQuerySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    const userId = actor.user.role === 'admin' ? q.data.userId : actor.user.id;
    return ok(reply, { items: await listFolders(userId, q.data.projectId) });
  });

  app.post('/api/folders', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const body = folderCreateSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { folder: await createFolder(body.data, actor) });
  });

  app.delete('/api/folders/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    await deleteFolder(id, actor);
    return ok(reply, null);
  });
}
