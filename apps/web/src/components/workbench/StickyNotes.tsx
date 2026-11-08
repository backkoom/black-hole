import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { App as AntdApp, Button, Input, Popconfirm } from 'antd';
import { DeleteOutlined, PushpinOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createIdea, deleteIdea, ideasKeys, listIdeas } from '../../api/ideas';
import { errorText } from '../../api/messages';
import { formatDateOnly } from '../../utils/datetime';
import { Empty } from 'antd';

/**
 * 随记便签（D-31）。
 *
 * 老六原话：「随记这是跳转到后台管理了？要真的有随记的功能才行，类似便签纸」。
 * 之前点「记一条随记」跳到 /workspace —— 那是管理员的自定义工作台，根本不是随记。
 *
 * 现在的做法：就在工作台上，一块便签墙：
 * - 顶部输入框：写一句回车贴上（Ctrl/⌘+Enter 也行）；
 * - 下面按便签纸样式排（淡黄纸条、按时间新→旧），每条可删；
 * - 数据仍是原来的 /api/ideas（已存在），不新造表。
 *
 * 为什么用 forwardRef + focus()：顶部「写随记」按钮要能直接聚焦到这里，
 * 而不是再跳一个页面（跳页正是老六吐槽的点）。
 */
export interface StickyNotesHandle {
  focus: () => void;
}

export const StickyNotes = forwardRef<StickyNotesHandle, { limit?: number }>(function StickyNotes(
  { limit = 8 },
  ref,
) {
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const ideasQuery = useQuery({
    queryKey: ['workbench', 'ideas', limit],
    queryFn: () => listIdeas({ page: 1, pageSize: limit }),
    staleTime: 30_000,
  });
  const ideas = ideasQuery.data?.items ?? [];

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['workbench', 'ideas'] });
    await queryClient.invalidateQueries({ queryKey: ideasKeys.all });
  };

  const createMutation = useMutation({
    mutationFn: (content: string) => createIdea(content),
    onSuccess: async () => {
      setDraft('');
      await refresh();
    },
    onError: (err) => void message.error(errorText(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteIdea(id),
    onSuccess: () => void refresh(),
    onError: (err) => void message.error(errorText(err)),
  });

  const submit = (): void => {
    const value = draft.trim();
    if (!value) return;
    createMutation.mutate(value);
  };

  return (
    <div className="wb-sticky">
      <div className="wb-sticky-input">
        <Input.TextArea
          ref={(node) => {
            inputRef.current = node?.resizableTextArea?.textArea ?? null;
          }}
          autoSize={{ minRows: 1, maxRows: 3 }}
          placeholder="贴一张便签：想到什么先记下来，回车保存"
          value={draft}
          maxLength={2000}
          onChange={(event) => setDraft(event.target.value)}
          onPressEnter={(event) => {
            // 回车保存，Shift+回车换行
            if (!event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button type="primary" loading={createMutation.isPending} onClick={submit}>
          贴上
        </Button>
      </div>

      {ideas.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          styles={{ image: { height: 40 } }}
          description={<span className="wb-muted">还没有便签，写一张试试</span>}
        />
      ) : (
        <div className="wb-sticky-wall">
          {ideas.map((idea, index) => (
            <div
              key={idea.id}
              className="wb-sticky-note"
              style={{ ['--wb-note-tilt' as string]: `${(index % 3) - 1}deg` }}
            >
              <PushpinOutlined className="wb-sticky-pin" />
              <p className="wb-sticky-text">{idea.content}</p>
              <div className="wb-sticky-foot">
                <span>{formatDateOnly(idea.createdAt)}</span>
                <Popconfirm
                  title="删掉这张便签？"
                  okText="删"
                  cancelText="留着"
                  onConfirm={() => deleteMutation.mutate(idea.id)}
                >
                  <Button type="text" size="small" icon={<DeleteOutlined />} aria-label="删除便签" />
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
