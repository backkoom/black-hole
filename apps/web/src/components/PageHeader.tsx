import type { ReactNode } from 'react';
import { Button } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { designVars } from '../styles/theme';
import { formatChineseDateWithWeekday, todayShanghaiDate } from '../utils/datetime';

/**
 * 用户端页头（老六最终界面）：
 * 左侧大标题（28px 粗体）+ 副标题（13px 灰，一句话说明），
 * 右侧是当天日期（Asia/Shanghai）+ 日历图标按钮（跳日程安排页）。
 *
 * 标题与副标题由各页面自己给；日期统一由本页头渲染，
 * 保证所有页面显示的是同一个「今天」（东八区）。
 */
interface PageHeaderProps {
  title: string;
  subtitle: string;
  /** 右侧自定义操作（放在日历按钮左侧） */
  extra?: ReactNode;
}

export function PageHeader({ title, subtitle, extra }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="wb-user-head">
      <div className="wb-user-head-text">
        <h1 className="wb-user-title">{title}</h1>
        <p className="wb-user-subtitle">{subtitle}</p>
      </div>
      <div className="wb-user-head-actions">
        {extra}
        <span className="wb-user-date">{formatChineseDateWithWeekday(todayShanghaiDate())}</span>
        <Button
          type="text"
          className="wb-user-calendar"
          icon={<CalendarOutlined />}
          aria-label="打开日程安排"
          title="打开日程安排"
          style={{ color: designVars.text2 }}
          onClick={() => void navigate('/calendar')}
        />
      </div>
    </header>
  );
}
