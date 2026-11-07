import { useMemo } from 'react';
import { Avatar, Button, Dropdown, Popconfirm, Table, Tooltip } from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteOutlined, EditOutlined, MoreOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { Task, TaskStatus } from '@blackhole/shared/types';
import { formatDateOnly, formatDateTime } from '../../utils/datetime';
import { STATUS_TONE, ToneTag } from '../ui';
import { categoryTone } from '../user/visuals';

/**
 * 任务清单表格（老六最终用户端界面 · 图3）。
 *
 * 列：☐ | 任务名称（挂子任务计数角标）| 所属项目 | 负责人（圆形头像 + 姓名）|
 *    优先级 | 状态 | 截止日期 | 分类 | 提醒 | 操作（⋯）
 *
 * 口径：
 * - 优先级 / 状态 / 分类 都是彩色小标签（ToneTag）；
 * - 子任务计数用接口返回的 subtaskCount（服务端按 parent_id 实时算）；
 * - 提醒列显示 reminderAt（接口返回的时间戳，按 Asia/Shanghai 展示）；
 * - 状态标签可点击改状态（PATCH /api/tasks/:id/status）。
 */

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '待处理',
  doing: '进行中',
  done: '已完成',
};

const PRIORITY_LABEL: Record<Task['priority'], string> = {
  high: '高',
  medium: '中',
  low: '低',
};

interface TaskListTableProps {
  tasks: Task[];
  loading: boolean;
  /** 行内改状态 */
  onStatusChange: (task: Task, next: TaskStatus) => void;
  /** 正在改状态的任务 id */
  statusPendingId?: number | null;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  /** 空状态内容 */
  emptyText?: ReactNode;
  /** 行选择 */
  rowSelection?: React.ComponentProps<typeof Table<Task>>['rowSelection'];
  /** 分页配置 */
  pagination?: React.ComponentProps<typeof Table<Task>>['pagination'];
}

export function TaskListTable({
  tasks,
  loading,
  onStatusChange,
  statusPendingId,
  onEdit,
  onDelete,
  emptyText,
  rowSelection,
  pagination,
}: TaskListTableProps) {
  const columns = useMemo<TableColumnsType<Task>>(
    () => [
      {
        title: '任务名称',
        dataIndex: 'title',
        ellipsis: true,
        width: 200,
        render: (value: string, row: Task) => (
          <div>
            <span style={{ fontWeight: 600 }}>{value}</span>
            {row.subtaskCount > 0 ? (
              <Tooltip title={`${row.subtaskCount} 个子任务`}>
                <span
                  style={{
                    display: 'inline-block',
                    marginLeft: 6,
                    padding: '0 6px',
                    borderRadius: 6,
                    background: '#eef3ff',
                    color: '#2563eb',
                    fontSize: 11,
                    lineHeight: '16px',
                  }}
                >
                  {row.subtaskCount} 子任务
                </span>
              </Tooltip>
            ) : null}
          </div>
        ),
      },
      {
        title: '所属项目',
        dataIndex: 'projectName',
        width: 118,
        ellipsis: true,
        render: (value: string | null) =>
          value ? <span>{value}</span> : <span className="wb-muted">未归属项目</span>,
      },
      {
        title: '负责人',
        dataIndex: 'assigneeName',
        width: 108,
        render: (value: string | null) =>
          value ? (
            <span className="wb-owner-cell">
              <Avatar size={24} style={{ background: '#dbe4f5', color: '#2563eb', fontSize: 11 }}>
                {value.slice(0, 1)}
              </Avatar>
              <span className="wb-owner-name">{value}</span>
            </span>
          ) : (
            <span className="wb-muted">未指派</span>
          ),
      },
      {
        title: '优先级',
        dataIndex: 'priority',
        width: 74,
        render: (value: Task['priority']) => (
          <ToneTag tone={STATUS_TONE[value] ?? 'gray'}>{PRIORITY_LABEL[value]}</ToneTag>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 82,
        render: (value: TaskStatus, row: Task) => (
          <Tooltip title="点击修改状态">
            <span
              role="button"
              tabIndex={0}
              aria-label={`修改状态，当前${STATUS_LABEL[value]}`}
              style={{ cursor: 'pointer', opacity: statusPendingId === row.id ? 0.5 : 1 }}
              onClick={() =>
                onStatusChange(row, value === 'done' ? 'doing' : value === 'doing' ? 'done' : 'doing')
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onStatusChange(row, value === 'done' ? 'doing' : 'doing');
                }
              }}
            >
              <ToneTag tone={STATUS_TONE[value] ?? 'gray'}>{STATUS_LABEL[value]}</ToneTag>
            </span>
          </Tooltip>
        ),
      },
      {
        title: '截止日期',
        dataIndex: 'dueDate',
        width: 92,
        render: (value: string | null) => <span>{formatDateOnly(value)}</span>,
      },
      {
        title: '分类',
        dataIndex: 'category',
        width: 86,
        render: (value: string | null) =>
          value ? <ToneTag tone={categoryTone(value)}>{value}</ToneTag> : <span className="wb-muted">—</span>,
      },
      {
        title: '提醒',
        dataIndex: 'reminderAt',
        width: 112,
        render: (value: string | null) =>
          value ? <span>{formatDateTime(value)}</span> : <span className="wb-muted">—</span>,
      },
      {
        title: '操作',
        key: 'actions',
        fixed: 'right',
        width: 48,
        render: (_value: unknown, row: Task) => (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'edit', icon: <EditOutlined />, label: '编辑' },
                { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'edit') onEdit(row);
                else onDelete(row);
              },
            }}
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              aria-label={`${row.title} 的更多操作`}
              onClick={(event) => event.stopPropagation()}
            />
          </Dropdown>
        ),
      },
    ],
    [onStatusChange, onEdit, onDelete, statusPendingId],
  );

  return (
    <Table<Task>
      className="wb-table"
      size="small"
      rowKey="id"
      loading={loading}
      columns={columns}
      dataSource={tasks}
      rowSelection={rowSelection}
      scroll={{ x: 960 }}
      locale={emptyText ? { emptyText } : undefined}
      pagination={pagination}
    />
  );
}

/** 删除任务的二次确认（软删，服务端保留历史） */
export function TaskDeleteConfirm({
  task,
  onDelete,
}: {
  task: Task;
  onDelete: (task: Task) => void;
}) {
  return (
    <Popconfirm
      title={`删除任务「${task.title}」？`}
      description="删除后不再计入列表、统计与项目进度"
      okText="删除"
      cancelText="取消"
      onConfirm={() => onDelete(task)}
    >
      <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`删除 ${task.title}`} />
    </Popconfirm>
  );
}
