import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
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

/**
 * 日期列（due_date / 项目截止日）—— 接口给的是 `YYYY-MM-DD` 的**日历日**，
 * 服务端已按 Asia/Shanghai 产出，这里原样展示，不做任何时区换算。
 */
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return '—';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '—';
}

/** 把 `YYYY-MM-DD` 解析成 dayjs（按字面量解析成当天 00:00，不做时区换算） */
export function parseDateOnly(value: string | null | undefined): Dayjs | null {
  if (!value) return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
}

/** dayjs → `YYYY-MM-DD`（接口只接受日历日，不带时间） */
export function toDateOnly(value: Dayjs | null | undefined): string | null {
  if (!value || !value.isValid()) return null;
  return value.format('YYYY-MM-DD');
}
