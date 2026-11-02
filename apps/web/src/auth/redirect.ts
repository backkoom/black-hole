/**
 * 路由跳转携带的「原路由」—— 未登录被拦下时记住它，登录后跳回。
 *
 * 只接受站内绝对路径，避免被构造成站外地址。
 */

interface RedirectState {
  from?: unknown;
}

/** 从 location.state 里取出合法的站内路径；取不到返回 null。 */
export function readRedirectTarget(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null;
  const from = (state as RedirectState).from;
  if (typeof from !== 'string') return null;
  if (!from.startsWith('/') || from.startsWith('//')) return null;
  return from;
}
