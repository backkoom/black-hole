#!/usr/bin/env bash
# ==============================================================================
# blackhole-api —— 安装脚本（**在服务器上跑**）
#
# 用法：
#   sudo bash install.sh --tarball /tmp/blackhole-release-20261104-120000.tar.gz
#   sudo bash install.sh --tarball xxx.tar.gz --skip-migrate
#
# 幂等：重复执行安全。升级流程 = 解包新包 → 跑迁移 → 重启 → 冒烟。
#
# 备份：每次安装前把当前版本存到 /data/blackhole/.releases/<时间戳>/，
#       出问题可按 deploy/README.md 的回滚步骤切回。
# ==============================================================================
set -euo pipefail

APP_DIR="/data/blackhole"
RELEASE_DIR="$APP_DIR/.releases"
TARBALL=""
SKIP_MIGRATE=0
ENV_FILE="/etc/blackhole/api.env"
SERVICE="blackhole-api"

log()  { echo -e "\033[0;36m[install]\033[0m $*"; }
warn() { echo -e "\033[0;33m[warn]\033[0m $*"; }
die()  { echo -e "\033[0;31m[fail]\033[0m $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --tarball) TARBALL="$2"; shift 2 ;;
    --skip-migrate) SKIP_MIGRATE=1; shift ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --dir) APP_DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
done

[ -n "$TARBALL" ] || die "必须用 --tarball 指定发布包"
[ -f "$TARBALL" ] || die "发布包不存在：$TARBALL"
[ "$(id -u)" -eq 0 ] || die "请用 sudo 运行"

command -v node >/dev/null || die "没找到 node，请先装 Node 20+"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node 版本过低（$NODE_MAJOR），需要 20+"

