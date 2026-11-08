import type { Notification } from '@blackhole/shared/types';
import { apiGet, apiPost } from './client';

/**
 * 站内通知接口（D-28）。
 *
 * - GET  /api/notifications           → { items, unreadCount }（服务端会先补算今天的到期/逾期）
 * - POST /api/notifications/:id/read  → null
 * - POST /api/notifications/read-all   → { updated }
 *
 * 通知是私人的：没有 userId 参数，服务端恒按当前会话取。
 */

export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => ['notifications', 'list'] as const,
};

export interface NotificationList {
  items: Notification[];
  unreadCount: number;
}

export async function listNotifications(
  opts: { unreadOnly?: boolean; limit?: number } = {},
): Promise<NotificationList> {
  const params = new URLSearchParams();
  if (opts.unreadOnly) params.set('unreadOnly', '1');
  if (opts.limit) params.set('limit', String(opts.limit));
  const search = params.toString();
  return apiGet<NotificationList>(`/notifications${search ? `?${search}` : ''}`);
}

export async function markNotificationRead(id: number): Promise<null> {
  return apiPost<null>(`/notifications/${id}/read`, {});
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  return apiPost<{ updated: number }>('/notifications/read-all', {});
}
