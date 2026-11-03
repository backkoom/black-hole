import { validateModuleConfig } from '@workbench/shared/modules';

/**
 * config 校验 —— 以共享包的 `validateModuleConfig` 为**唯一权威**（§7.3）。
 *
 * - 合法：返回 zod 规范化后的 config（未知字段已被剥掉）；
 * - 不合法：抛错，这里转成可展示的中文提示。
 *
 * zod 的 issue.message 本身就是中文（如「只允许 http/https 或站内绝对路径」），
 * 直接取第一条展示给用户。
 */
export type ConfigValidation =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string };

interface ZodLikeIssue {
  message?: string;
  path?: (string | number)[];
}

interface ZodLikeError {
  issues?: ZodLikeIssue[];
  message?: string;
}

/** 从校验错误里取出第一条可读文案 */
function readIssueMessage(err: unknown): string {
  if (typeof err !== 'object' || err === null) return '配置不合法';
  const candidate = err as ZodLikeError;
  const first = candidate.issues?.[0];
  if (first && typeof first.message === 'string' && first.message) return first.message;
  if (typeof candidate.message === 'string' && candidate.message) return candidate.message;
  return '配置不合法';
}

/** 校验一个 content 模块的 config */
export function validateConfig(moduleKey: string, config: unknown): ConfigValidation {
  try {
    const parsed = validateModuleConfig(moduleKey, config) as Record<string, unknown>;
    return { ok: true, value: parsed };
  } catch (err) {
    return { ok: false, message: readIssueMessage(err) };
  }
}
