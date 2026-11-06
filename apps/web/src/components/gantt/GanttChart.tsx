import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Dayjs } from 'dayjs';
import type { Milestone, Project } from '@blackhole/shared/types';
import { designVars } from '../../styles/theme';
import { formatDateOnly, parseDateOnly, todayShanghaiDate } from '../../utils/datetime';
import { categoryTone, projectColor } from '../user/visuals';
import type { TagTone } from '../ui';
import {
  buildPhaseBands,
  buildPhaseStarts,
  buildTickDays,
  chooseTier,
  labelTicks,
  makeScale,
  sliceBySegments,
  type TickLabel,
} from './timeline';

/**
 * 项目级真甘特图（设计稿图5）。
 *
 * 构成：
 * - **顶部时间轴刻度**：按项目时间跨度自动分档（周 / 月 / 季），标签如「11月」「2027年1月」；
 * - **每个项目一行**：左侧项目名 + 阶段标签，右侧进度百分比 + 截止日；
 * - **时间条**：created_at → due_date 的区间条，条内按 progress 填充，条上叠阶段分段（不同底色）；
 * - **里程碑菱形**：按 dueDate 定位在时间轴对应日期，已完成实心、未完成空心，hover 显示名称；
 * - **今天的竖虚线**：红色，贯穿整个甘特区；
 * - **悬停提示**：项目行 hover 显示「开始 / 截止 / 进度 / 阶段」。
 *
 * 绘制方式：**手写 SVG**（不引任何图表库），浮层提示用 HTML 叠在 SVG 之上。
 * 甘特区自身横向可滚动（overflow-x:auto），页面不产生横向滚动条。
 */

/** 行高 / 轴高 / 条高（px）—— 与 styles/progress.css 里的同名变量保持一致 */
const AXIS_H = 34;
const ROW_H = 40;
const GROUP_H = 28;
const BAR_H = 14;

/** 甘特区左侧信息列宽 / 右侧数值列宽（px） */
const LEFT_W = 224;   // 项目名列宽 —— 178 时「演示·企业数据中台」这类名字会被截断
const RIGHT_W = 144;

/** 轴底部的「今天」标注留白（px） */
const FOOTER_H = 18;

/** 每个刻度至少占用的宽度（px）—— 用来算甘特区的最小宽度（不够就内部横向滚动） */
const TICK_SLOT = 76;

/** 悬停浮层的半宽（px）—— 用来把浮层夹在画布内，避免撑出横向滚动条 */
const TIP_HALF = 96;

/** 阶段色板：色调来自 visuals.tsx 的 categoryTone（同名阶段永远同色） */
const TONE_SOFT: Record<TagTone, string> = {
  blue: designVars.softBlue,
  green: designVars.softGreen,
  orange: designVars.softOrange,
  purple: designVars.softPurple,
  red: designVars.softRed,
  gray: designVars.softGray,
};

const TONE_SOLID: Record<TagTone, string> = {
  blue: designVars.primary,
  green: designVars.green,
  orange: designVars.orange,
  purple: designVars.purple,
  red: designVars.red,
  gray: designVars.muted,
};

/** 无阶段时的条底色 */
const TRACK_COLOR = '#eef1f6';

/** 估算文本宽度（px）—— 中文按 11px、其余按 6px 粗算，用来判断刻度标签会不会叠字 */
function estimateTextWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += /[\u4e00-\u9fa5]/.test(char) ? 11 : 6;
  }
  return width;
}


export type GanttGroupBy = 'phase' | 'none';

interface ProjectDatum {
  project: Project;
  color: string;
  phase: string | null;
  phaseTone: TagTone;
  start: Dayjs;
  end: Dayjs;
  hasDue: boolean;
}

type RowItem =
  | { kind: 'group'; key: string; title: string; count: number; average: number; height: number }
  | {
      kind: 'project';
      key: string;
      datum: ProjectDatum;
      milestones: Milestone[];
      height: number;
    };

/** 行 + 它在 SVG 里的 y 坐标（一次算好，三列共用，保证纵向对齐） */
interface PositionedRow {
  row: RowItem;
  y: number;
}

interface HoverInfo {
  x: number;
  y: number;
  title: string;
  lines: { label: string; value: string }[];
}

