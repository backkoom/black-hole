/**
 * 图表基元 —— 全部手写 SVG，**不引图表库**（visual-baseline §1.4）。
 *
 * 共同约定：
 *  - viewBox 自适应，width="100%"
 *  - 颜色从 designVars 取，不写死色值
 *  - 数值变化用 CSS transition，不做动画库
 */

export interface SeriesPoint {
  label: string;
  value: number;
}

export interface Series {
  name: string;
  color: string;
  points: SeriesPoint[];
}

/** 把数值映射到 SVG 坐标 */
function scale(value: number, min: number, max: number, range: number, reverse = false): number {
  if (max === min) return range / 2;
  const t = (value - min) / (max - min);
  return reverse ? range - t * range : t * range;
}

/** 折线路径（直线段，不做平滑曲线 —— 小数据量下更易读） */
function linePath(
  points: SeriesPoint[],
  min: number,
  max: number,
  width: number,
  height: number,
  padTop: number,
): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => {
      const x = scale(i, 0, Math.max(points.length - 1, 1), width);
      const y = padTop + scale(p.value, min, max, height - padTop, true);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** 折线下方填充区域 */
function areaPath(
  points: SeriesPoint[],
  min: number,
  max: number,
  width: number,
  height: number,
  padTop: number,
): string {
  if (points.length === 0) return '';
  const line = linePath(points, min, max, width, height, padTop);
  const lastX = scale(points.length - 1, 0, Math.max(points.length - 1, 1), width);
  const baseY = height;
  return `${line} L${lastX.toFixed(1)},${baseY} L0,${baseY} Z`;
}

export interface SparklineProps {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  /** 面积填充的浅色底（默认用 color 的 12% 透明度） */
  fill?: boolean;
}

/**
 * 迷你折线图 —— 指标卡右下角那种。
 * 无坐标轴、无刻度，只看趋势。
 */
export function Sparkline({
  values,
  color,
  width = 120,
  height = 36,
  fill = true,
}: SparklineProps): JSX.Element {
  if (values.length === 0) return <svg width={width} height={height} />;
  const points = values.map((value, index) => ({ label: String(index), value }));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 3;
  const h = height - pad * 2;
  const d = linePath(points, min, max, width, h, pad);
  const area = areaPath(points, min, max, width, h, pad);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {fill ? <path d={area} fill={color} opacity={0.12} /> : null}
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface DonutSegment {
  name: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  segments: DonutSegment[];
  /** 中心数字 */
  centerValue?: string | number;
  /** 中心副标 */
  centerLabel?: string;
  size?: number;
  thickness?: number;
}

/**
 * 环形图 —— 稿子里的「任务状态」「项目类型分布」那种。
 * 中心放总数，旁边由调用方配图例。
 */
export function DonutChart({
  segments,
  centerValue,
  centerLabel,
  size = 132,
  thickness = 18,
}: DonutChartProps): JSX.Element {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <g transform={`translate(${size / 2},${size / 2}) rotate(-90)`}>
          <circle r={radius} fill="none" stroke="#eef1f6" strokeWidth={thickness} />
          {total > 0
            ? segments.map((s) => {
                const len = (s.value / total) * circumference;
                const dash = `${len} ${circumference - len}`;
                const el = (
                  <circle
                    key={s.name}
                    r={radius}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={thickness}
                    strokeDasharray={dash}
                    strokeDashoffset={-offset}
                  />
                );
                offset += len;
                return el;
              })
            : null}
        </g>
      </svg>
      {centerValue !== undefined ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.1, color: '#1f2937' }}>
            {centerValue}
          </div>
          {centerLabel ? (
            <div style={{ fontSize: 12, color: '#98a1b3', marginTop: 2 }}>{centerLabel}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export interface LineChartProps {
  series: Series[];
  height?: number;
  /** Y 轴刻度数量 */
  ticks?: number;
  /** X 轴标签（默认取每点 label） */
  xLabels?: string[];
}

/**
 * 多系列折线图 —— 稿子里的「任务完成趋势」那种。
 * 左轴刻度 + 底部横轴 + 横向网格线。
 */
export function LineChart({
  series,
  height = 190,
  ticks = 4,
  xLabels,
}: LineChartProps): JSX.Element {
  const width = 560;
  const padLeft = 34;
  const padRight = 10;
  const padTop = 12;
  const padBottom = 22;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const allValues = series.flatMap((s) => s.points.map((p) => p.value));
  const rawMax = allValues.length > 0 ? Math.max(...allValues) : 0;
  // 取整到好看的刻度
  const step = rawMax === 0 ? 1 : Math.max(1, Math.ceil(rawMax / ticks));
  const max = step * ticks;
  const min = 0;

  const labels = xLabels ?? series[0]?.points.map((p) => p.label) ?? [];
  const labelEvery = Math.max(1, Math.ceil(labels.length / 8));

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img">
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const value = max - step * i;
        const y = padTop + scale(i, 0, ticks, plotH);
        return (
          <g key={i}>
            <line
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke="#eef1f6"
              strokeWidth={1}
            />
            <text
              x={padLeft - 6}
              y={y}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={11}
              fill="#98a1b3"
            >
              {value}
            </text>
          </g>
        );
      })}

      {labels.map((label, i) => {
        if (i % labelEvery !== 0 && i !== labels.length - 1) return null;
        const x = padLeft + scale(i, 0, Math.max(labels.length - 1, 1), plotW);
        return (
          <text
            key={i}
            x={x}
            y={height - 6}
            textAnchor="middle"
            fontSize={11}
            fill="#98a1b3"
          >
            {label}
          </text>
        );
      })}

      {series.map((s) => (
        <path
          key={s.name}
          d={linePath(s.points, min, max, plotW, plotH, padTop)}
          transform={`translate(${padLeft},0)`}
          fill="none"
          stroke={s.color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export interface ProgressRingProps {
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  trackColor?: string;
  label?: string;
}

/** 进度环 —— 稿子里的「项目健康度 62%」那种 */
export function ProgressRing({
  value,
  size = 128,
  thickness = 16,
  color = '#10b981',
  trackColor = '#eef1f6',
  label,
}: ProgressRingProps): JSX.Element {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const len = (clamped / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <g transform={`translate(${size / 2},${size / 2}) rotate(-90)`}>
          <circle r={radius} fill="none" stroke={trackColor} strokeWidth={thickness} />
          <circle
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${len} ${circumference - len}`}
          />
        </g>
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 600, color: '#1f2937', lineHeight: 1.1 }}>
          {clamped}%
        </div>
        {label ? <div style={{ fontSize: 12, color: '#98a1b3', marginTop: 2 }}>{label}</div> : null}
      </div>
    </div>
  );
}
