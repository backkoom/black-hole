import type { LayoutItem, Workspace } from '@workbench/shared/types';
import {
  ACTIVE_MODULE_KEYS,
  LAYOUT_RULES,
  MODULE_BY_KEY,
  validateModuleConfig,
} from '@workbench/shared/modules';
import { query, queryOne, withTransaction } from '../db.js';
import { conflict, notFound, unprocessable } from '../lib/errors.js';

/**
 * 工作台与模板 —— 执行包 §6.4 的 15~19 号接口。
 *
 * 保存链路（§7.6 强制）：**CAS，不要先 SELECT 再 UPDATE**。
 *   UPDATE workspace SET version = version + 1, updated_at = now()
 *    WHERE id = $1 AND version = $2 RETURNING version
 * 影响 0 行 → 直接 409，并把服务端**当前** version 与 items 放进 data 供前端选「刷新/覆盖」。
 *
 * 校验（§6.5）：
 *  - version 必填；items 数组；moduleKey 只能是 12 个 active 模块
 *  - w ∈ {3,4,6,12} 且不小于该模块 minSize.w；h ∈ [2,12] 且不小于 minSize.h
 *  - divider 只能 w=12、h=2；非 divider 不重复；divider ≤ 3；总数 ≤ 14
 *  - config 按模块 schema 校验，≤ 64KB
 *  - 名称 1~128、副标题 0~256，去首尾空格，空副标题存 null
 */

interface WorkspaceRow {
  id: number;
  user_id: number | null;
  kind: 'user' | 'template';
  name: string;
  subtitle: string | null;
  version: number;
}

interface LayoutRow {
  module_key: string;
  sort: number;
  w: number;
  h: number;
  config: Record<string, unknown>;
}

async function loadLayout(workspaceId: number): Promise<LayoutItem[]> {
  const rows = await query<LayoutRow>(
    'SELECT module_key, sort, w, h, config FROM workspace_layout WHERE workspace_id = $1 ORDER BY sort',
    [workspaceId],
  );
  return rows.map((r) => ({
    moduleKey: r.module_key,
    w: r.w as 3 | 4 | 6 | 12,
    h: Number(r.h),
    config: r.config ?? {},
  }));
}

function toWorkspace(row: WorkspaceRow, items: LayoutItem[]): Workspace {
  return {
    id: Number(row.id),
    name: row.name,
    subtitle: row.subtitle,
    version: Number(row.version),
    items,
  };
}

/** 模板 workspace：workspace 表里 kind='template' 的唯一一行 */
export async function getTemplate(): Promise<Workspace> {
  const row = await queryOne<WorkspaceRow>(
    "SELECT id, user_id, kind, name, subtitle, version FROM workspace WHERE kind = 'template'",
  );
  if (!row) throw notFound('模板不存在，请先执行种子');
  return toWorkspace(row, await loadLayout(Number(row.id)));
}

/** 校验布局数组 —— 通过则返回规范化后的 items */
export function validateItems(raw: unknown): LayoutItem[] {
  if (!Array.isArray(raw)) throw unprocessable('items 必须是数组');
  if (raw.length > LAYOUT_RULES.maxModules) {
    throw unprocessable(`模块总数不能超过 ${LAYOUT_RULES.maxModules} 个`);
  }

  const seen = new Set<string>();
  let dividers = 0;
  const items: LayoutItem[] = [];

  for (const item of raw) {
    const it = item as Partial<LayoutItem> & { moduleKey?: unknown };
    const moduleKey = String(it.moduleKey ?? '');
    if (!ACTIVE_MODULE_KEYS.includes(moduleKey)) {
      throw unprocessable(`模块不可用：${moduleKey || '(空)'}`);
    }
    const def = MODULE_BY_KEY[moduleKey];
    if (!def) throw unprocessable(`模块不可用：${moduleKey}`);

    const w = Number(it.w);
    const h = Number(it.h);
    if (!LAYOUT_RULES.allowedWidths.includes(w as 3 | 4 | 6 | 12)) {
      throw unprocessable(`模块宽度只能是 ${LAYOUT_RULES.allowedWidths.join('/')}`);
    }
    if (!Number.isInteger(h) || h < LAYOUT_RULES.minHeight || h > LAYOUT_RULES.maxHeight) {
      throw unprocessable(`模块高度必须是 ${LAYOUT_RULES.minHeight} 至 ${LAYOUT_RULES.maxHeight} 的整数`);
    }
    if (w < def.minSize.w || h < def.minSize.h) {
      throw unprocessable(`模块 ${def.name} 不能小于最小尺寸 ${def.minSize.w}×${def.minSize.h}`);
    }

    if (moduleKey === 'divider') {
      dividers += 1;
      if (dividers > LAYOUT_RULES.maxDividers) {
        throw unprocessable(`分割线最多 ${LAYOUT_RULES.maxDividers} 条`);
      }
      if (w !== LAYOUT_RULES.dividerSize.w || h !== LAYOUT_RULES.dividerSize.h) {
        throw unprocessable('分割线固定为 12×2，不允许缩放');
      }
    } else {
      if (seen.has(moduleKey)) {
        throw unprocessable(`模块 ${def.name} 重复`);
      }
      seen.add(moduleKey);
    }

    // config 按模块 schema 校验（≤64KB 在 validateModuleConfig 里）
    let config: unknown;
    try {
      config = validateModuleConfig(moduleKey, it.config ?? {});
    } catch (err) {
      throw unprocessable(`模块 ${def.name} 的配置不合法：${(err as Error).message}`);
    }

    items.push({
      moduleKey,
      w: w as 3 | 4 | 6 | 12,
      h,
      config: config as Record<string, unknown>,
    });
  }
  return items;
}

