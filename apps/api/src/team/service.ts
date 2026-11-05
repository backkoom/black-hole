import type {
  Announcement,
  Approval,
  ApprovalStatus,
  Discussion,
  DiscussionTargetType,
} from '@workbench/shared/types';
import { query, queryOne } from '../db.js';
import { forbidden, notFound, unprocessable } from '../lib/errors.js';
import { formatTimestamp } from '../lib/serialize.js';
import type { SessionContext } from '../auth/service.js';

/**
 * 团队协作 —— 公告 / 讨论 / 审批。
 *
 * 权限口径：
 * - 公告：全员可读；创建/编辑/删除限作者或管理员
 * - 讨论：全员可读（按 target）；创建任何登录用户；删除限作者或管理员
 * - 审批：提交人可创建并可带 assigneeId 指派；
 *         `scope=mine` 返回「待我审批」（assignee_id = 我）；
 *         管理员可看全部；决策（通过/驳回）限 assignee 或管理员
 */

/* ───────────────────────── 公告 ───────────────────────── */

interface AnnouncementRow {
  id: number;
  user_id: number;
  user_name: string;
  project_id: number | null;
  project_name: string | null;
  title: string;
  content: string;
  pinned: boolean;
  created_at: Date;
  updated_at: Date;
}

const ANNOUNCEMENT_SELECT = `
SELECT a.id, a.user_id, u.name AS user_name, a.project_id, p.name AS project_name,
       a.title, a.content, a.pinned, a.created_at, a.updated_at
  FROM announcement a
  JOIN app_user u ON u.id = a.user_id
  LEFT JOIN project p ON p.id = a.project_id AND p.deleted_at IS NULL
`;

function toAnnouncement(r: AnnouncementRow): Announcement {
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    userName: r.user_name,
    projectId: r.project_id === null ? null : Number(r.project_id),
    projectName: r.project_name,
    title: r.title,
    content: r.content,
    pinned: r.pinned,
    createdAt: formatTimestamp(r.created_at) as string,
    updatedAt: formatTimestamp(r.updated_at) as string,
  };
}

