import { useQueryClient } from '@tanstack/react-query';

/**
 * 用户端缓存失效 —— 任务/项目变了以后，把受影响的查询一起刷掉。
 *
 * 受影响的查询键：
 * - ['tasks', ...]           任务列表（tasksKeys.all 是前缀）
 * - ['user', 'tasks', 'all']  总览页的趋势聚合
 * - ['user', 'tasks', 'today'] 总览页的今日任务
 * - ['user', 'task-counts']  两个页面的指标卡 / 环形图
 * - ['user', 'task-categories'] 任务清单页的分类下拉
 * - ['user', 'projects']     项目列表
 * - ['projects', ...]        管理员端的项目列表与详情
 * - ['stats', ...]           统计接口
 */
export async function invalidateUserData(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    queryClient.invalidateQueries({ queryKey: ['user', 'tasks'] }),
    queryClient.invalidateQueries({ queryKey: ['user', 'task-counts'] }),
    queryClient.invalidateQueries({ queryKey: ['user', 'task-categories'] }),
    queryClient.invalidateQueries({ queryKey: ['user', 'projects'] }),
    queryClient.invalidateQueries({ queryKey: ['projects'] }),
    queryClient.invalidateQueries({ queryKey: ['stats'] }),
  ]);
}
