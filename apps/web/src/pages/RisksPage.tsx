import { useMemo, useState } from 'react';
import { App as AntdApp, Avatar, Button, Dropdown, Select, Table, Tooltip } from 'antd';
import type { TableColumnsType } from 'antd';
import {
  BugOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  MoreOutlined,
  PlusOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Risk, RiskLevel, RiskStatus } from '@blackhole/shared/types';
import type { RiskKind } from '../api/risks';
import {
  deleteRisk,
  fetchRiskStats,
  listRisks,
  riskKeys,
  updateRiskStatus,
} from '../api/risks';
import { errorText } from '../api/messages';
import { useAssigneeOptions, useUserProjects } from '../hooks/useUserData';
import { useAuth } from '../auth/AuthContext';
import { formatDateOnly } from '../utils/datetime';
import { designVars } from '../styles/theme';
import { LegendItem, MetricCard, Panel, STATUS_TONE, ToneTag } from '../components/ui';
import type { TagTone } from '../components/ui';
import { DonutChart } from '../components/ui/charts';
import { PageHeader } from '../components/PageHeader';
import { StateBlock } from '../components/user/StateBlock';
import { RiskFormModal } from '../components/risks/RiskFormModal';
import '../styles/risks.css';

/**
 * 风险问题管理页（老六最终用户端界面 · 稿子图8）。
 *
 * 组件树：
 * RisksPage
 * ├─ PageHeader（「风险问题管理」+ 副标题）
 * ├─ .wb-metric-row（4 张指标卡：高风险 / 中风险 / 低风险 / 待处理）
 * ├─ .wb-risk-grid（12 列栅格）
 * │  ├─ .wb-risk-8：Panel「风险分布矩阵」（3×3 影响×概率）
 * │  ├─ .wb-risk-4：Panel「风险状态统计」（环形图 + 图例）
 * │  ├─ .wb-risk-4：Panel「问题处理状态」（环形图）
 * │  ├─ .wb-risk-8：Panel「待处理的关键问题」（open 的前 5 条）
 * │  ├─ .wb-risk-12：Panel「风险问题列表」（类型/状态/等级筛选 + 表格）
 * │  └─ .wb-risk-12：Panel「风险应对计划」（表格）
 *
 * 数据口径（全部来自真实接口，没有 mock）：
 * - 指标卡 / 环形图 / 矩阵：GET /api/risks/summary（等级 / 状态 / 类型 / 影响×概率矩阵）；
 * - 列表：GET /api/risks?kind=&level=&status=（服务端筛选，与下拉一一对应）；
 * - 关键问题与应对计划：GET /api/risks 全量后在本地取子集（口径与列表一致）。
 *
 * ⚠️ 「计划完成时间」列取的是风险的 dueDate —— 接口没有独立的计划完成时间字段，
 *    表格表头用 Tooltip 注明，不另造一个字段。
 */

/** 风险等级 → 中文 */
const LEVEL_LABEL: Record<RiskLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

/** 处理状态 → 中文 */
const STATUS_LABEL: Record<RiskStatus, string> = {
  open: '待处理',
  handling: '处理中',
  resolved: '已解决',
};

/** 处理状态 → 色调（风险域专用；等级标签复用现成的 STATUS_TONE） */
const RISK_STATUS_TONE: Record<RiskStatus, TagTone> = {
  open: 'orange',
  handling: 'blue',
  resolved: 'green',
};

/** 类型 → 中文 */
const KIND_LABEL: Record<RiskKind, string> = {
  risk: '风险',
  issue: '问题',
};

/** 矩阵的三档取值（由高到低） */
const MATRIX_LEVELS: RiskLevel[] = ['high', 'medium', 'low'];

/** 影响度 / 概率 → 权重（用于「影响×概率」着色） */
const MATRIX_WEIGHT: Record<RiskLevel, number> = { high: 3, medium: 2, low: 1 };

