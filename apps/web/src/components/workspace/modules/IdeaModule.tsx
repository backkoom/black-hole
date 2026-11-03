import { useState } from 'react';
import { App, Button, Input } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createIdea, ideasKeys, listIdeas } from '../../../api/ideas';
import { errorText } from '../../../api/messages';
import { formatDateTime } from '../../../utils/datetime';
import { ModuleEmpty, ModuleFailure, ModuleLoading, useModuleResource } from './ModuleShell';

/**
 * 灵感记录模块 —— §7.5：
 * `GET /ideas?pageSize=5`；输入框新增走 `POST /ideas`；列表只显示自己的（服务端只返回自己的）。
 */
export function IdeaModule() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');

  const resource = useModuleResource({
    queryKey: ideasKeys.list(1, 5),
    queryFn: () => listIdeas({ page: 1, pageSize: 5 }),
  });

  const create = useMutation({
    mutationFn: (text: string) => createIdea(text),
    onSuccess: () => {
      setContent('');
      void queryClient.invalidateQueries({ queryKey: ideasKeys.all });
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  const submit = (): void => {
    const text = content.trim();
    if (!text) return;
    create.mutate(text);
  };

  if (resource.status === 'loading') return <ModuleLoading />;
  if (resource.status === 'error') {
    return <ModuleFailure message={resource.message} onRetry={resource.retry} />;
  }

  const ideas = resource.data.items;
  const empty = ideas.length === 0;

  return (
    <div className="wb-idea">
      <div className="wb-idea-input">
        <Input
          size="small"
          value={content}
          maxLength={2000}
          placeholder="记一条灵感"
          onChange={(event) => setContent(event.target.value)}
          onPressEnter={submit}
        />
        <Button
          size="small"
          type="primary"
          icon={<PlusOutlined />}
          loading={create.isPending}
          disabled={!content.trim()}
          onClick={submit}
        >
          新增
        </Button>
      </div>
      {empty ? (
        <ModuleEmpty text="还没有灵感" />
      ) : (
        <ul className="wb-idea-list">
          {ideas.map((idea) => (
            <li key={idea.id}>
              <span className="wb-idea-content">{idea.content}</span>
              <span className="wb-idea-time">{formatDateTime(idea.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
