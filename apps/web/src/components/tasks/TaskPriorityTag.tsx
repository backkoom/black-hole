import { Tag } from 'antd';
import type { Priority } from '@workbench/shared/types';

/**
 * 优先级标签 —— pages.md §3 表格的「优先级」列。
 *
 * 颜色不是唯一状态表达：标签里始终带中文文字（高 / 中 / 低）。
 */

export const TASK_PRIORITY_LABEL: Record<Priority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

const PRIORITY_COLOR: Record<Priority, string> = {
  high: 'error',
  medium: 'warning',
  low: 'default',
};

export function TaskPriorityTag({ priority }: { priority: Priority }) {
  return <Tag color={PRIORITY_COLOR[priority]}>{TASK_PRIORITY_LABEL[priority]}</Tag>;
}
