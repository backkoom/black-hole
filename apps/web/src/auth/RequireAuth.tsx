import type { ReactNode } from 'react';
import { Button, Result, Skeleton } from 'antd';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ForbiddenPage } from '../pages/Forbidden';

/**
 * 受保护路由守卫。
 * - 未登录 → 跳 /login，并把原路径记在 location.state.from，登录成功后回跳；
 * - 已登录但 mustChangePassword → 强制跳 /settings/password（除改密页与退出外一律拦住）。
 */
export function RequireAuth() {
  const { user, isLoading, isError, refresh } = useAuth();
  const location = useLocation();

  // 首次加载骨架屏
  if (isLoading) {
    return (
      <div className="wb-page">
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  // 会话检查失败（非 401）：顶部提示 + 重试
  if (isError) {
    return (
      <div className="wb-page">
        <Result
          status="error"
          title="加载失败"
          subTitle="无法获取登录状态，请检查网络后重试。"
          extra={
            <Button type="primary" onClick={() => void refresh()}>
              重试
            </Button>
          }
        />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (user.mustChangePassword && location.pathname !== '/settings/password') {
    // 强制改密时把原路由一起带过去，改密成功后可以跳回原处
    return (
      <Navigate
        to="/settings/password"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return <Outlet />;
}

/**
 * 管理员专属路由守卫。
 * 普通用户直接访问管理路由 → 显示 403 页面（pages.md §App Shell）。
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <ForbiddenPage />;
  return <>{children}</>;
}
