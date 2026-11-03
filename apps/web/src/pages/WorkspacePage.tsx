import { WorkspaceEditor } from '../components/workspace/WorkspaceEditor';

/**
 * 工作台页 —— pages.md §2 `/workspace`。
 * 全部角色可见；数据源是 GET /api/workspace。
 */
export function WorkspacePage() {
  return <WorkspaceEditor mode="workspace" />;
}
