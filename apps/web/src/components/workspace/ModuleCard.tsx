import { Empty } from 'antd';
import type { LayoutItem } from '@workbench/shared/types';
import { MODULE_BY_KEY } from '@workbench/shared/modules';
import { moduleVisual } from './moduleVisuals';

/**
 * 画布上的模块卡片 —— pages.md §2「ModuleCard(moduleKey, w, h, config)」。
 *
 * Phase 3 只渲染，不提供编辑：
 * - 尺寸徽标（w×h）让栅格布局可见，但不可拖、不可缩放（Phase 5 才做）；
 * - 内容用模块自己的 emptyState 文案占位（真实数据 Phase 4/5/6 接）；
 * - content 模块（quick-entry 等）可以读 config 渲染入口文字，但不做跳转以外的交互。
 */

interface ModuleCardProps {
  item: LayoutItem;
  /** 预览态：只读展示 */
  preview: boolean;
}

/** 从 config 里取出 quick-entry 的入口文字（只取 label，不做跳转） */
function quickEntryLabels(config: Record<string, unknown>): string[] {
  const raw = config.items;
  if (!Array.isArray(raw)) return [];
  const labels: string[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === 'object' && 'label' in entry) {
      const label = (entry as { label: unknown }).label;
      if (typeof label === 'string' && label) labels.push(label);
    }
  }
  return labels;
}

export function ModuleCard({ item, preview }: ModuleCardProps) {
  const def = MODULE_BY_KEY[item.moduleKey];
  const visual = moduleVisual(item.moduleKey);
  const name = def?.name ?? item.moduleKey;
  const isPlaceholder = def?.status === 'placeholder';
  const entries = def?.type === 'content' ? quickEntryLabels(item.config) : [];

  return (
    <section
      className="wb-module"
      style={{ gridColumn: `span ${item.w}`, gridRow: `span ${item.h}` }}
      aria-label={`${name} 模块`}
    >
      <header className="wb-module-head">
        <span className="wb-module-title">
          <span className="wb-module-icon" style={{ background: visual.color }} aria-hidden="true">
            {visual.icon}
          </span>
          {name}
        </span>
        {isPlaceholder ? <span className="wb-module-tag">迭代</span> : null}
        {!preview ? <span className="wb-module-size">{item.w}×{item.h}</span> : null}
      </header>

      <div className="wb-module-body">
        {entries.length > 0 ? (
          <ul className="wb-module-entries">
            {entries.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            styles={{ image: { height: 40 } }}
            description={<span className="wb-module-empty">{def?.emptyState ?? '暂无内容'}</span>}
          />
        )}
      </div>
    </section>
  );
}
