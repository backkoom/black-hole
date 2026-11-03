/**
 * URL 规则 —— 前端表单的即时预校验。
 *
 * 权威校验始终是共享包的 `validateModuleConfig`（保存时调用，见 config/ConfigPanel.tsx）；
 * 这里只用于表单里给用户即时提示，规则与 packages/shared/src/modules.ts 的
 * config schema 保持一致：
 * - quick-entry：http/https 或站内绝对路径（以 `/` 开头、不以 `//` 开头、无反斜杠/控制字符）
 * - links：只允许 http/https
 * - embed / gallery：只允许 https
 */

/** 是否 http/https 绝对地址 */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** 是否 https 绝对地址 */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** 是否站内绝对路径（react-router 内部路由用） */
export function isAppPath(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('\\')) return false;
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) <= 0x1f) return false;
  }
  try {
    const url = new URL(value, 'https://app.invalid');
    return url.origin === 'https://app.invalid' && url.pathname.startsWith('/');
  } catch {
    return false;
  }
}

/** quick-entry 的入口地址：http/https 或站内绝对路径 */
export function isQuickEntryUrl(value: string): boolean {
  return isHttpUrl(value) || isAppPath(value);
}
