import { App, Checkbox } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { listTasks, tasksKeys, updateTaskStatus } from '../../../api/tasks';
import { errorText } from '../../../api/messages';
import { ModuleEmpty, ModuleFailure, ModuleLoading, useModuleResource } from './ModuleShell';

/**
 * 今日待办模块 —— §7.5：
 * `GET /tasks?due=today&pageSize=50`，显示前 8 条；勾选完成走 `PATCH /tasks/:id/status`。
 */
export function TodoModule() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const resource = useModuleResource({
    queryKey: ['tasks', 'module', 'today'],
    queryFn: () => listTasks({ page: 1, pageSize: 50, due: 'today' }),
  });

  const toggle = useMutation({
    mutationFn: (input: { id: number; status: 'todo' | 'done' }) =>
      updateTaskStatus(input.id, input.status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  if (resource.status === 'loading') return <ModuleLoading />;
  if (resource.status === 'error') {
    return <ModuleFailure message={resource.message} onRetry={resource.retry} />;
  }

  const tasks = resource.data.items.slice(0, 8);
  if (tasks.length === 0) return <ModuleEmpty text="今天没有待办" />;

  return (
    <ul className="wb-todo-list">
      {tasks.map((task) => (
        <li key={task.id} className={task.status === 'done' ? 'is-done' : undefined}>
          <Checkbox
            checked={task.status === 'done'}
            disabled={toggle.isPending}
            onChange={(event) =>
              toggle.mutate({
                id: task.id,
                status: event.target.checked ? 'done' : 'todo',
              })
            }
          />
          <span className="wb-todo-title">{task.title}</span>
        </li>
      ))}
    </ul>
  );
}
