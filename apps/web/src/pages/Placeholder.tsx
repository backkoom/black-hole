import { Empty, Tag } from 'antd';

interface PlaceholderProps {
  /** 页面标题 */
  title: string;
  /** 副标题 */
  subtitle?: string;
}

/**
 * Phase 1 占位页 —— 其余路由先指向「功能迭代中」。
 * 按 pages.md §4.8 / §8.4：空状态写「功能迭代中」并显示「迭代」角标。
 */
export function Placeholder({ title, subtitle }: PlaceholderProps) {
  return (
    <div className="wb-page">
      <h1 className="wb-page-title">{title}</h1>
      {subtitle ? <p className="wb-page-sub">{subtitle}</p> : null}
      <div className="wb-placeholder-body">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          styles={{ image: { height: 64 } }}
          description={
            <span>
              功能迭代中 <Tag>迭代</Tag>
            </span>
          }
        />
      </div>
    </div>
  );
}
