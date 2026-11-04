/**
 * 002_user_side_fields 迁移 —— 2026-11-04。
 *
 * 用户端 10 个页面（总览/看板/任务/日程/进度/协作/文件/风险/统计/设置）需要：
 *  - task 有负责人、分类、提醒时间、父任务（子任务计数）
 *  - project 有图标、主题色、当前阶段、成员
 *
 * 管理员端（账号管理、组织架构、工作台模板）不受影响。
 * 全部向后兼容：新增列可空、新表独立，不动既有列。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(here, '002_user_side_fields.sql');

export const shorthands = undefined;

export async function up(pgm) {
  const sql = readFileSync(SQL_FILE, 'utf8');
  await pgm.sql(sql);
}

export async function down(pgm) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境不允许回滚迁移；数据库迁移默认只向前（执行包 §5.2）');
  }
  await pgm.sql('DROP TABLE IF EXISTS project_member CASCADE;');
  await pgm.sql(`
    ALTER TABLE task
      DROP COLUMN IF EXISTS assignee_id,
      DROP COLUMN IF EXISTS category,
      DROP COLUMN IF EXISTS reminder_at,
      DROP COLUMN IF EXISTS parent_id;
    ALTER TABLE project
      DROP COLUMN IF EXISTS icon,
      DROP COLUMN IF EXISTS color,
      DROP COLUMN IF EXISTS phase;
  `);
}
