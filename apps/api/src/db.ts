import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { getConfig } from './config.js';

/**
 * 数据库连接 —— D-04 / D-13。
 * - 连接层固定 timezone=Asia/Shanghai，时间戳序列化才稳定带 +08:00
 * - 连接池上限 20（500 人规模；不是 10，也不是按人数设）
 * - 每条语句配 statement_timeout，避免一次手滑拖垮连接池
 */

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const cfg = getConfig();
  pool = new Pool({
    connectionString: cfg.DATABASE_URL,
    max: cfg.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // 时区固定，不依赖机器时区
    options: `-c timezone=${cfg.TZ}`,
  });
  pool.on('error', (err) => {
    // 后台池错误不能吞掉，否则连接会静默失效
    console.error('[db] 连接池错误:', err.message);
  });
  return pool;
}

/** 带超时参数执行一条查询 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const cfg = getConfig();
  const client = await getPool().connect();
  try {
    await client.query(`SET statement_timeout = ${Number(cfg.DB_STATEMENT_TIMEOUT_MS)}`);
    const res = await client.query<T>(text, params as unknown[]);
    return res.rows;
  } finally {
    client.release();
  }
}

/** 取一行 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** 在事务里执行；回调抛错则回滚 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
