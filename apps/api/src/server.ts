import { buildApp } from './app.js';
import { getConfig } from './config.js';
import { closePool } from './db.js';
import { purgeExpiredSessions } from './auth/service.js';

/**
 * 入口 —— 执行包 §9.3。
 * 启动顺序：校验环境变量（缺关键变量直接退出）→ 建 app → listen → 起会话清理任务。
 */

/** 会话清理任务：每日一次；先用 setInterval，文档写清 */
const SESSION_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  let cfg;
  try {
    cfg = getConfig();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await closePool();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // ⚠️ 生产只绑 127.0.0.1（nginx 同源反代）；开发默认 0.0.0.0 方便局域网调试
  const host = cfg.HOST || (cfg.NODE_ENV === 'development' || cfg.NODE_ENV === 'test' ? '0.0.0.0' : '127.0.0.1');
  await app.listen({ port: cfg.PORT, host });
  app.log.info({ port: cfg.PORT, host }, 'listening');

  // 会话清理：立即跑一次，之后每 24 小时一次
  const runCleanup = async (): Promise<void> => {
    try {
      const n = await purgeExpiredSessions();
      if (n > 0) app.log.info({ removed: n }, 'expired sessions purged');
    } catch (err) {
      app.log.error({ err }, 'session cleanup failed');
    }
  };
  await runCleanup();
  const timer = setInterval(() => void runCleanup(), SESSION_CLEANUP_INTERVAL_MS);
  timer.unref();
}

main().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
