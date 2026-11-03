import type { PoolClient } from 'pg';

/**
 * 用户工作台与模板复制 —— 执行包 §6.4 接口 10/13 的共同逻辑。
 *
 * D-13（500 人规模）：**必须批量 INSERT**，不能逐条循环。
 * 500 人 = 500 个 workspace + 2000 条 layout = 2500 行，
 * 逐条往返会慢到不可接受；这里用 unnest + CROSS JOIN 两条 SQL 搞定。
 */

/** 模板的 4 条 layout（执行包 §5.1 第 4 条），config 原样复制 */
const TEMPLATE_ITEMS: ReadonlyArray<readonly [string, number, number, number, string]> = [
  ['todo', 0, 6, 4, '{}'],
  ['project-progress', 1, 6, 4, '{}'],
  [
    'quick-entry',
    2,
    3,
    4,
    JSON.stringify({
      items: [
        { label: '项目', url: '/projects' },
        { label: '任务', url: '/tasks' },
        { label: '灵感', url: '/workspace' },
        { label: '设置', url: '/settings/profile' },
      ],
    }),
  ],
  ['idea', 3, 3, 4, '{}'],
];

/** 批量为这些用户创建 kind=user 的 workspace，并复制模板 4 条 layout */
export async function createUserWorkspaces(
  client: PoolClient,
  userIds: readonly number[],
): Promise<void> {
  if (userIds.length === 0) return;

  const ws = await client.query<{ id: string }>(
    `INSERT INTO workspace (user_id, kind, name, version)
     SELECT u, 'user', '我的工作台', 1
       FROM unnest($1::bigint[]) u
     RETURNING id`,
    [[...userIds]],
  );
  const workspaceIds = ws.rows.map((r) => Number(r.id));
  if (workspaceIds.length === 0) return;

  await client.query(
    `INSERT INTO workspace_layout (workspace_id, module_key, sort, w, h, config)
     SELECT w.id, t.module_key, t.sort, t.w, t.h, t.config::jsonb
       FROM unnest($1::bigint[]) AS w(id)
       CROSS JOIN (VALUES
         ('todo', 0, 6, 4, '{}'),
         ('project-progress', 1, 6, 4, '{}'),
         ('quick-entry', 2, 3, 4, $2),
         ('idea', 3, 3, 4, '{}')
       ) AS t(module_key, sort, w, h, config)`,
    [workspaceIds, TEMPLATE_ITEMS[2]?.[4] ?? '{}'],
  );
}
