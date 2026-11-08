import { useState } from 'react';
import { App as AntdApp, Avatar, Button, Card, Empty, Modal, Popconfirm, Select, Skeleton, Space, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { Task, TaskStatus } from '@blackhole/shared/types';
import {
  deleteProject,
  getProjectDetail,
  listMemberCandidates,
  listProjectMembers,
  projectsKeys,
  setProjectMembers,
} from '../api/projects';
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
  /** 成员管理弹窗（D-30） */
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberIds, setMemberIds] = useState<number[]>([]);

  const detailQuery = useQuery({
    queryKey: projectsKeys.detail(projectId),
    queryFn: () => getProjectDetail(projectId),
    enabled: validId,
  });

  const project = detailQuery.data?.project ?? null;
  const tasks = detailQuery.data?.tasks ?? [];

  /** 成员列表：归属人 + 协作者；只有归属人或管理员能改 */
  const membersQuery = useQuery({
    queryKey: ['projects', 'members', projectId],
    queryFn: () => listProjectMembers(projectId),
    enabled: validId,
  });
  const members = membersQuery.data ?? [];
  const canManageMembers =
    project !== null && user !== null && (project.userId === user.id || user.role === 'admin');

  const candidatesQuery = useQuery({
    queryKey: ['projects', 'member-candidates'],
    queryFn: listMemberCandidates,
    enabled: memberOpen,
    staleTime: 60_000,
  });

  const saveMembersMutation = useMutation({
    mutationFn: (ids: number[]) => setProjectMembers(projectId, ids),
    onSuccess: async (items) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      setMemberOpen(false);
      void message.success(`成员已更新（${items.length} 人）`);
    },
    onError: (err) => void message.error(errorText(err)),
  });

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

      <Card className="wb-card-flat">
        <div className="wb-section-title wb-section-title-row">
          <span>
            <TeamOutlined /> 项目成员
            <span className="wb-muted" style={{ marginLeft: 8, fontWeight: 400 }}>
              共 {members.length} 人
            </span>
          </span>
          {canManageMembers ? (
            <Button
              size="small"
              onClick={() => {
                setMemberIds(
                  members.filter((m) => !m.isOwner).map((m) => m.userId),
                );
                setMemberOpen(true);
              }}
            >
              管理成员
            </Button>
          ) : null}
        </div>
        {members.length === 0 ? (
          <span className="wb-muted">还没有成员</span>
        ) : (
          <div className="wb-member-chips">
            {members.map((member) => (
              <Tooltip
                key={member.userId}
                title={`${member.name}（${member.account}）${member.isOwner ? ' · 归属人' : ''}`}
              >
                <span className="wb-member-chip">
                  <Avatar size={22} style={{ background: member.isOwner ? '#2563eb' : '#dbe4f5', color: member.isOwner ? '#fff' : '#2563eb', fontSize: 11 }}>
                    {member.name.slice(0, 1)}
                  </Avatar>
                  <span className="wb-member-chip-name">{member.name}</span>
                  {member.isOwner ? <span className="wb-member-owner">归属人</span> : null}
                </span>
              </Tooltip>
            ))}
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

      <Modal
        title="管理项目成员"
        open={memberOpen}
        okText="保存"
        cancelText="取消"
        confirmLoading={saveMembersMutation.isPending}
        onOk={() => saveMembersMutation.mutate(memberIds)}
        onCancel={() => setMemberOpen(false)}
        destroyOnClose
      >
        <p className="wb-muted" style={{ marginTop: 0, fontSize: 12 }}>
          成员能看到这个项目及其进度；归属人{project?.owner ? `（${project.owner}）` : ''}始终可见，不用勾选。
        </p>
        <Select
          mode="multiple"
          allowClear
          style={{ width: '100%' }}
          placeholder="选择协作者"
          loading={candidatesQuery.isPending}
          value={memberIds}
          onChange={(value: number[]) => setMemberIds(value)}
          optionFilterProp="label"
          options={(candidatesQuery.data ?? [])
            .filter((candidate) => candidate.userId !== project?.userId)
            .map((candidate) => ({
              value: candidate.userId,
              label: `${candidate.name}（${candidate.account}）`,
            }))}
        />
      </Modal>
    </div>
  );
}
