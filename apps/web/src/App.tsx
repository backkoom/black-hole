import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { SettingsLayout } from './components/SettingsLayout';
import { RequireAdmin, RequireAuth } from './auth/RequireAuth';
import { ChangePasswordPage } from './pages/ChangePassword';
import { ForbiddenPage } from './pages/Forbidden';
import { LoginPage } from './pages/Login';
import { NotFoundPage } from './pages/NotFound';
import { Placeholder } from './pages/Placeholder';

/**
 * 路由表 —— 页面清单固定 10 个路由（pages.md §页面清单），Phase 1 未实现的页面指向占位内容。
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
            element: <Placeholder title="我的工作台" subtitle="指标卡、模块编辑器与预览正在迭代。" />,
          },
          {
            path: 'tasks',
            element: <Placeholder title="任务管理" subtitle="任务列表、筛选与状态流转正在迭代。" />,
          },
          {
            path: 'projects',
            element: <Placeholder title="项目管理" subtitle="项目卡片、进度与详情页正在迭代。" />,
          },
          {
            path: 'projects/:id',
            element: <Placeholder title="项目详情" subtitle="项目详情与任务联动正在迭代。" />,
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
                    <Placeholder title="账号管理" subtitle="账号、角色与批量导入正在迭代。" />
                  </RequireAdmin>
                ),
              },
              {
                path: 'settings/org',
                element: (
                  <RequireAdmin>
                    <Placeholder title="组织架构" subtitle="组织树与人员归属正在迭代。" />
                  </RequireAdmin>
                ),
              },
              {
                path: 'settings/workspace-template',
                element: (
                  <RequireAdmin>
                    <Placeholder title="工作台模板" subtitle="默认模板编辑正在迭代。" />
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
