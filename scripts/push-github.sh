#!/usr/bin/env bash
# ==============================================================================
# 推码到 GitHub 公共仓库 —— 一键完成
#
# 用法（在仓库根目录）：
#   bash scripts/push-github.sh
#
# 前置：已执行 `gh auth login`（或设置 GH_TOKEN 环境变量）
# 做的事：建仓 → 设 remote → 推 main → 校验 → 输出链接
# ==============================================================================
set -euo pipefail

REPO_NAME="${REPO_NAME:-workbench-app}"
DESCRIPTION="${DESCRIPTION:-内网项目管理系统：用户端 10 页固定界面 + 管理员端（工作台编排/账号/组织架构/模板）}"
VISIBILITY="${VISIBILITY:-public}"

log() { echo -e "\033[0;36m[push]\033[0m $*"; }
die() { echo -e "\033[0;31m[fail]\033[0m $*" >&2; exit 1; }

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# ---- 前置检查 ----
command -v gh >/dev/null || die "没找到 gh"
gh auth status >/dev/null 2>&1 || die "gh 未登录，请先执行：gh auth login"

echo "=== 推送前自检 ==="
if ! git diff --quiet || ! git diff --cached --quiet; then
  die "工作区有未提交改动，先提交再推"
fi
git status --short | head -3

# 分支名统一成 main（GitHub 默认）
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  log "重命名分支 $BRANCH → main"
  git branch -m main
fi

# 确认没有遗留的敏感文件（大文件/密钥类）
log "检查待推文件里是否有可疑大文件"
git ls-files -z | xargs -0 -I{} sh -c 'test -f "{}" && stat -c%s "{}" 2>/dev/null' \
  | sort -rn | head -3 | while read -r sz; do
  echo "    最大文件 ${sz} 字节"
done

# ---- 建仓 ----
if gh repo view "$REPO_NAME" >/dev/null 2>&1; then
  log "仓库 $REPO_NAME 已存在，直接推"
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://github.com/$(gh api user -q .login)/$REPO_NAME.git"
else
  log "创建公开仓库 $REPO_NAME"
  gh repo create "$REPO_NAME" \
    --public \
    --description "$DESCRIPTION" \
    --source=. \
    --remote=origin
fi

# ---- 推送 ----
log "推送 main"
git push -u origin main

# ---- 校验 ----
log "校验远端状态"
REMOTE_SHA="$(git ls-remote origin refs/heads/main | cut -f1)"
LOCAL_SHA="$(git rev-parse HEAD)"
if [ "$REMOTE_SHA" = "$LOCAL_SHA" ]; then
  log "✓ 远端 main 与本地一致（$LOCAL_SHA）"
else
  die "远端与本地不一致：远端 $REMOTE_SHA / 本地 $LOCAL_SHA"
fi

URL="https://github.com/$(gh api user -q .login)/$REPO_NAME"
echo ""
echo "=============================================="
echo -e " \033[0;32m✅ 已推送\033[0m"
echo " 仓库：$URL"
echo " 提交：$(git rev-list --count HEAD) 个"
echo " 体积：$(du -sh .git | cut -f1)"
echo "=============================================="
