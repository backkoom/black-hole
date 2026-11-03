import { Empty } from 'antd';
import type { LayoutItem } from '@workbench/shared/types';
import { ModuleCard } from './ModuleCard';

/**
 * 画布 —— pages.md §2「GridCanvas(12 列 / 行高 72px / gap 16px)」。
 *
 * 栅格固定值（执行包 §7.6）：
 * - 12 列，列间距 16px，行高 72px，画布左右内边距 24px；
 * - 模块宽高用 grid-column / grid-row 的 span 表达，高度由行高和 gap 自动算，不写死像素；
 * - 顺序就是 items 数组顺序（items 下标即 sort），不存 x/y。
 */

interface GridCanvasProps {
  items: LayoutItem[];
  /** 预览态：只读展示 */
  preview: boolean;
}

export function GridCanvas({ items, preview }: GridCanvasProps) {
  if (items.length === 0) {
    return (
      <div className="wb-canvas-box">
        <div className="wb-canvas">
          <div className="wb-canvas-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              styles={{ image: { height: 56 } }}
              description={<span className="wb-canvas-empty-text">从模块库添加第一个模块</span>}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wb-canvas-box">
      <div className="wb-canvas">
        {items.map((item, index) => (
          <ModuleCard key={`${item.moduleKey}-${index}`} item={item} preview={preview} />
        ))}
      </div>
    </div>
  );
}
