import { useState } from 'react';
import { App as AntdApp, Button, Card, Empty, Popconfirm, Skeleton, Space } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { Task, TaskStatus } from '@blackhole/shared/types';
import { deleteProject, getProjectDetail, projectsKeys } from '../api/projects';
import { deleteTask, tasksKeys, updateTaskStatus } from '../api/tasks';
import { errorStatus, errorText } from '../api/messages';
import { useAuth } from '../auth/AuthContext';
import { formatDateOnly } from '../utils/datetime';
import { ErrorResult } from '../components/ErrorResult';
import { PageHeader } from '../components/PageHeader';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import { TaskTable } from '../components/tasks/TaskTable';
import { ProjectFormModal } from '../components/projects/ProjectFormModal';
import { ProjectProgress } from '../components/projects/ProjectProgress';
import { ProjectStatusTag } from '../components/projects/ProjectStatusTag';

/**
 * 项目详情页 —— pages.md §5 `/projects/:id`。
 *
 * 组件树：
 * ProjectDetailPage
 * ├─ ProjectHeader(名称 / 负责人 / 截止日 / 大号进度条 + 百分比 / 状态)
 * ├─ TaskTable(复用任务管理的行组件：标题 / 状态 / 优先级 / 到期日 / 操作)
 * ├─ TaskFormModal(项目内新增任务，POST /api/tasks 带 projectId)
 * ├─ ProjectFormModal(编辑项目)
 * └─ Popconfirm(删除项目，提示任务会保留但解除归属)
 *
 * 口径：
 * - 项目进度与状态由服务端实时算（progress / doneItems / totalItems），前端不再算；
 * - 任务列表复用 TaskTable，行内改状态 / 编辑 / 删除与任务管理页完全一致；
 * - 项目不存在或无权访问 → 404 页（不泄露存在性）。
 */

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const validId = Number.isInteger(projectId) && projectId > 0;

  const { message } = AntdApp.useApp();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [statusPendingId, setStatusPendingId] = useState<number | null>(null);

  const detailQuery = useQuery({
    queryKey: projectsKeys.detail(projectId),
    queryFn: () => getProjectDetail(projectId),
    enabled: validId,
  });

  const project = detailQuery.data?.project ?? null;
  const tasks = detailQuery.data?.tasks ?? [];

  /** 任务变了 → 项目进度/状态也会变，两个都要刷（v2 §6.2「实时算，不依赖缓存」） */
  const invalidateAll = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    await queryClient.invalidateQueries({ queryKey: projectsKeys.all });
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

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: number) => deleteTask(taskId),
    onSuccess: async () => {
      await invalidateAll();
      void message.success('已删除');
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (targetId: number) => deleteProject(targetId),
    onSuccess: async () => {
      await invalidateAll();
      void message.success('项目已删除');
      void navigate('/projects', { replace: true });
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  /** 只有项目归属人能新增任务（v2 §5.2：管理员看他人项目时隐藏，不能点了再报 422） */
  const canAddTask = project !== null && user !== null && project.userId === user.id;

  if (!validId) {
    return (
      <div className="wb-page">
        <ErrorResult status={404} text="资源不存在或已被移除。" />
      </div>
    );
  }

  if (detailQuery.isError) {
    // 项目不存在或无权访问一律显示 404 页「页面不存在/资源不存在」（pages.md §5）。
    // 服务端对「无权访问」返回 400 + message「项目不存在」，
    // 这里仍按契约渲染 404 页，但文案取服务端原文，不改写。
    const status = errorStatus(detailQuery.error);
    const notFound = status === 404 || status === 400;
    return (
      <div className="wb-page">
        <ErrorResult
          status={notFound ? 404 : status}
          text={errorText(detailQuery.error)}
          onRetry={() => void detailQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="wb-page">
      <PageHeader
        title={project?.name ?? '项目详情'}
        subtitle="项目基本信息、任务与进度"
        back={{ label: '返回项目档案', to: '/projects' }}
        extra={
          <>
            {canAddTask ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingTask(null);
                  setTaskFormOpen(true);
                }}
              >
                新增任务
              </Button>
            ) : null}
            <Button icon={<EditOutlined />} disabled={!project} onClick={() => setProjectFormOpen(true)}>
              编辑项目
            </Button>
            <Popconfirm
              title={`删除项目「${project?.name ?? ''}」？`}
              description="项目下的任务会保留，但不再归属该项目"
              okText="删除"
              cancelText="取消"
              onConfirm={() => {
                if (project) deleteProjectMutation.mutate(project.id);
              }}
            >
              <Button danger icon={<DeleteOutlined />} disabled={!project}>
                删除项目
              </Button>
            </Popconfirm>
          </>
        }
      />

      <Card className="wb-card-flat">
        {detailQuery.isPending || !project ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : (
          <div className="wb-project-detail">
            <div className="wb-project-detail-meta">
              <Space size={18} wrap>
                <span>
                  <span className="wb-muted">负责人：</span>
                  {project.owner ?? '未指定'}
                </span>
                <span>
                  <span className="wb-muted">截止日：</span>
                  {formatDateOnly(project.dueDate)}
                </span>
                <span>
                  <span className="wb-muted">状态：</span>
                  <ProjectStatusTag status={project.status} />
                </span>
              </Space>
              <span className="wb-project-detail-count">
                已完成 {project.doneItems} / {project.totalItems}
              </span>
            </div>
            <ProjectProgress project={project} size="large" />
          </div>
        )}
      </Card>

      <Card className="wb-card-flat wb-task-card">
        <div className="wb-section-title">项目任务</div>
        <TaskTable
          tasks={tasks}
          loading={detailQuery.isPending}
          statusPendingId={statusPendingId}
          onStatusChange={(task, next) => {
            setStatusPendingId(task.id);
            statusMutation.mutate({ id: task.id, status: next });
          }}
          onEdit={(task) => {
            setEditingTask(task);
            setTaskFormOpen(true);
          }}
          onDelete={(task) => deleteTaskMutation.mutate(task.id)}
          emptyText={
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              styles={{ image: { height: 48 } }}
              description={
                canAddTask ? '这个项目还没有任务，点「新增任务」加一条。' : '这个项目还没有任务。'
              }
            >
              {canAddTask ? (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditingTask(null);
                    setTaskFormOpen(true);
                  }}
                >
                  新增任务
                </Button>
              ) : null}
            </Empty>
          }
        />
      </Card>

      <TaskFormModal
        open={taskFormOpen}
        mode={editingTask ? 'edit' : 'create'}
        task={editingTask}
        defaultProjectId={project?.id ?? null}
        showProjectField={false}
        onClose={() => {
          setTaskFormOpen(false);
          setEditingTask(null);
        }}
      />

      <ProjectFormModal
        open={projectFormOpen}
        mode="edit"
        project={project}
        onClose={() => setProjectFormOpen(false)}
      />
    </div>
  );
}
