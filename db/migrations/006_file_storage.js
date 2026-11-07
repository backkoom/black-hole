/**
 * 006_file_storage 迁移 —— 2026-11-07。
 *
 * 文件资料从"只登记元数据"升级为"真能上传下载"：
 *   storage_key  相对存储根的路径（2026/11/<uuid>.pdf），NULL = 只有登记信息没有实体
 *   mime_type    上传时浏览器给的类型，下载时原样回给浏览器
 *   sha256       内容摘要，用于校验落盘完整性、将来做秒传/去重
 *
 * ⚠️ 不改 size_bytes 的含义：仍然是真实字节数（上传时以实际写入为准，
 *    不信任客户端声明的大小）。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(here, '006_file_storage.sql');

export const shorthands = undefined;

export async function up(pgm) {
  const sql = readFileSync(SQL_FILE, 'utf8');
  await pgm.sql(sql);
}

export async function down(pgm) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境不允许回滚迁移；数据库迁移默认只向前（执行包 §5.2）');
  }
  await pgm.sql(`
    ALTER TABLE file_asset
      DROP COLUMN IF EXISTS storage_key,
      DROP COLUMN IF EXISTS mime_type,
      DROP COLUMN IF EXISTS sha256;
  `);
}
