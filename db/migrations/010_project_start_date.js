/**
 * 010_project_start_date 迁移 —— 2026-11-08。
 *
 * 甘特条左端改用真正的 start_date（原来拿 created_at 顶替，
 * 拖拽改期就变成"改工期"，语义不对）。历史数据按 created_at 回填，视觉不变。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(here, '010_project_start_date.sql');

export const shorthands = undefined;

export async function up(pgm) {
  const sql = readFileSync(SQL_FILE, 'utf8');
  await pgm.sql(sql);
}

export async function down(pgm) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境不允许回滚迁移；数据库迁移默认只向前（执行包 §5.2）');
  }
  await pgm.sql('ALTER TABLE project DROP COLUMN IF EXISTS start_date');
}
