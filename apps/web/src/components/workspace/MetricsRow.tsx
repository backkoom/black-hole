/**
 * 指标卡行 —— pages.md §2「MetricsRow（一行 4 个）」。
 *
 * Phase 3 不接真实统计（/api/stats/overview 尚不存在），
 * 所以四张卡都用空状态占位「—」+ 口径说明文案：
 * - 不 mock 任何数字；
 * - 不请求不存在的接口。
 * Phase 6 接上真实统计后，只需要替换这里的取值。
 */

interface MetricCard {
  /** 卡片标题（契约里的口径名） */
  label: string;
  /** 该卡将要展示的口径说明 */
  note: string;
}

const METRIC_CARDS: MetricCard[] = [
  { label: '今日任务', note: '总数 / 已完成 待接入' },
  { label: '进行中', note: '总数 / 今日到期 待接入' },
  { label: '项目进度', note: '活跃项目数与列表 待接入' },
  { label: '本周完成率', note: '完成率待接入' },
];

export function MetricsRow() {
  return (
    <div className="wb-metrics">
      {METRIC_CARDS.map((card) => (
        <div className="wb-metric" key={card.label}>
          <div className="wb-metric-label">{card.label}</div>
          <div className="wb-metric-value">—</div>
          <div className="wb-metric-note">{card.note}</div>
        </div>
      ))}
    </div>
  );
}
