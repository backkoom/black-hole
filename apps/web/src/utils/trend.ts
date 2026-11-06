import type { Task } from '@blackhole/shared/types';
import { recentShanghaiDates, toCalendarDate } from './datetime';

/**
 * 指标卡趋势 —— 全部从**真实接口返回的数据**算出来，不编造。
 *
 * 数据来源是 GET /api/tasks 的完整列表（apps/web/src/api/tasks.ts 的 listAllTasks），
 * 每条任务带 createdAt（创建时间）与 doneAt（完成时间），
 * 于是可以还原出：
 * - 每天新增任务数（按 createdAt 分桶）；
 * - 每天完成任务数（按 doneAt 分桶）；
 * - 每天结束时的**未完成存量**（创建于当天或更早，且当天或更晚才完成 / 至今未完成）。
 *
 * 横轴固定最近 7 天（东八区），与设计稿的迷你折线图一一对应。
 */
export const TREND_DAYS = 7;

/** 按天分桶：返回最近 7 天每天的数量（升序，最后一天是今天） */
function bucketByDate(dates: (string | null)[], days: string[]): number[] {
  const counts = new Map<string, number>(days.map((day) => [day, 0]));
  for (const value of dates) {
    const day = toCalendarDate(value);
    if (day && counts.has(day)) {
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }
  return days.map((day) => counts.get(day) ?? 0);
}

/** 按天分桶（对外）：入参是任意一组时间戳（项目创建时间、任务完成时间等） */
export function dailyDateSeries(
  dates: (string | null | undefined)[],
  days: number = TREND_DAYS,
): number[] {
  return bucketByDate(
    dates.map((value) => value ?? null),
    recentShanghaiDates(days),
  );
}

/** 每天新增任务数 */
export function dailyCreatedSeries(tasks: Task[], days: number = TREND_DAYS): number[] {
  return dailyDateSeries(
    tasks.map((task) => task.createdAt),
    days,
  );
}

/** 每天完成任务数 */
export function dailyDoneSeries(tasks: Task[], days: number = TREND_DAYS): number[] {
  return dailyDateSeries(
    tasks.map((task) => task.doneAt),
    days,
  );
}

/**
 * 每天结束时的未完成存量。
 * 任务在 day 当天结束仍未完成 ⇔ 创建于 day 或更早，且（未完成 或 完成于 day 之后）。
 */
export function dailyOpenSeries(tasks: Task[], days: number = TREND_DAYS): number[] {
  const calendarDays = recentShanghaiDates(days);
  return calendarDays.map((day) => {
    let open = 0;
    for (const task of tasks) {
      const createdDay = toCalendarDate(task.createdAt);
      if (!createdDay || createdDay > day) continue;
      const doneDay = toCalendarDate(task.doneAt);
      if (doneDay && doneDay <= day) continue;
      open += 1;
    }
    return open;
  });
}

/**
 * 涨跌值 = 最近一天 与 前一天 的差（正数向上、负数向下）。
 * 序列不足两天或两天相同则返回 0（指标卡不显示涨跌）。
 */
export function seriesDelta(series: number[]): number {
  if (series.length < 2) return 0;
  const last = series[series.length - 1] ?? 0;
  const prev = series[series.length - 2] ?? 0;
  return last - prev;
}

/** 序列求和（用于「近 7 天共 N 项」这类说明文字） */
export function seriesSum(series: number[]): number {
  return series.reduce((sum, value) => sum + value, 0);
}
