import { z } from 'zod';

/**
 * 环境变量校验 —— 执行包 §4.3。
 * 缺关键变量直接退出，不用默认密码兜底。
 */

const boolish = (v: string | undefined) => v === 'true' || v === '1';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL 必填'),

  TZ: z.string().default('Asia/Shanghai'),

  /** 生产/验收必须是真实 https 域名，不带末尾斜杠 */
  APP_ORIGIN: z.string().min(1, 'APP_ORIGIN 必填').refine((v) => !v.endsWith('/'), 'APP_ORIGIN 不能带末尾斜杠'),

  /** 生产/验收必须为 true */
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => boolish(v))
    .refine((v) => v || true),

  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),

  /** 种子初始口令；不设置则种子时随机生成 12 位并只打印一次 */
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_USER_PASSWORD: z.string().optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /**
   * 组织架构的最大层级数（D-07）。
   * 业务上限，不写死在数据库里；客户交付后可自行调大，不需要改表、不需要数据迁移。
   */
  MAX_ORG_LEVEL: z.coerce.number().int().min(2).max(32).default(32),

  /** pg 连接池上限（D-13：500 人规模设 20，不要按人数设） */
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),

  /** 单条 SQL 超时（毫秒）。管理员可查全员统计 = 12 万行聚合，必须有上限 */
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`环境变量校验失败，进程退出：\n${detail}`);
  }
  const cfg = parsed.data;

  if (cfg.NODE_ENV === 'production') {
    if (!cfg.COOKIE_SECURE) throw new Error('生产环境 COOKIE_SECURE 必须为 true');
    if (!cfg.APP_ORIGIN.startsWith('https://')) {
      throw new Error('生产环境 APP_ORIGIN 必须是 https:// 开头');
    }
  }
  return cfg;
}

/** 进程内单例；首次调用即校验，失败直接抛（由 server.ts 捕获后退出） */
export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}