function normalizeName(name: string | undefined, current: string): string {
  if (name === undefined) return current;
  const v = name.trim();
  if (!v || v.length > 128) throw unprocessable('名称需 1 至 128 个字符');
  return v;
}

function normalizeSubtitle(subtitle: string | undefined, current: string | null): string | null {
  if (subtitle === undefined) return current;
  const v = subtitle.trim();
  if (v.length > 256) throw unprocessable('副标题不能超过 256 个字符');
  return v === '' ? null : v;
}

/** 用 CAS 保存布局：先原子 +1 版本，再替换 layout 行；整体在同一事务 */
async function saveLayout(
  workspaceId: number,
  version: number,
  items: LayoutItem[],
): Promise<Workspace> {
  return withTransaction(async (client) => {
    const bumped = await client.query<{ version: number }>(
      `UPDATE workspace SET version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $2 RETURNING version`,
      [workspaceId, version],
    );
    if (bumped.rows.length === 0) {
      // 版本不匹配 → 取服务端当前状态交给前端选「刷新」或「覆盖」
      const current = await client.query<WorkspaceRow>(
        'SELECT id, user_id, kind, name, subtitle, version FROM workspace WHERE id = $1',
        [workspaceId],
      );
      const row = current.rows[0];
      const curItems = await client.query<LayoutRow>(
        'SELECT module_key, sort, w, h, config FROM workspace_layout WHERE workspace_id = $1 ORDER BY sort',
        [workspaceId],
      );
      throw conflict('布局已被他人修改，请选择刷新或覆盖', {
        version: row ? Number(row.version) : null,
        items: curItems.rows.map((r) => ({
          moduleKey: r.module_key,
          w: Number(r.w),
          h: Number(r.h),
          config: r.config ?? {},
        })),
      });
    }

    await client.query('DELETE FROM workspace_layout WHERE workspace_id = $1', [workspaceId]);
    for (const [i, item] of items.entries()) {
      await client.query(
        `INSERT INTO workspace_layout (workspace_id, module_key, sort, w, h, config)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [workspaceId, item.moduleKey, i, item.w, item.h, JSON.stringify(item.config)],
      );
    }

    const after = await client.query<WorkspaceRow>(
      'SELECT id, user_id, kind, name, subtitle, version FROM workspace WHERE id = $1',
      [workspaceId],
    );
    const row = after.rows[0] as WorkspaceRow;
    return toWorkspace(row, items);
  });
}

/** 保存模板布局 —— 同一套 CAS，但 WHERE id = 模板 workspace id（不要复用用户工作台的 id） */
export async function updateTemplate(input: {
  name?: string;
  subtitle?: string;
  version: number;
  items: unknown;
}): Promise<Workspace> {
  const row = await queryOne<WorkspaceRow>(
    "SELECT id, user_id, kind, name, subtitle, version FROM workspace WHERE kind = 'template'",
  );
  if (!row) throw notFound('模板不存在，请先执行种子');

  const items = validateItems(input.items);
  const name = normalizeName(input.name, row.name);
  const subtitle = normalizeSubtitle(input.subtitle, row.subtitle);

  const saved = await saveLayout(Number(row.id), input.version, items);
  if (name !== row.name || subtitle !== row.subtitle) {
    await query('UPDATE workspace SET name = $2, subtitle = $3 WHERE id = $1', [
      Number(row.id),
      name,
      subtitle,
    ]);
    saved.name = name;
    saved.subtitle = subtitle;
  }
  return saved;
}

/** 当前用户的工作台；没有则复制模板（幂等，重复请求不重复创建） */
export async function getMyWorkspace(userId: number): Promise<Workspace> {
  const existing = await queryOne<WorkspaceRow>(
    "SELECT id, user_id, kind, name, subtitle, version FROM workspace WHERE user_id = $1 AND kind = 'user'",
    [userId],
  );
  if (existing) return toWorkspace(existing, await loadLayout(Number(existing.id)));

  return withTransaction(async (client) => {
    // 并发下可能已被别的请求建过 → ON CONFLICT DO NOTHING，然后回查
    await client.query(
      `INSERT INTO workspace (user_id, kind, name, subtitle, version)
       VALUES ($1, 'user', '我的工作台', NULL, 1)
       ON CONFLICT (user_id) WHERE kind = 'user' DO NOTHING`,
      [userId],
    );
    const ws = await client.query<WorkspaceRow>(
      "SELECT id, user_id, kind, name, subtitle, version FROM workspace WHERE user_id = $1 AND kind = 'user'",
      [userId],
    );
    const row = ws.rows[0] as WorkspaceRow;

    const tpl = await client.query<WorkspaceRow>(
      "SELECT id FROM workspace WHERE kind = 'template'",
    );
    const tplId = tpl.rows[0] ? Number((tpl.rows[0] as { id: number }).id) : null;
    if (tplId !== null) {
      const tplItems = await client.query<LayoutRow>(
        'SELECT module_key, sort, w, h, config FROM workspace_layout WHERE workspace_id = $1 ORDER BY sort',
        [tplId],
      );
      for (const [i, r] of tplItems.rows.entries()) {
        await client.query(
          `INSERT INTO workspace_layout (workspace_id, module_key, sort, w, h, config)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [Number(row.id), r.module_key, i, r.w, r.h, JSON.stringify(r.config ?? {})],
        );
      }
    }
    const items = await client.query<LayoutRow>(
      'SELECT module_key, sort, w, h, config FROM workspace_layout WHERE workspace_id = $1 ORDER BY sort',
      [Number(row.id)],
    );
    return toWorkspace(
      row,
      items.rows.map((r) => ({
        moduleKey: r.module_key,
        w: Number(r.w) as 3 | 4 | 6 | 12,
        h: Number(r.h),
        config: r.config ?? {},
      })),
    );
  });
}

