import type { FileAsset, FileFolder, FileKind, FileStats } from '@workbench/shared/types';
import { query, queryOne } from '../db.js';
import { notFound, unprocessable } from '../lib/errors.js';
import { formatTimestamp } from '../lib/serialize.js';
import type { SessionContext } from '../auth/service.js';

/**
 * 文件资料 —— 用户端「文件资料」页（稿子图7）。
 *
 * ⚠️ **本期只存元数据**（文件名/类型/大小/版本/上传人），**不存二进制**。
 * 真接对象存储（MinIO/S3）是后面的事，先把清单与版本结构立住。
 */

interface AssetRow {
  id: number;
  project_id: number | null;
  project_name: string | null;
  folder_id: number | null;
  folder_name: string | null;
  name: string;
  kind: FileKind;
  size_bytes: string;
  version: string;
  current_version: boolean;
  owner_name: string | null;
  created_at: Date;
  updated_at: Date;
}

const ASSET_SELECT = `
SELECT f.id, f.project_id, p.name AS project_name, f.folder_id, fo.name AS folder_name,
       f.name, f.kind, f.size_bytes, f.version, f.current_version,
       u.name AS owner_name, f.created_at, f.updated_at
  FROM file_asset f
  LEFT JOIN project p ON p.id = f.project_id AND p.deleted_at IS NULL
  LEFT JOIN file_folder fo ON fo.id = f.folder_id AND fo.deleted_at IS NULL
  LEFT JOIN app_user u ON u.id = f.user_id
`;

function toAsset(r: AssetRow): FileAsset {
  return {
    id: Number(r.id),
    projectId: r.project_id === null ? null : Number(r.project_id),
    projectName: r.project_name,
    folderId: r.folder_id === null ? null : Number(r.folder_id),
    folderName: r.folder_name,
    name: r.name,
    kind: r.kind,
    sizeBytes: Number(r.size_bytes),
    version: r.version,
    currentVersion: r.current_version,
    ownerName: r.owner_name,
    createdAt: formatTimestamp(r.created_at) as string,
    updatedAt: formatTimestamp(r.updated_at) as string,
  };
}

export async function listFiles(
  q: { folderId?: number; kind?: FileKind; projectId?: number; userId?: number },
): Promise<FileAsset[]> {
  const where: string[] = ['f.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (q.userId !== undefined) {
    params.push(q.userId);
    where.push(`f.user_id = $${params.length}`);
  }
  if (q.folderId !== undefined) {
    params.push(q.folderId);
    where.push(`f.folder_id = $${params.length}`);
  }
  if (q.kind !== undefined) {
    params.push(q.kind);
    where.push(`f.kind = $${params.length}`);
  }
  if (q.projectId !== undefined) {
    params.push(q.projectId);
    where.push(`f.project_id = $${params.length}`);
  }
  const rows = await query<AssetRow>(
    `${ASSET_SELECT} WHERE ${where.join(' AND ')} ORDER BY f.created_at DESC, f.id DESC`,
    params,
  );
  return rows.map(toAsset);
}

export async function createFile(
  input: {
    name: string;
    kind?: FileKind;
    sizeBytes?: number;
    folderId?: number | null;
    projectId?: number | null;
    version?: string;
  },
  actor: SessionContext,
): Promise<FileAsset> {
  const name = input.name.trim();
  if (!name || name.length > 256) throw unprocessable('文件名需 1 至 256 个字符');
  const ins = await queryOne<{ id: number }>(
    `INSERT INTO file_asset
       (project_id, user_id, folder_id, name, kind, size_bytes, version, current_version)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'other'), $6, COALESCE($7, 'v1.0'), true)
     RETURNING id`,
    [
      input.projectId ?? null,
      actor.user.id,
      input.folderId ?? null,
      name,
      input.kind ?? null,
      input.sizeBytes ?? 0,
      input.version ?? null,
    ],
  );
  if (!ins) throw notFound('创建失败');
  const row = await queryOne<AssetRow>(`${ASSET_SELECT} WHERE f.id = $1`, [Number(ins.id)]);
  if (!row) throw notFound('文件不存在');
  return toAsset(row);
}

