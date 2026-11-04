import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Task, TaskStatus } from '@workbench/shared/types';
import { listTasks } from '../api/tasks';
import { useUserProjects } from './useUserData';

/**
 * 任务状态计数 —— 全部用 GET /api/tasks 的服务端计数（total 字段）。
 *
 * 为什么不直接用 GET /api/stats/tasks：
 * stats 接口对管理员只统计**自己**的任务，而任务列表页对管理员显示**全员**任务，
 * 两边口径不一致，卡片数字就会和下面的表格对不上。
 * 这里统一走列表接口的 total —— 口径与表格完全一致。
 */
export interface TaskCounts {
  total: number;
  doing: number;
  todo: number;
  done: number;
}

export function useTaskCounts(): { counts: TaskCounts; query: UseQueryResult<TaskCounts> } {
  const query = useQuery({
    queryKey: ['user', 'task-counts'],
    queryFn: async (): Promise<TaskCounts> => {
      // pageSize=1 即可拿到服务端算好的 total，不用把列表拉回来
      const [all, doing, todo, done] = await Promise.all([
        listTasks({ page: 1, pageSize: 1 }),
        listTasks({ page: 1, pageSize: 1, status: 'doing' }),
        listTasks({ page: 1, pageSize: 1, status: 'todo' }),
        listTasks({ page: 1, pageSize: 1, status: 'done' }),
      ]);
      return {
        total: all.total,
        doing: doing.total,
        todo: todo.total,
        done: done.total,
      };
    },
    staleTime: 30_000,
  });

  return {
    counts: query.data ?? { total: 0, doing: 0, todo: 0, done: 0 },
    query,
  };
}

/**
 * 今日任务 —— GET /api/tasks?due=today（服务端按 Asia/Shanghai 判定今天）。
 * 用服务端筛选而不是前端过滤，避免任务数超过一页时漏数据。
 */
export function useTodayTasks() {
  return useQuery({
    queryKey: ['user', 'tasks', 'today'],
    queryFn: async (): Promise<Task[]> => {
      const data = await listTasks({ page: 1, pageSize: 50, due: 'today' });
      return data.items;
    },
    staleTime: 30_000,
  });
}

/** 项目计数（总数 + 进行中），与项目列表同一口径 */
export function useProjectCounts() {
  const projectsQuery = useUserProjects();
  const projects = projectsQuery.data?.items ?? [];
  return {
    total: projectsQuery.data?.total ?? 0,
    active: projects.filter((project) => project.status === 'active').length,
  };
}

/** 任务状态对应的中文 */
export const TASK_STATUS_TEXT: Record<TaskStatus, string> = {
  todo: '待处理',
  doing: '进行中',
  done: '已完成',
};
