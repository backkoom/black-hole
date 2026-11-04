import { designVars } from '../../styles/theme';

/**
 * 柱状图 —— 手写 SVG（visual-baseline §1.4：**不引图表库**）。
 *
 * 为什么单独写一个：`components/ui/charts.tsx` 是**共享只读资产**，
 * 里面有 Sparkline / DonutChart / LineChart / ProgressRing，唯独没有柱状图。
 * 所以这里补一个**只给用户端用**的柱状图，不去改共享文件。
 *
 * 约定（与 charts.tsx 保持一致）：
 *  - viewBox 自适应，width="100%"
 *  - 颜色从 designVars 取，柱色可逐柱覆盖
 *  - 左侧 Y 轴刻度 + 横向网格线 + 底部 X 轴分类标签
 *  - 柱子上方标数值（数量）
 *
 * 用法：
 * ```tsx
 * <BarChart data={buckets.map((b) => ({ label: b.label, value: b.count }))} />
 * ```
 */

/** 一根柱子 */
export interface BarChartDatum {
  /** X 轴分类名（如「0-20%」） */
  label: string;
  /** 数值（如项目数） */
  value: number;
  /** 柱色，不传则用主色 */
  color?: string;
}

export interface BarChartProps {
  data: BarChartDatum[];
  /** 图表高度，默认 200 */
  height?: number;
  /** 柱子上方是否显示数值，默认显示 */
  showValues?: boolean;
  /** 数值格式化，默认直接显示数字 */
  formatValue?: (value: number) => string;
}

/** 数值 → 柱高（0 返回 0，max 返回整个绘图区高度） */
function barHeightOf(value: number, max: number, plotH: number): number {
  if (max <= 0) return 0;
  const t = Math.max(0, Math.min(1, value / max));
  return t * plotH;
}

export function BarChart({
  data,
  height = 200,
  showValues = true,
  formatValue,
}: BarChartProps): JSX.Element {
  const width = 560;
  const padLeft = 36;
  const padRight = 12;
  const padTop = 20;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  /** 绘图区底线 */
  const baseline = padTop + plotH;

  const values = data.map((d) => d.value);
  const rawMax = values.length > 0 ? Math.max(...values) : 0;
  // 取整到好看的刻度：4 档，最小步长 1
  const step = rawMax === 0 ? 1 : Math.max(1, Math.ceil(rawMax / 4));
  const max = step * 4;

  const count = data.length;
  const slot = count > 0 ? plotW / count : plotW;
  // 柱子宽度取槽位的 56%，最多 44px —— 免得柱子太胖
  const barWidth = Math.min(44, slot * 0.56);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="柱状图">
      {/* 横向网格线 + 左侧刻度值（0 在底线，越大越靠上） */}
      {Array.from({ length: 5 }, (_, i) => {
        const value = max - step * i;
        const y = baseline - barHeightOf(value, max, plotH);
        return (
          <g key={i}>
            <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#eef1f6" strokeWidth={1} />
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

      {/* 柱子 */}
      {data.map((d, i) => {
        const x = padLeft + slot * i + (slot - barWidth) / 2;
        const barHeight = barHeightOf(d.value, max, plotH);
        const y = baseline - barHeight;
        const color = d.color ?? designVars.primary;
        const label = formatValue ? formatValue(d.value) : String(d.value);
        return (
          <g key={`${d.label}-${i}`}>
            {barHeight > 0 ? (
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={3}
                fill={color}
                opacity={0.92}
              />
            ) : null}
            {showValues ? (
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="#5b6577"
              >
                {label}
              </text>
            ) : null}
            <text
              x={x + barWidth / 2}
              y={height - 8}
              textAnchor="middle"
              fontSize={11}
              fill="#98a1b3"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
