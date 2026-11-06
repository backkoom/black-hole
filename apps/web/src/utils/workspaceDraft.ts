import type { LayoutItem } from '@blackhole/shared/types';

/**
 * 工作台草稿（localStorage）—— 只存本地，不发服务器。
 *
 * - key 带**用户 id**与页面类型，避免多人共用一台机器时互相串草稿；
 * - 刷新页面能恢复草稿；
 * - 保存成功后清除草稿。
 */

const DRAFT_PREFIX = 'wb:workspace:draft:v1';

export type DraftMode = 'workspace' | 'template';

export interface WorkspaceDraft {
  /** 草稿基于的服务端版本号 */
  version: number;
  items: LayoutItem[];
  name: string;
  subtitle: string | null;
  /** 保存时间戳（毫秒） */
  savedAt: number;
}

/** 草稿 key —— 带用户 id 与页面类型 */
export function draftKey(userId: number | undefined, mode: DraftMode): string {
  return `${DRAFT_PREFIX}:${userId ?? 'anonymous'}:${mode}`;
}

/** 读草稿；数据损坏时返回 null */
export function readDraft(key: string): WorkspaceDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkspaceDraft>;
    if (!Array.isArray(parsed.items)) return null;
    if (typeof parsed.version !== 'number') return null;
    return {
      version: parsed.version,
      items: parsed.items as LayoutItem[],
      name: typeof parsed.name === 'string' ? parsed.name : '',
      subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle : null,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

/** 写草稿 */
export function writeDraft(key: string, draft: WorkspaceDraft): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // 隐私模式或配额不足时静默忽略：草稿只是辅助，不影响主流程
  }
}

/** 清草稿 */
export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 同上
  }
}
