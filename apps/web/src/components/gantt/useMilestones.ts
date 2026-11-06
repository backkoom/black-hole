import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Milestone } from '@blackhole/shared/types';
import { listMilestones, scheduleKeys } from '../../api/schedule';

/**
 * 里程碑列表 —— 甘特图用它画菱形标记。
 *
 * 复用 api/schedule.ts 的封装（那里已经有 listMilestones / scheduleKeys.milestones），
 * 不再新写一份 api/milestones.ts：
 * - GET /api/milestones → { items: Milestone[] }
 * - 普通用户只看自己的（服务端强制），管理员不传 userId 即看全员；
 * - dueDate 是**日历日**（YYYY-MM-DD），缺失的里程碑无法定位，不参与绘制。
 */
export function useMilestones(): UseQueryResult<Milestone[]> {
  return useQuery({
    queryKey: scheduleKeys.milestones(),
    queryFn: () => listMilestones(),
    staleTime: 30_000,
  });
}
