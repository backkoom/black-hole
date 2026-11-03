import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTasks } from '../../../api/tasks';
import { currentWeekDates, toCalendarDate, weekdayLabel } from '../../../utils/datetime';
import { ModuleEmpty, ModuleFailure, ModuleLoading, useModuleResource } from './ModuleShell';

/**
 * 日历模块 —— §7.5：
 * `GET /tasks?due=week&pageSize=100`，本周 7 天列表/周视图；**不做月视图**；点击日期跳 `/tasks?due=week`。
 *
 * 本周的 7 天按东八区算，与服务端 `due=week` 的筛选口径一致（周一至周日）。
 */
export function CalendarModule() {
  const navigate = useNavigate();
  const days = useMemo(() => currentWeekDates(), []);
  const resource = useModuleResource({
    queryKey: ['tasks', 'module', 'week'],
    queryFn: () => listTasks({ page: 1, pageSize: 100, due: 'week' }),
  });

  if (resource.status === 'loading') return <ModuleLoading />;
  if (resource.status === 'error') {
    return <ModuleFailure message={resource.message} onRetry={resource.retry} />;
  }

  const byDate = new Map<string, string[]>();
  for (const task of resource.data.items) {
    // 接口的 dueDate 可能是 ISO 时间戳，统一归一化成 YYYY-MM-DD 再分组
    const date = toCalendarDate(task.dueDate);
    if (!date) continue;
    const list = byDate.get(date);
    if (list) list.push(task.title);
    else byDate.set(date, [task.title]);
  }

  const total = resource.data.items.length;
  if (total === 0) return <ModuleEmpty text="本周没有任务" />;

  return (
    <ul className="wb-calendar-list">
      {days.map((date) => {
        const titles = byDate.get(date) ?? [];
        return (
          <li key={date} className="wb-calendar-day">
            <button
              type="button"
              className="wb-calendar-date"
              onClick={() => navigate('/tasks?due=week')}
            >
              <span className="wb-calendar-weekday">{weekdayLabel(date)}</span>
              <span className="wb-calendar-daynum">{date.slice(5)}</span>
            </button>
            {titles.length > 0 ? (
              <span className="wb-calendar-tasks">{titles.join('、')}</span>
            ) : (
              <span className="wb-calendar-tasks is-empty">无</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
