-- 011_task_detail —— 任务详情页（2026-11-19）
--
-- 目的：把「任务」做成枢纽，让会议 / 风险 / 随记 / 文件通过任务串起来。
--
--   1) task.source_type / source_id
--      记录任务从哪来（会议待办、风险处置、随记转化），可空 —— 日常杂事没有来源。
--   2) task_progress（新表）
--      任务进展记录，只增不改。解决现在「只有 todo/doing/done 三态、
--      不知道做到哪一步、卡在什么上」的问题。
--   3) file_asset.task_id
--      文件可挂到任务下；挂到任务的文件同时仍出现在「文件资料」模块
--      （一份实体、两个入口，不做两套存储）。

-- ---------- 1. 任务来源 ----------

ALTER TABLE task ADD COLUMN IF NOT EXISTS source_type varchar(20);
ALTER TABLE task ADD COLUMN IF NOT EXISTS source_id bigint;

ALTER TABLE task DROP CONSTRAINT IF EXISTS task_source_type_chk;
ALTER TABLE task ADD CONSTRAINT task_source_type_chk
  CHECK (source_type IS NULL OR source_type IN ('meeting', 'risk', 'idea'));

COMMENT ON COLUMN task.source_type IS
  '任务来源类型：meeting=会议待办 / risk=风险处置 / idea=随记转化；NULL=手动创建';
COMMENT ON COLUMN task.source_id IS
  '来源实体 id（按 source_type 解释；多态引用，不加外键）';

-- ---------- 2. 进展记录 ----------

CREATE TABLE IF NOT EXISTS task_progress (
  id         bigserial PRIMARY KEY,
  task_id    bigint      NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  user_id    bigint      NOT NULL REFERENCES app_user(id),
  content    text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_progress_task
  ON task_progress (task_id, created_at DESC);

COMMENT ON TABLE task_progress IS
  '任务进展记录：只增不改，按时间倒序展示，用于回答「做到哪了、卡在哪」';

-- ---------- 3. 文件挂任务 ----------

ALTER TABLE file_asset ADD COLUMN IF NOT EXISTS task_id bigint;

CREATE INDEX IF NOT EXISTS idx_file_asset_task
  ON file_asset (task_id) WHERE task_id IS NOT NULL;

COMMENT ON COLUMN file_asset.task_id IS
  '所属任务（可空）：上传到任务的文件同时出现在「文件资料」模块';
