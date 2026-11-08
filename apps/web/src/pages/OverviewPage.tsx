import { useMemo } from 'react';
import { Avatar, Button } from 'antd';
import {
  CalendarOutlined,
  CheckOutlined,
  FolderOutlined,
  ScheduleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Project } from '@blackhole/shared/types';
import { listIdeas } from '../api/ideas';
import { listTasks } from '../api/tasks';
import { useUserProjects } from '../hooks/useUserData';
import { useTaskCounts } from '../hooks/useTaskCounts';
import { useStatsTeamWorkload } from '../hooks/useUserStats';
import { formatDateOnly } from '../utils/datetime';
import { designVars } from '../styles/theme';
import { LegendItem, MetricCard, Panel } from '../components/ui';
import { DonutChart } from '../components/ui/charts';
import { PageHeader } from '../components/PageHeader';
import { StateBlock } from '../components/user/StateBlock';
import { ThinProgress } from '../components/user/ThinProgress';
import { projectColor, projectIcon } from '../components/user/visuals';
import { AnalyticsPage } from './AnalyticsPage';

/**
 * 工作台（D-24，2026-11-08 改版）。
 *
 * 产品定位是**团队工作台**：一屏看清"今天做什么、这周这月推进到哪"，
 * 哪个数字不对就点进去处理。所以这一页只做**聚合展示 + 下钻入口**，
 * 不再重复放明细表（明细都在「项目管理」的五个视图里）。
 *
 * 布局（对应老六给的草图）：
 *   ① 六张指标卡：我的工作 / 今日任务 / 周工作 / 月度工作 / 季度工作 / 年度工作
 *      —— 整张卡可点，点数字直接跳到对应页面（二级下钻）
 *         我的工作 → 项目管理 › 年度规划（原「项目档案」，改名「年度工作规划」）
 *         今日任务 → 项目管理 › 任务（?due=today）
 *         周工作   → 项目管理 › 周进度（原「进度追踪」，改名「周工作完成进度」）
 *         月/季/年 → 项目管理 › 任务（?due=month|quarter|year）
 *   ② 左：任务状态（环图）/ 年度工作规划（项目进度，点进年度规划）
 *      右：随记（最近 5 条，去 workspace 记录）/ 团队成员（工作量）
 *   ③ 通栏：数据看板 —— 直接内嵌原「数据统计」页（embedded 模式，去掉了它的页头与指标卡），
 *      独立的「数据统计」入口已取消（D-24），老链接 /analytics 重定向回本页
 *
 * 数据口径（全部真实接口，没有 mock）：
 * - 我的工作：GET /api/projects 里 status=active 的数量
 * - 今日/周/月/季/年：GET /api/tasks?due=… 的 total（pageSize=1，只取计数）
 * - 任务状态：GET /api/stats/tasks 的 todo / doing / done
 * - 随记：GET /api/ideas 最近 5 条
 * - 团队成员：GET /api/stats/team-workload（成员 + 在办/完成率）
 */
