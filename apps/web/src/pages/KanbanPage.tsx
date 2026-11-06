import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { App as AntdApp, Button, Dropdown, Input, Tabs, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  CheckCircleOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  FilterOutlined,
  PlusOutlined,
  ScheduleOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { CollisionDetection, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import type { Priority, Project, Task } from '@blackhole/shared/types';
import { createTask, listTasks, updateTaskStatus } from '../api/tasks';
import { fetchTaskStats, statsKeys } from '../api/stats';
import { errorText } from '../api/messages';
import { useAuth } from '../auth/AuthContext';
import { useUserProjects } from '../hooks/useUserData';
import { invalidateUserData } from '../hooks/useInvalidate';
import {
  formatDateOnly,
  formatDateTime,
  recentShanghaiDates,
  toCalendarDate,
  todayShanghaiDate,
} from '../utils/datetime';
import { dailyCreatedSeries, dailyDoneSeries, seriesDelta, seriesSum } from '../utils/trend';
import { designVars } from '../styles/theme';
import { AvatarGroup, LegendItem, MetricCard, Panel, STATUS_TONE, ToneTag } from '../components/ui';
import { DonutChart } from '../components/ui/charts';
import { PageHeader } from '../components/PageHeader';
import { StateBlock } from '../components/user/StateBlock';
import { categoryTone, projectColor } from '../components/user/visuals';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import './KanbanPage.css';

/**
 * 项目看板（老六最终用户端界面 · 稿子图2「项目看板」）。
 *
 * 组件树：
 * KanbanPage
 * ├─ PageHeader（「项目看板」+ 副标题 + 右侧日期）
 * ├─ 4 张指标卡（全部任务 / 进行中 / 待处理 / 已完成）
 * ├─ Panel「任务看板」
 * │  ├─ 工具条：项目 Tabs（全部项目 + 各项目）| 搜索框 | 筛选下拉 | + 新建任务
 * │  └─ 4 列看板：待开始 / 进行中 / 已逾期 / 已完成（卡片可跨列拖拽改状态）
 * └─ 底部两栏（12 列栅格）
 *    ├─ Panel「近期动态」（最近 5 条：任务创建 / 完成）
 *    └─ Panel「任务分布」（环形图 + 图例）
 *
 * 数据口径（全部真实接口，没有 mock）：
 * - 看板任务：GET /api/tasks 一次拉全量（服务端 pageSize 上限 100，按页取满），
 *   前端按状态分列；「已逾期」列是**算出来的**（due_date < 今天 且 status ≠ done），
 *   不新增状态值，也不改后端 —— 它是叠加在状态列之上的虚拟列：
 *   一个逾期未完成的任务同时出现在自己的状态列与「已逾期」列；
 * - 指标卡 / 环形图：GET /api/stats/tasks 的 todo / doing / done（全局口径）；
 * - 项目 Tabs：GET /api/projects（pageSize=100）；
 * - 近期动态：用任务的 createdAt / doneAt 拼，按时间倒序取 5 条；
 * - 搜索与筛选：在已拉到的全量任务上本地过滤（不额外打接口）。
 *
 * 拖拽：@dnd-kit/core。列 = droppable（id = 列 key），卡片 = draggable
 * （id = `card:<列key>:<任务id>`，同一任务可能同时出现在状态列与「已逾期」列）。
 * 拖到「待开始 / 进行中 / 已完成」才 PATCH 状态；
 * 「已逾期」是虚拟列 —— 拖进去不改状态（只提示原因）。
 */

type ColumnKey = 'todo' | 'doing' | 'overdue' | 'done';

interface ColumnDef {
  key: ColumnKey;
  title: string;
  /** 列头圆点颜色 */
  color: string;
}

const COLUMN_DEFS: ColumnDef[] = [
  // 状态语义色（对齐设计稿）：待开始灰 / 进行中绿 / 已逾期红 / 已完成紫
  { key: 'todo', title: '待开始', color: designVars.statusTodo },
  { key: 'doing', title: '进行中', color: designVars.statusDoing },
  { key: 'overdue', title: '已逾期', color: designVars.statusOverdue },
  { key: 'done', title: '已完成', color: designVars.statusDone },
];

const PRIORITY_LABEL: Record<Priority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/** 服务端分页上限（PAGINATION.maxPageSize = 100）—— 看板要全量，按页取满 */
const PAGE_SIZE = 100;

/** 看板一次要全量任务：先取第一页拿到 total，再把剩下的页并发拉完 */
async function listAllTasks(): Promise<Task[]> {
  const first = await listTasks({ page: 1, pageSize: PAGE_SIZE });
  if (first.total <= first.items.length) return first.items;
  const pageCount = Math.ceil(first.total / PAGE_SIZE);
  const rest = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      listTasks({ page: index + 2, pageSize: PAGE_SIZE }),
    ),
  );
  return [...first.items, ...rest.flatMap((page) => page.items)];
}

