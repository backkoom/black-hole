import { useMemo, useState } from 'react';
import { Avatar, Segmented } from 'antd';
import {
  CheckCircleOutlined,
  CheckSquareOutlined,
  FolderOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { Project } from '@workbench/shared/types';
import { useUserProjects } from '../hooks/useUserData';
import {
  useStatsDistribution,
  useStatsTaskCounts,
  useStatsTeamWorkload,
  useStatsTrend,
} from '../hooks/useUserStats';
import { dailyDateSeries, seriesDelta } from '../utils/trend';
import { designVars } from '../styles/theme';
import { LegendItem, MetricCard, Panel, ToneTag } from '../components/ui';
import { DonutChart, LineChart } from '../components/ui/charts';
import { PageHeader } from '../components/PageHeader';
import { StateBlock } from '../components/user/StateBlock';
import { ThinProgress } from '../components/user/ThinProgress';
import { BarChart } from '../components/user/BarChart';
import '../styles/analytics.css';
import '../styles/charts.css';

/**
 * 数据统计页（老六最终用户端界面 · 图9）。
 *
 * 组件树：
 * AnalyticsPage
 * ├─ PageHeader(「数据统计」+ 副标题)
 * ├─ .wb-metric-row（4 张指标卡：项目总数 / 任务总数 / 已完成任务 / 团队成员数）
 * └─ .wb-agg-grid（12 列栅格）
 *    ├─ 任务完成趋势（span 8，左上宽）+ 最近 7 天 / 最近 30 天切换
 *    ├─ 任务分类分布（span 4，右上，环形图 + 图例）
 *    ├─ 项目进度分布（span 6，左中，柱状图）
 *    ├─ 团队工作量统计（span 6，右中，负责人 + 条形 + 完成率）
 *    ├─ 任务状态统计（span 6，左下，环形图）
 *    └─ 项目完成率排行（span 6，右下，表格）
 *
 * 数据口径（全部真实调接口，没有 mock）：
 * - 指标卡的任务数：GET /api/stats/tasks（todo / doing / done）
 * - 指标卡的涨跌与迷你折线：GET /api/stats/trend?days=7 的真实历史；**没有历史就不给**
 *   （团队成员数没有历史来源 → 不给 delta / trend）
 * - 任务完成趋势：GET /api/stats/trend?days=7|30（按任务创建日分桶）
 * - 任务分类分布 / 项目进度分布：GET /api/stats/distribution
 * - 团队工作量：GET /api/stats/team-workload
 * - 项目完成率排行：GET /api/projects 按 progress 降序取前 10
 */

/** 分类配色（展示层配色：接口只给分类名与数量，不给颜色） */
const CATEGORY_COLORS = [
  designVars.primary,
  designVars.green,
  designVars.orange,
  designVars.purple,
  designVars.red,
  '#0ea5e9',
  '#14b8a6',
  '#f472b6',
];

/** 进度分桶配色（0-20% → 100% 依次变绿） */
const BUCKET_COLORS = ['#ef4444', '#f59e0b', '#2563eb', '#8b5cf6', '#10b981'];

export function AnalyticsPage() {
  const [days, setDays] = useState<7 | 30>(7);

  const projectsQuery = useUserProjects();
  const taskCountsQuery = useStatsTaskCounts();
  const cardTrendQuery = useStatsTrend(7);
  const trendQuery = useStatsTrend(days);
  const distributionQuery = useStatsDistribution();
  const workloadQuery = useStatsTeamWorkload();

  const projects = projectsQuery.data?.items ?? [];
  const taskCounts = taskCountsQuery.data;
  const cardTrend = cardTrendQuery.data?.days ?? [];
  const trendDays = trendQuery.data?.days ?? [];
  const distribution = distributionQuery.data;
  const workload = workloadQuery.data?.members ?? [];

  const totalTasks = useMemo(
    () => (taskCounts ? taskCounts.todo + taskCounts.doing + taskCounts.done : 0),
    [taskCounts],
  );

  /** 任务分类分段（value = 该分类的任务数；颜色按顺序取色板） */
  const categorySegments = useMemo(
    () =>
      (distribution?.categories ?? []).map((category, index) => ({
        name: category.name,
        value: category.count,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] ?? designVars.primary,
      })),
    [distribution],
  );

  const categoryTotal = useMemo(
    () => categorySegments.reduce((sum, segment) => sum + segment.value, 0),
    [categorySegments],
  );

  /** 团队成员数 = 项目成员 ∪ 任务负责人 ∪ 工作量里的负责人（真实数据去重） */
  const teamMemberCount = useMemo(() => {
    const names = new Set<string>();
    projects.forEach((project) => project.members.forEach((name) => names.add(name)));
    workload.forEach((member) => names.add(member.name));
    return names.size;
  }, [projects, workload]);

  /** 指标卡的迷你折线与涨跌 —— 全部来自真实历史 */
  const dailyCreated = useMemo(
    () => cardTrend.map((day) => day.total),
    [cardTrend],
  );
  const dailyDone = useMemo(
    () => cardTrend.map((day) => day.done),
    [cardTrend],
  );
  const dailyNewProjects = useMemo(
    () => dailyDateSeries(projects.map((project) => project.createdAt)),
    [projects],
  );

  /** 任务完成趋势的三条线 */
  const trendSeries = useMemo(
    () => [
      {
        name: '任务总数',
        color: designVars.primary,
        points: trendDays.map((day) => ({ label: day.label, value: day.total })),
      },
      {
        name: '已完成',
        color: designVars.green,
        points: trendDays.map((day) => ({ label: day.label, value: day.done })),
      },
      {
        name: '待完成',
        color: designVars.orange,
        points: trendDays.map((day) => ({ label: day.label, value: day.pending })),
      },
    ],
    [trendDays],
  );

  /** 项目进度分布的柱状图数据 */
  const bucketData = useMemo(
    () =>
      (distribution?.buckets ?? []).map((bucket, index) => ({
        label: bucket.label,
        value: bucket.count,
        color: BUCKET_COLORS[index % BUCKET_COLORS.length] ?? designVars.primary,
      })),
    [distribution],
  );

  /** 团队工作量：条形长度按最大任务数归一 */
  const maxTaskCount = useMemo(
    () => workload.reduce((max, member) => Math.max(max, member.taskCount), 0),
    [workload],
  );

  /** 项目完成率排行：按 progress 降序取前 10 */
  const ranking = useMemo(
    () => [...projects].sort((a, b) => b.progress - a.progress).slice(0, 10),
    [projects],
  );

  return (
    <div className="wb-page">
      <PageHeader title="数据统计" subtitle="多维度数据分析，全面掌握项目进展与团队效能" />

      {/* 4 张指标卡 */}
      <div className="wb-metric-row">
        <MetricCard
          label="项目总数"
          value={projectsQuery.data?.total ?? 0}
          icon={<FolderOutlined />}
          iconColor={designVars.primary}
          delta={seriesDelta(dailyNewProjects)}
          trend={dailyNewProjects}
          hint="近 7 天新建"
        />
        <MetricCard
          label="任务总数"
          value={totalTasks}
          icon={<CheckSquareOutlined />}
          iconColor={designVars.orange}
          delta={seriesDelta(dailyCreated)}
          trend={dailyCreated}
          hint="近 7 天每日新增"
        />
        <MetricCard
          label="已完成任务"
          value={taskCounts?.done ?? 0}
          icon={<CheckCircleOutlined />}
          iconColor={designVars.green}
          delta={seriesDelta(dailyDone)}
          trend={dailyDone}
          hint="近 7 天创建且已完成"
        />
        <MetricCard
          label="团队成员数"
          value={teamMemberCount}
          icon={<TeamOutlined />}
          iconColor={designVars.purple}
          hint="项目成员与任务负责人去重"
        />
      </div>

      <div className="wb-agg-grid">
        {/* 左上（宽）：任务完成趋势 */}
        <div className="wb-agg-8">
          <Panel
            title="任务完成趋势"
            extra={
              <Segmented
                size="small"
                value={days}
                onChange={(value) => setDays(value === 30 ? 30 : 7)}
                options={[
                  { label: '最近 7 天', value: 7 },
                  { label: '最近 30 天', value: 30 },
                ]}
              />
            }
            flush
          >
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={trendQuery.isPending}
                error={trendQuery.isError ? trendQuery.error : undefined}
                onRetry={() => void trendQuery.refetch()}
                isEmpty={trendDays.length === 0}
                emptyText="暂无趋势数据"
              >
                <div className="wb-chart">
                  <LineChart series={trendSeries} height={220} />
                </div>
                <div style={{ display: 'flex', gap: 18, marginTop: 6 }}>
                  <LegendItem color={designVars.primary} name="任务总数" />
                  <LegendItem color={designVars.statusDone} name="已完成" />
                  <LegendItem color={designVars.orange} name="待完成" />
                </div>
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 右上：任务分类分布 */}
        <div className="wb-agg-4">
          <Panel title="任务分类分布" flush>
            <div style={{ padding: '4px 18px 16px' }}>
              <StateBlock
                loading={distributionQuery.isPending}
                error={distributionQuery.isError ? distributionQuery.error : undefined}
                onRetry={() => void distributionQuery.refetch()}
                isEmpty={categorySegments.length === 0}
                emptyText="暂无分类数据"
              >
                <div className="wb-status-chart">
                  <DonutChart
                    segments={categorySegments}
                    centerValue={categoryTotal}
                    centerLabel="任务总数"
                    size={126}
                    thickness={16}
                  />
                  <div className="wb-status-legend">
                    {categorySegments.map((segment) => (
                      <LegendItem
                        key={segment.name}
                        color={segment.color}
                        name={segment.name}
                        value={segment.value}
                      />
                    ))}
                  </div>
                </div>
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 左中：项目进度分布 */}
        <div className="wb-agg-6">
          <Panel title="项目进度分布" flush>
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={distributionQuery.isPending}
                error={distributionQuery.isError ? distributionQuery.error : undefined}
                onRetry={() => void distributionQuery.refetch()}
                isEmpty={bucketData.length === 0}
                emptyText="暂无项目数据"
              >
                <BarChart data={bucketData} height={220} />
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 右中：团队工作量统计 */}
        <div className="wb-agg-6">
          <Panel title="团队工作量统计" flush>
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={workloadQuery.isPending}
                error={workloadQuery.isError ? workloadQuery.error : undefined}
                onRetry={() => void workloadQuery.refetch()}
                isEmpty={workload.length === 0}
                emptyText="暂无工作量数据"
              >
                <div className="wb-workload">
                  {workload.map((member) => (
                    <div className="wb-workload-row" key={member.userId}>
                      <Avatar
                        size={26}
                        style={{ background: '#dbe4f5', color: designVars.primary, fontSize: 12 }}
                      >
                        {member.name.slice(0, 1)}
                      </Avatar>
                      <span className="wb-workload-name" title={member.name}>
                        {member.name}
                      </span>
                      <span className="wb-workload-bar">
                        <span
                          className="wb-workload-bar-fill"
                          style={{
                            width: `${
                              maxTaskCount === 0 ? 0 : (member.taskCount / maxTaskCount) * 100
                            }%`,
                          }}
                        />
                      </span>
                      <span className="wb-workload-count">{member.taskCount} 项</span>
                      <span className="wb-workload-rate">
                        <ToneTag tone={member.rate >= 80 ? 'green' : member.rate >= 50 ? 'blue' : 'orange'}>
                          {member.rate}%
                        </ToneTag>
                      </span>
                    </div>
                  ))}
                </div>
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 左下：任务状态统计 */}
        <div className="wb-agg-6">
          <Panel title="任务状态统计" flush>
            <div style={{ padding: '4px 18px 16px' }}>
              <StateBlock
                loading={taskCountsQuery.isPending}
                error={taskCountsQuery.isError ? taskCountsQuery.error : undefined}
                onRetry={() => void taskCountsQuery.refetch()}
                isEmpty={totalTasks === 0}
                emptyText="还没有任务"
              >
                <div className="wb-status-chart">
                  <DonutChart
                    segments={[
                      { name: '已完成', value: taskCounts?.done ?? 0, color: designVars.statusDone },
                      { name: '进行中', value: taskCounts?.doing ?? 0, color: designVars.statusDoing },
                      { name: '待处理', value: taskCounts?.todo ?? 0, color: designVars.orange },
                    ]}
                    centerValue={totalTasks}
                    centerLabel="总任务"
                    size={126}
                    thickness={16}
                  />
                  <div className="wb-status-legend">
                    <LegendItem color={designVars.statusDone} name="已完成" value={taskCounts?.done ?? 0} />
                    <LegendItem color={designVars.statusDoing} name="进行中" value={taskCounts?.doing ?? 0} />
                    <LegendItem color={designVars.orange} name="待处理" value={taskCounts?.todo ?? 0} />
                  </div>
                </div>
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 右下：项目完成率排行 */}
        <div className="wb-agg-6">
          <Panel title="项目完成率排行" flush>
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={projectsQuery.isPending}
                error={projectsQuery.isError ? projectsQuery.error : undefined}
                onRetry={() => void projectsQuery.refetch()}
                isEmpty={ranking.length === 0}
                emptyText="还没有项目"
              >
                <div className="wb-rank">
                  <div className="wb-rank-head">
                    <span style={{ width: 34 }}>排名</span>
                    <span style={{ flex: 1 }}>项目</span>
                    <span style={{ width: 118, textAlign: 'right' }}>完成率</span>
                  </div>
                  {ranking.map((project: Project, index: number) => (
                    <div className="wb-rank-row" key={project.id}>
                      <span className="wb-rank-no">
                        {index < 3 ? <ToneTag tone="orange">NO.{index + 1}</ToneTag> : index + 1}
                      </span>
                      <span className="wb-rank-name" title={project.name}>
                        {project.name}
                      </span>
                      <span className="wb-rank-rate">
                        <span className="wb-rank-bar">
                          <ThinProgress percent={project.progress} height={6} />
                        </span>
                        <span className="wb-rank-percent">{project.progress}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </StateBlock>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
