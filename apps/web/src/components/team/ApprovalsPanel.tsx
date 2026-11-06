import { useState } from 'react';
import { App as AntdApp, Button, Modal, Input, Select } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { Approval, ApprovalStatus } from '@blackhole/shared/types';
import { decideApproval, listApprovals, teamKeys } from '../../api/team';
import { errorText } from '../../api/messages';
import { useAuth } from '../../auth/AuthContext';
import { Panel, ToneTag } from '../ui';
import type { TagTone } from '../ui';
import { StateBlock } from '../user/StateBlock';
import { formatRelativeTime } from './relativeTime';

/**
 * 待我审批面板 —— 用户端「团队协作」页（稿子图6）。
 *
 * 数据来源：GET /api/approvals?status=&scope=
 * - scope：mine 指派给我的 / submitted 我提交的 / all 全部；
 * - status：pending 待处理 / approved 已通过 / rejected 已驳回；
 * - 不传 status 即「全部状态」。
 * - scope=all 只有管理员可选（服务端对普通用户强制收敛到 mine）。
 *
 * 处理：POST /api/approvals/:id/decision  body { decision, comment? }
 * - 服务端只允许审批人本人或管理员处理，且不能审批自己提交的申请；
 * - 因此「可处理」的判定在前端也做一遍（canDecide），避免给出必然 403 的按钮。
 *
 * 状态标签色调：待处理=橙 / 已通过=绿 / 已驳回=红。
 */

/** 审批类型（kind）→ 色调；服务端 kind 是自由字符串，未知类型走灰色 */
const KIND_TONE: Record<string, TagTone> = {
  general: 'gray',
  project: 'blue',
  budget: 'orange',
  change: 'purple',
};

/** 审批状态 → 中文 + 色调 */
const STATUS_META: Record<ApprovalStatus, { label: string; tone: TagTone }> = {
  pending: { label: '待处理', tone: 'orange' },
  approved: { label: '已通过', tone: 'green' },
  rejected: { label: '已驳回', tone: 'red' },
};

/** 列表筛选：状态 */
type StatusFilter = 'all' | ApprovalStatus;

/** 列表筛选：范围 */
type ScopeFilter = 'mine' | 'submitted' | 'all';

/** 默认范围 —— 管理员看全部，普通用户看指派给自己的 */
function defaultScope(isAdmin: boolean): ScopeFilter {
  return isAdmin ? 'all' : 'mine';
}

/**
 * 能不能处理这条审批 —— 与服务端 decideApproval 的判定对齐：
 * - 审批人本人或管理员；
 * - 且不能审批自己提交的申请（管理员除外）。
 */
function canDecideApproval(item: Approval, userId: number | null, isAdmin: boolean): boolean {
  if (item.status !== 'pending') return false;
  if (userId === null) return false;
  const isAssignee = item.assigneeId === userId;
  if (!isAssignee && !isAdmin) return false;
  if (item.requesterId === userId && !isAdmin) return false;
  return true;
}

