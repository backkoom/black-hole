import { Empty, Tag } from 'antd';
import { PageHeader } from '../components/PageHeader';

interface PlaceholderProps {
  /** 页面标题 */
  title: string;
  /** 副标题 */
  subtitle?: string;
  /**
   * 页头样式：
   * - 'user'：用户端大标题 + 日期/日历按钮（用户端 10 个页面用这个）
   * - 'plain'：管理员端的小标题（设置页里的占位页用这个）
   */
  headerStyle?: 'user' | 'plain';
}

/**
 * 占位页 —— 还没做的页面指向这里。
 * 按 pages.md §4.8 / §8.4：空状态写「功能迭代中」并显示「迭代」角标。
 */
export function Placeholder({ title, subtitle, headerStyle = 'plain' }: PlaceholderProps) {
  const header =
    headerStyle === 'user' ? (
      <PageHeader title={title} subtitle={subtitle ?? '该功能正在迭代，敬请期待。'} />
    ) : (
      <>
        <h1 className="wb-page-title">{title}</h1>
        {subtitle ? <p className="wb-page-sub">{subtitle}</p> : null}
      </>
    );

  return (
    <div className="wb-page">
      {header}
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
