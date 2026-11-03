import { MODULES, MODULE_CATEGORIES } from '@workbench/shared/modules';
import { moduleVisual } from './moduleVisuals';

/**
 * 模块库 —— pages.md §2「ModuleLibraryDrawer(5 分类 / 占位模块置灰带「迭代」角标)」。
 *
 * Phase 3 是编辑器外壳：这里只负责「列出 15 个模块 + 标出 3 个占位模块不可用」，
 * 不做拖入新增（Phase 5 才做），所以条目不可点击。
 * - 12 个 active 模块正常展示；
 * - 3 个 placeholder（file / knowledge-list / ai）置灰 + 「迭代」角标 + 不可用。
 *
 * 布局按 demo（visual-baseline §4.4）：右侧固定 252px 的库面板，画布在中间。
 */

export function ModuleLibraryDrawer() {
  return (
    <aside className="wb-library" aria-label="模块库">
      <div className="wb-library-head">模块库</div>
      {MODULE_CATEGORIES.map((category) => {
        const modules = MODULES.filter((m) => m.category === category);
        if (modules.length === 0) return null;
        return (
          <div className="wb-library-group" key={category}>
            <div className="wb-library-group-title">{category}</div>
            <div className="wb-library-grid">
              {modules.map((mod) => {
                const visual = moduleVisual(mod.key);
                const unavailable = mod.status === 'placeholder';
                return (
                  <div
                    className={`wb-library-item${unavailable ? ' is-unavailable' : ''}`}
                    key={mod.key}
                    aria-disabled={unavailable}
                    title={unavailable ? '功能迭代中，暂不可用' : mod.name}
                  >
                    <span
                      className="wb-library-icon"
                      style={{ background: unavailable ? 'var(--muted)' : visual.color }}
                      aria-hidden="true"
                    >
                      {visual.icon}
                    </span>
                    <span className="wb-library-name">{mod.name}</span>
                    {unavailable ? <span className="wb-library-tag">迭代</span> : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </aside>
  );
}
