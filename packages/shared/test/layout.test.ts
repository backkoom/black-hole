import { describe, expect, it } from 'vitest';
import {
  ALLOWED_WIDTHS,
  canAddModule,
  clampHeight,
  computeInsertIndex,
  defaultSizeOf,
  moveItem,
  reindex,
  snapWidth,
  validateLayout,
} from '../src/layout.js';

/**
 * 编辑器算法单测 —— 执行包 §7.6 明确要求：
 * 「排序：dnd-kit sortable；onDragEnd 用 arrayMove(oldIndex, newIndex)；**向下拖动不能差一位**；写单测覆盖 A/B/C 向下。」
 */

const item = (moduleKey: string, w = 6, h = 4) => ({ moduleKey, w, h, config: {} });

describe('宽度吸附（§7.6：w 吸附到 3/4/6/12）', () => {
  it('只落在四个档位上', () => {
    for (const raw of [1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 20]) {
      expect(ALLOWED_WIDTHS).toContain(snapWidth(raw));
    }
  });

  it('就近吸附，同距时取较小的档位', () => {
    expect(snapWidth(6)).toBe(6);
    expect(snapWidth(7)).toBe(6);
    // 5 距 4 和 6 各为 1 → 同距取小
    expect(snapWidth(5)).toBe(4);
    expect(snapWidth(2)).toBe(3);
    expect(snapWidth(14)).toBe(12);
  });

  it('小于 3 归 3，大于 12 归 12', () => {
    expect(snapWidth(0)).toBe(3);
    expect(snapWidth(99)).toBe(12);
  });
});

describe('高度取整（§7.6：h 取整 2 至 12；不得小于 minSize）', () => {
  it('取整并夹在 2~12', () => {
    expect(clampHeight(4.4, 'todo')).toBe(4);
    expect(clampHeight(4.6, 'todo')).toBe(5);
    expect(clampHeight(1, 'todo')).toBe(3); // todo 的 minSize.h = 3
    expect(clampHeight(99, 'todo')).toBe(12);
  });

  it('不小于该模块的 minSize.h', () => {
    // idea 的 minSize 是 3×3，text 是 3×2
    expect(clampHeight(2, 'idea')).toBe(3);
    expect(clampHeight(2, 'text')).toBe(2);
    expect(clampHeight(2, 'divider')).toBe(2);
  });
});

describe('中点插入位置（§7.6：按指针所在模块的中点插前/后）', () => {
  it('指针在模块前半 → 插到该模块之前', () => {
    expect(computeInsertIndex(2, 0.2)).toBe(2);
  });

  it('指针在模块后半 → 插到该模块之后', () => {
    expect(computeInsertIndex(2, 0.8)).toBe(3);
  });

  it('正好在中点上 → 视为插后', () => {
    expect(computeInsertIndex(2, 0.5)).toBe(3);
  });
});

describe('排序：向下拖动不能差一位（§7.6 强制要求覆盖 A/B/C 向下）', () => {
  it('A 向下拖一格：元素落到目标下标，不是目标+1', () => {
    const items = [item('todo'), item('idea'), item('text')];
    // 从 0 拖到 1 → todo 落到下标 1
    const next = moveItem(items, 0, 1);
    expect(next.map((i) => i.moduleKey)).toEqual(['idea', 'todo', 'text']);
  });

  it('B 向下拖两格：元素落到目标下标 2', () => {
    const items = [item('todo'), item('idea'), item('text'), item('links')];
    const next = moveItem(items, 0, 2);
    expect(next.map((i) => i.moduleKey)).toEqual(['idea', 'text', 'todo', 'links']);
  });

  it('C 向下拖到末尾：元素落到最后一个下标', () => {
    const items = [item('todo'), item('idea'), item('text'), item('links')];
    const next = moveItem(items, 0, 3);
    expect(next.map((i) => i.moduleKey)).toEqual(['idea', 'text', 'links', 'todo']);
    expect(next[3]?.moduleKey).toBe('todo');
  });

  it('向上拖动同理：元素落到目标下标', () => {
    const items = [item('todo'), item('idea'), item('text')];
    const next = moveItem(items, 2, 0);
    expect(next.map((i) => i.moduleKey)).toEqual(['text', 'todo', 'idea']);
  });

  it('往返拖回原位顺序不变', () => {
    const items = [item('todo'), item('idea'), item('text')];
    const down = moveItem(items, 0, 1);
    const back = moveItem(down, 1, 0);
    expect(back.map((i) => i.moduleKey)).toEqual(['todo', 'idea', 'text']);
  });

  it('越界与同位移动都是安全的', () => {
    const items = [item('todo'), item('idea')];
    expect(moveItem(items, 0, 0)).toEqual(items);
    expect(moveItem(items, -1, 1)).toEqual(items);
    expect(moveItem(items, 0, 9)).toEqual(items);
  });
});

