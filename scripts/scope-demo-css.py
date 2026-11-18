"""把 docs/demo/workbench-demo.html 的 <style> 迁移成作用域 CSS（.wbd 前缀）。
规则：仅删除顶层 body{}、保留其它全部规则；逐选择器加前缀；@media 内同样处理。
"""
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'docs/demo/workbench-demo.html').read_text(encoding='utf-8')
css = re.search(r'<style>(.*?)</style>', html, re.S).group(1)

def drop_block(text, needle):
    i = text.find(needle)
    if i < 0:
        return text
    j = text.find('{', i)
    depth = 0
    for k in range(j, len(text)):
        if text[k] == '{':
            depth += 1
        elif text[k] == '}':
            depth -= 1
            if depth == 0:
                return text[:i] + text[k + 1:]
    return text

css = drop_block(css, '\n  body{')
css = css.replace('html,body{height:100%}', '')
css = css.replace('#root { padding: 14px; }', '')
css = css.replace(':root{', '.wbd{', 1)
css = css.replace('*{box-sizing:border-box}', '.wbd *{box-sizing:border-box}')

out = []
for line in css.split('\n'):
    s = line.strip()
    if not s or s.startswith('@') or s.startswith('/*') or '{' not in line:
        out.append(line)
        continue
    idx = line.index('{')
    sel, rest = line[:idx], line[idx:]
    parts = []
    for one in sel.split(','):
        one = one.strip()
        if not one:
            continue
        parts.append(one if one.startswith('.wbd') else '.wbd ' + one)
    indent = line[:len(line) - len(line.lstrip())]
    out.append(indent + ', '.join(parts) + rest)

body = '\n'.join(out)
header = ('/* 自动生成：不要手改。源 = docs/demo/workbench-demo.html 的 <style>。\n'
          '   重新生成：python scripts/scope-demo-css.py */\n')
(root / 'apps/web/src/styles/workbench-demo.css').write_text(header + body, encoding='utf-8')
print('rules:', body.count('{'))
