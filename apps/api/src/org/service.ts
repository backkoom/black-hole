import type { OrgNode } from '@workbench/shared/types';
import { query, queryOne, withTransaction } from '../db.js';
import { getConfig } from '../config.js';
import { unprocessable, notFound } from '../lib/errors.js';

/**
 * 组织架构 —— 执行包 §6.4 的 5~8 号接口。
 *
 * 规则（§6.5 + D-07）：
 *  - level = parent.level + 1；**层级数不设固定上限**，业务上限走 MAX_ORG_LEVEL
 *  - 同一 parent 下 name 唯一（新增/改名/移动都校验，重复 422）
 *  - path 形如 /1/2/3/；移动节点必须在一个事务里重算整棵子树的 path/level
 *  - 根节点只有一个且不可移动，不能通过 API 新增第二个根
 *  - 移动不能成环（不能移到自身或子孙下）
 *  - **人员必须挂在末级（无子节点的节点）上**；有人员的节点不允许被加上子节点
 */

interface OrgRow {
  id: number;
  parent_id: number | null;
  level: number;
  name: string;
  path: string;
  sort: number;
}

interface OrgWithCountRow extends OrgRow {
  user_count: string;
}

const ORG_COLUMNS = 'id, parent_id, level, name, path, sort';

/** 直接挂在该节点的用户数（含 disabled），不递归 —— 执行包 §6.5 明确要求 */
const USER_COUNT_SQL = `
  SELECT o.id, o.parent_id, o.level, o.name, o.sort,
         (SELECT count(*) FROM app_user u WHERE u.org_id = o.id) AS user_count
  FROM org o
`;

