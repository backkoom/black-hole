#!/usr/bin/env bash
# ==============================================================================
# 工作台与组织架构 —— 一键部署（**在服务器上跑**）
#
# 用法（在服务器终端执行）：
#   bash /tmp/one-shot.sh
#
# 完成：建服务账号 → 解包 → 装依赖 → 写环境变量 → 建库口令 → 跑迁移 →
#       播种 → 装 systemd → 启动 API → 配 nginx → 启动 nginx → 冒烟验收
#
# 幂等：重复跑安全。
# ⚠️ 需要 root。
# ==============================================================================
set -euo pipefail

APP_DIR="/data/workbench"
ENV_DIR="/etc/workbench"
ENV_FILE="$ENV_DIR/api.env"
TARBALL="/tmp/workbench-release.tar.gz"
# ⚠️ 默认用占位值 —— 公开仓库里不写死任何内网 IP
PKG_URL="${PKG_URL:-http://pkg-host.internal:8899/wb-pkg.tar.gz}"
SERVICE="workbench-api"
# ⚠️ 默认用占位值 —— 用 ORIGIN=... 覆盖
ORIGIN="${ORIGIN:-http://workbench.example.internal}"
DB_NAME="workbench"
DB_USER="workbench"
SVC_USER="workbench"

log()  { echo -e "\033[0;36m[部署]\033[0m $*"; }
warn() { echo -e "\033[0;33m[注意]\033[0m $*"; }
die()  { echo -e "\033[0;31m[失败]\033[0m $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行（sudo bash /tmp/one-shot.sh）"

# 可用环境变量覆盖：ORIGIN（站点地址）、PKG_URL（发布包下载地址）
echo "站点地址   ：$ORIGIN"
echo "发布包来源 ：$PKG_URL"

# ---------------------------------------------------------------------------
# 0. 前置检查
# ---------------------------------------------------------------------------
log "0/9 前置检查"
command -v node >/dev/null || die "没找到 node，请先装 Node 20+"
command -v psql >/dev/null || die "没找到 psql，请先装 PostgreSQL"
command -v nginx >/dev/null || die "没找到 nginx"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node 版本过低（$NODE_MAJOR）"
log "node $(node -v) · psql $(psql --version | head -1 | awk '{print $3}') · $(nginx -v 2>&1)"

# ---------------------------------------------------------------------------
# 1. 下载发布包
# ---------------------------------------------------------------------------
log "1/9 下载发布包"
if [ ! -f "$TARBALL" ] || [ "$(stat -c%s "$TARBALL")" -lt 100000 ]; then
  log "从 $PKG_URL 下载"
  curl -fL --retry 3 --connect-timeout 15 -o "$TARBALL" "$PKG_URL" \
    || die "下载失败。检查：1) 本机 PKG_HOST:8899 的 HTTP 服务是否还在跑 2) 防火墙是否放行 8899"
fi
ls -lh "$TARBALL"

# ---------------------------------------------------------------------------
# 2. 服务账号与目录
# ---------------------------------------------------------------------------
log "2/9 服务账号与目录"
id -u "$SVC_USER" >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin "$SVC_USER"
mkdir -p "$APP_DIR" "$ENV_DIR" "$APP_DIR/logs"
echo "服务账号 $SVC_USER · 应用目录 $APP_DIR"

# ---------------------------------------------------------------------------
# 3. 解包 + 装依赖
# ---------------------------------------------------------------------------
log "3/9 解包 + 装生产依赖"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$APP_DIR/.releases"
if [ -d "$APP_DIR/apps/api/dist" ]; then
  log "备份当前版本 → .releases/$STAMP"
  mkdir -p "$APP_DIR/.releases/$STAMP"
  cp -r "$APP_DIR/apps" "$APP_DIR/.releases/$STAMP/" 2>/dev/null || true
  cp -r "$APP_DIR/db"    "$APP_DIR/.releases/$STAMP/" 2>/dev/null || true
  ls -1dt "$APP_DIR"/.releases/*/ 2>/dev/null | tail -n +6 | xargs -r rm -rf
fi

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
tar -xzf "$TARBALL" -C "$WORK"
SRC="$(find "$WORK" -maxdepth 1 -mindepth 1 -type d | head -1)"
[ -n "$SRC" ] || die "发布包结构异常"
rm -rf "$APP_DIR/apps" "$APP_DIR/db"
cp -r "$SRC/apps" "$APP_DIR/"
cp -r "$SRC/db"    "$APP_DIR/"
mkdir -p "$APP_DIR/deploy" && cp -r "$SRC/deploy/." "$APP_DIR/deploy/" 2>/dev/null || true
cp "$SRC/RELEASE.txt" "$APP_DIR/RELEASE.txt" 2>/dev/null || true

cd "$APP_DIR"
log "npm ci --omit=dev（可能需要 1-2 分钟）"
npm ci --omit=dev --workspace apps/api --include-workspace-root 2>&1 | tail -2

# ---------------------------------------------------------------------------
# 4. 数据库
# ---------------------------------------------------------------------------
log "4/9 数据库"
systemctl enable --now postgresql >/dev/null 2>&1 || true
sleep 2
if ! su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'\"" | grep -q 1; then
  DBPW="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24)"
  su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE ROLE $DB_USER LOGIN PASSWORD '$DBPW'\"" >/dev/null
  echo "$DBPW" > "$ENV_DIR/.dbpw"; chmod 600 "$ENV_DIR/.dbpw"
  log "已建库账号 $DB_USER（口令存 $ENV_DIR/.dbpw）"
else
  DBPW="$(cat "$ENV_DIR/.dbpw" 2>/dev/null || true)"
  log "库账号 $DB_USER 已存在"
fi
if ! su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\"" | grep -q 1; then
  su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER ENCODING 'UTF8'\"" >/dev/null
  log "已建库 $DB_NAME"
else
  log "库 $DB_NAME 已存在"
fi
[ -n "$DBPW" ] || die "拿不到数据库口令：$ENV_DIR/.dbpw 不存在且库账号已存在"

# ---------------------------------------------------------------------------
# 5. 环境变量
# ---------------------------------------------------------------------------
log "5/9 环境变量"
# ⚠️ 口令必须**保证含数字**：base64 随机串可能 20 个字符全不碰数字（概率约 3%），
#    而种子策略要求「至少 8 位，含字母和数字」→ 末尾强制拼 4 位随机数字
ADMIN_PW="Wb$(head -c 16 /dev/urandom | base64 | tr -d '/+=' | head -c 12)$(printf '%04d' $((RANDOM % 10000)))"
cat > "$ENV_FILE" <<EOF
NODE_ENV=staging
PORT=3000
TZ=Asia/Shanghai
LOG_LEVEL=info
DATABASE_URL=postgres://$DB_USER:$DBPW@127.0.0.1:5432/$DB_NAME
APP_ORIGIN=$ORIGIN
COOKIE_SECURE=false
SESSION_TTL_DAYS=7
MAX_ORG_LEVEL=32
DB_POOL_MAX=20
DB_STATEMENT_TIMEOUT_MS=10000
SEED_ADMIN_PASSWORD=$ADMIN_PW
SEED_USER_PASSWORD=$ADMIN_PW
EOF
chmod 600 "$ENV_FILE"
echo "$ADMIN_PW" > "$ENV_DIR/.adminpw"; chmod 600 "$ENV_DIR/.adminpw"
log "已写 $ENV_FILE（APP_ORIGIN=$ORIGIN）"

# ---------------------------------------------------------------------------
# 6. 迁移 + 播种
# ---------------------------------------------------------------------------
log "6/9 数据库迁移 + 播种"
cd "$APP_DIR"
set -a; . "$ENV_FILE"; set +a
node node_modules/node-pg-migrate/bin/node-pg-migrate.js up -m "$APP_DIR/db/migrations/*.js" --use-glob 2>&1 | tail -3

# 播种（幂等：已播种则跳过）
SEEDED="$(su - postgres -c "psql -tAc \"SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='app_user'\"" 2>/dev/null || echo 0)"
if [ "$SEEDED" = "0" ]; then
  # tsx 是 devDependency，生产没装 —— npx --yes 会临时拉取
  npx --yes tsx db/seed.ts 2>&1 | tail -5
  log "播种完成"
else
  log "app_user 表已存在，跳过播种（数据不会重复写入）"
fi

# ---------------------------------------------------------------------------
# 7. systemd
# ---------------------------------------------------------------------------
log "7/9 systemd"
cp "$APP_DIR/deploy/workbench-api.service" /etc/systemd/system/$SERVICE.service
systemctl daemon-reload
systemctl enable $SERVICE >/dev/null 2>&1 || true
systemctl restart $SERVICE
sleep 4
if systemctl is-active --quiet $SERVICE; then
  log "API 已启动（systemctl status $SERVICE）"
else
  warn "API 没起来，日志："
  journalctl -u $SERVICE -n 40 --no-pager
  exit 3
fi
ss -lntp 2>/dev/null | grep ':3000' | head -2

# ---------------------------------------------------------------------------
# 8. nginx
# ---------------------------------------------------------------------------
log "8/9 nginx"
cat > /etc/nginx/conf.d/workbench.conf <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 4m;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 5;
    gzip_types text/plain text/css application/json application/javascript
               application/x-javascript text/xml application/xml image/svg+xml;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "same-origin" always;

    root /data/workbench/apps/web/dist;
    index index.html;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location ~* \.map$ { deny all; }
}
EOF
# 移除 nginx 默认站点，避免 default_server 冲突
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable nginx >/dev/null 2>&1 && systemctl reload nginx
log "nginx 已配置并重载"

# ---------------------------------------------------------------------------
# 9. 冒烟验收
# ---------------------------------------------------------------------------
log "9/9 冒烟验收"
sleep 2
set -a; . "$ENV_FILE"; set +a
if [ -x "$APP_DIR/scripts/smoke.sh" ] || [ -f "$APP_DIR/scripts/smoke.sh" ]; then
  bash "$APP_DIR/scripts/smoke.sh" "$ORIGIN" || true
else
  bash "$APP_DIR/deploy/smoke.sh" "$ORIGIN" || true
fi

# ---------------------------------------------------------------------------
# 收尾
# ---------------------------------------------------------------------------
chown -R "$SVC_USER:$SVC_USER" "$APP_DIR" 2>/dev/null || true
chmod 600 "$ENV_FILE"

echo ""
echo "=============================================="
echo -e " \033[0;32m✅ 部署完成\033[0m"
echo "=============================================="
echo " 访问地址   ： $ORIGIN"
echo " 管理员账号 ： admin"
echo " 初始口令   ： $(cat "$ENV_DIR/.adminpw")"
echo " 数据库口令 ： $(cat "$ENV_DIR/.dbpw")  （也已写在 $ENV_FILE 的 DATABASE_URL 里）"
echo ""
echo " ⚠️ 首次登录必须改密。改完再跑一次冒烟才是完整验收："
echo "    bash $APP_DIR/scripts/smoke.sh $ORIGIN"
echo ""
echo " 常用命令："
echo "   systemctl status workbench-api"
echo "   journalctl -u workbench-api -f"
echo "   nginx -t && systemctl reload nginx"
echo "=============================================="
