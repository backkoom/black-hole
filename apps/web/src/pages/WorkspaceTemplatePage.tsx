import { WorkspaceEditor } from '../components/workspace/WorkspaceEditor';

/**
 * 工作台模板页 —— pages.md §10 `/settings/workspace-template`。
 *
 * 与工作台页复用同一个编辑器组件，只把数据源换成 /api/workspace/template；
 * 路由上由 RequireAdmin 守卫，普通用户看到 403 页。
 */
export function WorkspaceTemplatePage() {
  return <WorkspaceEditor mode="template" />;
}
