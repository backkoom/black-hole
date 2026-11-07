/**
 * 007_system_setting 迁移 —— 2026-11-08。
 *
 * 运行期可改的系统配置（备份目录/保留份数/开关）。
 * 只放"能在线改"的项；密钥、数据库地址、证书路径仍走环境变量。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(here, '007_system_setting.sql');

export const shorthands = undefined;

export async function up(pgm) {
  await pgm.sql(readFileSync(SQL_FILE, 'utf8'));
}

export async function down(pgm) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境不允许回滚迁移；数据库迁移默认只向前（执行包 §5.2）');
  }
  await pgm.sql('DROP TABLE IF EXISTS system_setting;');
}
