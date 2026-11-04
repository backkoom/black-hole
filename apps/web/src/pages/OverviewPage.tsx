import { useMemo } from 'react';
import { App as AntdApp, Button, Dropdown } from 'antd';
import {
  CheckOutlined,
  FolderOutlined,
  MoreOutlined,
  PlusOutlined,
  ScheduleOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Project, Task } from '@workbench/shared/types';
import { updateTaskStatus } from '../api/tasks';
import { errorText } from '../api/messages';
import { useAssigneeOptions, useUserProjects, useUserTasks } from '../hooks/useUserData';
import { useAuth } from '../auth/AuthContext';
import { useTaskCounts, useTodayTasks } from '../hooks/useTaskCounts';
import { invalidateUserData } from '../hooks/useInvalidate';
import { formatDateOnly, formatDateTime, todayShanghaiDate } from '../utils/datetime';
import {
  dailyDateSeries,
  dailyDoneSeries,
  dailyOpenSeries,
  seriesDelta,
  seriesSum,
} from '../utils/trend';
import { designVars } from '../styles/theme';
import { LegendItem, MetricCard, Panel, STATUS_TONE, ToneTag } from '../components/ui';
import { DonutChart } from '../components/ui/charts';
import { PageHeader } from '../components/PageHeader';
import { StateBlock } from '../components/user/StateBlock';
import { ThinProgress } from '../components/user/ThinProgress';
import { projectColor, projectIcon } from '../components/user/visuals';

/**
 * 项目总览页（老六最终用户端界面 · 图1）。
 *
 * 组件树：
 * OverviewPage
 * ├─ PageHeader(「项目总览」+ 副标题 + 右侧日期/日历按钮)
 * └─ .wb-grid（12 列栅格，间距 18px）
 *    ├─ .wb-metric-row（4 张指标卡）
 *    ├─ .wb-grid-left（约 2/3）
 *    │  ├─ Panel「项目进度」：图标 + 名称 + 细进度条 + 百分比 + 日期
 *    │  └─ Panel「今日任务」：勾选圈 + 名称 + 优先级标签 + 时间
 *    ├─ .wb-grid-right（约 1/3）
 *    │  ├─ Panel「日程安排」：日期 + 时间轴（时间 / 彩点 / 标题 / 副标题）
 *    │  └─ Panel「任务状态」：环形图 + 图例
 *    └─ .wb-grid-full（通栏）
 *       └─ Panel「项目列表」：4 张项目卡片（图标 / 进度条 / 成员数 / ⋯）
 *
 * 数据口径（全部来自真实接口，没有 mock）：
 * - 项目进度、项目列表：GET /api/projects（progress 由服务端实时算）
 * - 今日任务、日程安排：GET /api/tasks 中 due_date = 今天（Asia/Shanghai）的任务
 * - 任务状态、待办任务：GET /api/stats/tasks 的 todo / doing / done
 * - 团队成员：GET /api/users 的账号数；普通用户没有该接口权限时，
 *   退化为「项目成员 + 任务负责人」的去重人数（同样是真实数据）
 * - 涨跌与折线趋势：由真实任务的 createdAt / doneAt 聚合（近 7 天），不编造
 */

