import type { Risk, RiskLevel, RiskStats, RiskStatus } from '@workbench/shared/types';
import { query, queryOne } from '../db.js';
import { notFound, unprocessable } from '../lib/errors.js';
import { formatDate, formatTimestamp } from '../lib/serialize.js';
import type { SessionContext } from '../auth/service.js';

/**
 * 风险与问题 —— 用户端「风险问题管理」页（稿子图8）。
 *
 * 一张表用 kind 区分 risk（风险）/ issue（问题）。
 * 等级 level：low/medium/high；处理状态 status：open/handling/resolved。
 * 删除是软删（deleted_at），保留可追溯。
 */

interface RiskRow {
  id: number;
  project_id: number | null;
  project_name: string | null;
  code: string | null;
  kind: 'risk' | 'issue';
  title: string;
  description: string | null;
  level: RiskLevel;
  impact: RiskLevel | null;
  probability: RiskLevel | null;
  status: RiskStatus;
  owner_id: number | null;
  owner_name: string | null;
  due_date: string | null;
  response_plan: string | null;
  created_at: Date;
  updated_at: Date;
}

const RISK_SELECT = `
SELECT r.id, r.project_id, p.name AS project_name, r.code, r.kind, r.title,
       r.description, r.level, r.impact, r.probability, r.status,
       r.owner_id, u.name AS owner_name, r.due_date, r.response_plan,
       r.created_at, r.updated_at
  FROM risk r
  LEFT JOIN project p ON p.id = r.project_id AND p.deleted_at IS NULL
  LEFT JOIN app_user u ON u.id = r.owner_id
`;

function toRisk(r: RiskRow): Risk {
  return {
    id: Number(r.id),
    projectId: r.project_id === null ? null : Number(r.project_id),
    projectName: r.project_name,
    code: r.code,
    kind: r.kind,
    title: r.title,
    description: r.description,
    level: r.level,
    impact: r.impact,
    probability: r.probability,
    status: r.status,
    ownerId: r.owner_id === null ? null : Number(r.owner_id),
    ownerName: r.owner_name,
    dueDate: formatDate(r.due_date),
    responsePlan: r.response_plan,
    createdAt: formatTimestamp(r.created_at) as string,
    updatedAt: formatTimestamp(r.updated_at) as string,
  };
}

export interface ListRisksQuery {
  kind?: 'risk' | 'issue';
  level?: RiskLevel;
  status?: RiskStatus;
  projectId?: number;
  /** 管理员可指定看谁；普通用户强制只看自己 */
  userId?: number;
}

export async function listRisks(q: ListRisksQuery): Promise<Risk[]> {
  const where: string[] = ['r.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (q.userId !== undefined) {
    params.push(q.userId);
    where.push(`r.user_id = $${params.length}`);
  }
  if (q.kind !== undefined) {
    params.push(q.kind);
    where.push(`r.kind = $${params.length}`);
  }
  if (q.level !== undefined) {
    params.push(q.level);
    where.push(`r.level = $${params.length}`);
  }
  if (q.status !== undefined) {
    params.push(q.status);
    where.push(`r.status = $${params.length}`);
  }
  if (q.projectId !== undefined) {
    params.push(q.projectId);
    where.push(`r.project_id = $${params.length}`);
  }
  const rows = await query<RiskRow>(
    `${RISK_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY r.created_at DESC, r.id DESC`,
    params,
  );
  return rows.map(toRisk);
}

export interface RiskInput {
  title: string;
  kind?: 'risk' | 'issue';
  code?: string | null;
  projectId?: number | null;
  description?: string | null;
  level?: RiskLevel;
  impact?: RiskLevel | null;
  probability?: RiskLevel | null;
  ownerId?: number | null;
  dueDate?: string | null;
  responsePlan?: string | null;
}

export async function createRisk(input: RiskInput, actor: SessionContext): Promise<Risk> {
  const title = input.title.trim();
  if (!title || title.length > 256) throw unprocessable('标题需 1 至 256 个字符');
  const ins = await queryOne<{ id: number }>(
    `INSERT INTO risk
       (project_id, user_id, code, kind, title, description, level, impact, probability,
        status, owner_id, due_date, response_plan)
     VALUES ($1, $2, $3, COALESCE($4, 'risk'), $5, $6, COALESCE($7, 'medium'), $8, $9,
             'open', $10, $11, $12)
     RETURNING id`,
    [
      input.projectId ?? null,
      actor.user.id,
      input.code ?? null,
      input.kind ?? null,
      title,
      input.description ?? null,
      input.level ?? null,
      input.impact ?? null,
      input.probability ?? null,
      input.ownerId ?? null,
      input.dueDate ?? null,
      input.responsePlan ?? null,
    ],
  );
  if (!ins) throw notFound('创建失败');
  const row = await queryOne<RiskRow>(`${RISK_SELECT} WHERE r.id = $1`, [Number(ins.id)]);
  if (!row) throw notFound('风险不存在');
  return toRisk(row);
}

