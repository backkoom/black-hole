import { ERROR_MESSAGES } from '@blackhole/shared/errors';
import { ApiError } from './client';

/**
 * 前端固定文案。
 *
 * 规则（openapi.yaml §6.1 / §6.3）：
 * - 一般错误直接展示响应体的 message，不改写；
 * - 只有「登录失败」需要在前端统一：账号不存在与密码错误必须返回同一句提示，
 *   不泄露账号是否存在（v2 §7.4 / openapi §/api/auth/login 401）。
 */
export const LOGIN_INVALID_CREDENTIALS = '账号或密码错误';

/** 账号锁定（403，登录接口）。 */
export const ACCOUNT_LOCKED = ERROR_MESSAGES.ACCOUNT_LOCKED;

/** 必须先改初始密码（403，其余接口）。 */
export const MUST_CHANGE_PASSWORD = ERROR_MESSAGES.MUST_CHANGE_PASSWORD;

/** 网络异常（未拿到 HTTP 响应）。 */
export const NETWORK_ERROR = '网络连接失败，请检查网络后重试';

/** 兜底文案。 */
export const REQUEST_FAILED = '请求失败，请稍后重试';

/**
 * 统一取错误文案：服务端返回的 message 原样透传，不改写；
 * 非 ApiError（网络异常等）才用兜底文案。
 */
export function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : REQUEST_FAILED;
}

/** 取 HTTP 状态码（非 ApiError 记为 0，便于按 403/404/409/413/422/500 分支处理）。 */
export function errorStatus(err: unknown): number {
  return err instanceof ApiError ? err.status : 0;
}
