#!/usr/bin/env bash
# ==============================================================================
# 恢复 —— 把一份备份导入到**指定库**。默认只允许导入演练库，覆盖生产必须显式 --force。
#
# 用法：
#   # ① 恢复演练（推荐每次都先这么跑一遍）
#   sudo bash deploy/restore.sh --dump /data/backups/blackhole/20261105-023000 \
#                               --to blackhole_drill
#   # 跑完核对：https://<host>/api/... 或下面脚本打印的行数
#
#   # ② 真回滚（会停服务）
#   sudo bash deploy/restore.sh --dump /data/backups/blackhole/20261105-023000 \
#                               --to blackhole --force
#
# 为什么默认不允许覆盖生产：pg_restore --clean 会先 DROP 再建，
# 打错库名就是一次真实数据丢失，不给「手滑」留机会。
#
# 退出码：0 = 成功
# ==============================================================================
set -euo pipefail

ENV_FILE=${ENV_FILE:-/etc/blackhole/api.env}
APP_DIR=${APP_DIR:-/data/blackhole}
SERVICE=${SERVICE:-blackhole-api}

DUMP_DIR=""
TARGET=""
FORCE=0
KEEP_DRILL=0

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
die() { printf '[%s] 失败：%s\n' "$(date '+%F %T')" "$*" >&2; exit 1; }

usage() {
  sed -n '3,18p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dump) DUMP_DIR=${2:-}; shift 2 ;;
    --to)   TARGET=${2:-};   shift 2 ;;
    --force) FORCE=1; shift ;;
    --keep-drill) KEEP_DRILL=1; shift ;;
    -h|--help) usage ;;
    *) die "不认识参数 $1（用 --help 看用法）" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "要 root（需读 $ENV_FILE、建库、可能停服务）"
[[ -n $DUMP_DIR ]] || die "缺 --dump"
[[ -n $TARGET ]] || die "缺 --to"
[[ -f $DUMP_DIR/db.dump ]] || die "$DUMP_DIR/db.dump 不存在（--dump 指向的是备份目录，不是单个文件）"

DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
[[ -n ${DATABASE_URL:-} ]] || die "$ENV_FILE 里没有 DATABASE_URL"
[[ $DATABASE_URL == *"?"* ]] && die "DATABASE_URL 带查询参数，本脚本不支持，请手工恢复"
[[ $DATABASE_URL != */* ]] && die "DATABASE_URL 解析不出库名"

APP_DB=${DATABASE_URL##*/}
DB_USER=$(printf '%s' "${DATABASE_URL#*://}" | cut -d: -f1)
TARGET_URL="${DATABASE_URL%/*}/$TARGET"

# --- 保护：目标就是生产库时，必须 --force ---
if [[ $TARGET == "$APP_DB" && $FORCE -ne 1 ]]; then
  cat >&2 <<EOF
拒绝执行：目标库 "$TARGET" 就是服务正在用的库。

如果你确实要覆盖它（真回滚），加 --force，并且先确认：
  1. 手上这份备份是想要的那一份（看过 $DUMP_DIR/manifest.txt）
  2. 已经另存了**当前**库的备份（bash deploy/backup.sh）
然后再跑：
  sudo bash deploy/restore.sh --dump $DUMP_DIR --to $TARGET --force
EOF
  exit 2
fi

log "备份文件：$DUMP_DIR"
log "目标库：$TARGET（属主 $DB_USER）"

# --- 1. 真回滚前先停服务，避免连接占用导致 DROP 失败 ---
if [[ $TARGET == "$APP_DB" ]]; then
  log "停止服务 $SERVICE …"
  systemctl stop "$SERVICE"
  trap 'systemctl start "'"$SERVICE"'" || true' EXIT
fi

# --- 2. 建库（已存在则先删，演练库可反复用）---
log "重建目标库…"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE IF EXISTS \"$TARGET\"" \
  -c "CREATE DATABASE \"$TARGET\" OWNER \"$DB_USER\""

# --- 3. 导入（dump 用了 --no-owner，所以属主是执行恢复的库用户）---
log "导入数据…"
pg_restore --dbname "$TARGET_URL" \
  --no-owner --no-privileges \
  --clean --if-exists \
  --exit-on-error \
  "$DUMP_DIR/db.dump"

# --- 4. 核对：关键表行数必须非零 ---
# 表名以 db/migrations 的实际建表为准（app_user / org / project / task），
# 写错表名会让演练假失败，所以这里的四张表是「空库不可能有」的最小集合。
log "核对行数…"
psql "$TARGET_URL" -At -F' ' -c "
  SELECT 'app_user', count(*) FROM app_user
  UNION ALL SELECT 'org',     count(*) FROM org
  UNION ALL SELECT 'project', count(*) FROM project
  UNION ALL SELECT 'task',    count(*) FROM task
  ORDER BY 1;
" | awk '{printf "  %-12s %s\n", $1, $2; if ($2+0 == 0) bad=1} END {exit bad ? 1 : 0}' \
  || die "有表是空的，这份备份不对，别急着上线"

# --- 5. 真回滚时把前端产物也换回去（可选，按需）---
if [[ $TARGET == "$APP_DB" && -f $DUMP_DIR/web.tar.gz ]]; then
  log "同步前端产物…"
  tar -xzf "$DUMP_DIR/web.tar.gz" -C "$APP_DIR"
  chown -R blackhole:blackhole "$APP_DIR/apps/web/dist" 2>/dev/null || true
fi

if [[ $TARGET == "$APP_DB" ]]; then
  log "启动服务…"
  systemctl start "$SERVICE"
  trap - EXIT
  sleep 2
  systemctl is-active --quiet "$SERVICE" || die "服务没起来，去看 journalctl -u $SERVICE -n 50"
  log "服务已恢复。建议接着跑：bash $APP_DIR/deploy/smoke.sh http://127.0.0.1"
else
  log "演练库 $TARGET 就绪。核对无误后可以删掉："
  log "  sudo -u postgres psql -c 'DROP DATABASE \"$TARGET\"'"
  if [[ $KEEP_DRILL -eq 0 ]]; then
    log "（本次已保留演练库；加 --keep-drill 只是明确表达保留）"
  fi
fi

log "完成"
