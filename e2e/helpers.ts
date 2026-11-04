import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

/**
 * E2E 公共工具。
 *
 * 口令从仓库根 .env 读取，不写死在测试里、不进仓库。
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

export function readEnv(): Record<string, string> {
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

export function adminPassword(): string {
  const v = readEnv().SEED_ADMIN_PASSWORD;
  if (!v) throw new Error('SEED_ADMIN_PASSWORD 未设置');
  return v;
}

async function withPool(fn: (pool: Pool) => Promise<void>): Promise<void> {
  const env = readEnv();
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL 未设置');
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await fn(pool);
  } finally {
    await pool.end();
  }
}

/**
 * 把种子 admin 重置为「未改密 + 已知密码」状态。
 *
 * 必须在**每个测试前后**调用：改密测试会把 admin 的密码真的改掉，
 * 不重置的话后续测试用种子口令登录会 401。
 *
 * ⚠️ 这里必须保持 must_change_password = **true** ——
 * auth.spec.ts 就是靠它验「首次登录强制改密」的拦截。
 * 需要正常进入页面的测试（如 workspace.spec.ts）要另外调 clearMustChange()。
 */
export async function resetAdmin(): Promise<void> {
  const env = readEnv();
  const password = env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error('SEED_ADMIN_PASSWORD 未设置');
  const hash = await bcrypt.hash(password, 12);
  await withPool(async (pool) => {
    await pool.query(
      `UPDATE app_user
          SET password_hash = $1, must_change_password = true,
              status = 'active', failed_attempts = 0, locked_until = NULL
        WHERE account = 'admin'`,
      [hash],
    );
    // 清掉历史会话，保证从干净状态开始
    await pool.query('DELETE FROM session');
  });
}

/**
 * 清掉 admin 的「必须改密」标记。
 *
 * ⚠️ 为什么需要它：种子 admin 的 must_change_password=true 是**有意**的，
 * 登录后会被 onRequest 层强制弹到改密页 —— 那样任何要进页面的 E2E
 * 都只会看到改密表单（这就是 workspace.spec.ts 之前 7 条全挂的原因）。
 * 改密流程本身由 auth.spec.ts 验，两者互不影响。
 */
export async function clearMustChange(): Promise<void> {
  await withPool(async (pool) => {
    await pool.query(
      "UPDATE app_user SET must_change_password = false WHERE account = 'admin'",
    );
  });
}