export async function deleteFile(id: number, actor: SessionContext): Promise<void> {
  const row = await queryOne<{ user_id: number }>(
    'SELECT user_id FROM file_asset WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!row) throw notFound('文件不存在');
  if (actor.user.role !== 'admin' && Number(row.user_id) !== actor.user.id) {
    throw notFound('文件不存在');
  }
  await query('UPDATE file_asset SET deleted_at = now(), updated_at = now() WHERE id = $1', [id]);
}

interface FolderRow {
  id: number;
  project_id: number | null;
  parent_id: number | null;
  name: string;
  file_count: string;
  created_at: Date;
  updated_at: Date;
}

const FOLDER_SELECT = `
SELECT fo.id, fo.project_id, fo.parent_id, fo.name,
       (SELECT count(*) FROM file_asset f
         WHERE f.folder_id = fo.id AND f.deleted_at IS NULL)::text AS file_count,
       fo.created_at, fo.updated_at
  FROM file_folder fo
`;

function toFolder(r: FolderRow): FileFolder {
  return {
    id: Number(r.id),
    projectId: r.project_id === null ? null : Number(r.project_id),
    parentId: r.parent_id === null ? null : Number(r.parent_id),
    name: r.name,
    fileCount: Number(r.file_count),
    createdAt: formatTimestamp(r.created_at) as string,
    updatedAt: formatTimestamp(r.updated_at) as string,
  };
}

export async function listFolders(userId?: number, projectId?: number): Promise<FileFolder[]> {
  const where: string[] = ['fo.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (userId !== undefined) {
    params.push(userId);
    where.push(`fo.user_id = $${params.length}`);
  }
  if (projectId !== undefined) {
    params.push(projectId);
    where.push(`fo.project_id = $${params.length}`);
  }
  const rows = await query<FolderRow>(
    `${FOLDER_SELECT} WHERE ${where.join(' AND ')} ORDER BY fo.name, fo.id`,
    params,
  );
  return rows.map(toFolder);
}

export async function createFolder(
  input: { name: string; projectId?: number | null; parentId?: number | null },
  actor: SessionContext,
): Promise<FileFolder> {
  const name = input.name.trim();
  if (!name || name.length > 128) throw unprocessable('文件夹名需 1 至 128 个字符');
  const ins = await queryOne<{ id: number }>(
    `INSERT INTO file_folder (project_id, user_id, parent_id, name)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.projectId ?? null, actor.user.id, input.parentId ?? null, name],
  );
  if (!ins) throw notFound('创建失败');
  const row = await queryOne<FolderRow>(`${FOLDER_SELECT} WHERE fo.id = $1`, [Number(ins.id)]);
  if (!row) throw notFound('文件夹不存在');
  return toFolder(row);
}

export async function deleteFolder(id: number, actor: SessionContext): Promise<void> {
  const row = await queryOne<{ user_id: number }>(
    'SELECT user_id FROM file_folder WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!row) throw notFound('文件夹不存在');
  if (actor.user.role !== 'admin' && Number(row.user_id) !== actor.user.id) {
    throw notFound('文件夹不存在');
  }
  await query('UPDATE file_folder SET deleted_at = now(), updated_at = now() WHERE id = $1', [id]);
}

/** 分类统计 + 容量 */
export async function getFileStats(userId?: number): Promise<FileStats> {
  const scope = userId !== undefined ? 'AND f.user_id = $1' : '';
  const params = userId !== undefined ? [userId] : [];

  const kindRow = await query<{ kind: FileKind; count: string; bytes: string }>(
    `SELECT f.kind, count(*)::text AS count, COALESCE(sum(f.size_bytes), 0)::text AS bytes
       FROM file_asset f WHERE f.deleted_at IS NULL ${scope}
      GROUP BY 1 ORDER BY count(*) DESC`,
    params,
  );
  const totalRow = await queryOne<{ count: string; bytes: string }>(
    `SELECT count(*)::text AS count, COALESCE(sum(f.size_bytes), 0)::text AS bytes
       FROM file_asset f WHERE f.deleted_at IS NULL ${scope}`,
    params,
  );
  const folderRow = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM file_folder fo
      WHERE fo.deleted_at IS NULL ${userId !== undefined ? 'AND fo.user_id = $1' : ''}`,
    params,
  );

  const totalBytes = Number(totalRow?.bytes ?? 0);
  return {
    totalCount: Number(totalRow?.count ?? 0),
    totalBytes,
    folderCount: Number(folderRow?.count ?? 0),
    byKind: kindRow.map((r) => ({
      kind: r.kind,
      count: Number(r.count),
      bytes: Number(r.bytes),
    })),
  };
}
