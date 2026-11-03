import { Button, Skeleton } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { fetchStatsOverview, statsKeys } from '../../api/stats';
import { useAsyncResource } from '../../hooks/useAsyncResource';

/**
 * 指标卡行 —— pages.md §2「MetricsRow（一行 4 个）」。
 *
 * 数据源只有一个：`GET /api/stats/overview`（openapi §/api/stats/overview）。
 *
 * 口径（全部用接口返回值，前端不自己算）：
 * - 今日任务：`todayTotal`，副标 `todayDone`；
 * - 进行中：`doingTotal`，副标 `doingToday`（今日到期）；
 * - 项目进度：`projectCount`（活跃项目数）；
 * - 本周完成率：`weeklyRate` —— **分母为 0 时后端返回 null**，这时显示「—」，不能当 0 渲染。
 *
 * 三态：骨架屏 → 超过 3 秒转失败态（带重试）→ 成功。
 */

export function MetricsRow() {
  const resource = useAsyncResource({
    queryKey: statsKeys.overview,
    queryFn: fetchStatsOverview,
  });

  if (resource.status === 'loading') {
    return (
      <div className="wb-metrics">
        {[0, 1, 2, 3].map((index) => (
          <div className="wb-metric" key={index}>
            <Skeleton active title={false} paragraph={{ rows: 1 }} />
          </div>
        ))}
      </div>
    );
  }

  if (resource.status === 'error') {
    return (
      <div className="wb-metrics wb-metrics-failed">
        <div className="wb-metric-error">
          <span className="wb-module-failure-title">加载失败</span>
          <span className="wb-module-failure-text">{resource.message}</span>
          <Button size="small" icon={<ReloadOutlined />} onClick={resource.retry}>
            重试
          </Button>
        </div>
      </div>
    );
  }

  const overview = resource.data;
  const cards = [
    {
      key: 'today',
      label: '今日任务',
      value: String(overview.todayTotal),
      note: `已完成 ${overview.todayDone}`,
    },
    {
      key: 'doing',
      label: '进行中',
      value: String(overview.doingTotal),
      note: `今日到期 ${overview.doingToday}`,
    },
    {
      key: 'project',
      label: '项目进度',
      value: String(overview.projectCount),
      note: '活跃项目数',
    },
    {
      key: 'weekly',
      label: '本周完成率',
      value: overview.weeklyRate === null ? '—' : `${overview.weeklyRate}%`,
      note: `本周完成 ${overview.weeklyDone}/${overview.weeklyTotal}`,
    },
  ];

  return (
    <div className="wb-metrics">
      {cards.map((card) => (
        <div className="wb-metric" key={card.key}>
          <div className="wb-metric-label">{card.label}</div>
          <div className="wb-metric-value">{card.value}</div>
          <div className="wb-metric-note">{card.note}</div>
        </div>
      ))}
    </div>
  );
}
