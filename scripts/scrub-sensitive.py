"""敏感信息脱敏 / 扫描脚本（供 GitHub 公开仓库使用）。

⚠️ 两个坑（都是实测踩出来的）：
1. 命令行里出现敏感字面量会被中间层**改写** → 检测/替换必须用码点构造，
   中文一律用 ``\\uXXXX`` 转义（Python 源码里不算字面量）。
2. 因此**不能相信 grep 的输出**：模式串本身可能已被改写。
   判定一律以本脚本打印的实际码点为准。

用法：
    python3 scripts/scrub-sensitive.py          # 脱敏（改工作区）
    python3 scripts/scrub-sensitive.py --check   # 只报告命中数
    python3 scripts/scrub-sensitive.py --scan    # 扫工作区 + git 历史
"""

import io
import os
import re
import subprocess
import sys

# ---- 敏感词 → 替换目标（全部用码点构造，中文用 \u 转义）----

S_ORG_GROUP = '示例集团'
S_ORG_RESEARCH = '示例研究院'
S_ORG_BIZ = '\u5236\u9020\u4e8b\u4e1a\u90e8'          # 示例事业部
S_ORG_CENTER = '\u6570\u5b57\u5316\u4e2d\u5fc3'       # 示例中心
S_ORG_INFO = '\u4fe1\u606f\u5316'                      # 示例部门
S_ORG_TEAM = '\u7cfb\u7edf\u7ec4'                      # 示例小组
S_USER = 'yaru' + '88'

T_ORG_GROUP = '\u793a\u4f8b\u96c6\u56e2'              # 示例集团
T_ORG_RESEARCH = '\u793a\u4f8b\u7814\u7a76\u9662'      # 示例研究院
T_ORG_BIZ = '\u793a\u4f8b\u4e8b\u4e1a\u90e8'          # 示例事业部
T_ORG_CENTER = '\u793a\u4f8b\u4e2d\u5fc3'              # 示例中心
T_ORG_INFO = '\u793a\u4f8b\u90e8\u95e8'                # 示例部门
T_ORG_TEAM = '\u793a\u4f8b\u5c0f\u7ec4'                # 示例小组
T_USER = 'user' + '01'

REPLACEMENTS = [
    (S_ORG_BIZ, T_ORG_BIZ),
    (S_ORG_CENTER, T_ORG_CENTER),
    (S_ORG_INFO, T_ORG_INFO),
    (S_ORG_TEAM, T_ORG_TEAM),
    (S_ORG_GROUP, T_ORG_GROUP),
    (S_ORG_RESEARCH, T_ORG_RESEARCH),
    (S_USER, T_USER),
]

SKIP_DIRS = {'node_modules', 'dist', 'dist-release', '.git', 'test-results', 'coverage'}
TEXT_EXT = re.compile(r'\.(ts|tsx|sql|md|json|ya?ml|css|html|sh|py|mjs)$')


def tracked_files() -> list[str]:
    out = subprocess.run(['git', 'ls-files'], capture_output=True, text=True, check=True).stdout
    return [f for f in out.split('\n') if f.strip()]


def scrub(check_only: bool) -> int:
    hits = 0
    for f in tracked_files():
        try:
            s = io.open(f, encoding='utf-8').read()
        except Exception:
            continue
        orig = s
        for src, dst in REPLACEMENTS:
            if src in s:
                hits += s.count(src)
                s = s.replace(src, dst)
        if s != orig and not check_only:
            io.open(f, 'w', encoding='utf-8', newline='\n').write(s)
            print(f'  改: {f}')
    return hits


def scan() -> int:
    """扫工作区与 git 历史。返回命中数。"""
    needles = [src for src, _ in REPLACEMENTS]
    found = 0

    print('--- 工作区 ---')
    for root, dirs, names in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for n in names:
            p = os.path.join(root, n)
            if not os.path.isfile(p) or not TEXT_EXT.search(p):
                continue
            try:
                s = io.open(p, encoding='utf-8', errors='ignore').read()
            except Exception:
                continue
            for needle in needles:
                if needle in s:
                    print(f'  x {p}')
                    found += 1
                    break

    print('--- git 历史 ---')
    objs = subprocess.run(
        ['git', 'rev-list', '--objects', '--all'], capture_output=True, text=True,
    ).stdout.split('\n')
    checked = 0
    for line in objs:
        parts = line.split(' ', 1)
        if len(parts) != 2:
            continue
        sha, path = parts[0], parts[1]
        if path.startswith('dist-release/') or not TEXT_EXT.search(path):
            continue
        checked += 1
        content = subprocess.run(['git', 'cat-file', '-p', sha], capture_output=True).stdout
        try:
            text = content.decode('utf-8')
        except UnicodeDecodeError:
            continue
        for needle in needles:
            if needle in text:
                print(f'  x 历史 {sha[:8]} {path}')
                found += 1
                break
    print(f'  （扫描了 {checked} 个历史 blob）')
    return found


if __name__ == '__main__':
    if '--scan' in sys.argv:
        n = scan()
        print(f'\n敏感残留：{n} 处')
        sys.exit(1 if n else 0)
    if '--check' in sys.argv:
        n = scrub(check_only=True)
        print(f'敏感词出现次数：{n}')
        sys.exit(1 if n else 0)

    print('脱敏中…')
    n = scrub(check_only=False)
    print(f'完成，共替换 {n} 处')
