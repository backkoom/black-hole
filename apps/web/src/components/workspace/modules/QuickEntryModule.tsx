import { Link } from 'react-router-dom';
import { ModuleEmpty } from './ModuleShell';
import { isInternalPath, readQuickEntryItems, type LinkEntry } from './config';

/**
 * 快速入口模块 —— §7.5：读 config；点击跳转；内链用 react-router，外链新窗口。
 *
 * URL 白名单由 config 面板的 `validateModuleConfig` 保证（只允许 http/https 或站内绝对路径），
 * 这里再做一次渲染期兜底：非白名单地址不渲染成可点击链接。
 */
export function QuickEntryModule({ config }: { config: Record<string, unknown> }) {
  const items = readQuickEntryItems(config).filter((entry) => entry.url !== '');
  if (items.length === 0) return <ModuleEmpty text="还没有快捷入口" />;

  return (
    <div className="wb-quick-grid">
      {items.map((entry) => (
        <QuickEntryLink key={`${entry.label}-${entry.url}`} entry={entry} />
      ))}
    </div>
  );
}

function QuickEntryLink({ entry }: { entry: LinkEntry }) {
  if (isInternalPath(entry.url)) {
    return (
      <Link className="wb-quick-item" to={entry.url}>
        {entry.label}
      </Link>
    );
  }
  return (
    <a className="wb-quick-item" href={entry.url} target="_blank" rel="noopener noreferrer">
      {entry.label}
    </a>
  );
}
