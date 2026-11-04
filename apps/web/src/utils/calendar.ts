import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { toCalendarDate } from './datetime';

dayjs.extend(isoWeek);

/**
 * 日历（稿子图4「日程安排」）的月历网格 —— 全部用 dayjs 生成，不自己写日历算法。
 *
 * 口径：
 * - **周一起始**：用 dayjs 的 isoWeek 插件（`startOf('isoweek')` 取本周周一，
 *   `isoWeekday()` 返回 1=周一 … 7=周日），表头与列序都按「一 二 三 四 五 六 日」；
 * - 网格固定 6 行 × 7 列 = 42 格，上月/下月的补位格用 `inMonth=false` 标灰；
 * - 时间点 → 日历日的换算统一走 utils/datetime.ts 的 toCalendarDate（Asia/Shanghai），
 *   这里不重复造时区逻辑。
 */

/** 表头：周一起始 —— 一 二 三 四 五 六 日 */
export const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

/** 月历一格 */
export interface CalendarCell {
  /** YYYY-MM-DD */
  date: string;
  /** 日（1-31） */
  day: number;
  /** 是否属于当前月（false = 补位格） */
  inMonth: boolean;
}

/** 月份键：'2026-10' */
export function monthKeyOf(date: string): string {
  return date.slice(0, 7);
}

/** 月份键加减：shiftMonth('2026-10', -1) → '2026-09' */
export function shiftMonth(key: string, delta: number): string {
  return dayjs(`${key}-01`).add(delta, 'month').format('YYYY-MM');
}

/** 月份标题：'2026-10' → '2026年10月' */
export function formatMonthLabel(key: string): string {
  const parsed = dayjs(`${key}-01`);
  return parsed.isValid() ? parsed.format('YYYY年M月') : key;
}

/** 日加减：addDays('2026-10-20', 1) → '2026-10-21' */
export function addDays(date: string, delta: number): string {
  return dayjs(date).add(delta, 'day').format('YYYY-MM-DD');
}

/** 相差天数（按日历日算，b - a） */
export function diffDays(a: string, b: string): number {
  return dayjs(b).startOf('day').diff(dayjs(a).startOf('day'), 'day');
}

/**
 * 生成月历网格（周一起始，6 行 × 7 列）。
 * @param key 月份键 'YYYY-MM'
 */
export function buildMonthGrid(key: string): CalendarCell[] {
  const first = dayjs(`${key}-01`);
  // isoWeek 插件把本周起点定在周一
  const start = first.startOf('isoWeek');
  return Array.from({ length: 42 }, (_, index) => {
    const cell = start.add(index, 'day');
    return {
      date: cell.format('YYYY-MM-DD'),
      day: cell.date(),
      inMonth: cell.month() === first.month(),
    };
  });
}

/**
 * 时间点 → 东八区的日历日（YYYY-MM-DD）。
 * 内部走 datetime.ts 的 toCalendarDate（已经是 Asia/Shanghai 口径），空值返回空串。
 */
export function shanghaiDayOf(value: string | null | undefined): string {
  return toCalendarDate(value) ?? '';
}

/** 时间点 → 东八区的「M月D日」短日期 */
export function formatMonthDay(value: string | null | undefined): string {
  const day = shanghaiDayOf(value);
  if (!day) return '—';
  const parsed = dayjs(day);
  return parsed.isValid() ? parsed.format('M月D日') : '—';
}

/** 时间点 → 时间戳（毫秒）。带偏移的 ISO 串按偏移解析成正确时刻。 */
export function instantOf(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.valueOf() : Number.NaN;
}

/**
 * 当前时刻（毫秒）—— 走 dayjs，不用裸 Date.now()，
 * 保持与本模块其余部分同一套时间处理口径。
 */
export function nowInstant(): number {
  return dayjs().valueOf();
}

/**
 * 会议接口的 from / to —— 服务端按 start_at（timestamptz）过滤，
 * 所以要传**带时区的完整 ISO**，不能只传 YYYY-MM-DD（那样 to 会落在当天 00:00，
 * 当天后面的会议会被漏掉）。
 *
 * 结束时间取 23:59:59.999，把当天最后一毫秒也包进来（避免与前端按日历日
 * 归组时出现边界差）。
 */
export function isoDayRange(fromDate: string, toDate: string): { from: string; to: string } {
  return {
    from: `${fromDate}T00:00:00.000+08:00`,
    to: `${toDate}T23:59:59.999+08:00`,
  };
}
