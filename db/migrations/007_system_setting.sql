-- 007_system_setting —— 运行期可改的系统配置（2026-11-08）
--
-- 为什么放数据库而不是改 api.env：
--   api.env 是部署产物（600 权限、需要重启进程），而"备份目录/保留份数"这类
--   东西是运维在后台点两下就该生效的。放库里可以被超管在设置页直接改，
--   备份脚本每次运行时从库里读（读不到再回退 api.env），不需要重启任何服务。
--
-- ⚠️ 只存"能在线改"的项：密钥、数据库地址、证书路径这类仍然走环境变量。

CREATE TABLE IF NOT EXISTS system_setting (
  key         varchar(64) PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE system_setting IS '运行期可改的系统配置（键值对）；环境变量仍是默认值与兜底';
