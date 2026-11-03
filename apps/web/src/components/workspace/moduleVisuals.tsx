import type { ReactNode } from 'react';
import {
  AppstoreOutlined,
  BarChartOutlined,
  BulbOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  CodeOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  LinkOutlined,
  NotificationOutlined,
  PaperClipOutlined,
  PartitionOutlined,
  PictureOutlined,
  ProjectOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { designVars } from '../../styles/theme';

/**
 * 模块图标与配色 —— 前端展示层映射。
 *
 * 模块本身的名字、分类、尺寸、emptyState 等一律来自 @workbench/shared/modules，
 * 这里只补「用哪个图标、什么底色」这种纯展示信息（shared 里没有这两个字段）。
 * 配色取 AntD token 对应的 designVars，不另写一套色板。
 */

export interface ModuleVisual {
  icon: ReactNode;
  color: string;
}

export const MODULE_VISUALS: Record<string, ModuleVisual> = {
  todo: { icon: <CheckSquareOutlined />, color: designVars.red },
  'project-progress': { icon: <ProjectOutlined />, color: designVars.primary },
  'quick-entry': { icon: <AppstoreOutlined />, color: designVars.orange },
  calendar: { icon: <CalendarOutlined />, color: designVars.green },
  'data-chart': { icon: <BarChartOutlined />, color: designVars.purple },
  idea: { icon: <BulbOutlined />, color: designVars.orange },
  text: { icon: <FileTextOutlined />, color: designVars.text2 },
  notice: { icon: <NotificationOutlined />, color: designVars.red },
  links: { icon: <LinkOutlined />, color: designVars.purple },
  embed: { icon: <CodeOutlined />, color: designVars.primary },
  gallery: { icon: <PictureOutlined />, color: designVars.green },
  divider: { icon: <PartitionOutlined />, color: designVars.muted },
  file: { icon: <PaperClipOutlined />, color: designVars.primary },
  'knowledge-list': { icon: <FileSearchOutlined />, color: designVars.purple },
  ai: { icon: <RobotOutlined />, color: designVars.purple },
};

/** 取模块的图标与配色；未知模块回落到中性色 */
export function moduleVisual(key: string): ModuleVisual {
  return MODULE_VISUALS[key] ?? { icon: <PartitionOutlined />, color: designVars.muted };
}
