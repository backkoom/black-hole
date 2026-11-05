import type {
  Announcement,
  Approval,
  ApprovalStatus,
  Discussion,
  DiscussionTargetType,
} from '@workbench/shared/types';
import { apiDelete, apiGet, apiPost, apiPut } from './client';

/**
 * 团队协作接口 —— 公告 / 讨论 / 审批（用户端「团队协作」页 · 稿子图6）。
 *
 * 契约（apps/api/src/team/routes.ts）：
 * - GET    /api/announcements?projectId=&page=&pageSize=  → { items: Announcement[], total }
 * - POST   /api/announcements    body { title, content?, projectId?, pinned? } → { announcement }
 * - PUT    /api/announcements/:id body 同上（部分字段）                      → { announcement }
 * - DELETE /api/announcements/:id                                          → null（软删）
 * - GET    /api/discussions?targetType=&targetId=&page=&pageSize= → { items: Discussion[], total }
 * - POST   /api/discussions body { targetType, targetId, content, parentId? } → { discussion }
 * - DELETE /api/discussions/:id → null（软删）
 * - GET    /api/approvals?status=&scope= → { items: Approval[], total }
 * - POST   /api/approvals/:id/decision body { decision, comment? } → { approval }
 *
 * 口径：
 * - 公告 / 讨论：全员可读；创建任何登录用户，编辑删除限作者（管理员亦可）。
 * - 审批：scope=mine 指派给我的 / submitted 我提交的 / all 全部；
 *   不传 scope 时管理员看全部、普通用户看指派给自己的；
 *   决策（通过 / 驳回）限审批人本人或管理员，且不能审批自己提交的申请。
 *
 * 类型直接复用 @workbench/shared/types，不在这里另写一份。
 */

/** 列表响应 —— 这三个接口只返回 items 与 total（没有 page / pageSize） */
export interface TeamList<T> {
  items: T[];
  total: number;
}

/** 公告列表查询 */
export interface AnnouncementListQuery {
  /** 只看某个项目的公告 */
  projectId?: number;
  page?: number;
  pageSize?: number;
}

/** 新建 / 修改公告 */
export interface AnnouncementInput {
  title: string;
  content?: string;
  /** 所属项目；null = 全局公告 */
  projectId?: number | null;
  /** 置顶 */
  pinned?: boolean;
}

/** 讨论列表查询 */
export interface DiscussionListQuery {
  /** 讨论挂在任务还是项目上 */
  targetType?: DiscussionTargetType;
  /** 讨论对象的 id */
  targetId?: number;
  page?: number;
  pageSize?: number;
}

/** 发表 / 回复讨论 */
export interface DiscussionInput {
  targetType: DiscussionTargetType;
  targetId: number;
  content: string;
  /** 回复的父讨论；null / 不传 = 顶层讨论 */
  parentId?: number | null;
}

/** 审批列表查询 */
export interface ApprovalListQuery {
  status?: ApprovalStatus;
  scope?: 'mine' | 'submitted' | 'all';
}

/** 审批决策 */
export interface ApprovalDecisionInput {
  decision: 'approved' | 'rejected';
  /** 审批意见 */
  comment?: string | null;
}

/** react-query key —— all 是前缀，失效时覆盖下面所有查询 */
export const teamKeys = {
  all: ['team'] as const,
  /** 公告列表前缀（失效它即可刷新所有公告查询） */
  announcementRoot: ['team', 'announcements'] as const,
  announcements: (query: AnnouncementListQuery) => ['team', 'announcements', query] as const,
  /** 讨论列表前缀 */
  discussionRoot: ['team', 'discussions'] as const,
  discussions: (query: DiscussionListQuery) => ['team', 'discussions', query] as const,
  /** 审批列表前缀 */
  approvalRoot: ['team', 'approvals'] as const,
  approvals: (query: ApprovalListQuery) => ['team', 'approvals', query] as const,
};

/* ───────────────────────── 公告 ───────────────────────── */

/** 公告列表 —— 服务端已按「置顶优先 + 时间倒序」排好 */
export async function listAnnouncements(
  query: AnnouncementListQuery = {},
): Promise<TeamList<Announcement>> {
  const params = new URLSearchParams();
  if (query.projectId !== undefined) params.set('projectId', String(query.projectId));
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 20));
  return apiGet<TeamList<Announcement>>(`/announcements?${params.toString()}`);
}