/** 已逾期：截止日早于今天（Asia/Shanghai）且未完成 */
function isOverdue(task: Task, today: string): boolean {
  const due = toCalendarDate(task.dueDate);
  return task.status !== 'done' && due !== null && due < today;
}

/** 任务是否落在这一列（已逾期是算出来的第四列，与状态列有重叠） */
function columnOf(task: Task, key: ColumnKey, today: string): boolean {
  if (key === 'overdue') return isOverdue(task, today);
  return task.status === key;
}

/** 看板上的拖拽目标：先命中指针下的列，指针不在任何列里时退回矩形相交 */
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) return pointer;
  return rectIntersection(args);
};

interface BoardFilters {
  priority?: Priority;
  mine?: boolean;
  overdueOnly?: boolean;
}

export function KanbanPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [projectTab, setProjectTab] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [filters, setFilters] = useState<BoardFilters>({});
  const [quickAdd, setQuickAdd] = useState<{ column: ColumnKey; text: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);

  const projectsQuery = useUserProjects();

  const boardQuery = useQuery({
    queryKey: ['tasks', 'kanban'],
    queryFn: listAllTasks,
    staleTime: 30_000,
  });

  const statsQuery = useQuery({
    queryKey: statsKeys.tasks,
    queryFn: fetchTaskStats,
    staleTime: 30_000,
  });

  const projects = projectsQuery.data?.items ?? [];
  const allTasks = boardQuery.data ?? [];
  const today = todayShanghaiDate();

  /** 当前账号能建任务的项目（服务端按归属人校验 project_id） */
  const ownProjects = useMemo(
    () => projects.filter((project) => project.userId === user?.id),
    [projects, user?.id],
  );

  /** Tab 选中的项目（'all' = 全部项目） */
  const selectedProjectId = projectTab === 'all' ? null : Number(projectTab);

  /** 工具条筛选后的任务 —— 列、动态都基于它 */
  const visibleTasks = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return allTasks.filter((task) => {
      if (selectedProjectId !== null && task.projectId !== selectedProjectId) return false;
      if (text) {
        const haystack =
          `${task.title} ${task.assigneeName ?? ''} ${task.category ?? ''}`.toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      if (filters.priority && task.priority !== filters.priority) return false;
      if (filters.mine && task.assigneeId !== user?.id) return false;
      if (filters.overdueOnly && !isOverdue(task, today)) return false;
      return true;
    });
  }, [allTasks, selectedProjectId, keyword, filters, today, user?.id]);

  /** 四列内容（列内按截止日升序，无截止日的排后面） */
  const columns = useMemo(
    () =>
      COLUMN_DEFS.map((def) => ({
        ...def,
        tasks: visibleTasks
          .filter((task) => columnOf(task, def.key, today))
          .sort((a, b) => {
            const left = toCalendarDate(a.dueDate);
            const right = toCalendarDate(b.dueDate);
            if (left !== right) {
              if (left === null) return 1;
              if (right === null) return -1;
              return left < right ? -1 : 1;
            }
            return a.createdAt < b.createdAt ? 1 : -1;
          }),
      })),
    [visibleTasks, today],
  );

  /** 指标卡数据（全局口径，与看板筛选无关） */
  const stats = statsQuery.data;
  const totalTasks = stats ? stats.todo + stats.doing + stats.done : 0;

  const createdSeries = useMemo(() => dailyCreatedSeries(allTasks), [allTasks]);
  const doneSeries = useMemo(() => dailyDoneSeries(allTasks), [allTasks]);

  /** 近期动态：任务的创建 / 完成事件，按时间倒序取 5 条 */
  const activities = useMemo(() => {
    const events: { id: string; at: string; text: string }[] = [];
    visibleTasks.forEach((task) => {
      const who = task.assigneeName ?? '未指派';
      events.push({
        id: `created-${task.id}`,
        at: task.createdAt,
        text: `${who} 创建了任务「${task.title}」`,
      });
      if (task.status === 'done' && task.doneAt) {
        events.push({
          id: `done-${task.id}`,
          at: task.doneAt,
          text: `${who} 完成了任务「${task.title}」`,
        });
      }
    });
    events.sort((a, b) => (a.at < b.at ? 1 : -1));
    return events.slice(0, 5);
  }, [visibleTasks]);

  const statusMutation = useMutation({
    mutationFn: (input: { id: number; status: Task['status'] }) =>
      updateTaskStatus(input.id, input.status),
    onSuccess: async () => {
      await invalidateUserData(queryClient);
      void message.success('状态已更新');
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: {
      title: string;
      column: ColumnKey;
      projectId?: number | null;
    }) => {
      const column = input.column;
      const created = await createTask({
        title: input.title,
        projectId: input.projectId ?? null,
        priority: 'medium',
        // 「已逾期」列只能用截止日表达：默认昨天到期；其余列不带截止日
        dueDate: column === 'overdue' ? yesterdayShanghaiDate() : null,
      });
      // 服务端新建固定 todo —— 要落到别的状态列时再补一次状态流转
      if (column === 'doing' || column === 'done') {
        await updateTaskStatus(created.id, column);
      }
      return created;
    },
    onSuccess: async () => {
      await invalidateUserData(queryClient);
      void message.success('任务已创建');
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragStart = (event: DragStartEvent): void => {
    const taskId = Number(String(event.active.id).split(':')[2]);
    setActiveTaskId(Number.isFinite(taskId) ? taskId : null);
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    setActiveTaskId(null);
    const overId = event.over?.id;
    if (overId === undefined || overId === null) return;
    const column = String(overId) as ColumnKey;
    const taskId = Number(String(event.active.id).split(':')[2]);
    const task = allTasks.find((item) => item.id === taskId);
    if (!task) return;
    if (column === 'overdue') {
      // 虚拟列：拖进去不改状态，只说明原因
      void message.info('「已逾期」按截止日期自动计算，不能直接拖入');
      return;
    }
    if (task.status === column) return;
    statusMutation.mutate({ id: task.id, status: column });
  };

  const tabItems = useMemo(
    () => [
      { key: 'all', label: '全部项目' },
      ...projects.map((project: Project, index: number) => ({
        key: String(project.id),
        label: (
          <span className="wb-kanban-tab">
            <i
              className="wb-kanban-tab-dot"
              style={{ background: projectColor(project.color, index) }}
            />
            {project.name}
          </span>
        ),
      })),
    ],
    [projects],
  );

  const filterItems: MenuProps['items'] = [
    { key: 'p:high', label: '高优先级' },
    { key: 'p:medium', label: '中优先级' },
    { key: 'p:low', label: '低优先级' },
    { type: 'divider' },
    { key: 'mine', label: '只看我负责的' },
    { key: 'overdue', label: '只看过期任务' },
    { type: 'divider' },
    { key: 'reset', label: '清除全部筛选' },
  ];

  const selectedFilterKeys = [
    ...(filters.priority ? [`p:${filters.priority}`] : []),
    ...(filters.mine ? ['mine'] : []),
    ...(filters.overdueOnly ? ['overdue'] : []),
  ];

  const handleFilterClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'reset') {
      setFilters({});
      return;
    }
    if (key === 'mine') {
      setFilters((prev) => ({ ...prev, mine: !prev.mine }));
      return;
    }
    if (key === 'overdue') {
      setFilters((prev) => ({ ...prev, overdueOnly: !prev.overdueOnly }));
      return;
    }
    const priority = key.split(':')[1];
    if (priority === 'high' || priority === 'medium' || priority === 'low') {
      setFilters((prev) => ({
        ...prev,
        priority: prev.priority === priority ? undefined : priority,
      }));
    }
  };

  const filterCount =
    (filters.priority ? 1 : 0) + (filters.mine ? 1 : 0) + (filters.overdueOnly ? 1 : 0);

  const activeTask = useMemo(
    () => allTasks.find((task) => task.id === activeTaskId) ?? null,
    [allTasks, activeTaskId],
  );

  const metricCards = [
    {
      label: '全部任务',
      value: totalTasks,
      icon: <CheckSquareOutlined />,
      iconColor: designVars.primary,
      delta: seriesDelta(createdSeries),
      trend: createdSeries,
      hint: `近 7 天新增 ${seriesSum(createdSeries)} 项`,
    },
    {
      label: '进行中',
      value: stats?.doing ?? 0,
      icon: <ScheduleOutlined />,
      iconColor: designVars.green,
      hint: '正在推进中的任务',
    },
    {
      label: '待处理',
      value: stats?.todo ?? 0,
      icon: <ClockCircleOutlined />,
      iconColor: designVars.orange,
      hint: '尚未开始的任务',
    },
    {
      label: '已完成',
      value: stats?.done ?? 0,
      icon: <CheckCircleOutlined />,
      iconColor: designVars.purple,
      delta: seriesDelta(doneSeries),
      trend: doneSeries,
      hint: `近 7 天完成 ${seriesSum(doneSeries)} 项`,
    },
  ];

  return (
    <div className="wb-page">
      <PageHeader
        title="项目看板"
        subtitle="以可视化看板管理项目任务，掌握进度，提升团队协作效率"
      />

      {/* 4 张指标卡 */}
      <div className="wb-metric-grid">
        {metricCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            iconColor={card.iconColor}
            delta={card.delta}
            trend={card.trend}
            hint={card.hint}
          />
        ))}
      </div>

      {/* 任务看板 */}
      <Panel title="任务看板" flush style={{ marginBottom: 18 }}>
        <div className="wb-kanban-toolbar">
          <div className="wb-kanban-tabs">
            <Tabs
              size="small"
              activeKey={projectTab}
              onChange={setProjectTab}
              items={tabItems}
            />
          </div>
          <div className="wb-kanban-actions">
            <Input
              className="wb-kanban-search"
              allowClear
              prefix={<SearchOutlined style={{ color: designVars.muted }} />}
              placeholder="搜索任务名称、负责人或标签…"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Dropdown
              trigger={['click']}
              menu={{
                items: filterItems,
                selectable: true,
                selectedKeys: selectedFilterKeys,
                onClick: handleFilterClick,
              }}
            >
              <Button icon={<FilterOutlined />}>
                筛选{filterCount > 0 ? ` · ${filterCount}` : ''}
              </Button>
            </Dropdown>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              新建任务
            </Button>
          </div>
        </div>

        <div className="wb-kanban-body">
          <StateBlock
            loading={boardQuery.isPending}
            error={boardQuery.isError ? boardQuery.error : undefined}
            onRetry={() => void boardQuery.refetch()}
            isEmpty={allTasks.length === 0}
            emptyText="还没有任务"
            emptyAction={
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                新建任务
              </Button>
            }
          >
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveTaskId(null)}
            >
              <div className="wb-kanban-cols">
                {columns.map((column) => (
                  <KanbanColumn
                    key={column.key}
                    column={column}
                    today={today}
                    canQuickAdd={
                      selectedProjectId === null ||
                      ownProjects.some((project) => project.id === selectedProjectId)
                    }
                    quickAdd={quickAdd && quickAdd.column === column.key ? quickAdd : null}
                    onQuickAddChange={(next) => setQuickAdd(next)}
                    onQuickAddSubmit={(title) => {
                      createMutation.mutate({
                        title,
                        column: column.key,
                        projectId: selectedProjectId,
                      });
                      setQuickAdd(null);
                    }}
                  />
                ))}
              </div>
              <DragOverlay dropAnimation={null}>
                {activeTask ? (
                  <div className="wb-kanban-card wb-kanban-card-overlay">
                    <TaskCardBody task={activeTask} today={today} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </StateBlock>
        </div>
      </Panel>

      {/* 底部两栏：近期动态 + 任务分布 */}
      <div className="wb-grid">
        <div className="wb-grid-left">
          <Panel title="近期动态" extra={<span className="wb-muted">最近 5 条</span>} flush>
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={boardQuery.isPending}
                error={boardQuery.isError ? boardQuery.error : undefined}
                onRetry={() => void boardQuery.refetch()}
                isEmpty={activities.length === 0}
                emptyText="还没有任务动态"
              >
                {activities.map((activity) => (
                  <div className="wb-kanban-activity" key={activity.id}>
                    <span className="wb-kanban-activity-text">{activity.text}</span>
                    <span className="wb-kanban-activity-time">
                      · {formatDateTime(activity.at).slice(11)}
                    </span>
                  </div>
                ))}
              </StateBlock>
            </div>
          </Panel>
        </div>

        <div className="wb-grid-right">
          <Panel title="任务分布" flush>
            <div style={{ padding: '4px 18px 16px' }}>
              <StateBlock
                loading={statsQuery.isPending}
                error={statsQuery.isError ? statsQuery.error : undefined}
                onRetry={() => void statsQuery.refetch()}
                isEmpty={totalTasks === 0}
                emptyText="还没有任务"
              >
                <div className="wb-status-chart">
                  <DonutChart
                    segments={[
                      { name: '待处理', value: stats?.todo ?? 0, color: designVars.statusReview },
                      { name: '进行中', value: stats?.doing ?? 0, color: designVars.statusDoing },
                      { name: '已完成', value: stats?.done ?? 0, color: designVars.statusDone },
                    ]}
                    centerValue={totalTasks}
                    centerLabel="总任务"
                    size={126}
                    thickness={16}
                  />
                  <div className="wb-status-legend">
                    <LegendItem color={designVars.orange} name="待处理" value={stats?.todo ?? 0} />
                    <LegendItem color={designVars.statusDoing} name="进行中" value={stats?.doing ?? 0} />
                    <LegendItem color={designVars.statusDone} name="已完成" value={stats?.done ?? 0} />
                  </div>
                </div>
              </StateBlock>
            </div>
          </Panel>
        </div>
      </div>

      <TaskFormModal
        open={formOpen}
        mode="create"
        projects={ownProjects}
        ownerUserId={user?.id}
        onClose={() => {
          setFormOpen(false);
          // TaskFormModal 自己会失效 ['tasks']（含看板查询）与 ['projects']，
          // 但不会动 ['stats'] —— 这里补上，让指标卡/环形图跟着新任务刷新。
          void queryClient.invalidateQueries({ queryKey: ['stats'] });
        }}
      />
    </div>
  );
}

