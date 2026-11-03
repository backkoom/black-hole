import { ModuleEmpty } from './ModuleShell';
import { readEmbedConfig } from './config';

/**
 * 嵌入内容模块 —— §7.5：读 config 的 url；url 为空显示 emptyState；否则用 iframe 渲染。
 *
 * 安全（Phase 5 测试项）：
 * - config schema 只允许 https，这里再兜底一次：非 https 一律不渲染 iframe；
 * - iframe **必须带 `sandbox` 属性**，否则内嵌页面能拿到宿主页面的能力；
 * - 不允许 `javascript:` / `data:`（schema 已禁，这里再做一次协议白名单）。
 */
export function EmbedModule({ config }: { config: Record<string, unknown> }) {
  const { url, height } = readEmbedConfig(config);
  if (!url) return <ModuleEmpty text="配置嵌入地址" />;

  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.protocol !== 'https:') return <ModuleEmpty text="配置嵌入地址" />;

  return (
    <iframe
      className="wb-embed-frame"
      src={parsed.toString()}
      title="嵌入内容"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      referrerPolicy="no-referrer"
      style={{ height: Math.min(Math.max(height, 120), 1200) }}
    />
  );
}