# ---------------------------------------------------------------------------
# 1. 备份当前版本
# ---------------------------------------------------------------------------
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RELEASE_DIR"
if [ -d "$APP_DIR/apps/api/dist" ]; then
  log "备份当前版本 → $RELEASE_DIR/$STAMP"
  mkdir -p "$RELEASE_DIR/$STAMP"
  cp -r "$APP_DIR/apps" "$RELEASE_DIR/$STAMP/" 2>/dev/null || true
  cp -r "$APP_DIR/db"    "$RELEASE_DIR/$STAMP/" 2>/dev/null || true
  # 只保留最近 5 个备份
  ls -1dt "$RELEASE_DIR"/*/ 2>/dev/null | tail -n +6 | xargs -r rm -rf
fi

# ---------------------------------------------------------------------------
# 2. 解包
# ---------------------------------------------------------------------------
log "解包 → $APP_DIR"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
tar -xzf "$TARBALL" -C "$WORK"
SRC="$(find "$WORK" -maxdepth 1 -mindepth 1 -type d | head -1)"
[ -n "$SRC" ] || die "发布包结构异常：找不到顶层目录"

# /data 是独立挂载盘，若不存在则创建（挂载点通常已存在，父目录需要建）
mkdir -p "$(dirname "$APP_DIR")" "$APP_DIR"
rm -rf "$APP_DIR/apps" "$APP_DIR/db"
cp -r "$SRC/apps" "$APP_DIR/"
cp -r "$SRC/db"    "$APP_DIR/"
# ⚠️ package.json / package-lock.json / packages 必须跟 apps 一起换。
#    2026-11-06 踩过：只换 apps/ 时，新依赖（solarlunar）写进了 apps/web/package.json，
#    但根目录 lock 还是旧的 → `npm ci` 直接报 "Missing: solarlunar@3.1.0 from lock file"
#    并中止安装（set -euo pipefail 生效，不会静默继续）。
cp "$SRC/package.json" "$APP_DIR/package.json"
if [ -f "$SRC/package-lock.json" ]; then
  cp "$SRC/package-lock.json" "$APP_DIR/package-lock.json"
else
  warn "发布包里没有 package-lock.json —— 后面 npm ci 会失败"
fi
# packages/shared 是 apps/api 的运行时依赖（node_modules/@blackhole/shared 软链指向它）
if [ -d "$SRC/packages" ]; then
  rm -rf "$APP_DIR/packages"
  cp -r "$SRC/packages" "$APP_DIR/packages"
fi
mkdir -p "$APP_DIR/deploy"
cp -r "$SRC/deploy/." "$APP_DIR/deploy/" 2>/dev/null || true
cp "$SRC/RELEASE.txt" "$APP_DIR/RELEASE.txt" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 3. 生产依赖
# ---------------------------------------------------------------------------
log "安装生产依赖（npm ci --omit=dev）"
cd "$APP_DIR"
# package.json 里的 workspaces 指向 apps/*，服务端只需要 api 的依赖
if [ -f package-lock.json ] && [ -f apps/api/package.json ]; then
  npm ci --omit=dev --workspace apps/api --include-workspace-root 2>&1 | tail -3
else
  warn "没有 lock 文件，跳过依赖安装（可能缺运行时依赖）"
fi

# ---------------------------------------------------------------------------
# 4. 环境变量
# ---------------------------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  log "创建环境变量文件：$ENV_FILE（首次安装，需手动填真实值）"
  mkdir -p "$(dirname "$ENV_FILE")"
  if [ -f "$APP_DIR/deploy/env.production.example" ]; then
    cp "$APP_DIR/deploy/env.production.example" "$ENV_FILE"
  else
    die "找不到 env.production.example，无法生成 $ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
  warn "⚠️  请编辑 $ENV_FILE 填真实值（DATABASE_URL / APP_ORIGIN / 口令）后重跑本脚本"
  exit 2
fi
chmod 600 "$ENV_FILE"

# ---------------------------------------------------------------------------
# 5. 数据库迁移
# ---------------------------------------------------------------------------
if [ "$SKIP_MIGRATE" -eq 1 ]; then
  warn "跳过数据库迁移（--skip-migrate）"
else
  log "跑数据库迁移"
  cd "$APP_DIR"
  set -a; . "$ENV_FILE"; set +a
  # 迁移工具在 apps/api 的生产依赖里（npm ci --workspace apps/api 会装它）。
  # 万一缺失则退到全局安装 —— 迁移是部署的硬前提，不能跳过。
  MIGRATE_BIN="$APP_DIR/apps/api/node_modules/node-pg-migrate/bin/node-pg-migrate.js"
  if [ ! -f "$MIGRATE_BIN" ]; then
    log "迁移工具不在包里，全局安装"
    npm i -g node-pg-migrate >/dev/null 2>&1 || true
    MIGRATE_BIN="$(command -v node-pg-migrate 2>/dev/null || true)"
  fi
  if [ -n "$MIGRATE_BIN" ] && [ -f "$MIGRATE_BIN" ]; then
    node "$MIGRATE_BIN" up -m "$APP_DIR/db/migrations/*.js" --use-glob
  elif command -v node-pg-migrate >/dev/null 2>&1; then
    node-pg-migrate up -m "$APP_DIR/db/migrations/*.js" --use-glob
  else
    # ⚠️ 迁移是硬前提 —— 跳过它继续启动，后面全是「表不存在」的玄学错误。
    die "迁移工具不可用（既不在 apps/api/node_modules，全局安装也失败）。请手动执行迁移后重跑"
  fi
fi

# ---------------------------------------------------------------------------
# 6. systemd
# ---------------------------------------------------------------------------
if command -v systemctl >/dev/null; then
  log "安装 systemd unit"
  cp "$APP_DIR/deploy/blackhole-api.service" /etc/systemd/system/$SERVICE.service
  # 多实例（L1）用的模板单元：存在就一起更新，不存在也无所谓
  if [ -f "$APP_DIR/deploy/blackhole-api@.service" ]; then
    cp "$APP_DIR/deploy/blackhole-api@.service" /etc/systemd/system/
  fi
  systemctl daemon-reload

  # 判断是不是「多实例（L1）」模式：有 blackhole-api@*.service 在跑就是
  if systemctl list-units --type=service --state=running --no-legend 'blackhole-api@*.service' 2>/dev/null | grep -q .; then
    L1=1
  else
    L1=0
  fi

  if [ "$L1" -eq 0 ]; then
    systemctl enable $SERVICE >/dev/null 2>&1 || true
    systemctl restart $SERVICE
  else
    log "检测到多实例在跑（blackhole-api@*），跳过单实例单元"
    for unit in $(systemctl list-units --type=service --state=running --no-legend 'blackhole-api@*.service' | awk '{print $1}'); do
      log "重启多实例：$unit"
      systemctl restart "$unit" || warn "$unit 重启失败"
    done
  fi

  sleep 3
  if [ "$L1" -eq 0 ]; then
    if systemctl is-active --quiet $SERVICE; then
      log "服务已启动：systemctl status $SERVICE"
    else
      warn "服务没起来，看日志：journalctl -u $SERVICE -n 50 --no-pager"
      exit 3
    fi
  else
    alive=$(systemctl list-units --type=service --state=running --no-legend 'blackhole-api@*.service' | wc -l)
    if [ "$alive" -ge 1 ]; then
      log "多实例运行中：$alive 个（nginx 反代 3001/3002）"
    else
      warn "多实例一个都没起来，看日志：journalctl -u blackhole-api@3001 -n 50"
      exit 3
    fi
  fi
else
  warn "没有 systemd，请手动启动：cd $APP_DIR/apps/api && node dist/server.js"
fi

# ---------------------------------------------------------------------------
# 7. 文件权限
# ---------------------------------------------------------------------------
if id blackhole >/dev/null 2>&1; then
  chown -R blackhole:blackhole "$APP_DIR"
fi
mkdir -p "$APP_DIR/logs" && chmod 755 "$APP_DIR/logs"

log "✅ 安装完成"
echo ""
echo "下一步："
echo "  1) 配 nginx：cp $APP_DIR/deploy/nginx.conf.example /etc/nginx/conf.d/blackhole.conf"
echo "  2) 改里面的域名/证书路径，nginx -t && systemctl reload nginx"
echo "  3) 冒烟验证：bash $APP_DIR/scripts/smoke.sh https://<你的域名>"
echo "  4) 首次播种：cd $APP_DIR && node --env-file=$ENV_FILE node_modules/.bin/tsx db/seed.ts"
