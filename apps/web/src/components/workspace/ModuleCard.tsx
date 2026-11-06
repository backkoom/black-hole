import { useRef, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { Button, Popconfirm, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, HolderOutlined } from '@ant-design/icons';
import { useSortable } from '@dnd-kit/sortable';
import { isFixedSize } from '@blackhole/shared';
import { MODULE_BY_KEY } from '@blackhole/shared/modules';
import { moduleVisual } from './moduleVisuals';
import { ModuleContent } from './modules/ModuleContent';
import {
  GRID_GAP,
  GRID_PADDING,
  GRID_ROW_HEIGHT,
  resolveHeight,
  resolveWidth,
  type EditorItem,
} from './layoutEditor';

/**
 * 画布上的模块卡片 —— pages.md §2「ModuleCard(moduleKey, w, h, config)」。
 *
 * Phase 5 补齐编辑能力：
 * - 拖动排序（`useSortable`，拖动手柄在标题栏）；
 * - 右下角缩放手柄（宽度 `snapWidth`、高度 `clampHeight`）；
 * - 删除按钮（二次确认；content 模块提示会丢失配置）；
 * - content 模块的「编辑内容」按钮，打开配置面板。
 *
 * 预览态（preview）下全部编辑控件隐藏，模块只读渲染。
 */

export interface ModuleCardProps {
  item: EditorItem;
  /** 模块在布局中的下标（插入位置计算用） */
  index: number;
  /** 预览态：隐藏所有编辑控件 */
  preview: boolean;
  /** 画布容器元素（缩放时换算列宽） */
  canvasRef: MutableRefObject<HTMLDivElement | null>;
  /** 拖拽落点提示：目标模块 uid + 插入方向 */
  dropHint: { uid: string; before: boolean } | null;
  onDelete: (item: EditorItem) => void;
  onResize: (item: EditorItem, w: EditorItem['w'], h: number) => void;
  onConfigure: (item: EditorItem) => void;
}

export function ModuleCard({
  item,
  index,
  preview,
  canvasRef,
  dropHint,
  onDelete,
  onResize,
  onConfigure,
}: ModuleCardProps) {
  const def = MODULE_BY_KEY[item.moduleKey];
  const visual = moduleVisual(item.moduleKey);
  const name = def?.name ?? item.moduleKey;
  const isContent = def?.type === 'content';
  const fixed = isFixedSize(item.moduleKey);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.uid,
    data: { type: 'canvas', uid: item.uid, moduleKey: item.moduleKey },
    disabled: preview,
  });

  const hint = dropHint && dropHint.uid === item.uid ? (dropHint.before ? 'before' : 'after') : null;

  return (
    <section
      ref={setNodeRef}
      className={[
        'wb-module',
        isDragging ? 'is-dragging' : '',
        hint ? `is-drop-${hint}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        gridColumn: `span ${item.w}`,
        gridRow: `span ${item.h}`,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      data-module-index={index}
      data-module-uid={item.uid}
      aria-label={`${name} 模块`}
    >
      <header className="wb-module-head">
        {!preview ? (
          <span className="wb-module-grip" {...attributes} {...listeners} aria-label="拖动排序">
            <HolderOutlined />
          </span>
        ) : null}
        <span className="wb-module-title">
          <span className="wb-module-icon" style={{ background: visual.color }} aria-hidden="true">
            {visual.icon}
          </span>
          {name}
        </span>
        {!preview ? (
          <span className="wb-module-tools">
            {isContent ? (
              <Tooltip title="编辑内容">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  aria-label={`编辑「${name}」的内容`}
                  onClick={() => onConfigure(item)}
                />
              </Tooltip>
            ) : null}
            <Popconfirm
              title={`删除「${name}」模块？`}
              description={
                isContent ? '删除后该模块的配置会丢失，且无法撤销。' : '删除后无法撤销。'
              }
              okText="删除"
              cancelText="取消"
              onConfirm={() => onDelete(item)}
            >
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                aria-label={`删除「${name}」模块`}
              />
            </Popconfirm>
            <span className="wb-module-size">
              {item.w}×{item.h}
            </span>
          </span>
        ) : null}
      </header>

      <div className="wb-module-body">
        <ModuleContent item={item} />
      </div>

      {!preview && !fixed ? (
        <ResizeHandle item={item} canvasRef={canvasRef} onResize={onResize} />
      ) : null}
    </section>
  );
}

/**
 * 缩放手柄 —— 卡片右下角拖动改尺寸。
 *
 * 算法：
 * - 右边缘落在第几列 → 目标宽度（连续值）→ 共享包 `snapWidth` 吸附到 3/4/6/12；
 * - 下边缘落在第几行 → 目标高度（连续值）→ 共享包 `clampHeight` 取整 2~12；
 * - 两者都不小于该模块的 minSize；
 * - divider 固定 12×2，不显示手柄（共享包 `isFixedSize`）。
 *
 * 几何量（起始列/行、列步长/行步长）在**按下时一次性算好**：
 * 拖动过程中卡片会跟着变大变大，再去读卡片自身的 rect 会形成反馈循环，算出错误的尺寸。
 */
function ResizeHandle({
  item,
  canvasRef,
  onResize,
}: {
  item: EditorItem;
  canvasRef: MutableRefObject<HTMLDivElement | null>;
  onResize: (item: EditorItem, w: EditorItem['w'], h: number) => void;
}) {
  const activeRef = useRef(false);

  const onPointerDown = (event: ReactPointerEvent<HTMLSpanElement>): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    event.stopPropagation();
    activeRef.current = true;

    // 卡片元素在按下时锁定：拖动过程中指针会移出本卡片，
    // 用 moveEvent.target 反查会拿到别的卡片，尺寸就算错了。
    const card = event.currentTarget.closest<HTMLElement>('.wb-module');
    if (!card) return;

    const canvasRect = canvas.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();

    // 网格：12 列、列间距 16px、左右内边距 24px；行高 72px、行间距 16px
    const contentLeft = canvasRect.left + GRID_PADDING;
    const colWidth = (canvasRect.width - GRID_PADDING * 2 - GRID_GAP * 11) / 12;
    const colStep = colWidth + GRID_GAP;
    const rowStep = GRID_ROW_HEIGHT + GRID_GAP;

    const startCol = Math.round((cardRect.left - contentLeft) / colStep);
    const startRow = Math.round((cardRect.top - canvasRect.top) / rowStep);

    const onMove = (moveEvent: PointerEvent): void => {
      if (!activeRef.current) return;

      const endCol = (moveEvent.clientX - contentLeft) / colStep;
      const rawWidth = Math.max(1, endCol - startCol + 1);

      const endRow = (moveEvent.clientY - canvasRect.top) / rowStep;
      const rawHeight = Math.max(1, endRow - startRow + 1);

      const w = resolveWidth(rawWidth, item.moduleKey);
      const h = resolveHeight(rawHeight, item.moduleKey);
      if (w !== item.w || h !== item.h) onResize(item, w, h);
    };

    const onUp = (): void => {
      activeRef.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <span
      className="wb-module-resize"
      role="button"
      tabIndex={-1}
      aria-label="拖动调整模块尺寸"
      onPointerDown={onPointerDown}
    />
  );
}
