"""敏感信息脱敏 / 扫描脚本。

⚠️ 三个坑（都是实测踩出来的）：
1. 中间层会**双向改写**敏感词字面量 → 检测/替换必须用码点构造。
2. 因此**不能相信 grep / cat 的显示** —— 判定一律以「本脚本打印的码位」为准。
   （同一个文件用 cat 看是乱码，用码位读却是对的。）
3. 替换对统一放在 scripts/gen-replace-text.py 生成的 dist-release/replace.txt，
   本脚本**运行时读它** —— 单一数据源，脚本与 filter-repo 用同一张表。

用法：
    python3 scripts/scrub-sensitive.py          # 脱敏工作区
    python3 scripts/scrub-sensitive.py --check   # 只报告命中数
    python3 scripts/scrub-sensitive.py --scan    # 扫工作区 + git 历史
"""

import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TABLE = os.path.join(ROOT, 'dist-release', 'replace.txt')

SKIP_DIRS = {'node_modules', 'dist', 'dist-release', '.git', 'test-results', 'coverage'}
TEXT_EXT = re.compile(r'\.(ts|tsx|sql|md|json|ya?ml|css|html|sh|py|mjs)$')


def load_pairs() -> list[tuple[str, str]]:
    """从 replace.txt 读替换对（格式：literal:<源>==><目标>）。"""
    if not os.path.exists(TABLE):
        print(f'x 缺少替换表 {TABLE}，先跑 scripts/gen-replace-text.py', file=sys.stderr)
        sys.exit(1)
    pairs = []
    with io.open(TABLE, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line.startswith('literal:'):
                continue
            body = line[len('literal:'):]
            if '==>' not in body:
                continue
            a, b = body.split('==>', 1)
            if a and b and a != b:
                pairs.append((a, b))
    if not pairs:
        print('x 替换表为空', file=sys.stderr)
        sys.exit(1)
    return pairs


def codes(s: str) -> str:
    return ','.join(str(ord(c)) for c in s)


def tracked_files() -> list[str]:
    out = subprocess.run(['git', 'ls-files'], capture_output=True, text=True, check=True).stdout
    return [f for f in out.split('\n') if f.strip()]


def scrub(check_only: bool) -> int:
    pairs = load_pairs()
    hits = 0
    for f in tracked_files():
        try:
            s = io.open(f, encoding='utf-8').read()
        except Exception:
            continue
        orig = s
        for src, dst in pairs:
            if src in s:
                hits += s.count(src)
                s = s.replace(src, dst)
        if s != orig and not check_only:
            io.open(f, 'w', encoding='utf-8', newline='\n').write(s)
            print(f'  改: {f}')
    return hits


def scan() -> int:
    pairs = load_pairs()
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
            for src, _ in pairs:
                if src in s:
                    print(f'  x {p}  命中码位[{codes(src)}] x{s.count(src)}')
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
        raw = subprocess.run(['git', 'cat-file', '-p', sha], capture_output=True).stdout
        try:
            text = raw.decode('utf-8')
        except UnicodeDecodeError:
            continue
        for src, _ in pairs:
            if src in text:
                print(f'  x 历史 {sha[:8]} {path}  命中码位[{codes(src)}] x{text.count(src)}')
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
