import { useState } from 'react';
import { App as AntdApp, Button, Input, Select } from 'antd';
import { CloudUploadOutlined, PlusOutlined, ScheduleOutlined, TagsOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Project } from '@blackhole/shared/types';
import { createTask } from '../../api/tasks';
import { errorText } from '../../api/messages';
import { invalidateUserData } from '../../hooks/useInvalidate';
import { todayShanghaiDate } from '../../utils/datetime';

/**
 * 快速添加（D-31）。
 *
 * 老六的原话：原来的四个入口卡"没有描述工作或者任务内容"，等于四个空按钮。
 * 所以这里改成**一个输入框 + 三个小动作**：
 * - 主位是"直接写任务"：输入标题回车即建，默认今天到期、挂到选中的项目；
 * - 只有需要换项目时才动下拉，绝大多数情况一行字就完事；
 * - 右侧三个小按钮是"确实要跳页"的动作（上传文件 / 写随记 / 排日程），不再喧宾夺主。
 */
export function QuickAdd({
  projects,
  onWriteIdea,
}: {
  projects: Project[];
  /** 「写随记」不跳页了 —— 聚焦工作台下方的便签输入框（D-31） */
  onWriteIdea: () => void;
}): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<number | undefined>(projects[0]?.id);

  const createMutation = useMutation({
    mutationFn: (input: { title: string; projectId?: number }) =>
      createTask({
        title: input.title,
        projectId: input.projectId ?? null,
        dueDate: todayShanghaiDate(),
        priority: 'medium',
      }),
    onSuccess: async () => {
      setTitle('');
      await invalidateUserData(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['workbench'] });
      void message.success('已加到今天的待办');
    },
    onError: (err) => void message.error(errorText(err)),
  });

  const submit = (): void => {
    const value = title.trim();
    if (!value) {
      void message.warning('先写点内容，再回车');
      return;
    }
    if (value.length > 256) {
      void message.warning('任务标题最多 256 字');
      return;
    }
    createMutation.mutate({ title: value, projectId });
  };

  return (
    <div className="wb-quickadd">
      <div className="wb-quickadd-main">
        <PlusOutlined className="wb-quickadd-icon" />
        <Input
          variant="borderless"
          className="wb-quickadd-input"
          placeholder="写下要做的事，回车放进今天的待办"
          value={title}
          maxLength={256}
          onChange={(event) => setTitle(event.target.value)}
          onPressEnter={submit}
          disabled={createMutation.isPending}
        />
        {projects.length > 0 ? (
          <Select
            size="small"
            variant="borderless"
            className="wb-quickadd-project"
            value={projectId}
            onChange={(value: number) => setProjectId(value)}
            placeholder="不挂项目"
            allowClear
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
            popupMatchSelectWidth={false}
          />
        ) : null}
        <Button
          type="primary"
          size="small"
          loading={createMutation.isPending}
          onClick={submit}
          className="wb-quickadd-submit"
        >
          添加
        </Button>
      </div>

      <div className="wb-quickadd-actions">
        <Button type="text" size="small" icon={<CloudUploadOutlined />} onClick={() => void navigate('/files')}>
          上传文件
        </Button>
        <Button type="text" size="small" icon={<TagsOutlined />} onClick={onWriteIdea}>
          写随记
        </Button>
        <Button type="text" size="small" icon={<ScheduleOutlined />} onClick={() => void navigate('/calendar')}>
          排日程
        </Button>
      </div>
    </div>
  );
}