const PRIORITY_LABEL: Record<Task['priority'], string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export function OverviewPage() {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const projectsQuery = useUserProjects();
  const tasksQuery = useUserTasks();
  const { counts: taskCounts, query: taskCountsQuery } = useTaskCounts();
  const todayTasksQuery = useTodayTasks();
  const assigneesQuery = useAssigneeOptions(user);

  const projects = projectsQuery.data?.items ?? [];
  const tasks = tasksQuery.data?.items ?? [];
  const today = todayShanghaiDate();

  /** 今日任务：用服务端的 due=today 筛选（Asia/Shanghai） */
  const todayTasks = todayTasksQuery.data ?? [];

  /** 进行中的项目 = status 为 active（服务端按任务完成情况实时算） */
  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === 'active'),
    [projects],
  );

  /** 团队成员：管理员有账号列表；普通用户退化为项目成员 + 任务负责人去重 */
  const teamMemberNames = useMemo(() => {
    const names = new Set<string>();
    projects.forEach((project) => project.members.forEach((name) => names.add(name)));
    tasks.forEach((task) => {
      if (task.assigneeName) names.add(task.assigneeName);
    });
    return names;
  }, [projects, tasks]);

  const teamSize = assigneesQuery.data?.length ?? teamMemberNames.size;

  /** 指标卡的涨跌与趋势 —— 由真实数据聚合，不编造 */
  const projectCreatedSeries = useMemo(
    () => dailyDateSeries(projects.map((project) => project.createdAt)),
    [projects],
  );
  const openSeries = useMemo(() => dailyOpenSeries(tasks), [tasks]);
  const doneSeries = useMemo(() => dailyDoneSeries(tasks), [tasks]);

  const projectTrend = seriesDelta(projectCreatedSeries);
  const openTrend = seriesDelta(openSeries);
  const doneThisWeek = seriesSum(doneSeries);

  const toggleStatus = useMutation({
    mutationFn: (input: { id: number; status: Task['status'] }) =>
      updateTaskStatus(input.id, input.status),
    onSuccess: async () => {
      await invalidateUserData(queryClient);
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  const taskTotal = taskCounts.total;

  /** 日程：今天的任务按提醒时间排成时间轴（没有提醒时间的排在后面） */
  const agendaItems = useMemo(
    () =>
      [...todayTasks]
        .sort((a, b) => {
          const at = a.reminderAt ?? '';
          const bt = b.reminderAt ?? '';
          if (at === bt) return 0;
          if (!at) return 1;
          if (!bt) return -1;
          return at < bt ? -1 : 1;
        })
        .slice(0, 5),
    [todayTasks],
  );

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
      <PageHeader title="项目总览" subtitle="一眼看完项目进展、今日待办与团队状态。" />

      <div className="wb-grid">
        {/* 4 张指标卡 */}
        <div className="wb-metric-row">
          <MetricCard
            label="项目总数"
            value={projectsQuery.data?.total ?? 0}
            icon={<FolderOutlined />}
            iconColor={designVars.primary}
            delta={projectTrend}
            trend={projectCreatedSeries}
            hint={`进行中 ${activeProjects.length} 个`}
          />
          <MetricCard
            label="进行中"
            value={activeProjects.length}
            icon={<ScheduleOutlined />}
            iconColor={designVars.green}
            hint="尚未完成的项目"
          />
          <MetricCard
            label="待办任务"
            value={taskCounts.todo}
            icon={<CheckOutlined />}
            iconColor={designVars.orange}
            delta={openTrend}
            trend={openSeries}
            hint="近 7 天完成"
          />
          <MetricCard
            label="团队成员"
            value={teamSize}
            icon={<TeamOutlined />}
            iconColor={designVars.purple}
            hint={`近 7 天完成 ${doneThisWeek} 项任务`}
          />
        </div>

        {/* 左列：项目进度 + 今日任务 */}
        <div className="wb-grid-left">
          <Panel title="项目进度" more="全部项目" onMore={() => void navigate('/projects')} flush>
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={projectsQuery.isPending}
                error={projectsQuery.isError ? projectsQuery.error : undefined}
                onRetry={() => void projectsQuery.refetch()}
                isEmpty={projects.length === 0}
                emptyText="还没有项目"
                emptyAction={
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => void navigate('/projects')}
                  >
                    新建项目
                  </Button>
                }
              >
                {projects.slice(0, 5).map(renderProjectRow)}
              </StateBlock>
            </div>
          </Panel>

          <Panel
            title="今日任务"
            extra={<span className="wb-muted">{todayTasks.length} 项</span>}
            flush
          >
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={todayTasksQuery.isPending}
                error={todayTasksQuery.isError ? todayTasksQuery.error : undefined}
                onRetry={() => void todayTasksQuery.refetch()}
                isEmpty={todayTasks.length === 0}
                emptyText="今天没有待办任务"
              >
                {todayTasks.slice(0, 6).map((task) => (
                  <div className="wb-today-row" key={task.id}>
                    <button
                      type="button"
                      className={`wb-today-check${task.status === 'done' ? ' is-done' : ''}`}
                      aria-label={
                        task.status === 'done' ? `取消完成 ${task.title}` : `标记完成 ${task.title}`
                      }
                      onClick={() =>
                        toggleStatus.mutate({
                          id: task.id,
                          status: task.status === 'done' ? 'todo' : 'done',
                        })
                      }
                    >
                      {task.status === 'done' ? <CheckOutlined style={{ fontSize: 11 }} /> : null}
                    </button>
                    <span className={`wb-today-name${task.status === 'done' ? ' is-done' : ''}`}>
                      {task.title}
                    </span>
                    <ToneTag tone={STATUS_TONE[task.priority] ?? 'gray'}>
                      {PRIORITY_LABEL[task.priority]}
                    </ToneTag>
                    <span className="wb-today-time">{formatDateTime(task.reminderAt)}</span>
                  </div>
                ))}
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 右列：日程安排 + 任务状态 */}
        <div className="wb-grid-right">
          <Panel
            title="日程安排"
            extra={
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => void navigate('/calendar')}
              >
                新建
              </Button>
            }
            flush
          >
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={todayTasksQuery.isPending}
                error={todayTasksQuery.isError ? todayTasksQuery.error : undefined}
                onRetry={() => void todayTasksQuery.refetch()}
                isEmpty={agendaItems.length === 0}
                emptyText="今天没有日程"
              >
                <div className="wb-agenda-date">{formatDateOnly(today)}</div>
                {agendaItems.map((task) => {
                  const color =
                    task.priority === 'high'
                      ? designVars.red
                      : task.priority === 'medium'
                        ? designVars.orange
                        : designVars.primary;
                  return (
                    <div className="wb-agenda-item" key={task.id}>
                      <span className="wb-agenda-time">
                        {task.reminderAt ? formatDateTime(task.reminderAt).slice(11) : '全天'}
                      </span>
                      <span className="wb-agenda-dot" style={{ background: color }} />
                      <span style={{ minWidth: 0 }}>
                        <span className="wb-agenda-title">{task.title}</span>
                        <span className="wb-agenda-sub">
                          {task.projectName ?? '未归属项目'}
                          {task.assigneeName ? ` · ${task.assigneeName}` : ''}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </StateBlock>
            </div>
          </Panel>

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
                      { name: '进行中', value: taskCounts.doing, color: designVars.primary },
                      { name: '已完成', value: taskCounts.done, color: designVars.green },
                    ]}
                    centerValue={taskTotal}
                    centerLabel="总任务"
                    size={126}
                    thickness={16}
                  />
                  <div className="wb-status-legend">
                    <LegendItem color={designVars.orange} name="待处理" value={taskCounts.todo} />
                    <LegendItem color={designVars.primary} name="进行中" value={taskCounts.doing} />
                    <LegendItem color={designVars.green} name="已完成" value={taskCounts.done} />
                  </div>
                </div>
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 底部通栏：项目列表 */}
        <div className="wb-grid-full">
          <Panel
            title="项目列表"
            extra={
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => void navigate('/projects')}
              >
                新建项目
              </Button>
            }
            flush
          >
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={projectsQuery.isPending}
                error={projectsQuery.isError ? projectsQuery.error : undefined}
                onRetry={() => void projectsQuery.refetch()}
                isEmpty={projects.length === 0}
                emptyText="还没有项目"
                emptyAction={
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => void navigate('/projects')}
                  >
                    新建项目
                  </Button>
                }
              >
                <div className="wb-project-cards">
                  {projects.slice(0, 4).map((project, index) => {
                    const color = projectColor(project.color, index);
                    return (
                      <div className="wb-project-card" key={project.id}>
                        <div className="wb-project-card-head">
                          <span className="wb-swatch" style={{ background: color }}>
                            {projectIcon(project.icon)}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span className="wb-project-card-title">{project.name}</span>
                            <span className="wb-project-card-sub">
                              {project.owner ?? '未指定负责人'}
                              {project.phase ? ` · ${project.phase}` : ''}
                            </span>
                          </span>
                          <Dropdown
                            trigger={['click']}
                            menu={{
                              items: [
                                { key: 'detail', label: '查看详情' },
                                { key: 'tasks', label: '查看任务' },
                              ],
                              onClick: ({ key }) => {
                                if (key === 'detail') void navigate(`/projects/${project.id}`);
                                else void navigate('/tasks');
                              },
                            }}
                          >
                            <Button
                              type="text"
                              size="small"
                              icon={<MoreOutlined />}
                              aria-label={`${project.name} 的更多操作`}
                            />
                          </Dropdown>
                        </div>
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span className="wb-project-card-meta">
                              任务 {project.doneItems} / {project.totalItems}
                            </span>
                            <span className="wb-progress-percent">{project.progress}%</span>
                          </div>
                          <div style={{ marginTop: 6 }}>
                            <ThinProgress percent={project.progress} color={color} />
                          </div>
                        </div>
                        <div className="wb-project-card-foot">
                          <span className="wb-project-card-meta">
                            截止 {formatDateOnly(project.dueDate)}
                          </span>
                          <span className="wb-project-card-meta">
                            {project.memberCount > 0 ? `${project.memberCount} 名成员` : '暂无成员'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </StateBlock>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
