/**
 * 统一 API 封装。
 *
 * 约定（openapi.yaml §6.1）：
 * - 一律相对路径 `/api/xxx`，Cookie 会话（credentials: 'include'），不写 API 域名、不启用 CORS；
 * - 响应体 `{ code, message, data }`，失败体 `{ code, message }`；
 * - HTTP 状态码才是判据（401/403/409/413/422/500），失败时 message 字段的中文文案直接展示给用户。
 */

/** 成功响应体：code 固定 0。 */
export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

/** 接口错误：status 为 HTTP 状态码，message 为服务端给的中文文案。 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: number;
  /**
   * 失败响应体里的 data（如 409 冲突时带服务端当前 version 与 items）。
   * 成功响应没有这个字段，只有失败时才可能存在。
   */
  readonly data?: unknown;

  constructor(status: number, code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

const API_BASE = '/api';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** FormData 不能手写 Content-Type —— 少了 multipart 的 boundary 会被服务端拒绝。 */
function isFormData(body: BodyInit | null | undefined): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...init,
      headers:
        init?.body === undefined || isFormData(init.body)
          ? init?.headers
          : { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 0, '网络连接失败，请检查网络后重试');
  }

  let envelope: ApiEnvelope<T> | null = null;
  try {
    const raw: unknown = await response.json();
    if (isRecord(raw)) {
      envelope = {
        code: typeof raw.code === 'number' ? raw.code : response.status,
        message: typeof raw.message === 'string' ? raw.message : '',
        data: raw.data as T,
      };
    }
  } catch {
    envelope = null;
  }

  if (!response.ok) {
    // 服务端文案直接透传，不改写（openapi Error.message：可直接展示给用户的中文文案）
    throw new ApiError(
      response.status,
      envelope?.code ?? response.status,
      envelope?.message || `请求失败（HTTP ${response.status}）`,
      envelope?.data,
    );
  }
  if (!envelope) {
    throw new ApiError(response.status, response.status, '服务返回了无法解析的响应');
  }
  if (envelope.code !== 0) {
    throw new ApiError(response.status, envelope.code, envelope.message || '请求失败', envelope.data);
  }
  return envelope.data;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

/** multipart 表单提交（导入 CSV 用）。不设 Content-Type，交给浏览器带 boundary。 */
export function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  return request<T>(path, { method: 'POST', body: form });
}

/**
 * 下载文件流 —— 响应不是统一 JSON 包装（如 GET /api/users/import/template 返回 text/csv）。
 * 失败时服务端仍返回统一 JSON 错误体，message 原样透传。
 */
export async function apiBlob(path: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  } catch {
    throw new ApiError(0, 0, '网络连接失败，请检查网络后重试');
  }

  if (!response.ok) {
    let text = `请求失败（HTTP ${response.status}）`;
    let code = response.status;
    try {
      const raw: unknown = await response.json();
      if (isRecord(raw)) {
        if (typeof raw.message === 'string' && raw.message) text = raw.message;
        if (typeof raw.code === 'number') code = raw.code;
      }
    } catch {
      // 错误体不是 JSON：保留状态码兜底文案
    }
    throw new ApiError(response.status, code, text);
  }

  return response.blob();
}
