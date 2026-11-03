/**
 * 浏览器端下载 —— 导入模板（CSV 文件流）与导入结果的一次性初始密码回执。
 * 服务端不保存明文，所以密码清单只能由前端当场生成文件。
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // 立刻 revoke 会打断部分浏览器的下载，稍后再回收
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 生成 CSV 文本（带 BOM，Excel 打开中文不乱码） */
export function toCsv(headers: string[], rows: string[][]): string {
  const escape = (cell: string): string =>
    /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  return `\ufeff${lines.join('\r\n')}\r\n`;
}
