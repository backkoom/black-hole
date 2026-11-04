"""生成 git-filter-repo 的 replace-text 文件。

⚠️ 文件内容含中文敏感词 → 必须用 \\u 转义构造（命令行/工具链里的中文字面量会被中间层改写）。

用法：python3 scripts/gen-replace-text.py > /tmp/replace.txt
"""

import io
import sys

S_ORG_BIZ = '\u5236\u9020\u4e8b\u4e1a\u90e8'          # 示例事业部
S_ORG_CENTER = '\u6570\u5b57\u5316\u4e2d\u5fc3'       # 示例中心
S_ORG_INFO = '\u4fe1\u606f\u5316'                      # 示例部门
S_ORG_TEAM = '\u7cfb\u7edf\u7ec4'                      # 示例小组
S_ORG_GROUP = '示例集团'
S_ORG_RESEARCH = '示例研究院'
S_USER = 'yaru' + '88'

T_ORG_BIZ = '\u793a\u4f8b\u4e8b\u4e1a\u90e8'          # 示例事业部
T_ORG_CENTER = '\u793a\u4f8b\u4e2d\u5fc3'              # 示例中心
T_ORG_INFO = '\u793a\u4f8b\u90e8\u95e8'                # 示例部门
T_ORG_TEAM = '\u793a\u4f8b\u5c0f\u7ec4'                # 示例小组
T_ORG_GROUP = '\u793a\u4f8b\u96c6\u56e2'              # 示例集团
T_ORG_RESEARCH = '\u793a\u4f8b\u7814\u7a76\u9662'      # 示例研究院
T_USER = 'user' + '01'

PAIRS = [
    (S_ORG_BIZ, T_ORG_BIZ),
    (S_ORG_CENTER, T_ORG_CENTER),
    (S_ORG_INFO, T_ORG_INFO),
    (S_ORG_TEAM, T_ORG_TEAM),
    (S_ORG_GROUP, T_ORG_GROUP),
    (S_ORG_RESEARCH, T_ORG_RESEARCH),
    (S_USER, T_USER),
]

out = io.StringIO()
for src, dst in PAIRS:
    # filter-repo 的 replace-text 语法：literal:<原文>==><替换>
    out.write(f'literal:{src}==>{dst}\n')

sys.stdout.write(out.getvalue())
