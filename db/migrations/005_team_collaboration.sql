-- 2026-11-05 团队协作补全：公告 / 讨论 / 审批
--
-- 设计稿图6「团队协作」原本有四块：
--   团队公告 / 最近讨论 / 待我审批 / 会议纪要
-- 前面只做了「团队成员 + 角色分工 + 会议纪要」，这三块缺数据实体。
--
-- 公告 announcement：项目级或全局公告，可置顶
-- 讨论 discussion：挂在任务或项目上的讨论串（parent_id 支持回复）
-- 审批 approval  ：提交人 → 审批人 的审批流（待我审批 = assignee_id = 我）

CREATE TABLE IF NOT EXISTS announcement (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  project_id  bigint REFERENCES project(id) ON DELETE CASCADE,
  title       varchar(128) NOT NULL,
  content     text NOT NULL DEFAULT '',
  pinned      boolean NOT NULL DEFAULT false,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcement_user ON announcement (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_announcement_project ON announcement (project_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS discussion (
  id           bigserial PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  target_type  varchar(16) NOT NULL CHECK (target_type IN ('task', 'project')),
  target_id    bigint NOT NULL,
  parent_id    bigint REFERENCES discussion(id) ON DELETE CASCADE,
  content      text NOT NULL,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discussion_target ON discussion (target_type, target_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_discussion_parent ON discussion (parent_id);

CREATE TABLE IF NOT EXISTS approval (
  id           bigserial PRIMARY KEY,
  requester_id bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  assignee_id  bigint REFERENCES app_user(id) ON DELETE SET NULL,
  kind         varchar(32) NOT NULL DEFAULT 'general',
  title        varchar(128) NOT NULL,
  detail       text,
  target_type  varchar(16) CHECK (target_type IN ('task', 'project', NULL)),
  target_id    bigint,
  status       varchar(16) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  comment      text,
  decided_at   timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_assignee ON approval (assignee_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_approval_requester ON approval (requester_id, status) WHERE deleted_at IS NULL;
