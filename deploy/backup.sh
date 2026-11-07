#!/usr/bin/env bash
# ==============================================================================
# 备份 —— 数据库 + 前端产物 + 环境变量 + 清单
#
# 用法：
#   sudo bash deploy/backup.sh                 # 备份到 /data/backups/blackhole
#   sudo bash deploy/backup.sh /mnt/nas/wb     # 备份到别的盘（推荐异地/另一块盘）
#
# 环境变量：
#   ENV_FILE=/etc/blackhole/api.env   服务环境变量（里面有 DATABASE_URL 与种子口令）
#   APP_DIR=/data/blackhole           安装目录
#   KEEP=14                           保留最近多少份
#
# 产出（同一次备份共用一个时间戳）：
#   db-<时间戳>.dump      pg_dump 自定义格式（已压缩，pg_restore 直接读）
#   web-<时间戳>.tar.gz   前端产物 apps/web/dist + RELEASE.txt
#   env-<时间戳>.bak      环境变量（含口令，权限 600，别外传）
#   manifest-<时间戳>.txt 大小 / SHA256 / 版本 / 各表行数
#
# 退出码：0 = 成功；非 0 = 失败（systemd timer 靠这个报错）
# ==============================================================================
set -euo pipefail

ENV_FILE=${ENV_FILE:-/etc/blackhole/api.env}
APP_DIR=${APP_DIR:-/data/blackhole}

# --- 三个可配置项（写在 /etc/blackhole/api.env 里，由 systemd EnvironmentFile 注入）---
#   BACKUP_DIR      备份落到哪（本地目录 / 已挂载的 NAS 路径）
#   BACKUP_KEEP     保留多少份（按时间戳目录，超出删最旧的）
#   BACKUP_ENABLED  是否允许定时任务跑；false 时脚本直接退出 0（timer 不会报红）
#
# 优先级：命令行参数 > 环境变量 > 默认值。
# ⚠️ 2026-11-06 之前只认位置参数，README 里写的 Environment= 其实不生效，已修。
DEST=${1:-${BACKUP_DIR:-${DEST:-/data/backups/blackhole}}}
KEEP=${BACKUP_KEEP:-${KEEP:-14}}
ENABLED=${BACKUP_ENABLED:-true}

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
die() { printf '[%s] 失败：%s\n' "$(date '+%F %T')" "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "要 root（需读 $ENV_FILE 与 $APP_DIR）"

# 关闭开关：显式 false/0/no/off 时安静退出（退出码 0，避免 timer 天天报失败）
case "${ENABLED,,}" in
  false|0|no|off)
    printf '[%s] 备份已关闭（BACKUP_ENABLED=%s），跳过\n' "$(date '+%F %T')" "$ENABLED"
    exit 0
    ;;
esac

[[ -r $ENV_FILE ]] || die "读不到 $ENV_FILE"
[[ -d $APP_DIR ]] || die "找不到安装目录 $APP_DIR"

# --- 从服务环境变量里取连接串（不打印，避免口令进日志）---
DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
[[ -n ${DATABASE_URL:-} ]] || die "$ENV_FILE 里没有 DATABASE_URL"

STAMP=$(date +%Y%m%d-%H%M%S)
# 每次备份一个独立子目录，避免 db/web/env 三个文件在保留策略里被拆散
WORK="$DEST/$STAMP"
mkdir -p "$WORK"
chmod 700 "$DEST" "$WORK"

log "备份开始 → $WORK（保留 ${KEEP} 份）"

# --- 1. 数据库 ---
log "导出数据库…"
pg_dump "$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file "$WORK/db.dump"

# 校验：pg_dump 偶尔会因为连接中断写出半截文件，必须读一遍目录项
TOC=$(pg_restore --list "$WORK/db.dump" | grep -c '^[0-9]' || true)
[[ ${TOC:-0} -gt 0 ]] || die "dump 校验失败（pg_restore --list 读不出条目）"
log "数据库 OK（$TOC 个对象）"

# --- 2. 前端产物 + 版本标记 ---
log "打包前端产物…"
TAR_ARGS=(-czf "$WORK/web.tar.gz" -C "$APP_DIR")
[[ -f "$APP_DIR/RELEASE.txt" ]] && TAR_ARGS+=(RELEASE.txt)
[[ -d "$APP_DIR/apps/web/dist" ]] && TAR_ARGS+=(apps/web/dist)
tar "${TAR_ARGS[@]}"
log "前端产物 OK（$(du -h "$WORK/web.tar.gz" | cut -f1)）"

# --- 3. 环境变量（含口令）---
install -m 600 "$ENV_FILE" "$WORK/env.bak"
log "环境变量 OK（权限 600，含口令，外传前先脱敏）"

# --- 4. 清单 ---
{
  echo "备份时间: $(date '+%F %T %Z')"
  echo "主机: $(hostname)"
  echo "版本: $(cat "$APP_DIR/RELEASE.txt" 2>/dev/null | head -1 || echo '未知')"
  echo "数据库: $(printf '%s' "$DATABASE_URL" | sed -E 's#(://[^:]+:)[^@]+@#\1***@#')"
  echo
  echo "== 文件 =="
  ( cd "$WORK" && sha256sum db.dump web.tar.gz env.bak )
  echo
  echo "== 各表行数 =="
  psql "$DATABASE_URL" -At -F' ' -c "
    SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;
  " | awk '{printf "%-28s %s\n", $1, $2}'
} > "$WORK/manifest.txt"

log "清单 OK"
echo "----------------------------------------"
cat "$WORK/manifest.txt"
echo "----------------------------------------"

# --- 5. 保留策略：只留最近 KEEP 份 ---
# 按目录名（时间戳）倒序，超出部分整目录删掉，三件套不会错配
mapfile -t OLD < <(ls -1d "$DEST"/*/ 2>/dev/null | sort -r | tail -n +$((KEEP + 1)))
for d in "${OLD[@]:-}"; do
  [[ -n ${d:-} ]] || continue
  log "清理旧备份 $(basename "$d")"
  rm -rf "$d"
done

log "备份完成，当前保留 $(ls -1d "$DEST"/*/ 2>/dev/null | wc -l) 份（上限 $KEEP）"
