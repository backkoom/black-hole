import type { OrgNode } from '@workbench/shared/types';
import { apiDelete, apiGet, apiPost, apiPut } from './client';

/**
 * 组织架构接口 —— 只用 openapi.yaml 里的 4 个：
 * GET /api/org/tree、POST /api/org、PUT /api/org/:id、DELETE /api/org/:id。
 *
 * 全部只管理员可见；失败时由 api/client 抛 ApiError，message 是服务端原文。
 */

export interface OrgTreeResponse {
  nodes: OrgNode[];
}

export interface CreateOrgInput {
  /** null = 新增根节点（组织树为空时唯一入口） */
  parentId: number | null;
  name: string;
}

export interface UpdateOrgInput {
  name?: string;
  parentId?: number;
  sort?: number;
}

/** react-query key */
export const orgKeys = {
  tree: ['org', 'tree'] as const,
};

/** 整棵组织树（根只有一个；userCount 只统计直接挂在本节点的人，不递归） */
export async function fetchOrgTree(): Promise<OrgNode[]> {
  const data = await apiGet<OrgTreeResponse>('/org/tree');
  return data.nodes;
}

/** 新增节点：parentId 为空表示建根节点（level 固定 1），否则 level = 父 + 1 */
export async function createOrg(input: CreateOrgInput): Promise<OrgNode> {
  const data = await apiPost<{ node: OrgNode }>('/org', input);
  return data.node;
}

/** 改名 / 移动 / 排序 */
export async function updateOrg(id: number, input: UpdateOrgInput): Promise<OrgNode> {
  const data = await apiPut<{ node: OrgNode }>(`/org/${id}`, input);
  return data.node;
}

/** 删除空节点：有子节点或仍有人员时服务端 422 */
export async function deleteOrg(id: number): Promise<null> {
  return apiDelete<null>(`/org/${id}`);
}
