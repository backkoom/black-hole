import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, requireActiveSession } from '../auth/middleware.js';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import {
  createFile,
  createFolder,
  deleteFile,
  deleteFolder,
  getDownloadTarget,
  getFileStats,
  listFiles,
  listFolders,
  saveUploadedFile,
} from './service.js';
import {
  buildStorageKey,
  contentDisposition,
  kindOf,
  maxUploadBytes,
  removeBlob,
  resolveKey,
  writeStream,
} from './storage.js';
import { badRequest, notFound, payloadTooLarge } from '../lib/errors.js';

/**
 * 文件资料路由 —— 用户端「文件资料」页。
 *
 * 2026-11-07 起支持真实上传/下载（D-19）：
 * - POST /api/files/upload   multipart，落盘 + 写元数据，单个文件超过 MAX_UPLOAD_MB 直接 413
 * - GET  /api/files/:id/download  流式下载，中文名走 RFC 5987
 * - 只登记元数据的老接口 POST /api/files 仍保留（历史数据/外部导入用），但产出的行 hasFile=false
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

  // 上传（multipart）
  app.post('/api/files/upload', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const limit = maxUploadBytes();
    const tooLargeMessage = `单个文件不能超过 ${Math.round(limit / 1024 / 1024)} MB`;

    let originalName = '';
    let mimeType = 'application/octet-stream';
    let storageKey: string | null = null;
    let written: { sizeBytes: number; sha256: string } | null = null;
    let folderId: number | null = null;
    let projectId: number | null = null;
    let truncated = false;

    // 自己遍历 parts：字段可能排在文件之后到达，不能用 req.file() 一条路走到底
    for await (const part of req.parts({ limits: { fileSize: limit, files: 1 } })) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file') {
          part.file.resume();
          continue;
        }
        // 只取文件名本身：某些客户端会把完整路径塞进 filename
        originalName = (part.filename ?? '').split(/[\\/]/).pop() || '未命名文件';
        mimeType = part.mimetype || 'application/octet-stream';
        storageKey = buildStorageKey(originalName);
        // ⚠️ 超限时 @fastify/multipart 会让文件流直接报错（RequestFileTooLargeError），
        // pipeline 抛出后这里必须自己把半截文件删掉 —— 否则每被拒一次就多一个垃圾文件。
        try {
          written = await writeStream(part.file, storageKey);
        } catch (err) {
          await removeBlob(storageKey);
          if (part.file.truncated) throw payloadTooLarge(tooLargeMessage);
          throw err;
        }
        if (part.file.truncated) {
          await removeBlob(storageKey);
          truncated = true;
        }
      } else if (part.fieldname === 'folderId') {
        const n = Number(part.value);
        if (Number.isInteger(n) && n > 0) folderId = n;
      } else if (part.fieldname === 'projectId') {
        const n = Number(part.value);
        if (Number.isInteger(n) && n > 0) projectId = n;
      }
    }

    // 超限时流已经被截断并写了一部分，必须把半截文件删掉再报错
    if (truncated) throw payloadTooLarge(tooLargeMessage);
    if (!storageKey || !written) throw badRequest('请选择要上传的文件');

    const file = await saveUploadedFile(
      {
        name: originalName,
        kind: kindOf(mimeType, originalName),
        mimeType,
        sizeBytes: written.sizeBytes,
        storageKey,
        sha256: written.sha256,
        folderId,
        projectId,
      },
      actor,
    );
    return ok(reply, { file });
  });

  // 下载（流式）
  app.get('/api/files/:id/download', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    const target = await getDownloadTarget(id, actor);
    const abs = resolveKey(target.storageKey);

    // 数据库有记录但磁盘上没有 → 明确告知，别抛 500
    try {
      await access(abs);
    } catch {
      throw notFound('文件实体已丢失，请联系管理员从备份恢复');
    }

    reply.header('Content-Type', target.mimeType ?? 'application/octet-stream');
    reply.header('Content-Disposition', contentDisposition(target.name));
    reply.header('Content-Length', String(target.sizeBytes));
    // ⚠️ 这里**不要**再设 X-Content-Type-Options：nginx 已经在 server 级统一加了，
    //    Fastify 看不到反代后加的响应头，条件判断也拦不住，结果就是两个同名头。
    //    安全性由 nginx 保证（见 deploy/nginx-https*.conf）。
    return reply.send(createReadStream(abs));
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
