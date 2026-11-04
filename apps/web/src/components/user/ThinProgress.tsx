import { designVars } from '../../styles/theme';

/**
 * 细进度条 —— 设计稿里「项目进度」行与项目卡片上的那种条。
 *
 * 纯 div 实现（不引图表库）：8px 圆角的浅色槽 + 主色渐变填充。
 * 百分比用接口返回的 progress，服务端已四舍五入算好，前端不再自己算。
 */
interface ThinProgressProps {
  /** 0 - 100 */
  percent: number;
  /** 填充色，默认主色 */
  color?: string;
  /** 轨道高度，默认 6px */
  height?: number;
}

export function ThinProgress({ percent, color = designVars.primary, height = 6 }: ThinProgressProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      style={{
        width: '100%',
        height,
        borderRadius: height,
        background: '#eef1f6',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: '100%',
          borderRadius: height,
          background: `linear-gradient(90deg, ${color}, ${designVars.primary})`,
          transition: 'width .3s ease',
        }}
      />
    </div>
  );
}
