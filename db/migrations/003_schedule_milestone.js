/**
 * 003_schedule_milestone 迁移 —— 2026-11-04（批次 2）。
 *
 * 用户端「日程安排」页要画时间轴（稿子图4 的「09:00-10:00 项目周会」），
 * 任务现在只有 due_date 一个日期点，画不出时间段 → task 加 start_at。
 *
 * 「项目里程碑」（稿子图5）与「会议」（稿子图4/图6）需要独立实体 → 建表。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(here, '003_schedule_milestone.sql');

export const shorthands = undefined;

export async function up(pgm) {
  const sql = readFileSync(SQL_FILE, 'utf8');
  await pgm.sql(sql);
}

export async function down(pgm) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境不允许回滚迁移；数据库迁移默认只向前（执行包 §5.2）');
  }
  await pgm.sql('DROP TABLE IF EXISTS meeting, milestone CASCADE;');
  await pgm.sql('ALTER TABLE task DROP COLUMN IF EXISTS start_at;');
}
