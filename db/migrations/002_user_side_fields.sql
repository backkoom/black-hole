-- 用户端字段补齐 —— 2026-11-04
--
-- 背景：最终用户端的 10 个页面（总览/看板/任务/日程/进度/协作/文件/风险/统计/设置）
-- 需要任务有负责人/分类/提醒/子任务，项目有成员/阶段/图标色。
-- 管理员端（账号管理、组织架构、工作台模板）不受影响。
--
-- 全部向后兼容：新增列可空、新表独立，不动既有列。

-- 任务：负责人、分类、提醒时间、父任务（子任务计数用）
ALTER TABLE task
  ADD COLUMN IF NOT EXISTS assignee_id bigint REFERENCES app_user(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category varchar(32),
  ADD COLUMN IF NOT EXISTS reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS parent_id bigint REFERENCES task(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_assignee ON task (assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_parent ON task (parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_category ON task (category) WHERE deleted_at IS NULL;

-- 项目：图标、主题色、当前阶段
ALTER TABLE project
  ADD COLUMN IF NOT EXISTS icon varchar(16),
  ADD COLUMN IF NOT EXISTS color varchar(16),
  ADD COLUMN IF NOT EXISTS phase varchar(64);

-- 项目成员（多对多）
CREATE TABLE IF NOT EXISTS project_member (
  project_id bigint NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_member_user ON project_member (user_id);