/** 看板的一列（droppable） */
function KanbanColumn({
  column,
  today,
  canQuickAdd,
  quickAdd,
  onQuickAddChange,
  onQuickAddSubmit,
}: {
  column: ColumnDef & { tasks: Task[] };
  today: string;
  canQuickAdd: boolean;
  quickAdd: { column: ColumnKey; text: string } | null;
  onQuickAddChange: (next: { column: ColumnKey; text: string } | null) => void;
  onQuickAddSubmit: (title: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });

  /** 同一段文字只提交一次（回车 / 点按钮 / 失焦可能同时触发） */
  const submittedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!quickAdd) submittedRef.current = null;
  }, [quickAdd]);

  const submitQuickAdd = (): void => {
    const title = quickAdd?.text.trim() ?? '';
    if (!title) {
      onQuickAddChange(null);
      return;
    }
    if (submittedRef.current === title) return;
    submittedRef.current = title;
    onQuickAddSubmit(title);
  };

  return (
    <section
      ref={setNodeRef}
      className={`wb-kanban-col${isOver ? ' is-over' : ''}`}
      aria-label={`${column.title}（${column.tasks.length}）`}
    >
      <header className="wb-kanban-col-head">
        <i className="wb-kanban-dot" style={{ background: column.color }} />
        <span
          className="wb-kanban-col-title"
          title={
            column.key === 'overdue'
              ? '按截止日期自动计算的虚拟列：与「待开始 / 进行中」两列可能同时包含同一个任务'
              : undefined
          }
        >
          {column.title}
        </span>
        <span className="wb-kanban-col-count">{column.tasks.length}</span>
      </header>

      <div className="wb-kanban-cards">
        {column.tasks.map((task) => (
          <DraggableTaskCard
            key={`${column.key}-${task.id}`}
            columnKey={column.key}
            task={task}
            today={today}
          />
        ))}
        {column.tasks.length === 0 ? <div className="wb-kanban-col-empty">暂无任务</div> : null}
      </div>

      {quickAdd ? (
        <div className="wb-kanban-quickadd">
          <Input
            size="small"
            autoFocus
            placeholder="输入任务标题后回车"
            value={quickAdd.text}
            onChange={(event) =>
              onQuickAddChange({ column: quickAdd.column, text: event.target.value })
            }
            onPressEnter={submitQuickAdd}
            onBlur={submitQuickAdd}
          />
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            onMouseDown={(event) => event.preventDefault()}
            onClick={submitQuickAdd}
          >
            添加
          </Button>
        </div>
      ) : (
        <Tooltip title={canQuickAdd ? '' : '该项目不属于当前账号，无法新建任务'}>
          <button
            type="button"
            className="wb-kanban-add"
            disabled={!canQuickAdd}
            onClick={() => onQuickAddChange({ column: column.key, text: '' })}
          >
            + 添加任务
          </button>
        </Tooltip>
      )}
    </section>
  );
}

