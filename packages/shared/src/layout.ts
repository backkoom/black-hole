import { LAYOUT_RULES, MODULE_BY_KEY } from './modules.js';

/**
 * 工作台布局的**纯函数层** —— 执行包 §7.6「编辑器算法」。
 *
 * 前后端共用这一份：前端拖拽时用它算插入位置/吸附尺寸/预校验，
 * 后端保存时用它做最终校验。
 *
 * 单独抽成纯函数是为了能写单测（§7.6 明确要求「写单测覆盖 A/B/C 向下」）。
 */

export type LayoutWidth = 3 | 4 | 6 | 12;

export interface LayoutItemLike {
  moduleKey: string;
  w: number;
  h: number;
  config?: Record<string, unknown>;
}

/** 可用的宽度档位（3/4/6/12） */
export const ALLOWED_WIDTHS: readonly LayoutWidth[] = LAYOUT_RULES.allowedWidths;

/**
 * 宽度吸附：吸附到最近的合法档位（3/4/6/12）。
 * 小于 3 → 3；大于 12 → 12；之间取最近的档位（同距时取小的）。
 */
export function snapWidth(raw: number): LayoutWidth {
  if (!Number.isFinite(raw)) return 3;
  let best: LayoutWidth = ALLOWED_WIDTHS[0] as LayoutWidth;
  let bestDist = Infinity;
  for (const w of ALLOWED_WIDTHS) {
    const dist = Math.abs(raw - w);
    if (dist < bestDist) {
      best = w;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * 高度取整：2 至 12 的整数，且不小于该模块的 minSize.h。
 * divider 固定 12×2，不允许缩放。
 */
export function clampHeight(raw: number, moduleKey: string): number {
  const def = MODULE_BY_KEY[moduleKey];
  const minH = def?.minSize.h ?? LAYOUT_RULES.minHeight;
  const maxH = LAYOUT_RULES.maxHeight;
  let h = Math.round(Number.isFinite(raw) ? raw : minH);
  if (h < minH) h = minH;
  if (h > maxH) h = maxH;
  return h;
}

/** divider 固定尺寸，不允许缩放 */
export function isFixedSize(moduleKey: string): boolean {
  return moduleKey === 'divider';
}

/**
 * 计算插入下标：按**指针所在模块的中点**决定插到该模块前还是后（§7.6）。
 * pointerRatio < 0.5 → 插前；>= 0.5 → 插后。
 */
export function computeInsertIndex(pointerIndex: number, pointerRatio: number): number {
  return pointerRatio < 0.5 ? pointerIndex : pointerIndex + 1;
}

/**
 * 排序：把 from 位置的元素移到 to 位置（§7.6 用 dnd-kit 的 arrayMove 语义）。
 *
 * ⚠️ **向下拖动不能差一位**：arrayMove 的语义是「取出 from，再插到 to」，
 * 元素最终落到 to 这个下标上。调用方必须直接用返回值，不要自己再补偿一格。
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length) return next;
  if (to < 0 || to >= next.length) return next;
  if (from === to) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/** 删除后重排 —— 顺序即 sort，删完重新编号 */
export function reindex<T extends LayoutItemLike>(items: readonly T[]): T[] {
  return items.map((item, index) => ({ ...item, sort: index }));
}

export interface LayoutValidation {
  ok: boolean;
  message?: string;
}

/**
 * 布局校验（§7.6）：非 divider 重复拒绝；divider 最多 3；总数最多 14；
 * 尺寸不合法拒绝。**超限要提示，不静默丢弃**。
 */
export function validateLayout(items: readonly LayoutItemLike[]): LayoutValidation {
  if (items.length > LAYOUT_RULES.maxModules) {
    return { ok: false, message: `模块总数不能超过 ${LAYOUT_RULES.maxModules} 个` };
  }
  const seen = new Set<string>();
  let dividers = 0;
  for (const item of items) {
    const def = MODULE_BY_KEY[item.moduleKey];
    if (!def) {
      return { ok: false, message: `模块不可用：${item.moduleKey || '(空)'}` };
    }
    if (!ALLOWED_WIDTHS.includes(item.w as LayoutWidth)) {
      return { ok: false, message: `模块宽度只能是 ${ALLOWED_WIDTHS.join('/')}` };
    }
    if (item.h < def.minSize.h || item.h > LAYOUT_RULES.maxHeight) {
      return {
        ok: false,
        message: `模块 ${def.name} 的高度必须在 ${def.minSize.h} 至 ${LAYOUT_RULES.maxHeight} 之间`,
      };
    }
    if (item.moduleKey === 'divider') {
      dividers += 1;
      if (dividers > LAYOUT_RULES.maxDividers) {
        return { ok: false, message: `分割线最多 ${LAYOUT_RULES.maxDividers} 条` };
      }
      if (item.w !== LAYOUT_RULES.dividerSize.w || item.h !== LAYOUT_RULES.dividerSize.h) {
        return { ok: false, message: '分割线固定为 12×2，不允许缩放' };
      }
    } else {
      if (seen.has(item.moduleKey)) {
        return { ok: false, message: `模块 ${def.name} 重复` };
      }
      seen.add(item.moduleKey);
    }
  }
  return { ok: true };
}

/** 能否再添加某个模块（重复 / 上限 / 占位模块） */
export function canAddModule(
  items: readonly LayoutItemLike[],
  moduleKey: string,
): LayoutValidation {
  const def = MODULE_BY_KEY[moduleKey];
  if (!def) return { ok: false, message: `模块不可用：${moduleKey}` };
  if (def.status !== 'active') {
    return { ok: false, message: `${def.name}还在迭代中，暂不可用` };
  }
  if (moduleKey === 'divider') {
    const dividers = items.filter((i) => i.moduleKey === 'divider').length;
    if (dividers >= LAYOUT_RULES.maxDividers) {
      return { ok: false, message: `分割线最多 ${LAYOUT_RULES.maxDividers} 条` };
    }
  } else if (items.some((i) => i.moduleKey === moduleKey)) {
    return { ok: false, message: `${def.name}已经在布局里了` };
  }
  if (items.length >= LAYOUT_RULES.maxModules) {
    return { ok: false, message: `模块总数不能超过 ${LAYOUT_RULES.maxModules} 个` };
  }
  return { ok: true };
}

/** 模块的默认尺寸（新增时用） */
export function defaultSizeOf(moduleKey: string): { w: LayoutWidth; h: number } {
  const def = MODULE_BY_KEY[moduleKey];
  return {
    w: (def?.defaultSize.w ?? 3) as LayoutWidth,
    h: def?.defaultSize.h ?? 3,
  };
}
