import { ModuleEmpty } from './ModuleShell';
import { readLinkItems } from './config';

/**
 * 链接列表模块 —— §7.5：读 config；外链新窗口打开。
 *
 * config schema 只允许 http/https，这里再兜底一次：非法地址不渲染成可点击链接。
 */
export function LinksModule({ config }: { config: Record<string, unknown> }) {
  const items = readLinkItems(config).filter((entry) => /^https?:\/\//i.test(entry.url));
  if (items.length === 0) return <ModuleEmpty text="还没有链接" />;

  return (
    <ul className="wb-links-list">
      {items.map((entry) => (
        <li key={`${entry.label}-${entry.url}`}>
          <a href={entry.url} target="_blank" rel="noopener noreferrer">
            {entry.label || entry.url}
          </a>
        </li>
      ))}
    </ul>
  );
}
