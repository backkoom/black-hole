import {
  BulbOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  FolderOutlined,
  ProjectOutlined,
  RocketOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { designVars } from '../../styles/theme';
import type { TagTone } from '../ui';

/**
 * 用户端配色与图标映射 —— 项目卡片 / 任务分类都用它。
 *
 * 口径：
 * - 项目自带 color（HEX 或颜色名）就用自带的；没设置时按序号取四色（蓝绿橙紫），
 *   **只是展示层的兜底配色，不是造数据**；
 * - 分类标签的色调由分类名稳定散列得到，同一个分类每次进来颜色一致。
 */

/** 四色兜底色板（与设计稿的蓝 / 绿 / 橙 / 紫一致） */
export const FALLBACK_PALETTE = [
  designVars.primary,
  designVars.green,
  designVars.orange,
  designVars.purple,
];

/** 项目主题色：自带 color 优先，否则按序号取色板 */
export function projectColor(color: string | null | undefined, index: number): string {
  const value = (color ?? '').trim();
  if (value) return value;
  return FALLBACK_PALETTE[index % FALLBACK_PALETTE.length] ?? designVars.primary;
}

/** 项目图标：按 icon 标识取；未设置或未知时用默认的项目图标 */
export function projectIcon(icon: string | null | undefined): ReactNode {
  switch ((icon ?? '').trim()) {
    case 'calendar':
      return <CalendarOutlined />;
    case 'task':
    case 'check':
      return <CheckSquareOutlined />;
    case 'folder':
      return <FolderOutlined />;
    case 'team':
      return <TeamOutlined />;
    case 'idea':
    case 'bulb':
      return <BulbOutlined />;
    case 'rocket':
      return <RocketOutlined />;
    default:
      return <ProjectOutlined />;
  }
}

/** 分类标签色调：同一个分类名永远得到同一个色调 */
const CATEGORY_TONES: TagTone[] = ['blue', 'green', 'orange', 'purple', 'red'];

export function categoryTone(category: string | null | undefined): TagTone {
  const value = (category ?? '').trim();
  if (!value) return 'gray';
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return CATEGORY_TONES[hash % CATEGORY_TONES.length] ?? 'gray';
}
