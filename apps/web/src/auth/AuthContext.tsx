import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ERROR_CODES } from '@workbench/shared/errors';
import type { User } from '@workbench/shared/types';
import { apiGet, apiPost, ApiError } from '../api/client';

/**
 * 会话状态 —— react-query 查询 GET /api/auth/me。
 * 未登录时接口返回 401，这里转成「无用户」而不是错误态，避免每次进站都报错。
 */

export interface AuthState {
  /** 当前登录用户；未登录为 null */
  user: User | null;
  /** 会话检查中（首屏等待 /api/auth/me） */
  isLoading: boolean;
  /** 会话检查失败（网络异常或 5xx），与「未登录」区分开 */
  isError: boolean;
  /** 管理员角色（决定是否展示管理导航） */
  isAdmin: boolean;
  /** 是否必须先改初始密码 */
  mustChangePassword: boolean;
  /** 登录：成功后写入会话态 */
  login: (account: string, password: string) => Promise<User>;
  /** 退出：清掉本地会话态 */
  logout: () => Promise<void>;
  /** 重新拉取当前用户（改密后刷新 mustChangePassword） */
  refresh: () => Promise<void>;
  /**
   * 改密成功后同步把本地会话态的 mustChangePassword 置为 false。
   * 必须同步更新：否则守卫会读到改密前的旧值，把刚改完密码的用户又弹回改密页。
   */
  applyPasswordChanged: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const ME_QUERY_KEY = ['auth', 'me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<User | null> => {
      try {
        const data = await apiGet<{ user: User }>('/auth/me');
        return data.user;
      } catch (err) {
        // 401 = 未登录，属于正常分支
        if (err instanceof ApiError && err.status === ERROR_CODES.UNAUTHORIZED) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const login = useCallback(
    async (account: string, password: string): Promise<User> => {
      const data = await apiPost<{ user: User }>('/auth/login', { account, password });
      queryClient.setQueryData(ME_QUERY_KEY, data.user);
      return data.user;
    },
    [queryClient],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiPost<null>('/auth/logout');
    } finally {
      // 无论接口成功与否，本地会话态都要清掉
      queryClient.setQueryData(ME_QUERY_KEY, null);
    }
  }, [queryClient]);

  const refresh = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  }, [queryClient]);

  const applyPasswordChanged = useCallback((): void => {
    queryClient.setQueryData(ME_QUERY_KEY, (prev: User | null | undefined) =>
      prev ? { ...prev, mustChangePassword: false } : prev,
    );
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({
      user: meQuery.data ?? null,
      isLoading: meQuery.isPending,
      isError: meQuery.isError,
      isAdmin: meQuery.data?.role === 'admin',
      mustChangePassword: meQuery.data?.mustChangePassword ?? false,
      login,
      logout,
      refresh,
      applyPasswordChanged,
    }),
    [meQuery.data, meQuery.isPending, meQuery.isError, login, logout, refresh, applyPasswordChanged],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
