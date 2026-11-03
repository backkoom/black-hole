import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { errorText } from '../api/messages';

/**
 * 带「3 秒超时」的异步资源 hook —— pages.md 全局设计基线：
 *
 * - 首次加载显示骨架屏；
 * - **超过 3 秒转失败态**（不能无限转圈）；
 * - 接口失败（断网等）同样进失败态，不白屏；
 * - 错误文案取响应体 message 原文（openapi §6.1）。
 */

/** 超过这个时长还没回来就当失败 */
export const ASYNC_TIMEOUT_MS = 3000;

export type AsyncState<TData> =
  | { status: 'loading' }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'success'; data: TData };

export interface AsyncResourceOptions<TData> {
  queryKey: readonly unknown[];
  queryFn: () => Promise<TData>;
  enabled?: boolean;
}

export function useAsyncResource<TData>(options: AsyncResourceOptions<TData>): AsyncState<TData> {
  const query = useQuery({
    queryKey: options.queryKey,
    queryFn: options.queryFn,
    enabled: options.enabled ?? true,
    retry: false,
    staleTime: 30_000,
  });
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!query.isPending) {
      setTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setTimedOut(true), ASYNC_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [query.isPending, query.dataUpdatedAt]);

  const retry = (): void => {
    setTimedOut(false);
    void query.refetch();
  };

  if (query.isSuccess) return { status: 'success', data: query.data };
  if (query.isError) return { status: 'error', message: errorText(query.error), retry };
  if (timedOut) return { status: 'error', message: '加载超时，请重试', retry };
  return { status: 'loading' };
}
