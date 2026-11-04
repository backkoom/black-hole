import type { FileAsset, FileFolder, FileKind, FileStats } from '@workbench/shared/types';
import { apiDelete, apiGet, apiPost } from './client';

/**
 * 文件资料接口 —— 用户端「文件资料」页（稿子图7）。
 *
 * 契约（apps/api/src/files/routes.ts）：
 * - GET    /api/files           → { items: FileAsset[] }
 * - GET    /api/files/summary   → FileStats
 * - POST   /api/files           body {name, kind?, sizeBytes?, folderId?, projectId?, version?}
 *                               → { file: FileAsset }
 * - DELETE /api/files/:id       → null（软删）
 * - GET    /api/folders         → { items: FileFolder[] }
 * - POST   /api/folders         body {name, projectId?, parentId?} → { folder: FileFolder }
 * - DELETE /api/folders/:id     → null（软删）
 *
 * 口径：
 * - ⚠️ **本期只登记元数据，不存二进制** —— 没有上传 / 下载接口；
 * - kind：doc / sheet / slide / image / pdf / archive / other；
 * - version 是版本号字符串（如 v1.2），currentVersion 标记是否当前版本；
 * - 普通用户强制只看自己名下的文件与文件夹，管理员不传 userId 即看全员；
 * - 删除是软删（deleted_at）。
 *
 * 类型直接复用 @workbench/shared/types，不在这里另写一份。
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

/** 登记文件（只登记元数据，不上传二进制） */
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