export async function updateRisk(
  id: number,
  input: Partial<RiskInput> & { status?: RiskStatus },
  actor: SessionContext,
): Promise<Risk> {
  const row = await queryOne<{ user_id: number }>(
    'SELECT user_id FROM risk WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!row) throw notFound('风险不存在');
  if (actor.user.role !== 'admin' && Number(row.user_id) !== actor.user.id) {
    throw notFound('风险不存在');
  }
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title || title.length > 256) throw unprocessable('标题需 1 至 256 个字符');
  }
  await query(
    `UPDATE risk
        SET title = COALESCE($2, title),
            kind = COALESCE($3, kind),
            code = CASE WHEN $4::boolean THEN $5 ELSE code END,
            project_id = CASE WHEN $6::boolean THEN $7 ELSE project_id END,
            description = CASE WHEN $8::boolean THEN $9 ELSE description END,
            level = COALESCE($10, level),
            impact = CASE WHEN $11::boolean THEN $12 ELSE impact END,
            probability = CASE WHEN $13::boolean THEN $14 ELSE probability END,
            status = COALESCE($15, status),
            owner_id = CASE WHEN $16::boolean THEN $17 ELSE owner_id END,
            due_date = CASE WHEN $18::boolean THEN $19 ELSE due_date END,
            response_plan = CASE WHEN $20::boolean THEN $21 ELSE response_plan END,
            updated_at = now()
      WHERE id = $1`,
    [
      id,
      input.title?.trim() ?? null,
      input.kind ?? null,
      input.code !== undefined,
      input.code ?? null,
      input.projectId !== undefined,
      input.projectId ?? null,
      input.description !== undefined,
      input.description ?? null,
      input.level ?? null,
      input.impact !== undefined,
      input.impact ?? null,
      input.probability !== undefined,
      input.probability ?? null,
      input.status ?? null,
      input.ownerId !== undefined,
      input.ownerId ?? null,
      input.dueDate !== undefined,
      input.dueDate ?? null,
      input.responsePlan !== undefined,
      input.responsePlan ?? null,
    ],
  );
  const after = await queryOne<RiskRow>(`${RISK_SELECT} WHERE r.id = $1`, [id]);
  if (!after) throw notFound('风险不存在');
  return toRisk(after);
}

/** 软删 */
export async function deleteRisk(id: number, actor: SessionContext): Promise<void> {
  const row = await queryOne<{ user_id: number }>(
    'SELECT user_id FROM risk WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!row) throw notFound('风险不存在');
  if (actor.user.role !== 'admin' && Number(row.user_id) !== actor.user.id) {
    throw notFound('风险不存在');
  }
  await query('UPDATE risk SET deleted_at = now(), updated_at = now() WHERE id = $1', [id]);
}

/** 分布统计（等级 / 状态 / 影响×概率矩阵） */
export async function getRiskStats(userId?: number): Promise<RiskStats> {
  const scope = userId !== undefined ? 'AND r.user_id = $1' : '';
  const params = userId !== undefined ? [userId] : [];

  const levelRow = await queryOne<{ high: string; medium: string; low: string }>(
    `SELECT count(*) FILTER (WHERE r.level = 'high')::text AS high,
            count(*) FILTER (WHERE r.level = 'medium')::text AS medium,
            count(*) FILTER (WHERE r.level = 'low')::text AS low
       FROM risk r WHERE r.deleted_at IS NULL ${scope}`,
    params,
  );
  const statusRow = await queryOne<{ open: string; handling: string; resolved: string }>(
    `SELECT count(*) FILTER (WHERE r.status = 'open')::text AS open,
            count(*) FILTER (WHERE r.status = 'handling')::text AS handling,
            count(*) FILTER (WHERE r.status = 'resolved')::text AS resolved
       FROM risk r WHERE r.deleted_at IS NULL ${scope}`,
    params,
  );
  const kindRow = await queryOne<{ risk: string; issue: string }>(
    `SELECT count(*) FILTER (WHERE r.kind = 'risk')::text AS risk,
            count(*) FILTER (WHERE r.kind = 'issue')::text AS issue
       FROM risk r WHERE r.deleted_at IS NULL ${scope}`,
    params,
  );
  const matrixRow = await query<{
    impact: RiskLevel | null;
    probability: RiskLevel | null;
    count: string;
  }>(
    `SELECT r.impact, r.probability, count(*)::text AS count
       FROM risk r
      WHERE r.deleted_at IS NULL AND r.impact IS NOT NULL AND r.probability IS NOT NULL ${scope}
      GROUP BY 1, 2`,
    params,
  );

  const matrix: Record<string, number> = {};
  for (const row of matrixRow) {
    matrix[`${row.impact}:${row.probability}`] = Number(row.count);
  }

  const high = Number(levelRow?.high ?? 0);
  const medium = Number(levelRow?.medium ?? 0);
  const low = Number(levelRow?.low ?? 0);
  const total = high + medium + low;

  return {
    total,
    byLevel: {
      high: { count: high, percent: total === 0 ? 0 : Math.round((high / total) * 100) },
      medium: { count: medium, percent: total === 0 ? 0 : Math.round((medium / total) * 100) },
      low: { count: low, percent: total === 0 ? 0 : Math.round((low / total) * 100) },
    },
    byStatus: {
      open: Number(statusRow?.open ?? 0),
      handling: Number(statusRow?.handling ?? 0),
      resolved: Number(statusRow?.resolved ?? 0),
    },
    byKind: { risk: Number(kindRow?.risk ?? 0), issue: Number(kindRow?.issue ?? 0) },
    matrix,
  };
}
