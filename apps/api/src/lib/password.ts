import { getConfig } from '../config.js';
import { hashInPool, verifyInPool } from './password-pool.js';

/**
 * 密码 —— 执行包 §3.3 / §6.5。
 *
 * 算法仍是 bcrypt（不引入 native 依赖），但做了两件事（D-13 规模验证的结论）：
 *  1. 计算放进 worker 线程池：bcryptjs 是纯 JS，cost=12 一次约 466ms，
 *     跑在主线程上会把整个 API 卡住（500 人导入实测 188 秒，期间谁都用不了）；
 *  2. 成本档位改成环境变量 `BCRYPT_COST`（8~15，默认 12）：
 *     500 人一次导入的场景可以降到 10（实测 141ms/次），改配置不用改代码。
 *
 * 策略：8 至 64 位，至少一个字母和一个数字；不要求特殊字符。
 */

export function hashPassword(plain: string): Promise<string> {
  return hashInPool(plain, getConfig().BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return verifyInPool(plain, hash);
}

/** 是否满足密码策略 */
export function meetsPasswordPolicy(pw: string): boolean {
  if (pw.length < 8 || pw.length > 64) return false;
  return /[A-Za-z]/.test(pw) && /[0-9]/.test(pw);
}

/** 策略校验的 zod schema（用于请求体校验） */
export const passwordSchema = {
  min: 8,
  max: 64,
  check: (pw: string) => /[A-Za-z]/.test(pw) && /[0-9]/.test(pw),
  message: '密码需 8 至 64 位，且至少包含一个字母和一个数字',
};

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 从字符表随机取一个 */
function pick(): string {
  return ALPHABET[Math.floor(Math.random() * ALPHABET.length)] ?? 'a';
}

/**
 * 生成随机初始密码（12 位，必须满足密码策略：至少一个字母 + 一个数字）。
 * 用于管理员重置密码与批量导入的初始密码。
 */
export function generateInitialPassword(length = 12): string {
  const chars: string[] = [];
  // 先保证至少一个数字与一个字母，其余随机
  chars.push(ALPHABET[Math.floor(Math.random() * 26)] ?? 'a'); // 字母
  chars.push(ALPHABET[26 + Math.floor(Math.random() * 22)] ?? '7'); // 数字
  for (let i = chars.length; i < length; i += 1) {
    chars.push(pick());
  }
  // 洗牌，避免固定位置
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = chars[i] as string;
    chars[i] = chars[j] as string;
    chars[j] = tmp;
  }
  return chars.join('');
}
