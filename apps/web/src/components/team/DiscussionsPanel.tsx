import { useMemo, useState } from 'react';
import { App as AntdApp, Button, Input, Select } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DeleteOutlined, MessageOutlined, SendOutlined } from '@ant-design/icons';
import type { Discussion, DiscussionTargetType, Project, Task } from '@blackhole/shared/types';
import { createDiscussion, deleteDiscussion, listAllDiscussions, teamKeys } from '../../api/team';
import { errorText } from '../../api/messages';
import { useAuth } from '../../auth/AuthContext';
import { Panel, ToneTag } from '../ui';
import { StateBlock } from '../user/StateBlock';
import { formatRelativeTime } from './relativeTime';

/**
 * 最近讨论面板 —— 用户端「团队协作」页（稿子图6）。
 *
 * 数据来源：GET /api/discussions（不传 targetType / targetId 时返回全部讨论）。
 * - 服务端按 created_at **升序**返回（最旧在前），而面板要的是「最近」，
 *   所以 api/team.ts 的 listAllDiscussions 把页翻完再整体倒序；
 * - 讨论按**讨论串**分组：顶层讨论（parentId = null）为主，
 *   回复（parentId 指向某条讨论）缩进挂到它的**根讨论**下。
 *
 * 讨论挂在任务或项目上，所以：
 * - 顶部的「讨论对象」下拉既决定列表过滤范围，也决定新发表 / 回复发到哪个对象；
 * - 对象名从任务 / 项目列表里取（普通用户只能看到自己的任务与项目，
 *   因此取不到名字时退化成「任务 #12」这样的兜底文案，不编造）。
 *
 * 交互：能发表（顶层）、能回复（挂在指定讨论下）、能删除自己的。
 */

/** 列表里最多展示多少个讨论串 */
const MAX_THREADS = 12;

/** 下拉里「讨论对象」的值 —— `项目:3` / `任务:12` */
type TargetValue = string;

function encodeTarget(targetType: DiscussionTargetType, targetId: number): TargetValue {
  return `${targetType === 'project' ? '项目' : '任务'}:${targetId}`;
}

function decodeTarget(value: TargetValue): { targetType: DiscussionTargetType; targetId: number } {
  const [label, rawId] = value.split(':');
  return {
    targetType: label === '项目' ? 'project' : 'task',
    targetId: Number(rawId),
  };
}

interface DiscussionsPanelProps {
  projects: Project[];
  tasks: Task[];
}

