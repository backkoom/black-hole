import { useState } from 'react';
import { Alert, App as AntdApp, Button, Card, Empty, Input, Radio, Select } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Task, TaskStatus } from '@workbench/shared/types';
import { deleteTask, listTasks, tasksKeys, updateTaskStatus } from '../api/tasks';
import type { TaskDueFilter } from '../api/tasks';
import { errorStatus, errorText } from '../api/messages';
import { useAuth } from '../auth/AuthContext';
import { toProjectOptions, useProjectOptions } from '../hooks/useProjectOptions';
import { ErrorResult } from '../components/ErrorResult';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import { TaskTable } from '../components/tasks/TaskTable';

/**
 * 任务管理页 —— pages.md §3 `/tasks`。
 *
 * 组件树：
 * TasksPage
 * ├─ PageHeader(标题「任务管理」/ 右侧「新增任务」)
 * ├─ FilterBar(关键词 / 时间范围(今天·逾期·本周) / 项目下拉 / 状态下拉 / 重置)
 * ├─ TaskTable(标题 / 项目 / 状态 / 优先级 / 到期日 / 操作)
 * └─ TaskFormModal(新增 / 编辑)
 *
 * 口径：
 * - 列表默认按 created_at 倒序、分页 20（服务端分页，前端只传 page/pageSize）；
 * - keyword 匹配 title 子串；due= today/overdue/week；projectId / status 直接透传；
 * - 状态流转走 PATCH /api/tasks/:id/status（已是 done 再提交 done 由服务端保持原 done_at）；
 * - 删除是软删 + Popconfirm 二次确认；
 * - 任务变了会影响项目进度/状态，失效时同时刷任务与项目列表（实时算，不依赖缓存）。
 */

const PAGE_SIZE = 20;

interface Filters {
  keyword?: string;
  due?: TaskDueFilter;
  projectId?: number;
  status?: TaskStatus;
  page: number;
  pageSize: number;
}

const INITIAL_FILTERS: Filters = { page: 1, pageSize: PAGE_SIZE };

export function TasksPage() {
  const { message } = AntdApp.useApp();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [keywordInput, setKeywordInput] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [statusPendingId, setStatusPendingId] = useState<number | null>(null);

  const projectsQuery = useProjectOptions();

  const listQuery = useQuery({
    queryKey: tasksKeys.list(filters),
    queryFn: () => listTasks(filters),
  });

  /** 刷新任务与项目（进度/状态实时算，两个都要刷） */
  const invalidateAll = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    await queryClient.invalidateQueries({ queryKey: ['projects'] });
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
    onSettled: () => setStatusPendingId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTask(id),
    onSuccess: async () => {
      await invalidateAll();
      void message.success('已删除');
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  const projectOptions = toProjectOptions(projectsQuery.data);

  // 项目下拉按**任务归属人**过滤（服务端按归属人校验 project_id）：
  // 新建时归属人是当前登录用户；编辑时是这条任务的归属人。
  const ownerUserId = editing ? editing.userId : user?.id;

  const resetFilters = (): void => {
    setKeywordInput('');
    setFilters(INITIAL_FILTERS);
  };

  return (
    <div className="wb-page">
      <div className="wb-page-head">
        <div>
          <h1 className="wb-page-title">任务管理</h1>
          <p className="wb-page-sub">按关键词、项目、状态与到期时间筛选；行内可直接改状态。</p>
        </div>
        <div className="wb-page-head-actions">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            新增任务
          </Button>
        </div>
      </div>

      <Card className="wb-card-flat">
        <div className="wb-filter-bar">
          <Input.Search
            className="wb-filter-item"
            value={keywordInput}
            allowClear
            placeholder="搜索任务标题"
            onChange={(event) => setKeywordInput(event.target.value)}
            onSearch={(value) =>
              setFilters((prev) => ({ ...prev, keyword: value.trim() || undefined, page: 1 }))
            }
          />

          <Radio.Group
            className="wb-filter-due"
            value={filters.due ?? 'all'}
            optionType="button"
            buttonStyle="solid"
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                due:
                  event.target.value === 'all'
                    ? undefined
                    : (event.target.value as TaskDueFilter),
                page: 1,
              }))
            }
            options={[
              { value: 'all', label: '全部' },
              { value: 'today', label: '今日' },
              { value: 'overdue', label: '逾期' },
              { value: 'week', label: '本周' },
            ]}
          />

          <Select
            className="wb-filter-item"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部项目"
            value={filters.projectId}
            onChange={(value) => setFilters((prev) => ({ ...prev, projectId: value, page: 1 }))}
            options={projectOptions}
          />

          <Select
            className="wb-filter-item"
            allowClear
            placeholder="全部状态"
            value={filters.status}
            onChange={(value) => setFilters((prev) => ({ ...prev, status: value, page: 1 }))}
            options={[
              { value: 'todo', label: '待开始' },
              { value: 'doing', label: '进行中' },
              { value: 'done', label: '已完成' },
            ]}
          />

          <Button onClick={resetFilters}>重置</Button>
        </div>

        {projectsQuery.isError ? (
          <Alert
            className="wb-form-alert"
            type="error"
            showIcon
            message={errorText(projectsQuery.error)}
            action={
              <Button size="small" onClick={() => void projectsQuery.refetch()}>
                重试
              </Button>
            }
          />
        ) : null}

        {listQuery.isError ? (
          <ErrorResult
            status={errorStatus(listQuery.error)}
            text={errorText(listQuery.error)}
            onRetry={() => void listQuery.refetch()}
          />
        ) : (
          <TaskTable
            tasks={listQuery.data?.items ?? []}
            loading={listQuery.isPending}
            showProjectColumn
            statusPendingId={statusPendingId}
            onStatusChange={(task, next) => {
              setStatusPendingId(task.id);
              statusMutation.mutate({ id: task.id, status: next });
            }}
            onEdit={(task) => {
              setEditing(task);
              setFormOpen(true);
            }}
            onDelete={(task) => deleteMutation.mutate(task.id)}
            emptyText={
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                styles={{ image: { height: 48 } }}
                description="还没有任务"
              >
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  新增任务
                </Button>
              </Empty>
            }
            pagination={{
              current: filters.page,
              pageSize: filters.pageSize,
              total: listQuery.data?.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (total) => `共 ${total} 个任务`,
              onChange: (page, pageSize) => setFilters((prev) => ({ ...prev, page, pageSize })),
            }}
          />
        )}
      </Card>

      <TaskFormModal
        open={formOpen}
        mode={editing ? 'edit' : 'create'}
        task={editing}
        projects={projectsQuery.data ?? []}
        ownerUserId={ownerUserId}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </div>
  );
}
