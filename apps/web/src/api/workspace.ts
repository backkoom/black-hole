import type { LayoutItem, Workspace } from '@blackhole/shared/types';
import { ApiError, apiGet, apiPut } from './client';

/**
 * 工作台与工作台模板接口 —— 只用 openapi.yaml 里的 5 个：
 * GET /api/workspace、PUT /api/workspace、PUT /api/workspace/layout、
 * GET /api/workspace/template、PUT /api/workspace/template。
 *
 * 规则（v2 §4.10 / 执行包 §7.6）：
 * - 布局保存必须带 version（CAS）；服务端比对不一致返回 409，data 里带服务端当前 version 与 items；
 * - 名称/副标题走单独 PUT，**不参与 version**，不触发 409；
 * - 失败时由 api/client 抛 ApiError，message 是服务端原文。
 */

/** react-query key */
export const workspaceKeys = {
  /** 当前用户的工作台 */
  mine: ['workspace', 'mine'] as const,
  /** 管理员的默认模板 */
  template: ['workspace', 'template'] as const,
};

/** 名称与副标题（不参与 version） */
export interface WorkspaceMetaInput {
  name?: string;
  subtitle?: string;
}

/** 布局保存请求体：version 必填，items 顺序即 sort */
export interface WorkspaceLayoutInput {
  version: number;
  items: LayoutItem[];
}

/** 409 冲突体：服务端当前 version 与当前 items */
export interface WorkspaceConflictPayload {
  version: number;
  items: LayoutItem[];
}

/** 读取我的工作台 */
export async function fetchMyWorkspace(): Promise<Workspace> {
  return apiGet<Workspace>('/workspace');
}

/** 修改名称与副标题：不参与 version，不触发 409 */
export async function updateWorkspaceMeta(input: WorkspaceMetaInput): Promise<Workspace> {
  return apiPut<Workspace>('/workspace', input);
}

/** 保存我的布局：带 version，成功后 version +1 */
export async function saveWorkspaceLayout(input: WorkspaceLayoutInput): Promise<Workspace> {
  return apiPut<Workspace>('/workspace/layout', input);
}

/** 读取默认模板（仅管理员） */
export async function fetchWorkspaceTemplate(): Promise<Workspace> {
  return apiGet<Workspace>('/workspace/template');
}

/** 保存默认模板：带 version，成功后 version +1 */
export async function saveWorkspaceTemplate(
  input: WorkspaceLayoutInput & WorkspaceMetaInput,
): Promise<Workspace> {
  return apiPut<Workspace>('/workspace/template', input);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLayoutItem(value: unknown): value is LayoutItem {
  if (!isRecord(value)) return false;
  const { moduleKey, w, h, config } = value;
  return (
    typeof moduleKey === 'string' &&
    (w === 3 || w === 4 || w === 6 || w === 12) &&
    typeof h === 'number' &&
    isRecord(config)
  );
}

/**
 * 从 409 错误里取服务端当前的 version 与 items。
 * 不是 409、或响应体结构对不上时返回 null（调用方按普通错误处理）。
 */
export function readWorkspaceConflict(err: unknown): WorkspaceConflictPayload | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const data = err.data;
  if (!isRecord(data)) return null;
  const { version, items } = data;
  if (typeof version !== 'number' || !Array.isArray(items)) return null;
  const parsed: LayoutItem[] = [];
  for (const item of items) {
    if (!isLayoutItem(item)) return null;
    parsed.push(item);
  }
  return { version, items: parsed };
}
