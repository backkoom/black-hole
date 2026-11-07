# 品牌资产与替换方法

## 文件对应关系

| 文件 | 用在哪 | 建议尺寸 |
|---|---|---|
| `blackhole-brand.png` | GitHub README 顶部（竖版：标记 + 字标 + 标语） | 保持原图尺寸，不缩放 |
| `blackhole-horizontal.png` | 文档 / PPT（横版） | 900 宽 |
| `blackhole-mark.png` | GitHub 深色模式回退、对外素材 | 1024 见方 |
| `blackhole-{512..16}.png` | 各平台图标 | — |
| `apps/web/public/brand/blackhole-horizontal.png` | **软件内**：侧栏 190px、登录页 300px | 640 宽 |
| `apps/web/public/brand/blackhole-icon.png` | 应用图标母版（1024） | 1024 |
| `apps/web/public/favicon.ico` | 浏览器标签（16~256 六尺寸） | — |
| `apps/web/public/brand/apple-touch-icon.png` | iOS 主屏 | 180 |

## 换图方式一：双击（不用碰命令行）

把**竖版**和**横版**两张图**一起选中**，拖到 `scripts/set-brand.cmd` 上松手：

1. 弹窗问「是否顺便部署」→ 敲 `Y` 或 `N`
2. 等它跑完（生成资产 → 构建 → 打包，约 1~2 分钟）
3. GitHub 上那张图还要手动换一次（见下方"只换 GitHub 那张"）

> `.cmd` 里刻意只写英文：cmd 按系统 OEM 代码页解析批处理文件，
> 写中文会把引号和括号弄乱（实测直接报"不是内部或外部命令"）。
> 中文提示统一由 `set-brand.sh` 输出，配合 `chcp 65001` 显示正常。

## 换图方式二：一条命令

```bash
python scripts/brand-assets.py \
  --vertical   竖版原图.png \
  --horizontal 横版原图.png \
  --build
```

- 输入可以是**真透明 PNG**（推荐，无损直接用），也可以是**白底 JPG/PNG**（脚本自动抠白）。
- 只想换软件内那套（竖版已经在 GitHub 上手工传过）：加 `--skip-vertical`，脚本不会碰 `docs/brand/blackhole-brand.png`。
- 脚本会重出上面全部文件，`--build` 顺便构建前端。
- 之后再打包部署（见 `deploy/README.md`）。

## 只换 GitHub 那张（网页操作，不用本地环境）

1. 打开 `https://github.com/backkoom/black-hole` → 进入 `docs/brand/`。
2. **Add file → Upload files**，把新图拖进去，文件名改成 `blackhole-brand.png` 覆盖旧的 → Commit。
3. 回到 `README.md`，把图片那行的 `?v=2` 改成 `?v=3`（每次换图 +1）。

> **为什么必须改版本号**：GitHub 的图片走自己的代理（camo），同一 URL 会长时间返回旧字节。
> 不换 URL 你会以为"没生效"，其实 GitHub 还在发旧图。文件名或 `?v=` 一变，缓存立刻失效。

## 三个踩过的坑（改脚本前必读）

1. **粘贴到透明画布不能带 mask**
   `canvas.paste(img, box, img)` 会把 RGB 再乘一次 alpha（提前预乘），
   光晕整片掉色——实测平均饱和度 **91 → 69**。透明画布上直接 `paste(img, box)` 即可。

2. **缩放要在预乘 alpha 空间做**
   PIL 的 RGBA 缩放逐通道独立，透明像素的颜色会混进边缘。脚本里 `resize_premultiplied()` 就是干这个的。
   直缩会掉色（实测 80.9 → 38.8）。

3. **别过度缩放，别裁完不补留白**
   GitHub 上显示宽度只有 240，用原图（1400+）完全够，缩了只会变糊。
   裁完要补 2%~4.5% 透明留白，贴着边看起来就像"被切了"。

## 自检

```bash
python - <<'PY'
from PIL import Image
import numpy as np
a = np.asarray(Image.open('docs/brand/blackhole-brand.png').convert('RGBA')).astype(np.float32)
c = a[...,:3]*(a[...,3:4]/255) + 255*(1-a[...,3:4]/255)   # 合成到白底
m = c.min(axis=2) < 200
print('平均饱和度:', round(float((c.max(axis=2)-c.min(axis=2))[m].mean()), 1))
PY
```

原稿的强内容饱和度应在 90 左右；如果只有 60 多，说明掉色了（多半是踩了第 1 或第 2 条）。
