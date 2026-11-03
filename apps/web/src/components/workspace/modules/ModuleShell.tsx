import type { ReactNode } from 'react';
import { Button, Empty, Skeleton } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useAsyncResource, type AsyncState } from '../../../hooks/useAsyncResource';

/**
 * 模块内容的三态外壳 —— 执行包 §7.5 / §8.8 的通用规则：
 *
 * - 数据模块首次加载显示**骨架屏**；
 * - **超过 3 秒转失败态**，失败显示「加载失败」+ 重试按钮；
 * - 接口失败（断网等）同样显示失败态，不白屏；
 * - 空数据显示该模块的 `emptyState` 文案。
 */

export { useAsyncResource, useAsyncResource as useModuleResource };
export type { AsyncState };

/** 加载中的骨架屏 */
export function ModuleLoading(): ReactNode {
  return (
    <div className="wb-module-loading">
      <Skeleton active title={false} paragraph={{ rows: 2 }} />
    </div>
  );
}

/** 失败态：标题固定「加载失败」，副文案为服务端原文，带重试按钮 */
export function ModuleFailure({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): ReactNode {
  return (
    <div className="wb-module-failure">
      <div className="wb-module-failure-title">加载失败</div>
      <div className="wb-module-failure-text">{message}</div>
      <Button size="small" icon={<ReloadOutlined />} onClick={onRetry}>
        重试
      </Button>
    </div>
  );
}

/** 空态：文案取模块定义的 emptyState */
export function ModuleEmpty({ text }: { text: string }): ReactNode {
  return (
    <div className="wb-module-empty-box">
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} styles={{ image: { height: 40 } }} description={text} />
    </div>
  );
}
