import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * 会话 token —— 执行包 §3.3 / §9.3。
 * - Cookie 里放原始 token，**数据库里只存 hash**
 * - 校验时用 timingSafeEqual，避免时序侧信道
 */

const TOKEN_BYTES = 32;

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 常量时间比较两个 hash */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** 从 Cookie 头里取 sid */
export function parseCookieHeader(header: string | undefined, name = 'sid'): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}
