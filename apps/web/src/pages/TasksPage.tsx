import { useMemo, useState } from 'react';
import {
  App as AntdApp,
  Button,
  Card,
  DatePicker,
  Dropdown,
  Input,
  Pagination,
  Select,
  Space,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  CloudDownloadOutlined,
  DownOutlined,
  ExportOutlined,
  PlusOutlined,
  ScheduleOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Priority, TaskStatus } from '@workbench/shared/types';
import { deleteTask, listTasks, tasksKeys, updateTaskStatus } from '../api/tasks';
import { errorText } from '../api/messages';
import { useAssigneeOptions, useUserProjects } from '../hooks/useUserData';
import { useAuth } from '../auth/AuthContext';
import { useTaskCounts } from '../hooks/useTaskCounts';
import { invalidateUserData } from '../hooks/useInvalidate';
import { downloadBlob, toCsv } from '../utils/download';
import { parseDateOnly, toDateOnly, todayShanghaiDate } from '../utils/datetime';
import { designVars } from '../styles/theme';
import { MetricCard, STATUS_TONE, ToneTag } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { StateBlock } from '../components/user/StateBlock';
import { TaskListTable } from '../components/user/TaskListTable';
import { categoryTone } from '../components/user/visuals';

/**
 * 任务清单页（老六最终用户端界面 · 图3）。
 *
 * 组件树：
 * TasksPage
 * ├─ PageHeader(「任务清单」+ 副标题 + 右侧日期/日历按钮)
 * ├─ 4 张指标卡（全部任务 / 进行中 / 待处理 / 已完成）
 * ├─ Card「任务筛选」
 * │  ├─ 搜索框（占位文案「搜索任务名称、关键词或编号…」）
 * │  ├─ 下拉：全部项目 / 全部状态 / 全部优先级 / 全部负责人 / 全部分类
 * │  ├─ 日期范围（起止日期，中间「-」）
 * │  └─ 「更多筛选」「重置」
 * └─ Card「任务列表（共 N 项）」
 *    ├─ 右上：批量操作 / 导出 / + 新建任务
 *    ├─ 表格（10 列，见 TaskListTable）
 *    └─ 分页：「共 N 项」「每页 10 条」+ 页码
 *
 * 口径：
 * - 列表服务端分页 + 服务端筛选（keyword/projectId/status/priority/assigneeId/category/from/to）；
 * - 指标卡取 GET /api/stats/tasks 的 todo / doing / done，全部任务 = 三者之和；
 * - 分类下拉的候选项来自真实任务的 category 去重（没有接口能列分类）；
 * - 导出走 utils/download.ts 的 CSV（只导当前页真实数据）。
 */

const PAGE_SIZE = 10;

