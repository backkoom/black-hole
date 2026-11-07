import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 测试环境准备：加载 .env，固定 NODE_ENV=test。
 * 生产/验收不读 .env（只用进程环境变量）；测试本地读。
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');

try {
  const envFile = readFileSync(join(root, '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    const key = m?.[1];
    if (key && process.env[key] === undefined) {
      process.env[key] = (m?.[2] ?? '').replace(/^["']|["']$/g, '');
    }
  }
} catch {
  // 没有 .env 就用进程环境变量
}

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';

// 文件上传用例：把上限压到 1MB，不用真造 50MB 文件；存储目录也隔离到 test-files，
// 免得测试把开发环境的实体混在一起（跑完由 files.test.ts 清空）
process.env.MAX_UPLOAD_MB = process.env.MAX_UPLOAD_MB ?? '1';
process.env.FILE_STORAGE_DIR = process.env.FILE_STORAGE_DIR ?? '.data/test-files';
