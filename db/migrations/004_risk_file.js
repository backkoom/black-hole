/**
 * 004_risk_file 迁移 —— 2026-11-04（批次 3）。
 *
 * 风险与问题（稿子图8）：一张表用 kind 区分 risk/issue，含等级/影响/概率/状态/应对计划。
 * 文件资料（稿子图7）：**只存元数据**（文件名/类型/大小/版本/上传人），二进制后面接对象存储。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(here, '004_risk_file.sql');

export const shorthands = undefined;

export async function up(pgm) {
  const sql = readFileSync(SQL_FILE, 'utf8');
  await pgm.sql(sql);
}

export async function down(pgm) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境不允许回滚迁移；数据库迁移默认只向前（执行包 §5.2）');
  }
  await pgm.sql('DROP TABLE IF EXISTS file_asset, file_folder, risk CASCADE;');
}