/** 修改名称/副标题 —— **不参与 version**，不触发 409 */
export async function updateMyWorkspaceMeta(
  userId: number,
  input: { name?: string; subtitle?: string },
): Promise<Workspace> {
  const row = await queryOne<WorkspaceRow>(
    "SELECT id, user_id, kind, name, subtitle, version FROM workspace WHERE user_id = $1 AND kind = 'user'",
    [userId],
  );
  if (!row) throw notFound('工作台不存在');
  const name = normalizeName(input.name, row.name);
  const subtitle = normalizeSubtitle(input.subtitle, row.subtitle);
  await query('UPDATE workspace SET name = $2, subtitle = $3, updated_at = now() WHERE id = $1', [
    Number(row.id),
    name,
    subtitle,
  ]);
  return toWorkspace({ ...row, name, subtitle }, await loadLayout(Number(row.id)));
}

/** 保存我的布局 */
export async function updateMyLayout(
  userId: number,
  input: { version: number; items: unknown },
): Promise<Workspace> {
  const row = await queryOne<WorkspaceRow>(
    "SELECT id, user_id, kind, name, subtitle, version FROM workspace WHERE user_id = $1 AND kind = 'user'",
    [userId],
  );
  if (!row) throw notFound('工作台不存在');
  const items = validateItems(input.items);
  return saveLayout(Number(row.id), input.version, items);
}
