#!/usr/bin/env bash
# 一键换品牌图：生成资产 → 构建 → 打包 →（可选）部署到服务器
#
# 用法：
#   bash scripts/set-brand.sh 竖版.png 横版.png
#   bash scripts/set-brand.sh 竖版.png 横版.png --deploy
#
# 也可以在 Windows 上直接双击 scripts/换图.cmd，把两张图拖到它上面。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# 这台机器上系统 PATH 里的 python 没装 Pillow，必须用这个环境
PY="${PYTHON:-C:/Users/Admin/.workbuddy/binaries/python/envs/default/Scripts/python.exe}"
HOST="${HOST:-root@192.168.102.102}"

if [ $# -lt 2 ]; then
  echo "用法: bash scripts/set-brand.sh <竖版图片> <横版图片> [--deploy]"
  exit 2
fi

VERT="$1"
HORZ="$2"
DEPLOY="${3:-}"

for f in "$VERT" "$HORZ"; do
  [ -f "$f" ] || { echo "找不到文件: $f"; exit 2; }
done

echo "==> [1/3] 生成品牌资产"
"$PY" "$ROOT/scripts/brand-assets.py" --vertical "$VERT" --horizontal "$HORZ" --build

echo "==> [2/3] 打发布包"
bash "$ROOT/scripts/package-release.sh" | tail -3

if [ "$DEPLOY" = "--deploy" ]; then
  PKG="$(ls -t "$ROOT"/dist-release/blackhole-release-*.tar.gz | head -1)"
  NAME="$(basename "$PKG")"
  echo "==> [3/3] 部署 $NAME → $HOST"
  scp -q "$PKG" "$HOST:/tmp/"
  ssh "$HOST" "set -e; cd /tmp; rm -rf /tmp/blackhole-release-*/; tar -xzf $NAME; D=\$(ls -d /tmp/blackhole-release-*/ | head -1); bash \$D/scripts/install.sh --tarball /tmp/$NAME 2>&1 | grep -E '安装完成|多实例运行'"
else
  echo "==> [3/3] 跳过部署（要部署加 --deploy）"
  echo
  echo "手动部署："
  echo "  bash scripts/package-release.sh"
  echo "  scp dist-release/blackhole-release-*.tar.gz $HOST:/tmp/"
  echo "  ssh $HOST \"cd /tmp && tar -xzf blackhole-release-*.tar.gz && bash /tmp/blackhole-release-*/scripts/install.sh --tarball /tmp/blackhole-release-*.tar.gz\""
fi

echo
echo "✅ 完成。GitHub 上那张图请记得把 README 里的 ?v=N 改成 N+1，否则会看到旧图。"
