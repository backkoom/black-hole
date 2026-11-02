/**
 * 统一响应与错误 —— 来源：AI 开发执行包 §6.1「统一约定」/ §6.3「权限与错误映射」。
 */

export interface ApiSuccess<T> {
  code: 0;
  message: 'ok' | string;
  data: T;
}

export interface ApiError {
  code: number;
  message: string;
  data?: unknown;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** §6.3 权限与错误映射 */
export const ERROR_CODES = {
  /** 未登录/会话过期 */
  UNAUTHORIZED: 401,
  /** 必须改密 / 管理接口无权 / 登录锁定 */
  FORBIDDEN: 403,
  /** 业务资源无权或不存在（不泄露存在性） */
  NOT_FOUND: 404,
  /** 参数缺失/类型错 */
  BAD_REQUEST: 400,
  /** 请求体/上传文件超过上限 */
  PAYLOAD_TOO_LARGE: 413,
  /** 业务校验失败 */
  UNPROCESSABLE: 422,
  /** 布局版本冲突 */
  CONFLICT: 409,
  /** 服务器错误（不返回堆栈；记录 requestId） */
  INTERNAL_ERROR: 500,
} as const;

export const ERROR_MESSAGES = {
  /** 401 */
  UNAUTHORIZED: '请先登录',
  /** 403 必须改密 */
  MUST_CHANGE_PASSWORD: '请先修改初始密码',
  /** 403 登录锁定（不新增 423） */
  ACCOUNT_LOCKED: '账号已锁定，请 10 分钟后再试',
  /** 403 管理接口无权 */
  NO_PERMISSION: '没有权限',
  /** 404 */
  NOT_FOUND: '资源不存在',
  /** 409 */
  VERSION_CONFLICT: '布局已被他人修改，请选择刷新或覆盖',
  /** 500 */
  INTERNAL_ERROR: '服务器内部错误',
} as const;

/** 分页约定（§6.1） */
export const PAGINATION = {
  defaultPage: 1,
  defaultPageSize: 20,
  maxPageSize: 100,
} as const;
