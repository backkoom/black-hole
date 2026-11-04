import type {
  DistributionResult,
  TeamWorkloadResult,
  TrendResult,
} from '@workbench/shared/types';
import { apiGet } from './client';

/**
 * 用户端「数据统计」页的聚合接口（执行包 §6.4 的 35/36/37 号接口）。
 *
 * 口径（apps/api/src/stats/service.ts，服务端实时算好，前端不自己再算）：
 * - GET /api/stats/trend?days=N
 *   按 **created_at 落桶**（东八区日历日）返回最近 N 天：
 *   total = 当天创建的任务数，done = 其中已完成的，pending = 其中未完成的；
 *   N 取值 1~90（服务端 clamp）。
 * - GET /api/stats/distribution
 *   buckets   = 项目进度分桶（0-20% / 21-50% / 51-80% / 81-99% / 100%），顺序固定；
 *   categories = 任务分类分布（category 为空的归「未分类」），最多 12 类，按数量倒序。
 * - GET /api/stats/team-workload
 *   按任务负责人聚合：taskCount / doneCount / rate（0~100 的整数）。
 *
 * ⚠️ 管理员不传 userId 时统计**全员**（与任务列表同口径），普通用户服务端强制只看自己。
 * ⚠️ 失败按 HTTP 状态码判错，message 原文透传（见 api/client.ts）。
 */

/** react-query key —— 前缀是 ['stats']，失效时统一被 invalidateUserData 覆盖 */
export const userStatsKeys = {
  /** 任务完成趋势（按天数缓存） */
  trend: (days: number) => ['stats', 'trend', days] as const,
  /** 项目进度分布 + 任务分类分布 */
  distribution: ['stats', 'distribution'] as const,
  /** 团队工作量 */
  teamWorkload: ['stats', 'team-workload'] as const,
};

/** 任务完成趋势（按天） */
export async function fetchStatsTrend(days: number): Promise<TrendResult> {
  return apiGet<TrendResult>(`/stats/trend?days=${days}`);
}

/** 项目进度分布 + 任务分类分布 */
export async function fetchStatsDistribution(): Promise<DistributionResult> {
  return apiGet<DistributionResult>('/stats/distribution');
}

/** 团队工作量（按负责人聚合） */
export async function fetchStatsTeamWorkload(): Promise<TeamWorkloadResult> {
  return apiGet<TeamWorkloadResult>('/stats/team-workload');
}
