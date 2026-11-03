import { Dropdown, Tag } from 'antd';
import type { MenuProps } from 'antd';
import type { TaskStatus } from '@workbench/shared/types';

/**
 * 任务状态标签 —— pages.md §3 的 StatusTag（行内改状态）。
 *
 * - 三态：待开始 / 进行中 / 已完成，用标签色区分；
 * - 点击标签弹出菜单选择目标状态，**当前状态也在菜单里**
 *   —— 已完成的任务再点一次「已完成」照样发 PATCH，done_at 由服务端保证不变（v2 §5.2）；
 * - done 状态额外显示完成时间（执行包 §8.5「done 后行内显示完成时间」）。
 */

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '待开始',
  doing: '进行中',
  done: '已完成',
};

/** 标签色：待开始=灰、进行中=主色、已完成=绿 */
const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  todo: 'default',
  doing: 'processing',
  done: 'success',
};

const STATUS_ORDER: TaskStatus[] = ['todo', 'doing', 'done'];

interface TaskStatusTagProps {
  status: TaskStatus;
  /** 行内改状态；不传则只读展示 */
  onChange?: (next: TaskStatus) => void;
  /** 状态变更进行中 */
  pending?: boolean;
}

export function TaskStatusTag({ status, onChange, pending }: TaskStatusTagProps) {
  const label = TASK_STATUS_LABEL[status];

  if (!onChange) {
    return <Tag color={TASK_STATUS_COLOR[status]}>{label}</Tag>;
  }

  const items: MenuProps['items'] = STATUS_ORDER.map((value) => ({
    key: value,
    label: TASK_STATUS_LABEL[value],
  }));

  return (
    <Dropdown
      trigger={['click']}
      disabled={pending}
      menu={{
        items,
        selectedKeys: [status],
        onClick: ({ key }) => onChange(key as TaskStatus),
      }}
    >
      <Tag
        color={TASK_STATUS_COLOR[status]}
        className="wb-status-tag"
        aria-label={`修改任务状态，当前${label}`}
      >
        {label}
      </Tag>
    </Dropdown>
  );
}
