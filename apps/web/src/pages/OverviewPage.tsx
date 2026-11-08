import { useMemo, useRef } from 'react';
import { Button, Tag } from 'antd';
import { CalendarOutlined, ScheduleOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Risk } from '@blackhole/shared/types';
import { listTasks } from '../api/tasks';
import { listRisks } from '../api/risks';
import { useUserProjects } from '../hooks/useUserData';
import { useTaskCounts } from '../hooks/useTaskCounts';
import { designVars } from '../styles/theme';
import { MetricCard, Panel } from '../components/ui';
import { DonutChart } from '../components/ui/charts';
import { PageHeader } from '../components/PageHeader';
import { StateBlock } from '../components/user/StateBlock';
import { TodayTasks, TodayAgenda } from '../components/workbench/TodayPanel';
import { StickyNotes, type StickyNotesHandle } from '../components/workbench/StickyNotes';
import { WorkbenchCharts } from '../components/workbench/WorkbenchCharts';
import { RecentFiles } from '../components/workbench/RecentFiles';

/**
 * 工作台（D-32 按老六的规划图重排）。
 *
 * 版式就是老六给的那五行，从上到下：
 *   工作台（标题）
 *   数据看板                                   ← 提到最上面
 *   本周  本月  本季  本年                      ← 四张时间卡（去掉「今日」，今日是独立模块）
 *   今天   任务状态   风险预警
 *   日程   随记      文件资料
 *
 * 三处关键改动：
 * - **添加框并进「今天」**：原来顶部那条大输入框和随记的输入框长得一样、功能都在"记一句话"，
 *   现在收进「今天」做成行内添加（点「加一条」就地出现输入行），随记只管便签；
 * - **任务状态紧凑化**：小环 + 2×2 数字格，不再是一大片空白；
 * - **新增文件资料模块**：最近 6 个文件，点进文件页。
 */