export interface GanttChartProps {
  projects: Project[];
  milestones: Milestone[];
  /** 是否按阶段分组 */
  groupBy: GanttGroupBy;
}

export function GanttChart({ projects, milestones, groupBy }: GanttChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  /** 图表容器宽度 —— 变了要重算刻度与坐标 */
  useEffect(() => {
    const node = chartRef.current;
    if (!node) return undefined;
    const update = (): void => setAvailable(node.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const today = useMemo(() => parseDateOnly(todayShanghaiDate()), []);

  /** 每个项目的起止：缺 created_at 用今天兜底；缺 due_date 时条画到今天 */
  const data = useMemo<ProjectDatum[]>(() => {
    if (!today) return [];
    return projects.map((project, index) => {
      const created = parseDateOnly(project.createdAt) ?? today;
      const due = parseDateOnly(project.dueDate);
      const phase = (project.phase ?? '').trim() || null;
      return {
        project,
        color: projectColor(project.color, index),
        phase,
        phaseTone: phase ? categoryTone(phase) : 'gray',
        start: created,
        end: due && due.isAfter(created) ? due : created,
        hasDue: due !== null,
      };
    });
  }, [projects, today]);

  /** 时间轴范围：项目创建日 ~ 最晚截止日，并把今天与里程碑日期包进来 */
  const range = useMemo(() => {
    if (!today || data.length === 0) return null;
    let start = today;
    let end = today;
    data.forEach((datum) => {
      if (datum.start.isBefore(start)) start = datum.start;
      if (datum.end.isAfter(end)) end = datum.end;
    });
    const ids = new Set(data.map((datum) => datum.project.id));
    milestones.forEach((milestone) => {
      if (milestone.projectId === null || !ids.has(milestone.projectId)) return;
      const due = parseDateOnly(milestone.dueDate);
      if (!due) return;
      if (due.isBefore(start)) start = due;
      if (due.isAfter(end)) end = due;
    });
    if (!start.isBefore(end)) end = start.add(1, 'day');
    return { start, end };
  }, [data, milestones, today]);

  /** 阶段带：把时间轴按阶段切成互不重叠的段（条上分段底色的依据） */
  const bands = useMemo(() => {
    if (!range) return [];
    return buildPhaseBands(buildPhaseStarts(projects), range.start, range.end);
  }, [projects, range]);

  /** 行模型：分组时先插一条分组标题行 */
  const rows = useMemo<RowItem[]>(() => {
    const ids = new Set(data.map((datum) => datum.project.id));
    const byProject = new Map<number, Milestone[]>();
    milestones.forEach((milestone) => {
      if (milestone.projectId === null || !ids.has(milestone.projectId)) return;
      const list = byProject.get(milestone.projectId) ?? [];
      list.push(milestone);
      byProject.set(milestone.projectId, list);
    });

    const build = (datum: ProjectDatum): RowItem => ({
      kind: 'project',
      key: `p-${datum.project.id}`,
      datum,
      milestones: byProject.get(datum.project.id) ?? [],
      height: ROW_H,
    });

    if (groupBy !== 'phase') {
      return [...data].sort((a, b) => a.start.valueOf() - b.start.valueOf()).map(build);
    }

    const groups = new Map<string, ProjectDatum[]>();
    data.forEach((datum) => {
      const key = datum.phase ?? '';
      const list = groups.get(key) ?? [];
      list.push(datum);
      groups.set(key, list);
    });

    const items: RowItem[] = [];
    [...groups.entries()]
      .sort((a, b) => {
        const aStart = Math.min(...a[1].map((datum) => datum.start.valueOf()));
        const bStart = Math.min(...b[1].map((datum) => datum.start.valueOf()));
        return aStart - bStart;
      })
      .forEach(([phase, list]) => {
        const sorted = [...list].sort((a, b) => a.start.valueOf() - b.start.valueOf());
        const average = Math.round(
          sorted.reduce((sum, datum) => sum + datum.project.progress, 0) / sorted.length,
        );
        items.push({
          kind: 'group',
          key: `g-${phase}`,
          title: phase === '' ? '未设置阶段' : phase,
          count: sorted.length,
          average,
          height: GROUP_H,
        });
        sorted.forEach((datum) => items.push(build(datum)));
      });
    return items;
  }, [data, milestones, groupBy]);

  /** 轴刻度：按跨度分档，年份只在首格与跨年处出现 */
  const ticks = useMemo<TickLabel[]>(() => {
    if (!range) return [];
    const tier = chooseTier(range.end.diff(range.start, 'day'));
    return labelTicks(buildTickDays(range.start, range.end, tier), tier);
  }, [range]);

  /** 甘特区宽度：容器够宽就铺满，不够就按刻度数撑出最小宽度（内部横向滚动） */
  const chartWidth = useMemo(
    () => Math.max(available, ticks.length * TICK_SLOT, 320),
    [available, ticks.length],
  );

  const scale = useMemo(
    () => (range ? makeScale(range.start, range.end, chartWidth) : null),
    [range, chartWidth],
  );

  /**
   * 刻度标签抽稀 —— 宽度不够时丢掉会叠字的那些（刻度线仍画全）。
   * 首尾的标签贴着边界（text-anchor 改成 start / end），所以只跟右邻比较。
   */
  const visibleTickLabels = useMemo(() => {
    const keep = new Set<string>();
    if (!scale || ticks.length === 0) return keep;
    let lastRight = -Infinity;
    ticks.forEach((tick, index) => {
      const x = scale.x(tick.day);
      const textWidth = estimateTextWidth(tick.label);
      const anchorLeft = x < 26;
      const anchorRight = x > chartWidth - 26;
      const left = anchorLeft ? x : anchorRight ? x - textWidth : x - textWidth / 2;
      const right = left + textWidth;
      if (index === 0 || left >= lastRight + 10) {
        keep.add(tick.label);
        lastRight = right;
      }
    });
    return keep;
  }, [scale, ticks, chartWidth]);

  /** 行坐标（SVG / 左列 / 右列共用同一份，保证纵向对齐） */
  const positioned = useMemo<PositionedRow[]>(() => {
    let y = AXIS_H;
    return rows.map((row) => {
      const item = { row, y };
      y += row.height;
      return item;
    });
  }, [rows]);

  const totalHeight = AXIS_H + rows.reduce((sum, row) => sum + row.height, 0) + FOOTER_H;

  if (!range || !scale || !today || rows.length === 0) {
    return <div className="wb-gantt-empty">没有可排期的项目</div>;
  }

  const todayX = scale.x(today);

  /** 项目行的悬停提示：开始 / 截止 / 进度 / 阶段 */
  const showProjectHover = (datum: ProjectDatum, x: number, y: number): void => {
    setHover({
      x,
      y,
      title: datum.project.name,
      lines: [
        { label: '开始', value: formatDateOnly(datum.project.createdAt) },
        {
          label: '截止',
          value: datum.hasDue ? formatDateOnly(datum.project.dueDate) : '未设置',
        },
        { label: '进度', value: `${datum.project.progress}%` },
        { label: '阶段', value: datum.phase ?? '未设置' },
      ],
    });
  };

  /** 里程碑的悬停提示：名称 / 日期 / 状态 / 所属项目 */
  const showMilestoneHover = (milestone: Milestone, x: number, y: number): void => {
    setHover({
      x,
      y,
      title: milestone.name,
      lines: [
        {
          label: '日期',
          value: milestone.dueDate ? formatDateOnly(milestone.dueDate) : '未设置',
        },
        { label: '状态', value: milestone.status === 'done' ? '已完成' : '未完成' },
        { label: '项目', value: milestone.projectName ?? '未归属项目' },
      ],
    });
  };

  const gridStyle = {
    '--wb-gantt-left': `${LEFT_W}px`,
    '--wb-gantt-right': `${RIGHT_W}px`,
  } as CSSProperties;

  return (
    <div className="wb-gantt">
      <div className="wb-gantt-grid" style={gridStyle}>
        {/* 左侧：项目名 + 阶段标签 */}
        <div className="wb-gantt-left">
          <div className="wb-gantt-head-cell" style={{ height: AXIS_H }}>
            项目 / 阶段
          </div>
          {positioned.map(({ row, y }) =>
            row.kind === 'group' ? (
              <div className="wb-gantt-group-row" style={{ height: row.height }} key={row.key}>
                <span className="wb-gantt-group-title">{row.title}</span>
                <span className="wb-gantt-group-meta">
                  {row.count} 个 · {row.average}%
                </span>
              </div>
            ) : (
              <div className="wb-gantt-label-row" style={{ height: row.height }} key={row.key}>
                <span
                  className="wb-gantt-name"
                  style={{ color: row.datum.color }}
                  title={row.datum.project.name}
                  onMouseEnter={() => showProjectHover(row.datum, 120, y)}
                  onMouseLeave={() => setHover(null)}
                >
                  <span className="wb-gantt-name-text">{row.datum.project.name}</span>
                </span>
                <span
                  className="wb-gantt-phase"
                  style={{
                    background: TONE_SOFT[row.datum.phaseTone],
                    color: TONE_SOLID[row.datum.phaseTone],
                  }}
                >
                  {row.datum.phase ?? '—'}
                </span>
              </div>
            ),
          )}
        </div>

        {/* 中间：时间轴 + 时间条 + 里程碑 + 今天线 */}
        <div className="wb-gantt-chart" ref={chartRef}>
          <svg
            width={chartWidth}
            height={totalHeight}
            className="wb-gantt-svg"
            role="img"
            aria-label="项目进度甘特图"
          >
            {/* 分组标题行的底色带 */}
            {positioned.map(({ row, y }) =>
              row.kind === 'group' ? (
                <rect
                  key={`band-${row.key}`}
                  x={0}
                  y={y}
                  width={chartWidth}
                  height={row.height}
                  fill={designVars.bg}
                  pointerEvents="none"
                />
              ) : null,
            )}

            {/* 竖向网格线（按刻度）+ 行分隔线 */}
            {ticks.map((tick) => {
              const x = scale.x(tick.day);
              return (
                <line
                  key={`grid-${tick.day.format('YYYY-MM-DD')}`}
                  x1={x}
                  y1={AXIS_H}
                  x2={x}
                  y2={totalHeight - FOOTER_H}
                  stroke="#f5f7fa"
                  pointerEvents="none"
                />
              );
            })}
            {positioned.map(({ row, y }) => (
              <line
                key={`sep-${row.key}`}
                x1={0}
                y1={y + row.height - 0.5}
                x2={chartWidth}
                y2={y + row.height - 0.5}
                stroke={row.kind === 'group' ? designVars.border : '#f2f5f9'}
                pointerEvents="none"
              />
            ))}

            {/* 时间条：底色按阶段分段，条内按 progress 填充 */}
            {positioned.map(({ row, y }) => {
              if (row.kind === 'group') return null;
              const { datum } = row;
              const x1 = scale.x(datum.start);
              const x2 = scale.x(datum.end);
              const barW = Math.max(2, x2 - x1);
              const barY = y + (row.height - BAR_H) / 2;
              const pieces = sliceBySegments(bands, datum.start, datum.end, datum.phase);
              const filled = (barW * Math.max(0, Math.min(100, datum.project.progress))) / 100;
              return (
                <g key={`bar-${row.key}`} pointerEvents="none">
                  {/* 阶段分段底色（不同底色） */}
                  {pieces.map((piece) => {
                    const px1 = scale.x(piece.start);
                    const px2 = scale.x(piece.end);
                    return (
                      <rect
                        key={`${piece.start.format('MM-DD')}-${piece.end.format('MM-DD')}`}
                        x={px1}
                        y={barY}
                        width={Math.max(1, px2 - px1)}
                        height={BAR_H}
                        rx={3}
                        fill={piece.phase ? TONE_SOFT[categoryTone(piece.phase)] : TRACK_COLOR}
                      />
                    );
                  })}
                  {/* progress 填充（压在分段底色上） */}
                  <rect
                    x={x1}
                    y={barY}
                    width={filled}
                    height={BAR_H}
                    rx={3}
                    fill={datum.color}
                  />
                  {/* 阶段分段界线 —— 画在最上层，已填充的部分也能看出分段 */}
                  {pieces.slice(1).map((piece) => {
                    const px = scale.x(piece.start);
                    return (
                      <line
                        key={`div-${piece.start.format('MM-DD')}`}
                        x1={px}
                        y1={barY}
                        x2={px}
                        y2={barY + BAR_H}
                        stroke="#ffffff"
                        strokeWidth={1.5}
                        opacity={0.9}
                      />
                    );
                  })}
                </g>
              );
            })}

            {/* 行热区：整行可 hover（盖在条之上，里程碑除外） */}
            {positioned.map(({ row, y }) =>
              row.kind === 'project' ? (
                <rect
                  key={`hit-${row.key}`}
                  x={0}
                  y={y}
                  width={chartWidth}
                  height={row.height}
                  fill="transparent"
                  onMouseEnter={() => showProjectHover(row.datum, 120, y)}
                  onMouseLeave={() => setHover(null)}
                />
              ) : null,
            )}

            {/* 里程碑菱形：已完成实心，未完成空心 */}
            {positioned.map(({ row, y }) => {
              if (row.kind === 'group') return null;
              const color = row.datum.color;
              return row.milestones.map((milestone) => {
                const due = parseDateOnly(milestone.dueDate);
                if (!due) return null;
                const x = scale.x(due);
                const cy = y + row.height / 2;
                const done = milestone.status === 'done';
                return (
                  <g
                    key={`ms-${milestone.id}`}
                    onMouseEnter={() => showMilestoneHover(milestone, x, cy)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <polygon
                      points={`${x},${cy - 5} ${x + 5},${cy} ${x},${cy + 5} ${x - 5},${cy}`}
                      fill={done ? color : '#ffffff'}
                      stroke={color}
                      strokeWidth={1.5}
                      style={{ cursor: 'pointer' }}
                    />
                  </g>
                );
              });
            })}

            {/* 顶部时间轴：基线 + 刻度 + 标签 */}
            <line
              x1={0}
              y1={AXIS_H - 0.5}
              x2={chartWidth}
              y2={AXIS_H - 0.5}
              stroke={designVars.border}
              pointerEvents="none"
            />
            {ticks.map((tick) => {
              const x = scale.x(tick.day);
              return (
                <g key={`tick-${tick.day.format('YYYY-MM-DD')}`} pointerEvents="none">
                  <line x1={x} y1={AXIS_H - 6} x2={x} y2={AXIS_H} stroke={designVars.border} />
                  {visibleTickLabels.has(tick.label) ? (
                    <text
                      x={x}
                      y={15}
                      textAnchor={x < 26 ? 'start' : x > chartWidth - 26 ? 'end' : 'middle'}
                      fontSize={11}
                      fill={designVars.muted}
                    >
                      {tick.label}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {/* 今天的竖虚线：红色，贯穿整个甘特区（轴 + 所有行 + 底部标注） */}
            <line
              x1={todayX}
              y1={0}
              x2={todayX}
              y2={totalHeight - 4}
              stroke={designVars.red}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
            <text
              x={todayX + 5 > chartWidth - 24 ? todayX - 5 : todayX + 5}
              y={totalHeight - 4}
              textAnchor={todayX + 5 > chartWidth - 24 ? 'end' : 'start'}
              fontSize={11}
              fill={designVars.red}
              pointerEvents="none"
            >
              今天
            </text>
          </svg>

          {/* 悬停提示（HTML 层，浮在 SVG 之上） */}
          {hover ? (
            <div
              className="wb-gantt-tip"
              style={{
                // 夹在画布内 —— 浮层在横向滚动的容器里，超出去会撑出滚动条
                left: Math.min(Math.max(hover.x, TIP_HALF), Math.max(chartWidth - TIP_HALF, TIP_HALF)),
                top: Math.max(hover.y - 6, 2),
              }}
              role="tooltip"
            >
              <div className="wb-gantt-tip-title">{hover.title}</div>
              {hover.lines.map((line) => (
                <div className="wb-gantt-tip-row" key={line.label}>
                  <span className="wb-gantt-tip-label">{line.label}</span>
                  <span className="wb-gantt-tip-value">{line.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* 右侧：进度百分比 + 截止日 */}
        <div className="wb-gantt-right">
          <div className="wb-gantt-head-cell" style={{ height: AXIS_H }}>
            进度 / 截止
          </div>
          {positioned.map(({ row }) =>
            row.kind === 'group' ? (
              <div className="wb-gantt-group-row" style={{ height: row.height }} key={row.key}>
                <span className="wb-gantt-group-meta">—</span>
              </div>
            ) : (
              <div className="wb-gantt-value-row" style={{ height: row.height }} key={row.key}>
                <span className="wb-gantt-pct">{row.datum.project.progress}%</span>
                <span className="wb-gantt-due">
                  {row.datum.hasDue ? formatDateOnly(row.datum.project.dueDate) : '—'}
                </span>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
