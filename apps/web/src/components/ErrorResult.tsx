import { Button, Result } from 'antd';

/**
 * 接口失败的统一展示 —— pages.md §8.8：
 * 按 HTTP 状态码区分 403 / 404 / 500，错误文案取响应体 message 字段原样展示，不改写。
 */
interface ErrorResultProps {
  /** HTTP 状态码（非 ApiError 记 0） */
  status: number;
  /** 服务端原文 */
  text: string;
  /** 重试回调（不传则不显示重试按钮） */
  onRetry?: () => void;
}

const STATUS_KIND: Record<number, '403' | '404' | '500' | 'error'> = {
  403: '403',
  404: '404',
  500: '500',
};

export function ErrorResult({ status, text, onRetry }: ErrorResultProps) {
  const kind = STATUS_KIND[status] ?? 'error';
  const title =
    status === 403 ? '没有权限' : status === 404 ? '页面不存在' : '加载失败';

  return (
    <Result
      status={kind}
      title={title}
      subTitle={text}
      extra={
        onRetry ? (
          <Button type="primary" onClick={onRetry}>
            重试
          </Button>
        ) : undefined
      }
    />
  );
}