export function OverviewPage() {
  const navigate = useNavigate();
  const stickyRef = useRef<StickyNotesHandle | null>(null);

  const projectsQuery = useUserProjects();
  const { counts: taskCounts, query: taskCountsQuery } = useTaskCounts();
  const projects = projectsQuery.data?.items ?? [];

  /** 四个时间区间 + 逾期（今日不进卡，它是独立模块） */
  const rangeQuery = useQuery({
    queryKey: ['workbench', 'ranges'],
    queryFn: async () => {
      const dues = ['week', 'month', 'quarter', 'year', 'today', 'overdue'] as const;
      const results = await Promise.all(dues.map((due) => listTasks({ page: 1, pageSize: 1, due })));
      return {
        week: results[0]?.total ?? 0,
        month: results[1]?.total ?? 0,
        quarter: results[2]?.total ?? 0,
        year: results[3]?.total ?? 0,
        today: results[4]?.total ?? 0,
        overdue: results[5]?.total ?? 0,
      };
    },
    staleTime: 30_000,
  });
  const ranges = rangeQuery.data ?? { week: 0, month: 0, quarter: 0, year: 0, today: 0, overdue: 0 };

  /** 风险预警：未关闭，按等级排 */
  const risksQuery = useQuery({
    queryKey: ['workbench', 'risks'],
    queryFn: () => listRisks({ status: 'open' }),
    staleTime: 60_000,
  });
  const risks = useMemo(() => {
    const list = risksQuery.data ?? [];
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...list].sort((a, b) => (order[a.level] ?? 9) - (order[b.level] ?? 9));
  }, [risksQuery.data]);
  const highRisks = risks.filter((risk) => risk.level === 'high').length;

  /** 任务状态的紧凑格子：待处理 / 进行中 / 已完成 / 逾期 */
  const statusCells = [
    { label: '待处理', value: taskCounts.todo, color: designVars.orange },
    { label: '进行中', value: taskCounts.doing, color: designVars.statusDoing },
    { label: '已完成', value: taskCounts.done, color: designVars.statusDone },
    { label: '已逾期', value: ranges.overdue, color: designVars.red },
  ];

  return (
    <div className="wb-page">
      <PageHeader title="工作台" subtitle="一屏看清今天、这周和手头的项目。" />

      {/* ① 数据看板 */}
      <div className="wb-dashboard-heading">数据看板</div>
      <WorkbenchCharts />

      {/* ② 四张时间卡 */}
      <div className="wb-metric-row wb-metric-row-4">
        <MetricCard
          label="本周"
          value={ranges.week}
          icon={<ScheduleOutlined />}
          iconColor={designVars.statusDoing}
          hint="本周到期"
          onClick={() => void navigate('/projects?view=tasks&due=week')}
        />
        <MetricCard
          label="本月"
          value={ranges.month}
          icon={<CalendarOutlined />}
          iconColor={designVars.purple}
          hint="本月到期"
          onClick={() => void navigate('/projects?view=tasks&due=month')}
        />
        <MetricCard
          label="本季"
          value={ranges.quarter}
          icon={<CalendarOutlined />}
          iconColor={designVars.muted}
          hint="本季到期"
          onClick={() => void navigate('/projects?view=tasks&due=quarter')}
        />
        <MetricCard
          label="本年"
          value={ranges.year}
          icon={<CalendarOutlined />}
          iconColor={designVars.primary}
          hint="本年到期"
          onClick={() => void navigate('/projects?view=tasks&due=year')}
        />
      </div>

      {/* ③ 今天 / 任务状态 / 风险预警 */}
      <div className="wb-hb-grid">
        <div className="wb-hb-4">
          <Panel
            title="今天"
            more="全部任务"
            onMore={() => void navigate('/projects?view=tasks&due=today')}
            flush
          >
            <div style={{ padding: '0 18px 12px' }}>
              <TodayTasks projects={projects} />
            </div>
          </Panel>
        </div>

        <div className="wb-hb-4">
          <Panel title="任务状态" flush>
            <StateBlock
              loading={taskCountsQuery.isPending}
              error={taskCountsQuery.isError ? taskCountsQuery.error : undefined}
              onRetry={() => void taskCountsQuery.refetch()}
              isEmpty={taskCounts.total === 0}
              emptyText="还没有任务"
            >
            <div className="wb-status-compact">
              <DonutChart
                segments={[
                  { name: '待处理', value: taskCounts.todo, color: designVars.orange },
                  { name: '进行中', value: taskCounts.doing, color: designVars.statusDoing },
                  { name: '已完成', value: taskCounts.done, color: designVars.statusDone },
                ]}
                centerValue={taskCounts.total}
                centerLabel="任务"
                size={84}
                thickness={11}
              />
              <div className="wb-status-cells">
                {statusCells.map((cell) => (
                  <button
                    key={cell.label}
                    type="button"
                    className="wb-status-cell"
                    onClick={() =>
                      void navigate(
                        cell.label === '已逾期'
                          ? '/projects?view=tasks&due=overdue'
                          : `/projects?view=tasks${cell.label === '待处理' ? '&status=todo' : cell.label === '进行中' ? '&status=doing' : '&status=done'}`,
                      )
                    }
                  >
                    <span className="wb-status-cell-value" style={{ color: cell.color }}>
                      {cell.value}
                    </span>
                    <span className="wb-status-cell-label">{cell.label}</span>
                  </button>
                ))}
              </div>
            </div>
            </StateBlock>
          </Panel>
        </div>

        <div className="wb-hb-4">
          <Panel title="风险预警" more="全部风险" onMore={() => void navigate('/projects?view=risks')} flush>
            <div style={{ padding: '0 18px 12px' }}>
              <StateBlock
                loading={risksQuery.isPending}
                error={risksQuery.isError ? risksQuery.error : undefined}
                onRetry={() => void risksQuery.refetch()}
                isEmpty={risks.length === 0}
                emptyText="没有未关闭的风险"
                emptyHint="保持住"
              >
                <ul className="wb-risk-list">
                  {risks.slice(0, 4).map((risk: Risk) => (
                    <li key={risk.id} className="wb-risk-item">
                      <Tag
                        color={risk.level === 'high' ? 'red' : risk.level === 'medium' ? 'orange' : 'default'}
                        className="wb-risk-tag"
                      >
                        {risk.level === 'high' ? '高' : risk.level === 'medium' ? '中' : '低'}
                      </Tag>
                      <span className="wb-risk-title" title={risk.title}>
                        {risk.title}
                      </span>
                      <span className="wb-risk-meta">{risk.projectName ?? '—'}</span>
                    </li>
                  ))}
                </ul>
                {highRisks > 0 ? (
                  <div className="wb-risk-foot">
                    <WarningOutlined /> 其中 {highRisks} 条高风险
                  </div>
                ) : null}
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* ④ 日程 / 随记 / 文件资料 */}
        <div className="wb-hb-4">
          <Panel title="日程" more="去日历" onMore={() => void navigate('/calendar')} flush>
            <div style={{ padding: '0 18px 12px' }}>
              <TodayAgenda />
            </div>
          </Panel>
        </div>

        <div className="wb-hb-4">
          <Panel title="随记" more="全部随记" onMore={() => void navigate('/workspace')} flush>
            <div style={{ padding: '0 18px 12px' }}>
              <StickyNotes ref={stickyRef} limit={2} />
            </div>
          </Panel>
        </div>

        <div className="wb-hb-4">
          <Panel title="文件资料" more="全部文件" onMore={() => void navigate('/files')} flush>
            <div style={{ padding: '0 18px 12px' }}>
              <RecentFiles />
            </div>
          </Panel>
        </div>
      </div>

      <div className="wb-page-foot">
        <Button type="link" size="small" onClick={() => stickyRef.current?.focus()}>
          ＋ 写一张便签
        </Button>
      </div>
    </div>
  );
}
