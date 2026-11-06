import type { Dayjs } from 'dayjs';
import type { Project } from '@blackhole/shared/types';
import { parseDateOnly } from '../../utils/datetime';

/**
 * 甘特图时间轴计算 —— 纯函数，不碰 React。
 *
 * 口径说明：
 * - 所有日期都是**日历日**（Asia/Shanghai），由 utils/datetime 归一化；
 * - 时间轴是**线性时间刻度**：x = (日期 - 起点) / (终点 - 起点) × 可用宽度；
 * - 刻度分档随跨度自适应：短跨度按周、中跨度按月、长跨度按季；
 * - 标签格式：月档「11月 / 2027年1月」，周档「11/5」，季档「2027年Q1」——
 *   年份只在**首个刻度**或**年份发生变化**的那一格显示（对齐设计稿图5）。
 */

/** 时间轴刻度分档 */
export type TickTier = 'week' | 'month' | 'quarter';

/** 一个刻度（日期 + 文案） */
export interface TickLabel {
  day: Dayjs;
  label: string;
}

/**
 * 阶段的起点 —— 一个 phase 下所有项目里**最早开工**的那天。
 * 没有 phase 的项目不参与分段。
 */
export interface PhaseStart {
  phase: string;
  start: Dayjs;
}

/** 阶段带 —— 时间轴上互不重叠的一段，只属于一个阶段 */
export interface PhaseBand {
  phase: string;
  start: Dayjs;
  end: Dayjs;
}

/** 项目条上的一段（属于哪个阶段） */
export interface BarPiece {
  start: Dayjs;
  end: Dayjs;
  /** null = 没有阶段（普通灰底） */
  phase: string | null;
}

/** 线性时间刻度 */
export interface Scale {
  /** 画布宽度（px） */
  width: number;
  /** 日期 → x 坐标 */
  x: (day: Dayjs) => number;
}

/** 画布左右留白（px） */
const SCALE_PADDING = 10;

/**
 * 分档规则：跨度越大切得越粗。
 * - ≤ 45 天：按周（每 7 天一格）
 * - ≤ 400 天：按月（每月一格）
 * - 更长：按季（每季一格）
 */
export function chooseTier(days: number): TickTier {
  if (days <= 45) return 'week';
  if (days <= 400) return 'month';
  return 'quarter';
}

/**
 * 刻度日期列表 —— 落在**自然日历边界**上：
 * - 周档：周一；
 * - 月档：每月 1 号；
 * - 季档：1 / 4 / 7 / 10 月 1 号。
 *
 * 为什么不额外加「起点刻度」：起点常常落在月中（如 11-05），
 * 紧挨着的月界（12-01）会跟它挤在一起、标签叠字。
 * 自然边界同时也让标签序列正好是设计稿的 `2026年10月 11月 12月 2027年1月`。
 *
 * 跨度短到没有任何自然边界时（不足一周），退回用起点这一个刻度。
 */
export function buildTickDays(start: Dayjs, end: Dayjs, tier: TickTier): Dayjs[] {
  const days: Dayjs[] = [];

  if (tier === 'week') {
    // 对齐到周一
    let cursor = start.startOf('day');
    const back = (8 - cursor.day()) % 7;
    cursor = cursor.subtract(back, 'day');
    while (cursor.isBefore(start, 'day')) cursor = cursor.add(7, 'day');
    while (!cursor.isAfter(end, 'day')) {
      days.push(cursor);
      cursor = cursor.add(7, 'day');
    }
  } else if (tier === 'month') {
    let cursor = start.startOf('month');
    while (!cursor.isAfter(end, 'day')) {
      if (!cursor.isBefore(start, 'day')) days.push(cursor);
      cursor = cursor.add(1, 'month');
    }
  } else {
    let cursor = start.startOf('month');
    while (cursor.month() % 3 !== 0) cursor = cursor.subtract(1, 'month');
    while (!cursor.isAfter(end, 'day')) {
      if (!cursor.isBefore(start, 'day')) days.push(cursor);
      cursor = cursor.add(3, 'month');
    }
  }

  // 一个自然边界都没有 → 用起点兜底（保证轴上至少有一格刻度）
  if (days.length === 0) return [start.startOf('day')];
  return days;
}

