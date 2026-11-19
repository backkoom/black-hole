import { useState } from 'react';
import { App as AntdApp, Button, Card, Empty, Input, Skeleton, Tag } from 'antd';
import { ArrowLeftOutlined, CheckOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { TaskStatus } from '@blackhole/shared/types';
import { addTaskProgress, getTaskDetail, tasksKeys, updateTaskStatus } from '../api/tasks';
import { errorText } from '../api/messages';

/**
 * 任务详情页 —— `/tasks/:id`（迁移 011 / D-37）
 *
 * 版式（老六 2026-11-18 拍板）：
 *   顶部  标题 + 状态 + 优先级；元信息一行（截止/负责人/项目/上级）
 *   左栏  任务自己的东西：进展记录、子任务
 *   右栏  任务之外的三块：来源、关联风险、附件
 */

const STATUS_TEXT: Record<TaskStatus, string> = {
  todo: '待处理',
  doing: '进行中',
  done: '已完成',
};
const STATUS_COLOR: Record<TaskStatus, string> = { todo: 'default', doing: 'processing', done: 'success' };
const PRIORITY_TEXT: Record<string, string> = { low: '低', medium: '中', high: '高' };
const PRIORITY_COLOR: Record<string, string> = { low: 'default', medium: 'warning', high: 'error' };

const cardStyle: React.CSSProperties = { marginBottom: 12 };

export function TaskDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const taskId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const [draft, setDraft] = useState('');

  const detailQuery = useQuery({
    queryKey: tasksKeys.detail(taskId),
    queryFn: () => getTaskDetail(taskId),
    enabled: Number.isFinite(taskId) && taskId > 0,
  });

  const progressMutation = useMutation({
    mutationFn: (content: string) => addTaskProgress(taskId, content),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(taskId) });
      void message.success('已记录');
    },
    onError: (err) => void message.error(errorText(err)),
  });

  const statusMutation = useMutation({
    mutationFn: (status: TaskStatus) => updateTaskStatus(taskId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(taskId) });
      void message.success('状态已更新');
    },
    onError: (err) => void message.error(errorText(err)),
  });

  if (detailQuery.isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (detailQuery.isError || !detailQuery.data) {
    return <Empty description="任务不存在，或你没有权限查看" />;
  }

  const t = detailQuery.data;
  const doneSub = t.subtasks.filter((s) => s.status === 'done').length;

  return (
    <div style={{ paddingBottom: 24 }}>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        style={{ paddingLeft: 0, marginBottom: 4 }}
        onClick={() => navigate(-1)}
      >
        返回
      </Button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>{t.title}</h2>
        <Tag color={STATUS_COLOR[t.status]}>{STATUS_TEXT[t.status]}</Tag>
        <Tag color={PRIORITY_COLOR[t.priority]}>{PRIORITY_TEXT[t.priority] ?? t.priority}优先级</Tag>
        {t.status !== 'done' ? (
          <Button
            size="small"
            type="primary"
            ghost
            icon={<CheckOutlined />}
            loading={statusMutation.isPending}
            onClick={() => statusMutation.mutate('done')}
          >
            完成
          </Button>
        ) : null}
      </div>

      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 18, lineHeight: 1.9 }}>
        截止 {t.dueDate ?? '—'} · 负责人 {t.assigneeName ?? '未指派'} ·{' '}
        {t.projectName ? `项目：${t.projectName}` : '不属于任何项目'}
        {t.parent ? (
          <>
            {' · 上级 '}
            <a onClick={() => navigate(`/tasks/${t.parent?.id}`)}>{t.parent.title}</a>
          </>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <Card
            size="small"
            title="进展记录"
            style={cardStyle}
            bodyStyle={{ paddingTop: 12 }}
          >
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <Input.TextArea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="记一笔：做到哪了、卡在哪（回车换行，Ctrl+Enter 提交）"
                autoSize={{ minRows: 2, maxRows: 4 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && draft.trim()) {
                    progressMutation.mutate(draft.trim());
                  }
                }}
              />
              <Button
                type="primary"
                loading={progressMutation.isPending}
                disabled={!draft.trim()}
                onClick={() => progressMutation.mutate(draft.trim())}
              >
                记一笔
              </Button>
            </div>

            {t.progress.length === 0 ? (
              <div style={{ color: '#bfbfbf', fontSize: 13, padding: '8px 0' }}>还没有进展记录</div>
            ) : (
              <div style={{ borderLeft: '2px solid #f0f0f0', paddingLeft: 14, display: 'grid', gap: 12 }}>
                {t.progress.map((p) => (
                  <div key={p.id}>
                    <div style={{ fontSize: 12, color: '#bfbfbf' }}>
                      {p.createdAt ? p.createdAt.replace('T', ' ').slice(0, 16) : '—'} · {p.userName}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{p.content}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            size="small"
            title={`子任务 ${doneSub}/${t.subtasks.length}`}
            style={cardStyle}
          >
            {t.subtasks.length === 0 ? (
              <div style={{ color: '#bfbfbf', fontSize: 13 }}>没有子任务</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {t.subtasks.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      fontSize: 13,
                      color: s.status === 'done' ? '#bfbfbf' : undefined,
                      textDecoration: s.status === 'done' ? 'line-through' : undefined,
                      cursor: 'pointer',
                    }}
                    onClick={() => navigate(`/tasks/${s.id}`)}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        flex: 'none',
                        border: s.status === 'done' ? 'none' : '1px solid #d9d9d9',
                        background: s.status === 'done' ? '#1677ff' : 'transparent',
                      }}
                    />
                    {s.title}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div style={{ minWidth: 0 }}>
          <Card size="small" title="来源" style={cardStyle}>
            {t.source ? (
              <>
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>{t.source.title}</div>
                <div style={{ fontSize: 12, color: '#bfbfbf', marginTop: 4 }}>
                  {t.source.type === 'meeting' ? '会议' : t.source.type === 'risk' ? '风险' : '随记'}
                  {t.source.subtitle ? ` · ${t.source.subtitle.replace('T', ' ').slice(0, 16)}` : ''}
                </div>
              </>
            ) : (
              <div style={{ color: '#bfbfbf', fontSize: 13 }}>手动创建</div>
            )}
          </Card>

          <Card size="small" title="关联风险" style={cardStyle}>
            {t.relatedRisks.length === 0 ? (
              <div style={{ color: '#bfbfbf', fontSize: 13 }}>无</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {t.relatedRisks.map((r) => (
                  <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        marginTop: 7,
                        flex: 'none',
                        background:
                          r.level === 'high' ? '#f5222d' : r.level === 'medium' ? '#fa8c16' : '#bfbfbf',
                      }}
                    />
                    <div>
                      <div style={{ fontSize: 13, lineHeight: 1.5 }}>{r.title}</div>
                      <div style={{ fontSize: 12, color: '#bfbfbf', marginTop: 2 }}>
                        {r.code ?? ''} {r.level === 'high' ? '高' : r.level === 'medium' ? '中' : '低'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card size="small" title={`附件 ${t.files.length}`} style={cardStyle}>
            {t.files.length === 0 ? (
              <div style={{ color: '#bfbfbf', fontSize: 13 }}>暂无附件</div>
            ) : (
              <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                {t.files.map((f) => (
                  <div key={f.id}>{f.name}</div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
