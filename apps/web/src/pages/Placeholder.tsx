import { Empty, Tag } from 'antd';
import { PageHeader } from '../components/PageHeader';

interface PlaceholderProps {
  /** 页面标题 */
  title: string;
  /** 副标题 */
  subtitle?: string;
}

/**
 * 占位页 —— 还没做的页面指向这里。
 * 按 pages.md §4.8 / §8.4：空状态写「功能迭代中」并显示「迭代」角标。
 *
 * 2026-11-06：原来这里还留了一套 `headerStyle='plain'`（20px 小标题），
 * 和用户端页头两套样式并存。现在全站只有 PageHeader 一种页头，这套分支删掉了。
 */
export function Placeholder({ title, subtitle }: PlaceholderProps) {
  return (
    <div className="wb-page">
      <PageHeader title={title} subtitle={subtitle ?? '该功能正在迭代，敬请期待。'} />
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
