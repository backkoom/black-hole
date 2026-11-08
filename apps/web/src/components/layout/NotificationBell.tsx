import { useState } from 'react';
import { App as AntdApp, Badge, Button, Popover } from 'antd';
import {
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Notification, NotificationKind } from '@blackhole/shared/types';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationKeys,
} from '../../api/notifications';
import { errorText } from '../../api/messages';

/**
 * 顶栏通知铃铛（D-28）。
 *
 * 为什么是 Popover 而不是新开一页：
 * 通知是"顺手看一眼、点进去处理"的东西，多一个顶级菜单项会把 5 个模块的导航撑乱；
 * 需要看历史时再做成页面也不迟（现在只保留最近 8 条 + 全部已读）。
 *
 * 数据：60 秒轮询一次；点开面板时强制刷新一次（可能是刚派给新任务）。
 */

const KIND_META: Record<NotificationKind, { icon: JSX.Element; color: string }> = {
  task_due: { icon: <ClockCircleOutlined />, color: '#2563eb' },
  task_overdue: { icon: <ExclamationCircleOutlined />, color: '#ef4444' },
  system: { icon: <InfoCircleOutlined />, color: '#8b5cf6' },
};

/** 相对时间：今天显示 HH:mm，昨天显示"昨天"，更早显示 M-D */
function relativeTime(value: string): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '';
  const now = new Date();
  const sameDay = at.toDateString() === now.toDateString();
  const pad = (n: number): string => String(n).padStart(2, '0');
  if (sameDay) return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (at.toDateString() === yesterday.toDateString()) return '昨天';
  return `${at.getMonth() + 1}-${at.getDate()}`;
}

export function NotificationBell(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const [open, setOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: notificationKeys.list(),
    queryFn: () => listNotifications({ limit: 8 }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const items = listQuery.data?.items ?? [];
  const unread = listQuery.data?.unreadCount ?? 0;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  };

  const readMutation = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: () => void refresh(),
    onError: (err) => void message.error(errorText(err)),
  });

  const readAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: async (result) => {
      await refresh();
      void message.success(result.updated > 0 ? `已把 ${result.updated} 条标为已读` : '没有未读通知');
    },
    onError: (err) => void message.error(errorText(err)),
  });

  const openItem = (item: Notification) => {
    if (!item.readAt) readMutation.mutate(item.id);
    setOpen(false);
    if (item.link) void navigate(item.link);
  };

  const content = (
    <div className="wb-notify-panel">
      <div className="wb-notify-head">
        <span className="wb-notify-title">
          通知
          {unread > 0 ? <span className="wb-notify-count">{unread} 条未读</span> : null}
        </span>
        <Button
          type="link"
          size="small"
          icon={<CheckCircleOutlined />}
          disabled={unread === 0}
          loading={readAllMutation.isPending}
          onClick={() => readAllMutation.mutate()}
        >
          全部已读
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="wb-notify-empty">
          {listQuery.isPending ? '加载中…' : '暂时没有提醒'}
          <span className="wb-notify-empty-hint">任务今天到期或逾期时，这里会出现提醒</span>
        </div>
      ) : (
        <ul className="wb-notify-list">
          {items.map((item) => {
            const meta = KIND_META[item.kind] ?? KIND_META.system;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`wb-notify-item${item.readAt ? '' : ' is-unread'}`}
                  onClick={() => openItem(item)}
                >
                  <span className="wb-notify-icon" style={{ color: meta.color }}>
                    {meta.icon}
                  </span>
                  <span className="wb-notify-main">
                    <span className="wb-notify-text" title={item.title}>
                      {item.title}
                    </span>
                    {item.body ? <span className="wb-notify-body">{item.body}</span> : null}
                  </span>
                  <span className="wb-notify-time">{relativeTime(item.createdAt)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void listQuery.refetch();
      }}
      arrow={false}
      styles={{ body: { padding: 0 } }}
    >
      <button type="button" className="wb-notify-trigger" aria-label={`通知，${unread} 条未读`}>
        <Badge count={unread} size="small" offset={[2, -2]}>
          <BellOutlined className="wb-notify-bell" />
        </Badge>
      </button>
    </Popover>
  );
}
