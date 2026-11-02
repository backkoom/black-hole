-- ============================================================
-- 001_init.sql —— 工作台与组织架构
-- 来源：AI 开发执行包 §5「数据库 DDL（唯一基线）」
-- 基线：8 张表 / 索引 / CHECK。不含种子数据；种子在 db/seed.ts。
-- 与原文的唯一偏离：org.level 的 CHECK 由 1..3 放宽为 1..32，
-- 对应决策 D-07（组织层级数不设固定上限，业务上限走 MAX_ORG_LEVEL 环境变量）。
--
-- ⚠️ 本文件是 DDL 唯一基线，由同目录的 001_init.js 包装器读取执行（D-10）。
--    迁移命令带 --js，只加载 .js 迁移文件，本 .sql 不会被重复执行。
-- ============================================================

-- 8 tables. v2 calls the user table "user"; "user" is reserved in PostgreSQL.
-- This project uses app_user everywhere.

CREATE TABLE org (
  id          bigserial PRIMARY KEY,
  parent_id   bigint REFERENCES org(id),
  -- level 的硬边界只防脏数据（负数/异常深），不表达业务层级上限。
  -- 业务上限由环境变量 MAX_ORG_LEVEL 控制（默认 32），客户交付后可自行建到任意层级，
  -- 不需要改表、不需要数据迁移。见 docs/contracts/decisions.md D-07。
  level       smallint NOT NULL CHECK (level BETWEEN 1 AND 32),
  name        varchar(64) NOT NULL,
  path        text NOT NULL,
  sort        int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_org_parent ON org(parent_id);
CREATE INDEX idx_org_path ON org(path);
CREATE INDEX idx_org_sort ON org(sort);
CREATE UNIQUE INDEX uq_org_parent_name ON org (COALESCE(parent_id, 0), name);
CREATE UNIQUE INDEX uq_org_single_root ON org ((parent_id IS NULL)) WHERE parent_id IS NULL;

CREATE TABLE app_user (
  id                    bigserial PRIMARY KEY,
  account               varchar(64) NOT NULL UNIQUE,
  password_hash         text NOT NULL,
  name                  varchar(64) NOT NULL,
  org_id                bigint NOT NULL REFERENCES org(id),
  role                  varchar(16) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_super              boolean NOT NULL DEFAULT false,
  status                varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  must_change_password  boolean NOT NULL DEFAULT true,
  failed_attempts       int NOT NULL DEFAULT 0,
  locked_until          timestamptz,
  last_login_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_super OR role = 'admin')
);
CREATE INDEX idx_app_user_org ON app_user(org_id);
CREATE INDEX idx_app_user_role ON app_user(role);
CREATE INDEX idx_app_user_status ON app_user(status);

CREATE TABLE session (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       bigint NOT NULL REFERENCES app_user(id),
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  last_seen_at  timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_session_user ON session(user_id);
CREATE INDEX idx_session_expires ON session(expires_at);

CREATE TABLE workspace (
  id          bigserial PRIMARY KEY,
  user_id     bigint REFERENCES app_user(id),
  kind        varchar(16) NOT NULL CHECK (kind IN ('user', 'template')),
  name        varchar(128) NOT NULL DEFAULT '我的工作台',
  subtitle    varchar(256),
  version     int NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'user' AND user_id IS NOT NULL) OR
    (kind = 'template' AND user_id IS NULL)
  )
);
CREATE UNIQUE INDEX uq_workspace_user ON workspace(user_id) WHERE kind = 'user';
CREATE UNIQUE INDEX uq_workspace_template ON workspace(kind) WHERE kind = 'template';

CREATE TABLE workspace_layout (
  id            bigserial PRIMARY KEY,
  workspace_id  bigint NOT NULL REFERENCES workspace(id),
  module_key    varchar(32) NOT NULL,
  sort          int NOT NULL,
  w             smallint NOT NULL CHECK (w IN (3, 4, 6, 12)),
  h             smallint NOT NULL CHECK (h BETWEEN 2 AND 12),
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_layout_module
  ON workspace_layout(workspace_id, module_key)
  WHERE module_key <> 'divider';
CREATE INDEX idx_layout_workspace_sort ON workspace_layout(workspace_id, sort);

CREATE TABLE project (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES app_user(id),
  name        varchar(128) NOT NULL,
  owner       varchar(64),
  due_date    date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX idx_project_user ON project(user_id);
CREATE INDEX idx_project_created ON project(created_at);

CREATE TABLE task (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES app_user(id),
  project_id  bigint REFERENCES project(id),
  title       varchar(256) NOT NULL,
  status      varchar(16) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  priority    varchar(8) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date    date,
  done_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CHECK ((status = 'done') = (done_at IS NOT NULL))
);
CREATE INDEX idx_task_user_status_due ON task(user_id, status, due_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_task_project ON task(project_id) WHERE deleted_at IS NULL;

CREATE TABLE idea (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES app_user(id),
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX idx_idea_user_created ON idea(user_id, created_at);
