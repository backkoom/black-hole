-- 008_file_version —— 文件版本历史（2026-11-08，D-27）
--
-- 之前 file_asset 只有一列 version(varchar 'v1.0') 和一个没人用的 current_version 布尔，
-- 页面只展示，不能"上传新版本/回滚"。这次把版本做成**独立的表**：
--   file_version 一行 = 一个历史版本，各自指向一份磁盘实体
--   file_asset 始终指向"当前版本"的内容（storage_key/size/sha256 跟着切）
--
-- 为什么另建实体而不是原地覆盖：回滚要能拿回旧内容，覆盖掉就找不回来了。

CREATE TABLE IF NOT EXISTS file_version (
  id           bigserial PRIMARY KEY,
  file_id      bigint NOT NULL REFERENCES file_asset(id) ON DELETE CASCADE,
  version_no   integer NOT NULL CHECK (version_no > 0),
  storage_key  varchar(512) NOT NULL,
  size_bytes   bigint NOT NULL DEFAULT 0,
  mime_type    varchar(160),
  sha256       char(64),
  note         varchar(256),
  uploaded_by  bigint REFERENCES app_user(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_file_version_file ON file_version (file_id, version_no DESC);

-- file_asset 只需要记住"当前是第几版"，省得列表页为每个文件 count 一次
ALTER TABLE file_asset
  ADD COLUMN IF NOT EXISTS version_no integer NOT NULL DEFAULT 1;

COMMENT ON TABLE file_version IS
  '文件历史版本：一行一份磁盘实体，file_asset 指向其中当前版本；删除文件时级联删除（实体由应用层清）';
COMMENT ON COLUMN file_asset.version_no IS '当前版本号（从 1 开始），与 file_version.version_no 对应';

-- 回填：已有实体文件各算第 1 版
INSERT INTO file_version (file_id, version_no, storage_key, size_bytes, mime_type, sha256, uploaded_by, created_at)
SELECT f.id, 1, f.storage_key, f.size_bytes, f.mime_type, f.sha256, f.user_id, f.created_at
  FROM file_asset f
 WHERE f.storage_key IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM file_version v WHERE v.file_id = f.id);