export function ApprovalsPanel() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();

  const [status, setStatus] = useState<StatusFilter>('pending');
  const [scope, setScope] = useState<ScopeFilter>(defaultScope(isAdmin));
  const [deciding, setDeciding] = useState<{
    item: Approval;
    decision: 'approved' | 'rejected';
  } | null>(null);
  const [comment, setComment] = useState('');

  const listQuery = useQuery({
    queryKey: teamKeys.approvals({
      status: status === 'all' ? undefined : status,
      scope,
    }),
    queryFn: () =>
      listApprovals({
        status: status === 'all' ? undefined : status,
        scope,
      }),
    staleTime: 30_000,
  });

  const items = listQuery.data?.items ?? [];

  const decisionMutation = useMutation({
    mutationFn: (input: { id: number; decision: 'approved' | 'rejected'; comment: string }) =>
      decideApproval(input.id, { decision: input.decision, comment: input.comment }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: teamKeys.approvalRoot });
      void message.success(variables.decision === 'approved' ? '已通过' : '已驳回');
      setDeciding(null);
      setComment('');
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  const openDecision = (item: Approval, decision: 'approved' | 'rejected'): void => {
    setComment('');
    setDeciding({ item, decision });
  };

  const submitDecision = (): void => {
    if (!deciding) return;
    const text = comment.trim();
    if (deciding.decision === 'rejected' && !text) {
      void message.warning('驳回时请填写审批意见');
      return;
    }
    decisionMutation.mutate({ id: deciding.item.id, decision: deciding.decision, comment: text });
  };

  const scopeOptions: Array<{ value: ScopeFilter; label: string }> = [
    { value: 'mine', label: '指派给我' },
    { value: 'submitted', label: '我提交的' },
    ...(isAdmin ? [{ value: 'all' as const, label: '全部' }] : []),
  ];

  return (
    <Panel
      title="待我审批"
      extra={<span className="wb-muted">通过 / 驳回都留审批意见</span>}
      flush
    >
      <div style={{ padding: '0 18px 16px' }}>
        <div className="wb-team-appr-toolbar">
          <Select<StatusFilter>
            className="wb-team-appr-select"
            value={status}
            onChange={(value) => setStatus(value)}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'pending', label: '待我处理' },
              { value: 'approved', label: '已通过' },
              { value: 'rejected', label: '已驳回' },
            ]}
          />
          <Select<ScopeFilter>
            className="wb-team-appr-select"
            value={scope}
            onChange={(value) => setScope(value)}
            options={scopeOptions}
          />
        </div>

        <StateBlock
          loading={listQuery.isPending}
          error={listQuery.isError ? listQuery.error : undefined}
          onRetry={() => void listQuery.refetch()}
          isEmpty={items.length === 0}
          emptyText="没有符合条件的审批"
        >
          {items.map((item) => {
            const meta = STATUS_META[item.status];
            const decidable = canDecideApproval(item, user?.id ?? null, isAdmin);
            return (
              <article className="wb-team-appr" key={item.id}>
                <div className="wb-team-appr-head">
                  <ToneTag tone={KIND_TONE[item.kind] ?? 'gray'} title="审批类型">
                    {item.kind}
                  </ToneTag>
                  <span className="wb-team-appr-title" title={item.title}>
                    {item.title}
                  </span>
                  <ToneTag tone={meta.tone}>{meta.label}</ToneTag>
                </div>

                {item.detail ? <p className="wb-team-appr-detail">{item.detail}</p> : null}

                <div className="wb-team-appr-meta">
                  <span>提交人：{item.requesterName}</span>
                  <span>提交于 {formatRelativeTime(item.createdAt)}</span>
                  {item.assigneeName ? <span>审批人：{item.assigneeName}</span> : null}
                  {item.decidedAt ? <span>处理于 {formatRelativeTime(item.decidedAt)}</span> : null}
                </div>

                {item.status !== 'pending' && item.comment ? (
                  <div className="wb-team-appr-comment">
                    <span className="wb-team-appr-comment-label">审批意见</span>
                    <span className="wb-team-appr-comment-text">{item.comment}</span>
                  </div>
                ) : null}

                {decidable ? (
                  <div className="wb-team-appr-actions">
                    <Button
                      type="primary"
                      size="small"
                      icon={<CheckOutlined />}
                      onClick={() => openDecision(item, 'approved')}
                    >
                      通过
                    </Button>
                    <Button
                      size="small"
                      danger
                      icon={<CloseOutlined />}
                      onClick={() => openDecision(item, 'rejected')}
                    >
                      驳回
                    </Button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </StateBlock>
      </div>

      <Modal
        open={deciding !== null}
        title={deciding?.decision === 'approved' ? '通过审批' : '驳回审批'}
        onCancel={() => {
          setDeciding(null);
          setComment('');
        }}
        onOk={submitDecision}
        confirmLoading={decisionMutation.isPending}
        okText="提交"
        cancelText="取消"
        maskClosable={false}
        width={520}
      >
        {deciding ? (
          <div className="wb-team-appr-modal">
            <div className="wb-team-appr-modal-title">{deciding.item.title}</div>
            <div className="wb-team-appr-modal-meta">提交人：{deciding.item.requesterName}</div>
            <Input.TextArea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={
                deciding.decision === 'approved' ? '审批意见（可空）' : '驳回原因（必填）'
              }
              maxLength={4000}
              showCount
              rows={4}
            />
          </div>
        ) : null}
      </Modal>
    </Panel>
  );
}

/**
 * 待我审批的条数 —— 指标卡用。
 *
 * 口径：pending 且**当前用户能处理**的那些：
 * - 管理员：全部待处理（管理员可以处理任何人的申请）；
 * - 普通用户：指派给自己的待处理（自己提交给自己的不算，那类服务端也拒审）。
 */
export function usePendingApprovalCount(): number {
  const { user, isAdmin } = useAuth();
  const scope = defaultScope(isAdmin);
  const query = useQuery({
    queryKey: teamKeys.approvals({ status: 'pending', scope }),
    queryFn: () => listApprovals({ status: 'pending', scope }),
    staleTime: 30_000,
  });
  if (!query.data) return 0;
  return query.data.items.filter((item) =>
    canDecideApproval(item, user?.id ?? null, isAdmin),
  ).length;
}
