import type {
  Overview,
  TaskStats,
  TrendPoint,
  TrendResult,
} from '@workbench/shared/types';
import { query, queryOne } from '../db.js';
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

/**
 * 任务完成趋势（用户端「数据统计」页）—— 按 created_at 落桶。
 *
 * @param days 统计天数，默认 7
 * 每天：total = 当天创建的任务数，done = 其中已完成数，pending = 未完成数
 */
export async function getTrend(days = 7, userId?: number): Promise<TrendResult> {
  const n = Math.max(1, Math.min(90, days));
  const rows = await query<{ day: string; total: string; done: string }>(
    `SELECT to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS day,
            count(*)::text AS total,
            count(*) FILTER (WHERE status = 'done')::text AS done
       FROM task
      WHERE deleted_at IS NULL
        AND created_at >= now() - ($1 || ' days')::interval
        ${userId !== undefined ? 'AND user_id = $2' : ''}
      GROUP BY 1`,
    userId !== undefined ? [String(n), userId] : [String(n)],
  );

  const map = new Map(rows.map((r) => [r.day, { total: Number(r.total), done: Number(r.done) }]));
  const out: TrendPoint[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000 + 8 * 3600 * 1000);
    const key = d.toISOString().slice(0, 10);
    const hit = map.get(key);
    const total = hit?.total ?? 0;
    const done = hit?.done ?? 0;
    out.push({
      date: key,
      label: `${key.slice(5, 7)}/${key.slice(8, 10)}`,
      total,
      done,
      pending: total - done,
    });
  }
  return { days: out };
}

/** 项目进度分布（按 progress 分桶） */
export async function getProgressDistribution(userId?: number): Promise<{
  buckets: Array<{ label: string; count: number }>;
}> {
  const rows = await query<{ bucket: string; count: string }>(
    `SELECT CASE
              WHEN total = 0 THEN '0-20%'
              WHEN progress < 21 THEN '0-20%'
              WHEN progress < 51 THEN '21-50%'
              WHEN progress < 81 THEN '51-80%'
              WHEN progress < 100 THEN '81-99%'
              ELSE '100%' END AS bucket,
            count(*)::text AS count
       FROM (
         SELECT p.id,
                count(t.id) FILTER (WHERE t.deleted_at IS NULL) AS total,
                CASE WHEN count(t.id) FILTER (WHERE t.deleted_at IS NULL) = 0 THEN 0
                     ELSE round(count(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.status = 'done') * 100.0
                           / count(t.id) FILTER (WHERE t.deleted_at IS NULL))::int
                END AS progress
           FROM project p
           LEFT JOIN task t ON t.project_id = p.id
          WHERE p.deleted_at IS NULL
            ${userId !== undefined ? 'AND p.user_id = $1' : ''}
          GROUP BY p.id
       ) x
      GROUP BY 1`,
    userId !== undefined ? [userId] : [],
  );

  const order = ['0-20%', '21-50%', '51-80%', '81-99%', '100%'];
  const map = new Map(rows.map((r) => [r.bucket, Number(r.count)]));
  return { buckets: order.map((label) => ({ label, count: map.get(label) ?? 0 })) };
}

/** 任务分类分布（category 为空的归「未分类」） */
export async function getCategoryDistribution(userId?: number): Promise<{
  categories: Array<{ name: string; count: number; done: number }>;
}> {
  const rows = await query<{ name: string; count: string; done: string }>(
    `SELECT COALESCE(category, '未分类') AS name,
            count(*)::text AS count,
            count(*) FILTER (WHERE status = 'done')::text AS done
       FROM task
      WHERE deleted_at IS NULL
        ${userId !== undefined ? 'AND user_id = $1' : ''}
      GROUP BY 1
      ORDER BY count(*) DESC
      LIMIT 12`,
    userId !== undefined ? [userId] : [],
  );
  return {
    categories: rows.map((r) => ({
      name: r.name,
      count: Number(r.count),
      done: Number(r.done),
    })),
  };
}

/** 团队工作量（按负责人聚合） */
export async function getTeamWorkload(userId?: number): Promise<{
  members: Array<{ userId: number; name: string; taskCount: number; doneCount: number; rate: number }>;
}> {
  const rows = await query<{
    user_id: number;
    name: string;
    task_count: string;
    done_count: string;
  }>(
    `SELECT t.assignee_id AS user_id, u.name,
            count(*)::text AS task_count,
            count(*) FILTER (WHERE t.status = 'done')::text AS done_count
       FROM task t
       JOIN app_user u ON u.id = t.assignee_id
      WHERE t.deleted_at IS NULL
        ${userId !== undefined ? 'AND t.user_id = $1' : ''}
      GROUP BY t.assignee_id, u.name
      ORDER BY count(*) DESC`,
    userId !== undefined ? [userId] : [],
  );
  return {
    members: rows.map((r) => {
      const taskCount = Number(r.task_count);
      const doneCount = Number(r.done_count);
      return {
        userId: Number(r.user_id),
        name: r.name,
        taskCount,
        doneCount,
        rate: taskCount === 0 ? 0 : Math.round((doneCount / taskCount) * 100),
      };
    }),
  };
}
