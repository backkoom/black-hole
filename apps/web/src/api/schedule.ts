import type { Meeting, Milestone } from '@blackhole/shared/types';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

/**
 * 日程接口 —— 里程碑与会议（用户端「日程安排」「进度追踪」页）。
 *
 * 契约（apps/api/src/schedule/routes.ts）：
 * - GET    /api/milestones      → { items: Milestone[] }
 * - POST   /api/milestones      body { name, projectId?, dueDate?, status? } → { milestone: Milestone }
 * - PATCH  /api/milestones/:id  body { name?, dueDate?, status? }            → { milestone: Milestone }
 * - DELETE /api/milestones/:id  → null
 * - GET    /api/meetings         → { items: Meeting[] }
 * - POST   /api/meetings         body { title, startAt, endAt?, location?, projectId?, note? } → { meeting: Meeting }
 * - DELETE /api/meetings/:id     → null
 *
 * 口径：
 * - 普通用户只看自己的（服务端强制）；管理员不传 userId 即看全员；
 * - 里程碑 dueDate 是**日历日**（YYYY-MM-DD），会议 startAt / endAt 是
 *   **带时区的 ISO 8601**（如 2026-11-04T09:00:00+08:00）；
 * - meetings 的 from / to 按 start_at 过滤（timestamptz），所以要传完整 ISO，
 *   不能只传 YYYY-MM-DD（那样 to 会落在当天 00:00，当天后面的会议会被漏掉）。
 *
 * 类型直接复用 @blackhole/shared/types，不在这里另写一份。
 */

/** 里程碑状态 */
export type MilestoneStatus = Milestone['status'];

/** 里程碑列表查询 */
export interface MilestoneListQuery {
  /** 管理员可指定看谁；普通用户忽略，服务端强制只看自己 */
  userId?: number;
}

/** 会议列表查询 */
export interface MeetingListQuery {
  /** 管理员可指定看谁；普通用户忽略，服务端强制只看自己 */
  userId?: number;
  /** 开始时间下界（含），ISO 8601 带时区 */
  from?: string;
  /** 开始时间上界（含），ISO 8601 带时区 */
  to?: string;
}

/** 新建里程碑 */
export interface CreateMilestoneInput {
  name: string;
  projectId?: number | null;
  /** YYYY-MM-DD */
  dueDate?: string | null;
  status?: MilestoneStatus;
}

/** 修改里程碑 */
export interface UpdateMilestoneInput {
  name?: string;
  /** YYYY-MM-DD */
  dueDate?: string | null;
  status?: MilestoneStatus;
}

/** 新建会议 */
export interface CreateMeetingInput {
  title: string;
  /** ISO 8601 带时区，如 2026-11-04T09:00:00+08:00 */
  startAt: string;
  /** ISO 8601 带时区 */
  endAt?: string | null;
  location?: string | null;
  projectId?: number | null;
  note?: string | null;
}

/** react-query key —— all 是前缀，失效时覆盖下面所有查询 */
export const scheduleKeys = {
  all: ['schedule'] as const,
  /** 里程碑列表 */
  milestones: (query: MilestoneListQuery = {}) => ['schedule', 'milestones', query] as const,
  /** 会议列表（带时间区间） */
  meetings: (query: MeetingListQuery) => ['schedule', 'meetings', query] as const,
};

/** 里程碑列表 */
export async function listMilestones(query: MilestoneListQuery = {}): Promise<Milestone[]> {
  const params = new URLSearchParams();
  if (query.userId !== undefined) params.set('userId', String(query.userId));
  const search = params.toString();
  const data = await apiGet<{ items: Milestone[] }>(`/milestones${search ? `?${search}` : ''}`);
  return data.items;
}

/** 新建里程碑 */
export async function createMilestone(input: CreateMilestoneInput): Promise<Milestone> {
  const data = await apiPost<{ milestone: Milestone }>('/milestones', input);
  return data.milestone;
}

/** 修改里程碑 */
export async function updateMilestone(
  id: number,
  input: UpdateMilestoneInput,
): Promise<Milestone> {
  const data = await apiPatch<{ milestone: Milestone }>(`/milestones/${id}`, input);
  return data.milestone;
}

/** 删除里程碑（硬删） */
export async function deleteMilestone(id: number): Promise<null> {
  return apiDelete<null>(`/milestones/${id}`);
}

/** 会议列表：from / to 按 start_at 过滤，要传带时区的完整 ISO */
export async function listMeetings(query: MeetingListQuery = {}): Promise<Meeting[]> {
  const params = new URLSearchParams();
  if (query.userId !== undefined) params.set('userId', String(query.userId));
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  const search = params.toString();
  const data = await apiGet<{ items: Meeting[] }>(`/meetings${search ? `?${search}` : ''}`);
  return data.items;
}

/** 新建会议 */
export async function createMeeting(input: CreateMeetingInput): Promise<Meeting> {
  const data = await apiPost<{ meeting: Meeting }>('/meetings', input);
  return data.meeting;
}

/** 删除会议（硬删） */
export async function deleteMeeting(id: number): Promise<null> {
  return apiDelete<null>(`/meetings/${id}`);
}
