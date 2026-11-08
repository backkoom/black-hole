import { useMemo, useRef } from 'react';
import { Avatar, Button, Tag } from 'antd';
import { CalendarOutlined, CheckOutlined, ScheduleOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Risk } from '@blackhole/shared/types';
import { listTasks } from '../api/tasks';
import { listRisks } from '../api/risks';
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
import { QuickAdd } from '../components/workbench/QuickAdd';
import { TodayPanel } from '../components/workbench/TodayPanel';
import { StickyNotes, type StickyNotesHandle } from '../components/workbench/StickyNotes';
import { WorkbenchCharts } from '../components/workbench/WorkbenchCharts';

/**
 * 工作台（D-31 改版，取代 D-24 那版）。
 *
 * 这一版按老六的反馈逐条改，布局从"六格拼图"变成**一条阅读动线**：
 *   ① 快速添加：一个输入框写任务，回车进今日待办（不再是四个没有内容的空入口）
 *   ② 五张时间卡：今日 / 周 / 月 / 季 / 年 —— 删掉与「今日任务」重复的「我的工作」
 *   ③ 今天：待办 + 日程合并（同一件事的两面，之前是两块重复面板）
 *   ④ 任务状态 + 风险预警并排（老六要求"风险预警跟任务状态挨着"）
 *   ⑤ 年度工作规划 + 团队成员
 *   ⑥ 随记便签：真能在本页写、删（不再跳 /workspace 那个自定义工作台）
 *   ⑦ 数据看板：工作进度 / 工作类别 / 工作完成率三块，数字全部实时算
 *
 * 栅格换成 **12 列直接布局**（不再用左右 subgrid）：每行几块自己声明 span，
 * 行内天然等高，省掉"栏里多一块就要同步改 span"的坑。
 */
