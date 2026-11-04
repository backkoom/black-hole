import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { SettingsLayout } from './components/SettingsLayout';
import { RequireAdmin, RequireAuth } from './auth/RequireAuth';
import { ChangePasswordPage } from './pages/ChangePassword';
import { ForbiddenPage } from './pages/Forbidden';
import { LoginPage } from './pages/Login';
import { NotFoundPage } from './pages/NotFound';
import { OrgPage } from './pages/OrgPage';
import { OverviewPage } from './pages/OverviewPage';
import { Placeholder } from './pages/Placeholder';
import { KanbanPage } from './pages/KanbanPage';
import { ProgressPage } from './pages/ProgressPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { CalendarPage } from './pages/CalendarPage';
import { RisksPage } from './pages/RisksPage';
import { FilesPage } from './pages/FilesPage';
import { TeamPage } from './pages/TeamPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TasksPage } from './pages/TasksPage';
import { UsersPage } from './pages/UsersPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { WorkspaceTemplatePage } from './pages/WorkspaceTemplatePage';

/**
 * 路由表 —— 用户端 10 个页面 + 管理员功能页。
 *
 * 用户端（左侧导航 10 项）：
 *   /            项目总览
 *   /kanban      项目看板
 *   /tasks       任务清单
 *   /calendar    日程安排
 *   /progress    进度追踪
 *   /team        团队协作
 *   /files       文件资料
 *   /risks       风险问题
 *   /analytics   数据统计
 *   /settings/*  设置（个人资料 / 修改密码 / 账号管理 / 组织架构 / 工作台模板）
 *
 * 管理员与高级功能（保留原有实现）：
 *   /workspace        工作台
 *   /projects         项目管理
 *   /projects/:id     项目详情
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
          { index: true, element: <OverviewPage /> },
          {
            path: 'kanban',
            element: (
              <KanbanPage />
            ),
          },
          { path: 'tasks', element: <TasksPage /> },
          {
            path: 'calendar',
            element: (
              <CalendarPage />
            ),
          },
          {
            path: 'progress',
            element: (
              <ProgressPage />
            ),
          },
          {
            path: 'team',
            element: (
              <TeamPage />
            ),
          },
          {
            path: 'files',
            element: (
              <FilesPage />
            ),
          },
          {
            path: 'risks',
            element: (
              <RisksPage />
            ),
          },
          {
            path: 'analytics',
            element: (
              <AnalyticsPage />
            ),
          },
          {
            path: 'workspace',
            element: <WorkspacePage />,
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
