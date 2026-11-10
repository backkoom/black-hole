import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { SettingsLayout } from './components/SettingsLayout';
import { RequireAdmin, RequireAuth } from './auth/RequireAuth';
import { ChangePasswordPage } from './pages/ChangePassword';
import { ForbiddenPage } from './pages/Forbidden';
import { LoginPage } from './pages/Login';
import { NotFoundPage } from './pages/NotFound';
import { OrgPage } from './pages/OrgPage';
import { OverviewPage } from './pages/OverviewPage';
import { ProfilePage } from './pages/ProfilePage';
import { CalendarPage } from './pages/CalendarPage';
import { FilesPage } from './pages/FilesPage';
import { TeamPage } from './pages/TeamPage';
import { SystemSettingsPage } from './pages/SystemSettingsPage';
import { ProjectsShell } from './pages/ProjectsShell';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
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
          // D-23：看板 / 任务 / 进度 / 风险收进「项目管理」模块，
          // 旧路径保留重定向，书签与外部链接不会 404
          { path: 'kanban', element: <Navigate to="/projects?view=board" replace /> },
          { path: 'tasks', element: <Navigate to="/projects?view=tasks" replace /> },
          {
            path: 'calendar',
            element: (
              <CalendarPage />
            ),
          },
          { path: 'progress', element: <Navigate to="/projects?view=progress" replace /> },
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
          { path: 'risks', element: <Navigate to="/projects?view=risks" replace /> },
          // D-24：数据统计并入工作台，独立入口取消；老链接回工作台
          { path: 'analytics', element: <Navigate to="/projects?view=stats" replace /> },
          {
            path: 'workspace',
            element: <WorkspacePage />,
          },
          {
            path: 'projects/:id',
            element: <ProjectDetailPage />,
          },
          {
            // 项目管理模块：?view=projects|board|tasks|progress|risks
            path: 'projects',
            element: <ProjectsShell />,
          },
          // 直达 /settings 时落到个人资料。之前「设置」的菜单 key 写的是
          // /settings/password —— 点设置进"改密码"，不符合常理。
          { path: 'settings', element: <Navigate to="/settings/profile" replace /> },
          {
            element: <SettingsLayout />,
            children: [
              {
                path: 'settings/profile',
                element: <ProfilePage />,
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
                // 2026-11-08：备份 / 文件存储 / 证书（D-22）
                path: 'settings/system',
                element: (
                  <RequireAdmin>
                    <SystemSettingsPage />
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