interface Filters {
  keyword?: string;
  projectId?: number;
  status?: TaskStatus;
  priority?: Priority;
  assigneeId?: number;
  category?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

const INITIAL_FILTERS: Filters = { page: 1, pageSize: PAGE_SIZE };

export function TasksPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [keywordInput, setKeywordInput] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);

  const projectsQuery = useUserProjects();
  const assigneesQuery = useAssigneeOptions(user);
  const { counts: taskCounts } = useTaskCounts();

  const listQuery = useQuery({
    queryKey: tasksKeys.list(filters),
    queryFn: () => listTasks(filters),
    placeholderData: (previous) => previous,
  });

  /** 分类候选项：来自真实任务的 category 去重（服务端没有分类列表接口） */
  const categoryOptions = useQuery({
    queryKey: ['user', 'task-categories'],
    queryFn: async (): Promise<string[]> => {
      const data = await listTasks({ page: 1, pageSize: 100 });
      const names = new Set<string>();
      data.items.forEach((task) => {
        if (task.category) names.add(task.category);
      });
      return [...names].sort();
    },
    staleTime: 60_000,
  });

  const invalidateAll = async (): Promise<void> => {
    await invalidateUserData(queryClient);
  };

  const statusMutation = useMutation({
    mutationFn: (input: { id: number; status: TaskStatus }) =>
      updateTaskStatus(input.id, input.status),
    onSuccess: async () => {
      await invalidateAll();
      void message.success('状态已更新');
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTask(id),
    onSuccess: async () => {
      await invalidateAll();
      setSelectedRowKeys([]);
      void message.success('已删除');
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  const resetFilters = (): void => {
    setKeywordInput('');
    setFilters(INITIAL_FILTERS);
    setSelectedRowKeys([]);
  };

  // 空态要分两种：真没数据 / 筛选后没结果。文案和按钮都不一样，
  // 否则"没有符合条件的任务"会让人以为库里空了。
  const hasActiveFilter = Boolean(
    filters.keyword ||
      filters.projectId ||
      filters.status ||
      filters.priority ||
      filters.assigneeId ||
      filters.category ||
      filters.from ||
      filters.to,
  );


  const projectOptions = useMemo(
    () =>
      (projectsQuery.data?.items ?? []).map((project) => ({
        value: project.id,
        label: project.name,
      })),
    [projectsQuery.data],
  );

  const assigneeOptions = useMemo(
    () =>
      (assigneesQuery.data ?? []).map((user) => ({ value: user.id, label: user.name })),
    [assigneesQuery.data],
  );

  const categoryChoices = useMemo(
    () => (categoryOptions.data ?? []).map((name) => ({ value: name, label: name })),
    [categoryOptions.data],
  );

  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;

  /** 导出当前页的 CSV（真实数据，用现成的 utils/download.ts） */
  const handleExport = (): void => {
    if (rows.length === 0) {
      void message.info('当前没有可导出的任务');
      return;
    }
    const headers = ['任务名称', '所属项目', '负责人', '优先级', '状态', '截止日期', '分类', '提醒'];
    const body = rows.map((task) => [
      task.title,
      task.projectName ?? '',
      task.assigneeName ?? '',
      task.priority,
      task.status,
      task.dueDate ?? '',
      task.category ?? '',
      task.reminderAt ?? '',
    ]);
    downloadBlob(
      new Blob([toCsv(headers, body)], { type: 'text/csv;charset=utf-8' }),
      `tasks-${todayShanghaiDate()}.csv`,
    );
    void message.success(`已导出 ${rows.length} 条任务`);
  };

  /** 批量操作：把选中的任务改成指定状态 */
  const bulkSetStatus = async (status: TaskStatus): Promise<void> => {
    const ids = selectedRowKeys.filter((key): key is number => typeof key === 'number');
    if (ids.length === 0) {
      void message.info('请先勾选要批量操作的任务');
      return;
    }
    try {
      await Promise.all(ids.map((id) => updateTaskStatus(id, status)));
      await invalidateAll();
      setSelectedRowKeys([]);
      void message.success(`已把 ${ids.length} 条任务改为「${status === 'done' ? '已完成' : '进行中'}」`);
    } catch (err) {
      void message.error(errorText(err));
    }
  };

  const metricCards = [
    { label: '全部任务', value: taskCounts.total, color: designVars.primary, icon: <CheckSquareOutlined /> },
    { label: '进行中', value: taskCounts.doing, color: designVars.statusDoing, icon: <ScheduleOutlined /> },
    { label: '待处理', value: taskCounts.todo, color: designVars.orange, icon: <ClockCircleOutlined /> },
    { label: '已完成', value: taskCounts.done, color: designVars.purple, icon: <CheckCircleOutlined /> },
  ];

  return (
    <div className="wb-page">
      <PageHeader title="任务清单" subtitle="按项目、状态、优先级与负责人筛选任务，并批量处理。" />

      {/* 4 张指标卡 */}
      <div className="wb-metric-grid">
        {metricCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            iconColor={card.color}
          />
        ))}
      </div>

      {/* 任务筛选 */}
      <Card className="wb-card-flat wb-filter-panel" style={{ marginBottom: 18 }}>
        <div className="wb-filter-bar">
          <Input.Search
            className="wb-filter-search"
            value={keywordInput}
            allowClear
            placeholder="搜索任务名称、关键词或编号…"
            onChange={(event) => setKeywordInput(event.target.value)}
            onSearch={(value) =>
              setFilters((prev) => ({ ...prev, keyword: value.trim() || undefined, page: 1 }))
            }
          />

          <Select
            className="wb-filter-select"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部项目"
            value={filters.projectId}
            onChange={(value) => setFilters((prev) => ({ ...prev, projectId: value, page: 1 }))}
            options={projectOptions}
          />

          <Select
            className="wb-filter-select"
            allowClear
            placeholder="全部状态"
            value={filters.status}
            onChange={(value) => setFilters((prev) => ({ ...prev, status: value, page: 1 }))}
            options={[
              { value: 'todo', label: '待处理' },
              { value: 'doing', label: '进行中' },
              { value: 'done', label: '已完成' },
            ]}
          />

          <Select
            className="wb-filter-select"
            allowClear
            placeholder="全部优先级"
            value={filters.priority}
            onChange={(value) => setFilters((prev) => ({ ...prev, priority: value, page: 1 }))}
            options={[
              { value: 'high', label: '高' },
              { value: 'medium', label: '中' },
              { value: 'low', label: '低' },
            ]}
          />

          <Select
            className="wb-filter-select"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部负责人"
            value={filters.assigneeId}
            onChange={(value) => setFilters((prev) => ({ ...prev, assigneeId: value, page: 1 }))}
            options={assigneeOptions}
          />

          <Select
            className="wb-filter-select"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部分类"
            value={filters.category}
            onChange={(value) => setFilters((prev) => ({ ...prev, category: value, page: 1 }))}
            options={categoryChoices}
          />

          <DatePicker.RangePicker
            className="wb-filter-date"
            allowClear
            separator="-"
            format="YYYY-MM-DD"
            placeholder={['开始日期', '结束日期']}
            value={[
              filters.from ? parseDateOnly(filters.from) : null,
              filters.to ? parseDateOnly(filters.to) : null,
            ]}
            onChange={(dates) => {
              const from = dates?.[0] ? (toDateOnly(dates[0]) ?? undefined) : undefined;
              const to = dates?.[1] ? (toDateOnly(dates[1]) ?? undefined) : undefined;
              setFilters((prev) => ({ ...prev, from, to, page: 1 }));
            }}
          />

          <div className="wb-filter-actions">
            <Tooltip title="更多筛选条件">
              <Button icon={<DownOutlined />} onClick={() => setMoreOpen((prev) => !prev)}>
                更多筛选
              </Button>
            </Tooltip>
            <Button onClick={resetFilters}>重置</Button>
          </div>
        </div>

        {moreOpen ? (
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
            }}
          >
            <span className="wb-muted">已选筛选：</span>
            {filters.keyword ? <ToneTag tone="blue">关键词：{filters.keyword}</ToneTag> : null}
            {filters.projectId ? (
              <ToneTag tone="blue">
                项目：
                {projectOptions.find((option) => option.value === filters.projectId)?.label ?? ''}
              </ToneTag>
            ) : null}
            {filters.status ? (
              <ToneTag tone={STATUS_TONE[filters.status] ?? 'gray'}>
                状态：{filters.status === 'todo' ? '待处理' : filters.status === 'doing' ? '进行中' : '已完成'}
              </ToneTag>
            ) : null}
            {filters.priority ? (
              <ToneTag tone={STATUS_TONE[filters.priority] ?? 'gray'}>
                优先级：{filters.priority === 'high' ? '高' : filters.priority === 'medium' ? '中' : '低'}
              </ToneTag>
            ) : null}
            {filters.assigneeId ? (
              <ToneTag tone="purple">
                负责人：
                {assigneeOptions.find((option) => option.value === filters.assigneeId)?.label ?? ''}
              </ToneTag>
            ) : null}
            {filters.category ? (
              <ToneTag tone={categoryTone(filters.category)}>分类：{filters.category}</ToneTag>
            ) : null}
            {filters.from || filters.to ? (
              <ToneTag tone="orange">
                截止：{filters.from ?? '不限'} ~ {filters.to ?? '不限'}
              </ToneTag>
            ) : null}
            {!filters.keyword &&
            !filters.projectId &&
            !filters.status &&
            !filters.priority &&
            !filters.assigneeId &&
            !filters.category &&
            !filters.from &&
            !filters.to ? (
              <span className="wb-muted">暂无附加筛选</span>
            ) : null}
          </div>
        ) : null}
      </Card>

      {/* 任务列表 */}
      <Card
        className="wb-card-flat"
        title={<span>任务列表（共 {total} 项）</span>}
        extra={
          <Space size={8}>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'doing', label: '批量标记为进行中' },
                  { key: 'done', label: '批量标记为已完成' },
                ],
                onClick: ({ key }: { key: string }) =>
                  void bulkSetStatus(key === 'done' ? 'done' : 'doing'),
              }}
            >
              <Button size="small" icon={<CloudDownloadOutlined />}>
                批量操作
              </Button>
            </Dropdown>
            <Button size="small" icon={<ExportOutlined />} onClick={handleExport}>
              导出
            </Button>
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => void message.info('新建任务表单正在迭代')}>
              新建任务
            </Button>
          </Space>
        }
      >
        <StateBlock
          loading={listQuery.isPending}
          error={listQuery.isError ? listQuery.error : undefined}
          onRetry={() => void listQuery.refetch()}
          isEmpty={rows.length === 0}
          emptyText={hasActiveFilter ? '没有符合条件的任务' : '还没有任务'}
          emptyHint={
            hasActiveFilter
              ? '换个条件试试，或点下面的「清除筛选」回到全部任务。'
              : '点右上角「新建任务」创建第一条，或在看板里拖动任务改状态。'
          }
          emptyAction={
            hasActiveFilter ? <Button onClick={resetFilters}>清除筛选</Button> : undefined
          }
          skeletonMinHeight={320}
        >
          <TaskListTable
            tasks={rows}
            loading={listQuery.isPending}
            statusPendingId={statusMutation.isPending ? (statusMutation.variables?.id ?? null) : null}
            onStatusChange={(task, next) => statusMutation.mutate({ id: task.id, status: next })}
            onEdit={() => void message.info('编辑任务表单正在迭代')}
            onDelete={(task) => deleteMutation.mutate(task.id)}
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
            }}
            pagination={false}
          />

          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              marginTop: 14,
            }}
          >
            <span className="wb-muted">共 {total} 项</span>
            <Space size={8}>
              <Select<number>
                size="small"
                value={filters.pageSize}
                onChange={(value) => setFilters((prev) => ({ ...prev, pageSize: value, page: 1 }))}
                options={[
                  { value: 10, label: '每页 10 条' },
                  { value: 20, label: '每页 20 条' },
                  { value: 50, label: '每页 50 条' },
                ]}
              />
              <Pagination
                size="small"
                current={filters.page}
                pageSize={filters.pageSize}
                total={total}
                showSizeChanger={false}
                onChange={(page) => setFilters((prev) => ({ ...prev, page }))}
              />
            </Space>
          </div>
        </StateBlock>
      </Card>
    </div>
  );
}
