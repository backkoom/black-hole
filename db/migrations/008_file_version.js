/**
 * 008_file_version 迁移 —— 2026-11-08。
 *
 * 文件版本历史（D-27）：历史版本单独一张表，每版保留自己的磁盘实体。
 * 关键取舍：**不原地覆盖**——覆盖了回滚就拿不回旧内容，等于没有版本。
 *
 * 回填：已有实体文件各记第 1 版（历史登记数据 storage_key 为空，不补）。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(here, '008_file_version.sql');

export const shorthands = undefined;

export async function up(pgm) {
  const sql = readFileSync(SQL_FILE, 'utf8');
  await pgm.sql(sql);
}

export async function down(pgm) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境不允许回滚迁移；数据库迁移默认只向前（执行包 §5.2）');
  }
  await pgm.sql('DROP TABLE IF EXISTS file_version');
  await pgm.sql('ALTER TABLE file_asset DROP COLUMN IF EXISTS version_no');
}
