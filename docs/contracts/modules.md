# 模块契约（modules）

> 来源：《AI 开发执行包》§7.1–§7.5；v2 §4.5–§4.7。
> 代码实现：`packages/shared/src/modules.ts`（前端与后端共用这一份定义，不要在前端再写一份中文名/尺寸表）。
> 配置校验：`packages/shared/test/modules.test.ts`。

---

## 1. 数量与分类（唯一口径）

| 项 | 值 |
|---|---|
| 模块总数 | **15** |
| active（可进布局） | **12** |
| placeholder（只在模块库展示） | **3** |
| 分类计数 | 任务与日程 2 / 快捷入口 2 / 项目与数据 2 / 知识与资料 3 / 个性模块 6 |

**active key**：`todo` `project-progress` `quick-entry` `calendar` `data-chart` `idea` `text` `notice` `links` `embed` `gallery` `divider`
**placeholder key**：`file` `knowledge-list` `ai`

---

## 2. 15 个模块清单

| # | key | 名称 | 分类 | type | dataSource | 默认 | 最小 | 状态 | emptyState | 刷新策略 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `todo` | 今日待办 | 任务与日程 | basic | tasks.today | 6×4 | 3×3 | active | 今天没有待办 | onFocus |
| 2 | `project-progress` | 项目进度 | 项目与数据 | basic | projects.progress | 6×4 | 4×3 | active | 还没有进行中的项目 | onFocus |
| 3 | `quick-entry` | 快速入口 | 快捷入口 | content | null | 3×4 | 3×3 | active | 还没有快捷入口 | manual |
| 4 | `calendar` | 日历 | 任务与日程 | basic | tasks.calendar | 6×4 | 4×4 | active | 本周没有任务 | onFocus |
| 5 | `data-chart` | 数据报表 | 项目与数据 | basic | stats.tasks | 6×4 | 4×4 | active | 还没有任务数据 | onFocus |
| 6 | `idea` | 灵感记录 | 个性模块 | basic | ideas.list | 3×4 | 3×3 | active | 还没有灵感 | onFocus |
| 7 | `text` | 文本卡片 | 知识与资料 | content | null | 4×3 | 3×2 | active | 点击编辑文本 | manual |
| 8 | `notice` | 公告通知 | 个性模块 | content | null | 4×3 | 3×2 | active | 暂无公告 | manual |
| 9 | `links` | 链接列表 | 快捷入口 | content | null | 3×3 | 3×2 | active | 还没有链接 | manual |
| 10 | `embed` | 嵌入内容 | 个性模块 | content | null | 6×4 | 4×3 | active | 配置嵌入地址 | manual |
| 11 | `gallery` | 图片墙 | 个性模块 | content | null | 6×4 | 4×3 | active | 还没有图片 | manual |
| 12 | `divider` | 分割线 | 个性模块 | content | null | 12×2 | 12×2 | active | — | manual |
| 13 | `file` | 文件资料 | 知识与资料 | basic | attachment | 6×4 | 4×3 | **placeholder** | 功能迭代中 | — |
| 14 | `knowledge-list` | 内容列表 | 知识与资料 | basic | documents | 6×4 | 4×3 | **placeholder** | 功能迭代中 | — |
| 15 | `ai` | AI 助手 | 个性模块 | basic | prompt | 6×4 | 4×3 | **placeholder** | 功能迭代中 | — |

- 刷新策略：`todo` `project-progress` `calendar` `data-chart` `idea` 用 **onFocus**；`quick-entry` `text` `notice` `links` `embed` `gallery` `divider` 用 **manual**（内容只在保存后变）。
- 占位模块的刷新策略原文未写，暂置 manual，Phase 5 前复核。

---

## 3. 模块数据与渲染（执行包 §7.5）

| 模块 | 数据 / 行为 | emptyState |
|---|---|---|
| todo | `GET /tasks?due=today&pageSize=50`；显示前 8 条；勾选完成走 `PATCH status` | 今天没有待办 |
| project-progress | `GET /projects?pageSize=100`；过滤 active；每行名称、进度条、百分比；卡片内滚动 | 还没有进行中的项目 |
| quick-entry | 读 config；点击跳转；内链用 react-router，外链新窗口 | 还没有快捷入口 |
| calendar | `GET /tasks?due=week&pageSize=100`；本周 7 天列表/周视图，**不做月视图**；点击日期跳 `/tasks?due=week` | 本周没有任务 |
| data-chart | `GET /stats/tasks`；todo/doing/done 三个数字或柱状图；**不引图表库**，用 AntD Progress/Statistic 组合 | 还没有任务数据 |
| idea | `GET /ideas?pageSize=5`；输入框新增 `POST /ideas`；只显示自己的 | 还没有灵感 |
| text | 读 config；纯文本段落 | 点击编辑文本 |
| notice | 读 config；`level=warning` 用警示色 | 暂无公告 |
| links | 读 config；列表；外链新窗口 | 还没有链接 |
| embed | 读 config；url 为空显示 emptyState；否则 iframe sandbox | 配置嵌入地址 |
| gallery | 读 config；九宫格图片；caption 可空 | 还没有图片 |
| divider | 读 config；一条分割线，label 可显示 | — |
| file / knowledge-list / ai | 不可拖入；模块库显示「迭代」角标；画布不出现 | 功能迭代中 |