/** 新建公告 */
export async function createAnnouncement(input: AnnouncementInput): Promise<Announcement> {
  const data = await apiPost<{ announcement: Announcement }>('/announcements', input);
  return data.announcement;
}

/** 修改公告（可同时改标题 / 内容 / 置顶 / 所属项目） */
export async function updateAnnouncement(
  id: number,
  input: AnnouncementInput,
): Promise<Announcement> {
  const data = await apiPut<{ announcement: Announcement }>(`/announcements/${id}`, input);
  return data.announcement;
}

/** 删除公告（软删，服务端保留历史） */
export async function deleteAnnouncement(id: number): Promise<null> {
  return apiDelete<null>(`/announcements/${id}`);
}

/* ───────────────────────── 讨论 ───────────────────────── */

/** 讨论列表 —— 服务端按创建时间**升序**返回（第 1 页是最旧的） */
export async function listDiscussions(
  query: DiscussionListQuery = {},
): Promise<TeamList<Discussion>> {
  const params = new URLSearchParams();
  if (query.targetType !== undefined) params.set('targetType', query.targetType);
  if (query.targetId !== undefined) params.set('targetId', String(query.targetId));
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 50));
  return apiGet<TeamList<Discussion>>(`/discussions?${params.toString()}`);
}

/** 服务端单页上限 */
const DISCUSSION_PAGE_SIZE = 200;

/** 讨论列表最多往前回溯几页（回复与父讨论可能分页分开，回溯 2 页足够拼出讨论串） */
const DISCUSSION_MAX_PAGES = 2;

/**
 * 最近的讨论 —— ⚠️ 服务端按 created_at **升序**返回（第 1 页是最旧的），
 * 所以「最近」的数据在**最后一页**。这里：
 * 1. 先取第 1 页拿 total；
 * 2. total 超过一页时，取最后两页（最后一页 + 往前一页），
 *    这样既拿到最新讨论，也能把父讨论一起拼回来（父讨论总比回复早）。
 * 返回结果按创建时间**倒序**。
 */
export async function listAllDiscussions(
  query: Pick<DiscussionListQuery, 'targetType' | 'targetId'> = {},
): Promise<TeamList<Discussion>> {
  const first = await listDiscussions({ ...query, page: 1, pageSize: DISCUSSION_PAGE_SIZE });
  let items = first.items;

  if (first.total > DISCUSSION_PAGE_SIZE) {
    const lastPage = Math.ceil(first.total / DISCUSSION_PAGE_SIZE);
    const pages: number[] = [];
    for (let page = lastPage; page > lastPage - DISCUSSION_MAX_PAGES && page >= 1; page -= 1) {
      pages.unshift(page);
    }
    const collected = await Promise.all(
      pages.map((page) =>
        listDiscussions({ ...query, page, pageSize: DISCUSSION_PAGE_SIZE }),
      ),
    );
    const seen = new Set<number>();
    items = collected
      .flatMap((page) => page.items)
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
  }

  const sorted = [...items].sort((a, b) => {
    if (a.createdAt === b.createdAt) return b.id - a.id;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
  return { items: sorted, total: first.total };
}

/** 发表讨论（parentId 传父讨论 id 即为回复） */
export async function createDiscussion(input: DiscussionInput): Promise<Discussion> {
  const data = await apiPost<{ discussion: Discussion }>('/discussions', input);
  return data.discussion;
}

/** 删除讨论（软删，服务端保留历史） */
export async function deleteDiscussion(id: number): Promise<null> {
  return apiDelete<null>(`/discussions/${id}`);
}

/* ───────────────────────── 审批 ───────────────────────── */

/** 审批列表 */
export async function listApprovals(query: ApprovalListQuery = {}): Promise<TeamList<Approval>> {
  const params = new URLSearchParams();
  if (query.status !== undefined) params.set('status', query.status);
  if (query.scope !== undefined) params.set('scope', query.scope);
  const search = params.toString();
  return apiGet<TeamList<Approval>>(`/approvals${search ? `?${search}` : ''}`);
}

/** 审批决策：通过 / 驳回 */
export async function decideApproval(
  id: number,
  input: ApprovalDecisionInput,
): Promise<Approval> {
  const data = await apiPost<{ approval: Approval }>(`/approvals/${id}/decision`, input);
  return data.approval;
}
