import { Tag } from 'antd';
import type { ProjectStatus } from '@blackhole/shared/types';

/**
 * 项目状态标签 —— 进行中 / 已完成（pages.md §4「状态标签」）。
 * 颜色不是唯一状态表达：文字始终在标签里。
 */

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: '进行中',
  done: '已完成',
};

const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  active: 'processing',
  done: 'success',
};

export function ProjectStatusTag({ status }: { status: ProjectStatus }) {
  return <Tag color={PROJECT_STATUS_COLOR[status]}>{PROJECT_STATUS_LABEL[status]}</Tag>;
}
