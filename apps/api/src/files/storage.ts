import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FileKind } from '@blackhole/shared/types';
import { getConfig } from '../config.js';
import { REPO_ROOT } from '../config.js';

/**
 * 文件实体存储（D-19）。
 *
 * 设计取舍：
 * - **按 uuid 落盘**，绝不用用户给的文件名做路径 —— 中文名、重名、`../` 全都不用操心；
 * - 目录按 年/月 分层（`2026/11/<uuid>.pdf`），单目录文件数不会爆炸；
 * - 扩展名只保留 `[a-z0-9]{1,8}`，其余丢弃（防 `file.php.jpg` 这类花活）；
 * - 下载时再按数据库里的 name 生成 Content-Disposition，中文名走 RFC 5987。
 */

/** 存储根目录（相对路径按仓库根解析，生产建议配绝对路径） */
export function storageRoot(): string {
  const cfg = getConfig();
  return isAbsolute(cfg.FILE_STORAGE_DIR)
    ? cfg.FILE_STORAGE_DIR
    : resolve(REPO_ROOT, cfg.FILE_STORAGE_DIR);
}

/** 启动时确保根目录存在（不存在就建，权限问题直接抛，别等到用户上传才炸） */
export async function ensureStorage(): Promise<void> {
  await mkdir(storageRoot(), { recursive: true });
}

/** 单文件上限（字节） */
export function maxUploadBytes(): number {
  return getConfig().MAX_UPLOAD_MB * 1024 * 1024;
}

/** 只保留安全扩展名：最后一段、字母数字、最长 8 位，统一小写 */
export function sanitizeExt(originalName: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(originalName ?? '');
  const ext = m?.[1];
  return ext ? `.${ext.toLowerCase()}` : '';
}

/** 生成存储键：2026/11/<uuid>.<ext> */
export function buildStorageKey(originalName: string, at: Date = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  return `${y}/${m}/${randomUUID()}${sanitizeExt(originalName)}`;
}

/**
 * 把存储键解析成绝对路径。
 * ⚠️ 这是防目录穿越的唯一入口：解析后必须仍在根目录内，
 * 否则 `../../etc/passwd` 这种键会直接读到系统文件。
 */
export function resolveKey(key: string): string {
  const root = storageRoot();
  const full = resolve(root, key);
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error('非法的存储路径');
  }
  return full;
}

/** 流式写盘，同时算 sha256 与实际字节数（不信任客户端声明的大小） */
export async function writeStream(
  source: Readable,
  key: string,
): Promise<{ sizeBytes: number; sha256: string }> {
  const target = resolveKey(key);
  await mkdir(dirname(target), { recursive: true });

  const hash = createHash('sha256');
  let sizeBytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      sizeBytes += chunk.length;
      hash.update(chunk);
      cb(null, chunk);
    },
  });

  await pipeline(source, meter, createWriteStream(target));
  return { sizeBytes, sha256: hash.digest('hex') };
}

/** 删除实体；不存在也当成功（软删时重复调用不该报错） */
export async function removeBlob(key: string | null | undefined): Promise<void> {
  if (!key) return;
  await rm(resolveKey(key), { force: true });
}

/** 按 MIME + 扩展名归类，和 shared 里的 FileKind 对齐 */
export function kindOf(mime: string, originalName: string): FileKind {
  const ext = sanitizeExt(originalName);
  const m = (mime || '').toLowerCase();

  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (
    m.includes('zip') ||
    m.includes('rar') ||
    m.includes('7z') ||
    m.includes('tar') ||
    m.includes('gzip') ||
    ['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)
  ) {
    return 'archive';
  }
  if (m.includes('spreadsheet') || m === 'text/csv' || ['.xls', '.xlsx', '.csv'].includes(ext)) {
    return 'sheet';
  }
  if (m.includes('presentation') || ['.ppt', '.pptx'].includes(ext)) return 'slide';
  if (
    m.startsWith('text/') ||
    m.includes('word') ||
    m.includes('document') ||
    ['.doc', '.docx', '.md', '.txt', '.rtf'].includes(ext)
  ) {
    return 'doc';
  }
  return 'other';
}

/**
 * Content-Disposition：ASCII 兜底 + RFC 5987 的 UTF-8 文件名。
 * 只写 filename="中文" 在部分浏览器（尤其老 IE/某些下载器）会乱码或截断。
 */
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