export async function listAnnouncements(q: {
  projectId?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ items: Announcement[]; total: number }> {
  const where = ['a.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (q.projectId !== undefined) {
    params.push(q.projectId);
    where.push(`a.project_id = $${params.length}`);
  }
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 20;
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await query<AnnouncementRow>(
    `${ANNOUNCEMENT_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY a.pinned DESC, a.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const totalRow = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM announcement a WHERE ${where.join(' AND ')}`,
    params.slice(0, params.length - 2),
  );
  return { items: rows.map(toAnnouncement), total: Number(totalRow?.n ?? 0) };
}

export async function createAnnouncement(
  input: { title: string; content?: string; projectId?: number | null; pinned?: boolean },
  actor: SessionContext,
): Promise<Announcement> {
  const title = input.title.trim();
  if (!title || title.length > 128) throw unprocessable('公告标题需 1 至 128 个字符');
  const ins = await queryOne<{ id: number }>(
    `INSERT INTO announcement (user_id, project_id, title, content, pinned)
     VALUES ($1, $2, $3, $4, COALESCE($5, false)) RETURNING id`,
    [actor.user.id, input.projectId ?? null, title, input.content ?? '', input.pinned ?? false],
  );
  if (!ins) throw notFound('创建失败');
  const row = await queryOne<AnnouncementRow>(`${ANNOUNCEMENT_SELECT} WHERE a.id = $1`, [
    Number(ins.id),
  ]);
  if (!row) throw notFound('公告不存在');
  return toAnnouncement(row);
}

export async function updateAnnouncement(
  id: number,
  input: { title?: string; content?: string; pinned?: boolean; projectId?: number | null },
  actor: SessionContext,
): Promise<Announcement> {
  const own = await queryOne<{ user_id: number }>(
    'SELECT user_id FROM announcement WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!own) throw notFound('公告不存在');
  if (actor.user.role !== 'admin' && Number(own.user_id) !== actor.user.id) {
    throw forbidden('只能修改自己发布的公告');
  }
  await query(
    `UPDATE announcement
        SET title = COALESCE($2, title),
            content = COALESCE($3, content),
            pinned = COALESCE($4, pinned),
            project_id = CASE WHEN $5::boolean THEN $6 ELSE project_id END,
            updated_at = now()
      WHERE id = $1`,
    [
      id,
      input.title?.trim() ?? null,
      input.content ?? null,
      input.pinned ?? null,
      input.projectId !== undefined,
      input.projectId ?? null,
    ],
  );
  const row = await queryOne<AnnouncementRow>(`${ANNOUNCEMENT_SELECT} WHERE a.id = $1`, [id]);
  if (!row) throw notFound('公告不存在');
  return toAnnouncement(row);
}

export async function deleteAnnouncement(id: number, actor: SessionContext): Promise<void> {
  const own = await queryOne<{ user_id: number }>(
    'SELECT user_id FROM announcement WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!own) throw notFound('公告不存在');
  if (actor.user.role !== 'admin' && Number(own.user_id) !== actor.user.id) {
    throw forbidden('只能删除自己发布的公告');
  }
  await query('UPDATE announcement SET deleted_at = now() WHERE id = $1', [id]);
}

/* ───────────────────────── 讨论 ───────────────────────── */

interface DiscussionRow {
  id: number;
  user_id: number;
  user_name: string;
  target_type: DiscussionTargetType;
  target_id: number;
  parent_id: number | null;
  content: string;
  created_at: Date;
}

const DISCUSSION_SELECT = `
SELECT d.id, d.user_id, u.name AS user_name, d.target_type, d.target_id,
       d.parent_id, d.content, d.created_at
  FROM discussion d
  JOIN app_user u ON u.id = d.user_id
`;

function toDiscussion(r: DiscussionRow): Discussion {
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    userName: r.user_name,
    targetType: r.target_type,
    targetId: Number(r.target_id),
    parentId: r.parent_id === null ? null : Number(r.parent_id),
    content: r.content,
    createdAt: formatTimestamp(r.created_at) as string,
  };
}

export async function listDiscussions(q: {
  targetType?: DiscussionTargetType;
  targetId?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ items: Discussion[]; total: number }> {
  const where = ['d.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (q.targetType !== undefined) {
    params.push(q.targetType);
    where.push(`d.target_type = $${params.length}`);
  }
  if (q.targetId !== undefined) {
    params.push(q.targetId);
    where.push(`d.target_id = $${params.length}`);
  }
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 50;
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await query<DiscussionRow>(
    `${DISCUSSION_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY d.created_at ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const totalRow = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM discussion d WHERE ${where.join(' AND ')}`,
    params.slice(0, params.length - 2),
  );
  return { items: rows.map(toDiscussion), total: Number(totalRow?.n ?? 0) };
}

export async function createDiscussion(
  input: {
    targetType: DiscussionTargetType;
    targetId: number;
    content: string;
    parentId?: number | null;
  },
  actor: SessionContext,
): Promise<Discussion> {
  const content = input.content.trim();
  if (!content) throw unprocessable('讨论内容不能为空');
  if (content.length > 4000) throw unprocessable('讨论内容过长');
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) {
    throw unprocessable('讨论对象不合法');
  }
  const ins = await queryOne<{ id: number }>(
    `INSERT INTO discussion (user_id, target_type, target_id, parent_id, content)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [actor.user.id, input.targetType, input.targetId, input.parentId ?? null, content],
  );
  if (!ins) throw notFound('创建失败');
  const row = await queryOne<DiscussionRow>(`${DISCUSSION_SELECT} WHERE d.id = $1`, [
    Number(ins.id),
  ]);
  if (!row) throw notFound('讨论不存在');
  return toDiscussion(row);
}

export async function deleteDiscussion(id: number, actor: SessionContext): Promise<void> {
  const own = await queryOne<{ user_id: number }>(
    'SELECT user_id FROM discussion WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!own) throw notFound('讨论不存在');
  if (actor.user.role !== 'admin' && Number(own.user_id) !== actor.user.id) {
    throw forbidden('只能删除自己发表的讨论');
  }
  await query('UPDATE discussion SET deleted_at = now() WHERE id = $1', [id]);
}

/* ───────────────────────── 审批 ───────────────────────── */

interface ApprovalRow {
  id: number;
  requester_id: number;
  requester_name: string;
  assignee_id: number | null;
  assignee_name: string | null;
  kind: string;
  title: string;
  detail: string | null;
  target_type: DiscussionTargetType | null;
  target_id: number | null;
  status: ApprovalStatus;
  comment: string | null;
  decided_at: Date | null;
  created_at: Date;
}

const APPROVAL_SELECT = `
SELECT ap.id, ap.requester_id, rq.name AS requester_name, ap.assignee_id, asg.name AS assignee_name,
       ap.kind, ap.title, ap.detail, ap.target_type, ap.target_id, ap.status, ap.comment,
       ap.decided_at, ap.created_at
  FROM approval ap
  JOIN app_user rq ON rq.id = ap.requester_id
  LEFT JOIN app_user asg ON asg.id = ap.assignee_id
`;

function toApproval(r: ApprovalRow): Approval {
  return {
    id: Number(r.id),
    requesterId: Number(r.requester_id),
    requesterName: r.requester_name,
    assigneeId: r.assignee_id === null ? null : Number(r.assignee_id),
    assigneeName: r.assignee_name,
    kind: r.kind,
    title: r.title,
    detail: r.detail,
    targetType: r.target_type,
    targetId: r.target_id === null ? null : Number(r.target_id),
    status: r.status,
    comment: r.comment,
    decidedAt: r.decided_at === null ? null : (formatTimestamp(r.decided_at) as string),
    createdAt: formatTimestamp(r.created_at) as string,
  };
}

export async function listApprovals(q: {
  status?: ApprovalStatus;
  /** mine = 待我审批（assignee 是我）；submitted = 我提交的；all = 全部（管理员） */
  scope?: 'mine' | 'submitted' | 'all';
  /** 当前用户 id —— scope=mine / submitted 时按它过滤 */
  scopeUserId: number;
}): Promise<{ items: Approval[]; total: number }> {
  const where = ['ap.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (q.status !== undefined) {
    params.push(q.status);
    where.push(`ap.status = $${params.length}`);
  }
  if (q.scope === 'mine') {
    params.push(q.scopeUserId);
    where.push(`ap.assignee_id = $${params.length}`);
  } else if (q.scope === 'submitted') {
    params.push(q.scopeUserId);
    where.push(`ap.requester_id = $${params.length}`);
  }
  const rows = await query<ApprovalRow>(
    `${APPROVAL_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY ap.created_at DESC`,
    params,
  );
  return { items: rows.map(toApproval), total: rows.length };
}

export async function createApproval(
  input: {
    kind?: string;
    title: string;
    detail?: string | null;
    targetType?: DiscussionTargetType | null;
    targetId?: number | null;
    assigneeId?: number | null;
  },
  actor: SessionContext,
): Promise<Approval> {
  const title = input.title.trim();
  if (!title || title.length > 128) throw unprocessable('审批标题需 1 至 128 个字符');
  const ins = await queryOne<{ id: number }>(
    `INSERT INTO approval (requester_id, assignee_id, kind, title, detail, target_type, target_id)
     VALUES ($1, $2, COALESCE($3, 'general'), $4, $5, $6, $7) RETURNING id`,
    [
      actor.user.id,
      input.assigneeId ?? null,
      input.kind ?? null,
      title,
      input.detail ?? null,
      input.targetType ?? null,
      input.targetId ?? null,
    ],
  );
  if (!ins) throw notFound('创建失败');
  const row = await queryOne<ApprovalRow>(`${APPROVAL_SELECT} WHERE ap.id = $1`, [Number(ins.id)]);
  if (!row) throw notFound('审批不存在');
  return toApproval(row);
}

export async function decideApproval(
  id: number,
  input: { decision: 'approved' | 'rejected'; comment?: string | null },
  actor: SessionContext,
): Promise<Approval> {
  const row = await queryOne<{ assignee_id: number | null; requester_id: number }>(
    'SELECT assignee_id, requester_id FROM approval WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!row) throw notFound('审批不存在');
  const isAssignee = row.assignee_id !== null && Number(row.assignee_id) === actor.user.id;
  const isAdmin = actor.user.role === 'admin';
  if (!isAssignee && !isAdmin) throw forbidden('只有审批人或管理员可以处理');
  if (Number(row.requester_id) === actor.user.id && !isAdmin) {
    throw forbidden('不能审批自己提交的申请');
  }
  await query(
    `UPDATE approval
        SET status = $2, comment = $3, decided_at = now(), updated_at = now()
      WHERE id = $1`,
    [id, input.decision, input.comment ?? null],
  );
  const after = await queryOne<ApprovalRow>(`${APPROVAL_SELECT} WHERE ap.id = $1`, [id]);
  if (!after) throw notFound('审批不存在');
  return toApproval(after);
}
