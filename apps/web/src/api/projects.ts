import type { Paged, Project, ProjectDetail, ProjectMemberInfo } from '@blackhole/shared/types';
import { apiDelete, apiGet, apiPost, apiPut } from './client';

/**
 * 项目接口 —— 只用 openapi.yaml 里的 5 个：
 * GET /api/projects、POST /api/projects、GET /api/projects/:id、
 * PUT /api/projects/:id、DELETE /api/projects/:id。
 *
 * 口径（v2 §6.1–§6.3 / 执行包 §6.2）：
 * - progress / totalItems / doneItems / status 全部由服务端实时算好，前端直接用，不自己再算；
 * - 删除项目是软删，同一事务里把项目下任务的 project_id 置空（任务保留、解除归属）。
 */

export interface ProjectListQuery {
  page: number;
  pageSize: number;
}

export interface CreateProjectInput {
  name: string;
  owner?: string | null;
  dueDate?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  owner?: string | null;
  /** 开始日（甘特拖拽改期时与 dueDate 一起平移） */
  startDate?: string | null;
  dueDate?: string | null;
}

/** react-query key —— all 是前缀，失效时覆盖下面所有项目查询 */
export const projectsKeys = {
  all: ['projects'] as const,
  /** 列表：query 里带分页参数 */
  list: (query: ProjectListQuery) => ['projects', 'list', query] as const,
  /** 详情：项目 + 其任务列表 */
  detail: (id: number) => ['projects', 'detail', id] as const,
};

/** 项目列表：默认按 created_at 倒序，分页 20（pageSize 最大 100） */
export async function listProjects(query: ProjectListQuery): Promise<Paged<Project>> {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  return apiGet<Paged<Project>>(`/projects?${params.toString()}`);
}

/** 新建项目：0 任务、active、0% */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  const data = await apiPost<{ project: Project }>('/projects', input);
  return data.project;
}

/** 项目详情：项目 + 它的任务列表；无权访问返回 404 */
export async function getProjectDetail(id: number): Promise<ProjectDetail> {
  return apiGet<ProjectDetail>(`/projects/${id}`);
}

/** 修改项目：名称 / 负责人 / 截止日 */
export async function updateProject(id: number, input: UpdateProjectInput): Promise<Project> {
  const data = await apiPut<{ project: Project }>(`/projects/${id}`, input);
  return data.project;
}

/* ---------------- 项目成员（D-30） ---------------- */

/** 成员列表（归属人 + 协作者） */
export async function listProjectMembers(projectId: number): Promise<ProjectMemberInfo[]> {
  const data = await apiGet<{ items: ProjectMemberInfo[] }>(`/projects/${projectId}/members`);
  return data.items;
}

/** 整表替换成员名单（只有归属人/管理员能改，服务端 404 兜底） */
export async function setProjectMembers(
  projectId: number,
  userIds: number[],
): Promise<ProjectMemberInfo[]> {
  const data = await apiPut<{ items: ProjectMemberInfo[] }>(`/projects/${projectId}/members`, {
    userIds,
  });
  return data.items;
}

/** 选人下拉的候选（登录即可，只有 id/姓名/账号） */
export async function listMemberCandidates(): Promise<ProjectMemberInfo[]> {
  const data = await apiGet<{ items: ProjectMemberInfo[] }>('/projects/member-candidates');
  return data.items;
}

/** 删除项目：软删 + 解除任务归属（任务保留） */
export async function deleteProject(id: number): Promise<null> {
  return apiDelete<null>(`/projects/${id}`);
}
