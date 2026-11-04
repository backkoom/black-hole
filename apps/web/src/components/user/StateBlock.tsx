import type { ReactNode } from 'react';
import { Alert, Button, Empty, Skeleton } from 'antd';
import { errorStatus, errorText } from '../../api/messages';

/**
 * 用户端三大数据状态 —— 每个数据块都要有：
 * - 加载态：骨架屏；
 * - 错误态：按 HTTP 状态码给标题，文案取服务端 message 原文，可重试；
 * - 空态：图标 + 文案 + 可选行动按钮。
 *
 * 错误态不用整页 Result（会撑破卡片网格），改成卡片内的小 Alert。
 */

interface StateBlockProps {
  /** 加载中 */
  loading?: boolean;
  /** 错误（unknown，交给 errorText 解析） */
  error?: unknown;
  /** 数据是否为空（为空才渲染空态） */
  isEmpty?: boolean;
  /** 空态文案 */
  emptyText?: string;
  /** 空态的行动按钮 */
  emptyAction?: ReactNode;
  /** 重试回调 */
  onRetry?: () => void;
  /** 骨架屏行数 */
  skeletonRows?: number;
  /** 正常内容 */
  children?: ReactNode;
}

export function StateBlock({
  loading = false,
  error,
  isEmpty = false,
  emptyText,
  emptyAction,
  onRetry,
  skeletonRows = 3,
  children,
}: StateBlockProps) {
  if (loading) {
    return <Skeleton active paragraph={{ rows: skeletonRows }} />;
  }

  if (error !== undefined && error !== null) {
    const status = errorStatus(error);
    const title =
      status === 403 ? '没有权限' : status === 404 ? '资源不存在' : '加载失败';
    return (
      <Alert
        type="error"
        showIcon
        message={title}
        description={errorText(error)}
        action={
          onRetry ? (
            <Button size="small" onClick={onRetry}>
              重试
            </Button>
          ) : undefined
        }
      />
    );
  }

  if (isEmpty) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        styles={{ image: { height: 52 } }}
        description={emptyText ?? '暂无数据'}
      >
        {emptyAction}
      </Empty>
    );
  }

  return <>{children}</>;
}
