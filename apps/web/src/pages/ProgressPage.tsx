import { useMemo, useState, type ReactNode } from 'react';
import type { Dayjs } from 'dayjs';
import {
  CheckCircleOutlined,
  FlagOutlined,
  FundProjectionScreenOutlined,
  ScheduleOutlined,
} from '@ant-design/icons';
import { App as AntdApp, Select } from 'antd';
import type { Project, Task } from '@blackhole/shared/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateProject } from '../api/projects';
import { errorText } from '../api/messages';
import { invalidateUserData } from '../hooks/useInvalidate';
import { useAllTasks } from '../hooks/useAllTasks';
import { useUserProjects } from '../hooks/useUserData';
import { useStatsTaskCounts } from '../hooks/useUserStats';
import { parseDateOnly, todayShanghaiDate } from '../utils/datetime';
import { designVars } from '../styles/theme';
import { LegendItem, MetricCard, Panel, ToneTag, type TagTone } from '../components/ui';
import { LineChart, ProgressRing } from '../components/ui/charts';
import { PageHeader } from '../components/PageHeader';
import { StateBlock } from '../components/user/StateBlock';
import { ThinProgress } from '../components/user/ThinProgress';
import { GanttChart, type GanttGroupBy } from '../components/gantt';
import { useMilestones } from '../components/gantt/useMilestones';
import '../styles/charts.css';
import '../styles/progress.css';

/**
 * 进度追踪页（老六最终用户端界面 · 图5）。
 *
 * 组件树：
 * ProgressPage
 * ├─ PageHeader(「进度追踪」+ 副标题)
 * ├─ .wb-metric-row（4 张指标卡）
 * ├─ .wb-grid-left：项目进度计划（左侧宽 · **真甘特图**）
 * ├─ .wb-grid-right：项目健康度（右上）
 * ├─ .wb-grid-full：阶段进度（通栏）
 * └─ .wb-grid-left：进度偏差分析（左下）
 *
 * 数据口径（全部来自真实接口，没有 mock）：
 * - 项目与进度：GET /api/projects（progress / phase / dueDate 由服务端实时算好）
 * - 里程碑：GET /api/milestones（甘特图上的菱形标记）
 * - 任务状态计数：GET /api/stats/tasks（todo / doing / done）
 * - 计划进度：项目「已过天数 / 总天数 × 100」的线性推算（封顶 100%）后取平均
 * - 实际进度：按任务完成时间（doneAt）回溯的项目平均完成率，末点即当前项目平均进度
 * - 成本控制 / 资源使用 / 风险状态：**接口没有这三个数据源 → 一律显示「暂无数据」**
 *
 * 甘特图（components/gantt/）是**项目级**的：只画项目时间条 + 里程碑 + 今天线，
 * 不画任务级甘特（没有依赖箭头 / 任务条的数据源）。
 */

/** 进度分档：≥80 良好，≥50 正常，其余预警 */
function gradeProgress(percent: number): { label: string; tone: TagTone } {
  if (percent >= 80) return { label: '良好', tone: 'green' };
  if (percent >= 50) return { label: '正常', tone: 'blue' };
  return { label: '预警', tone: 'orange' };
}

