import type { Idea, Paged } from '@workbench/shared/types';
import { apiGet, apiPost } from './client';

/**
 * 灵感接口 —— 只用 openapi.yaml 里的 2 个：
 * GET /api/ideas、POST /api/ideas。
 *
 * 口径（openapi §/api/ideas）：
 * - 内容 1 至 2000 字；
 * - **只返回自己的**，管理员也不越权（服务端行为）。
 */

/** react-query key */
export const ideasKeys = {
  /** 前缀：失效时覆盖下面所有灵感查询 */
  all: ['ideas'] as const,
  /** 灵感列表（按页码区分） */
  list: (page: number, pageSize: number) => ['ideas', 'list', page, pageSize] as const,
};

/** 灵感列表：默认按 created_at desc */
export async function listIdeas(query: {
  page: number;
  pageSize: number;
}): Promise<Paged<Idea>> {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  return apiGet<Paged<Idea>>(`/ideas?${params.toString()}`);
}

/** 新增灵感：归属当前登录用户 */
export async function createIdea(content: string): Promise<Idea> {
  const data = await apiPost<{ idea: Idea }>('/ideas', { content });
  return data.idea;
}
