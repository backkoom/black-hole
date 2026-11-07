import { apiGet, apiPatch } from './client';

/**
 * 系统设置接口（D-22）。
 *
 * - GET   /api/system/settings   → 备份 / 文件存储 / 证书 / 版本
 * - PATCH /api/system/settings   → 只改备份三项（仅超级管理员）
 *
 * 备份配置存数据库，备份脚本每次运行时现读，**改完不用重启**。
 * 文件存储与证书是只读的：改它们要动环境变量并重启进程。
 */

export interface BackupSetting {
  dir: string;
  keep: number;
  enabled: boolean;
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

export const systemKeys = {
  all: ['system'] as const,
  settings: ['system', 'settings'] as const,
};

export async function fetchSystemSettings(): Promise<SystemSettings> {
  return apiGet<SystemSettings>('/system/settings');
}

export async function updateBackupSettings(input: BackupSetting): Promise<BackupSetting> {
  const data = await apiPatch<{ backup: BackupSetting }>('/system/settings', {
    dir: input.dir,
    keep: input.keep,
    enabled: input.enabled,
  });
  return data.backup;
}
