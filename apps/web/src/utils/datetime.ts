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
  return toCalendarDate(value) ?? '—';
}

/**
 * 把接口返回的日期归一化成 `YYYY-MM-DD` 的日历日（Asia/Shanghai）。
 *
 * ⚠️ 实际接口（`apps/api` 用 node-postgres 读 `date` 列）返回的是完整 ISO 时间戳，
 * 例如 `2026-11-02T16:00:00.000Z` —— 按东八区换算回来正好是 `2026-11-03`。
 * 所以这里两种格式都认：已经是 `YYYY-MM-DD` 的原样返回，
 * 带时间的按 Asia/Shanghai 取日历日（**不是**浏览器本地时区）。
 */
export function toCalendarDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = dayjs(value);
  if (!parsed.isValid()) return null;
  return parsed.tz('Asia/Shanghai').format('YYYY-MM-DD');
}

/**
 * 把接口返回的日期解析成 dayjs（按字面量解析成当天 00:00，不做时区换算）。
 *
 * 接口可能给 `YYYY-MM-DD`，也可能给 ISO 时间戳 —— 都先归一化成日历日再解析。
 */
export function parseDateOnly(value: string | null | undefined): Dayjs | null {
  const calendarDate = toCalendarDate(value);
  if (!calendarDate) return null;
  const parsed = dayjs(calendarDate);
  return parsed.isValid() ? parsed : null;
}

/** dayjs → `YYYY-MM-DD`（接口只接受日历日，不带时间） */
export function toDateOnly(value: Dayjs | null | undefined): string | null {
  if (!value || !value.isValid()) return null;
  return value.format('YYYY-MM-DD');
}

/**
 * 本周（周一至周日）的 7 个日历日 —— Asia/Shanghai。
 *
 * 服务端 `due=week` 用的就是「周一 00:00 至周日 23:59」（apps/api/src/lib/serialize.ts
 * 的 thisWeekRange），前端要按同一口径分组，所以这里也用东八区计算。
 */
export function currentWeekDates(): string[] {
  const now = dayjs().tz('Asia/Shanghai');
  // dayjs 的 day() 是 0=周日；换算成「距周一多少天」
  const daysSinceMonday = (now.day() + 6) % 7;
  const monday = now.subtract(daysSinceMonday, 'day').startOf('day');
  return Array.from({ length: 7 }, (_, i) => monday.add(i, 'day').format('YYYY-MM-DD'));
}

/** 中文星期（周一 ~ 周日），用于日历模块 */
export function weekdayLabel(date: string): string {
  const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const parsed = dayjs(date);
  return parsed.isValid() ? (labels[parsed.day()] ?? '') : '';
}

/**
 * 今天的日历日（Asia/Shanghai）—— 统一走东八区，不用浏览器本地时区。
 */
export function todayShanghaiDate(): string {
  return dayjs().tz('Asia/Shanghai').format('YYYY-MM-DD');
}

/**
 * 最近 n 天的日历日（升序，最后一个是今天）—— 指标卡的迷你折线图用它取横轴。
 */
export function recentShanghaiDates(count: number): string[] {
  const today = dayjs().tz('Asia/Shanghai').startOf('day');
  return Array.from({ length: count }, (_, index) =>
    today.subtract(count - 1 - index, 'day').format('YYYY-MM-DD'),
  );
}

/**
 * 中文长日期 —— 2026年10月20日。
 * 入参可以是日历日（YYYY-MM-DD）或带时区的时间戳，都会先归一化成东八区日历日。
 */
export function formatChineseDate(value: string | null | undefined): string {
  const calendarDate = toCalendarDate(value);
  if (!calendarDate) return '—';
  const parsed = dayjs(calendarDate);
  return parsed.isValid() ? parsed.format('YYYY年M月D日') : '—';
}

/**
 * 中文长日期 + 星期 —— 2026年10月20日 星期一。
 * 页面顶部的日期用它（东八区）。
 */
export function formatChineseDateWithWeekday(value: string | null | undefined): string {
  const calendarDate = toCalendarDate(value);
  if (!calendarDate) return '—';
  const parsed = dayjs(calendarDate);
  if (!parsed.isValid()) return '—';
  return `${parsed.format('YYYY年M月D日')} ${weekdayLabel(calendarDate)}`;
}
