/**
 * 005_team_collaboration 迁移 —— 2026-11-05。
 *
 * 团队协作补全：公告 / 讨论 / 审批。
 * ⚠️ 建表顺序无外键依赖（announcement→project、discussion→task 都不建外键到 task，
 *    因为 target 是多态的），但 discussion→announcement 的 parent_id 是自引用。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(here, '005_team_collaboration.sql');

export const shorthands = undefined;

export async function up(pgm) {
  const sql = readFileSync(SQL_FILE, 'utf8');
  await pgm.sql(sql);
}

export async function down(pgm) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境不允许回滚迁移；数据库迁移默认只向前（执行包 §5.2）');
  }
  await pgm.sql('DROP TABLE IF EXISTS approval, discussion, announcement CASCADE;');
}
