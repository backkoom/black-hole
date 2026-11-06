import type { Meeting, Milestone } from '@blackhole/shared/types';
import { query, queryOne } from '../db.js';
import { notFound, unprocessable } from '../lib/errors.js';
import { formatDate, formatTimestamp } from '../lib/serialize.js';
import type { SessionContext } from '../auth/service.js';

/**
 * 里程碑与会议 —— 用户端「日程安排」「进度追踪」页。
 *
 * 权限：普通用户只看自己的；管理员可带 userId 看全员（不传即全员）。
 * 删除是硬删（这两类是轻量记录，没有历史追溯需求）。
 */

interface MilestoneRow {
  id: number;
  project_id: number | null;
  project_name: string | null;
  name: string;
  due_date: string | null;
  status: 'pending' | 'done';
  sort: number;
  created_at: Date;
  updated_at: Date;
}

const MILESTONE_SELECT = `
SELECT m.id, m.project_id, p.name AS project_name, m.name, m.due_date,
       m.status, m.sort, m.created_at, m.updated_at
  FROM milestone m
  LEFT JOIN project p ON p.id = m.project_id AND p.deleted_at IS NULL
`;

function toMilestone(r: MilestoneRow): Milestone {
  return {
    id: Number(r.id),
    projectId: r.project_id === null ? null : Number(r.project_id),
    projectName: r.project_name,
    name: r.name,
    dueDate: formatDate(r.due_date),
    status: r.status,
    sort: Number(r.sort),
    createdAt: formatTimestamp(r.created_at) as string,
    updatedAt: formatTimestamp(r.updated_at) as string,
  };
}

export async function listMilestones(userId?: number): Promise<Milestone[]> {
  const params: unknown[] = [];
  let clause = '';
  if (userId !== undefined) {
    params.push(userId);
    clause = 'WHERE m.user_id = $1';
  }
  const rows = await query<MilestoneRow>(
    `${MILESTONE_SELECT} ${clause} ORDER BY m.due_date NULLS LAST, m.sort, m.id`,
    params,
  );
  return rows.map(toMilestone);
}

export async function createMilestone(
  input: { name: string; projectId?: number | null; dueDate?: string | null; status?: 'pending' | 'done' },
  actor: SessionContext,
): Promise<Milestone> {
  const name = input.name.trim();
  if (!name || name.length > 128) throw unprocessable('里程碑名称需 1 至 128 个字符');
  const ins = await queryOne<{ id: number }>(
    `INSERT INTO milestone (project_id, user_id, name, due_date, status)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'pending')) RETURNING id`,
    [input.projectId ?? null, actor.user.id, name, input.dueDate ?? null, input.status ?? null],
  );
  if (!ins) throw notFound('创建失败');
  const row = await queryOne<MilestoneRow>(`${MILESTONE_SELECT} WHERE m.id = $1`, [Number(ins.id)]);
  if (!row) throw notFound('里程碑不存在');
  return toMilestone(row);
}

export async function updateMilestone(
  id: number,
  input: { name?: string; dueDate?: string | null; status?: 'pending' | 'done' },
  actor: SessionContext,
): Promise<Milestone> {
  const row = await queryOne<{ user_id: number }>('SELECT user_id FROM milestone WHERE id = $1', [id]);
  if (!row) throw notFound('里程碑不存在');
  if (actor.user.role !== 'admin' && Number(row.user_id) !== actor.user.id) {
    throw notFound('里程碑不存在');
  }
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 128) throw unprocessable('里程碑名称需 1 至 128 个字符');
  }
  await query(
    `UPDATE milestone
        SET name = COALESCE($2, name),
            due_date = CASE WHEN $3::boolean THEN $4 ELSE due_date END,
            status = COALESCE($5, status),
            updated_at = now()
      WHERE id = $1`,
    [
      id,
      input.name?.trim() ?? null,
      input.dueDate !== undefined,
      input.dueDate ?? null,
      input.status ?? null,
    ],
  );
  const after = await queryOne<MilestoneRow>(`${MILESTONE_SELECT} WHERE m.id = $1`, [id]);
  if (!after) throw notFound('里程碑不存在');
  return toMilestone(after);
}

