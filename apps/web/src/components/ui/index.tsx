import type { ReactNode } from 'react';
import { Avatar, Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { designVars } from '../../styles/theme.js';
import { Sparkline } from './charts.js';

/**
 * 用户端视觉基件 —— 照设计稿还原（2026-11-04）。
 *
 * 设计稿要点：
 *  - 卡片白底、圆角 12、极淡阴影
 *  - 指标卡：左上彩色圆角方块图标 + 大数字 + 右侧涨跌箭头 + 右下迷你折线图
 *  - 面板：标题 + 右上角「查看全部 ›」链接
 *  - 标签：浅底深字的小圆角标签
 *  - 头像组：圆形堆叠 + 「+N」灰底
 */

export type TagTone = 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'gray';

const TONE_STYLE: Record<TagTone, { bg: string; fg: string }> = {
  blue: { bg: '#eef3ff', fg: '#2563eb' },
  green: { bg: '#e9f9f1', fg: '#0f9d58' },
  orange: { bg: '#fff4e5', fg: '#d97706' },
  purple: { bg: '#f3ecff', fg: '#7c3aed' },
  red: { bg: '#feecec', fg: '#e04141' },
  gray: { bg: '#f1f3f7', fg: '#5b6577' },
};

const cardShadow = '0 1px 2px rgba(31, 41, 55, 0.04), 0 4px 16px rgba(31, 41, 55, 0.05)';

/**
 * 语义色 → 色调。
 *
 * 用途：指标卡图标默认走「淡底 + 鲜艳图标」（设计稿样式），
 * 页面只要传 designVars.primary / green / orange / purple / red 这类语义色，
 * 就能自动匹配到对应的淡色底，不必每个页面手写 iconTone。
 */
const ICON_TONE_BY_COLOR: Record<string, TagTone> = {
  [designVars.primary]: 'blue',
  [designVars.green]: 'green',
  [designVars.orange]: 'orange',
  [designVars.purple]: 'purple',
  [designVars.red]: 'red',
  [designVars.muted]: 'gray',
};

export interface MetricCardProps {
  label: string;
  value: string | number;
  /** 图标（ReactNode），显示在左上彩色方块里 */
  icon?: ReactNode;
  /** 图标底色，默认主色（不传 iconTone 时是纯色底 + 白图标） */
  iconColor?: string;
  /**
   * 淡底 + 彩色图标模式（设计稿的指标卡样式）。
   * 传了就用该色调的淡底 + 前景色图标，忽略 iconColor 的底色。
   */
  iconTone?: TagTone;
  /** 涨跌值，正数向上、负数向下；0 不显示 */
  delta?: number;
  /** 迷你折线数据 */
  trend?: number[];
  trendColor?: string;
  /** 副说明（指标卡底部一行小字） */
  hint?: string;
}

export function MetricCard({
  label,
  value,
  icon,
  iconColor = designVars.primary,
  iconTone,
  delta,
  trend,
  trendColor,
  hint,
}: MetricCardProps): JSX.Element {
  const hasDelta = delta !== undefined && delta !== 0;
  // 未显式指定色调时，按 iconColor 反查 —— 命中就自动用淡色底（设计稿样式）
  const autoTone = iconTone ?? ICON_TONE_BY_COLOR[iconColor];
  const toneStyle = autoTone ? TONE_STYLE[autoTone] : null;
  const up = hasDelta && (delta as number) > 0;

  return (
    <div
      style={{
        background: designVars.card,
        borderRadius: designVars.radius,
        boxShadow: cardShadow,
        padding: '16px 18px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 132,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon ? (
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: toneStyle ? toneStyle.bg : iconColor,
              color: toneStyle ? iconColor : '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 17,
              flex: '0 0 auto',
            }}
          >
            {icon}
          </span>
        ) : null}
        <span style={{ fontSize: 13, color: designVars.text2, flex: 1 }}>{label}</span>
        {hasDelta ? (
          <span
            style={{
              fontSize: 12,
              color: up ? designVars.green : designVars.red,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            {Math.abs(delta as number)}
          </span>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.1, color: designVars.text }}>
          {value}
        </div>
        {trend && trend.length > 0 ? (
          <Sparkline
            values={trend}
            color={trendColor ?? iconColor}
            width={104}
            height={34}
          />
        ) : null}
      </div>

      {hint ? (
        <div style={{ fontSize: 12, color: designVars.muted }}>{hint}</div>
      ) : null}
    </div>
  );
}

export interface PanelProps {
  title: string;
  /** 右上角「查看全部 ›」 */
  more?: string;
  onMore?: () => void;
  /** 右上角自定义操作 */
  extra?: ReactNode;
  children: ReactNode;
  /** 内容区是否去掉内边距（表格类用） */
  flush?: boolean;
  style?: React.CSSProperties;
}

export function Panel({
  title,
  more,
  onMore,
  extra,
  children,
  flush,
  style,
}: PanelProps): JSX.Element {
  return (
    <section
      style={{
        background: designVars.card,
        borderRadius: designVars.radius,
        boxShadow: cardShadow,
        overflow: 'hidden',
        ...style,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px 10px',
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: designVars.text }}>{title}</h3>
        {extra ??
          (more ? (
            <button
              type="button"
              onClick={onMore}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: 13,
                color: designVars.text2,
                cursor: onMore ? 'pointer' : 'default',
              }}
            >
              {more} ›
            </button>
          ) : null)}
      </header>
      <div style={flush ? undefined : { padding: '0 18px 16px' }}>{children}</div>
    </section>
  );
}

