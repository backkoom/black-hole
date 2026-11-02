import { resetAdmin } from './helpers';

/**
 * E2E 全局准备：整轮跑之前把种子 admin 重置为「未改密 + 已知密码」状态。
 * （每个测试的前置重置在 auth.spec.ts 的 beforeEach 里做）
 */

export default async function globalSetup(): Promise<void> {
  await resetAdmin();
}
