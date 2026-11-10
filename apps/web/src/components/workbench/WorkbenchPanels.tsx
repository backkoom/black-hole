import { useMemo, useState } from 'react';
import { Avatar, Empty } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { FileAsset, Idea, Project, Risk, Task } from '@blackhole/shared/types';
import { designVars } from '../../styles/theme';
import { Panel, ToneTag } from '../ui';
import { DonutChart } from '../ui/charts';
import { ThinProgress } from '../user/ThinProgress';
import { formatDateOnly } from '../../utils/datetime';
import { formatBytes } from '../../utils/format';

/**
 * 工作台右侧与下方三块（D-36）：任务状态+风险、项目栈、最近到期任务表。
 * 数据全部由页面传进来，组件只负责渲染与切换。
 */

const LEVEL_TEXT: Record<string, { text: string; tone: 'red' | 'orange' | 'gray' }> = {
  high: { text: '高', tone: 'red' },
  medium: { text: '中', tone: 'orange' },
  low: { text: '低', tone: 'gray' },
};

export function StatusRiskCard({
  counts,
  risks,
  overdue,
  onMoreStatus,
  onMoreRisks,
}: {
  counts: { todo: number; doing: number; done: number; total: number };
  risks: Risk[];
  overdue: number;
  onMoreStatus: () => void;
  onMoreRisks: () => void;
}): JSX.Element {
  const sorted = useMemo(() => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...risks].sort((a, b) => (order[a.level] ?? 9) - (order[b.level] ?? 9));
  }, [risks]);

  return (
    <Panel title="任务状态" more="全部" onMore={onMoreStatus} flush>
      <div className="wb-status-body">
        <div className="wb-status-donut">
          <DonutChart
            segments={[
              { name: '待处理', value: counts.todo, color: designVars.orange },
              { name: '进行中', value: counts.doing, color: designVars.green },
              { name: '已完成', value: counts.done, color: designVars.purple },
            ]}
            centerValue={counts.total}
            centerLabel="总任务"
            size={110}
            thickness={16}
          />
        </div>
        <div className="wb-status-legend">
          <span>
            <i style={{ background: designVars.orange }} />
            待处理 <b>{counts.todo}</b>
          </span>
          <span>
            <i style={{ background: designVars.green }} />
            进行中 <b>{counts.doing}</b>
          </span>
          <span>
            <i style={{ background: designVars.purple }} />
            已完成 <b>{counts.done}</b>
          </span>
        </div>

        {overdue > 0 ? (
          <div className="wb-status-warn">
            <i style={{ background: designVars.red }} />
            另有 {overdue} 条任务已逾期 · 建议今天处理
          </div>
        ) : null}

        <div className="wb-status-sub">
          <h4>风险预警</h4>
          <span>
            {sorted.length} 条未关闭
            {sorted.filter((r) => r.level === 'high').length > 0
              ? ` · ${sorted.filter((r) => r.level === 'high').length} 条高`
              : ''}
          </span>
          <button type="button" onClick={onMoreRisks}>
            全部 →
          </button>
        </div>

        <div className="wb-risk-scroll">
          {sorted.length === 0 ? (
            <div className="wb-panel-empty">没有未关闭的风险</div>
          ) : (
            sorted.slice(0, 6).map((risk) => {
              const meta = LEVEL_TEXT[risk.level] ?? { text: '低', tone: 'gray' as const };
              return (
                <div key={risk.id} className="wb-risk-row">
                  <ToneTag tone={meta.tone}>{meta.text}</ToneTag>
                  <span className="wb-risk-name" title={risk.title}>
                    {risk.title}
                  </span>
                  <span className="wb-risk-proj">{risk.projectName ?? '—'}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Panel>
  );
}

type StackKey = 'projects' | 'notes' | 'files';

export function ProjectStackCard({
  projects,
  ideas,
  files,
  onOpenProject,
  onOpenIdea,
  onOpenFile,
}: {
  projects: Project[];
  ideas: Idea[];
  files: FileAsset[];
  onOpenProject: () => void;
  onOpenIdea: () => void;
  onOpenFile: () => void;
}): JSX.Element {
  const [tab, setTab] = useState<StackKey>('projects');
  const more = { projects: onOpenProject, notes: onOpenIdea, files: onOpenFile }[tab];

  return (
    <div className="wb-stack">
      <div className="wb-stack-head">
        <button
          type="button"
          className={`wb-stack-tab${tab === 'projects' ? ' on' : ''}`}
          onClick={() => setTab('projects')}
        >
          在办项目 <span>{projects.length}</span>
        </button>
        <button
          type="button"
          className={`wb-stack-tab${tab === 'notes' ? ' on' : ''}`}
          onClick={() => setTab('notes')}
        >
          随记 <span>{ideas.length}</span>
        </button>
        <button
          type="button"
          className={`wb-stack-tab${tab === 'files' ? ' on' : ''}`}
          onClick={() => setTab('files')}
        >
          文件资料 <span>{files.length}</span>
        </button>
        <button type="button" className="wb-stack-more" onClick={more}>
          全部 →
        </button>
      </div>

      <div className="wb-stack-body">
        {tab === 'projects' ? (
          projects.length === 0 ? (
            <div className="wb-panel-empty">还没有在办项目</div>
          ) : (
            projects.slice(0, 4).map((project, index) => (
              <div key={project.id} className="wb-stack-project">
                <span className="wb-stack-name" title={project.name}>
                  {project.name}
                </span>
                <span className="wb-stack-pc">{project.progress}%</span>
                <ThinProgress
                  percent={project.progress}
                  color={project.color ?? [designVars.primary, designVars.purple, designVars.green][index % 3]}
                />
                <span className="wb-stack-due">截止 {formatDateOnly(project.dueDate)}</span>
              </div>
            ))
          )
        ) : null}

        {tab === 'notes' ? (
          ideas.length === 0 ? (
            <div className="wb-panel-empty">还没有随记</div>
          ) : (
            <div className="wb-stack-notes">
              {ideas.slice(0, 3).map((idea) => (
                <div key={idea.id} className="wb-stack-note">
                  <span className="wb-stack-note-text">{idea.content}</span>
                  <span className="wb-stack-note-time">{formatDateOnly(idea.createdAt)}</span>
                </div>
              ))}
            </div>
          )
        ) : null}

        {tab === 'files' ? (
          files.length === 0 ? (
            <div className="wb-panel-empty">还没有文件</div>
          ) : (
            files.slice(0, 5).map((file) => (
              <div key={file.id} className="wb-stack-file">
                <span className="wb-stack-file-name" title={file.name}>
                  {file.name}
                </span>
                <span className="wb-stack-file-meta">{formatBytes(file.sizeBytes)}</span>
              </div>
            ))
          )
        ) : null}
      </div>
    </div>
  );
}

export function RecentTaskTableCard({
  tasks,
  onOpenAll,
}: {
  tasks: Task[];
  onOpenAll: () => void;
}): JSX.Element {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'overdue'>('all');

  const rows = useMemo(() => {
    const list = [...tasks]
      .filter((task) => task.status !== 'done')
      .sort((a, b) => (a.dueDate ?? '9999') .localeCompare(b.dueDate ?? '9999'));
    return filter === 'overdue'
      ? list.filter((task) => task.dueDate !== null && task.dueDate < new Date().toISOString().slice(0, 10))
      : list;
  }, [tasks, filter]);

  const today = new Date().toISOString().slice(0, 10);
  const daysLeft = (due: string | null): string => {
    if (!due) return '—';
    const diff = Math.round(
      (new Date(`${due}T00:00:00+08:00`).getTime() - new Date(`${today}T00:00:00+08:00`).getTime()) / 86400000,
    );
    if (diff < 0) return `逾期 ${Math.abs(diff)} 天`;
    if (diff === 0) return '今天';
    return `${diff} 天`;
  };

  return (
    <Panel title="最近的到期任务" more="查看全部" onMore={onOpenAll} flush>
      <div className="wb-table-head">
        <div className="wb-seg">
          <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
            全部
          </button>
          <button type="button" className={filter === 'overdue' ? 'on' : ''} onClick={() => setFilter('overdue')}>
            已逾期
          </button>
        </div>
        <span className="wb-table-count">共 {rows.length} 条</span>
      </div>

      <div className="wb-table-scroll">
        <table className="wb-table">
          <thead>
            <tr>
              <th>任务</th>
              <th>项目</th>
              <th>分类</th>
              <th>到期</th>
              <th>剩余</th>
              <th style={{ textAlign: 'right' }}>状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有待处理的任务" />
                </td>
              </tr>
            ) : (
              rows.slice(0, 8).map((task) => {
                const late = task.dueDate !== null && task.dueDate < today;
                return (
                  <tr key={task.id} onClick={() => void navigate('/projects?view=tasks')}>
                    <td className="wb-table-title">{task.title}</td>
                    <td>{task.projectName ?? '—'}</td>
                    <td className="wb-table-muted">{task.category ?? '—'}</td>
                    <td>{formatDateOnly(task.dueDate)}</td>
                    <td className={late ? 'wb-table-late' : 'wb-table-muted'}>{daysLeft(task.dueDate)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`wb-table-status ${task.status}`}>
                        {task.status === 'todo' ? '待处理' : task.status === 'doing' ? '进行中' : '已完成'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function TeamMiniCard({ members }: { members: { userId: number; name: string }[] }): JSX.Element {
  return (
    <Panel title="团队成员" flush>
      <div className="wb-team-mini">
        {members.slice(0, 5).map((member) => (
          <span key={member.userId} className="wb-team-chip">
            <Avatar size={20} style={{ background: '#dbe4f5', color: designVars.primary, fontSize: 10 }}>
              {member.name.slice(0, 1)}
            </Avatar>
            {member.name}
          </span>
        ))}
      </div>
    </Panel>
  );
}
