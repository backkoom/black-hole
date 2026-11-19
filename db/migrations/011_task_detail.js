import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(here, '011_task_detail.sql');

export const shorthands = undefined;

export async function up(pgm) {
  const sql = readFileSync(SQL_FILE, 'utf8');
  await pgm.sql(sql);
}

export async function down(pgm) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境不允许回滚迁移；数据库迁移默认只向前（执行包 §5.2）');
  }
  await pgm.sql('DROP TABLE IF EXISTS task_progress');
  await pgm.sql('ALTER TABLE task DROP CONSTRAINT IF EXISTS task_source_type_chk');
  await pgm.sql(
    'ALTER TABLE task DROP COLUMN IF EXISTS source_type, DROP COLUMN IF EXISTS source_id',
  );
  await pgm.sql('ALTER TABLE file_asset DROP COLUMN IF EXISTS task_id');
}
