import { useQuery } from '@tanstack/react-query';
import type { Paged, Project, Task, User, UserListItem } from '@blackhole/shared/types';
import { listProjects } from '../api/projects';
import { listTasks } from '../api/tasks';
import { listUsers } from '../api/users';

/**
 * 用户端页面共用的数据查询 —— 全部走真实接口，不造数据。
 *
 * 口径：
 * - projects：管理员看全员（服务端 userId 可选），普通用户只看自己；
 * - tasks：同上；
 * - users：负责人下拉用。GET /api/users 只有管理员能看全员，
 *   普通用户会拿到 403 —— 这时降级成「只有自己」（用 /auth/me 的身份信息），
 *   再拿不到就降级成空候选（页面照常可用）。
 */

/** 项目列表（不分页，用于总览页与筛选下拉） */
export function useUserProjects() {
  return useQuery({
    queryKey: ['user', 'projects'],
    queryFn: async (): Promise<Paged<Project>> => listProjects({ page: 1, pageSize: 100 }),
    staleTime: 30_000,
  });
}

/** 任务全量列表（用于总览页的折线趋势聚合） */
export function useUserTasks() {
  return useQuery({
    queryKey: ['user', 'tasks', 'all'],
    queryFn: async (): Promise<Paged<Task>> => listTasks({ page: 1, pageSize: 100 }),
    staleTime: 30_000,
  });
}

/**
 * 负责人候选项 —— GET /api/users。
 *
 * 管理员能看全员；普通用户调这个接口是 403，
 * 这时降级成「只有自己」（当前登录用户，来自 /auth/me），再失败就返回空列表。
 */
export function useAssigneeOptions(currentUser?: User | null) {
  return useQuery({
    queryKey: ['user', 'assignees', currentUser?.id ?? 0],
    queryFn: async (): Promise<UserListItem[]> => {
      try {
        const data = await listUsers({ page: 1, pageSize: 100 });
        return data.items;
      } catch {
        // 普通用户没有账号列表权限：降级成「只有自己」
        if (!currentUser) return [];
        return [
          {
            id: currentUser.id,
            account: currentUser.account,
            name: currentUser.name,
            role: currentUser.role,
            isSuper: currentUser.isSuper,
            orgId: currentUser.orgId,
            org: currentUser.org,
            mustChangePassword: currentUser.mustChangePassword,
            status: 'active',
            lastLoginAt: null,
          },
        ];
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}