**通用规则**
- 数据模块首次加载显示骨架；超过 3 秒转失败态；失败显示「加载失败」和重试。
- 不显示假数据；空状态不能拿 demo 的 12/5/7 填充。
- 日历本期只做周视图；月视图需新增日期范围查询，属范围变更。

---

## 4. content 模块 config schema（7 个）

| 模块 | config 结构 | 约束 |
|---|---|---|
| `quick-entry` | `{ items: [{ label, url }] }` | 最多 8 条；url 允许 http/https 或站内绝对路径（以 `/` 开头、不以 `//` 开头、不含反斜杠/控制字符） |
| `text` | `{ title, body }` | body 纯文本，最多 2000 字 |
| `notice` | `{ title, body, level }` | body 最多 500 字；level ∈ `info` / `warning` |
| `links` | `{ items: [{ label, url }] }` | 最多 8 条；url **只允许 http/https** |
| `embed` | `{ url, height? }` | 只允许 https（允许空串表示未配置）；iframe 加 sandbox |
| `gallery` | `{ images: [{ url, caption? }] }` | 最多 9 张；url 只允许 https |
| `divider` | `{ label? }` | label 最多 20 字 |

**basic 模块**（`todo` `project-progress` `calendar` `data-chart` `idea`）：config 固定 `{}`，未知字段忽略。

**URL 安全**：所有 URL 禁止 `javascript:`、`data:`、`file:`；渲染时用文本节点/`textContent`，禁止 `innerHTML`；链接加 `rel="noopener noreferrer"`。

**长度口径**：`text`/`notice` 的长度按**字符数**计，不按字节。

---

## 5. 默认 config（执行包 §7.4）

| 模块 | 默认 config |
|---|---|
| quick-entry | `{items:[{label:'项目',url:'/projects'},{label:'任务',url:'/tasks'},{label:'灵感',url:'/workspace'},{label:'设置',url:'/settings/profile'}]}` |
| text | `{title:'',body:''}` |
| notice | `{title:'',body:'',level:'info'}` |
| links | `{items:[]}` |
| embed | `{url:'',height:400}` |
| gallery | `{images:[]}` |
| divider | `{label:''}` |
| 其他 active | `{}` |

> quick-entry 的「灵感」暂指向 `/workspace`；不独立做第 11 个页面。

---

## 6. 默认模板（v2 §4.9 / 执行包 §5.1 第 4 条）

模板是 `workspace` 表里 `kind = 'template'` 的唯一一行，`name=默认模板`，`version=1`。

| sort | module_key | w×h | config |
|---|---|---|---|
| 0 | todo | 6×4 | `{}` |
| 1 | project-progress | 6×4 | `{}` |
| 2 | quick-entry | 3×4 | 4 个入口：项目 /projects、任务 /tasks、灵感 /workspace、设置 /settings/profile |
| 3 | idea | 3×4 | `{}` |

- 默认模板**不含占位模块**。
- 新用户创建时把模板的 layout 行复制到新用户 workspace，**config 原样复制**；之后管理员改模板**不影响已创建用户**。
- 模板保存走 `PUT /api/workspace/template`，带 `version`，冲突 409；使用 CAS（`WHERE id = 模板 workspace id AND version = $2`），**不要复用用户工作台的 id**。

---

## 7. 布局约束（应用层，§3.5 / §6.5 / v2 §9.10）

| 约束 | 值 |
|---|---|
| 总模块数上限 | 14（达到 12 时提示，达到 14 拒绝添加） |
| 同一 workspace 同一 module_key | 只能一条（divider 例外） |
| divider 数量 | ≤ 3；尺寸固定 12×2，不允许缩放 |
| 宽度 w | ∈ {3, 4, 6, 12}，且不小于该模块 minSize.w |
| 高度 h | 整数行，2 ≤ h ≤ 12，且不小于该模块 minSize.h |
| moduleKey | 只能是 12 个 active 模块 |
| config | 按模块 schema 校验，≤ 64KB |
| 版本 | 从 1 开始，每次布局保存 +1；不匹配返回 409 |

**排序算法（必须先移除再插入，避免向下拖动差一位）**
1. 从数组移除 `from` 位置
2. 若 `from < to`，插入位置为 `to - 1`；否则为 `to`
3. 插入
4. 重新编号 `sort = 0..n-1`，保存时整份提交

**只存 sort，不存 x/y**；布局按 sort 流式排列。

---

## 8. 与验收的对应

| 验收组 | 相关模块 |
|---|---|
| B1–B10（工作台与布局） | 全部 12 个 active；`file`/`knowledge-list`/`ai` 对应 B10（置灰 + 迭代角标 + 不可拖入） |
| C1–C5（任务） | `todo`、`calendar` |
| D1–D5（项目） | `project-progress` |
| B4（尺寸） | 全部模块的 `defaultSize` / `minSize` |
| B5（数量上限） | `divider`（≤3）、总数 ≤14 |
