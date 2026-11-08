import { useState } from 'react';
import { App as AntdApp, Button, Input, Select } from 'antd';
import { CheckOutlined, ClockCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Project, Task } from '@blackhole/shared/types';
import { createTask, listTasks, updateTaskStatus } from '../../api/tasks';
import { listMeetings } from '../../api/schedule';
import { errorText } from '../../api/messages';
import { invalidateUserData } from '../../hooks/useInvalidate';
import { formatTimeOnly, todayShanghaiDate } from '../../utils/datetime';
import { StateBlock } from '../user/StateBlock';

/**
 * 「今天」= 今日待办（D-32 拆出来）。
 *
 * 原来「今天」是"待办 + 日程"合成一块；老六后来的规划里 日程 是独立模块，
 * 所以这里只留待办，并且**把添加框收进来**（原来顶上那条大输入框和随记的输入框重合，
 * 现在改成行内添加：点「加一条」就地出现输入行，写完回车即建）。
 */
export function TodayTasks({ projects }: { projects: Project[] }): JSX.Element {
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const today = todayShanghaiDate();

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<number | undefined>(projects[0]?.id);

  const tasksQuery = useQuery({
    queryKey: ['workbench', 'today-tasks'],
    queryFn: () => listTasks({ page: 1, pageSize: 8, due: 'today' }),
    staleTime: 15_000,
  });
  const todayTasks = tasksQuery.data?.items ?? [];

  const statusMutation = useMutation({
    mutationFn: (input: { id: number; status: Task['status'] }) =>
      updateTaskStatus(input.id, input.status),
    onSuccess: async () => {
      await invalidateUserData(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['workbench'] });
    },
    onError: (err) => void message.error(errorText(err)),
  });

  const createMutation = useMutation({
    mutationFn: (input: { title: string; projectId?: number }) =>
      createTask({
        title: input.title,
        projectId: input.projectId ?? null,
        dueDate: today,
        priority: 'medium',
      }),
    onSuccess: async () => {
      setTitle('');
      setAdding(false);
      await invalidateUserData(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['workbench'] });
      void message.success('已加到今天');
    },
    onError: (err) => void message.error(errorText(err)),
  });

  const submit = (): void => {
    const value = title.trim();
    if (!value) {
      setAdding(false);
      return;
    }
    createMutation.mutate({ title: value, projectId });
  };

  const doneCount = todayTasks.filter((task) => task.status === 'done').length;

  return (
    <div className="wb-today-tasks">
      <div className="wb-today-head">
        <span className="wb-today-title">
          待办
          <span className="wb-today-count">
            {doneCount}/{todayTasks.length}
          </span>
        </span>
        <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => setAdding((prev) => !prev)}>
          加一条
        </Button>
      </div>

      {adding ? (
        <div className="wb-inline-add">
          <Input
            autoFocus
            variant="borderless"
            size="small"
            placeholder="写一件今天要做的事，回车添加"
            value={title}
            maxLength={256}
            onChange={(event) => setTitle(event.target.value)}
            onPressEnter={submit}
            onBlur={() => {
              if (!title.trim()) setAdding(false);
            }}
          />
          {projects.length > 0 ? (
            <Select
              size="small"
              variant="borderless"
              className="wb-inline-add-project"
              value={projectId}
              onChange={(value: number) => setProjectId(value)}
              allowClear
              placeholder="不挂项目"
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
              popupMatchSelectWidth={false}
            />
          ) : null}
        </div>
      ) : null}

      <StateBlock
        loading={tasksQuery.isPending}
        error={tasksQuery.isError ? tasksQuery.error : undefined}
        onRetry={() => void tasksQuery.refetch()}
        isEmpty={todayTasks.length === 0}
        emptyText="今天没有到期的任务"
        emptyHint="点「加一条」写一件"
      >
        <ul className="wb-todo-list">
          {todayTasks.map((task) => {
            const done = task.status === 'done';
            return (
              <li key={task.id} className={`wb-todo-item${done ? ' is-done' : ''}`}>
                <button
                  type="button"
                  className="wb-todo-check"
                  aria-label={done ? '标记为未完成' : '标记为已完成'}
                  onClick={() => statusMutation.mutate({ id: task.id, status: done ? 'todo' : 'done' })}
                >
                  {done ? <CheckOutlined /> : null}
                </button>
                <span className="wb-todo-main">
                  <span className="wb-todo-title" title={task.title}>
                    {task.title}
                  </span>
                  <span className="wb-todo-sub">
                    {task.projectName ?? '未挂项目'}
                    {task.category ? ` · ${task.category}` : ''}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </StateBlock>
    </div>
  );
}

/** 「日程」独立模块：只看今天的会（原来和待办挤在一块） */
export function TodayAgenda(): JSX.Element {
  const navigate = useNavigate();
  const today = todayShanghaiDate();
  const meetingsQuery = useQuery({
    queryKey: ['workbench', 'meetings', today],
    queryFn: () => listMeetings({ from: `${today}T00:00:00+08:00`, to: `${today}T23:59:59+08:00` }),
    staleTime: 60_000,
  });
  const meetings = meetingsQuery.data ?? [];

  return (
    <div className="wb-today-agenda-block">
      <div className="wb-today-head">
        <span className="wb-today-title">
          今天的会
          <span className="wb-today-count">{meetings.length}</span>
        </span>
        <Button type="link" size="small" onClick={() => void navigate('/calendar')}>
          去日历
        </Button>
      </div>
      <StateBlock
        loading={meetingsQuery.isPending}
        error={meetingsQuery.isError ? meetingsQuery.error : undefined}
        onRetry={() => void meetingsQuery.refetch()}
        isEmpty={meetings.length === 0}
        emptyText="今天没有会议"
        emptyHint="整块时间做点难的活"
      >
        <ul className="wb-agenda-list">
          {meetings.map((meeting) => (
            <li key={meeting.id} className="wb-agenda-item">
              <span className="wb-agenda-time">
                <ClockCircleOutlined /> {formatTimeOnly(meeting.startAt)}
              </span>
              <span className="wb-agenda-title" title={meeting.title}>
                {meeting.title}
              </span>
              <span className="wb-agenda-meta" title={meeting.location ?? ''}>
                {meeting.location ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      </StateBlock>
    </div>
  );
}
