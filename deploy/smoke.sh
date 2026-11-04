#!/usr/bin/env bash
# ==============================================================================
# 部署后冒烟验证 —— 逐项检查，输出明确的通过/失败
#
# 用法：
#   bash scripts/smoke.sh https://workbench.example.internal
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
for arg in "$@"; do
  case "$arg" in
    --direct) DIRECT=1 ;;
    --origin=*) ORIGIN="${arg#--origin=}" ;;
  esac
done

PASS=0
FAIL=0
MUST_CHANGE_FLAG=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ok()   { echo -e "  \033[0;32m✓\033[0m $*"; PASS=$((PASS+1)); }
bad()  { echo -e "  \033[0;31m✗\033[0m $*"; FAIL=$((FAIL+1)); }
info() { echo -e "  \033[0;90m·\033[0m $*"; }

echo "=============================================="
echo " 工作台与组织架构 —— 部署冒烟验证"
echo " 目标：$BASE"
echo " Origin：$ORIGIN"
echo "=============================================="

# --- 1. 站点可达 ---
echo ""
echo "[1/6] 站点可达性"
if [ "$DIRECT" -eq 1 ]; then
  info "--direct 模式：API 不托管前端（生产由 nginx 托管），跳过首页检查"
else
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/" 2>/dev/null)"
  if [ "$code" = "200" ]; then ok "首页 HTTP 200"; else bad "首页 HTTP $code"; fi
fi

# --- 2. 未登录应 401 ---
echo ""
echo "[2/6] 鉴权拦截"
code="$(curl -sS -o "$TMP/auth.json" -w '%{http_code}' --max-time 15 "$BASE/api/auth/me" 2>/dev/null)"
if [ "$code" = "401" ]; then ok "未登录访问 /api/auth/me 返回 401"; else bad "期望 401，实际 $code"; fi

# --- 3. 登录 ---
echo ""
echo "[3/6] 登录与会话"
ADMIN_PW="${SEED_ADMIN_PASSWORD:-}"
if [ -z "$ADMIN_PW" ]; then
  bad "未提供 SEED_ADMIN_PASSWORD 环境变量，跳过登录相关检查"
else
  code="$(curl -sS -c "$TMP/ck.txt" -o "$TMP/login.json" -w '%{http_code}' --max-time 15 \
    -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -H "Origin: $ORIGIN" \
    -d "{\"account\":\"admin\",\"password\":\"$ADMIN_PW\"}" 2>/dev/null)"
  if [ "$code" = "200" ]; then
    ok "admin 登录成功"
    # must_change 为 true 时会被拦到改密页，这是设计行为，不算失败
    MUST_CHANGE="$(grep -o '"mustChangePassword":[a-z]*' "$TMP/login.json" 2>/dev/null | head -1 | cut -d: -f2)"
    if [ "$MUST_CHANGE" = "true" ]; then
      warn "账号处于「必须改密」状态"
      warn "  → 服务端会拦截除改密外的所有接口（403），这是设计行为，不是故障"
      warn "  → 请用浏览器登录一次并完成改密，然后重跑本脚本"
      MUST_CHANGE_FLAG=1
    fi
  else
    bad "登录失败 HTTP $code：$(head -c 200 "$TMP/login.json" 2>/dev/null)"
  fi
fi

# --- 4. 核心接口 ---
echo ""
echo "[4/6] 核心接口"
if [ "$MUST_CHANGE_FLAG" -eq 1 ]; then
  info "账号待改密，跳过核心接口检查（改密后重跑可完整验证）"
elif [ -f "$TMP/ck.txt" ]; then
  for ep in /api/auth/me /api/projects?pageSize=5 /api/tasks?pageSize=5 /api/users?pageSize=5 \
            /api/org/tree /api/workspace /api/stats/overview /api/stats/tasks \
            /api/stats/trend /api/stats/distribution /api/stats/team-workload \
            /api/risks/summary /api/files/summary /api/milestones /api/meetings; do
    code="$(curl -sS -b "$TMP/ck.txt" -o /dev/null -w '%{http_code}' --max-time 15 "$BASE$ep" 2>/dev/null)"
    if [ "$code" = "200" ]; then ok "GET $ep"; else bad "GET $ep → $code"; fi
  done
else
  info "没有会话 Cookie，跳过"
fi

# --- 5. 前端静态资源 ---
echo ""
echo "[5/6] 前端静态资源"
if [ "$DIRECT" -eq 0 ]; then
  asset="$(curl -sS --max-time 15 "$BASE/" 2>/dev/null | grep -oE '/assets/[A-Za-z0-9._-]+\.js' | head -1)"
  if [ -n "$asset" ]; then
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$BASE$asset" 2>/dev/null)"
    if [ "$code" = "200" ]; then ok "主 JS 包可访问（$asset）"; else bad "主 JS 包 → $code"; fi
  else
    bad "首页里没找到 /assets/*.js —— 可能不是 SPA 入口页"
  fi
  # SPA 回退
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/kanban" 2>/dev/null)"
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
  hdrs="$(curl -sS -I --max-time 15 "$BASE/" 2>/dev/null)"
  echo "$hdrs" | grep -qi 'x-content-type-options' && ok "X-Content-Type-Options" || bad "缺 X-Content-Type-Options"
  echo "$hdrs" | grep -qi 'strict-transport-security' && ok "HSTS" || info "没有 HSTS（纯 HTTP 内网可接受）"
fi

# --- 汇总 ---
echo ""
echo "=============================================="
echo -e " 通过 \033[0;32m$PASS\033[0m 项，失败 \033[0;31m$FAIL\033[0m 项"
echo "=============================================="
[ "$FAIL" -eq 0 ] || exit 1
