import type { FileAsset, FileFolder, FileKind, FileStats, FileVersion } from '@blackhole/shared/types';
import { query, queryOne } from '../db.js';
import { notFound, unprocessable } from '../lib/errors.js';
import { formatTimestamp } from '../lib/serialize.js';
import type { SessionContext } from '../auth/service.js';
import { buildStorageKey, copyBlob, removeBlob } from './storage.js';

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
  version_no: number;
  current_version: boolean;
  storage_key: string | null;
  mime_type: string | null;
  owner_name: string | null;
  created_at: Date;
  updated_at: Date;
}

const ASSET_SELECT = `
SELECT f.id, f.project_id, p.name AS project_name, f.folder_id, fo.name AS folder_name,
       f.name, f.kind, f.size_bytes, f.version, f.version_no, f.current_version,
       f.storage_key, f.mime_type,
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
    versionNo: Number(r.version_no ?? 1),
    currentVersion: r.current_version,
    hasFile: r.storage_key !== null,
    mimeType: r.mime_type,
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

/** 上传：先落盘、再写元数据（落盘失败就不该有脏数据） */
export async function saveUploadedFile(
  input: {
    name: string;
    kind: FileKind;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    sha256: string;
    folderId?: number | null;
    projectId?: number | null;
  },
  actor: SessionContext,
): Promise<FileAsset> {
  const name = input.name.trim();
  if (!name || name.length > 256) throw unprocessable('文件名需 1 至 256 个字符');
  const ins = await queryOne<{ id: number }>(
    `INSERT INTO file_asset
       (project_id, user_id, folder_id, name, kind, size_bytes, version, current_version,
        storage_key, mime_type, sha256)
     VALUES ($1, $2, $3, $4, $5, $6, 'v1.0', true, $7, $8, $9)
     RETURNING id`,
    [
      input.projectId ?? null,
      actor.user.id,
      input.folderId ?? null,
      name,
      input.kind,
      input.sizeBytes,
      input.storageKey,
      input.mimeType,
      input.sha256,
    ],
  );
  if (!ins) throw notFound('创建失败');
  const fileId = Number(ins.id);
  // 首个版本也入库：版本历史从"上传那一刻"开始，不做特例（否则版本列表要判空）
  await query(
    `INSERT INTO file_version (file_id, version_no, storage_key, size_bytes, mime_type, sha256, uploaded_by)
     VALUES ($1, 1, $2, $3, $4, $5, $6)
     ON CONFLICT (file_id, version_no) DO NOTHING`,
    [fileId, input.storageKey, input.sizeBytes, input.mimeType, input.sha256, actor.user.id],
  );
  const row = await queryOne<AssetRow>(`${ASSET_SELECT} WHERE f.id = $1`, [fileId]);
  if (!row) throw notFound('文件不存在');
  return toAsset(row);
}

/** 下载取件：校验归属，返回磁盘键与原始文件名 */
export async function getDownloadTarget(
  id: number,
  actor: SessionContext,
): Promise<{ storageKey: string; name: string; mimeType: string | null; sizeBytes: number }> {
  const row = await queryOne<{
    storage_key: string | null;
    name: string;
    mime_type: string | null;
    size_bytes: string;
    user_id: number;
  }>(
    `SELECT storage_key, name, mime_type, size_bytes, user_id
       FROM file_asset WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (!row) throw notFound('文件不存在');
  if (actor.user.role !== 'admin' && Number(row.user_id) !== actor.user.id) {
    throw notFound('文件不存在');
  }
  if (!row.storage_key) {
    // 历史登记数据（只有名字和大小，没有实体）—— 说清楚，别让人以为文件坏了
    throw notFound('该文件只有登记信息，没有可下载的实体');
  }
  return {
    storageKey: row.storage_key,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
  };
}