/** 可拖拽的任务卡片 */
function DraggableTaskCard({
  columnKey,
  task,
  today,
}: {
  columnKey: ColumnKey;
  task: Task;
  today: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    // 列 + 任务 id 组合：同一个任务可能同时出现在状态列与「已逾期」列
    id: `card:${columnKey}:${task.id}`,
    data: { taskId: task.id },
  });

  // 拖动时原卡片留在原位（半透明占位），浮层用 DragOverlay 跟随指针
  const style: CSSProperties = {
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="wb-kanban-card"
      {...listeners}
      {...attributes}
    >
      <TaskCardBody task={task} today={today} />
    </div>
  );
}

/** 卡片内容（列内与拖拽浮层共用） */
function TaskCardBody({ task, today }: { task: Task; today: string }) {
  const overdue = isOverdue(task, today);

  return (
    <>
      <div className="wb-kanban-card-title" title={task.title}>
        {task.title}
      </div>

      <div className="wb-kanban-card-tags">
        {task.projectName ? <ToneTag tone="blue">{task.projectName}</ToneTag> : null}
        {task.category ? (
          <ToneTag tone={categoryTone(task.category)}>{task.category}</ToneTag>
        ) : null}
      </div>

      <div className="wb-kanban-card-foot">
        <ToneTag tone={STATUS_TONE[task.priority] ?? 'gray'}>
          {PRIORITY_LABEL[task.priority]}
        </ToneTag>
        <div className="wb-kanban-card-meta">
          {task.assigneeName ? (
            <AvatarGroup people={[task.assigneeName]} max={1} size={22} />
          ) : (
            <span className="wb-muted">未指派</span>
          )}
          <span className={`wb-kanban-due${overdue ? ' is-overdue' : ''}`}>
            {formatDateOnly(task.dueDate)}
          </span>
        </div>
      </div>
    </>
  );
}

/** 昨天（Asia/Shanghai）——「已逾期」列新建任务时的默认截止日 */
function yesterdayShanghaiDate(): string {
  return recentShanghaiDates(2)[0] ?? todayShanghaiDate();
}

export default KanbanPage;
