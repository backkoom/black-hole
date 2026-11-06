import { ALLOWED_WIDTHS, clampHeight, computeInsertIndex, snapWidth } from '@blackhole/shared';
import { MODULE_BY_KEY } from '@blackhole/shared/modules';
import type { LayoutItem } from '@blackhole/shared/types';

/**
 * 编辑器算法辅助 —— 画布 12 列的度量、插入位置计算与尺寸吸附。
 *
 * 契约：
 * - 画布 12 列、列间距 16px、行高 72px、左右内边距 24px（§7.6 / visual-baseline §2.4）
 * - 插入位置用共享包的 `computeInsertIndex(pointerIndex, pointerRatio)`（<0.5 插前，>=0.5 插后）
 * - 宽度用共享包的 `snapWidth`（就近吸附到 3/4/6/12），高度用 `clampHeight`（2~12 且不小于 minSize）
 */

/** 画布列数 */
export const GRID_COLUMNS = 12;
/** 列间距（px） */
export const GRID_GAP = 16;
/** 行高（px） */
export const GRID_ROW_HEIGHT = 72;
/** 画布左右内边距（px） */
export const GRID_PADDING = 24;

/** 编辑器内部使用的布局项：比接口的 LayoutItem 多一个前端稳定 id */
export interface EditorItem extends LayoutItem {
  /** 前端稳定 id —— dnd-kit 的 sortable id 与 React key，不入库 */
  uid: string;
}

let uidSeq = 0;

/** 生成前端稳定 id */
export function nextUid(): string {
  uidSeq += 1;
  return `m${uidSeq}`;
}

/** 画布网格的像素度量 */
export interface GridMetrics {
  /** 单列宽（px，不含间距） */
  colWidth: number;
  /** 相邻两列左边缘之间的距离（px，含间距） */
  colStep: number;
  /** 相邻两行上边缘之间的距离（px，含间距） */
  rowStep: number;
}

/** 量出画布网格的列/行步长 */
export function gridMetrics(canvas: HTMLElement): GridMetrics {
  const content = canvas.clientWidth - GRID_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1);
  const colWidth = Math.max(1, content / GRID_COLUMNS);
  return {
    colWidth,
    colStep: colWidth + GRID_GAP,
    rowStep: GRID_ROW_HEIGHT + GRID_GAP,
  };
}

/**
 * 宽度吸附：先按共享包的 `snapWidth` 就近吸附到 3/4/6/12，
 * 再保证不小于该模块的 minSize.w（minSize.w 本身必是合法档位）。
 */
export function resolveWidth(raw: number, moduleKey: string): 3 | 4 | 6 | 12 {
  const minWidth = MODULE_BY_KEY[moduleKey]?.minSize.w ?? 3;
  const snapped = snapWidth(raw);
  if (snapped >= minWidth) return snapped;
  const bigger = ALLOWED_WIDTHS.find((w) => w >= minWidth);
  return bigger ?? 12;
}

/** 高度吸附：共享包的 `clampHeight`（取整 2~12，且不小于 minSize.h） */
export function resolveHeight(raw: number, moduleKey: string): number {
  return clampHeight(raw, moduleKey);
}

/** 布局签名 —— 用于判断「有没有未保存的改动」与写草稿 */
export function layoutSignature(
  items: readonly LayoutItem[],
  name: string,
  subtitle: string | null,
): string {
  return JSON.stringify({
    name,
    subtitle,
    items: items.map((item) => [item.moduleKey, item.w, item.h, item.config]),
  });
}

/** 指针落点算出的插入信息 */
export interface InsertPoint {
  /** 最终插入下标（已按 computeInsertIndex 的语义算好：前半插前、后半插后） */
  insertIndex: number;
  /** 目标模块在 items 里的下标 */
  targetIndex: number;
  /** 指针在目标模块内的横向比例（0~1） */
  ratio: number;
  /** true = 插到目标模块前面；false = 插到后面 */
  before: boolean;
}

/**
 * 从 dnd-kit 的拖拽事件里还原当前指针位置。
 *
 * dnd-kit 的 `activatorEvent` 是按下鼠标那一刻的原始指针事件，`delta` 是从按下到现在的位移，
 * 两者相加就是当前指针的视口坐标 —— 比监听 window 的 pointermove 更可靠
 * （拖拽过程中指针可能移出浏览器窗口，pointermove 就收不到了）。
 */
export function pointerFromDragEvent(event: {
  activatorEvent: Event;
  delta: { x: number; y: number };
}): { x: number; y: number } {
  const activator = event.activatorEvent as Partial<MouseEvent>;
  const startX = typeof activator.clientX === 'number' ? activator.clientX : 0;
  const startY = typeof activator.clientY === 'number' ? activator.clientY : 0;
  return { x: startX + event.delta.x, y: startY + event.delta.y };
}

/**
 * 从「指针落点」算出插入位置。
 *
 * - 指针不在画布内 → null（拖到画布外不插入）
 * - 指针落在某个模块上 → 该模块的前半插前、后半插后（共享包的 computeInsertIndex 语义）
 * - 指针落在模块之间的空隙 → 取同一行里横向最近的模块，按左右位置插前/插后
 * - 指针在所有模块下方 → 插到末尾
 */
export function computeInsertPointAtPointer(
  pointer: { x: number; y: number },
  items: readonly EditorItem[],
  canvas: HTMLElement | null,
): InsertPoint | null {
  if (!canvas) return null;
  const canvasRect = canvas.getBoundingClientRect();
  const inside =
    pointer.x >= canvasRect.left &&
    pointer.x <= canvasRect.right &&
    pointer.y >= canvasRect.top &&
    pointer.y <= canvasRect.bottom;
  if (!inside) return null;

  const nodes = Array.from(canvas.querySelectorAll<HTMLElement>('[data-module-index]'));
  if (nodes.length === 0) return { insertIndex: 0, targetIndex: -1, ratio: 0, before: true };

  let fallback: { index: number; ratio: number } | null = null;
  let fallbackDistance = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    const index = Number(node.dataset.moduleIndex ?? '-1');
    if (index < 0) continue;
    const rect = node.getBoundingClientRect();
    const ratio = (pointer.x - rect.left) / Math.max(1, rect.width);
    const contains =
      pointer.x >= rect.left &&
      pointer.x <= rect.right &&
      pointer.y >= rect.top &&
      pointer.y <= rect.bottom;
    if (contains) {
      return {
        insertIndex: computeInsertIndex(index, ratio),
        targetIndex: index,
        ratio,
        before: ratio < 0.5,
      };
    }
    // 同一行里横向最近的模块，作为兜底
    const inSameRow = pointer.y >= rect.top && pointer.y <= rect.bottom;
    if (inSameRow) {
      const distance = Math.abs(pointer.x - (rect.left + rect.width / 2));
      if (distance < fallbackDistance) {
        fallbackDistance = distance;
        fallback = { index, ratio };
      }
    }
  }

  if (fallback) {
    const ratio = fallback.ratio;
    return {
      insertIndex: computeInsertIndex(fallback.index, ratio),
      targetIndex: fallback.index,
      ratio,
      before: ratio < 0.5,
    };
  }

  // 落在所有模块下方 → 末尾
  return { insertIndex: items.length, targetIndex: items.length, ratio: 1, before: false };
}
