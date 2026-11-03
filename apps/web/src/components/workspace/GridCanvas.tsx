import { type MutableRefObject } from 'react';
import { Empty } from 'antd';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import type { LayoutItem } from '@workbench/shared/types';
import { ModuleCard } from './ModuleCard';
import type { EditorItem } from './layoutEditor';

/**
 * 画布 —— pages.md §2「GridCanvas(12 列 / 行高 72px / gap 16px)」。
 *
 * 栅格固定值（执行包 §7.6）：
 * - 12 列，列间距 16px，行高 72px，画布左右内边距 24px；
 * - 模块宽高用 grid-column / grid-row 的 span 表达；
 * - 顺序就是 items 数组顺序（下标即 sort），不存 x/y。
 *
 * 拖拽：画布内排序用 `@dnd-kit/sortable` 的 `rectSortingStrategy`（网格布局）；
 * 从模块库拖入的新模块，插入位置在 WorkspaceEditor 里按指针位置算（见 layoutEditor.ts）。
 */

export interface GridCanvasProps {
  items: EditorItem[];
  /** 预览态：隐藏全部编辑控件 */
  preview: boolean;
  /** 画布元素引用（缩放换算列宽、拖入算插入点都要用） */
  canvasRef: MutableRefObject<HTMLDivElement | null>;
  /** 拖拽落点提示 */
  dropHint: { uid: string; before: boolean } | null;
  onDelete: (item: EditorItem) => void;
  onResize: (item: EditorItem, w: LayoutItem['w'], h: number) => void;
  onConfigure: (item: EditorItem) => void;
}

export function GridCanvas({
  items,
  preview,
  canvasRef,
  dropHint,
  onDelete,
  onResize,
  onConfigure,
}: GridCanvasProps) {
  const setCanvasRef = (node: HTMLDivElement | null): void => {
    canvasRef.current = node;
  };

  return (
    <div className="wb-canvas-box">
      <div className="wb-canvas" ref={setCanvasRef}>
        <SortableContext items={items.map((item) => item.uid)} strategy={rectSortingStrategy}>
          {items.length === 0 ? (
            <div className="wb-canvas-empty">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                styles={{ image: { height: 56 } }}
                description={<span className="wb-canvas-empty-text">从模块库添加第一个模块</span>}
              />
            </div>
          ) : (
            items.map((item, index) => (
              <ModuleCard
                key={item.uid}
                item={item}
                index={index}
                preview={preview}
                canvasRef={canvasRef}
                dropHint={dropHint}
                onDelete={onDelete}
                onResize={onResize}
                onConfigure={onConfigure}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