export async function getOrgTree(): Promise<OrgNode[]> {
  const rows = await query<OrgWithCountRow>(`${USER_COUNT_SQL} ORDER BY level, sort, id`);
  const byId = new Map<number, OrgNode>();
  const roots: OrgNode[] = [];

  for (const r of rows) {
    byId.set(Number(r.id), {
      id: Number(r.id),
      parentId: r.parent_id === null ? null : Number(r.parent_id),
      level: Number(r.level),
      name: r.name,
      sort: Number(r.sort),
      userCount: Number(r.user_count),
      children: [],
    });
  }
  for (const r of rows) {
    const node = byId.get(Number(r.id));
    if (!node) continue;
    const parent = r.parent_id === null ? null : byId.get(Number(r.parent_id));
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

async function findOrg(id: number): Promise<OrgRow | null> {
  return queryOne<OrgRow>(`SELECT ${ORG_COLUMNS} FROM org WHERE id = $1`, [id]);
}

/** 该节点下是否有子节点 */
async function hasChildren(id: number): Promise<boolean> {
  const row = await queryOne<{ n: string }>(
    'SELECT count(*)::text AS n FROM org WHERE parent_id = $1',
    [id],
  );
  return Number(row?.n ?? 0) > 0;
}

/** 该节点下是否挂了人员 */
async function hasUsers(id: number): Promise<boolean> {
  const row = await queryOne<{ n: string }>(
    'SELECT count(*)::text AS n FROM app_user WHERE org_id = $1',
    [id],
  );
  return Number(row?.n ?? 0) > 0;
}

/** 同级 name 是否重复（排除自身） */
async function siblingNameExists(
  parentId: number | null,
  name: string,
  excludeId?: number,
): Promise<boolean> {
  const row = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM org
      WHERE COALESCE(parent_id, 0) = COALESCE($1, 0)
        AND name = $2
        AND ($3::bigint IS NULL OR id <> $3)`,
    [parentId, name, excludeId ?? null],
  );
  return Number(row?.n ?? 0) > 0;
}

/** 新增节点 */
export async function createOrg(parentId: number, name: string): Promise<OrgNode> {
  const cfg = getConfig();
  const parent = await findOrg(parentId);
  if (!parent) throw notFound('上级节点不存在');

  const level = Number(parent.level) + 1;
  if (level > cfg.MAX_ORG_LEVEL) {
    throw unprocessable(`层级不能超过 ${cfg.MAX_ORG_LEVEL} 级`);
  }
  if (await siblingNameExists(parentId, name)) {
    throw unprocessable('同一上级下已存在同名节点');
  }
  // 末级约束：父节点挂了人员 → 加子节点后父节点不再是末级
  if (await hasUsers(parentId)) {
    throw unprocessable('该节点下仍有人员，请先把人员移到新的末级节点');
  }

  const sortRow = await queryOne<{ mx: string | null }>(
    'SELECT max(sort)::text AS mx FROM org WHERE COALESCE(parent_id, 0) = COALESCE($1, 0)',
    [parentId],
  );
  const sort = Number(sortRow?.mx ?? -1) + 1;

  return withTransaction(async (client) => {
    const ins = await client.query<{ id: string }>(
      `INSERT INTO org (parent_id, level, name, path, sort)
       VALUES ($1, $2, $3, '/tmp/', $4) RETURNING id`,
      [parentId, level, name, sort],
    );
    const id = Number(ins.rows[0]?.id);
    const path = `${parent.path}${id}/`;
    await client.query('UPDATE org SET path = $2 WHERE id = $1', [id, path]);
    const node = await client.query<OrgRow>(`SELECT ${ORG_COLUMNS} FROM org WHERE id = $1`, [id]);
    const r = node.rows[0] as OrgRow;
    return {
      id: Number(r.id),
      parentId: r.parent_id === null ? null : Number(r.parent_id),
      level: Number(r.level),
      name: r.name,
      sort: Number(r.sort),
      userCount: 0,
      children: [],
    };
  });
}

/** 判断 candidateId 是否在 ancestorId 的子树里（含自身） */
async function isDescendant(ancestorId: number, candidateId: number): Promise<boolean> {
  const row = await queryOne<{ n: string }>(
    `WITH RECURSIVE sub AS (
       SELECT id FROM org WHERE id = $1
       UNION ALL
       SELECT o.id FROM org o JOIN sub s ON o.parent_id = s.id
     )
     SELECT count(*)::text AS n FROM sub WHERE id = $2`,
    [ancestorId, candidateId],
  );
  return Number(row?.n ?? 0) > 0;
}

/** 修改 / 移动 / 排序 */
export async function updateOrg(
  id: number,
  input: { name?: string; parentId?: number; sort?: number },
): Promise<OrgNode> {
  const cfg = getConfig();
  const node = await findOrg(id);
  if (!node) throw notFound('节点不存在');

  // 改名
  if (input.name !== undefined && input.name !== node.name) {
    if (await siblingNameExists(node.parent_id, input.name, id)) {
      throw unprocessable('同一上级下已存在同名节点');
    }
    await query('UPDATE org SET name = $2, updated_at = now() WHERE id = $1', [id, input.name]);
  }

  // 排序
  if (input.sort !== undefined) {
    await query('UPDATE org SET sort = $2, updated_at = now() WHERE id = $1', [id, input.sort]);
  }

  // 移动
  if (input.parentId !== undefined && input.parentId !== node.parent_id) {
    if (node.parent_id === null) {
      throw unprocessable('根节点不可移动');
    }
    const newParent = await findOrg(input.parentId);
    if (!newParent) throw notFound('上级节点不存在');
    if (input.parentId === id || (await isDescendant(id, input.parentId))) {
      throw unprocessable('不能移动到自己的子孙下');
    }
    const newLevel = Number(newParent.level) + 1;
    if (newLevel > cfg.MAX_ORG_LEVEL) {
      throw unprocessable(`层级不能超过 ${cfg.MAX_ORG_LEVEL} 级`);
    }
    if (await siblingNameExists(input.parentId, node.name, id)) {
      throw unprocessable('同一上级下已存在同名节点');
    }
    // 末级约束：目标父节点挂了人员 → 移动后它不再是末级
    if (await hasUsers(input.parentId)) {
      throw unprocessable('该节点下仍有人员，请先把人员移到新的末级节点');
    }
    // 本节点挂了人员 → 移动后必须仍是末级（不能有子节点）
    if ((await hasUsers(id)) && (await hasChildren(id))) {
      throw unprocessable('该节点下仍有人员与子节点，请先把人员移到新的末级节点');
    }

    await withTransaction(async (client) => {
      const newPath = `${newParent.path}${id}/`;
      // 重算整棵子树的 path / level
      await client.query(
        `WITH RECURSIVE sub AS (
           SELECT id, $3::int AS level, $2::text AS path FROM org WHERE id = $1
           UNION ALL
           SELECT o.id, s.level + 1, s.path || o.id || '/'
             FROM org o JOIN sub s ON o.parent_id = s.id
         )
         UPDATE org o SET path = sub.path, level = sub.level, updated_at = now()
           FROM sub WHERE o.id = sub.id`,
        [id, newPath, newLevel],
      );
      // 父节点与排序
      const sortRow = await client.query<{ mx: string | null }>(
        'SELECT max(sort)::text AS mx FROM org WHERE COALESCE(parent_id, 0) = COALESCE($1, 0) AND id <> $2',
        [input.parentId, id],
      );
      const sort = Number(sortRow.rows[0]?.mx ?? -1) + 1;
      await client.query(
        'UPDATE org SET parent_id = $2, sort = $3, updated_at = now() WHERE id = $1',
        [id, input.parentId, sort],
      );
    });
  }

  const after = await findOrg(id);
  if (!after) throw notFound('节点不存在');
  const countRow = await queryOne<{ n: string }>(
    'SELECT count(*)::text AS n FROM app_user WHERE org_id = $1',
    [id],
  );
  return {
    id: Number(after.id),
    parentId: after.parent_id === null ? null : Number(after.parent_id),
    level: Number(after.level),
    name: after.name,
    sort: Number(after.sort),
    userCount: Number(countRow?.n ?? 0),
    children: [],
  };
}

/** 删除节点 */
export async function deleteOrg(id: number): Promise<void> {
  const node = await findOrg(id);
  if (!node) throw notFound('节点不存在');
  if (node.parent_id === null) {
    throw unprocessable('根节点不可删除');
  }
  if (await hasChildren(id)) {
    throw unprocessable('该节点下仍有子节点，不能删除');
  }
  if (await hasUsers(id)) {
    throw unprocessable('该节点下仍有人员，不能删除');
  }
  await query('DELETE FROM org WHERE id = $1', [id]);
}
