-- 009_notification —— 站内通知（2026-11-08，D-28）
--
-- 二期 P2-C：任务到期 / 逾期 / 系统消息要能在顶栏看到红点，而不是只能靠人自己翻列表。
--
-- 设计要点：
--   1) 通知是"每人一条"，不是广播表 + 已读表 —— 这个规模（500 人）没必要做两表联查；
--   2) **dedupe_key 唯一**：同一个任务同一天只提醒一次，靠 ON CONFLICT DO NOTHING 幂等，
--      所以生成逻辑可以随时重跑（不依赖定时器是否刚好跑过一次）；
--   3) 生成时机用"读时补算"：用户拉通知列表时顺手扫一遍自己今天的到期/逾期任务，
--      不引入定时任务，也不会因为服务重启漏发。

CREATE TABLE IF NOT EXISTS notification (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind        varchar(32) NOT NULL CHECK (kind IN ('task_due', 'task_overdue', 'system')),
  title       varchar(200) NOT NULL,
  body        varchar(500),
  link        varchar(300),
  dedupe_key  varchar(120) NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);

-- 列表按"未读优先 + 时间倒序"取，这条索引直接覆盖
CREATE INDEX IF NOT EXISTS idx_notification_user ON notification (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_unread ON notification (user_id) WHERE read_at IS NULL;

COMMENT ON TABLE notification IS
  '站内通知：一人一条，dedupe_key 保证"同一任务同一天只提醒一次"，读时补算生成';
