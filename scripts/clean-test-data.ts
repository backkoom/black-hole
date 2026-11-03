import { cleanTestData } from '../apps/api/test/helpers.js';
import { closePool } from '../apps/api/src/db.js';

/**
 * 把开发库恢复到种子状态。
 *
 * 测试用的账号（tester01 / locker01 / changepw01 …）会在跑完后留在库里，
 * 既污染 Phase 2 的账号列表验收，也让下次跑测试的断言莫名其妙。
 * 根 package.json 的 `test` 脚本会在 vitest 跑完后自动调它。
 *
 * ⚠️ vitest 2.x 没有 globalTeardown（实测整个 dist 里都没这个词），所以用 npm script 串联。
 */
async function main(): Promise<void> {
  try {
    await cleanTestData();
    console.log('开发库已恢复到种子状态（测试残留已清理）');
  } finally {
    await closePool();
  }
}

void main();
