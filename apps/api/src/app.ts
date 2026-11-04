import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { ApiError } from './lib/errors.js';
import { checkMustChange, checkSameOrigin, getSession, sendApiError } from './auth/middleware.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerOrgRoutes } from './org/routes.js';
import { registerUserRoutes } from './users/routes.js';
import { registerWorkspaceRoutes } from './workspace/routes.js';
import { registerTaskRoutes } from './tasks/routes.js';
import { registerProjectRoutes } from './projects/routes.js';
import { registerStatsRoutes } from './stats/routes.js';
import { registerIdeaRoutes } from './ideas/routes.js';
import { registerScheduleRoutes } from './schedule/routes.js';
import { registerRiskRoutes } from './risks/routes.js';
import { registerFileRoutes } from './files/routes.js';
import { getConfig } from './config.js';

/**
 * Fastify 实例 —— 执行包 §4.1 / §6.1 / §6.3 / D-06。
 * 统一响应 `{code,message,data}`；所有框架异常映射成同一格式，不返回堆栈。
 */

/**
 * 容错解析 `Content-Type: application/json` 但**body 为空**的请求。
 *
 * ⚠️ Fastify 默认行为：JSON content-type + 空 body → 解析报错 → 500。
 * 而 DELETE /api/tasks/:id 这类接口前端常常「带 content-type 但没有 body」，
 * 就会莫名其妙 500（E2E agent 实测复现）。这里把空 body 解析成 undefined，
 * 让路由能正常走到参数校验。
 */
function registerLenientJsonParser(app: FastifyInstance): void {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body: string, done) => {
      if (body === undefined || body === null || body.trim() === '') {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );
}

export async function buildApp(): Promise<FastifyInstance> {
  const cfg = getConfig();

  const app = Fastify({
    logger: {
      level: cfg.LOG_LEVEL,
      base: undefined,
    },
    // requestId 贯穿日志与错误响应
    genReqId: () => randomUUID(),
    bodyLimit: 2 * 1024 * 1024, // JSON 2MB（§6.1）
    trustProxy: true,
  });

  // 容错 JSON 解析（必须先移除 Fastify 内置的，否则同类型重复注册会报
  // FST_ERR_CTP_ALREADY_PRESENT）
  app.removeContentTypeParser('application/json');
  registerLenientJsonParser(app);

  await app.register(cookie);
  await app.register(multipart, {
    limits: {
      fileSize: 2 * 1024 * 1024, // 导入单文件 2MB —— 必须显式设置，不用默认值
      files: 1,
    },
    // ⚠️ 不要开 attachFieldsToBody：它会先消费掉 multipart 流，
    // 导致 req.file() 返回 null（导入接口取不到文件）。
    // 导入路由改用 req.parts() 自己收字段与文件。
  });

  // Origin/Referer 同源校验放在最前（D-05）；随后是 must_change 全局拦截
  app.addHook('onRequest', async (req) => {
    checkSameOrigin(req);
    // 有会话且必须改密 → 非白名单接口一律 403（即使该接口尚未实现，也不会先落进 404）
    const session = await getSession(req);
    checkMustChange(req, session);
  });

  // 全局错误处理（D-06）
  app.setErrorHandler((err: unknown, req, reply) => {
    // 业务错误
    if (err instanceof ApiError) {
      return sendApiError(reply, err);
    }

    // zod 校验失败 → 400，可读文案
    if (err instanceof ZodError) {
      const message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；');
      return reply.status(400).send({ code: 400, message: message || '请求参数不合法' });
    }

    const e = err as { statusCode?: number; code?: string; validation?: unknown };

    // Fastify 的 schema 校验失败
    if (e.validation) {
      return reply.status(400).send({ code: 400, message: '请求参数不合法' });
    }

    // 请求体/上传文件超限 → 413
    if (
      e.statusCode === 413 ||
      e.code === 'FST_ERR_CTP_BODY_TOO_LARGE' ||
      e.code === 'FST_REQ_FILE_TOO_LARGE'
    ) {
      return reply.status(413).send({ code: 413, message: '请求体超过大小限制' });
    }

    // 路由不存在 → 404
    if (e.statusCode === 404 || e.code === 'FST_ERR_NOT_FOUND') {
      return reply.status(404).send({ code: 404, message: '资源不存在' });
    }

    // 其余一律 500：只记 requestId，不回堆栈
    req.log.error({ err, reqId: req.id }, 'unhandled error');
    return reply.status(500).send({
      code: 500,
      message: '服务器内部错误',
      data: { requestId: req.id },
    });
  });

  // 未匹配到路由 → 统一 404
  app.setNotFoundHandler((req, reply) => {
    return reply.status(404).send({ code: 404, message: '资源不存在' });
  });

  await registerAuthRoutes(app);
  await registerOrgRoutes(app);
  await registerUserRoutes(app);
  await registerWorkspaceRoutes(app);
  await registerTaskRoutes(app);
  await registerProjectRoutes(app);
  await registerStatsRoutes(app);
  await registerIdeaRoutes(app);
  await registerScheduleRoutes(app);
  await registerRiskRoutes(app);
  await registerFileRoutes(app);

  return app;
}
