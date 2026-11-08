import { query, queryOne } from '../db.js';
import { notFound } from '../lib/errors.js';
import { formatTimestamp } from '../lib/serialize.js';
import type { Notification } from '@blackhole/shared/types';

/**
 * 站内通知（D-28，二期 P2-C）。
 *
 * 为什么"读时补算"而不是定时任务：
 * - 定时器（systemd timer）要处理"服务停过 → 那天没发"的补跑，还得单独写脚本；
 * - 用户真正关心的是"我打开面板时有没有新提醒"，所以拉列表时扫一遍自己的任务最直接；
 * - dedupe_key 带日期 + ON CONFLICT DO NOTHING，重复扫不会重复发。
 *
 * 口径：
 * - task_due：今天到期且未完成 → 每天一条；
 * - task_overdue：已过到期日且未完成 → 每天一条（会连续几天提醒，直到处理）；
 * - 只给"任务归属人"发，不打扰别人；
 * - 已读是软标记（read_at），不删除，便于回看。
 */

interface NotificationRow {
  id: number;
  kind: Notification['kind'];
  title: string;
  body: string | null;
  link: string | null;
  read_at: Date | null;
  created_at: Date;
}

function toNotification(r: NotificationRow): Notification {
  return {
    id: Number(r.id),
    kind: r.kind,
    title: r.title,
    body: r.body,
    link: r.link,
    readAt: r.read_at ? (formatTimestamp(r.read_at) as string) : null,
    createdAt: formatTimestamp(r.created_at) as string,
  };
}

/**
 * 补算今天的提醒（幂等）。
 *
 * SQL 直接 INSERT ... SELECT，一条语句覆盖"今天到期"和"已逾期"两类，
 * 不做 N+1 查询；dedupe_key = 类型:任务id:日期，保证同一天只发一次。
 */
export async function syncDueNotifications(userId: number): Promise<void> {
  await query(
    `INSERT INTO notification (user_id, kind, title, body, link, dedupe_key)
     SELECT t.user_id,
            'task_due',
            '今天到期：' || t.title,
            COALESCE(p.name, '未挂项目') || ' · 到期日 ' || to_char(t.due_date, 'YYYY-MM-DD'),
            '/projects?view=tasks&due=today',
            'task-due:' || t.id || ':' || to_char(CURRENT_DATE, 'YYYY-MM-DD')
       FROM task t
       LEFT JOIN project p ON p.id = t.project_id AND p.deleted_at IS NULL
      WHERE t.user_id = $1
        AND t.deleted_at IS NULL
        AND t.status <> 'done'
        AND t.due_date = CURRENT_DATE
     ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
    [userId],
  );

  await query(
    `INSERT INTO notification (user_id, kind, title, body, link, dedupe_key)
     SELECT t.user_id,
            'task_overdue',
            '已逾期：' || t.title,
            COALESCE(p.name, '未挂项目') || ' · 到期日 ' || to_char(t.due_date, 'YYYY-MM-DD'),
            '/projects?view=tasks&due=overdue',
            'task-overdue:' || t.id || ':' || to_char(CURRENT_DATE, 'YYYY-MM-DD')
       FROM task t
       LEFT JOIN project p ON p.id = t.project_id AND p.deleted_at IS NULL
      WHERE t.user_id = $1
        AND t.deleted_at IS NULL
        AND t.status <> 'done'
        AND t.due_date < CURRENT_DATE
     ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
    [userId],
  );
}

const SELECT_NOTIFICATION = `
SELECT id, kind, title, body, link, read_at, created_at
  FROM notification
`;

export async function listNotifications(
  userId: number,
  opts: { unreadOnly?: boolean; limit?: number } = {},
): Promise<Notification[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const cond = opts.unreadOnly ? 'AND read_at IS NULL' : '';
  const rows = await query<NotificationRow>(
    `${SELECT_NOTIFICATION}
      WHERE user_id = $1 ${cond}
      ORDER BY (read_at IS NULL) DESC, created_at DESC
      LIMIT ${limit}`,
    [userId],
  );
  return rows.map(toNotification);
}

export async function countUnread(userId: number): Promise<number> {
  const row = await queryOne<{ count: string }>(
    'SELECT count(*)::text AS count FROM notification WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return Number(row?.count ?? 0);
}

/** 标记单条已读；不是自己的通知一律 404（不泄露存在性） */
export async function markNotificationRead(userId: number, id: number): Promise<void> {
  const row = await queryOne<{ id: number }>(
    'SELECT id FROM notification WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  if (!row) throw notFound('通知不存在');
  await query('UPDATE notification SET read_at = now() WHERE id = $1 AND read_at IS NULL', [id]);
}

export async function markAllNotificationsRead(userId: number): Promise<number> {
  const rows = await query<{ id: number }>(
    `UPDATE notification SET read_at = now()
      WHERE user_id = $1 AND read_at IS NULL
      RETURNING id`,
    [userId],
  );
  return rows.length;
}
