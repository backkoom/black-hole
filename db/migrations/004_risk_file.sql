-- 2026-11-04 批次 3：风险与问题
--
-- 设计稿图8「风险问题管理」：
--  - 风险（risk）与问题（issue）两类，字段基本一致 → 一张表用 kind 区分
--  - 风险等级 low/medium/high；影响度 impact；发生概率 probability
--  - 处理状态 open（待处理）/ handling（处理中）/ resolved（已解决）
--  - 风险应对计划 response_plan
--
-- 文件资料（稿子图7）本期只做**文件清单与元数据**，不存二进制 → 需要 file_asset 表。

CREATE TABLE IF NOT EXISTS risk (
  id            bigserial PRIMARY KEY,
  project_id    bigint REFERENCES project(id) ON DELETE CASCADE,
  user_id       bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  code          varchar(32),
  kind          varchar(16) NOT NULL DEFAULT 'risk'
                  CHECK (kind IN ('risk', 'issue')),
  title         varchar(256) NOT NULL,
  description   text,
  level         varchar(16) NOT NULL DEFAULT 'medium'
                  CHECK (level IN ('low', 'medium', 'high')),
  impact        varchar(16) CHECK (impact IN ('low', 'medium', 'high')),
  probability   varchar(16) CHECK (probability IN ('low', 'medium', 'high')),
  status        varchar(16) NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'handling', 'resolved')),
  owner_id      bigint REFERENCES app_user(id) ON DELETE SET NULL,
  due_date      date,
  response_plan text,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_user ON risk (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_risk_project ON risk (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_risk_status ON risk (status) WHERE deleted_at IS NULL;

-- 文件资料：只存元数据（文件名/类型/大小/上传人/版本），二进制后面接对象存储
-- ⚠️ 建表顺序有依赖：file_asset.folder_id 引用 file_folder.id，folder 必须先建

CREATE TABLE IF NOT EXISTS file_folder (
  id            bigserial PRIMARY KEY,
  project_id    bigint REFERENCES project(id) ON DELETE CASCADE,
  user_id       bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  parent_id     bigint REFERENCES file_folder(id) ON DELETE CASCADE,
  name          varchar(128) NOT NULL,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS file_asset (
  id            bigserial PRIMARY KEY,
  project_id    bigint REFERENCES project(id) ON DELETE CASCADE,
  user_id       bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  folder_id     bigint REFERENCES file_folder(id) ON DELETE SET NULL,
  name          varchar(256) NOT NULL,
  kind          varchar(32) NOT NULL DEFAULT 'other'
                  CHECK (kind IN ('doc', 'sheet', 'slide', 'image', 'pdf', 'archive', 'other')),
  size_bytes    bigint NOT NULL DEFAULT 0,
  version       varchar(16) NOT NULL DEFAULT 'v1.0',
  current_version boolean NOT NULL DEFAULT true,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_asset_folder ON file_asset (folder_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_file_folder_parent ON file_folder (parent_id) WHERE deleted_at IS NULL;
