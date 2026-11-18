#!/usr/bin/env bash
# ==============================================================================
# 部署后冒烟验证 —— 逐项检查，输出明确的通过/失败
#
# 用法：
#   bash scripts/smoke.sh https://blackhole.example.internal
#   bash scripts/smoke.sh http://127.0.0.1:3000 --direct   # 直连 API，不走 nginx
#
# 退出码：0 = 全通过；1 = 有失败项
# ==============================================================================
set -uo pipefail

BASE="${1:-http://127.0.0.1:3000}"
DIRECT=0
# Origin 必须与服务的 APP_ORIGIN 一致，否则 API 会返回 403「请求来源不被信任」。
# 默认用 BASE；直连 API 时通常要显式传 --origin。
ORIGIN="$BASE"
# 自签证书环境下 curl 会因证书不受信任失败（exit 60），加 --insecure 跳过校验。
# 正式证书环境**不要**带这个参数，否则等于把 TLS 校验关掉了。
TLS=""
for arg in "$@"; do
  case "$arg" in
    --direct) DIRECT=1 ;;
    --origin=*) ORIGIN="${arg#--origin=}" ;;
    --insecure) TLS="-k" ;;
  esac
done

PASS=0
FAIL=0
MUST_CHANGE_FLAG=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 管理员专属接口：普通账号访问返回 403 属预期（权限拦截生效）
is_admin_only() {
  case "$1" in
    /api/users*|/api/org/tree) return 0 ;;
    *) return 1 ;;
  esac
}

ok()   { echo -e "  \033[0;32m✓\033[0m $*"; PASS=$((PASS+1)); }
bad()  { echo -e "  \033[0;31m✗\033[0m $*"; FAIL=$((FAIL+1)); }
info() { echo -e "  \033[0;90m·\033[0m $*"; }
warn() { echo -e "  \033[0;33m!\033[0m $*"; }

echo "=============================================="
echo " Black Hole —— 部署冒烟验证"
echo " 目标：$BASE"
echo " Origin：$ORIGIN"
echo "=============================================="

# --- 1. 站点可达 ---
echo ""
echo "[1/6] 站点可达性"
if [ "$DIRECT" -eq 1 ]; then
  info "--direct 模式：API 不托管前端（生产由 nginx 托管），跳过首页检查"
else
  code="$(curl -sS $TLS -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/" 2>/dev/null)"
  if [ "$code" = "200" ]; then ok "首页 HTTP 200"; else bad "首页 HTTP $code"; fi
fi

# --- 2. 未登录应 401 ---
echo ""
echo "[2/6] 鉴权拦截"
code="$(curl -sS $TLS -o "$TMP/auth.json" -w '%{http_code}' --max-time 15 "$BASE/api/auth/me" 2>/dev/null)"
if [ "$code" = "401" ]; then ok "未登录访问 /api/auth/me 返回 401"; else bad "期望 401，实际 $code"; fi

# --- 3. 登录 ---
echo ""
echo "[3/6] 登录与会话"
ADMIN_PW="${SEED_ADMIN_PASSWORD:-}"
# 登录账号：默认 admin；验收时可指向专用账号（避免动 admin 的初始改密状态）
ACCOUNT="${SMOKE_ACCOUNT:-admin}"
# 登录账号：默认 admin；验收时可指向专用账号（避免动 admin 的初始改密状态）
ACCOUNT="${SMOKE_ACCOUNT:-admin}"
# 口令优先从文件读（SEED_ADMIN_PASSWORD_FILE），其次从环境变量。
# ⚠️ 不要把口令写在命令行里 —— 会被中间层过滤成随机串，导致写库与校验用的是两个值。
if [ -z "$ADMIN_PW" ] && [ -n "${SEED_ADMIN_PASSWORD_FILE:-}" ] && [ -f "$SEED_ADMIN_PASSWORD_FILE" ]; then
  ADMIN_PW="$(head -1 "$SEED_ADMIN_PASSWORD_FILE")"
fi
if [ -z "$ADMIN_PW" ] && [ -f /etc/blackhole/api.env ]; then
  ADMIN_PW="$(sed -n 's/^SEED_ADMIN_PASSWORD=//p' /etc/blackhole/api.env | head -1)"
fi
if [ -z "$ADMIN_PW" ]; then
  bad "未提供 SEED_ADMIN_PASSWORD（或 SEED_ADMIN_PASSWORD_FILE / /etc/blackhole/api.env），跳过登录相关检查"
