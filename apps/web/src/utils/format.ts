/**
 * 通用格式化（2026-11-08 从 FilesPage 抽出来 —— 系统设置页也要用）。
 */

/**
 * 字节数 → 人类可读。
 * - 不足 1KB 用字节；不足 1MB 用 KB；不足 1GB 用 MB；否则用 GB
 * - KB/MB 保留 1 位小数，GB 保留 2 位
 * - 0 字节显示「0 B」
 */
export function formatBytes(bytes: number | null | undefined): string {
  const value = bytes ?? 0;
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
