import { Progress, Statistic } from 'antd';
import { fetchTaskStats, statsKeys } from '../../../api/stats';
import { ModuleEmpty, ModuleFailure, ModuleLoading, useModuleResource } from './ModuleShell';

/**
 * 数据报表模块 —— §7.5：
 * `GET /stats/tasks` 返回 todo / doing / done 三个数字。
 *
 * **不引图表库**（§8.9），用 AntD 的 Statistic + Progress 组合表达分布。
 */
export function DataChartModule() {
  const resource = useModuleResource({
    queryKey: statsKeys.tasks,
    queryFn: fetchTaskStats,
  });

  if (resource.status === 'loading') return <ModuleLoading />;
  if (resource.status === 'error') {
    return <ModuleFailure message={resource.message} onRetry={resource.retry} />;
  }

  const { todo, doing, done } = resource.data;
  const total = todo + doing + done;
  if (total === 0) return <ModuleEmpty text="还没有任务数据" />;

  const rows = [
    { key: 'todo', label: '未开始', value: todo, color: 'var(--muted)' },
    { key: 'doing', label: '进行中', value: doing, color: 'var(--primary)' },
    { key: 'done', label: '已完成', value: done, color: 'var(--green)' },
  ];

  return (
    <div className="wb-stats">
      {rows.map((row) => (
        <div className="wb-stats-row" key={row.key}>
          <Statistic
            title={row.label}
            value={row.value}
            valueStyle={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}
          />
          <Progress
            percent={Math.round((row.value / total) * 100)}
            size={[-1, 7]}
            showInfo={false}
            strokeColor={row.color}
            trailColor="#eef1f6"
          />
        </div>
      ))}
    </div>
  );
}
