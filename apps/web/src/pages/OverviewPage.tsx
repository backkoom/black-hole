import { useMemo, useState } from 'react';
import { Avatar, Button } from 'antd';
import {
  CalendarOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloudUploadOutlined,
  FolderOutlined,
  PlusOutlined,
  ScheduleOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Task } from '@blackhole/shared/types';
import { listIdeas } from '../api/ideas';
import { listTasks, updateTaskStatus } from '../api/tasks';
import { listMeetings } from '../api/schedule';
import { useUserProjects } from '../hooks/useUserData';
import { useTaskCounts } from '../hooks/useTaskCounts';
import { useStatsTeamWorkload } from '../hooks/useUserStats';
import { invalidateUserData } from '../hooks/useInvalidate';
import { useAuth } from '../auth/AuthContext';
import { formatDateOnly, formatTimeOnly, todayShanghaiDate } from '../utils/datetime';
import { designVars } from '../styles/theme';
import { LegendItem, MetricCard, Panel, STATUS_TONE, ToneTag } from '../components/ui';
import { DonutChart } from '../components/ui/charts';
import { PageHeader } from '../components/PageHeader';
import { StateBlock } from '../components/user/StateBlock';
import { ThinProgress } from '../components/user/ThinProgress';
import { projectColor, projectIcon } from '../components/user/visuals';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import { AnalyticsPage } from './AnalyticsPage';

/**
 * 工作台（D-24 成型，D-26 按 B 端工作台方法论补内容）。
 *
 * 设计依据（`docs/contracts/decisions.md` D-26 记了取舍）：
 * - **重要功能突出**：顶部快捷操作条，新建任务/上传文件/记随记/排日程一步到位，
 *   不用先想"这事在哪个模块"；
 * - **操作流程顺畅**：今日待办能在本页直接勾选完成，不用跳任务清单再改状态；
 * - **信息结构清晰**：左列是"今天做什么"（待办→状态→年度规划），右列是"今天还有什么"
 *   （日程→团队→随记），六张时间卡只负责下钻；
 * - **信息密度适中**：每个面板都给"更多"出口，页面只放摘要不放明细表。
 *
 * 布局：
 *   ① 快捷操作条（4 个动作）
 *   ② 六张指标卡：我的工作 / 今日 / 周 / 月 / 季 / 年 —— 整张卡可点，点数字下钻
 *   ③ 左：今日待办（可勾选）/ 任务状态（环图 + 要注意）/ 年度工作规划
 *      右：今日日程 / 团队成员 / 随记
 *   ④ 通栏：数据看板（内嵌 AnalyticsPage，embedded 模式去掉页头与指标卡）
 *
 * 数据口径（全部真实接口，没有 mock）：
 * - 我的工作：GET /api/projects 里 status=active 的数量
 * - 今日/周/月/季/年/逾期：GET /api/tasks?due=… 的 total（pageSize=1，只取计数）
 * - 今日待办：GET /api/tasks?due=today（pageSize=6），勾选走 PATCH /api/tasks/{id}/status
 * - 今日日程：GET /api/schedule/meetings?from&to（东八区当天 00:00–23:59）
 * - 任务状态：GET /api/stats/tasks 的 todo / doing / done
 * - 随记：GET /api/ideas 最近 5 条；团队成员：GET /api/stats/team-workload
 */