describe('删除后重排 sort', () => {
  it('sort 连续且从 0 开始', () => {
    const items = [
      { ...item('todo'), sort: 0 },
      { ...item('idea'), sort: 5 },
      { ...item('text'), sort: 9 },
    ];
    const next = reindex(items);
    expect(next.map((i) => i.sort)).toEqual([0, 1, 2]);
  });
});

describe('布局校验（§7.6：超限要提示，不静默丢弃）', () => {
  it('正常布局通过', () => {
    expect(validateLayout([item('todo'), item('idea'), item('text')]).ok).toBe(true);
  });

  it('重复模块拒绝', () => {
    const res = validateLayout([item('todo'), item('todo')]);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('重复');
  });

  it('divider 最多 3 条', () => {
    const ok = validateLayout([
      item('divider', 12, 2),
      item('divider', 12, 2),
      item('divider', 12, 2),
    ]);
    expect(ok.ok).toBe(true);
    const tooMany = validateLayout([
      item('divider', 12, 2),
      item('divider', 12, 2),
      item('divider', 12, 2),
      item('divider', 12, 2),
    ]);
    expect(tooMany.ok).toBe(false);
    expect(tooMany.message).toContain('3');
  });

  it('总数最多 14', () => {
    const many = Array.from({ length: 15 }, (_, i) => item(`m${i}`));
    const res = validateLayout(many);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('14');
  });

  it('宽度不在档位上拒绝', () => {
    const res = validateLayout([item('todo', 5, 4)]);
    expect(res.ok).toBe(false);
  });

  it('小于 minSize 拒绝', () => {
    const res = validateLayout([item('idea', 3, 2)]);
    expect(res.ok).toBe(false);
  });

  it('divider 尺寸固定 12×2', () => {
    const res = validateLayout([item('divider', 6, 2)]);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('12×2');
  });
});

describe('能否再添加模块', () => {
  it('重复的 active 模块不能再加', () => {
    const res = canAddModule([item('todo')], 'todo');
    expect(res.ok).toBe(false);
    expect(res.message).toContain('已经在布局里');
  });

  it('placeholder 模块不可添加', () => {
    const res = canAddModule([], 'ai');
    expect(res.ok).toBe(false);
    expect(res.message).toContain('迭代');
  });

  it('divider 可以重复到 3 条', () => {
    expect(canAddModule([item('divider', 12, 2)], 'divider').ok).toBe(true);
    expect(
      canAddModule(
        [item('divider', 12, 2), item('divider', 12, 2), item('divider', 12, 2)],
        'divider',
      ).ok,
    ).toBe(false);
  });

  it('总数到 14 后不能再加', () => {
    const full = Array.from({ length: 14 }, (_, i) => item(`m${i}`));
    const res = canAddModule(full, 'todo');
    expect(res.ok).toBe(false);
    expect(res.message).toContain('14');
  });
});

describe('默认尺寸', () => {
  it('取自模块定义', () => {
    expect(defaultSizeOf('todo')).toEqual({ w: 6, h: 4 });
    expect(defaultSizeOf('idea')).toEqual({ w: 3, h: 4 });
    expect(defaultSizeOf('divider')).toEqual({ w: 12, h: 2 });
  });
});