export function OverviewPage() {
  const navigate = useNavigate();

  const projectsQuery = useUserProjects();
  const { counts: taskCounts, query: taskCountsQuery } = useTaskCounts();

  const projects = projectsQuery.data?.items ?? [];
  const taskTotal = taskCounts.total;

  /** 我的工作 = 在办项目（服务端按任务完成情况实时算 status） */
  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === 'active'),
    [projects],
  );

  /**
   * 五个时间区间的任务数 —— 每档只取 total。
   * 区间口径在东八区服务端算（自然周/月/季/年），前端自己按 Date 算容易和统计页对不上；
   * 这里 pageSize=1，五个请求加起来仍是毫秒级。
   */
  const rangeQuery = useQuery({
    queryKey: ['workbench', 'ranges'],
    queryFn: async () => {
      const dues = ['today', 'week', 'month', 'quarter', 'year'] as const;
      const results = await Promise.all(dues.map((due) => listTasks({ page: 1, pageSize: 1, due })));
      return {
        today: results[0]?.total ?? 0,
        week: results[1]?.total ?? 0,
        month: results[2]?.total ?? 0,
        quarter: results[3]?.total ?? 0,
        year: results[4]?.total ?? 0,
      };
    },
    staleTime: 30_000,
  });
  const ranges = rangeQuery.data ?? { today: 0, week: 0, month: 0, quarter: 0, year: 0 };

  /** 随记（原「灵感记录」）—— 工作台只显示最近 5 条 */
  const ideasQuery = useQuery({
    queryKey: ['workbench', 'ideas'],
    queryFn: () => listIdeas({ page: 1, pageSize: 5 }),
    staleTime: 30_000,
  });
  const ideas = ideasQuery.data?.items ?? [];

  /** 团队成员工作量（复用统计接口，不额外造接口） */
  const workloadQuery = useStatsTeamWorkload();
  const workload = (workloadQuery.data?.members ?? []).slice(0, 6);

  const renderProjectRow = (project: Project, index: number) => {
    const color = projectColor(project.color, index);
    return (
      <div className="wb-progress-row" key={project.id}>
        <span className="wb-swatch" style={{ background: color }}>
          {projectIcon(project.icon)}
        </span>
        <span className="wb-progress-name">{project.name}</span>
        <ThinProgress percent={project.progress} color={color} />
        <span className="wb-progress-percent">{project.progress}%</span>
        <span className="wb-progress-date">{formatDateOnly(project.dueDate)}</span>
      </div>
    );
  };

  return (
    <div className="wb-page">
      <PageHeader
        title="工作台"
        subtitle="今天要做什么、这周这月推进到哪，一屏看完；点数字进对应页面。"
      />

      <div className="wb-metric-row">
        <MetricCard
          label="我的工作"
          value={activeProjects.length}
          icon={<FolderOutlined />}
          iconColor={designVars.primary}
          hint="在办项目 · 点进年度工作规划"
          onClick={() => void navigate('/projects?view=projects')}
        />
        <MetricCard
          label="今日任务"
          value={ranges.today}
          icon={<CheckOutlined />}
          iconColor={designVars.orange}
          hint="今天到期 · 点进任务列表"
          onClick={() => void navigate('/projects?view=tasks&due=today')}
        />
        <MetricCard
          label="周工作"
          value={ranges.week}
          icon={<ScheduleOutlined />}
          iconColor={designVars.statusDoing}
          hint="本周到期 · 点进周进度"
          onClick={() => void navigate('/projects?view=progress')}
        />
        <MetricCard
          label="月度工作"
          value={ranges.month}
          icon={<CalendarOutlined />}
          iconColor={designVars.purple}
          hint="本月到期 · 点进任务列表"
          onClick={() => void navigate('/projects?view=tasks&due=month')}
        />
        <MetricCard
          label="季度工作"
          value={ranges.quarter}
          icon={<CalendarOutlined />}
          iconColor={designVars.muted}
          hint="本季到期 · 点进任务列表"
          onClick={() => void navigate('/projects?view=tasks&due=quarter')}
        />
        <MetricCard
          label="年度工作"
          value={ranges.year}
          icon={<CalendarOutlined />}
          iconColor={designVars.primary}
          hint="本年到期 · 点进任务列表"
          onClick={() => void navigate('/projects?view=tasks&due=year')}
        />
      </div>

      <div className="wb-grid">
        <div className="wb-grid-left">
          <Panel title="任务状态" flush>
            <div style={{ padding: '4px 18px 16px' }}>
              <StateBlock
                loading={taskCountsQuery.isPending}
                error={taskCountsQuery.isError ? taskCountsQuery.error : undefined}
                onRetry={() => void taskCountsQuery.refetch()}
                isEmpty={taskTotal === 0}
                emptyText="还没有任务"
              >
                <div className="wb-status-chart">
                  <DonutChart
                    segments={[
                      { name: '待处理', value: taskCounts.todo, color: designVars.orange },
                      { name: '进行中', value: taskCounts.doing, color: designVars.statusDoing },
                      { name: '已完成', value: taskCounts.done, color: designVars.statusDone },
                    ]}
                    centerValue={taskTotal}
                    centerLabel="总任务"
                    size={126}
                    thickness={16}
                  />
                  <div className="wb-status-legend">
                    <LegendItem color={designVars.orange} name="待处理" value={taskCounts.todo} />
                    <LegendItem color={designVars.statusDoing} name="进行中" value={taskCounts.doing} />
                    <LegendItem color={designVars.statusDone} name="已完成" value={taskCounts.done} />
                  </div>
                </div>
              </StateBlock>
            </div>
          </Panel>

          <Panel
            title="年度工作规划"
            more="查看全部"
            onMore={() => void navigate('/projects?view=projects')}
            flush
          >
            <div style={{ padding: '0 18px 14px' }}>
              <StateBlock
                loading={projectsQuery.isPending}
                error={projectsQuery.isError ? projectsQuery.error : undefined}
                onRetry={() => void projectsQuery.refetch()}
                isEmpty={projects.length === 0}
                emptyText="还没有项目"
                emptyAction={
                  <Button type="primary" onClick={() => void navigate('/projects?view=projects')}>
                    去新建
                  </Button>
                }
              >
                <div className="wb-progress-list">
                  {projects.slice(0, 5).map((project, index) => renderProjectRow(project, index))}
                </div>
              </StateBlock>
            </div>
          </Panel>
        </div>

        <div className="wb-grid-right">
          <Panel title="随记" more="去记录" onMore={() => void navigate('/workspace')} flush>
            <div style={{ padding: '0 18px 12px' }}>
              <StateBlock
                loading={ideasQuery.isPending}
                error={ideasQuery.isError ? ideasQuery.error : undefined}
                onRetry={() => void ideasQuery.refetch()}
                isEmpty={ideas.length === 0}
                emptyText="还没有随记"
                emptyHint="想到什么先记下来，回头再整理"
              >
                <ul className="wb-idea-list">
                  {ideas.map((idea) => (
                    <li key={idea.id} className="wb-idea-item">
                      <span className="wb-idea-text">{idea.content}</span>
                      <span className="wb-idea-time">{formatDateOnly(idea.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </StateBlock>
            </div>
          </Panel>

          <Panel title="团队成员" more="查看全部" onMore={() => void navigate('/team')} flush>
            <div style={{ padding: '0 18px 14px' }}>
              <StateBlock
                loading={workloadQuery.isPending}
                error={workloadQuery.isError ? workloadQuery.error : undefined}
                onRetry={() => void workloadQuery.refetch()}
                isEmpty={workload.length === 0}
                emptyText="还没有成员数据"
              >
                <ul className="wb-member-list">
                  {workload.map((member) => (
                    <li key={member.userId} className="wb-member-row">
                      <Avatar
                        size={28}
                        style={{ background: '#dbe4f5', color: '#2563eb', fontSize: 12 }}
                      >
                        {member.name.slice(0, 1)}
                      </Avatar>
                      <span className="wb-member-name">{member.name}</span>
                      <span className="wb-member-meta">
                        在办 {member.taskCount - member.doneCount} · 完成 {member.rate}%
                      </span>
                    </li>
                  ))}
                </ul>
              </StateBlock>
            </div>
          </Panel>
        </div>

        <div className="wb-grid-full">
          <div className="wb-dashboard-heading">数据看板</div>
          <AnalyticsPage embedded />
        </div>
      </div>
    </div>
  );
}
