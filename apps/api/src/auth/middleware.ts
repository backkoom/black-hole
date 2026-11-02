import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiError, forbidden, unauthorized } from '../lib/errors.js';
import { parseCookieHeader, hashSessionToken } from '../lib/session.js';
import { resolveSession, type SessionContext } from './service.js';
import { getConfig } from '../config.js';

/**
 * 中间件 —— D-05：固定顺序 **Origin 同源校验 → 登录态 → must_change**。
 * 顺序不能换：CSRF 检查放最前；must_change 放最后，避免把「没登录」误报成「要改密」。
 */

/** 必须改密时仍放行的接口（执行包 §3.3） */
const MUST_CHANGE_ALLOWED = new Set(['/api/auth/me', '/api/auth/password', '/api/auth/logout']);

/** Origin / Referer 同源校验（所有非 GET） */
export function checkSameOrigin(req: FastifyRequest): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  const cfg = getConfig();
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  let source: string | null = null;
  if (typeof origin === 'string' && origin.length > 0) {
    source = origin;
  } else if (typeof referer === 'string' && referer.length > 0) {
    try {
      source = new URL(referer).origin;
    } catch {
      source = null;
    }
  }

  // 没有 Origin 也没有 Referer：非浏览器客户端（如 curl / E2E）放行，
  // 但必须显式带上 Origin，否则浏览器发起的跨站请求会被挡住。
  if (!source) return;

  if (source !== cfg.APP_ORIGIN) {
    throw forbidden('请求来源不被信任');
  }
}

/** 取当前会话；无有效会话返回 null */
export async function getSession(req: FastifyRequest): Promise<SessionContext | null> {
  const cookieHeader = req.headers.cookie;
  const token = parseCookieHeader(cookieHeader, 'sid');
  if (!token) return null;
  return resolveSession(hashSessionToken(token));
}

/** 要求已登录 */
export async function requireSession(req: FastifyRequest): Promise<SessionContext> {
  const session = await getSession(req);
  if (!session) throw unauthorized();
  return session;
}

/** 要求已登录且已改密 */
export async function requireActiveSession(req: FastifyRequest): Promise<SessionContext> {
  const session = await requireSession(req);
  const path = req.routeOptions?.url ?? req.url;
  if (session.mustChangePassword && !MUST_CHANGE_ALLOWED.has(path)) {
    throw forbidden('请先修改初始密码');
  }
  return session;
}

/** 统一响应包装（执行包 §6.1） */
export function ok<T>(reply: FastifyReply, data: T, message = 'ok'): FastifyReply {
  return reply.send({ code: 0, message, data });
}

/** 业务错误 → 统一响应体 */
export function sendApiError(reply: FastifyReply, err: ApiError): FastifyReply {
  return reply.status(err.statusCode).send({
    code: err.code,
    message: err.message,
    ...(err.data === undefined ? {} : { data: err.data }),
  });
}
