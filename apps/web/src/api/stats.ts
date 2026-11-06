import type { Overview, TaskStats } from '@blackhole/shared/types';
import { apiGet } from './client';

/**
 * 统计接口 —— 只用 openapi.yaml 里的 2 个：
 * GET /api/stats/overview、GET /api/stats/tasks。
 *
 * 口径（openapi §/api/stats/overview）：
 * - 管理员可带 userId 查全员；普通用户忽略 userId，只看自己（服务端行为）；
 * - weeklyRate 是 0–100 的整数，**分母为 0 时后端返回 null** —— 前端要显示「—」，不能当 0 渲染；
 * - projectCount 是活跃项目数（未删除且未完成）。
 */

/** react-query key */
export const statsKeys = {
  /** 工作台指标卡 */
  overview: ['stats', 'overview'] as const,
  /** 数据报表模块 */
  tasks: ['stats', 'tasks'] as const,
};

/** 指标卡数据 */
export async function fetchStatsOverview(): Promise<Overview> {
  return apiGet<Overview>('/stats/overview');
}

/** 任务状态分布（todo / doing / done） */
export async function fetchTaskStats(): Promise<TaskStats> {
  return apiGet<TaskStats>('/stats/tasks');
}