export function OverviewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [taskModalOpen, setTaskModalOpen] = useState(false);

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
   * 时间区间的任务数 + 逾期数 —— 每档只取 total。
   * 区间口径在东八区服务端算（自然周/月/季/年），前端自己按 Date 算容易和统计页对不上。
   */
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
  const ranges = rangeQuery.data ?? {
    today: 0,
    week: 0,
    month: 0,
    quarter: 0,
    year: 0,
    overdue: 0,
  };

  /** 今日待办：本页可直接勾完成，所以要多取字段（项目名 / 优先级 / 状态） */
  const todayQuery = useQuery({
    queryKey: ['workbench', 'today-tasks'],
    queryFn: () => listTasks({ page: 1, pageSize: 6, due: 'today' }),
    staleTime: 15_000,
  });
  const todayTasks = todayQuery.data?.items ?? [];

  /** 今日日程：会议按东八区当天区间取，日历页口径一致 */
  const today = todayShanghaiDate();
  const meetingsQuery = useQuery({
    queryKey: ['workbench', 'meetings', today],
    queryFn: () =>
      listMeetings({ from: `${today}T00:00:00+08:00`, to: `${today}T23:59:59+08:00` }),
    staleTime: 60_000,
  });
  const meetings = meetingsQuery.data ?? [];

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

  const statusMutation = useMutation({
    mutationFn: (input: { id: number; status: Task['status'] }) =>
      updateTaskStatus(input.id, input.status),
    onSuccess: async () => {
      await invalidateUserData(queryClient);
      // 工作台自己的几个查询不在 invalidateUserData 的清单里，单独刷
      await queryClient.invalidateQueries({ queryKey: ['workbench'] });
    },
  });

  /** 项目进度行（年度工作规划） */
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

  const quickActions = [
    {
      key: 'task',
      icon: <PlusOutlined />,
      label: '新建任务',
      desc: '记一条待办，指定到期日',
      color: designVars.primary,
      tone: '#eef3ff',
      onClick: () => setTaskModalOpen(true),
    },
    {
      key: 'file',
      icon: <CloudUploadOutlined />,
      label: '上传文件',
      desc: '传到项目文件库',
      color: designVars.green,
      tone: '#e9f9f1',
      onClick: () => void navigate('/files'),
    },
    {
      key: 'idea',
      icon: <TagsOutlined />,
      label: '记一条随记',
      desc: '想到什么先记下来',
      color: designVars.orange,
      tone: '#fff4e5',
      onClick: () => void navigate('/workspace'),
    },
    {
      key: 'meeting',
      icon: <ScheduleOutlined />,
      label: '排日程',
      desc: '约会议、定里程碑',
      color: designVars.purple,
      tone: '#f3ecff',
      onClick: () => void navigate('/calendar'),
    },
  ];

  return (
    <div className="wb-page">
      <PageHeader
        title="工作台"
        subtitle="今天做什么、这周这月推进到哪，一屏看完；常用操作就在手边，点数字进对应页面。"
      />

      {/* 快捷入口：按大厂案例做成"图标 + 标题 + 一句描述"的入口卡，不是一排小按钮 */}
      <div className="wb-quick-row">
        {quickActions.map((action) => (
          <button
            key={action.key}
            type="button"
            className="wb-quick-card"
            onClick={action.onClick}
          >
            <span className="wb-quick-icon" style={{ background: action.tone, color: action.color }}>
              {action.icon}
            </span>
            <span className="wb-quick-text">
              <span className="wb-quick-title">{action.label}</span>
              <span className="wb-quick-desc">{action.desc}</span>
            </span>
          </button>
        ))}
      </div>

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
          <Panel
            title="今日待办"
            more="全部任务"
            onMore={() => void navigate('/projects?view=tasks&due=today')}
            flush
          >
            <div style={{ padding: '0 18px 14px' }}>
              <StateBlock
                loading={todayQuery.isPending}
                error={todayQuery.isError ? todayQuery.error : undefined}
                onRetry={() => void todayQuery.refetch()}
                isEmpty={todayTasks.length === 0}
                emptyText="今天没有到期的任务"
                emptyHint="想加一条就点上面的「新建任务」，到期日填今天"
              >
                <ul className="wb-todo-list">
                  {todayTasks.map((task) => {
                    const done = task.status === 'done';
                    return (
                      <li key={task.id} className={`wb-todo-item${done ? ' is-done' : ''}`}>
                        <button
                          type="button"
                          className="wb-todo-check"
                          aria-label={done ? '标记为未完成' : '标记为已完成'}
                          onClick={() =>
                            statusMutation.mutate({ id: task.id, status: done ? 'todo' : 'done' })
                          }
                        >
                          {done ? <CheckOutlined /> : null}
                        </button>
                        <span className="wb-todo-main">
                          <span className="wb-todo-title" title={task.title}>
                            {task.title}
                          </span>
                          <span className="wb-todo-sub">
                            {task.projectName ?? '未挂项目'}
                            {task.category ? ` · ${task.category}` : ''}
                          </span>
                        </span>
                        <ToneTag tone={STATUS_TONE[task.priority] ?? 'gray'}>
                          {task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低'}
                        </ToneTag>
                        <ToneTag tone={STATUS_TONE[task.status] ?? 'gray'}>
                          {task.status === 'todo' ? '待处理' : task.status === 'doing' ? '进行中' : '已完成'}
                        </ToneTag>
                      </li>
                    );
                  })}
                </ul>
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
                  {/* 右侧留白原来空着，改成"要注意的"两个数：逾期 / 今日到期，点了直接进列表 */}
                  <div className="wb-status-side">
                    <div className="wb-status-side-title">要注意</div>
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
          <Panel
            title="今日日程"
            more="去日历"
            onMore={() => void navigate('/calendar')}
            flush
          >
            <div style={{ padding: '0 18px 14px' }}>
              <StateBlock
                loading={meetingsQuery.isPending}
                error={meetingsQuery.isError ? meetingsQuery.error : undefined}
                onRetry={() => void meetingsQuery.refetch()}
                isEmpty={meetings.length === 0}
                emptyText="今天没有会议"
                emptyHint="去日程安排里排一场"
              >
                <ul className="wb-agenda-list">
                  {meetings.map((meeting) => (
                    <li key={meeting.id} className="wb-agenda-item">
                      <span className="wb-agenda-time">
                        <ClockCircleOutlined /> {formatTimeOnly(meeting.startAt)}
                      </span>
                      <span className="wb-agenda-title" title={meeting.title}>
                        {meeting.title}
                      </span>
                      <span className="wb-agenda-meta" title={meeting.location ?? ''}>
                        {meeting.location ?? '—'}
                      </span>
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
        </div>

        <div className="wb-grid-full">
          <div className="wb-dashboard-heading">数据看板</div>
          <AnalyticsPage embedded />
        </div>
      </div>

      <TaskFormModal
        open={taskModalOpen}
        mode="create"
        projects={projects}
        ownerUserId={user?.id}
        onClose={() => {
          setTaskModalOpen(false);
          // 弹窗自己只刷了 tasks / projects，工作台的计数与今日待办是独立 query，跟着刷一下
          void queryClient.invalidateQueries({ queryKey: ['workbench'] });
        }}
      />
    </div>
  );
}
