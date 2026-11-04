#!/usr/bin/env bash
# ==============================================================================
# workbench-api —— 安装脚本（**在服务器上跑**）
#
# 用法：
#   sudo bash install.sh --tarball /tmp/workbench-release-20261104-120000.tar.gz
#   sudo bash install.sh --tarball xxx.tar.gz --skip-migrate
#
# 幂等：重复执行安全。升级流程 = 解包新包 → 跑迁移 → 重启 → 冒烟。
#
# 备份：每次安装前把当前版本存到 /data/workbench/.releases/<时间戳>/，
#       出问题可按 deploy/README.md 的回滚步骤切回。
# ==============================================================================
set -euo pipefail

APP_DIR="/data/workbench"
RELEASE_DIR="$APP_DIR/.releases"
TARBALL=""
SKIP_MIGRATE=0
ENV_FILE="/etc/workbench/api.env"
SERVICE="workbench-api"

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
  if [ -f "$APP_DIR/node_modules/node-pg-migrate/bin/node-pg-migrate.js" ]; then
    node "$APP_DIR/node_modules/node-pg-migrate/bin/node-pg-migrate.js" up \
      -m "$APP_DIR/db/migrations/*.js" --use-glob
  else
    warn "node-pg-migrate 不在发布包里，跳过迁移（请在开发机跑 npm run migrate 后手动执行）"
  fi
fi

# ---------------------------------------------------------------------------
# 6. systemd
# ---------------------------------------------------------------------------
if command -v systemctl >/dev/null; then
  log "安装 systemd unit"
  cp "$APP_DIR/deploy/workbench-api.service" /etc/systemd/system/$SERVICE.service
  systemctl daemon-reload
  systemctl enable $SERVICE >/dev/null 2>&1 || true
  systemctl restart $SERVICE
  sleep 3
  if systemctl is-active --quiet $SERVICE; then
    log "服务已启动：systemctl status $SERVICE"
  else
    warn "服务没起来，看日志：journalctl -u $SERVICE -n 50 --no-pager"
    exit 3
  fi
else
  warn "没有 systemd，请手动启动：cd $APP_DIR/apps/api && node dist/server.js"
fi

# ---------------------------------------------------------------------------
# 7. 文件权限
# ---------------------------------------------------------------------------
if id workbench >/dev/null 2>&1; then
  chown -R workbench:workbench "$APP_DIR"
fi
mkdir -p "$APP_DIR/logs" && chmod 755 "$APP_DIR/logs"

log "✅ 安装完成"
echo ""
echo "下一步："
echo "  1) 配 nginx：cp $APP_DIR/deploy/nginx.conf.example /etc/nginx/conf.d/workbench.conf"
echo "  2) 改里面的域名/证书路径，nginx -t && systemctl reload nginx"
echo "  3) 冒烟验证：bash $APP_DIR/scripts/smoke.sh https://<你的域名>"
echo "  4) 首次播种：cd $APP_DIR && node --env-file=$ENV_FILE node_modules/.bin/tsx db/seed.ts"
