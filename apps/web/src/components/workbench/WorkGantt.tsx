import { useEffect, useMemo, useRef, useState } from 'react';
import type { Milestone, Project } from '@blackhole/shared/types';
import { designVars } from '../../styles/theme';
import { Panel } from '../ui';

/**
 * 工作台里的紧凑甘特（D-36）。
 *
 * 和「周进度」页那张真甘特（可拖拽改期）不是同一个组件：
 * 工作台只要"看"，8 列宽、固定高度，所以单独做一个只读版本，
 * 避免把拖拽逻辑和它的 pointer 事件坑带进来。
 */
const DAY = 86400000;
const TOP = 26;
const BOTTOM = 24;

const parse = (value: string | null): Date | null => {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function WorkGantt({
  projects,
  milestones,
  onMore,
}: {
  projects: Project[];
  milestones: Milestone[];
  onMore: () => void;
}): JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = boxRef.current;
    if (!node) return undefined;
    const update = (): void => setWidth(node.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const rows = projects.slice(0, 5);

  const range = useMemo(() => {
    const starts = rows.map((p) => parse(p.startDate ?? p.createdAt)).filter((d): d is Date => d !== null);
    const ends = rows.map((p) => parse(p.dueDate)).filter((d): d is Date => d !== null);
    if (starts.length === 0 && ends.length === 0) return null;
    const min = Math.min(...[...starts, ...ends].map((d) => d.getTime())) - 6 * DAY;
    const max = Math.max(...[...starts, ...ends].map((d) => d.getTime())) + 10 * DAY;
    return { min, max };
  }, [rows]);

  const months = useMemo(() => {
    if (!range) return [] as { label: string; at: number }[];
    const list: { label: string; at: number }[] = [];
    const cursor = new Date(range.min);
    cursor.setDate(1);
    for (let i = 0; i < 8; i += 1) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth() + i, 1);
      if (d.getTime() < range.min || d.getTime() > range.max) continue;
      list.push({ label: `${d.getMonth() + 1} 月`, at: d.getTime() });
    }
    return list;
  }, [range]);

  const H = 290;
  const LEFT = 132;
  const RIGHT = 14;
  const rowH = rows.length === 0 ? 0 : (H - TOP - BOTTOM) / rows.length;
  const x = (t: number): number =>
    range === null ? LEFT : LEFT + ((t - range.min) / (range.max - range.min)) * (width - LEFT - RIGHT);

  const today = Date.now();

  return (
    <Panel title="工作进度" more="完整甘特" onMore={onMore} flush>
      <div className="wb-gantt" ref={boxRef}>
        {rows.length === 0 ? (
          <div className="wb-gantt-empty">还没有在办项目</div>
        ) : (
          <svg width={Math.max(width, 320)} height={H} role="img" aria-label="项目进度甘特图">
            {width > 0 && range ? (
              <>
                {months.map((m) => (
                  <g key={m.label}>
                    <line
                      x1={x(m.at)}
                      y1={TOP - 14}
                      x2={x(m.at)}
                      y2={H - BOTTOM}
                      stroke="#f1f4fa"
                      strokeWidth={1}
                    />
                    <text x={x(m.at) + 6} y={14} fontSize={11} fill="#98a2b8">
                      {m.label}
                    </text>
                  </g>
                ))}

                <line
                  x1={x(today)}
                  y1={TOP - 12}
                  x2={x(today)}
                  y2={H - BOTTOM}
                  stroke={designVars.red}
                  strokeWidth={1.4}
                  strokeDasharray="4 4"
                  opacity={0.85}
                />
                <text
                  x={x(today)}
                  y={H - BOTTOM + 15}
                  fontSize={10.5}
                  fill={designVars.red}
                  textAnchor="middle"
                >
                  今天
                </text>

                {rows.map((project, index) => {
                  const start = parse(project.startDate ?? project.createdAt);
                  const end = parse(project.dueDate) ?? start;
                  const y = TOP + index * rowH;
                  const barY = y + rowH / 2 - 8;
                  const bx = start ? x(start.getTime()) : LEFT;
                  const bw = end ? Math.max(10, x(end.getTime()) - bx) : 10;
                  const color = project.color ?? designVars.primary;
                  return (
                    <g key={project.id}>
                      <text x={4} y={y + rowH / 2 + 4} fontSize={12} fill={designVars.text}>
                        {project.name.length > 7 ? `${project.name.slice(0, 7)}…` : project.name}
                      </text>
                      <rect x={bx} y={barY} width={bw} height={16} rx={5} fill="#eef1f8" />
                      <rect
                        x={bx}
                        y={barY}
                        width={Math.max(4, (bw * project.progress) / 100)}
                        height={16}
                        rx={5}
                        fill={color}
                        opacity={0.95}
                      />
                      <text x={bx + bw + 8} y={barY + 11.5} fontSize={10.5} fill="#98a2b8">
                        {project.progress}%
                      </text>
                    </g>
                  );
                })}

                {milestones
                  .filter((m) => rows.some((p) => p.id === m.projectId))
                  .slice(0, 4)
                  .map((milestone) => {
                    const due = parse(milestone.dueDate);
                    const rowIndex = rows.findIndex((p) => p.id === milestone.projectId);
                    if (!due || rowIndex < 0) return null;
                    // 菱形不许压到左侧项目名栏（最近一个里程碑常落在时间轴左端）
                    const cx = Math.max(LEFT + 12, x(due.getTime()));
                    const cy = TOP + rowIndex * rowH + rowH / 2;
                    const done = milestone.status === 'done';
                    return (
                      <g key={milestone.id}>
                        <path
                          d={`M${cx},${cy - 6} L${cx + 6},${cy} L${cx},${cy + 6} L${cx - 6},${cy} Z`}
                          fill={done ? '#f59f00' : '#fff'}
                          stroke="#f59f00"
                          strokeWidth={1.6}
                        />
                        <text
                          x={cx + 10}
                          y={cy + 3.5}
                          fontSize={10}
                          fill="#b7791f"
                          stroke="#fff"
                          strokeWidth={3}
                          paintOrder="stroke"
                        >
                          {milestone.name.length > 5 ? `${milestone.name.slice(0, 5)}…` : milestone.name}
                        </text>
                      </g>
                    );
                  })}
              </>
            ) : null}
          </svg>
        )}
      </div>
      <div className="wb-gantt-legend">
        <span>
          <i style={{ background: designVars.primary }} />
          进行中
        </span>
        <span>
          <i style={{ background: '#eef1f8' }} />
          剩余工期
        </span>
        <span>◆ 里程碑</span>
        <span style={{ color: designVars.red }}>┆ 今天</span>
      </div>
    </Panel>
  );
}