export async function deleteMilestone(id: number, actor: SessionContext): Promise<void> {
  const row = await queryOne<{ user_id: number }>('SELECT user_id FROM milestone WHERE id = $1', [id]);
  if (!row) throw notFound('里程碑不存在');
  if (actor.user.role !== 'admin' && Number(row.user_id) !== actor.user.id) {
    throw notFound('里程碑不存在');
  }
  await query('DELETE FROM milestone WHERE id = $1', [id]);
}

interface MeetingRow {
  id: number;
  project_id: number | null;
  project_name: string | null;
  title: string;
  location: string | null;
  start_at: Date;
  end_at: Date | null;
  note: string | null;
  created_at: Date;
  updated_at: Date;
}

const MEETING_SELECT = `
SELECT mt.id, mt.project_id, p.name AS project_name, mt.title, mt.location,
       mt.start_at, mt.end_at, mt.note, mt.created_at, mt.updated_at
  FROM meeting mt
  LEFT JOIN project p ON p.id = mt.project_id AND p.deleted_at IS NULL
`;

function toMeeting(r: MeetingRow): Meeting {
  return {
    id: Number(r.id),
    projectId: r.project_id === null ? null : Number(r.project_id),
    projectName: r.project_name,
    title: r.title,
    location: r.location,
    startAt: formatTimestamp(r.start_at) as string,
    endAt: formatTimestamp(r.end_at),
    note: r.note,
    createdAt: formatTimestamp(r.created_at) as string,
    updatedAt: formatTimestamp(r.updated_at) as string,
  };
}

export async function listMeetings(
  userId: number | undefined,
  range?: { from?: string; to?: string },
): Promise<Meeting[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (userId !== undefined) {
    params.push(userId);
    where.push(`mt.user_id = $${params.length}`);
  }
  if (range?.from) {
    params.push(range.from);
    where.push(`mt.start_at >= $${params.length}::timestamptz`);
  }
  if (range?.to) {
    params.push(range.to);
    where.push(`mt.start_at <= $${params.length}::timestamptz`);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query<MeetingRow>(
    `${MEETING_SELECT} ${clause} ORDER BY mt.start_at, mt.id`,
    params,
  );
  return rows.map(toMeeting);
}

export async function createMeeting(
  input: {
    title: string;
    startAt: string;
    endAt?: string | null;
    location?: string | null;
    projectId?: number | null;
    note?: string | null;
  },
  actor: SessionContext,
): Promise<Meeting> {
  const title = input.title.trim();
  if (!title || title.length > 128) throw unprocessable('会议标题需 1 至 128 个字符');
  if (!input.startAt) throw unprocessable('会议开始时间必填');
  const ins = await queryOne<{ id: number }>(
    `INSERT INTO meeting (project_id, user_id, title, location, start_at, end_at, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      input.projectId ?? null,
      actor.user.id,
      title,
      input.location ?? null,
      input.startAt,
      input.endAt ?? null,
      input.note ?? null,
    ],
  );
  if (!ins) throw notFound('创建失败');
  const row = await queryOne<MeetingRow>(`${MEETING_SELECT} WHERE mt.id = $1`, [Number(ins.id)]);
  if (!row) throw notFound('会议不存在');
  return toMeeting(row);
}

export async function deleteMeeting(id: number, actor: SessionContext): Promise<void> {
  const row = await queryOne<{ user_id: number }>('SELECT user_id FROM meeting WHERE id = $1', [id]);
  if (!row) throw notFound('会议不存在');
  if (actor.user.role !== 'admin' && Number(row.user_id) !== actor.user.id) {
    throw notFound('会议不存在');
  }
  await query('DELETE FROM meeting WHERE id = $1', [id]);
}
