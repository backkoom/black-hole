import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, requireSession } from './middleware.js';
import { changePassword, destroySession, login, toUser, findUserById } from './service.js';
import { badRequest, forbidden, unauthorized } from '../lib/errors.js';
import { hashSessionToken, parseCookieHeader } from '../lib/session.js';
import { meetsPasswordPolicy } from '../lib/password.js';
import { getConfig } from '../config.js';

/**
 * 认证路由 —— 执行包 §6.4 的 1~4 号接口。
 * 路径与方法与契约完全一致：/api/auth/login、/logout、/me、/password
 */

const loginSchema = z.object({
  account: z.string().min(1, '账号必填').max(64),
  password: z.string().min(1, '密码必填').max(128),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '原密码必填').max(128),
  newPassword: z.string().min(1, '新密码必填').max(128),
});

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const cfg = getConfig();

  // 1 POST /api/auth/login
  app.post('/api/auth/login', async (req, reply) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) {
      throw badRequest('请输入账号和密码');
    }

    const result = await login(body.data.account, body.data.password);

    if (!result.ok) {
      if (result.reason === 'locked') {
        throw forbidden('账号已锁定，请 10 分钟后再试');
      }
      // 统一提示，不泄露账号是否存在
      throw unauthorized('账号或密码错误');
    }

    reply.setCookie('sid', result.token, {
      path: '/',
      httpOnly: true,
      secure: cfg.COOKIE_SECURE,
      sameSite: 'lax',
      maxAge: cfg.SESSION_TTL_DAYS * 24 * 60 * 60,
    });

    return ok(reply, { user: result.user });
  });

  // 2 POST /api/auth/logout
  app.post('/api/auth/logout', async (req, reply) => {
    const token = parseCookieHeader(req.headers.cookie, 'sid');
    if (token) {
      await destroySession(hashSessionToken(token));
    }
    reply.clearCookie('sid', { path: '/' });
    return ok(reply, null);
  });

  // 3 GET /api/auth/me —— must_change 时也允许
  app.get('/api/auth/me', async (req, reply) => {
    const session = await requireSession(req);
    return ok(reply, { user: session.user });
  });

  // 4 PUT /api/auth/password
  app.put('/api/auth/password', async (req, reply) => {
    const body = changePasswordSchema.safeParse(req.body);
    if (!body.success) {
      throw badRequest('请填写原密码和新密码');
    }
    if (!meetsPasswordPolicy(body.data.newPassword)) {
      throw badRequest('新密码需 8 至 64 位，且至少包含一个字母和一个数字');
    }
    if (body.data.oldPassword === body.data.newPassword) {
      throw badRequest('新密码不能与原密码相同');
    }

    const session = await requireSession(req);
    const result = await changePassword(
      session.user.id,
      body.data.oldPassword,
      body.data.newPassword,
      session.tokenHash,
    );
    if (!result.ok) {
      throw badRequest(result.message ?? '修改失败');
    }

    // 改密后刷新一次用户信息返回
    const fresh = await findUserById(session.user.id);
    if (fresh) {
      return ok(reply, { user: toUser(fresh) });
    }
    return ok(reply, null);
  });
}
