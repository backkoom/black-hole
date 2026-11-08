import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, requireActiveSession } from '../auth/middleware.js';
import {
  createProject,
  getProjectMembers,
  isProjectMember,
  listMemberCandidates,
  setProjectMembers,
  deleteProject,
  getProjectDetail,
  listProjects,
  updateProject,
} from './service.js';
import { badRequest, notFound } from '../lib/errors.js';
import { queryOne } from '../db.js';
import { PAGINATION } from '@blackhole/shared/errors';

/**
 * 项目路由 —— 执行包 §6.4 的 25~29 号接口。
 */

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.defaultPage),
  pageSize: z.coerce.number().int().min(1).max(PAGINATION.maxPageSize).default(PAGINATION.defaultPageSize),
  userId: z.coerce.number().int().positive().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(128),
  owner: z.string().max(64).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须是 YYYY-MM-DD').nullable().optional(),
  icon: z.string().max(16).nullable().optional(),
  color: z.string().max(16).nullable().optional(),
  phase: z.string().max(64).nullable().optional(),
});

const updateSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须是 YYYY-MM-DD').nullable().optional(),
  name: z.string().min(1).max(128).optional(),
  owner: z.string().max(64).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须是 YYYY-MM-DD').nullable().optional(),
  icon: z.string().max(16).nullable().optional(),
  color: z.string().max(16).nullable().optional(),
  phase: z.string().max(64).nullable().optional(),
});

const idParamSchema = z.object({ id: z.string().regex(/^[0-9]+$/, 'id 必须是数字') });

function parseId(raw: string): number {
  const parsed = idParamSchema.safeParse({ id: raw });
  if (!parsed.success) throw badRequest('id 必须是数字');
  return Number(parsed.data.id);
}

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  // 25 GET /api/projects
  app.get('/api/projects', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const q = listQuerySchema.safeParse(req.query);
    if (!q.success) throw badRequest('查询参数不合法');
    // ⚠️ 口径必须与 /api/stats/* 一致：管理员不传 userId 时看全员；普通用户只看自己。
    const userId = actor.user.role === 'admin' ? q.data.userId : actor.user.id;
    return ok(reply, await listProjects({ ...q.data, userId }));
  });

  // 26 POST /api/projects
  app.post('/api/projects', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const body = createSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(reply, { project: await createProject(body.data, actor.user.id) });
  });

  // 27 GET /api/projects/:id
  app.get('/api/projects/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    const detail = await getProjectDetail(id);
    // 归属校验：归属人 / 项目成员 / 管理员可看，其余 404（不泄露存在性，§6.3 + D-30）
    if (actor.user.role !== 'admin' && detail.project.userId !== actor.user.id) {
      const member = await isProjectMember(id, actor.user.id);
      if (!member) throw notFound('项目不存在');
    }
    return ok(reply, detail);
  });

  // 28 PUT /api/projects/:id
  app.put('/api/projects/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    const body = updateSchema.safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    return ok(
      reply,
      { project: await updateProject(id, body.data, actor.user.id, actor.user.role === 'admin') },
    );
  });

  // 30a GET /api/projects/member-candidates —— 选人下拉（登录即可，字段只有 id/姓名/账号）
  app.get('/api/projects/member-candidates', async (req, reply) => {
    await requireActiveSession(req);
    return ok(reply, { items: await listMemberCandidates() });
  });

  // 30 GET /api/projects/:id/members —— 成员/归属人/管理员都能看
  app.get('/api/projects/:id/members', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    const row = await queryOne<{ user_id: number }>(
      'SELECT user_id FROM project WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    if (!row) throw notFound('项目不存在');
    if (
      actor.user.role !== 'admin' &&
      Number(row.user_id) !== actor.user.id &&
      !(await isProjectMember(id, actor.user.id))
    ) {
      throw notFound('项目不存在');
    }
    return ok(reply, { items: await getProjectMembers(id) });
  });

  // 31 PUT /api/projects/:id/members —— 整表替换（归属人 / 管理员）
  app.put('/api/projects/:id/members', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    const body = z
      .object({ userIds: z.array(z.number().int().positive()).max(200) })
      .safeParse(req.body);
    if (!body.success) throw badRequest('参数不合法');
    const items = await setProjectMembers(
      id,
      body.data.userIds,
      actor.user.id,
      actor.user.role === 'admin',
    );
    return ok(reply, { items });
  });

  // 29 DELETE /api/projects/:id
  app.delete('/api/projects/:id', async (req, reply) => {
    const actor = await requireActiveSession(req);
    const id = parseId((req.params as { id: string }).id);
    await deleteProject(id, actor.user.id, actor.user.role === 'admin');
    return ok(reply, null);
  });
}
