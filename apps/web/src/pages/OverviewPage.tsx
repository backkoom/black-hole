import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Milestone, Project, Risk, Task } from '@blackhole/shared/types';
import { listRisks } from '../api/risks';
import { listMeetings } from '../api/schedule';
import { useAllTasks } from '../hooks/useAllTasks';
import { useUserProjects } from '../hooks/useUserData';
import { useTaskCounts } from '../hooks/useTaskCounts';
import { useMilestones } from '../components/gantt/useMilestones';
import { todayShanghaiDate } from '../utils/datetime';
import '../styles/workbench-demo.css';

/**
 * 工作台 —— 结构与样式**直接从 demo 迁移**（workbench-demo.css 由 demo 的 <style> 自动加 .wbd 作用域生成）。
 * 这里只做三件事：取真实数据、按 demo 的 DOM 结构渲染、必要的交互（选项卡/跳转）。
 */

const DAY = 86400000;
const dueMs = (d: string | null): number | null => (d ? new Date(`${d.slice(0, 10)}T00:00:00+08:00`).getTime() : null);
const dayStart = (d: Date): Date => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const weekStart = (d: Date): Date => { const x = dayStart(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

function bucket(tasks: Task[], from: number, to: number): { total: number; done: number } {
  let total = 0; let done = 0;
  for (const t of tasks) {
    const ms = dueMs(t.dueDate);
    if (ms === null || ms < from || ms >= to) continue;
    total += 1;
    if (t.status === 'done') done += 1;
  }
  return { total, done };
}

export function OverviewPage(): JSX.Element {
  const navigate = useNavigate();
  const today = todayShanghaiDate();
  const tasksQuery = useAllTasks();
  const tasks = tasksQuery.data ?? [];
  const projectsQuery = useUserProjects();
  const activeProjects = useMemo(
    () => (projectsQuery.data?.items ?? []).filter((p) => p.status === 'active'),
    [projectsQuery.data],
  );
  const { counts } = useTaskCounts();
  const milestonesQuery = useMilestones();
  const risksQuery = useQuery({ queryKey: ['workbench', 'risks'], queryFn: () => listRisks({ status: 'open' }), staleTime: 60_000 });
  const meetingsQuery = useQuery({
    queryKey: ['workbench', 'meetings', today],
    queryFn: () => listMeetings({ from: `${today}T00:00:00+08:00`, to: `${today}T23:59:59+08:00` }),
    staleTime: 60_000,
  });

  /* ---------------- KPI ---------------- */
  const now = new Date();
  const ws = weekStart(now).getTime();
  const thisWeek = bucket(tasks, ws, ws + 7 * DAY);
  const prevWeek = bucket(tasks, ws - 7 * DAY, ws);
  const thisMonth = bucket(tasks, new Date(now.getFullYear(), now.getMonth(), 1).getTime(), new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime());
  const thisQuarter = bucket(tasks, new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).getTime(), new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 1).getTime());
  const thisYear = bucket(tasks, new Date(now.getFullYear(), 0, 1).getTime(), new Date(now.getFullYear() + 1, 0, 1).getTime());
  const weekDelta = thisWeek.total - prevWeek.total;

  const kpis = [
    { label: '本周工作', dot: '#5468ff', bar: '#5468ff', ...thisWeek, delta: weekDelta, hint: `已完成 ${thisWeek.done} 件 · 截止到 ${new Date(ws + 6 * DAY).getMonth() + 1}/${new Date(ws + 6 * DAY).getDate()}` },
    { label: '本月工作', dot: '#8b5cf6', bar: '#8b5cf6', ...thisMonth, delta: undefined as number | undefined, hint: `已完成 ${thisMonth.done} 件 · 共 ${thisMonth.total} 件` },
    { label: '本季工作', dot: '#12b886', bar: '#12b886', ...thisQuarter, delta: undefined as number | undefined, hint: `已完成 ${thisQuarter.done} 件 · 共 ${thisQuarter.total} 件` },
    { label: '本年工作', dot: '#98a2b8', bar: '#98a2b8', ...thisYear, delta: undefined as number | undefined, hint: `已完成 ${thisYear.done} 件 · 共 ${thisYear.total} 件` },
  ];

  const todayTodo = tasks.filter((t) => t.dueDate === today && t.status !== 'done');
  const overdueTasks = tasks.filter((t) => t.dueDate !== null && t.dueDate < today && t.status !== 'done');
  const overdue = overdueTasks.length;
  // 逾期是「进行中/待处理」的子集：画环图时必须从这两段扣掉，
  // 否则四段相加会大于真实任务数（曾出现 9+8+14+4=35，而库里只有 31 条）。
  const overdueDoing = overdueTasks.filter((t) => t.status === 'doing').length;
  const overdueTodo = overdueTasks.filter((t) => t.status === 'todo').length;
  const meetings = meetingsQuery.data ?? [];

  /* ---------------- 甘特（demo 的结构 + 真数据） ---------------- */
  const ganttRef = useRef<HTMLDivElement>(null);
  const [gw, setGw] = useState(0);
  useEffect(() => {
    const node = ganttRef.current;
    if (!node) return undefined;
    const update = (): void => setGw(node.clientWidth);
    update();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    ro?.observe(node);
    return () => ro?.disconnect();
  }, []);

  const rows = activeProjects.slice(0, 5);
  const range = useMemo(() => {
    const all = rows.flatMap((p) => [dueMs(p.startDate ?? p.createdAt), dueMs(p.dueDate)]).filter((v): v is number => v !== null);
    if (all.length === 0) return null;
    return { min: Math.min(...all) - 6 * DAY, max: Math.max(...all) + 10 * DAY };
  }, [rows]);
  const H = 340; const LEFT = 150; const RIGHT = 14;
  const rowH = rows.length ? Math.min((H - 50) / rows.length, 96) : 0;
  const gx = (ms: number): number => (range ? LEFT + ((ms - range.min) / (range.max - range.min)) * (gw - LEFT - RIGHT) : LEFT);
  const months = useMemo(() => {
    if (!range) return [];
    const list: { label: string; at: number }[] = [];
    const c = new Date(range.min); c.setDate(1);
    for (let i = 0; i < 8; i += 1) {
      const d = new Date(c.getFullYear(), c.getMonth() + i, 1);
      if (d.getTime() < range.min || d.getTime() > range.max) continue;
      list.push({ label: `${d.getMonth() + 1} 月`, at: d.getTime() });
    }
    return list;
  }, [range]);

  /* ---------------- 环图 hover（色块外移 + tooltip） ---------------- */
  const [ringHover, setRingHover] = useState<string | null>(null);

  /* ---------------- 项目栈 ---------------- */
  const [tab, setTab] = useState<'projects' | 'notes' | 'files'>('projects');

  const riskSorted = useMemo(() => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...(risksQuery.data ?? [])].sort((a, b) => (order[a.level] ?? 9) - (order[b.level] ?? 9));
  }, [risksQuery.data]);

  return (
    <div className="wbd">
      {/* 页头完全照 demo 的 .page-head 结构（标题 / 副标题 / 日期 + 胶囊） */}
      <div className="page-head">
        <div>
          <h2>工作台 · {now.getMonth() + 1} 月</h2>
          <p>今天做什么、这周推进到哪，一屏看完。</p>
        </div>
        <div className="head-right">
          <div className="date">
            {now.getFullYear()}年{now.getMonth() + 1}月{now.getDate()}日 周{'日一二三四五六'[now.getDay()]} · 数据实时
          </div>
          <div className="chips">
            <span className="chip"><i className="sp" style={{ background: '#5468ff' }} />在办项目 <b>{activeProjects.length}</b></span>
            <span className="chip"><i className="sp" style={{ background: '#f59f00' }} />今日待办 <b>{todayTodo.length}</b></span>
            <span className="chip"><i className="sp" style={{ background: '#12b886' }} />今日会议 <b>{meetings.length}</b></span>
            <span className="chip"><i className="sp" style={{ background: '#f04438' }} />已逾期 <b>{overdue}</b></span>
          </div>
        </div>
      </div>

      <section className="kpi-strip">
        {kpis.map((k) => (
          <div className="kpi-cell" key={k.label}>
            <div className="k-top"><i className="sp" style={{ background: k.dot }} />{k.label}</div>
            <div className="line">
              {k.delta !== undefined ? (
                <span className={`pill ${k.delta > 0 ? 'up' : k.delta < 0 ? 'down' : 'flat'}`}>
                  {k.delta > 0 ? `↑ ${k.delta}` : k.delta < 0 ? `↓ ${Math.abs(k.delta)}` : '持平'}
                </span>
              ) : null}
              <span className="num"><b>{k.total}</b><span className="u">件</span></span>
            </div>
            <div className="hint">{k.hint}</div>
            <div className="track"><i style={{ width: `${k.total ? Math.round((k.done / k.total) * 100) : 0}%`, background: k.bar }} /></div>
          </div>
        ))}
      </section>

      <section className="row">
        <div className="card gantt-card">
          <div className="card-h"><h3>工作进度</h3><span className="sub">{activeProjects.length} 个在办项目</span><a className="more" onClick={() => void navigate('/projects?view=progress')}>完整甘特 →</a></div>
          <div className="gantt" ref={ganttRef}>
            <svg width={Math.max(gw, 320)} height={H}>
              {gw > 0 && range ? (
                <>
                  {/* 月份刻度 */}
                  {months.map((m) => (
                    <g key={m.label}>
                      <line x1={gx(m.at)} y1={16} x2={gx(m.at)} y2={H - 26} stroke="#f1f4fa" />
                      <text x={gx(m.at) + 6} y={30} fontSize={11} fill="#98a2b8">{m.label}</text>
                    </g>
                  ))}
                  {/* 今天 */}
                  <line x1={gx(Date.now())} y1={16} x2={gx(Date.now())} y2={H - 26} stroke="#f04438" strokeWidth={1.4} strokeDasharray="4 4" opacity={0.85} />
                  <text x={gx(Date.now())} y={H - 10} fontSize={10.5} fill="#f04438" textAnchor="middle">今天</text>

                  {/* 项目条：起点=开始、终点=截止；进度填充；百分比固定在条右端外侧 */}
                  {rows.map((p, i) => {
                    const sMs = dueMs(p.startDate ?? p.createdAt);
                    const eMs = dueMs(p.dueDate);
                    const cy = 44 + i * rowH;
                    const x1 = Math.max(LEFT, Math.min(sMs ? gx(sMs) : LEFT, gw - RIGHT - 12));
                    const x2 = Math.max(x1 + 12, Math.min(eMs ? gx(eMs) : x1 + 40, gw - RIGHT - 46));
                    const fillW = Math.max(4, ((x2 - x1) * p.progress) / 100);
                    return (
                      <g key={p.id}>
                        <text x={4} y={cy + 4.5} fontSize={12} fill="#111a2e">
                          {p.name.length > 9 ? `${p.name.slice(0, 9)}…` : p.name}
                        </text>
                        <rect x={x1} y={cy - 10} width={x2 - x1} height={20} rx={6} fill="#e4e9f2" />
                        <rect x={x1} y={cy - 10} width={fillW} height={20} rx={6} fill={p.color ?? '#5468ff'} opacity={0.95} />
                      </g>
                    );
                  })}

                  {/* 里程碑：只画菱形（文字放 title，避免与条/百分比重叠） */}
                  {rows.map((p, i) => {
                    const list = (milestonesQuery.data ?? []).filter((m: Milestone) => m.projectId === p.id && m.dueDate);
                    if (list.length === 0) return null;
                    // 每行只取最近的一个里程碑，标签放菱形右侧（demo 的做法），不会互相压
                    const m = [...list].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))[0];
                    if (!m) return null;
                    const dm = dueMs(m.dueDate);
                    if (dm === null) return null;
                    // 节点必须落在该项目的条形内部（超出时夹到条的起止之间）
                    const px1 = dueMs(p.startDate ?? p.createdAt);
                    const px2 = dueMs(p.dueDate);
                    const barLeft = Math.max(LEFT, px1 ? gx(px1) : LEFT);
                    const barRight = Math.min(px2 ? gx(px2) : barLeft + 40, gw - RIGHT);
                    const cx = Math.min(Math.max(gx(dm), barLeft + 4), barRight - 4);
                    const cy = 44 + i * rowH;
                    return (
                      <g key={m.id}>
                        <title>{`${m.name} · ${m.dueDate ?? ''}`}</title>
                        <path d={`M${cx},${cy - 6} L${cx + 6},${cy} L${cx},${cy + 6} L${cx - 6},${cy} Z`}
                          fill={m.status === 'done' ? '#f59f00' : '#fff'} stroke="#f59f00" strokeWidth={1.6} />
                        <text x={cx + 10} y={cy + 4} fontSize={10} fill="#b7791f" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                          {m.name}
                        </text>
                      </g>
                    );
                  })}
                </>
              ) : null}
            </svg>
          </div>
          <div className="gantt-legend">
            <span><i style={{ background: '#5468ff' }} />进行中</span>
            <span><i style={{ background: '#eef1f8' }} />剩余工期</span>
            <span>◆ 里程碑</span>
            <span style={{ color: '#f04438' }}>┆ 今天</span>
          </div>
        </div>

        <div className="card status-card">
          <div className="card-h"><h3>任务状态</h3><span className="sub">{counts.total ? Math.round((counts.done / counts.total) * 100) : 0}% 已完成</span><a className="more" onClick={() => void navigate('/projects?view=tasks')}>全部 →</a></div>
          {/* 四段环图 + 外置标签（斜线+水平段）+ 底部图例，按参考图的 ECharts 样式 */}
          <div className="status-ring">
            {(() => {
              const segs = [
                { key: 'done', label: '已完成', value: counts.done, color: '#5b7cfa', ang: -50, side: 'right', dy: -40 },
                { key: 'doing', label: '进行中', value: Math.max(counts.doing - overdueDoing, 0), color: '#63bd6b', ang: 50, side: 'right', dy: 44 },
                { key: 'todo', label: '待处理', value: Math.max(counts.todo - overdueTodo, 0), color: '#f5c451', ang: 150, side: 'left', dy: 44 },
                { key: 'overdue', label: '已逾期', value: overdue, color: '#e8636f', ang: 210, side: 'left', dy: -40 },
              ];
              // 分母用服务端真实总数：逾期已经从 doing/todo 扣掉，四段之和 == counts.total
              const total = counts.total || 1;
              const cx = 210;
              const cy = 100;
              const R = 60;
              const C = 2 * Math.PI * R;
              let acc = 0;
              const arcs = segs.map((seg) => {
                const len = (seg.value / total) * C;
                const offset = -acc;
                acc += len;
                // 中点角度：引线必须从这个位置出发，否则会指到别的色块上
                const midDeg = -90 + ((acc - len / 2) / C) * 360;
                const midRad = (midDeg * Math.PI) / 180;
                const side = Math.cos(midRad) < 0 ? 'left' : 'right';
                // 环外沿径向 18px → 水平接到标签
                const x1 = cx + Math.cos(midRad) * (R + 14);
                const y1 = cy + Math.sin(midRad) * (R + 14);
                const x2 = cx + Math.cos(midRad) * (R + 32);
                const y2 = cy + Math.sin(midRad) * (R + 32);
                const ex = side === 'left' ? 104 : 334;
                const ly = y2;
                return {
                  seg: { ...seg, side }, len, offset, x1, y1, x2, y2, ex, ly,
                  percent: Math.round((seg.value / total) * 100),
                  midRad,
                };
              });
              return (
                <>
                  <svg viewBox="0 0 420 200" width="100%" height="200" role="img" aria-label="任务状态分布">
                    <circle cx={cx} cy={cy} r={R} fill="none" stroke="#fff" strokeWidth={24} />
                    {arcs.map(({ seg, len, offset, midRad }) => {
                      const active = ringHover === seg.key;
                      const dx = active ? Math.cos(midRad) * 9 : 0;
                      const dy = active ? Math.sin(midRad) * 9 : 0;
                      // 色块之间留 4px 间隙（ECharts 的 padAngle 效果），不和相邻块粘在一起
                      const GAP = 3;
                      const arcLen = Math.max(2, len - GAP);
                      const arcOffset = offset - GAP / 2;
                      return (
                        <g key={seg.key}>
                          {/* 视觉层：可移动，不接收鼠标，避免外移后指针脱离造成闪烁 */}
                          <circle cx={cx} cy={cy} r={R} fill="none" stroke={seg.color} strokeWidth={24}
                            strokeDasharray={`${arcLen} ${C - arcLen}`} strokeDashoffset={arcOffset}
                            transform={`translate(${dx} ${dy}) rotate(-90 ${cx} ${cy})`}
                            style={{
                              pointerEvents: 'none',
                              transition: 'transform .18s ease, filter .18s ease',
                              filter: active ? 'drop-shadow(0 3px 7px rgba(17,26,46,.28))' : 'none',
                            }} />
                          {/* 命中层：位置固定、半径更粗，鼠标进出都稳定 */}
                          <circle cx={cx} cy={cy} r={R} fill="none" stroke="#000" strokeOpacity={0} strokeWidth={34}
                            strokeDasharray={`${arcLen} ${C - arcLen}`} strokeDashoffset={arcOffset}
                            transform={`rotate(-90 ${cx} ${cy})`}
                            data-seg={seg.key}
                            style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                            onMouseEnter={() => setRingHover(seg.key)}
                            onMouseLeave={() => setRingHover(null)} />
                        </g>
                      );
                    })}
                    {arcs.map(({ seg, x1, y1, x2, y2, ex, ly }) => (
                      <g key={`l-${seg.key}`}>
                        <path d={`M${x1},${y1} L${x2},${y2} L${ex},${ly}`}
                          fill="none" stroke="#c3cad8" strokeWidth={1} />
                        <text x={seg.side === 'left' ? 8 : 412} y={ly + 4} fontSize={12} fill="#5b6580"
                          textAnchor={seg.side === 'left' ? 'start' : 'end'}>
                          {seg.label}: {seg.value}
                        </text>
                      </g>
                    ))}
                    <text x={cx} y={cy + 2} fontSize={26} fontWeight={700} fill="#111a2e" textAnchor="middle">{total}</text>
                    <text x={cx} y={cy + 20} fontSize={10.5} fill="#98a2b8" textAnchor="middle">总任务</text>
                  </svg>
                  {(() => {
                    const hit = ringHover ? arcs.find((a) => a.seg.key === ringHover) : null;
                    if (!hit) return null;
                    return (
                      <div
                        className="ring-tip"
                        style={{
                          left: `${((cx + Math.cos(hit.midRad) * (R + 26)) / 420) * 100}%`,
                          top: `${((cy + Math.sin(hit.midRad) * (R + 26)) / 200) * 100}%`,
                        }}
                      >
                        <b>任务分布</b>
                        <span>
                          {hit.seg.label}：{hit.seg.value}（{hit.percent}%）
                        </span>
                      </div>
                    );
                  })()}
                  <div className="ring-legend">
                    {segs.map((seg) => (
                      <span key={seg.key}>
                        <i style={{ background: seg.color }} />
                        {seg.label}
                      </span>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>

          <div className="subsec" style={{ marginTop: 4 }}><h4>风险预警</h4><span className="cnt">{riskSorted.length} 条未关闭</span><a className="more" onClick={() => void navigate('/projects?view=risks')}>全部 →</a></div>
          <div className="risk-mini">
            {riskSorted.slice(0, 3).map((r: Risk) => (
              <div className="rm" key={r.id}>
                <span className={`lv ${r.level === 'high' ? 'h' : r.level === 'medium' ? 'm' : 'l'}`}>{r.level === 'high' ? '高' : r.level === 'medium' ? '中' : '低'}</span>
                <span className="tt" title={r.title}>{r.title}</span>
                <span className="pj">{r.projectName ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="row">
        <div className="card c4 fixh">
          <div className="card-h"><h3>今天</h3><span className="sub">{todayTodo.length} 条待办</span><a className="more" onClick={() => void navigate('/projects?view=tasks&due=today')}>全部 →</a></div>
          <div className="list hv-scroll">
            {todayTodo.slice(0, 6).map((t) => (
              <div className="li" key={t.id}>
                <span className="ck" />
                <div><span className="tt">{t.title}</span><span className="mt">{t.projectName ?? '未挂项目'}{t.category ? ` · ${t.category}` : ''}</span></div>
                <span className={`st ${t.priority === 'high' ? 'hot' : t.status === 'done' ? 'ok' : ''}`}>
                  {t.priority === 'high' ? '高' : t.status === 'doing' ? '进行中' : '待处理'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card c4 fixh">
          <div className="card-h"><h3>日程</h3><span className="sub">今天 {meetings.length} 场</span><a className="more" onClick={() => void navigate('/calendar')}>去日历 →</a></div>
          <div className="list hv-scroll">
            {meetings.map((m) => (
              <div className="ev" key={m.id}>
                <span className="tm">{new Date(m.startAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                <div><div className="nm">{m.title}</div><div className="lc">{m.location ?? '—'}</div></div>
              </div>
            ))}
          </div>
        </div>

        <div className="stack-card">
          <div className="deck">
            <div className="stack-inner">
              <div className="stack-head">
                <button className={`stack-tab${tab === 'projects' ? ' on' : ''}`} onClick={() => setTab('projects')}>在办项目 <span className="cnt">{activeProjects.length}</span></button>
                <button className={`stack-tab${tab === 'notes' ? ' on' : ''}`} onClick={() => setTab('notes')}>随记</button>
                <button className={`stack-tab${tab === 'files' ? ' on' : ''}`} onClick={() => setTab('files')}>文件资料</button>
                <a className="more" onClick={() => void navigate(tab === 'projects' ? '/projects?view=projects' : tab === 'notes' ? '/workspace' : '/files')}>全部 →</a>
              </div>
              <div className="stack-body hv-scroll">
                {tab === 'projects' ? (
                  <div className="stack-panel on">
                    {activeProjects.slice(0, 5).map((p: Project, i) => (
                      <div className="pj" key={p.id}>
                        <span className="nm">{p.name}</span><span className="pc">{p.progress}%</span>
                        <div className="bar"><i style={{ width: `${p.progress}%`, background: p.color ?? ['#5468ff', '#8b5cf6', '#12b886', '#f59f00'][i % 4] }} /></div>
                        <span className="due">截止 {p.dueDate ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {tab === 'notes' ? <div className="stack-panel on"><div className="stack-empty">随记请在「工作台 › 随记」中查看</div></div> : null}
                {tab === 'files' ? <div className="stack-panel on"><div className="stack-empty">文件请到「文件资料」页查看</div></div> : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="row">
        <div className="card table-card">
          <div className="tb-head"><h3>最近的到期任务</h3><span className="sub">共 {tasks.filter((t) => t.status !== 'done').length} 条</span></div>
          <div className="tbl-wrap hv-scroll">
            <table className="tbl">
              <thead><tr><th>任务</th><th>项目</th><th>分类</th><th>到期</th><th>剩余</th><th style={{ textAlign: 'right' }}>状态</th></tr></thead>
              <tbody>
                {[...tasks].filter((t) => t.status !== 'done').sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')).slice(0, 8).map((t) => {
                  const late = t.dueDate !== null && t.dueDate < today;
                  const diff = t.dueDate ? Math.round((new Date(`${t.dueDate}T00:00:00+08:00`).getTime() - new Date(`${today}T00:00:00+08:00`).getTime()) / DAY) : null;
                  return (
                    <tr key={t.id}>
                      <td>{t.title}</td><td>{t.projectName ?? '—'}</td><td className="pj">{t.category ?? '—'}</td>
                      <td>{t.dueDate ?? '—'}</td>
                      <td className={late ? 'late' : ''}>{diff === null ? '—' : diff < 0 ? `逾期 ${Math.abs(diff)} 天` : diff === 0 ? '今天' : `${diff} 天`}</td>
                      <td style={{ textAlign: 'right' }}><span className={`stt ${t.status}`}>{t.status === 'todo' ? '待处理' : t.status === 'doing' ? '进行中' : '已完成'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
