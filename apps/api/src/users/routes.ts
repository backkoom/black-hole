import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, requireActiveSession, requireAdmin } from '../auth/middleware.js';
import { createUser, listUsers, resetPassword, updateUser } from './service.js';
import { importTemplateCsv, importUsers, parseImportCsv } from './import.js';
import { badRequest, forbidden, unprocessable } from '../lib/errors.js';
import { PAGINATION } from '@blackhole/shared/errors';

/**
 * 账号管理路由 —— 执行包 §6.4 的 9~14 号接口。
 *
 * 权限：
 *  - 列表 / 新增 / 导入 / 模板 / 重置密码：仅管理员
 *  - 编辑：管理员，或本人（但本人只能改 name）
 */

const idParamSchema = z.object({ id: z.string().regex(/^[0-9]+$/, 'id 必须是数字') });

function parseId(raw: string): number {
  const parsed = idParamSchema.safeParse({ id: raw });
  if (!parsed.success) throw badRequest('id 必须是数字');
  return Number(parsed.data.id);
}

const createSchema = z.object({
  account: z.string().min(4).max(64),
  name: z.string().min(1).max(64),
  orgId: z.number().int().positive(),
  role: z.enum(['user', 'admin']).optional(),
});

/** 编辑：字段白名单按身份区分（本人只能 name） */
const EDIT_FIELDS_ADMIN = ['name', 'orgId', 'status', 'role'];
const EDIT_FIELDS_SELF = ['name'];

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.defaultPage),
  pageSize: z.coerce.number().int().min(1).max(PAGINATION.maxPageSize).default(PAGINATION.defaultPageSize),
  keyword: z.string().min(1).max(64).optional(),
  orgId: z.coerce.number().int().positive().optional(),
  role: z.enum(['admin', 'user']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  userId: z.coerce.number().int().positive().optional(),
});

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  // 9 GET /api/users
  app.get('/api/users', async (req, reply) => {
    await requireAdmin(req);
    const q = listQuerySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    return ok(reply, await listUsers(q.data));
  });

  // 10 POST /api/users
  app.post('/api/users', async (req, reply) => {
    const actor = await requireAdmin(req);
    const body = createSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    const { user, initialPassword } = await createUser(body.data, actor);
    return ok(reply, { user, initialPassword });
  });

  // 11 PUT /api/users/:id
  app.put('/api/users/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const targetId = parseId((req.params as { id: string }).id);
    const isSelf = targetId === actor.user.id;
    const isAdmin = actor.user.role === 'admin';
    if (!isSelf && !isAdmin) throw forbidden('没有权限');

    // D-01：按身份做字段白名单 —— 本人带其他字段 403，管理员带未知字段 422
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const allowed = isSelf ? EDIT_FIELDS_SELF : EDIT_FIELDS_ADMIN;
    const extra = Object.keys(raw).filter((k) => !allowed.includes(k));
    if (extra.length > 0) {
      if (isSelf && !isAdmin) {
        throw forbidden('本人只能修改姓名');
      }
      throw unprocessable(`不支持的字段：${extra.join('、')}`);
    }

    const parsed = z
      .object({
        name: z.string().min(1).max(64).optional(),
        orgId: z.number().int().positive().optional(),
        status: z.enum(['active', 'disabled']).optional(),
        role: z.enum(['admin', 'user']).optional(),
      })
      .safeParse(raw);
    if (!parsed.success) throw badRequest('参数不合法');

    return ok(reply, { user: await updateUser(targetId, parsed.data, actor) });
  });

  // 12 POST /api/users/:id/reset-password
  app.post('/api/users/:id/reset-password', async (req, reply) => {
    const actor = await requireAdmin(req);
    const targetId = parseId((req.params as { id: string }).id);
    return ok(reply, await resetPassword(targetId, actor));
  });

  // 13 POST /api/users/import
  app.post('/api/users/import', async (req, reply) => {
    const actor = await requireAdmin(req);

    // 自己遍历 multipart：既不用 attachFieldsToBody（它与 req.file() 冲突，
    // 会让 req.file() 返回 null），也不用依赖字段在文件之前到达。
    let orgIdRaw: string | undefined;
    let fileBuffer: Buffer | undefined;
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
      } else if (part.fieldname === 'orgId') {
        orgIdRaw = String(part.value);
      }
    }

    if (!fileBuffer) throw badRequest('请上传 CSV 文件');
    const orgId = Number(orgIdRaw);
    if (!Number.isInteger(orgId) || orgId <= 0) throw badRequest('请选择部门');

    const parsed = parseImportCsv(fileBuffer);
    return ok(reply, await importUsers(parsed, orgId, actor));
  });

  // 14 GET /api/users/import/template
  app.get('/api/users/import/template', async (req, reply) => {
    await requireAdmin(req);
    // 成功时直接返回 text/csv 文件流，不包统一 JSON（§6.1 例外）
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="users-template.csv"');
    // 带 BOM，Excel 打开中文不乱码
    return reply.send(`\ufeff${importTemplateCsv()}`);
  });
}