/** 矩阵格的着色档位 */
type MatrixTier = 'critical' | 'high' | 'medium' | 'low';

/** 按「影响×概率」打分 → 着色档位（红 → 橙 → 黄 → 绿） */
function matrixTier(impact: RiskLevel, probability: RiskLevel): MatrixTier {
  const score = MATRIX_WEIGHT[impact] * MATRIX_WEIGHT[probability];
  if (score >= 6) return 'critical';
  if (score === 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

/** 着色档位 → 展示名 */
const MATRIX_TIER_LABEL: Record<MatrixTier, string> = {
  critical: '高危',
  high: '较高',
  medium: '中等',
  low: '低',
};

interface MatrixFilters {
  kind?: RiskKind;
  status?: RiskStatus;
  level?: RiskLevel;
}

export function RisksPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [filters, setFilters] = useState<MatrixFilters>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Risk | null>(null);

  const projectsQuery = useUserProjects();
  const ownersQuery = useAssigneeOptions(user);

  /** 汇总统计（矩阵 / 环形图 / 指标卡共用） */
  const summaryQuery = useQuery({
    queryKey: riskKeys.summary,
    queryFn: fetchRiskStats,
    staleTime: 30_000,
  });

  /** 风险问题列表（服务端筛选） */
  const listQuery = useQuery({
    queryKey: riskKeys.list(filters),
    queryFn: () => listRisks(filters),
    staleTime: 30_000,
  });

  /** 全量列表（关键问题 / 应对计划面板用，不受表格筛选影响） */
  const everyQuery = useQuery({
    queryKey: riskKeys.every,
    queryFn: () => listRisks(),
    staleTime: 30_000,
  });

  const summary = summaryQuery.data;
  const rows = listQuery.data ?? [];
  const all = everyQuery.data ?? [];

  /** 待处理的关键问题：状态为 open，按截止日期近的排前，取前 5 条 */
  const keyIssues = useMemo(() => {
    return [...all]
      .filter((risk) => risk.status === 'open')
      .sort((a, b) => {
        if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      })
      .slice(0, 5);
  }, [all]);

  /** 风险应对计划：填了应对措施的条目，按截止日期排 */
  const responsePlans = useMemo(() => {
    return all
      .filter((risk) => (risk.responsePlan ?? '').trim().length > 0)
      .sort((a, b) => {
        if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
  }, [all]);

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: riskKeys.all });
  };

  const statusMutation = useMutation({
    mutationFn: (input: { id: number; status: RiskStatus }) =>
      updateRiskStatus(input.id, input.status),
    onSuccess: async () => {
      await invalidate();
      void message.success('状态已更新');
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRisk(id),
    onSuccess: async () => {
      await invalidate();
      void message.success('已删除');
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  /** 矩阵数据：summary.matrix 的键是 "{impact}:{probability}" */
  const matrix = summary?.matrix ?? {};

  /** 风险状态统计的百分比（接口只给了 byLevel 的百分比，状态按总数现算） */
  const statusTotal = useMemo(() => {
    if (!summary) return 0;
    return summary.byStatus.open + summary.byStatus.handling + summary.byStatus.resolved;
  }, [summary]);

  const columns = useMemo<TableColumnsType<Risk>>(
    () => [
      {
        title: '编号',
        dataIndex: 'code',
        width: 92,
        render: (value: string | null) =>
          value ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span> : <span className="wb-muted">—</span>,
      },
      {
        title: '类型',
        dataIndex: 'kind',
        width: 80,
        render: (value: RiskKind) => (
          <ToneTag tone={value === 'risk' ? 'orange' : 'blue'}>{KIND_LABEL[value]}</ToneTag>
        ),
      },
      {
        title: '标题',
        dataIndex: 'title',
        ellipsis: true,
        render: (value: string, row: Risk) => (
          <span title={value}>
            {value}
            {row.projectName ? (
              <span className="wb-muted" style={{ marginLeft: 6, fontSize: 12 }}>
                {row.projectName}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        title: '风险等级',
        dataIndex: 'level',
        width: 88,
        render: (value: RiskLevel) => (
          <ToneTag tone={STATUS_TONE[value] ?? 'gray'}>{LEVEL_LABEL[value]}</ToneTag>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 88,
        render: (value: RiskStatus) => (
          <ToneTag tone={RISK_STATUS_TONE[value]}>{STATUS_LABEL[value]}</ToneTag>
        ),
      },
      {
        title: '负责人',
        dataIndex: 'ownerName',
        width: 140,
        render: (value: string | null) =>
          value ? (
            <span className="wb-owner-cell">
              <Avatar size={24} style={{ background: '#dbe4f5', color: '#2563eb', fontSize: 11 }}>
                {value.slice(0, 1)}
              </Avatar>
              <span className="wb-owner-name">{value}</span>
            </span>
          ) : (
            <span className="wb-muted">未指派</span>
          ),
      },
      {
        title: '截止日期',
        dataIndex: 'dueDate',
        width: 106,
        render: (value: string | null) => <span>{formatDateOnly(value)}</span>,
      },
      {
        title: '操作',
        key: 'actions',
        width: 56,
        render: (_value: unknown, row: Risk) => (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'edit', icon: <EditOutlined />, label: '编辑' },
                { type: 'divider' },
                { key: 'status:open', label: '标记为待处理' },
                { key: 'status:handling', label: '标记为处理中' },
                { key: 'status:resolved', label: '标记为已解决' },
                { type: 'divider' },
                {
                  key: 'delete',
                  icon: <DeleteOutlined />,
                  label: '删除',
                  danger: true,
                },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'edit') {
                  setEditing(row);
                  setFormOpen(true);
                  return;
                }
                if (key.startsWith('status:')) {
                  const next = key.slice('status:'.length) as RiskStatus;
                  if (next !== row.status) statusMutation.mutate({ id: row.id, status: next });
                  return;
                }
                if (key === 'delete') deleteMutation.mutate(row.id);
              },
            }}
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              aria-label={`${row.title} 的更多操作`}
            />
          </Dropdown>
        ),
      },
    ],
    [statusMutation, deleteMutation],
  );

  const planColumns = useMemo<TableColumnsType<Risk>>(
    () => [
      {
        title: '风险/问题',
        dataIndex: 'title',
        ellipsis: true,
        render: (value: string, row: Risk) => (
          <span>
            <ToneTag tone={row.kind === 'risk' ? 'orange' : 'blue'}>
              {KIND_LABEL[row.kind]}
            </ToneTag>
            <span style={{ marginLeft: 8 }} title={value}>
              {value}
            </span>
          </span>
        ),
      },
      {
        title: '应对措施',
        dataIndex: 'responsePlan',
        ellipsis: true,
        render: (value: string | null) =>
          value ? <span title={value}>{value}</span> : <span className="wb-muted">—</span>,
      },
      {
        title: '负责人',
        dataIndex: 'ownerName',
        width: 140,
        render: (value: string | null) =>
          value ? (
            <span className="wb-owner-cell">
              <Avatar size={24} style={{ background: '#dbe4f5', color: '#2563eb', fontSize: 11 }}>
                {value.slice(0, 1)}
              </Avatar>
              <span className="wb-owner-name">{value}</span>
            </span>
          ) : (
            <span className="wb-muted">未指派</span>
          ),
      },
      {
        title: (
          <Tooltip title="取自风险/问题的截止日期（接口没有独立的计划完成时间字段）">
            <span>计划完成时间</span>
          </Tooltip>
        ),
        dataIndex: 'dueDate',
        width: 128,
        render: (value: string | null) => <span>{formatDateOnly(value)}</span>,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 88,
        render: (value: RiskStatus) => (
          <ToneTag tone={RISK_STATUS_TONE[value]}>{STATUS_LABEL[value]}</ToneTag>
        ),
      },
    ],
    [],
  );

  const metricCards = [
    {
      label: '高风险数',
      value: summary?.byLevel.high.count ?? 0,
      icon: <WarningOutlined />,
      color: designVars.red,
      hint: summary ? `占全部 ${summary.byLevel.high.percent}%` : '按风险等级统计',
    },
    {
      label: '中风险数',
      value: summary?.byLevel.medium.count ?? 0,
      icon: <ExclamationCircleOutlined />,
      color: designVars.orange,
      hint: summary ? `占全部 ${summary.byLevel.medium.percent}%` : '按风险等级统计',
    },
    {
      label: '低风险数',
      value: summary?.byLevel.low.count ?? 0,
      icon: <CheckCircleOutlined />,
      color: designVars.green,
      hint: summary ? `占全部 ${summary.byLevel.low.percent}%` : '按风险等级统计',
    },
    {
      label: '待解决问题数',
      value: summary?.byStatus.open ?? 0,
      icon: <BugOutlined />,
      color: designVars.purple,
      hint: '状态为待处理的风险与问题',
    },
  ];

  return (
    <div className="wb-page">
      <PageHeader
        title="问题风险"
        subtitle="识别项目风险，跟踪问题处理，保障项目顺利推进"
      />

      {/* 4 张指标卡 */}
      <div className="wb-metric-row">
        {metricCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            iconColor={card.color}
            hint={card.hint}
          />
        ))}
      </div>

      <div className="wb-risk-grid">
        {/* 风险分布矩阵 */}
        <div className="wb-risk-8">
          <Panel title="风险分布矩阵" flush>
            <div style={{ padding: '4px 18px 16px' }}>
              <StateBlock
                loading={summaryQuery.isPending}
                error={summaryQuery.isError ? summaryQuery.error : undefined}
                onRetry={() => void summaryQuery.refetch()}
                isEmpty={(summary?.total ?? 0) === 0}
                emptyText="还没有风险与问题数据"
              >
                <div className="wb-risk-matrix">
                  <div className="wb-risk-axis-corner">
                    <span>影响度</span>
                    <span>概率</span>
                  </div>
                  {MATRIX_LEVELS.map((probability) => (
                    <div className="wb-risk-axis-x" key={`axis-${probability}`}>
                      {LEVEL_LABEL[probability]}
                    </div>
                  ))}
                  {MATRIX_LEVELS.map((impact) => (
                    <div className="wb-risk-matrix-row" key={`row-${impact}`}>
                      <div className="wb-risk-axis-y">{LEVEL_LABEL[impact]}</div>
                      {MATRIX_LEVELS.map((probability) => {
                        const count = matrix[`${impact}:${probability}`] ?? 0;
                        const tier = matrixTier(impact, probability);
                        return (
                          <div
                            className={`wb-risk-cell is-${tier}${count === 0 ? ' is-empty' : ''}`}
                            key={`${impact}-${probability}`}
                          >
                            <span className="wb-risk-cell-num">{count}</span>
                            <span className="wb-risk-cell-tag">{MATRIX_TIER_LABEL[tier]}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="wb-risk-matrix-foot">
                  纵轴为影响度、横轴为发生概率，格子按「影响×概率」着色（红 → 橙 → 黄 → 绿）；
                  数字为落在该格的风险与问题数量。
                </div>
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 风险状态统计 */}
        <div className="wb-risk-4">
          <Panel title="风险状态统计" flush>
            <div style={{ padding: '4px 18px 16px' }}>
              <StateBlock
                loading={summaryQuery.isPending}
                error={summaryQuery.isError ? summaryQuery.error : undefined}
                onRetry={() => void summaryQuery.refetch()}
                isEmpty={(summary?.total ?? 0) === 0}
                emptyText="还没有风险与问题数据"
              >
                <div className="wb-status-chart">
                  <DonutChart
                    segments={[
                      {
                        name: '高风险',
                        value: summary?.byLevel.high.count ?? 0,
                        color: designVars.red,
                      },
                      {
                        name: '中风险',
                        value: summary?.byLevel.medium.count ?? 0,
                        color: designVars.orange,
                      },
                      {
                        name: '低风险',
                        value: summary?.byLevel.low.count ?? 0,
                        color: designVars.green,
                      },
                    ]}
                    centerValue={summary?.total ?? 0}
                    centerLabel="总风险"
                    size={126}
                    thickness={16}
                  />
                  <div className="wb-status-legend">
                    <LegendItem
                      color={designVars.red}
                      name="高风险"
                      value={summary?.byLevel.high.count ?? 0}
                      suffix={`${summary?.byLevel.high.percent ?? 0}%`}
                    />
                    <LegendItem
                      color={designVars.orange}
                      name="中风险"
                      value={summary?.byLevel.medium.count ?? 0}
                      suffix={`${summary?.byLevel.medium.percent ?? 0}%`}
                    />
                    <LegendItem
                      color={designVars.green}
                      name="低风险"
                      value={summary?.byLevel.low.count ?? 0}
                      suffix={`${summary?.byLevel.low.percent ?? 0}%`}
                    />
                  </div>
                </div>
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 问题处理状态 */}
        <div className="wb-risk-4">
          <Panel title="问题处理状态" flush>
            <div style={{ padding: '4px 18px 16px' }}>
              <StateBlock
                loading={summaryQuery.isPending}
                error={summaryQuery.isError ? summaryQuery.error : undefined}
                onRetry={() => void summaryQuery.refetch()}
                isEmpty={statusTotal === 0}
                emptyText="还没有风险与问题数据"
              >
                <div className="wb-status-chart">
                  <DonutChart
                    segments={[
                      {
                        name: '待处理',
                        value: summary?.byStatus.open ?? 0,
                        color: designVars.orange,
                      },
                      {
                        name: '处理中',
                        value: summary?.byStatus.handling ?? 0,
                        color: designVars.primary,
                      },
                      {
                        name: '已解决',
                        value: summary?.byStatus.resolved ?? 0,
                        color: designVars.green,
                      },
                    ]}
                    centerValue={statusTotal}
                    centerLabel="总问题"
                    size={126}
                    thickness={16}
                  />
                  <div className="wb-status-legend">
                    <LegendItem
                      color={designVars.orange}
                      name="待处理"
                      value={summary?.byStatus.open ?? 0}
                      suffix={`${statusTotal === 0 ? 0 : Math.round(((summary?.byStatus.open ?? 0) / statusTotal) * 100)}%`}
                    />
                    <LegendItem
                      color={designVars.primary}
                      name="处理中"
                      value={summary?.byStatus.handling ?? 0}
                      suffix={`${statusTotal === 0 ? 0 : Math.round(((summary?.byStatus.handling ?? 0) / statusTotal) * 100)}%`}
                    />
                    <LegendItem
                      color={designVars.green}
                      name="已解决"
                      value={summary?.byStatus.resolved ?? 0}
                      suffix={`${statusTotal === 0 ? 0 : Math.round(((summary?.byStatus.resolved ?? 0) / statusTotal) * 100)}%`}
                    />
                  </div>
                </div>
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 待处理的关键问题 */}
        <div className="wb-risk-8">
          <Panel
            title="待处理的关键问题"
            more="更多"
            onMore={() => {
              // 「更多」= 把列表筛选到待处理，让用户在下面的表格里看全量
              setFilters((prev) => ({ ...prev, status: 'open' }));
              document
                .getElementById('wb-risk-list')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            flush
          >
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={everyQuery.isPending}
                error={everyQuery.isError ? everyQuery.error : undefined}
                onRetry={() => void everyQuery.refetch()}
                isEmpty={keyIssues.length === 0}
                emptyText="没有待处理的关键问题"
              >
                {keyIssues.map((risk) => (
                  <div className="wb-risk-issue-row" key={risk.id}>
                    <span className="wb-risk-issue-icon">
                      {risk.kind === 'risk' ? (
                        <WarningOutlined style={{ color: designVars.red }} />
                      ) : (
                        <BugOutlined style={{ color: designVars.orange }} />
                      )}
                    </span>
                    <span className="wb-risk-issue-title" title={risk.title}>
                      {risk.title}
                    </span>
                    <ToneTag tone={STATUS_TONE[risk.level] ?? 'gray'}>
                      {LEVEL_LABEL[risk.level]}
                    </ToneTag>
                    <span className="wb-risk-issue-due">{formatDateOnly(risk.dueDate)}</span>
                  </div>
                ))}
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 风险问题列表 */}
        <div className="wb-risk-12" id="wb-risk-list">
          <Panel
            title="风险问题列表"
            extra={
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                新建风险/问题
              </Button>
            }
            flush
          >
            <div className="wb-risk-toolbar">
              <Select
                className="wb-risk-select"
                allowClear
                placeholder="全部类型"
                value={filters.kind}
                onChange={(value: RiskKind | undefined) => setFilters((prev) => ({ ...prev, kind: value }))}
                options={[
                  { value: 'risk', label: '风险' },
                  { value: 'issue', label: '问题' },
                ]}
              />
              <Select
                className="wb-risk-select"
                allowClear
                placeholder="全部状态"
                value={filters.status}
                onChange={(value: RiskStatus | undefined) =>
                  setFilters((prev) => ({ ...prev, status: value }))
                }
                options={[
                  { value: 'open', label: '待处理' },
                  { value: 'handling', label: '处理中' },
                  { value: 'resolved', label: '已解决' },
                ]}
              />
              <Select
                className="wb-risk-select"
                allowClear
                placeholder="全部等级"
                value={filters.level}
                onChange={(value: RiskLevel | undefined) =>
                  setFilters((prev) => ({ ...prev, level: value }))
                }
                options={[
                  { value: 'high', label: '高' },
                  { value: 'medium', label: '中' },
                  { value: 'low', label: '低' },
                ]}
              />
              {(filters.kind || filters.status || filters.level) ? (
                <Button size="small" onClick={() => setFilters({})}>
                  重置
                </Button>
              ) : null}
            </div>
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={listQuery.isPending}
                error={listQuery.isError ? listQuery.error : undefined}
                onRetry={() => void listQuery.refetch()}
                isEmpty={rows.length === 0}
                emptyText="没有符合条件的风险与问题"
                emptyAction={
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    新建风险/问题
                  </Button>
                }
              >
                <Table<Risk>
                  className="wb-table"
                  size="small"
                  rowKey="id"
                  columns={columns}
                  dataSource={rows}
                  pagination={false}
                  scroll={{ x: 900 }}
                />
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 风险应对计划 */}
        <div className="wb-risk-12">
          <Panel title="风险应对计划" flush>
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={everyQuery.isPending}
                error={everyQuery.isError ? everyQuery.error : undefined}
                onRetry={() => void everyQuery.refetch()}
                isEmpty={responsePlans.length === 0}
                emptyText="还没有填写应对措施的风险或问题"
              >
                <Table<Risk>
                  className="wb-table"
                  size="small"
                  rowKey="id"
                  columns={planColumns}
                  dataSource={responsePlans}
                  pagination={false}
                  scroll={{ x: 900 }}
                />
              </StateBlock>
            </div>
          </Panel>
        </div>
      </div>

      <RiskFormModal
        open={formOpen}
        mode={editing ? 'edit' : 'create'}
        risk={editing}
        projects={projectsQuery.data?.items ?? []}
        owners={ownersQuery.data ?? []}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </div>
  );
}
