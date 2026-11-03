import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import tz from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(tz);

/**
 * 时间展示 —— pages.md 全局设计基线：一律按 Asia/Shanghai 显示，不用浏览器本地时区。
 *
 * 注意：服务端返回的是带 +08:00 的 ISO 字符串（如 2026-11-03T08:15:54+08:00），
 * 直接 `dayjs.tz(字符串, 'Asia/Shanghai')` 会把字符串当 UTC 解析，少 8 小时；
 * 所以先按字符串里的偏移解析成时间点，再换算到东八区。
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = dayjs(value).tz('Asia/Shanghai');
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '—';
}
