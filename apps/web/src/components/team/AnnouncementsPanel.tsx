import { useState } from 'react';
import { App as AntdApp, Button, Pagination, Popconfirm, Tooltip } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DeleteOutlined, EditOutlined, PlusOutlined, PushpinFilled } from '@ant-design/icons';
import type { Announcement, Project } from '@blackhole/shared/types';
import { deleteAnnouncement, listAnnouncements, teamKeys } from '../../api/team';
import { errorText } from '../../api/messages';
import { useAuth } from '../../auth/AuthContext';
import { Panel, ToneTag } from '../ui';
import { StateBlock } from '../user/StateBlock';
import { AnnouncementFormModal } from './AnnouncementFormModal';
import { formatRelativeTime } from './relativeTime';

/**
 * 团队公告面板 —— 用户端「团队协作」页（稿子图6）。
 *
 * 数据来源：GET /api/announcements?page=&pageSize=
 * - 服务端已按「置顶优先 + 创建时间倒序」排序（ORDER BY pinned DESC, created_at DESC），
 *   所以置顶的天然排在最前，这里不再二次排序，避免与服务端口径打架。
 * - 列表项显示：标题 + 内容摘要 + 发布人 + 相对时间 + 项目标签 + 置顶标记。
 *
 * 交互：
 * - 发布 / 编辑 / 删除：删除与编辑限本人（管理员亦可，与服务端权限一致）。
 * - 列表自带分页（服务端分页，口径与接口一致）。
 */

const PAGE_SIZE = 20;

/** 内容摘要最大字数 */
const SUMMARY_MAX = 90;

function summarize(content: string): string {
  const text = content.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX)}…` : text;
}

export function AnnouncementsPanel({ projects }: { projects: Project[] }) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);

  const listQuery = useQuery({
    queryKey: teamKeys.announcements({ page, pageSize: PAGE_SIZE }),
    queryFn: () => listAnnouncements({ page, pageSize: PAGE_SIZE }),
    staleTime: 30_000,
  });

  const announcements = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAnnouncement(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: teamKeys.announcementRoot });
      void message.success('公告已删除');
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  /** 只有本人或管理员能改 / 删（与服务端一致） */
  const canManage = (item: Announcement): boolean =>
    isAdmin || (user !== null && item.userId === user.id);

  const openCreate = (): void => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (item: Announcement): void => {
    setEditing(item);
    setFormOpen(true);
  };

  return (
    <Panel
      title="团队公告"
      extra={
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
          发公告
        </Button>
      }
      flush
    >
      <div style={{ padding: '0 18px 16px' }}>
        <StateBlock
          loading={listQuery.isPending}
          error={listQuery.isError ? listQuery.error : undefined}
          onRetry={() => void listQuery.refetch()}
          isEmpty={announcements.length === 0}
          emptyText="还没有团队公告"
          emptyAction={
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              发布第一条公告
            </Button>
          }
        >
          {announcements.map((item) => {
            const summary = summarize(item.content);
            return (
              <article className="wb-team-ann" key={item.id}>
                <div className="wb-team-ann-head">
                  {item.pinned ? (
                    <ToneTag tone="orange" title="置顶公告">
                      <PushpinFilled style={{ marginRight: 4 }} />
                      置顶
                    </ToneTag>
                  ) : null}
                  <span className="wb-team-ann-title" title={item.title}>
                    {item.title}
                  </span>
                  {canManage(item) ? (
                    <span className="wb-team-ann-actions">
                      <Tooltip title="编辑">
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          aria-label={`编辑公告 ${item.title}`}
                          onClick={() => openEdit(item)}
                        />
                      </Tooltip>
                      <Popconfirm
                        title="删除这条公告？"
                        description="删除后不可恢复（服务端为软删，历史保留）。"
                        okText="删除"
                        cancelText="取消"
                        onConfirm={() => deleteMutation.mutate(item.id)}
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          aria-label={`删除公告 ${item.title}`}
                        />
                      </Popconfirm>
                    </span>
                  ) : null}
                </div>

                {summary ? <p className="wb-team-ann-summary">{summary}</p> : null}

                <div className="wb-team-ann-meta">
                  <span className="wb-team-ann-author">{item.userName}</span>
                  <span className="wb-team-ann-time">{formatRelativeTime(item.createdAt)}</span>
                  {item.projectName ? (
                    <ToneTag tone="blue" title="所属项目">
                      {item.projectName}
                    </ToneTag>
                  ) : (
                    <ToneTag tone="gray" title="未归属项目">
                      全员
                    </ToneTag>
                  )}
                </div>
              </article>
            );
          })}

          {total > PAGE_SIZE ? (
            <div className="wb-team-ann-pager">
              <span className="wb-muted">共 {total} 条</span>
              <Pagination
                size="small"
                current={page}
                pageSize={PAGE_SIZE}
                total={total}
                showSizeChanger={false}
                onChange={(next) => setPage(next)}
              />
            </div>
          ) : null}
        </StateBlock>
      </div>

      <AnnouncementFormModal
        open={formOpen}
        mode={editing ? 'edit' : 'create'}
        announcement={editing}
        projects={projects}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </Panel>
  );
}
