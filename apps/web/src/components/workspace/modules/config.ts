/**
 * config 读取辅助 —— 把 `Record<string, unknown>` 安全地读成模块需要的结构。
 *
 * 规则：
 * - 全部走**纯文本**读取，绝不解释 HTML（§7.3「渲染时用文本节点/textContent」）；
 * - 未知字段一律忽略，不报错；
 * - 读取失败或类型不符时返回空结构，由模块渲染空态。
 */

export interface LinkEntry {
  label: string;
  url: string;
}

export interface GalleryImage {
  url: string;
  caption: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readEntries(value: unknown): LinkEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: LinkEntry[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    entries.push({ label: readString(item.label), url: readString(item.url) });
  }
  return entries;
}

function readImages(value: unknown): GalleryImage[] {
  if (!Array.isArray(value)) return [];
  const images: GalleryImage[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    images.push({ url: readString(item.url), caption: readString(item.caption) });
  }
  return images;
}

/** quick-entry 的入口列表 */
export function readQuickEntryItems(config: Record<string, unknown>): LinkEntry[] {
  return readEntries(config.items);
}

/** links 的链接列表 */
export function readLinkItems(config: Record<string, unknown>): LinkEntry[] {
  return readEntries(config.items);
}

/** text 的标题与正文 */
export function readTextConfig(config: Record<string, unknown>): { title: string; body: string } {
  return { title: readString(config.title), body: readString(config.body) };
}

/** notice 的标题、正文与级别 */
export function readNoticeConfig(
  config: Record<string, unknown>,
): { title: string; body: string; level: 'info' | 'warning' } {
  const level = config.level === 'warning' ? 'warning' : 'info';
  return { title: readString(config.title), body: readString(config.body), level };
}

/** embed 的地址与高度 */
export function readEmbedConfig(config: Record<string, unknown>): { url: string; height: number } {
  const raw = config.height;
  const height = typeof raw === 'number' && Number.isFinite(raw) ? raw : 400;
  return { url: readString(config.url), height };
}

/** gallery 的图片列表 */
export function readGalleryImages(config: Record<string, unknown>): GalleryImage[] {
  return readImages(config.images);
}

/** divider 的标签 */
export function readDividerLabel(config: Record<string, unknown>): string {
  return readString(config.label);
}

/** 站内绝对路径（以 / 开头）走 react-router 内部跳转，其余走新窗口 */
export function isInternalPath(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//');
}
