import type { Overview, TaskStats } from '@workbench/shared/types';
import { queryOne } from '../db.js';
import { thisWeekRange, todayString } from '../lib/serialize.js';

/**
 * 统计 —— 执行包 §6.4 的 33/34 号接口。
 *
 * 口径（§4.2 / openapi）：
 *  - todayTotal：due_date = 今天且未删除的任务数（**含已完成**）
 *  - todayDone：其中 status = done 的数量
 *  - doingTotal：status = doing 且未删除（**不含 todo**），不限日期
 *  - doingToday：doingTotal 中 due_date = 今天的数量
 *  - weeklyDone / weeklyTotal：本周应完成集合
 *    「未删除，due_date <= 本周日，且（未完成 或 done_at >= 本周一）」
 *    → **含上周逾期未完成**（due_date 在上周、还没完成），**排除上周已完成**（done_at 在上周）
 *  - weeklyRate：0–100 整数，四舍五入；分母为 0 时 null（前端显示「—」）
 *  - projectCount：活跃项目数（未删除且未完成）
 *
 * 全部按 Asia/Shanghai 计算（§3.4 / D-04）。
 * D-13：管理员可带 userId 查全员（12 万行聚合，必须有 statement_timeout —— db.ts 已配）。
 */

/**
 * @param userId 指定看某个人的数据；**undefined 表示全员**
 *   管理员不传 userId 时统计全员，与任务列表口径一致（否则卡片数字和表格对不上）。
 */
export async function getOverview(userId?: number): Promise<Overview> {
  const today = todayString();
  const { start, end } = thisWeekRange();

  const todayRow = await queryOne<{ total: string; done: string }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE status = 'done')::text AS done
       FROM task
      WHERE deleted_at IS NULL AND due_date = $1
        ${userId !== undefined ? 'AND user_id = $2' : ''}`,
    userId !== undefined ? [today, userId] : [today],
  );

  const doingRow = await queryOne<{ total: string; today: string }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE due_date = $1)::text AS today
       FROM task
      WHERE deleted_at IS NULL AND status = 'doing'
        ${userId !== undefined ? 'AND user_id = $2' : ''}`,
    userId !== undefined ? [today, userId] : [today],
  );

  const weeklyRow = await queryOne<{ done: string; total: string }>(
    `SELECT count(*) FILTER (WHERE status = 'done')::text AS done,
            count(*)::text AS total
       FROM task
      WHERE deleted_at IS NULL
        AND due_date <= $1
        AND (status <> 'done' OR done_at >= $2)
        ${userId !== undefined ? 'AND user_id = $3' : ''}`,
    userId !== undefined ? [end, start, userId] : [end, start],
  );

  const projectRow = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM (
         SELECT p.id,
                count(t.id) FILTER (WHERE t.deleted_at IS NULL) AS total,
                count(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.status = 'done') AS done
           FROM project p
           LEFT JOIN task t ON t.project_id = p.id
          WHERE p.deleted_at IS NULL
            ${userId !== undefined ? 'AND p.user_id = $1' : ''}
          GROUP BY p.id
       ) x
      WHERE x.total = 0 OR x.done < x.total`,
    userId !== undefined ? [userId] : [],
  );

  const weeklyDone = Number(weeklyRow?.done ?? 0);
  const weeklyTotal = Number(weeklyRow?.total ?? 0);

  return {
    todayTotal: Number(todayRow?.total ?? 0),
    todayDone: Number(todayRow?.done ?? 0),
    doingTotal: Number(doingRow?.total ?? 0),
    doingToday: Number(doingRow?.today ?? 0),
    weeklyDone,
    weeklyTotal,
    weeklyRate: weeklyTotal === 0 ? null : Math.round((weeklyDone / weeklyTotal) * 100),
    projectCount: Number(projectRow?.n ?? 0),
  };
}

export async function getTaskStats(userId?: number): Promise<TaskStats> {
  const row = await queryOne<{ todo: string; doing: string; done: string }>(
    `SELECT count(*) FILTER (WHERE status = 'todo')::text AS todo,
            count(*) FILTER (WHERE status = 'doing')::text AS doing,
            count(*) FILTER (WHERE status = 'done')::text AS done
       FROM task
      WHERE deleted_at IS NULL
        ${userId !== undefined ? 'AND user_id = $1' : ''}`,
    userId !== undefined ? [userId] : [],
  );
  return {
    todo: Number(row?.todo ?? 0),
    doing: Number(row?.doing ?? 0),
    done: Number(row?.done ?? 0),
  };
}
