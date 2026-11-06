import { ERROR_CODES, ERROR_MESSAGES } from '@blackhole/shared/errors';

/**
 * 业务错误 —— 执行包 §6.3「权限与错误映射」。
 * 路由里抛这个，全局 errorHandler 负责包成统一格式。
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: number;
  readonly data?: unknown;

  constructor(statusCode: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = statusCode;
    this.data = data;
  }
}

export const badRequest = (message: string = '请求参数不合法', data?: unknown) =>
  new ApiError(ERROR_CODES.BAD_REQUEST, message, data);

export const unauthorized = (message: string = ERROR_MESSAGES.UNAUTHORIZED) =>
  new ApiError(ERROR_CODES.UNAUTHORIZED, message);

export const forbidden = (message: string = ERROR_MESSAGES.NO_PERMISSION) =>
  new ApiError(ERROR_CODES.FORBIDDEN, message);

export const notFound = (message: string = ERROR_MESSAGES.NOT_FOUND) =>
  new ApiError(ERROR_CODES.NOT_FOUND, message);

export const unprocessable = (message: string = '业务校验失败', data?: unknown) =>
  new ApiError(ERROR_CODES.UNPROCESSABLE, message, data);

export const conflict = (message: string, data?: unknown) =>
  new ApiError(ERROR_CODES.CONFLICT, message, data);

export const payloadTooLarge = (message: string = '请求体超过大小限制') =>
  new ApiError(ERROR_CODES.PAYLOAD_TOO_LARGE, message);

export const internalError = (message: string = ERROR_MESSAGES.INTERNAL_ERROR) =>
  new ApiError(ERROR_CODES.INTERNAL_ERROR, message);

/** 未登录 / 会话过期 */
export const errUnauthorized = unauthorized;
/** 管理接口无权 */
export const errForbidden = forbidden;
/** 业务资源无权或不存在（不泄露存在性） */
export const errNotFound = notFound;
