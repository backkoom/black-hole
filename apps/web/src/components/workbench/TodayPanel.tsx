import { App as AntdApp, Button } from 'antd';
import { CheckOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Task } from '@blackhole/shared/types';
import { listTasks, updateTaskStatus } from '../../api/tasks';
import { listMeetings } from '../../api/schedule';
import { errorText } from '../../api/messages';
import { invalidateUserData } from '../../hooks/useInvalidate';
import { formatTimeOnly, todayShanghaiDate } from '../../utils/datetime';
import { StateBlock } from '../user/StateBlock';

/**
 * 「今天」面板（D-31）：待办 + 日程合并。
 *
 * 老六指出"今日待办跟今日日程功能重合" —— 它们确实是同一件事的两面：
 * 这一天的**事情**（有截止的）和这一天的**时间占用**（有约的）。
 * 所以并成一块，左待办右日程，一屏看完今天要干什么、几点被占。
 */
export function TodayPanel({ onAddTask }: { onAddTask: () => void }): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const today = todayShanghaiDate();

  const tasksQuery = useQuery({
    queryKey: ['workbench', 'today-tasks'],
    queryFn: () => listTasks({ page: 1, pageSize: 8, due: 'today' }),
    staleTime: 15_000,
  });
  const todayTasks = tasksQuery.data?.items ?? [];

  const meetingsQuery = useQuery({
    queryKey: ['workbench', 'meetings', today],
    queryFn: () => listMeetings({ from: `${today}T00:00:00+08:00`, to: `${today}T23:59:59+08:00` }),
    staleTime: 60_000,
  });
  const meetings = meetingsQuery.data ?? [];

  const statusMutation = useMutation({
    mutationFn: (input: { id: number; status: Task['status'] }) =>
      updateTaskStatus(input.id, input.status),
    onSuccess: async () => {
      await invalidateUserData(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['workbench'] });
    },
    onError: (err) => void message.error(errorText(err)),
  });

  const doneCount = todayTasks.filter((task) => task.status === 'done').length;

  return (
    <div className="wb-today">
      <div className="wb-today-col">
        <div className="wb-today-head">
          <span className="wb-today-title">
            待办
            <span className="wb-today-count">
              {doneCount}/{todayTasks.length}
            </span>
          </span>
          <Button type="link" size="small" onClick={onAddTask}>
            + 加一条
          </Button>
        </div>
        <StateBlock
          loading={tasksQuery.isPending}
          error={tasksQuery.isError ? tasksQuery.error : undefined}
          onRetry={() => void tasksQuery.refetch()}
          isEmpty={todayTasks.length === 0}
          emptyText="今天没有到期的任务"
          emptyHint="上面输入框写一句，回车就加进来"
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

      <div className="wb-today-col wb-today-agenda">
        <div className="wb-today-head">
          <span className="wb-today-title">
            日程
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
          emptyHint="整块时间可以做点难的活"
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
    </div>
  );
}