/** 单个刻度的文案（是否带年份由调用方决定） */
export function formatTickLabel(day: Dayjs, tier: TickTier, withYear: boolean): string {
  if (tier === 'week') {
    return withYear ? day.format('YYYY/M/D') : day.format('M/D');
  }
  if (tier === 'month') {
    const month = day.month() + 1;
    return withYear ? `${day.format('YYYY')}年${month}月` : `${month}月`;
  }
  const quarter = Math.floor(day.month() / 3) + 1;
  return withYear ? `${day.format('YYYY')}年Q${quarter}` : `Q${quarter}`;
}

/**
 * 刻度文案 —— 年份只在「首个刻度」和「跨年」时出现，
 * 这样一整排看起来是 `2026年10月  11月  12月  2027年1月`（对齐设计稿）。
 */
export function labelTicks(days: Dayjs[], tier: TickTier): TickLabel[] {
  let previousYear: number | null = null;
  return days.map((day) => {
    const year = day.year();
    const withYear = previousYear === null || year !== previousYear;
    previousYear = year;
    return { day, label: formatTickLabel(day, tier, withYear) };
  });
}

/** 线性刻度：把日期换算成 x 坐标 */
export function makeScale(start: Dayjs, end: Dayjs, width: number): Scale {
  const totalDays = Math.max(1, end.diff(start, 'day', true));
  const usable = Math.max(1, width - SCALE_PADDING * 2);
  return {
    width,
    x: (day) => SCALE_PADDING + (day.diff(start, 'day', true) / totalDays) * usable,
  };
}

/**
 * 各阶段的起点 —— 同一个 phase 的项目取**最早开工**的那天，按开工时间排序。
 * 没有 phase 的项目不参与分段。
 */
export function buildPhaseStarts(projects: Project[]): PhaseStart[] {
  const map = new Map<string, Dayjs>();
  projects.forEach((project) => {
    const phase = (project.phase ?? '').trim();
    if (!phase) return;
    const created = parseDateOnly(project.createdAt);
    if (!created) return;
    const prev = map.get(phase);
    if (!prev || created.isBefore(prev)) map.set(phase, created);
  });
  return [...map.entries()]
    .map(([phase, start]) => ({ phase, start }))
    .sort((a, b) => {
      if (a.start.isBefore(b.start)) return -1;
      if (a.start.isAfter(b.start)) return 1;
      return a.phase.localeCompare(b.phase, 'zh-CN');
    });
}

/**
 * 阶段带（roadmap 分段）—— 把时间轴按阶段切成**互不重叠**的若干段。
 *
 * 为什么不用阶段窗口直接切：同一个阶段的项目可能横跨很长时间，
 * 多个阶段的窗口会互相重叠，「这一段属于哪个阶段」就没有唯一答案。
 * 这里改成路线图语义：按各阶段**最早开工的时间**排序，
 * 一个阶段负责从它开工到下一个阶段开工之间的时段 —— 阶段是往前推进的，
 * 所以任何时刻只处于一个阶段，分段就没有歧义。
 *
 * 第一个阶段开工之前的那段不属于任何阶段（中性灰）。
 */
export function buildPhaseBands(
  starts: PhaseStart[],
  start: Dayjs,
  end: Dayjs,
): PhaseBand[] {
  if (starts.length === 0) return [];
  const bands: PhaseBand[] = [];
  starts.forEach((item, index) => {
    const bandStart = item.start.isBefore(start) ? start : item.start;
    const next = starts[index + 1];
    const bandEnd = next ? (next.start.isAfter(end) ? end : next.start) : end;
    if (!bandStart.isBefore(bandEnd)) return;
    bands.push({ phase: item.phase, start: bandStart, end: bandEnd });
  });
  return bands;
}

/**
 * 用阶段带切开项目条。
 *
 * - 项目**没有 phase** 时不切分（整条一个普通灰底）；
 * - 项目**有 phase** 时按阶段带切分，每段底色取该时段所处的阶段
 *   （阶段带互不重叠，归属唯一），于是条上能看出「跨了哪几个阶段」。
 */
export function sliceBySegments(
  bands: PhaseBand[],
  barStart: Dayjs,
  barEnd: Dayjs,
  ownPhase: string | null,
): BarPiece[] {
  if (!ownPhase) {
    return [{ start: barStart, end: barEnd, phase: null }];
  }
  const pieces: BarPiece[] = [];
  bands.forEach((band) => {
    const start = band.start.isAfter(barStart) ? band.start : barStart;
    const end = band.end.isBefore(barEnd) ? band.end : barEnd;
    if (!start.isBefore(end)) return;
    pieces.push({ start, end, phase: band.phase });
  });
  if (pieces.length === 0) return [{ start: barStart, end: barEnd, phase: null }];
  return pieces;
}