export function DiscussionsPanel({ projects, tasks }: DiscussionsPanelProps) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();

  const [target, setTarget] = useState<TargetValue | undefined>(undefined);
  const [draft, setDraft] = useState('');
  /** 正在回复的那条讨论 + 它所属讨论串的根讨论 id（回复框渲染在讨论串末尾） */
  const [replyTo, setReplyTo] = useState<{ parent: Discussion; threadId: number } | null>(null);
  const [replyText, setReplyText] = useState('');

  const listQuery = useQuery({
    queryKey: teamKeys.discussions({}),
    queryFn: () => listAllDiscussions(),
    staleTime: 30_000,
  });

  const discussions = listQuery.data?.items ?? [];

  /** 目标 id → 展示名（取不到就显示「任务 #12」） */
  const targetLabels = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((project) => map.set(encodeTarget('project', project.id), project.name));
    tasks.forEach((task) => map.set(encodeTarget('task', task.id), task.title));
    return map;
  }, [projects, tasks]);

  const targetLabel = (item: Discussion): string => {
    const key = encodeTarget(item.targetType, item.targetId);
    return targetLabels.get(key) ?? `${item.targetType === 'project' ? '项目' : '任务'} #${item.targetId}`;
  };

  /**
   * 目标下拉的选项：项目一组、任务一组。
   *
   * ⚠️ 普通用户的 GET /api/projects 与 GET /api/tasks 只返回**自己的**数据，
   *    自己没项目没任务时下拉就是空的 —— 但讨论是全员可读的，
   *    所以把**已有讨论里出现过的对象**也补进候选（名称取不到时用「项目 #12」兜底），
   *    否则普通用户连话都插不上。
   */
  const targetOptions = useMemo(() => {
    const projectOptions = new Map<number, string>();
    const taskOptions = new Map<number, string>();

    projects.forEach((project) => projectOptions.set(project.id, project.name));
    tasks.forEach((task) => taskOptions.set(task.id, task.title));

    // 已有讨论里出现过的对象（普通用户看不到名字，只补 id）
    discussions.forEach((item) => {
      if (item.targetType === 'project') {
        if (!projectOptions.has(item.targetId)) projectOptions.set(item.targetId, `项目 #${item.targetId}`);
      } else if (!taskOptions.has(item.targetId)) {
        taskOptions.set(item.targetId, `任务 #${item.targetId}`);
      }
    });

    const groups: Array<{ label: string; options: Array<{ value: string; label: string }> }> = [];
    if (projectOptions.size > 0) {
      groups.push({
        label: '项目',
        options: [...projectOptions.entries()].map(([id, label]) => ({
          value: encodeTarget('project', id),
          label,
        })),
      });
    }
    if (taskOptions.size > 0) {
      groups.push({
        label: '任务',
        options: [...taskOptions.entries()].map(([id, label]) => ({
          value: encodeTarget('task', id),
          label,
        })),
      });
    }
    return groups;
  }, [projects, tasks, discussions]);

  /**
   * 按讨论串分组：根讨论（parentId = null）为主，
   * 回复挂到根讨论下（回复的父可能本身是回复，向上找到根）。
   */
  const threads = useMemo(() => {
    const byId = new Map<number, Discussion>();
    discussions.forEach((item) => byId.set(item.id, item));

    const rootOf = (item: Discussion): Discussion => {
      let current = item;
      const guard = new Set<number>([current.id]);
      while (current.parentId !== null) {
        const parent = byId.get(current.parentId);
        if (!parent || guard.has(parent.id)) break;
        guard.add(parent.id);
        current = parent;
      }
      return current;
    };

    const roots: Discussion[] = [];
    const repliesOf = new Map<number, Discussion[]>();
    discussions.forEach((item) => {
      const root = rootOf(item);
      if (root.id === item.id) {
        roots.push(item);
        return;
      }
      const bucket = repliesOf.get(root.id);
      if (bucket) bucket.push(item);
      else repliesOf.set(root.id, [item]);
    });

    // 讨论按倒序（最近的在前），回复按正序（先问后答）
    roots.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    repliesOf.forEach((list) => list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)));

    return roots.map((root) => ({
      root,
      replies: repliesOf.get(root.id) ?? [],
    }));
  }, [discussions]);

  /** 顶部下拉选中的对象 → 过滤后的讨论串 */
  const visibleThreads = useMemo(() => {
    const filtered = target
      ? threads.filter((thread) => {
          const { targetType, targetId } = decodeTarget(target);
          return thread.root.targetType === targetType && thread.root.targetId === targetId;
        })
      : threads;
    // 截断放在过滤之后 —— 否则「选中的对象恰好排在第 13 名之后」会看不到
    return filtered.slice(0, MAX_THREADS);
  }, [threads, target]);

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: teamKeys.discussionRoot });
  };

  const createMutation = useMutation({
    mutationFn: (input: { targetType: DiscussionTargetType; targetId: number; content: string; parentId?: number }) =>
      createDiscussion(input),
    onSuccess: async () => {
      await invalidate();
      void message.success('讨论已发表');
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDiscussion(id),
    onSuccess: async () => {
      await invalidate();
      void message.success('讨论已删除');
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  const canManage = (item: Discussion): boolean =>
    isAdmin || (user !== null && item.userId === user.id);

  const handlePost = (): void => {
    const content = draft.trim();
    if (!target) {
      void message.warning('请先选择讨论对象');
      return;
    }
    if (!content) {
      void message.warning('请输入讨论内容');
      return;
    }
    const { targetType, targetId } = decodeTarget(target);
    createMutation.mutate(
      { targetType, targetId, content },
      {
        onSuccess: () => setDraft(''),
      },
    );
  };

  const handleReply = (parent: Discussion): void => {
    const content = replyText.trim();
    if (!content) {
      void message.warning('请输入回复内容');
      return;
    }
    createMutation.mutate(
      {
        targetType: parent.targetType,
        targetId: parent.targetId,
        content,
        parentId: parent.id,
      },
      {
        onSuccess: () => {
          setReplyText('');
          setReplyTo(null);
        },
      },
    );
  };
  return (
    <Panel
      title="最近讨论"
      extra={<span className="wb-muted">讨论挂在任务或项目上</span>}
      flush
    >
      <div style={{ padding: '0 18px 16px' }}>
        {/* 讨论对象 + 发表 */}
        <div className="wb-team-disc-toolbar">
          <Select<TargetValue>
            className="wb-team-disc-target"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择讨论对象（任务 / 项目）"
            value={target}
            onChange={(value) => setTarget(value)}
            options={targetOptions}
          />
          <Input.TextArea
            className="wb-team-disc-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={target ? '写下你的讨论…' : '先选择讨论对象，再发表讨论'}
            autoSize={{ minRows: 1, maxRows: 4 }}
            maxLength={4000}
            disabled={!target}
            onPressEnter={(event) => {
              if (event.shiftKey) return;
              event.preventDefault();
              handlePost();
            }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={createMutation.isPending}
            disabled={!target || draft.trim().length === 0}
            onClick={handlePost}
          >
            发表
          </Button>
        </div>

        <StateBlock
          loading={listQuery.isPending}
          error={listQuery.isError ? listQuery.error : undefined}
          onRetry={() => void listQuery.refetch()}
          isEmpty={visibleThreads.length === 0}
          emptyText={target ? '这个对象下还没有讨论' : '还没有讨论'}
        >
          {visibleThreads.map((thread) => (
            <section className="wb-team-thread" key={thread.root.id}>
              <DiscussionRow
                item={thread.root}
                targetLabel={targetLabel(thread.root)}
                canManage={canManage(thread.root)}
                onReply={() => setReplyTo({ parent: thread.root, threadId: thread.root.id })}
                onDelete={() => deleteMutation.mutate(thread.root.id)}
              />

              {thread.replies.length > 0 ? (
                <div className="wb-team-thread-replies">
                  {thread.replies.map((reply) => (
                    <DiscussionRow
                      key={reply.id}
                      item={reply}
                      targetLabel={targetLabel(reply)}
                      canManage={canManage(reply)}
                      onReply={() => setReplyTo({ parent: reply, threadId: thread.root.id })}
                      onDelete={() => deleteMutation.mutate(reply.id)}
                    />
                  ))}
                </div>
              ) : null}

              {replyTo?.threadId === thread.root.id ? (
                <div className="wb-team-disc-replybox">
                  <Input.TextArea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    placeholder="回复这条讨论…"
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    maxLength={4000}
                    onPressEnter={(event) => {
                      if (event.shiftKey) return;
                      event.preventDefault();
                      handleReply(replyTo.parent);
                    }}
                  />
                  <Button
                    type="primary"
                    size="small"
                    loading={createMutation.isPending}
                    disabled={replyText.trim().length === 0}
                    onClick={() => handleReply(replyTo.parent)}
                  >
                    回复
                  </Button>
                  <Button size="small" onClick={() => { setReplyTo(null); setReplyText(''); }}>
                    取消
                  </Button>
                </div>
              ) : null}
            </section>
          ))}
        </StateBlock>
      </div>
    </Panel>
  );
}

interface DiscussionRowProps {
  item: Discussion;
  targetLabel: string;
  canManage: boolean;
  onReply: () => void;
  onDelete: () => void;
}

function DiscussionRow({ item, targetLabel, canManage, onReply, onDelete }: DiscussionRowProps) {
  return (
    <div className="wb-team-disc-row">
      <div className="wb-team-disc-body">
        <div className="wb-team-disc-meta">
          <span className="wb-team-disc-author">{item.userName}</span>
          <ToneTag tone={item.targetType === 'project' ? 'purple' : 'blue'} title="讨论对象">
            {targetLabel}
          </ToneTag>
          <span className="wb-team-disc-time">{formatRelativeTime(item.createdAt)}</span>
        </div>
        <p className="wb-team-disc-content">{item.content}</p>
      </div>
      <div className="wb-team-disc-actions">
        <Button
          type="text"
          size="small"
          icon={<MessageOutlined />}
          onClick={onReply}
          aria-label={`回复 ${item.userName} 的讨论`}
        >
          回复
        </Button>
        {canManage ? (
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={onDelete}
            aria-label={`删除 ${item.userName} 的讨论`}
          />
        ) : null}
      </div>
    </div>
  );
}
