import type { FileAsset, FileFolder, FileKind, FileStats, FileVersion } from '@blackhole/shared/types';
import { apiBlob, apiDelete, apiGet, apiPost, apiPostForm } from './client';

/**
 * 文件资料接口 —— 用户端「文件资料」页（稿子图7）。
 *
 * 契约（apps/api/src/files/routes.ts）：
 * - GET    /api/files           → { items: FileAsset[] }
 * - GET    /api/files/summary   → FileStats
 * - POST   /api/files           body {name, kind?, sizeBytes?, folderId?, projectId?, version?}
 *                               → { file: FileAsset }
 * - POST   /api/files/upload    multipart { file, folderId?, projectId? } → { file }
 * - GET    /api/files/:id/download  二进制流（Content-Disposition: attachment）
 * - DELETE /api/files/:id       → null（软删，同时删磁盘实体）
 * - GET    /api/folders         → { items: FileFolder[] }
 * - POST   /api/folders         body {name, projectId?, parentId?} → { folder: FileFolder }
 * - DELETE /api/folders/:id     → null（软删）
 *
 * 口径：
 * - 2026-11-07 起支持真实上传/下载；历史数据可能 hasFile=false（只有登记信息）；
 * - kind：doc / sheet / slide / image / pdf / archive / other；
 * - version 是版本号字符串（如 v1.2），currentVersion 标记是否当前版本；
 * - 普通用户强制只看自己名下的文件与文件夹，管理员不传 userId 即看全员；
 * - 删除是软删（deleted_at）。
 *
 * 类型直接复用 @blackhole/shared/types，不在这里另写一份。
 */

/** 文件类型 */
export type AssetKind = FileKind;

/** 文件列表查询 */
export interface FileListQuery {
  /** 所在文件夹 */
  folderId?: number;
  /** 文件类型 */
  kind?: AssetKind;
  /** 所属项目 */
  projectId?: number;
}

/** 文件夹列表查询 */
export interface FolderListQuery {
  projectId?: number;
}

/** 登记文件（只登记元数据；新页面用 uploadFile，这个留给导入/兼容） */
export interface CreateFileInput {
  name: string;
  kind?: AssetKind;
  /** 字节数 */
  sizeBytes?: number;
  folderId?: number | null;
  projectId?: number | null;
  /** 版本号，如 v1.0 */
  version?: string;
}

/** 新建文件夹 */
export interface CreateFolderInput {
  name: string;
  projectId?: number | null;
  /** 父文件夹 */
  parentId?: number | null;
}

/** react-query key —— all 是前缀，失效时覆盖下面所有查询 */
export const fileKeys = {
  all: ['files'] as const,
  /** 文件列表：key 里带筛选参数 */
  list: (query: FileListQuery) => ['files', 'list', query] as const,
  /** 汇总统计（总数 / 容量 / 文件夹数 / 分类分布） */
  summary: ['files', 'summary'] as const,
  /** 文件夹列表 */
  folders: (query: FolderListQuery = {}) => ['files', 'folders', query] as const,
};

/** 文件列表 */
export async function listFiles(query: FileListQuery = {}): Promise<FileAsset[]> {
  const params = new URLSearchParams();
  if (query.folderId !== undefined) params.set('folderId', String(query.folderId));
  if (query.kind !== undefined) params.set('kind', query.kind);
  if (query.projectId !== undefined) params.set('projectId', String(query.projectId));
  const search = params.toString();
  const data = await apiGet<{ items: FileAsset[] }>(`/files${search ? `?${search}` : ''}`);
  return data.items;
}

/** 汇总统计：文件总数 / 已用存储 / 文件夹数 / 分类分布 */
export async function fetchFileStats(): Promise<FileStats> {
  return apiGet<FileStats>('/files/summary');
}

/** 登记文件元数据 */
export async function createFile(input: CreateFileInput): Promise<FileAsset> {
  const data = await apiPost<{ file: FileAsset }>('/files', input);
  return data.file;
}

/** 上传：浏览器文件对象 → 服务端落盘并登记 */
export async function uploadFile(
  file: File,
  opts: { folderId?: number; projectId?: number } = {},
): Promise<FileAsset> {
  const form = new FormData();
  form.append('file', file);
  if (opts.folderId) form.append('folderId', String(opts.folderId));
  if (opts.projectId) form.append('projectId', String(opts.projectId));
  const data = await apiPostForm<{ file: FileAsset }>('/files/upload', form);
  return data.file;
}

/**
 * 下载：取流 → 触发浏览器保存。
 * 用 Blob 而不是直接开新窗口，是因为同源接口要带 Cookie，
 * 直接 window.open 在某些浏览器会把未登录态带过去。
 */
export async function downloadFile(id: number, name: string): Promise<void> {
  const blob = await apiBlob(`/files/${id}/download`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 立刻 revoke 会让部分浏览器的下载中断，10 秒后回收足够安全
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 版本列表：items 新的在前，currentVersionNo 是当前版本号 */
export async function listFileVersions(
  id: number,
): Promise<{ items: FileVersion[]; currentVersionNo: number }> {
  return apiGet<{ items: FileVersion[]; currentVersionNo: number }>(`/files/${id}/versions`);
}

/** 上传新版本（不覆盖旧版本，各版本独占一份磁盘实体） */
export async function uploadFileVersion(
  id: number,
  file: File,
  note?: string,
): Promise<FileAsset> {
  const form = new FormData();
  form.append('file', file);
  if (note) form.append('note', note);
  const data = await apiPostForm<{ file: FileAsset }>(`/files/${id}/versions`, form);
  return data.file;
}

/** 回滚：以历史版本内容生成一个新版本（版本号继续往上加，不回退） */
export async function restoreFileVersion(id: number, versionNo: number): Promise<FileAsset> {
  const data = await apiPost<{ file: FileAsset }>(`/files/${id}/versions/${versionNo}/restore`, {});
  return data.file;
}

/** 下载某个历史版本 */
export async function downloadFileVersion(
  id: number,
  versionNo: number,
  name: string,
): Promise<void> {
  const blob = await apiBlob(`/files/${id}/versions/${versionNo}/download`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 删除文件（软删） */
export async function deleteFile(id: number): Promise<null> {
  return apiDelete<null>(`/files/${id}`);
}

/** 文件夹列表 */
export async function listFolders(query: FolderListQuery = {}): Promise<FileFolder[]> {
  const params = new URLSearchParams();
  if (query.projectId !== undefined) params.set('projectId', String(query.projectId));
  const search = params.toString();
  const data = await apiGet<{ items: FileFolder[] }>(`/folders${search ? `?${search}` : ''}`);
  return data.items;
}

/** 新建文件夹 */
export async function createFolder(input: CreateFolderInput): Promise<FileFolder> {
  const data = await apiPost<{ folder: FileFolder }>('/folders', input);
  return data.folder;
}

/** 删除文件夹（软删） */
export async function deleteFolder(id: number): Promise<null> {
  return apiDelete<null>(`/folders/${id}`);
}
