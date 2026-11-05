import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import tz from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(tz);

/**
 * 相对时间（Asia/Shanghai）—— 团队协作页的公告 / 讨论 / 审批用它显示「多久之前」。
 *
 * ⚠️ 为什么不在 utils/datetime.ts 里：那个文件只有**绝对**时间格式化
 *    （formatDateTime / formatChineseDate 等），没有相对时间函数，
 *    而 utils/ 不在本次可改文件范围内 —— 所以放在 components/team/ 下自用。
 *
 * 解析口径与 utils/datetime.ts 一致：服务端给的是带 +08:00 的 ISO 字符串，
 * 先按字符串里的偏移解析成时间点，再换算到东八区。
 */
export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = dayjs(value);
  if (!parsed.isValid()) return '—';

  const target = parsed.tz('Asia/Shanghai');
  const now = dayjs().tz('Asia/Shanghai');

  const minutes = now.diff(target, 'minute');
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = now.diff(target, 'hour');
  if (hours < 24) return `${hours} 小时前`;

  const days = now.startOf('day').diff(target.startOf('day'), 'day');
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;

  return target.format('YYYY-MM-DD');
}