/** 彩色小标签 —— 状态/优先级/分类都用它 */
export function ToneTag({
  tone = 'gray',
  children,
  title,
}: {
  tone?: TagTone;
  children: ReactNode;
  title?: string;
}): JSX.Element {
  const s = TONE_STYLE[tone];
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        padding: '0 7px',
        borderRadius: 5,
        background: s.bg,
        color: s.fg,
        fontSize: 12,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/** 状态 → 色调映射（任务状态、优先级通用） */
/**
 * 状态 → 色调映射（2026-11-04 对齐设计稿）。
 *
 * 设计稿约定：待开始=灰 / 进行中=绿 / 待审核=橙 / 已完成=紫 / 逾期=红。
 * 注意「已完成用紫」而不是绿 —— 绿在设计稿里代表「进行中」，
 * 两者语义相反，不能混。
 */
export const STATUS_TONE: Record<string, TagTone> = {
  todo: 'gray',
  doing: 'green',
  done: 'purple',
  pending: 'gray',
  review: 'orange',
  handling: 'orange',
  resolved: 'purple',
  active: 'blue',
  high: 'red',
  medium: 'orange',
  low: 'gray',
  overdue: 'red',
};

export interface AvatarGroupProps {
  /** 头像列表：可以是姓名（取首字）或 {name, avatarUrl} */
  people: Array<string | { name: string; avatarUrl?: string }>;
  max?: number;
  size?: number;
}

export function AvatarGroup({ people, max = 4, size = 26 }: AvatarGroupProps): JSX.Element {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((p, i) => {
        const name = typeof p === 'string' ? p : p.name;
        const url = typeof p === 'string' ? undefined : p.avatarUrl;
        return (
          <Tooltip key={`${name}-${i}`} title={name}>
            <Avatar
              size={size}
              src={url}
              style={{
                background: '#dbe4f5',
                color: designVars.primary,
                fontSize: size * 0.42,
                marginLeft: i === 0 ? 0 : -size * 0.3,
                border: '2px solid #fff',
              }}
            >
              {name.slice(0, 1)}
            </Avatar>
          </Tooltip>
        );
      })}
      {rest > 0 ? (
        <span
          style={{
            marginLeft: -size * 0.3,
            width: size,
            height: size,
            borderRadius: '50%',
            background: '#eef1f6',
            color: designVars.text2,
            fontSize: size * 0.4,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #fff',
          }}
        >
          +{rest}
        </span>
      ) : null}
    </div>
  );
}

/** 图例项 —— 环形图/折线图旁边那种（色点 + 名称 + 数值） */
export function LegendItem({
  color,
  name,
  value,
  suffix,
}: {
  color: string;
  name: string;
  value?: string | number;
  suffix?: string;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, lineHeight: 1.9 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          flex: '0 0 auto',
        }}
      />
      <span style={{ color: designVars.text2 }}>{name}</span>
      {value !== undefined ? (
        <span style={{ color: designVars.text, fontWeight: 500 }}>{value}</span>
      ) : null}
      {suffix ? <span style={{ color: designVars.muted, fontSize: 12 }}>{suffix}</span> : null}
    </div>
  );
}
