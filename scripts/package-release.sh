#!/usr/bin/env bash
# ==============================================================================
# 发布包打包 —— 在**开发机**跑，产出可直接上传到服务器的 tar.gz
#
# 用法：
#   bash scripts/package-release.sh            # 打包到 dist-release/
#   bash scripts/package-release.sh --skip-test # 跳过测试（不建议）
#
# 产出：
#   dist-release/workbench-release-<时间戳>.tar.gz
#     ├── apps/api/dist/        后端编译产物
#     ├── apps/web/dist/        前端静态产物
#     ├── db/migrations/         数据库迁移
#     ├── deploy/               systemd / nginx / env 模板
#     ├── scripts/install.sh    服务器端安装脚本
#     └── RELEASE.txt           版本信息
#
# ⚠️ 不依赖 GitHub —— 服务器上不需要有仓库，这是「上传包」方式。
# ==============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_TEST=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --skip-test) SKIP_TEST=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    *) echo "未知参数：$arg"; exit 1 ;;
  esac
done

echo "==> 1/5 校验工作区状态"
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  工作区有未提交改动："
  git status --short
  # 非交互环境（CI / 无人值守）不能等输入，会卡死
  if [ "$ASSUME_YES" -eq 1 ] || [ ! -t 0 ]; then
    echo "   非交互模式或已指定 --yes：继续打包（改动会包含进发布包）"
  else
    echo "   继续打包会包含这些改动。继续？[y/N]"
    read -r ans
    [ "$ans" = "y" ] || { echo "已取消"; exit 1; }
  fi
fi

echo "==> 2/5 质量门"
if [ "$SKIP_TEST" -eq 1 ]; then
  echo "   ⚠️ 跳过测试（--skip-test）"
else
  npm run verify
fi

echo "==> 3/5 构建"
npm run build

echo "==> 4/5 组装发布包"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$ROOT/dist-release"
# ⚠️ 先清掉「本次产物」标记 —— build 失败时脚本会中止，但旧包还在目录里。
#    没有标记的话，后续读 LATEST 会拿到**旧包**而不知情（实测踩过）。
rm -f "$OUT_DIR/LATEST"
PKG_DIR="$OUT_DIR/workbench-release-$STAMP"
# ⚠️ 不用 rm -rf 清理（会触发删除拦截）；时间戳目录天然唯一，旧的保留即可
mkdir -p "$PKG_DIR"/{apps/api,apps/web,db,deploy,scripts,packages/shared}

cp -r apps/api/dist        "$PKG_DIR/apps/api/"
# ⚠️ 必须带 package.json —— 否则 npm 认不出 workspace（报 "No workspaces found"）
cp    apps/api/package.json "$PKG_DIR/apps/api/"
cp -r apps/web/dist        "$PKG_DIR/apps/web/"
cp    apps/web/package.json "$PKG_DIR/apps/web/"
# ⚠️ @workbench/shared 是 workspace 外部依赖，编译产物不会被 bundle，必须一起带
cp    packages/shared/package.json "$PKG_DIR/packages/shared/"
cp -r packages/shared/dist       "$PKG_DIR/packages/shared/" 2>/dev/null || true
cp -r db/migrations        "$PKG_DIR/db/"
cp    db/seed.ts           "$PKG_DIR/db/"     # 播种脚本（一次性用 tsx 跑）
cp    scripts/seed-demo.ts "$PKG_DIR/scripts/" # 演示数据播种
cp    scripts/reset-and-demo.sh "$PKG_DIR/scripts/" # 服务器数据重置 + 演示数据
cp -r deploy               "$PKG_DIR/"
cp    deploy/install.sh    "$PKG_DIR/scripts/"
cp    deploy/one-shot.sh   "$PKG_DIR/scripts/"
cp    deploy/smoke.sh      "$PKG_DIR/scripts/"
cp    deploy/backup.sh     "$PKG_DIR/scripts/"
cp    deploy/restore.sh    "$PKG_DIR/scripts/"
cp    package.json         "$PKG_DIR/"
cp    package-lock.json    "$PKG_DIR/"

cat > "$PKG_DIR/RELEASE.txt" <<EOF
构建时间：$(date '+%Y-%m-%d %H:%M:%S')
Git 提交：$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')
分支：$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')
Node：$(node -v)
平台：$(uname -srm)
EOF

cat > "$PKG_DIR/scripts/package.json" <<'EOF'
{ "name": "workbench-release", "private": true, "type": "module" }
EOF

echo "==> 5/5 打包"
TARBALL="$OUT_DIR/workbench-release-$STAMP.tar.gz"
tar -czf "$TARBALL" -C "$OUT_DIR" "workbench-release-$STAMP"

SIZE="$(du -h "$TARBALL" | cut -f1)"
echo ""
# ⚠️ 写一个「本次产物」标记 —— build 失败时脚本会中止，
#    此时 dist-release/ 里可能还留着**上一次的旧包**，后续 `ls -t` 会误取它。
#    只有带这个标记文件时才算本次成功产出。
echo "$TARBALL" > "$OUT_DIR/LATEST"

echo "✅ 发布包已生成：$TARBALL （$SIZE）"
echo ""
echo "下一步："
echo "  1) scp 到服务器：  scp $TARBALL <user>@<host>:/tmp/"
echo "  2) 服务器上解包：  sudo bash /tmp/install.sh --tarball /tmp/$(basename "$TARBALL")"
echo "  3) 冒烟验证：      bash scripts/smoke.sh https://<你的域名>"
