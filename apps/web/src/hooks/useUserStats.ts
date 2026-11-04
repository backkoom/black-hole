import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  DistributionResult,
  TaskStats,
  TeamWorkloadResult,
  TrendResult,
} from '@workbench/shared/types';
import { fetchTaskStats, statsKeys } from '../api/stats';
import {
  fetchStatsDistribution,
  fetchStatsTeamWorkload,
  fetchStatsTrend,
  userStatsKeys,
} from '../api/userStats';

/**
 * 用户端「数据统计」页 / 「进度追踪」页共用的统计查询。
 *
 * 全部走真实接口，一个字都不造：
 * - 任务状态分布（GET /api/stats/tasks）
 * - 任务完成趋势（GET /api/stats/trend?days=N）
 * - 项目进度分布 + 任务分类分布（GET /api/stats/distribution）
 * - 团队工作量（GET /api/stats/team-workload）
 *
 * 查询键统一挂在 ['stats'] 前缀下 —— useInvalidate.invalidateUserData 失效
 * ['stats'] 时这四个查询会一起刷新。
 */

/** 任务状态分布（todo / doing / done） */
export function useStatsTaskCounts(): UseQueryResult<TaskStats> {
  return useQuery({
    queryKey: statsKeys.tasks,
    queryFn: fetchTaskStats,
    staleTime: 30_000,
  });
}

/** 任务完成趋势（按天） */
export function useStatsTrend(days: number): UseQueryResult<TrendResult> {
  return useQuery({
    queryKey: userStatsKeys.trend(days),
    queryFn: () => fetchStatsTrend(days),
    staleTime: 30_000,
  });
}

/** 项目进度分布 + 任务分类分布 */
export function useStatsDistribution(): UseQueryResult<DistributionResult> {
  return useQuery({
    queryKey: userStatsKeys.distribution,
    queryFn: fetchStatsDistribution,
    staleTime: 30_000,
  });
}

/** 团队工作量（按负责人聚合） */
export function useStatsTeamWorkload(): UseQueryResult<TeamWorkloadResult> {
  return useQuery({
    queryKey: userStatsKeys.teamWorkload,
    queryFn: fetchStatsTeamWorkload,
    staleTime: 30_000,
  });
}
