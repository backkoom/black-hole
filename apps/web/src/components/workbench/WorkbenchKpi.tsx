import type { Task } from '@blackhole/shared/types';
import { designVars } from '../../styles/theme';

/**
 * 工作台 KPI 四卡（D-36 按定稿 demo 实现）。
 *
 * 口径全部由任务真实数据算，不用假数：
 * - 本周/本月/本季/本年 = 到期日落在该区间、且未完成的任务数（含已完成的也算"工作"）
 * - 环比 = 本周 vs 上周（只看数量差，不编百分比）
 * - 进度条 = 该区间已完成 / 总任务
 */

type Tone = 'blue' | 'violet' | 'green' | 'gray';

const TONE: Record<Tone, { dot: string; bar: string; soft: string }> = {
  blue: { dot: designVars.primary, bar: designVars.primary, soft: '#eef2ff' },
  violet: { dot: designVars.purple, bar: designVars.purple, soft: '#f3edff' },
  green: { dot: designVars.green, bar: designVars.green, soft: '#e7f8f2' },
  gray: { dot: designVars.muted, bar: designVars.muted, soft: '#f4f6fb' },
};

const DAY = 86400000;

function dayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** 自然周（周一为起点） */
function weekStart(d: Date): Date {
  const x = dayStart(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

const dueTime = (task: Task): number | null => {
  if (!task.dueDate) return null;
  const t = new Date(`${task.dueDate}T00:00:00+08:00`).getTime();
  return Number.isNaN(t) ? null : t;
};

/** 统计某区间内的任务数与完成数 */
function bucket(tasks: Task[], from: number, to: number): { total: number; done: number } {
  let total = 0;
  let done = 0;
  for (const task of tasks) {
    const t = dueTime(task);
    if (t === null || t < from || t >= to) continue;
    total += 1;
    if (task.status === 'done') done += 1;
  }
  return { total, done };
}

export function WorkbenchKpi({ tasks }: { tasks: Task[] }): JSX.Element {
  const now = new Date();
  const ws = weekStart(now).getTime();
  const lastWeek = ws - 7 * DAY;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).getTime();
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const nextQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 1).getTime();
  const nextYear = new Date(now.getFullYear() + 1, 0, 1).getTime();

  const thisWeek = bucket(tasks, ws, ws + 7 * DAY);
  const prevWeek = bucket(tasks, lastWeek, ws);
  const thisMonth = bucket(tasks, monthStart, nextMonth);
  const thisQuarter = bucket(tasks, quarterStart, nextQuarter);
  const thisYear = bucket(tasks, yearStart, nextYear);
  const weekDelta = thisWeek.total - prevWeek.total;

  const cards: {
    key: string;
    label: string;
    tone: Tone;
    total: number;
    done: number;
    delta?: number;
    caption: string;
  }[] = [
    {
      key: 'week',
      label: '本周工作',
      tone: 'blue',
      ...thisWeek,
      delta: weekDelta,
      caption: `已完成 ${thisWeek.done} 件 · 截止到 ${new Date(ws + 7 * DAY - DAY).getMonth() + 1}/${new Date(
        ws + 7 * DAY - DAY,
      ).getDate()}`,
    },
    { key: 'month', label: '本月工作', tone: 'violet', ...thisMonth, caption: `已完成 ${thisMonth.done} 件` },
    { key: 'quarter', label: '本季工作', tone: 'green', ...thisQuarter, caption: `已完成 ${thisQuarter.done} 件` },
    { key: 'year', label: '本年工作', tone: 'gray', ...thisYear, caption: `已完成 ${thisYear.done} 件` },
  ];

  return (
    <div className="wb-kpi-row">
      {cards.map((card) => {
        const tone = TONE[card.tone];
        const percent = card.total === 0 ? 0 : Math.round((card.done / card.total) * 100);
        const delta = card.delta;
        return (
          <div key={card.key} className="wb-kpi">
            <div className="wb-kpi-top">
              <span className="wb-kpi-label">
                <i style={{ background: tone.dot }} />
                {card.label}
              </span>
            </div>
            <div className="wb-kpi-num">
              {delta !== undefined ? (
                <span className={`wb-kpi-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}`}>
                  {delta > 0 ? `↑ ${delta}` : delta < 0 ? `↓ ${Math.abs(delta)}` : '持平'}
                </span>
              ) : null}
              <span className="wb-kpi-value">
                <b>{card.total}</b>
                <span>件</span>
              </span>
            </div>
            <div className="wb-kpi-track">
              <i style={{ width: `${percent}%`, background: tone.bar }} />
            </div>
            <div className="wb-kpi-cap">{card.caption}</div>
          </div>
        );
      })}
    </div>
  );
}

export { dueTime, weekStart };
