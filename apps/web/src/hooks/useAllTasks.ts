import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Task } from '@blackhole/shared/types';
import { listTasks } from '../api/tasks';

/**
 * 全量任务列表 —— 按服务端分页逐页取回。
 *
 * 为什么不用 `useUserTasks`：那个 hook 只取第一页（pageSize 上限 100），
 * 用来做「每天新增/完成」的粗粒度趋势够用；但「进度偏差分析」要用
 * **每个任务的 doneAt 回溯历史完成率**，缺页会让实际进度被系统性低估，
 * 所以这里把列表按页取全。
 *
 * 口径与列表页一致：普通用户只看自己，管理员看全员（服务端按角色决定）。
 * 最多取 50 页（5000 条），超过则按已取到的部分计算（真实数据，不补造）。
 */

/** 单页条数（服务端 pageSize 上限 100） */
const PAGE_SIZE = 100;
/** 最多翻多少页 —— 防止极端数据下无限翻页 */
const MAX_PAGES = 50;

export function useAllTasks(): UseQueryResult<Task[]> {
  return useQuery({
    queryKey: ['user', 'tasks', 'all-pages'],
    queryFn: async (): Promise<Task[]> => {
      const items: Task[] = [];
      let page = 1;
      let total = 0;
      do {
        const data = await listTasks({ page, pageSize: PAGE_SIZE });
        items.push(...data.items);
        total = data.total;
        page += 1;
        if (items.length >= total) break;
      } while (page <= MAX_PAGES);
      return items;
    },
    staleTime: 30_000,
  });
}
