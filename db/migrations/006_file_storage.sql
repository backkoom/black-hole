-- 006_file_storage —— 文件资料支持真实上传/下载（2026-11-07）
--
-- 之前的 file_asset 只有元数据（名字/类型/大小），是给"文件清单"页撑门面的。
-- 现在要真存二进制，所以补三个字段。

ALTER TABLE file_asset
  ADD COLUMN IF NOT EXISTS storage_key varchar(512),
  ADD COLUMN IF NOT EXISTS mime_type   varchar(160),
  ADD COLUMN IF NOT EXISTS sha256      char(64);

COMMENT ON COLUMN file_asset.storage_key IS
  '相对存储根的路径（形如 2026/11/<uuid>.pdf）。NULL 表示只有登记信息、没有实际文件——历史数据就是这样';
COMMENT ON COLUMN file_asset.mime_type IS '上传时浏览器声明的类型；下载时原样回给浏览器';
COMMENT ON COLUMN file_asset.sha256 IS '内容摘要，用于校验落盘完整性，将来做秒传/去重';

-- 同一份内容重复上传时便于发现（不建唯一约束，允许同名多份）
CREATE INDEX IF NOT EXISTS idx_file_asset_sha256 ON file_asset (sha256) WHERE sha256 IS NOT NULL;