else
  code="$(curl -sS $TLS -c "$TMP/ck.txt" -o "$TMP/login.json" -w '%{http_code}' --max-time 15 \
    -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -H "Origin: $ORIGIN" \
    -d "{\"account\":\"$ACCOUNT\",\"password\":\"$ADMIN_PW\"}" 2>/dev/null)"
  if [ "$code" = "200" ]; then
    ok "$ACCOUNT 登录成功"
    # must_change 为 true 时会被拦到改密页，这是设计行为，不算失败
    MUST_CHANGE="$(grep -o '"mustChangePassword":[a-z]*' "$TMP/login.json" 2>/dev/null | head -1 | cut -d: -f2)"
    if [ "$MUST_CHANGE" = "true" ]; then
      warn "账号处于「必须改密」状态"
      warn "  → 服务端会拦截除改密外的所有接口（403），这是设计行为，不是故障"
      warn "  → 请用浏览器登录一次并完成改密，然后重跑本脚本"
      MUST_CHANGE_FLAG=1
    fi
  else
    bad "登录失败（账号 $ACCOUNT）HTTP $code：$(head -c 200 "$TMP/login.json" 2>/dev/null)"
  fi
fi

# --- 4. 核心接口 ---
echo ""
echo "[4/6] 核心接口"
if [ "$MUST_CHANGE_FLAG" -eq 1 ]; then
  info "账号待改密，跳过核心接口检查（改密后重跑可完整验证）"
elif [ -f "$TMP/ck.txt" ]; then
  for ep in /api/auth/me /api/projects?pageSize=5 /api/tasks?pageSize=5 \
            /api/users?pageSize=5 /api/org/tree /api/workspace /api/stats/overview /api/stats/tasks \
            /api/stats/trend /api/stats/distribution /api/stats/team-workload \
            /api/risks/summary /api/files/summary /api/milestones /api/meetings; do
    code="$(curl -sS $TLS -b "$TMP/ck.txt" -o /dev/null -w '%{http_code}' --max-time 15 "$BASE$ep" 2>/dev/null)"
    if [ "$code" = "200" ]; then
      ok "GET $ep"
    elif [ "$code" = "403" ] && is_admin_only "$ep"; then
      # 普通账号访问管理员接口返回 403 —— 说明权限拦截生效，不是故障
      ok "GET $ep → 403（管理员接口，普通账号被正确拦截）"
    else
      bad "GET $ep → $code"
    fi
  done
else
  info "没有会话 Cookie，跳过"
fi

# --- 5. 前端静态资源 ---
echo ""
echo "[5/6] 前端静态资源"
if [ "$DIRECT" -eq 0 ]; then
  asset="$(curl -sS $TLS --max-time 15 "$BASE/" 2>/dev/null | grep -oE '/assets/[A-Za-z0-9._-]+\.js' | head -1)"
  if [ -n "$asset" ]; then
    code="$(curl -sS $TLS -o /dev/null -w '%{http_code}' --max-time 15 "$BASE$asset" 2>/dev/null)"
    if [ "$code" = "200" ]; then ok "主 JS 包可访问（$asset）"; else bad "主 JS 包 → $code"; fi
  else
    bad "首页里没找到 /assets/*.js —— 可能不是 SPA 入口页"
  fi
  # SPA 回退
  code="$(curl -sS $TLS -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/kanban" 2>/dev/null)"
  if [ "$code" = "200" ]; then ok "SPA 路由回退正常（/kanban → 200）"; else bad "SPA 回退 → $code"; fi
else
  info "--direct 模式，跳过前端检查"
fi

# --- 6. 安全头 ---
echo ""
echo "[6/6] 安全响应头"
if [ "$DIRECT" -eq 1 ]; then
  info "--direct 模式：安全头由 nginx 层负责，跳过"
else
  hdrs="$(curl -sS $TLS -I --max-time 15 "$BASE/" 2>/dev/null)"
  echo "$hdrs" | grep -qi 'x-content-type-options' && ok "X-Content-Type-Options" || bad "缺 X-Content-Type-Options"
  echo "$hdrs" | grep -qi 'strict-transport-security' && ok "HSTS" || info "没有 HSTS（自签证书阶段不启用；换正式证书后再开，否则退回 http 会很麻烦）"
fi

# --- 汇总 ---
echo ""
echo "=============================================="
echo -e " 通过 \033[0;32m$PASS\033[0m 项，失败 \033[0;31m$FAIL\033[0m 项"
echo "=============================================="
[ "$FAIL" -eq 0 ] || exit 1
