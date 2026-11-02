/**
 * 001_init 迁移 —— D-10。
 *
 * DDL 的唯一基线是同目录的 `001_init.sql`（人可读、可 diff、可直接用 psql 验证）。
 * node-pg-migrate 只加载 .js/.ts，所以用这个极薄的包装器读 .sql 执行，
 * **不维护第二份 schema**，避免漂移。
 *
 * 只向前：生产环境不允许回滚（执行包 §5.2）。
 *
 * ⚠️ 本文件是 .js，不能写 TypeScript 类型注解（node-pg-migrate 用 require 加载）。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(here, '001_init.sql');

export const shorthands = undefined;

export async function up(pgm) {
  const sql = readFileSync(SQL_FILE, 'utf8');
  await pgm.sql(sql);
}

export async function down(pgm) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境不允许回滚迁移；数据库迁移默认只向前（执行包 §5.2）');
  }
  // 开发环境：逆序删除 8 张表
  await pgm.sql(
    'DROP TABLE IF EXISTS idea, task, project, workspace_layout, workspace, session, app_user, org CASCADE;',
  );
}