/** 里程碑达成 = 全部完成（status=done）的项目数 / 项目总数 */
function milestoneRate(projects: Project[]): { done: number; total: number; percent: number } {
  const total = projects.length;
  const done = projects.filter((project) => project.status === 'done').length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/**
 * 进度偏差序列 —— 计划进度 vs 实际进度。
 *
 * - 计划进度：每个项目「已过天数 / 总天数 × 100」（封顶 100%），再对可排期的项目取平均；
 * - 实际进度：按任务的完成时间（doneAt）回溯的完成率，分母用服务端给的 totalItems，
 *   末点（今天）即当前项目平均进度。
 *
 * 只统计「有创建日 + 有截止日 + 跨度为正」的项目 —— 其余项目无法做线性计划。
 */
function buildDeviation(
  projects: Project[],
  tasks: Task[],
): { label: string; planned: number; actual: number }[] {
  const plannable = projects.filter((project) => {
    const created = parseDateOnly(project.createdAt);
    const due = parseDateOnly(project.dueDate);
    return created !== null && due !== null && due.diff(created, 'day') > 0;
  });
  if (plannable.length === 0) return [];

  const today = parseDateOnly(todayShanghaiDate());
  if (today === null) return [];

  const createdDays = plannable
    .map((project) => parseDateOnly(project.createdAt))
    .filter((day): day is Dayjs => day !== null);
  const start = createdDays.length > 0 ? createdDays.reduce((a, b) => (a.isBefore(b) ? a : b)) : today;
  const end = today.isAfter(start) ? today : start;

  /** 每个项目已完成任务的完成日列表 */
  const doneDaysByProject = new Map<number, string[]>();
  tasks.forEach((task) => {
    if (task.projectId === null || !task.doneAt) return;
    const doneDay = parseDateOnly(task.doneAt);
    if (doneDay === null) return;
    const list = doneDaysByProject.get(task.projectId) ?? [];
    list.push(doneDay.format('YYYY-MM-DD'));
    doneDaysByProject.set(task.projectId, list);
  });

  const sampleCount = 6;
  const totalDays = end.diff(start, 'day');
  const points: { label: string; planned: number; actual: number }[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    // 采样点均匀铺满 [start, end] —— 最后一点正好是今天（end = today）
    const offset = Math.round((totalDays * index) / (sampleCount - 1));
    const day = start.add(offset, 'day');
    const dayText = day.format('YYYY-MM-DD');

    let plannedSum = 0;
    let actualSum = 0;
    plannable.forEach((project) => {
      const created = parseDateOnly(project.createdAt);
      const due = parseDateOnly(project.dueDate);
      if (created === null || due === null) return;

      const totalDays = due.diff(created, 'day');
      const passedDays = day.diff(created, 'day');
      plannedSum += Math.max(0, Math.min(100, (passedDays / totalDays) * 100));

      // 分母用服务端算好的总任务数（权威），分子用真实完成时间回溯
      const total = project.totalItems;
      const doneDays = doneDaysByProject.get(project.id) ?? [];
      const doneCount = doneDays.filter((text) => text <= dayText).length;
      actualSum += total === 0 ? 0 : Math.min(100, (doneCount / total) * 100);
    });

    points.push({
      label: day.format('MM-DD'),
      planned: Math.round(plannedSum / plannable.length),
      actual: Math.round(actualSum / plannable.length),
    });
  }
  return points;
}

export function ProgressPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const projectsQuery = useUserProjects();
  const tasksQuery = useAllTasks();
  const taskStatsQuery = useStatsTaskCounts();
  const milestonesQuery = useMilestones();

  /** 甘特图分组方式（默认按阶段分组 —— 对齐设计稿图5 的下拉） */
  const [groupBy, setGroupBy] = useState<GanttGroupBy>('phase');

  /**
   * 拖拽改期（D-29）：改动的是 start_date 与 due_date 两个日期，
   * 成功后刷项目/任务/统计缓存 —— 甘特条、健康度、看板都跟着变。
   */
  const rescheduleMutation = useMutation({
    mutationFn: (input: { id: number; startDate: string; dueDate: string }) =>
      updateProject(input.id, { startDate: input.startDate, dueDate: input.dueDate }),
    onSuccess: async (project) => {
      await invalidateUserData(queryClient);
      void message.success(`「${project.name}」已改期`);
    },
    onError: (err) => void message.error(errorText(err)),
  });

  const projects = projectsQuery.data?.items ?? [];
  const tasks = tasksQuery.data ?? [];
  const taskStats = taskStatsQuery.data;
  const milestones = milestonesQuery.data ?? [];

  /** 总体进度 = 所有项目 progress 的平均值 */
  const overallProgress = useMemo(() => {
    if (projects.length === 0) return 0;
    const sum = projects.reduce((acc, project) => acc + project.progress, 0);
    return Math.round(sum / projects.length);
  }, [projects]);

  const milestone = useMemo(() => milestoneRate(projects), [projects]);

  /** 阶段分组（没有阶段的项目归到「未设置阶段」，不编造阶段名） */
  const phaseGroups = useMemo(() => {
    const groups = new Map<string, Project[]>();
    projects.forEach((project) => {
      const key = project.phase?.trim() || '未设置阶段';
      const list = groups.get(key) ?? [];
      list.push(project);
      groups.set(key, list);
    });
    return [...groups.entries()].map(([phase, list]) => {
      const sum = list.reduce((acc, project) => acc + project.progress, 0);
      const average = list.length === 0 ? 0 : Math.round(sum / list.length);
      return { phase, count: list.length, average };
    });
  }, [projects]);

  /** 进度偏差序列 */
  const deviation = useMemo(() => buildDeviation(projects, tasks), [projects, tasks]);

  const deviationSeries = useMemo(
    () => [
      {
        name: '计划进度',
        color: designVars.primary,
        points: deviation.map((point) => ({ label: point.label, value: point.planned })),
      },
      {
        name: '实际进度',
        color: designVars.green,
        points: deviation.map((point) => ({ label: point.label, value: point.actual })),
      },
    ],
    [deviation],
  );

  const healthGrade = gradeProgress(overallProgress);

  return (
    <div className="wb-page">
      <PageHeader title="周工作完成进度" subtitle="按周看项目推进与任务完成情况，及时调整工作方向" />

      <div className="wb-grid">
        {/* 4 张指标卡 */}
        <div className="wb-metric-row">
          <MetricCard
            label="项目总体进度"
            value={`${overallProgress}%`}
            icon={<FundProjectionScreenOutlined />}
            iconColor={designVars.primary}
            hint={`共 ${projects.length} 个项目`}
          />
          <MetricCard
            label="已完成任务"
            value={taskStats?.done ?? 0}
            icon={<CheckCircleOutlined />}
            iconColor={designVars.green}
            hint="状态为已完成"
          />
          <MetricCard
            label="进行中任务"
            value={taskStats?.doing ?? 0}
            icon={<ScheduleOutlined />}
            iconColor={designVars.orange}
            hint="状态为进行中"
          />
          <MetricCard
            label="里程碑达成"
            value={`${milestone.done}/${milestone.total}`}
            icon={<FlagOutlined />}
            iconColor={designVars.purple}
            hint={`达成率 ${milestone.percent}%`}
          />
        </div>

        {/* 左：项目进度计划（左侧宽 · 真甘特图） */}
        <div className="wb-grid-left">
          <Panel
            title="项目进度计划"
            extra={
              <Select
                size="small"
                value={groupBy}
                onChange={(value: GanttGroupBy) => setGroupBy(value)}
                options={[
                  { value: 'phase', label: '按阶段分组' },
                  { value: 'none', label: '不分组' },
                ]}
                style={{ width: 116 }}
              />
            }
            flush
          >
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={projectsQuery.isPending || milestonesQuery.isPending}
                error={
                  projectsQuery.isError
                    ? projectsQuery.error
                    : milestonesQuery.isError
                      ? milestonesQuery.error
                      : undefined
                }
                onRetry={() => {
                  void projectsQuery.refetch();
                  void milestonesQuery.refetch();
                }}
                isEmpty={projects.length === 0}
                emptyText="还没有项目"
              >
                <GanttChart
                  projects={projects}
                  milestones={milestones}
                  groupBy={groupBy}
                  canEdit={!rescheduleMutation.isPending}
                  onReschedule={(id, next) =>
                    rescheduleMutation.mutate({ id, startDate: next.startDate, dueDate: next.dueDate })
                  }
                />
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 右：项目健康度（右上） */}
        <div className="wb-grid-right">
          <Panel title="项目健康度" flush>
            <div style={{ padding: '4px 18px 16px' }}>
              <StateBlock
                loading={projectsQuery.isPending}
                error={projectsQuery.isError ? projectsQuery.error : undefined}
                onRetry={() => void projectsQuery.refetch()}
                isEmpty={projects.length === 0}
                emptyText="还没有项目"
              >
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
                  <ProgressRing
                    value={overallProgress}
                    size={132}
                    thickness={16}
                    color={designVars.primary}
                    label="平均进度"
                  />
                </div>

                <HealthRow label="进度状态">
                  <ToneTag tone={healthGrade.tone}>{healthGrade.label}</ToneTag>
                </HealthRow>
                <HealthRow label="成本控制">
                  <span className="wb-muted">暂无数据</span>
                </HealthRow>
                <HealthRow label="资源使用">
                  <span className="wb-muted">暂无数据</span>
                </HealthRow>
                <HealthRow label="风险状态">
                  <span className="wb-muted">暂无数据</span>
                </HealthRow>
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 通栏：阶段进度 */}
        <div className="wb-grid-full">
          <Panel title="阶段进度" flush>
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={projectsQuery.isPending}
                error={projectsQuery.isError ? projectsQuery.error : undefined}
                onRetry={() => void projectsQuery.refetch()}
                isEmpty={phaseGroups.length === 0}
                emptyText="还没有项目"
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                    gap: 12,
                  }}
                >
                  {phaseGroups.map((group) => {
                    const grade = gradeProgress(group.average);
                    return (
                      <div
                        key={group.phase}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          padding: '12px 14px',
                          border: '1px solid #e6eaf2',
                          borderRadius: 10,
                          background: designVars.card,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              color: designVars.text,
                              fontSize: 13.5,
                              fontWeight: 600,
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={group.phase}
                          >
                            {group.phase}
                          </span>
                          <ToneTag tone={grade.tone}>{grade.label}</ToneTag>
                        </div>
                        <span style={{ fontSize: 12, color: designVars.muted }}>
                          {group.count} 个项目
                        </span>
                        <ThinProgress percent={group.average} />
                        <span style={{ fontSize: 12, color: designVars.text2 }}>
                          平均进度 {group.average}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 左下：进度偏差分析 */}
        <div className="wb-grid-left">
          <Panel title="进度偏差分析" flush>
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={projectsQuery.isPending || tasksQuery.isPending}
                error={
                  projectsQuery.isError
                    ? projectsQuery.error
                    : tasksQuery.isError
                      ? tasksQuery.error
                      : undefined
                }
                onRetry={() => {
                  void projectsQuery.refetch();
                  void tasksQuery.refetch();
                }}
                isEmpty={deviation.length === 0}
                emptyText="没有可用于偏差分析的项目（需要创建日与截止日）"
              >
                <div className="wb-chart">
                  <LineChart series={deviationSeries} height={200} />
                </div>
                <div style={{ display: 'flex', gap: 18, marginTop: 6 }}>
                  <LegendItem color={designVars.primary} name="计划进度" />
                  <LegendItem color={designVars.green} name="实际进度" />
                </div>
                <div style={{ marginTop: 8, fontSize: 11.5, color: designVars.muted, lineHeight: 1.7 }}>
                  计划进度 = 可排期项目「已过天数 / 总天数 × 100」的线性推算（封顶 100%）后取平均；
                  实际进度 = 按任务完成时间（doneAt）回溯的完成率后取平均，末点即这些项目的当前平均完成率。
                </div>
              </StateBlock>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** 健康度面板里的一行「标签 + 状态」 */
function HealthRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '9px 0',
        borderTop: '1px solid #f2f5f9',
      }}
    >
      <span style={{ fontSize: 13, color: designVars.text2 }}>{label}</span>
      <span style={{ fontSize: 13 }}>{children}</span>
    </div>
  );
}
