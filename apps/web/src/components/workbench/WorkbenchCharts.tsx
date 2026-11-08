import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAllTasks } from '../../hooks/useAllTasks';
import { useUserProjects } from '../../hooks/useUserData';
import { designVars } from '../../styles/theme';
import { Empty } from 'antd';
import { DonutChart, ProgressRing } from '../ui/charts';
import { ThinProgress } from '../user/ThinProgress';
import { projectColor } from '../user/visuals';

/**
 * 工作台数据看板（D-31）—— 老六指定的三块：**工作进度 / 工作类别 / 工作完成率**。
 *
 * 为什么不用原来的 AnalyticsPage：那张"数据统计"有六块（趋势/分类/项目分布/团队量/状态/排行），
 * 放在工作台底部太长，且和上面的面板重复。这里只留三块，每块都**标题即口径**：
 * - 工作进度：在办项目的平均完成率 + 前 5 个项目各自的进度；
 * - 工作类别：任务按分类计数（环图 + 图例）；
 * - 工作完成率：总体完成率（环）+ 近 4 周每周完成数（柱）。
 *
 * 数据全部由前端从真实接口聚合（任务量小，一次拿全量比造 3 个统计接口划算），
 * 不写死任何演示数字。
 */

const WEEK_MS = 7 * 24 * 3600 * 1000;

export function WorkbenchCharts(): JSX.Element {
  const navigate = useNavigate();
  const projectsQuery = useUserProjects();
  const tasksQuery = useAllTasks();
  const projects = projectsQuery.data?.items ?? [];
  const tasks = tasksQuery.data ?? [];

  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === 'active'),
    [projects],
  );

  /** 1) 工作进度：平均完成率 + 前 5 个项目 */
  const progress = useMemo(() => {
    if (projects.length === 0) return { average: 0, rows: [] as typeof projects };
    const average = Math.round(
      projects.reduce((sum, project) => sum + project.progress, 0) / projects.length,
    );
    return { average, rows: projects.slice(0, 5) };
  }, [projects]);

  /** 2) 工作类别：按 category 聚合；没填分类的归"未分类"，不丢数 */
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of tasks) {
      const key = (task.category ?? '').trim() || '未分类';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const palette = [
      designVars.primary,
      designVars.green,
      designVars.orange,
      designVars.purple,
      designVars.red,
      designVars.muted,
    ];
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value], index) => ({ name, value, color: palette[index] ?? designVars.muted }));
  }, [tasks]);

  /** 3) 工作完成率：总体 + 近 4 周完成数 */
  const completion = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((task) => task.status === 'done').length;
    const rate = total === 0 ? 0 : Math.round((done / total) * 100);

    const now = Date.now();
    const buckets = [3, 2, 1, 0].map((offset) => {
      const from = now - (offset + 1) * WEEK_MS;
      const to = now - offset * WEEK_MS;
      const count = tasks.filter((task) => {
        if (task.status !== 'done' || !task.doneAt) return false;
        const at = new Date(task.doneAt).getTime();
        return at >= from && at < to;
      }).length;
      return { label: offset === 0 ? '本周' : `${offset} 周前`, count };
    });
    return { total, done, rate, buckets };
  }, [tasks]);

  const maxBucket = Math.max(1, ...completion.buckets.map((bucket) => bucket.count));

  return (
    <div className="wb-charts">
      {/* 工作进度 */}
      <section className="wb-charts-card">
        <header>
          <h4>工作进度</h4>
          <button type="button" className="wb-charts-more" onClick={() => void navigate('/projects?view=progress')}>
            看甘特
          </button>
        </header>
        <div className="wb-charts-body">
          <div className="wb-charts-ring">
            <ProgressRing value={progress.average} size={92} thickness={9} color={designVars.primary} />
            <span className="wb-charts-ring-label">
              平均完成率
              <b>{activeProjects.length} 个在办</b>
            </span>
          </div>
          <div className="wb-charts-list">
            {progress.rows.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} styles={{ image: { height: 32 } }} description="还没有项目" />
            ) : (
              progress.rows.map((project, index) => (
                <div key={project.id} className="wb-charts-row">
                  <span className="wb-charts-name" title={project.name}>
                    {project.name}
                  </span>
                  <ThinProgress percent={project.progress} color={projectColor(project.color, index)} />
                  <span className="wb-charts-value">{project.progress}%</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* 工作类别 */}
      <section className="wb-charts-card">
        <header>
          <h4>工作类别</h4>
          <span className="wb-charts-sub">共 {tasks.length} 条任务</span>
        </header>
        <div className="wb-charts-body">
          {categories.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} styles={{ image: { height: 60 } }} description="还没有任务" />
          ) : (
            <>
              <DonutChart
                segments={categories.map((item) => ({ name: item.name, value: item.value, color: item.color }))}
                centerValue={tasks.length}
                centerLabel="任务"
                size={110}
                thickness={14}
              />
              <ul className="wb-charts-legend">
                {categories.map((item) => (
                  <li key={item.name}>
                    <span className="wb-charts-dot" style={{ background: item.color }} />
                    <span className="wb-charts-legend-name" title={item.name}>
                      {item.name}
                    </span>
                    <span className="wb-charts-legend-value">{item.value}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* 工作完成率 */}
      <section className="wb-charts-card">
        <header>
          <h4>工作完成率</h4>
          <span className="wb-charts-sub">
            {completion.done}/{completion.total}
          </span>
        </header>
        <div className="wb-charts-body wb-charts-body-col">
          <div className="wb-charts-rate">
            <b>{completion.rate}%</b>
            <span>全部任务完成率</span>
          </div>
          <div className="wb-charts-bars">
            {completion.buckets.map((bucket) => (
              <div key={bucket.label} className="wb-charts-bar">
                <div className="wb-charts-bar-track">
                  <div
                    className="wb-charts-bar-fill"
                    style={{ height: `${Math.max(6, (bucket.count / maxBucket) * 100)}%` }}
                    title={`${bucket.label}完成 ${bucket.count} 条`}
                  />
                </div>
                <span className="wb-charts-bar-value">{bucket.count}</span>
                <span className="wb-charts-bar-label">{bucket.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
