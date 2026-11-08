-- 010_project_start_date —— 项目开始日（2026-11-08，D-29）
--
-- 甘特图原来用 created_at → due_date 画条，于是"拖拽改期"只能改截止日，
-- 一拖就变成改工期，语义是错的。补一个真正的 start_date：
--   * 新建项目默认 = 今天；
--   * 历史项目回填 = created_at 的日期（与原来画出来的条完全一致，视觉不变）。

ALTER TABLE project ADD COLUMN IF NOT EXISTS start_date date;

UPDATE project SET start_date = created_at::date WHERE start_date IS NULL;

COMMENT ON COLUMN project.start_date IS
  '项目开始日：甘特条的左端，拖拽改期时与 due_date 一起平移；历史数据回填自 created_at';
