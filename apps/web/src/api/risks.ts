import type { Risk, RiskLevel, RiskStats, RiskStatus } from '@workbench/shared/types';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';

/**
 * 风险与问题接口 —— 用户端「风险问题管理」页（稿子图8）。
 *
 * 契约（apps/api/src/risks/routes.ts）：
 * - GET    /api/risks           → { items: Risk[] }
 * - GET    /api/risks/summary   → RiskStats
 * - POST   /api/risks           body {title, kind?, code?, projectId?, description?,
 *                                     level?, impact?, probability?, ownerId?, dueDate?,
 *                                     responsePlan?} → { risk: Risk }
 * - PUT    /api/risks/:id       body 同上（可改 status）              → { risk: Risk }
 * - PATCH  /api/risks/:id/status body { status }                     → { risk: Risk }
 * - DELETE /api/risks/:id       → null（软删）
 *
 * 口径：
 * - 一张表用 kind 区分 risk（风险）/ issue（问题）；
 * - level 与 impact / probability 同为 low / medium / high；
 * - status 为 open（待处理）/ handling（处理中）/ resolved（已解决）；
 * - 普通用户强制只看自己创建的风险与问题，管理员不传 userId 即看全员；
 * - dueDate 是**日历日**（YYYY-MM-DD），创建 / 修改时只能传 YYYY-MM-DD。
 *
 * 类型直接复用 @workbench/shared/types，不在这里另写一份。
 */

/** 风险 / 问题类型 */
export type RiskKind = Risk['kind'];

/** 列表查询 */
export interface RiskListQuery {
  /** 只看风险或只看问题 */
  kind?: RiskKind;
  /** 风险等级 */
  level?: RiskLevel;
  /** 处理状态 */
  status?: RiskStatus;
  /** 所属项目 */
  projectId?: number;
}

/** 新建风险 / 问题 */
export interface CreateRiskInput {
  title: string;
  kind?: RiskKind;
  /** 编号（稿子里的「编号」列） */
  code?: string | null;
  projectId?: number | null;
  description?: string | null;
  level?: RiskLevel;
  /** 影响度 */
  impact?: RiskLevel | null;
  /** 发生概率 */
  probability?: RiskLevel | null;
  ownerId?: number | null;
  /** YYYY-MM-DD */
  dueDate?: string | null;
  /** 风险应对措施 */
  responsePlan?: string | null;
}

/** 修改风险 / 问题（PUT，允许带 status） */
export interface UpdateRiskInput extends Partial<CreateRiskInput> {
  status?: RiskStatus;
}

/** react-query key —— all 是前缀，失效时覆盖下面所有查询 */
export const riskKeys = {
  all: ['risks'] as const,
  /** 列表：key 里带筛选参数 */
  list: (query: RiskListQuery) => ['risks', 'list', query] as const,
  /** 汇总统计（等级 / 状态 / 类型 / 影响×概率矩阵） */
  summary: ['risks', 'summary'] as const,
  /** 不带筛选的全量列表（应对计划等需要看全部的面板用） */
  every: ['risks', 'every'] as const,
};

/** 风险与问题列表 */
export async function listRisks(query: RiskListQuery = {}): Promise<Risk[]> {
  const params = new URLSearchParams();
  if (query.kind !== undefined) params.set('kind', query.kind);
  if (query.level !== undefined) params.set('level', query.level);
  if (query.status !== undefined) params.set('status', query.status);
  if (query.projectId !== undefined) params.set('projectId', String(query.projectId));
  const search = params.toString();
  const data = await apiGet<{ items: Risk[] }>(`/risks${search ? `?${search}` : ''}`);
  return data.items;
}

/** 汇总统计：等级 / 状态 / 类型 / 影响×概率矩阵 */
export async function fetchRiskStats(): Promise<RiskStats> {
  return apiGet<RiskStats>('/risks/summary');
}

/** 新建风险 / 问题 */
export async function createRisk(input: CreateRiskInput): Promise<Risk> {
  const data = await apiPost<{ risk: Risk }>('/risks', input);
  return data.risk;
}

/** 修改风险 / 问题 */
export async function updateRisk(id: number, input: UpdateRiskInput): Promise<Risk> {
  const data = await apiPut<{ risk: Risk }>(`/risks/${id}`, input);
  return data.risk;
}

/** 状态流转：open / handling / resolved */
export async function updateRiskStatus(id: number, status: RiskStatus): Promise<Risk> {
  const data = await apiPatch<{ risk: Risk }>(`/risks/${id}/status`, { status });
  return data.risk;
}

/** 删除风险 / 问题（软删，服务端保留历史） */
export async function deleteRisk(id: number): Promise<null> {
  return apiDelete<null>(`/risks/${id}`);
}
