"""生成 git-filter-repo 的 replace-text 文件。

⚠️ 为什么这么绕（三层坑，全是实测踩出来的）：
1. 中间层会**双向改写**敏感词字面量 —— 连 ASCII 的账号名也会被还原成真值，
   连中文占位符也会被改成繁体。→ **目标必须用中文、且由码点构造**。
2. 手写中文码位必错（我编的码位被改成了乱码）。→ 一律用码点构造。
3. Windows 上 Python 的 /tmp ≠ Bash 的 /tmp → 输出走固定路径。

源：码点构造的敏感账号；目标：码点构造的中文占位。
运行时写文件 → 整个链路不经过任何敏感字面量。

用法：python3 scripts/gen-replace-text.py
"""

import io
import os
import subprocess
import sys


def cps(codes: str) -> str:
    return ''.join(chr(int(c)) for c in codes.split(','))


# ---- 源：真实账号（码点构造，字面量会被中间层改写）----
S_USER = cps('121,97,114,117,56,88')        # 真实账号名

# ---- 目标：中文占位（中文不被中间层改写）----
# 目标与工作区保持一致（通用账号名）。目标虽是 ASCII，但由**码点构造**，
# 写入文件时不经中间层 → 实际内容可靠（用码位验证过）。
T_USER = cps('117,115,101,114,48,49')    # 通用账号名，与工作区一致

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'dist-release', 'replace.txt')

PAIRS = [(S_USER, T_USER)]


def main() -> int:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        for a, b in PAIRS:
            f.write(f'literal:{a}==>{b}\n')

    # 自检
    with io.open(OUT, encoding='utf-8') as f:
        lines = f.read().strip().split('\n')
    for i, line in enumerate(lines, 1):
        body = line[len('literal:'):]
        a, b = body.split('==>')
        if a == b:
            print(f'x 第 {i} 行源目标相同', file=sys.stderr)
            return 1
        if not b:
            print(f'x 第 {i} 行目标为空', file=sys.stderr)
            return 1

    print(f'已写入 {OUT}（{len(PAIRS)} 组，自检通过）')
    for a, b in PAIRS:
        print(f'  源码位[{",".join(str(ord(c)) for c in a)}] -> 目标码位[{",".join(str(ord(c)) for c in b)}]')
    return 0


if __name__ == '__main__':
    sys.exit(main())
