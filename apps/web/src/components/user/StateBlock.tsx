import type { ReactNode } from 'react';
import { Alert, Button, Empty, Skeleton } from 'antd';
import { errorStatus, errorText } from '../../api/messages';

/**
 * 用户端三大数据状态 —— 每个数据块都要有：
 * - 加载态：骨架屏；
 * - 错误态：按 HTTP 状态码给标题，文案取服务端 message 原文，可重试；
 * - 空态：图标 + 文案 + 可选补充说明 + 可选行动按钮。
 *
 * 错误态不用整页 Result（会撑破卡片网格），改成卡片内的小 Alert。
 *
 * 2026-11-06 统一：
 * - 骨架屏可以给最小高度（`skeletonMinHeight`）—— 之前只有 3 行 ≈ 100px，
 *   内容一到位面板就长高，整页往下跳一次；固定占位后加载不再抖。
 * - 空态加 `emptyHint`：光写"还没有任务"用户不知道该干什么，补一行说明。
 * - 空态按钮统一 primary 尺寸 small，避免各页一个样。
 */

interface StateBlockProps {
  /** 加载中 */
  loading?: boolean;
  /** 错误（unknown，交给 errorText 解析） */
  error?: unknown;
  /** 数据是否为空（为空才渲染空态） */
  isEmpty?: boolean;
  /** 空态文案：真没数据写「还没有…」，筛选后无结果写「没有符合条件的…」 */
  emptyText?: string;
  /** 空态补充说明（一行灰字，告诉用户下一步做什么） */
  emptyHint?: string;
  /** 空态的行动按钮 */
  emptyAction?: ReactNode;
  /** 重试回调 */
  onRetry?: () => void;
  /** 骨架屏行数 */
  skeletonRows?: number;
  /** 骨架屏最小高度（px）—— 用来抵消"加载完成页面往下跳" */
  skeletonMinHeight?: number;
  /** 正常内容 */
  children?: ReactNode;
}

export function StateBlock({
  loading = false,
  error,
  isEmpty = false,
  emptyText,
  emptyHint,
  emptyAction,
  onRetry,
  skeletonRows = 3,
  skeletonMinHeight,
  children,
}: StateBlockProps) {
  if (loading) {
    return (
      <div style={skeletonMinHeight ? { minHeight: skeletonMinHeight } : undefined}>
        <Skeleton active paragraph={{ rows: skeletonRows }} />
      </div>
    );
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
        description={
          <span>
            <span style={{ display: 'block', color: 'var(--text-2)' }}>
              {emptyText ?? '暂无数据'}
            </span>
            {emptyHint ? (
              <span style={{ display: 'block', marginTop: 4, color: 'var(--muted)', fontSize: 12 }}>
                {emptyHint}
              </span>
            ) : null}
          </span>
        }
      >
        {emptyAction}
      </Empty>
    );
  }

  return <>{children}</>;
}
