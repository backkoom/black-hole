/**
 * 时间戳序列化 —— D-04。
 *
 * 要求：时间戳输出 ISO 8601 带 +08:00（如 2026-11-02T19:15:54+08:00）。
 * pg 驱动把 timestamptz 转成 JS Date，toISOString() 会输出 Z（UTC），不符合契约。
 * 连接层已固定 timezone=Asia/Shanghai，这里负责把它转成 +08:00 的固定偏移格式。
 */

const OFFSET_MS = 8 * 60 * 60 * 1000;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** Date → 'YYYY-MM-DDTHH:mm:ss+08:00' */
export function formatTimestamp(date: Date | string | null | undefined): string | null {
  if (date === null || date === undefined) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  // 统一换算到东八区后手工拼装，避免受服务器本地时区影响
  const shifted = new Date(d.getTime() + OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const mo = pad(shifted.getUTCMonth() + 1);
  const d_ = pad(shifted.getUTCDate());
  const h = pad(shifted.getUTCHours());
  const mi = pad(shifted.getUTCMinutes());
  const s = pad(shifted.getUTCSeconds());
  return `${y}-${mo}-${d_}T${h}:${mi}:${s}+08:00`;
}

/** Date → 'YYYY-MM-DD'（date 类型列，不带时间） */
export function formatDate(date: Date | string | null | undefined): string | null {
  if (date === null || date === undefined) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const shifted = new Date(d.getTime() + OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** 今天（服务器时区 Asia/Shanghai）—— 用于 due=today 等筛选 */
export function todayString(): string {
  return formatDate(new Date()) as string;
}

/**
 * 本周起止（自然周：周一 00:00 至周日 23:59）。
 * 周起始日固定周一，不做用户自定义（workspace.md §1.4：一旦可配，两个人看到的完成率就不一样）。
 */
export function thisWeekRange(now = new Date()): { start: string; end: string } {
  const shifted = new Date(now.getTime() + OFFSET_MS);
  const dow = shifted.getUTCDay(); // 0=周日
  const daysSinceMonday = (dow + 6) % 7;
  const start = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - daysSinceMonday));
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return { start: formatDate(start) as string, end: formatDate(end) as string };
}
