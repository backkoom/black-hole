#!/usr/bin/env python3
"""把设计稿原图切成产品需要的整套品牌资产。

用法：
    python scripts/brand-assets.py --vertical 竖版.png --horizontal 横版.png
    python scripts/brand-assets.py --vertical 竖版.png --horizontal 横版.png --build

支持两种输入：
  * 真透明 PNG（推荐，直接用，无损）
  * 白底 JPG/PNG（自动把白色抠成透明）

关键点（踩过的坑，别改）：
  1. **缩放必须在预乘 alpha 空间做**。PIL 的 RGBA 缩放是逐通道独立进行的，
     透明像素的 RGB 会被混进半透明边缘——如果透明区 RGB 是黑的，
     光晕就会发灰发暗（实测平均饱和度 80.9 → 38.8）。所以先乘 alpha 再缩，缩完再除回来。
  2. **不要过度缩放**。GitHub 上那张保持原始像素（显示宽度才 240，原图 1400+ 绰绰有余），
     应用内的才缩到 640（侧栏显示 190、登录页 300，2 倍屏够用）。
  3. **裁完要补留白**。贴着边裁，视觉上就像"被切了"。
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOC = os.path.join(ROOT, "docs", "brand")
PUB = os.path.join(ROOT, "apps", "web", "public")

# 白底转透明时，低于这个 alpha 的像素直接丢弃（JPEG 白区的压缩噪点）
WHITE_NOISE_CUT = 5


def load_rgba(path: str) -> Image.Image:
    """读图并保证返回 RGBA。没有 alpha 通道的（白底 JPG）走白→透明换算。"""
    im = Image.open(path)
    has_alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
    im = im.convert("RGBA")
    if has_alpha:
        print(f"  输入自带 alpha 通道，直接使用（无损）: {im.size}")
        return im

    arr = np.asarray(im.convert("RGB")).astype(np.float32)
    alpha = 255.0 - arr.min(axis=2)
    alpha[alpha < WHITE_NOISE_CUT] = 0.0
    with np.errstate(divide="ignore", invalid="ignore"):
        color = (arr - (255.0 - alpha[..., None])) * 255.0 / np.maximum(alpha[..., None], 1)
    color = np.clip(color, 0, 255)
    # ⚠️ 透明处的 RGB 保留原色（不置 0），否则后面缩放会把黑色带进光晕
    out = np.dstack([color, alpha]).astype(np.uint8)
    print(f"  输入无 alpha，按白底抠图: {im.size}")
    return Image.fromarray(out, "RGBA")


def trim(img: Image.Image, pad_pct: float = 0.0) -> Image.Image:
    """按 alpha 包围盒裁掉四周空白，再补回 pad_pct 比例的透明留白。"""
    alpha = np.asarray(img)[..., 3]
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        raise SystemExit("图片全透明，检查输入文件")
    core = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    if pad_pct <= 0:
        return core
    pad = round(core.width * pad_pct)
    canvas = Image.new("RGBA", (core.width + pad * 2, core.height + pad * 2), (0, 0, 0, 0))
    # ⚠️ 这里**不能**传 mask：paste(im, box, im) 会在透明画布上把 RGB 再乘一次 alpha
    #    （等于提前预乘），光晕会整片掉色——实测饱和度 91 → 69。
    #    画布本来就是全透明，直接拷贝即可。
    canvas.paste(core, (pad, pad))
    return canvas


def resize_premultiplied(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """预乘 alpha 后缩放，避免透明像素的颜色污染边缘。"""
    arr = np.asarray(img).astype(np.float32)
    a = arr[..., 3:4] / 255.0
    pm = np.concatenate([arr[..., :3] * a, arr[..., 3:4]], axis=2)
    small = np.asarray(
        Image.fromarray(np.clip(pm, 0, 255).astype(np.uint8), "RGBA").resize(size, Image.LANCZOS)
    ).astype(np.float32)
    a2 = np.maximum(small[..., 3:4] / 255.0, 1e-6)
    color = np.clip(small[..., :3] / a2, 0, 255)
    color[small[..., 3] == 0] = 0
    return Image.fromarray(np.dstack([color, small[..., 3:4]]).astype(np.uint8), "RGBA")


def square_mark(horizontal: Image.Image, keep_ratio: float = 0.40) -> Image.Image:
    """从横版左侧切出标记（方形画布居中），用于 favicon / 应用图标。"""
    left = horizontal.crop((0, 0, int(horizontal.width * keep_ratio), horizontal.height))
    mark = trim(left, 0)
    side = max(mark.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2))  # 同上，别传 mask
    inner = int(1024 * 0.94)
    body = resize_premultiplied(canvas, (inner, inner))
    icon = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    icon.paste(body, ((1024 - inner) // 2, (1024 - inner) // 2))
    return icon


def save(img: Image.Image, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    print(f"  ✓ {os.path.relpath(path, ROOT)}  {img.size[0]}×{img.size[1]}  {os.path.getsize(path) // 1024} KB")


def main() -> int:
    ap = argparse.ArgumentParser(description="生成 Black Hole 品牌资产")
    ap.add_argument("--vertical", required=True, help="竖版原图（GitHub 用）")
    ap.add_argument("--horizontal", required=True, help="横版原图（软件内用）")
    ap.add_argument("--build", action="store_true", help="顺便执行前端构建")
    args = ap.parse_args()

    for p in (args.vertical, args.horizontal):
        if not os.path.isfile(p):
            raise SystemExit(f"找不到文件: {p}")

    print("[1/5] 读取原图")
    vert_src = load_rgba(args.vertical)
    horz_src = load_rgba(args.horizontal)

    print("[2/5] 竖版（GitHub）—— 保持原始像素，不缩放")
    vert = trim(vert_src, 0.045)
    save(vert, os.path.join(DOC, "blackhole-brand.png"))
    save(vert, os.path.join(DOC, "blackhole-vertical.png"))  # 旧路径兜底

    print("[3/5] 横版（软件内）—— 预乘缩放")
    horz = trim(horz_src, 0.02)
    app_w = 640
    save(resize_premultiplied(horz, (app_w, round(horz.height * app_w / horz.width))),
         os.path.join(PUB, "brand", "blackhole-horizontal.png"))
    doc_w = 900
    save(resize_premultiplied(horz, (doc_w, round(horz.height * doc_w / horz.width))),
         os.path.join(DOC, "blackhole-horizontal.png"))

    print("[4/5] 标记 / favicon / 应用图标")
    icon = square_mark(horz, 0.40)
    save(icon, os.path.join(PUB, "brand", "blackhole-icon.png"))
    save(icon, os.path.join(DOC, "blackhole-mark.png"))
    for s in (512, 256, 128, 64, 48, 32, 16):
        save(resize_premultiplied(icon, (s, s)), os.path.join(DOC, f"blackhole-{s}.png"))
    resized = [resize_premultiplied(icon, (s, s)) for s in (256, 128, 64, 48, 32, 16)]
    ico_path = os.path.join(PUB, "favicon.ico")
    resized[0].save(ico_path, sizes=[(im.width, im.height) for im in resized])
    print(f"  ✓ apps/web/public/favicon.ico  {os.path.getsize(ico_path) // 1024} KB")
    save(resize_premultiplied(icon, (180, 180)), os.path.join(PUB, "brand", "apple-touch-icon.png"))

    if args.build:
        print("[5/5] 构建前端")
        npm = shutil.which("npm")
        if not npm:
            print("  ! 没找到 npm，跳过构建")
        else:
            subprocess.run([npm, "run", "build", "-w", "apps/web"], cwd=ROOT, check=True)
            print("  ✓ 构建完成（apps/web/dist）")
    else:
        print("[5/5] 跳过构建（要构建加 --build）")

    print("\n完成。别忘了：")
    print("  * GitHub 上图片换了要改文件名或等缓存过期，否则看到的还是旧图")
    print("  * 应用到服务器：bash scripts/package-release.sh 后按 deploy/README.md 升级")
    return 0


if __name__ == "__main__":
    sys.exit(main())