export async function deleteFile(id: number, actor: SessionContext): Promise<void> {
  const row = await queryOne<{ user_id: number; storage_key: string | null }>(
    'SELECT user_id, storage_key FROM file_asset WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!row) throw notFound('文件不存在');
  if (actor.user.role !== 'admin' && Number(row.user_id) !== actor.user.id) {
    throw notFound('文件不存在');
  }
  await query('UPDATE file_asset SET deleted_at = now(), updated_at = now() WHERE id = $1', [id]);
  // 行删了实体也删：不然磁盘只涨不降，而备份里还留着一堆没人能访问的文件。
  // ⚠️ 历史版本各自占一份实体（D-27），必须逐个删，只删当前版本会留下孤儿文件。
  const versions = await query<{ storage_key: string }>(
    'SELECT storage_key FROM file_version WHERE file_id = $1',
    [id],
  );
  const keys = new Set<string>(versions.map((v) => v.storage_key));
  if (row.storage_key) keys.add(row.storage_key);
  for (const key of keys) {
    // 删盘失败不影响接口结果（数据库已经标记删除），只记日志。
    try {
      await removeBlob(key);
    } catch (err) {
      console.warn('[files] 删除实体失败', key, err);
    }
  }
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

/* ------------------------------------------------------------------ *
 * 文件版本历史（D-27）
 * ------------------------------------------------------------------ */

interface VersionRow {
  version_no: number;
  size_bytes: string;
  mime_type: string | null;
  sha256: string | null;
  note: string | null;
  uploaded_name: string | null;
  created_at: Date;
}

function toVersion(r: VersionRow): FileVersion {
  return {
    versionNo: Number(r.version_no),
    sizeBytes: Number(r.size_bytes),
    mimeType: r.mime_type,
    sha256: r.sha256,
    note: r.note,
    uploadedByName: r.uploaded_name,
    createdAt: formatTimestamp(r.created_at) as string,
  };
}

/** 版本列表：新的在前；current 由调用方按 file_asset.version_no 标记 */
export async function listFileVersions(id: number, actor: SessionContext): Promise<FileVersion[]> {
  await assertFileAccess(id, actor, 'file_id, version_no, storage_key');
  const rows = await query<VersionRow>(
    `SELECT v.version_no, v.size_bytes, v.mime_type, v.sha256, v.note,
            u.name AS uploaded_name, v.created_at
       FROM file_version v
       LEFT JOIN app_user u ON u.id = v.uploaded_by
      WHERE v.file_id = $1
      ORDER BY v.version_no DESC`,
    [id],
  );
  return rows.map(toVersion);
}

/** 取"当前版本号"，用于前端标 current */
export async function getCurrentVersionNo(id: number): Promise<number> {
  const row = await queryOne<{ version_no: number }>(
    'SELECT version_no FROM file_asset WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  return row ? Number(row.version_no) : 0;
}

/** 新增一个版本（上传新文件内容），并把 file_asset 指向它 */
export async function addFileVersion(
  id: number,
  input: {
    storageKey: string;
    sizeBytes: number;
    mimeType: string;
    sha256: string;
    note?: string | null;
  },
  actor: SessionContext,
): Promise<FileAsset> {
  const asset = await assertFileAccess(id, actor, 'file_id, version_no, storage_key');
  // 只有登记信息的老数据没有实体，第一次补文件应记作 v1（否则会凭空从 v2 开始）
  const nextNo = asset.storage_key ? Number(asset.version_no) + 1 : 1;
  await query(
    `INSERT INTO file_version (file_id, version_no, storage_key, size_bytes, mime_type, sha256, note, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      nextNo,
      input.storageKey,
      input.sizeBytes,
      input.mimeType,
      input.sha256,
      input.note ?? null,
      actor.user.id,
    ],
  );
  await query(
    `UPDATE file_asset
        SET storage_key = $2, size_bytes = $3, mime_type = $4, sha256 = $5,
            version_no = $6, version = $7, updated_at = now()
      WHERE id = $1`,
    [id, input.storageKey, input.sizeBytes, input.mimeType, input.sha256, nextNo, `v${nextNo}.0`],
  );
  const row = await queryOne<AssetRow>(`${ASSET_SELECT} WHERE f.id = $1`, [id]);
  if (!row) throw notFound('文件不存在');
  return toAsset(row);
}

/** 历史版本的取件信息（下载某一版） */
export async function getVersionDownloadTarget(
  id: number,
  versionNo: number,
  actor: SessionContext,
): Promise<{ storageKey: string; name: string; mimeType: string | null; sizeBytes: number }> {
  const asset = await assertFileAccess(id, actor, 'file_id, name, mime_type');
  const row = await queryOne<{
    storage_key: string;
    size_bytes: string;
    mime_type: string | null;
  }>(
    'SELECT storage_key, size_bytes, mime_type FROM file_version WHERE file_id = $1 AND version_no = $2',
    [id, versionNo],
  );
  if (!row) throw notFound('该版本不存在');
  const ext = asset.name.includes('.') ? asset.name.slice(asset.name.lastIndexOf('.')) : '';
  const base = ext ? asset.name.slice(0, -ext.length) : asset.name;
  return {
    storageKey: row.storage_key,
    name: `${base}-v${versionNo}${ext}`,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
  };
}

/**
 * 回滚：以历史版本的内容**生成一个新版本**（不是把版本号退回去）。
 *
 * 这样审计链是连续的（谁在什么时候把哪一版的内容又拿出来用，一目了然），
 * 也不会出现"当前版本号变小、后面又有更大号"的混乱。
 */
export async function restoreFileVersion(
  id: number,
  versionNo: number,
  actor: SessionContext,
): Promise<FileAsset> {
  await assertFileAccess(id, actor, 'file_id, name');
  const src = await queryOne<{
    storage_key: string;
    size_bytes: string;
    mime_type: string | null;
    sha256: string | null;
  }>('SELECT storage_key, size_bytes, mime_type, sha256 FROM file_version WHERE file_id = $1 AND version_no = $2', [
    id,
    versionNo,
  ]);
  if (!src) throw notFound('该版本不存在');

  const asset = await queryOne<{ name: string }>(
    'SELECT name FROM file_asset WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  const newKey = buildStorageKey(asset?.name ?? 'file');
  await copyBlob(src.storage_key, newKey);
  try {
    return await addFileVersion(
      id,
      {
        storageKey: newKey,
        sizeBytes: Number(src.size_bytes),
        mimeType: src.mime_type ?? 'application/octet-stream',
        sha256: src.sha256 ?? '',
        note: `回滚自 v${versionNo}`,
      },
      actor,
    );
  } catch (err) {
    // 写库失败要把刚复制的实体删掉，别留孤儿
    await removeBlob(newKey).catch(() => undefined);
    throw err;
  }
}

/** 归属校验：只有本人或管理员能碰；不存在与无权限都回 404（不泄露存在性） */
async function assertFileAccess<T extends string>(
  id: number,
  actor: SessionContext,
  _fields: T,
): Promise<{
  file_id: number;
  version_no: number;
  storage_key: string | null;
  name: string;
  mime_type: string | null;
}> {
  const row = await queryOne<{
    file_id: number;
    version_no: number;
    storage_key: string | null;
    name: string;
    mime_type: string | null;
    user_id: number;
  }>('SELECT id AS file_id, version_no, storage_key, name, mime_type, user_id FROM file_asset WHERE id = $1 AND deleted_at IS NULL', [
    id,
  ]);
  if (!row) throw notFound('文件不存在');
  if (actor.user.role !== 'admin' && Number(row.user_id) !== actor.user.id) {
    throw notFound('文件不存在');
  }
  return {
    file_id: Number(row.file_id),
    version_no: Number(row.version_no),
    storage_key: row.storage_key,
    name: row.name,
    mime_type: row.mime_type,
  };
}
