import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAllTasks } from '../../hooks/useAllTasks';

/**
 * 侧栏底部「本月完成」（demo 里有这块）。
 * 口径：本月到期任务的完成率，点进任务列表。
 */
export function MonthlyDoneCard(): JSX.Element {
  const navigate = useNavigate();
  const tasksQuery = useAllTasks();
  const tasks = tasksQuery.data ?? [];

  const stat = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    let total = 0;
    let done = 0;
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const t = new Date(`${task.dueDate}T00:00:00+08:00`).getTime();
      if (t < from || t >= to) continue;
      total += 1;
      if (task.status === 'done') done += 1;
    }
    return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
  }, [tasks]);

  return (
    <button type="button" className="wb-monthly-card" onClick={() => void navigate('/projects?view=tasks')}>
      <span className="wb-monthly-row">
        <span>本月完成</span>
        <span>{stat.percent}%</span>
      </span>
      <b>
        {stat.done} / {stat.total} 件
      </b>
      <span className="wb-monthly-track">
        <i style={{ width: `${stat.percent}%` }} />
      </span>
      <span className="wb-monthly-hint">还差 {Math.max(0, stat.total - stat.done)} 件完成本月</span>
    </button>
  );
}
