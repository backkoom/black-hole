import { Button, Popconfirm, Space, Table } from 'antd';
import type { TableColumnsType, TableProps } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { Task, TaskStatus } from '@workbench/shared/types';
import { formatDateOnly, formatDateTime } from '../../utils/datetime';
import { TaskPriorityTag } from './TaskPriorityTag';
import { TaskStatusTag } from './TaskStatusTag';

/**
 * 任务表格 —— pages.md §3 的 Table 与 §5「复用任务管理的行组件，不另写一套」。
 *
 * 任务管理页与项目详情页共用这一个组件，行语义完全一致：
 * - 状态标签行内改状态（PATCH /api/tasks/:id/status）；
 * - 操作列固定在右侧：编辑 / 删除（Popconfirm 二次确认，软删）；
 * - done 的任务在行内显示完成时间（执行包 §8.5）。
 */

interface TaskTableProps {
  tasks: Task[];
  loading: boolean;
  /** 是否显示「所属项目」列（任务管理页显示，项目详情页不显示） */
  showProjectColumn?: boolean;
  /** 行内改状态 */
  onStatusChange: (task: Task, next: TaskStatus) => void;
  /** 正在改状态的任务 id */
  statusPendingId?: number | null;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  /** 分页配置；不传则不显示分页 */
  pagination?: TableProps<Task>['pagination'];
  /** 空状态内容 */
  emptyText?: ReactNode;
}

export function TaskTable({
  tasks,
  loading,
  showProjectColumn = false,
  onStatusChange,
  statusPendingId,
  onEdit,
  onDelete,
  pagination,
  emptyText,
}: TaskTableProps) {
  const columns: TableColumnsType<Task> = [
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (value: string) => <span style={{ fontWeight: 600 }}>{value}</span>,
    },
    ...(showProjectColumn
      ? [
          {
            title: '所属项目',
            dataIndex: 'projectName',
            width: 160,
            render: (value: string | null) =>
              value ? <span>{value}</span> : <span className="wb-muted">未归属项目</span>,
          },
        ]
      : []),
    {
      title: '状态',
      dataIndex: 'status',
      width: 150,
      render: (_value: TaskStatus, row: Task) => (
        <div className="wb-task-status-cell">
          <TaskStatusTag
            status={row.status}
            pending={statusPendingId === row.id}
            onChange={(next) => onStatusChange(row, next)}
          />
          {row.status === 'done' && row.doneAt ? (
            <span className="wb-muted">完成于 {formatDateTime(row.doneAt)}</span>
          ) : null}
        </div>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 90,
      render: (_value: Task['priority'], row: Task) => <TaskPriorityTag priority={row.priority} />,
    },
    {
      title: '到期日',
      dataIndex: 'dueDate',
      width: 120,
      render: (value: string | null) => <span>{formatDateOnly(value)}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 150,
      render: (_value: unknown, row: Task) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            aria-label={`编辑任务 ${row.title}`}
            onClick={() => onEdit(row)}
          >
            编辑
          </Button>
          <Popconfirm
            title={`删除任务「${row.title}」？`}
            description="删除后不再计入列表、统计与项目进度"
            okText="删除"
            cancelText="取消"
            onConfirm={() => onDelete(row)}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              aria-label={`删除任务 ${row.title}`}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Table<Task>
      className="wb-table"
      size="small"
      rowKey="id"
      loading={loading}
      columns={columns}
      dataSource={tasks}
      scroll={{ x: 'max-content' }}
      locale={emptyText ? { emptyText } : undefined}
      pagination={pagination}
    />
  );
}
