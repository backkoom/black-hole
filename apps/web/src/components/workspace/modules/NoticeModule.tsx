import { ModuleEmpty } from './ModuleShell';
import { readNoticeConfig } from './config';

/**
 * 公告通知模块 —— §7.5：读 config 的 title / body / level；`level === 'warning'` 用警示色。
 *
 * 正文按纯文本渲染（不解释 HTML）。
 */
export function NoticeModule({ config }: { config: Record<string, unknown> }) {
  const { title, body, level } = readNoticeConfig(config);
  if (!title && !body) return <ModuleEmpty text="暂无公告" />;

  return (
    <div className={`wb-notice${level === 'warning' ? ' is-warning' : ''}`}>
      {title ? <div className="wb-notice-title">{title}</div> : null}
      {body ? <div className="wb-notice-body">{body}</div> : null}
    </div>
  );
}
