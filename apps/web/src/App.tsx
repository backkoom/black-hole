import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { SettingsLayout } from './components/SettingsLayout';
import { RequireAdmin, RequireAuth } from './auth/RequireAuth';
import { ChangePasswordPage } from './pages/ChangePassword';
import { ForbiddenPage } from './pages/Forbidden';
import { LoginPage } from './pages/Login';
import { NotFoundPage } from './pages/NotFound';
import { OrgPage } from './pages/OrgPage';
import { Placeholder } from './pages/Placeholder';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TasksPage } from './pages/TasksPage';
import { UsersPage } from './pages/UsersPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { WorkspaceTemplatePage } from './pages/WorkspaceTemplatePage';

/**
 * 路由表 —— 页面清单固定 10 个路由（pages.md §页面清单）。
 * Phase 2 起 /settings/org（组织架构）与 /settings/users（账号管理）是真实页面；
 * Phase 3 起 /workspace（工作台）与 /settings/workspace-template（工作台模板）也是真实页面；
 * Phase 4 起 /tasks、/projects、/projects/:id（任务与项目管理）也是真实页面。
 * 另加 /403 与 /404 两个全局错误页。
 *
 * 守卫：
 * - RequireAuth：未登录跳 /login（记住原路由），mustChangePassword 时强制跳 /settings/password；
 * - RequireAdmin：普通用户访问管理路由显示 403。
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/403', element: <ForbiddenPage /> },
  { path: '/404', element: <NotFoundPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/workspace" replace /> },
          {
            path: 'workspace',
            element: <WorkspacePage />,
          },
          {
            path: 'tasks',
            element: <TasksPage />,
          },
          {
            path: 'projects',
            element: <ProjectsPage />,
          },
          {
            path: 'projects/:id',
            element: <ProjectDetailPage />,
          },
          {
            element: <SettingsLayout />,
            children: [
              {
                path: 'settings/profile',
                element: <Placeholder title="个人资料" subtitle="姓名与所属组织信息正在迭代。" />,
              },
              { path: 'settings/password', element: <ChangePasswordPage /> },
              {
                path: 'settings/users',
                element: (
                  <RequireAdmin>
                    <UsersPage />
                  </RequireAdmin>
                ),
              },
              {
                path: 'settings/org',
                element: (
                  <RequireAdmin>
                    <OrgPage />
                  </RequireAdmin>
                ),
              },
              {
                path: 'settings/workspace-template',
                element: (
                  <RequireAdmin>
                    <WorkspaceTemplatePage />
                  </RequireAdmin>
                ),
              },
            ],
          },
        ],
      },
    ],
  },
  // 未知路径一律显示 404（不要求登录，也不泄露路由是否存在）
  { path: '*', element: <NotFoundPage /> },
]);
