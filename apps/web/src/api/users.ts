import type {
  ImportResult,
  Paged,
  Role,
  User,
  UserListItem,
  UserStatus,
} from '@blackhole/shared/types';
import { apiBlob, apiGet, apiPost, apiPostForm, apiPut } from './client';

/**
 * 账号管理接口 —— 只用 openapi.yaml 里的 6 个：
 * GET/POST /api/users、PUT /api/users/:id、POST /api/users/:id/reset-password、
 * POST /api/users/import、GET /api/users/import/template。
 *
 * 初始密码（initialPassword / initialPasswords）只返回一次，服务端不落库。
 */

export interface UserListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  orgId?: number;
  role?: Role;
  status?: UserStatus;
}

export interface CreateUserInput {
  account: string;
  name: string;
  orgId: number;
  role?: Role;
}

export interface UpdateUserInput {
  name?: string;
  orgId?: number;
  status?: UserStatus;
  role?: Role;
}

/** react-query key */
export const usersKeys = {
  list: ['users', 'list'] as const,
  /** 统计在用的管理员 / 超管：用于「不能停用最后一个超管」的 UI 预判 */
  activeAdmins: ['users', 'active-admins'] as const,
};

/** 账号列表：管理员看全员，默认按创建时间倒序 */
export async function listUsers(query: UserListQuery): Promise<Paged<UserListItem>> {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.orgId !== undefined) params.set('orgId', String(query.orgId));
  if (query.role) params.set('role', query.role);
  if (query.status) params.set('status', query.status);
  return apiGet<Paged<UserListItem>>(`/users?${params.toString()}`);
}

/** 新增账号：初始密码只返回一次 */
export async function createUser(
  input: CreateUserInput,
): Promise<{ user: User; initialPassword: string }> {
  return apiPost<{ user: User; initialPassword: string }>('/users', input);
}

/** 编辑账号：本人只能改 name，带 orgId/status/role 服务端一律 403 */
export async function updateUser(id: number, input: UpdateUserInput): Promise<User> {
  const data = await apiPut<{ user: User }>(`/users/${id}`, input);
  return data.user;
}

/** 重置密码：返回一次性初始密码 */
export async function resetUserPassword(id: number): Promise<{ initialPassword: string }> {
  return apiPost<{ initialPassword: string }>(`/users/${id}/reset-password`);
}

/** 停用 / 启用（PUT /api/users/:id 的 status 子集） */
export async function setUserStatus(id: number, status: UserStatus): Promise<User> {
  const data = await apiPut<{ user: User }>(`/users/${id}`, { status });
  return data.user;
}

/**
 * 批量导入：multipart（file + orgId）。
 * 字段要排在文件前面 —— 服务端先读 body 再取文件。
 */
export async function importUsers(file: File, orgId: number): Promise<ImportResult> {
  const form = new FormData();
  form.append('orgId', String(orgId));
  form.append('file', file);
  return apiPostForm<ImportResult>('/users/import', form);
}

/** 下载导入模板（CSV 文件流，不包统一 JSON） */
export async function downloadImportTemplate(): Promise<Blob> {
  return apiBlob('/users/import/template');
}