export function OverviewPage() {
  const navigate = useNavigate();
  const stickyRef = useRef<StickyNotesHandle | null>(null);

  const projectsQuery = useUserProjects();
  const { counts: taskCounts, query: taskCountsQuery } = useTaskCounts();
  const workloadQuery = useStatsTeamWorkload();

  const projects = projectsQuery.data?.items ?? [];
  const workload = (workloadQuery.data?.members ?? []).slice(0, 6);
  const taskTotal = taskCounts.total;

  /** 时间区间计数 + 逾期；区间口径在服务端按东八区算 */
  const rangeQuery = useQuery({
    queryKey: ['workbench', 'ranges'],
    queryFn: async () => {
      const dues = ['today', 'week', 'month', 'quarter', 'year', 'overdue'] as const;
      const results = await Promise.all(dues.map((due) => listTasks({ page: 1, pageSize: 1, due })));
      return {
        today: results[0]?.total ?? 0,
        week: results[1]?.total ?? 0,
        month: results[2]?.total ?? 0,
        quarter: results[3]?.total ?? 0,
        year: results[4]?.total ?? 0,
        overdue: results[5]?.total ?? 0,
      };
    },
    staleTime: 30_000,
  });
  const ranges = rangeQuery.data ?? { today: 0, week: 0, month: 0, quarter: 0, year: 0, overdue: 0 };

  /** 风险预警：只取未关闭的，按等级排 */
  const risksQuery = useQuery({
    queryKey: ['workbench', 'risks'],
    queryFn: () => listRisks({ status: 'open' }),
    staleTime: 60_000,
  });
  const risks = useMemo(() => {
    const list = risksQuery.data ?? [];
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...list].sort((a, b) => (order[a.level] ?? 9) - (order[b.level] ?? 9));
  }, [risksQuery.data]);
  const highRisks = risks.filter((risk) => risk.level === 'high').length;

  const renderProjectRow = (project: (typeof projects)[number], index: number) => {
    const color = projectColor(project.color, index);
    return (
      <div key={project.id} className="wb-progress-row">
        <span className="wb-progress-icon" style={{ background: `${color}1a`, color }}>
          {projectIcon(project.icon)}
        </span>
        <span className="wb-progress-name" title={project.name}>
          {project.name}
        </span>
        <ThinProgress percent={project.progress} color={color} />
        <span className="wb-progress-percent">{project.progress}%</span>
        <span className="wb-progress-date">{formatDateOnly(project.dueDate)}</span>
      </div>
    );
  };

  return (
    <div className="wb-page">
      <PageHeader title="工作台" subtitle="今天做什么、这周推进到哪。写完就回车，别在菜单里找。" />

      <QuickAdd projects={projects} onWriteIdea={() => stickyRef.current?.focus()} />

      <div className="wb-metric-row wb-metric-row-5">
        <MetricCard
          label="今日"
          value={ranges.today}
          icon={<CheckOutlined />}
          iconColor={designVars.orange}
          hint="今天到期"
          onClick={() => void navigate('/projects?view=tasks&due=today')}
        />
        <MetricCard
          label="本周"
          value={ranges.week}
          icon={<ScheduleOutlined />}
          iconColor={designVars.statusDoing}
          hint="本周到期"
          onClick={() => void navigate('/projects?view=tasks&due=week')}
        />
        <MetricCard
          label="本月"
          value={ranges.month}
          icon={<CalendarOutlined />}
          iconColor={designVars.purple}
          hint="本月到期"
          onClick={() => void navigate('/projects?view=tasks&due=month')}
        />
        <MetricCard
          label="本季"
          value={ranges.quarter}
          icon={<CalendarOutlined />}
          iconColor={designVars.muted}
          hint="本季到期"
          onClick={() => void navigate('/projects?view=tasks&due=quarter')}
        />
        <MetricCard
          label="本年"
          value={ranges.year}
          icon={<CalendarOutlined />}
          iconColor={designVars.primary}
          hint="本年到期"
          onClick={() => void navigate('/projects?view=tasks&due=year')}
        />
      </div>

      <div className="wb-hb-grid">
        <div className="wb-hb-12">
          <Panel
            title="今天"
            more="全部任务"
            onMore={() => void navigate('/projects?view=tasks&due=today')}
            flush
          >
            <div style={{ padding: '0 18px 14px' }}>
              <TodayPanel onAddTask={() => void navigate('/projects?view=tasks&due=today')} />
            </div>
          </Panel>
        </div>

        <div className="wb-hb-7">
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
                  <div className="wb-status-side">
                    <button
                      type="button"
                      className="wb-status-side-row"
                      onClick={() => void navigate('/projects?view=tasks&due=overdue')}
                    >
                      <span className="wb-status-side-label">已逾期</span>
                      <span
                        className="wb-status-side-value"
                        style={{ color: ranges.overdue > 0 ? designVars.red : undefined }}
                      >
                        {ranges.overdue}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="wb-status-side-row"
                      onClick={() => void navigate('/projects?view=tasks&due=today')}
                    >
                      <span className="wb-status-side-label">今日到期</span>
                      <span className="wb-status-side-value">{ranges.today}</span>
                    </button>
                  </div>
                </div>
              </StateBlock>
            </div>
          </Panel>
        </div>

        <div className="wb-hb-5">
          <Panel
            title="风险预警"
            more="全部风险"
            onMore={() => void navigate('/projects?view=risks')}
            flush
          >
            <div style={{ padding: '2px 18px 14px' }}>
              <StateBlock
                loading={risksQuery.isPending}
                error={risksQuery.isError ? risksQuery.error : undefined}
                onRetry={() => void risksQuery.refetch()}
                isEmpty={risks.length === 0}
                emptyText="没有未关闭的风险"
                emptyHint="保持住"
              >
                <ul className="wb-risk-list">
                  {risks.slice(0, 4).map((risk: Risk) => (
                    <li key={risk.id} className="wb-risk-item">
                      <Tag
                        color={risk.level === 'high' ? 'red' : risk.level === 'medium' ? 'orange' : 'default'}
                        className="wb-risk-tag"
                      >
                        {risk.level === 'high' ? '高' : risk.level === 'medium' ? '中' : '低'}
                      </Tag>
                      <span className="wb-risk-title" title={risk.title}>
                        {risk.title}
                      </span>
                      <span className="wb-risk-meta">{risk.projectName ?? '—'}</span>
                    </li>
                  ))}
                </ul>
                {highRisks > 0 ? (
                  <div className="wb-risk-foot">
                    <WarningOutlined /> 其中 {highRisks} 条高风险，优先处理
                  </div>
                ) : null}
              </StateBlock>
            </div>
          </Panel>
        </div>

        <div className="wb-hb-7">
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

        <div className="wb-hb-5">
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
                      <Avatar size={26} style={{ background: '#dbe4f5', color: '#2563eb', fontSize: 11 }}>
                        {member.name.slice(0, 1)}
                      </Avatar>
                      <span className="wb-member-name">{member.name}</span>
                      <span className="wb-member-meta">
                        在办 {member.taskCount - member.doneCount} · {member.rate}%
                      </span>
                    </li>
                  ))}
                </ul>
              </StateBlock>
            </div>
          </Panel>
        </div>

        <div className="wb-hb-12">
          <Panel title="随记" more="全部随记" onMore={() => void navigate('/workspace')} flush>
            <div style={{ padding: '4px 18px 16px' }}>
              <StickyNotes ref={stickyRef} limit={8} />
            </div>
          </Panel>
        </div>

        <div className="wb-hb-12">
          <div className="wb-dashboard-heading">数据看板</div>
          <WorkbenchCharts />
        </div>
      </div>
    </div>
  );
}
