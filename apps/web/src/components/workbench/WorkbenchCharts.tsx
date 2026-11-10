import { useMemo } from 'react';
import { Empty } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAllTasks } from '../../hooks/useAllTasks';
import { useUserProjects } from '../../hooks/useUserData';
import { designVars } from '../../styles/theme';
import { Panel } from '../ui';
import { ProgressRing } from '../ui/charts';
import { ThinProgress } from '../user/ThinProgress';
import { projectColor } from '../user/visuals';

/**
 * 工作台的「工作进度」与「工作完成率」两块（D-34 改成 1/4 宽的单列紧凑版）。
 *
 * 老六的新版式是四块一行（工作进度 / 任务状态 / 工作完成率 / 风险预警），
 * 所以这里不能再按"三列大卡"的排法写：项目名、进度条、百分比要能塞进 ~380px。
 * 「工作类别」在新版式里没有位置，直接去掉（不是藏起来）。
 */

const WEEK_MS = 7 * 24 * 3600 * 1000;

/** 工作进度：平均完成率 + 前 3 个项目（窄卡里只留最关键的） */
export function WorkProgressPanel(): JSX.Element {
  const navigate = useNavigate();
  const projectsQuery = useUserProjects();
  const projects = projectsQuery.data?.items ?? [];
  const active = projects.filter((project) => project.status === 'active');

  const average = useMemo(() => {
    if (projects.length === 0) return 0;
    return Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length);
  }, [projects]);

  return (
    <Panel title="工作进度" more="看甘特" onMore={() => void navigate('/projects?view=progress')} flush>
      <div className="wb-mini-stat">
        <ProgressRing value={average} size={64} thickness={8} color={designVars.primary} />
        <div className="wb-mini-stat-text">
          <b>{active.length}</b>
          <span>个在办项目</span>
        </div>
      </div>
      <div className="wb-mini-list">
        {projects.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} styles={{ image: { height: 32 } }} description="还没有项目" />
        ) : (
          projects.slice(0, 3).map((project, index) => (
            <div key={project.id} className="wb-mini-row">
              <span className="wb-mini-name" title={project.name}>
                {project.name}
              </span>
              <span className="wb-mini-value">{project.progress}%</span>
              <ThinProgress percent={project.progress} color={projectColor(project.color, index)} />
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

/** 工作完成率：总体百分比 + 近 4 周完成数 */
export function WorkCompletionPanel(): JSX.Element {
  const tasksQuery = useAllTasks();
  const tasks = tasksQuery.data ?? [];

  const stat = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((task) => task.status === 'done').length;
    const rate = total === 0 ? 0 : Math.round((done / total) * 100);
    const now = Date.now();
    const buckets = [3, 2, 1, 0].map((offset) => {
      const from = now - (offset + 1) * WEEK_MS;
      const to = now - offset * WEEK_MS;
      return {
        label: offset === 0 ? '本周' : `${offset}周前`,
        count: tasks.filter((task) => {
          if (task.status !== 'done' || !task.doneAt) return false;
          const at = new Date(task.doneAt).getTime();
          return at >= from && at < to;
        }).length,
      };
    });
    return { total, done, rate, buckets };
  }, [tasks]);

  const max = Math.max(1, ...stat.buckets.map((bucket) => bucket.count));

  return (
    <Panel title="工作完成率" flush>
      <div className="wb-mini-stat">
        <div className="wb-mini-rate">
          <b>{stat.rate}%</b>
          <span>
            {stat.done}/{stat.total} 已完成
          </span>
        </div>
      </div>
      <div className="wb-mini-bars">
        {stat.buckets.map((bucket) => (
          <div key={bucket.label} className="wb-mini-bar">
            <span className="wb-mini-bar-value">{bucket.count}</span>
            <div className="wb-mini-bar-track">
              <div
                className="wb-mini-bar-fill"
                style={{ height: `${Math.max(4, (bucket.count / max) * 100)}%` }}
              />
            </div>
            <span className="wb-mini-bar-label">{bucket.label}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
