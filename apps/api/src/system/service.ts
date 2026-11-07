import { X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { getConfig, REPO_ROOT } from '../config.js';
import { forbidden, unprocessable } from '../lib/errors.js';
import type { SessionContext } from '../auth/service.js';

/**
 * 系统设置（D-22）—— 设置页里"太空"的那部分补上。
 *
 * 三个面板：
 *  1. **备份**：目录 / 保留份数 / 是否启用 —— 可在线改，存 system_setting 表，
 *     备份脚本每次运行时从库里读（读不到回退环境变量），**改完不用重启**；
 *  2. **文件存储**：目录、单文件上限、已用容量 —— 只读（改这些要动环境变量并重启）；
 *  3. **HTTPS 证书**：读 /etc/nginx/ssl/*.crt 的 subject / 有效期 / SAN —— 只读。
 *     证书由使用方自备，这里只做"现在装的是什么、什么时候过期"的展示。
 *
 * 权限：**仅超级管理员**。备份目录决定服务器往哪写盘，不该让普通管理员改。
 */

const KEYS = {
  dir: 'backup.dir',
  keep: 'backup.keep',
  enabled: 'backup.enabled',
} as const;

export interface BackupSetting {
  dir: string;
  keep: number;
  enabled: boolean;
  /** 值来自数据库还是环境变量默认值 */
  source: 'db' | 'env';
}

export interface SystemSettings {
  backup: BackupSetting;
  storage: {
    dir: string;
    maxUploadMb: number;
    fileCount: number;
    usedBytes: number;
  };
  tls: {
    path: string;
    found: boolean;
    subject?: string;
    issuer?: string;
    validFrom?: string;
    validTo?: string;
    daysLeft?: number;
    sans?: string[];
    error?: string;
  };
  version: {
    node: string;
    release: string | null;
  };
}

function envBackup(): BackupSetting {
  return {
    dir: process.env.BACKUP_DIR ?? '/data/backups/blackhole',
    keep: Number(process.env.BACKUP_KEEP ?? 14),
    enabled: (process.env.BACKUP_ENABLED ?? 'true') !== 'false',
    source: 'env',
  };
}

function certPath(): string {
  return process.env.TLS_CERT_PATH ?? '/etc/nginx/ssl/blackhole.crt';
}

async function readTls(): Promise<SystemSettings['tls']> {
  const path = certPath();
  try {
    const pem = await readFile(path, 'utf8');
    const cert = new X509Certificate(pem);
    const validTo = new Date(cert.validTo);
    const daysLeft = Math.round((validTo.getTime() - Date.now()) / 86_400_000);
    return {
      path,
      found: true,
      subject: cert.subject.replace(/\n/g, ', '),
      issuer: cert.issuer.replace(/\n/g, ', '),
      validFrom: cert.validFrom,
      validTo: cert.validTo,
      daysLeft,
      sans: (cert.subjectAltName ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    };
  } catch (err) {
    // 文件不存在/读不到都当"未配置"，别让设置页整页报错
    return { path, found: false, error: (err as Error).message };
  }
}

/** 发布版本：RELEASE.txt 第一行（构建时间），没有就 null */
async function readRelease(): Promise<string | null> {
  try {
    const text = await readFile(join(REPO_ROOT, 'RELEASE.txt'), 'utf8');
    return text.split('\n')[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const cfg = getConfig();
  const rows = await query<{ key: string; value: string }>(
    'SELECT key, value FROM system_setting WHERE key LIKE $1',
    ['backup.%'],
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const fallback = envBackup();

  const backup: BackupSetting = {
    dir: map.get(KEYS.dir) ?? fallback.dir,
    keep: Number(map.get(KEYS.keep) ?? fallback.keep),
    enabled: (map.get(KEYS.enabled) ?? String(fallback.enabled)) !== 'false',
    source: map.size > 0 ? 'db' : 'env',
  };

  // ⚠️ 只统计**有实体**的行：演示/历史数据只有登记信息（storage_key IS NULL），
  //    把它们的大小算进"已用容量"会让运维以为磁盘被占了，实际一个字节都没有。
  const stat = await queryOne<{ count: string; bytes: string }>(
    `SELECT count(*)::text AS count, COALESCE(sum(size_bytes), 0)::text AS bytes
       FROM file_asset
      WHERE deleted_at IS NULL AND storage_key IS NOT NULL`,
  );

  return {
    backup,
    storage: {
      dir: process.env.FILE_STORAGE_DIR ?? cfg.FILE_STORAGE_DIR,
      maxUploadMb: cfg.MAX_UPLOAD_MB,
      fileCount: Number(stat?.count ?? 0),
      usedBytes: Number(stat?.bytes ?? 0),
    },
    tls: await readTls(),
    version: { node: process.version, release: await readRelease() },
  };
}

const updateSchema = z.object({
  dir: z.string().min(1).max(256),
  keep: z.number().int().min(1).max(365),
  enabled: z.boolean(),
});

export async function updateBackupSettings(
  input: unknown,
  actor: SessionContext,
): Promise<BackupSetting> {
  if (!actor.user.isSuper) throw forbidden('只有超级管理员可以修改系统设置');

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) throw unprocessable('备份设置有误：目录必填，保留份数 1~365');

  const { dir, keep, enabled } = parsed.data;
  // 必须绝对路径：相对路径在 systemd 下会按 WorkingDirectory 解析，容易写错地方
  if (!dir.startsWith('/')) throw unprocessable('备份目录必须是绝对路径（以 / 开头）');

  const entries: [string, string][] = [
    [KEYS.dir, dir],
    [KEYS.keep, String(keep)],
    [KEYS.enabled, String(enabled)],
  ];
  for (const [key, value] of entries) {
    await query(
      `INSERT INTO system_setting (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, value],
    );
  }
  const next = await getSystemSettings();
  return next.backup;
}
