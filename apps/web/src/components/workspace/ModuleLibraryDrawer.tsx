import { useDraggable } from '@dnd-kit/core';
import { MODULES, MODULE_CATEGORIES } from '@workbench/shared/modules';
import { moduleVisual } from './moduleVisuals';

/**
 * 模块库 —— pages.md §2「ModuleLibraryDrawer(5 分类 / 占位模块置灰带「迭代」角标)」。
 *
 * Phase 5 补齐：
 * - 每个 active 模块可**拖入画布**（`useDraggable`），拖到画布外不插入；
 * - **点击也能添加**（加到末尾）；
 * - 3 个占位模块置灰 + 「迭代」角标，且既不能拖也不能点。
 */

export interface ModuleLibraryDrawerProps {
  /** 点击添加（加到末尾） */
  onAdd: (moduleKey: string) => void;
  /** 当前画布已有的模块 key（用于置灰「已在布局中」） */
  existingKeys: readonly string[];
}

export function ModuleLibraryDrawer({ onAdd, existingKeys }: ModuleLibraryDrawerProps) {
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
              {modules.map((mod) => (
                <LibraryItem
                  key={mod.key}
                  moduleKey={mod.key}
                  name={mod.name}
                  color={moduleVisual(mod.key).color}
                  icon={moduleVisual(mod.key).icon}
                  unavailable={mod.status === 'placeholder'}
                  alreadyAdded={existingKeys.includes(mod.key)}
                  onAdd={onAdd}
                />
              ))}
            </div>
          </div>
        );
      })}
    </aside>
  );
}

interface LibraryItemProps {
  moduleKey: string;
  name: string;
  color: string;
  icon: React.ReactNode;
  unavailable: boolean;
  alreadyAdded: boolean;
  onAdd: (moduleKey: string) => void;
}

function LibraryItem({
  moduleKey,
  name,
  color,
  icon,
  unavailable,
  alreadyAdded,
  onAdd,
}: LibraryItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `library:${moduleKey}`,
    data: { type: 'library', moduleKey },
    // 占位模块不允许拖；已添加的允许拖（拖进去由 canAddModule 提示「已经在布局里了」）
    disabled: unavailable,
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        'wb-library-item',
        unavailable ? 'is-unavailable' : '',
        alreadyAdded ? 'is-added' : '',
        isDragging ? 'is-dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={unavailable ? '功能迭代中，暂不可用' : alreadyAdded ? '已在布局中' : name}
      {...listeners}
      {...attributes}
      aria-disabled={unavailable}
      onClick={() => {
        // 不静默丢弃：重复 / 占位 / 超上限都由 canAddModule 给出原因
        onAdd(moduleKey);
      }}
    >
      <span
        className="wb-library-icon"
        style={{ background: unavailable ? 'var(--muted)' : color }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="wb-library-name">{name}</span>
      {unavailable ? <span className="wb-library-tag">迭代</span> : null}
      {alreadyAdded ? <span className="wb-library-tag">已添加</span> : null}
    </div>
  );
}
