import type { Idea } from '@blackhole/shared/types';
import { query, queryOne } from '../db.js';
import { notFound, unprocessable } from '../lib/errors.js';
import { formatTimestamp } from '../lib/serialize.js';
import type { SessionContext } from '../auth/service.js';

/**
 * 灵感 —— 执行包 §6.4 的 30~32 号接口。
 *
 * 规则（§6.5）：
 *  - content 1 至 2000 字
 *  - **只返回自己的**；管理员也不越权（§2.3 数据范围）
 *  - 软删；无权访问返回 404（不泄露存在性）
 */

interface IdeaRow {
  id: number;
  content: string;
  created_at: Date;
  updated_at: Date;
}

function toIdea(r: IdeaRow): Idea {
  return {
    id: Number(r.id),
    content: r.content,
    createdAt: formatTimestamp(r.created_at) as string,
    updatedAt: formatTimestamp(r.updated_at) as string,
  };
}

export interface ListIdeasResult {
  items: Idea[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listIdeas(
  userId: number,
  page: number,
  pageSize: number,
): Promise<ListIdeasResult> {
  const countRow = await queryOne<{ n: string }>(
    'SELECT count(*)::text AS n FROM idea WHERE user_id = $1 AND deleted_at IS NULL',
    [userId],
  );
  const rows = await query<IdeaRow>(
    `SELECT id, content, created_at, updated_at
       FROM idea
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT $2 OFFSET $3`,
    [userId, pageSize, (page - 1) * pageSize],
  );
  return {
    items: rows.map(toIdea),
    total: Number(countRow?.n ?? 0),
    page,
    pageSize,
  };
}

export async function createIdea(content: string, actor: SessionContext): Promise<Idea> {
  const text = content.trim();
  if (!text || text.length > 2000) throw unprocessable('内容需 1 至 2000 字');
  const ins = await queryOne<{ id: number }>(
    'INSERT INTO idea (user_id, content) VALUES ($1, $2) RETURNING id',
    [actor.user.id, text],
  );
  if (!ins) throw notFound('创建失败');
  const row = await queryOne<IdeaRow>(
    'SELECT id, content, created_at, updated_at FROM idea WHERE id = $1',
    [Number(ins.id)],
  );
  if (!row) throw notFound('灵感不存在');
  return toIdea(row);
}

/** 软删；不是自己的就 404（不泄露存在性） */
export async function deleteIdea(ideaId: number, actor: SessionContext): Promise<void> {
  const row = await queryOne<{ user_id: number }>(
    'SELECT user_id FROM idea WHERE id = $1 AND deleted_at IS NULL',
    [ideaId],
  );
  if (!row) throw notFound('灵感不存在');
  if (Number(row.user_id) !== actor.user.id) throw notFound('灵感不存在');
  await query('UPDATE idea SET deleted_at = now(), updated_at = now() WHERE id = $1', [ideaId]);
}
