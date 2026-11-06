import type { ReactNode } from 'react';
import { Button } from 'antd';
import { ArrowLeftOutlined, CalendarOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { designVars } from '../styles/theme';
import { formatChineseDateWithWeekday, todayShanghaiDate } from '../utils/datetime';

/**
 * 全站统一页头 —— 用户端 10 页、管理页、设置内页全部走这一个组件。
 *
 * 2026-11-06 之前有两套：用户端用本组件（28px 大标题 + 日期 + 日历按钮），
 * 管理页（账号/组织/项目档案/项目详情/修改密码）还在用 `.wb-page-head`
 * （20px 小标题、无右侧元信息）→ 同一套系统里字号和留白差一档，切页会"跳"。
 * 现在统一成本组件：一份字号、一份上/下间距、一个右侧操作槽。
 *
 * 标题与副标题由各页面给；日期统一由本组件渲染，
 * 保证所有页面显示的是同一个「今天」（东八区）。
 */
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** 右侧自定义操作（渲染在日期左侧） */
  extra?: ReactNode;
  /** 二级页（项目详情等）：标题上方显示返回入口 */
  back?: { label: string; to: string };
  /** 标题右侧的行内小按钮（如自定义工作台的改名铅笔） */
  titleExtra?: ReactNode;
  /** 右上角日期与日历按钮，默认显示；纯表单页可关掉 */
  showMeta?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  extra,
  back,
  titleExtra,
  showMeta = true,
}: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className={`wb-user-head${back ? ' has-back' : ''}`}>
      <div className="wb-user-head-text">
        {back ? (
          <button
            type="button"
            className="wb-back-link"
            onClick={() => void navigate(back.to)}
          >
            <ArrowLeftOutlined />
            {back.label}
          </button>
        ) : null}
        <div className="wb-user-title-row">
          <h1 className="wb-user-title">{title}</h1>
          {titleExtra}
        </div>
        {subtitle ? <p className="wb-user-subtitle">{subtitle}</p> : null}
      </div>
      <div className="wb-user-head-actions">
        {extra}
        {showMeta ? (
          <>
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
          </>
        ) : null}
      </div>
    </header>
  );
}
