import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

/**
 * E2E 全局准备：把种子 admin 重置成「未改密 + 已知密码」状态，
 * 保证每次跑 E2E 的起点一致（测试之间共享数据库）。
 *
 * 口令从仓库根 .env 读取，不写死在测试里、不进仓库。
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const text = readFileSync(join(root, '.env'), 'utf8');
    for (const line of text.split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      const key = m?.[1];
      if (key) out[key] = (m?.[2] ?? '').replace(/^["']|["']$/g, '');
    }
  } catch {
    // 用进程环境变量
  }
  return { ...process.env, ...out } as Record<string, string>;
}

export default async function globalSetup(): Promise<void> {
  const env = readEnv();
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL 未设置，无法准备 E2E 数据');

  const password = env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error('SEED_ADMIN_PASSWORD 未设置，无法准备 E2E 数据');

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `UPDATE app_user
          SET password_hash = $1, must_change_password = true,
              status = 'active', failed_attempts = 0, locked_until = NULL
        WHERE account = 'admin'`,
      [hash],
    );
    // 清掉历史会话，保证从干净状态开始
    await pool.query('DELETE FROM session');
  } finally {
    await pool.end();
  }
}
