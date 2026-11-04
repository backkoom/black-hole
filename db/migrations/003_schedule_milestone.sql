-- 2026-11-04 批次 2：日程时间段 + 里程碑
--
-- 用户端「日程安排」页要画时间轴（稿子图4 的「09:00-10:00 项目周会」），
-- 任务现在只有 due_date 一个日期点，画不出时间段 → 加 start_at。
--
-- 「项目里程碑」（稿子图5 的项目里程碑时间线）需要独立实体 → 建 milestone 表。
-- 里程碑属于项目，一个项目多条；也允许属于用户（没有项目时）。

ALTER TABLE task
  ADD COLUMN IF NOT EXISTS start_at timestamptz;

CREATE TABLE IF NOT EXISTS milestone (
  id          bigserial PRIMARY KEY,
  project_id  bigint REFERENCES project(id) ON DELETE CASCADE,
  user_id     bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name        varchar(128) NOT NULL,
  due_date    date,
  status      varchar(16) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'done')),
  sort        int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_milestone_project ON milestone (project_id);
CREATE INDEX IF NOT EXISTS idx_milestone_user ON milestone (user_id);

-- 会议（稿子图4 的「今日会议」、图6 的「会议纪要」）
CREATE TABLE IF NOT EXISTS meeting (
  id          bigserial PRIMARY KEY,
  project_id  bigint REFERENCES project(id) ON DELETE SET NULL,
  user_id     bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  title       varchar(128) NOT NULL,
  location    varchar(128),
  start_at    timestamptz NOT NULL,
  end_at      timestamptz,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_user_time ON meeting (user_id, start_at);
