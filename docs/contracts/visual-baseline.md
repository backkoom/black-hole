# 视觉基准（visual-baseline）

> 来源：`demo-工作台与组织架构.html`（2026-10-27）。
> **只作视觉参考，不是数据/计数/交互契约。** 业务口径见 `pages.md` / `modules.md` / `openapi.yaml`。
> 实现栈：React 18 + Ant Design 5（契约指定，不引第二套组件库）。本文说明 AntD 组件如何被 demo 定制。
>
> 全文所有颜色值、尺寸值均从 demo 的 `<style>` 块原样抄出，不做「大概 / 偏深」这类描述。
> 凡是 demo 与 v2 契约冲突之处，均在第 8 节逐条列出并标注「以契约为准」。
> 引用缩写：**v2** =《工作台与组织架构-可执行版-v2.md》，**执行包** =《AI 开发执行包-工作台与组织架构.md》，**D-xx** = `decisions.md` 已决策项。

---

## 1. 设计变量

### 1.1 CSS 变量（`:root` 内共 15 个）

| 变量 | 原始值 | 用途 | demo 中出现位置 |
|---|---|---|---|
| `--bg` | `#f4f6fa` | 页面底色、搜索框底色、图标按钮 hover 底 | `body`、`.search`、`.icon-btn:hover` |
| `--card` | `#ffffff` | 卡片/面板白底（声明了但正文里被硬编码 `#fff` 取代） | `body` 之外的卡片底 |
| `--border` | `#e6eaf2` | 通用描边色（卡片、输入框、表格头分隔、分割线） | `.kpi-card`、`.mod`、`.card`、`.btn`、`.library`、`.tabs`、`.tree-head`、`table.people th`、`.hr-line`、`.topbar` |
| `--text` | `#1f2937` | 主文字色 | `body`、`.brand-name` 用 `#fff` 覆盖、`.btn:hover`、`.tx`、`.pmn`、`.pn`、`.crumb b`、`.hint b`、`.toast` |
| `--text-2` | `#5b6577` | 次级文字（按钮字色、指标标题、表格次要列） | `.btn`、`.kpi-label`、`.m-more`、`.lib-name`、`.tree-head`、`.tab`、`.pct`、`.pmp`、`.txt-note`、`.hint`、`.qi span`、`.stat` 侧栏、`.icon-btn` |
| `--muted` | `#98a1b3` | 弱化文字（副标题、脚注、占位、分隔符、图标） | `.page-sub`、`.kpi-count`、`.kpi-foot`、`.pen`、`.tab` 侧图标、`.m-title i`、`.m-more`、`.lib-group`、`.crumb`、`.node-count`、`.stat-item .l`、`.empty-box`、`.caret`、`.node-icon`、`.tm`、`.pnum`、`.tm` |
| `--primary` | `#2563eb` | 主色：按钮主按钮、选中态文字、进度条右端、拖放高亮 | `.btn-primary`、`.tab.active`、`.lib-tab.active`、`.tree-row.active`、`.m-more:hover`、`.ai-list li:hover`、`.ck.done`、`.pbar > i` 渐变右端、`.canvas.dragover`、`.mod.over`、`.lv-company .node-icon` |
| `--primary-soft` | `#eef3ff` | 主色浅底：树选中行背景 | `.tree-row.active` |
| `--green` | `#10b981` | 成功色：指标卡脚注加粗数字 | `.kpi-foot b` |
| `--orange` | `#f59e0b` | 警告/橙（声明了，正文改用硬编码 `#f59e0b`） | 模块库图标底色（`quick` 模块） |
| `--purple` | `#8b5cf6` | 紫（声明了，正文改用硬编码 `#8b5cf6`） | 品牌标渐变右端、`ai` 模块图标底色、集团节点图标 |
| `--red` | `#ef4444` | 危险/红点 | `.dot`（通知红点）、`todo` 模块图标底色 |
| `--radius` | `12px` | 主圆角：指标卡、画布、模块库、通用 `.card` | `.kpi-card`、`.canvas`、`.library`、`.card` |
| `--side` | `#1c2033` | 左侧导航深色底 | `.sidebar` |
| `--side-2` | `#252a40` | 左侧导航 hover 底 | `.nav-item:hover` |

> 变量声明块原文见文末「附 A」。

### 1.2 圆角（Radius）

| 值 | 适用元素 | 来源类名 |
|---|---|---|
| `12px` | 指标卡、画布、模块库、通用卡片 | `--radius` / `.kpi-card` `.canvas` `.library` `.card` |
| `11px` | 画布内的模块卡片 | `.mod` |
| `10px` | 提示条 `.hint`、快捷入口图标块 `.qi-ic` | `.hint` `.qi-ic` |
| `9px` | 按钮、搜索框、图标按钮、模块库项、库图标块、Toast、品牌标 | `.btn` `.search` `.icon-btn` `.lib-item` `.lib-ic` `.toast` `.brand-mark` |
| `8px` | 导航项、计数徽标、状态药丸、树节点行、树子层竖线、进度条、占位条 | `.nav-item` `.kpi-count` `.node-count` `.pill` `.tree-row` `.pbar` `.ph-line` |
| `7px` | 导航「迭代」小标签 | `.nav-tag` |
| `6px` | 重命名按钮、模块工具按钮、拖动手柄、柱状图柱顶 | `.pen` `.mtool` `.mod-grip` |
| `50%` | 头像、复选圈、红点 | `.avatar` `.ck` `.dot` |

### 1.3 阴影（Shadow）

demo 全篇**只有一处阴影**：

```
.mod:hover { box-shadow: 0 4px 14px rgba(28,40,70,.07); }
```

其余元素全部靠 1px 描边 + 底色差分层，没有投影。

### 1.4 描边（Border）

| 描边 | 适用 |
|---|---|
| `1px solid var(--border)`（`#e6eaf2`） | 卡片、模块卡、按钮、输入框、顶部栏下边线、Tab 下边线、库内 Tab 下边线、树头下边线、表头下边线、分割线 |
| `1px solid #f2f5f9` | 人员表格行分隔（比卡片描边更浅） |
| `1px dashed #cdd7e8` | 画布外框 |
| `1px dashed #cdd8ea` | 提示条 `.hint` |
| `1px dashed #e3e8f2` | 树子层级引导竖线 |
| `1px dashed #f0f3f8` | 待办清单行、列表行分隔 |
| `1px dashed #d8e0ee` | 嵌入网页占位框 |
| `1.6px solid #d3dbe8` | 待办复选圈未选中边框 |
| `2px solid #c3cddd` | 缩放手柄的 L 形两条边 |
| `2px solid transparent` | Tab 未选中下边框（选中时换成 `--primary`） |
| `2px solid #fca5a5` / `2px solid #c9d4e8` | 工具按钮 hover 描边 / 按钮 hover 描边 |

### 1.5 字号（Font Size）

| 字号 | 字重 | 用途 |
|---|---|---|
| `20px` | 700 | 页面标题 `.page-title`（`letter-spacing: .3px`） |
| `19px` | 700 | 统计数字 `.stat-item .n` |
| `14.5px` | 700 | 品牌名 `.brand-name`（`letter-spacing: .2px`） |
| `14px` | 400 | 正文 `body`（`line-height: 1.6`） |
| `13.5px` | 700 | 卡片标题（`.card` 内 13.5px 加粗块）、模块标题 `.m-title`、画布空态主文案 `.canvas-empty .t` |
| `13px` | 400/600 | 按钮、导航项、搜索框、Tab、树节点、库 Tab、空状态文案、指标卡无、设置页 radio 行、模块库项名称容器 |
| `12.5px` | 400/700 | 页面副标题 `.page-sub`、指标卡标题 `.kpi-label`、提示条 `.hint`、面包屑 `.crumb`、树头 `.tree-head`、模块右侧文字 `.m-more`、库分组标题 `.lib-group`、表单 label、统计标签 11.5px 除外 |
| `12px` | 400/600 | 表头 `table.people th`、模块标题括注 `.m-title i`、画布空态副文案 `.canvas-empty .s`、权限页脚注 |
| `11.5px` | 400 | 指标卡脚注 `.kpi-foot`、统计标签 `.stat-item .l`、模块右侧文字 `.m-more`、库分组标题 `.lib-group`、进度百分比 `.pct`、项目行 `.proj-mini` |
| `11px` | 400 | 库项名称 `.lib-name`、快捷入口文字 `.qi span`、时间 `.tm`、任务计数 `.pnum`、柱状图 X 轴标签 |
| `10.5px` | 400/600 | 计数徽标 `.kpi-count`、树计数 `.node-count`、状态药丸 `.pill` |
| `10px` | 400 | 导航「迭代」标签 `.nav-tag` |

### 1.6 渐变（Gradient）

| 渐变 | 用途 |
|---|---|
| `linear-gradient(135deg, #3b82f6, #8b5cf6)` | 品牌标 `.brand-mark` |
| `linear-gradient(135deg, #34d399, #2563eb)` | 头像 `.avatar` |
| `linear-gradient(90deg, #60a5fa, #2563eb)` | 项目进度条 `.pbar > i` |
| `linear-gradient(90deg, #34d399, #10b981)` | 完成率卡进度条 |
| `linear-gradient(180deg, #93c5fd, #3b82f6)` / `(180deg, #fdba74, #f59e0b)` / `(180deg, #cbd5e1, #94a3b8)` | 数据报表模块的三根柱 |
| `linear-gradient(135deg, #e0e7ff, #c7d2fe)` | 图片轮播占位底 |

### 1.7 圆点/图标底色（模块图标色板，demo `MODULES[].color`）

`#ef4444`（待办）、`#3b82f6`（项目）、`#f59e0b`（快速入口）、`#10b981`（日历）、`#0ea5e9`（文件）、`#8b5cf6`（AI）、`#6366f1`（内容列表）、`#ec4899`（数据报表）、`#f97316`（灵感）、`#64748b`（文本）、`#14b8a6`（图片）、`#e11d48`（公告）、`#7c3aed`（链接）、`#0891b2`（嵌入）、`#94a3b8`（分割线）。

组织树节点图标色按层级：`lv-group #8b5cf6`、`lv-company #2563eb`、`lv-dept #0ea5e9`，默认 `#98a1b3`。

> 契约要求用 `@ant-design/icons`，这些硬编码色板在实现时需改为 AntD token（`colorPrimary` / `colorSuccess` / `colorWarning` / `colorError` / `colorInfo` 等）或集中常量，模块图标底色按 `packages/shared/src/modules.ts` 的统一字段取，不在前端另写一份。

---

## 2. 整体布局

### 2.1 骨架

```
.app (display:flex; height:100vh)
├── .sidebar  宽度 208px，flex:0 0 208px，background #1c2033，padding 16px 10px，overflow-y:auto
└── .main     flex:1，min-width:0，flex column，overflow:hidden
    ├── .topbar    height 56px，flex:0 0 56px，background #fff，border-bottom 1px solid #e6eaf2，padding 0 22px，gap 14px
    └── .content   flex:1，overflow-y:auto，padding 20px 22px 30px
```

- `.content` **没有最大宽度、没有水平居中**（demo 全屏铺满）。
- 契约要求：内容区最大宽度 `1440px` 居中；侧栏 `220px`；12 列画布左右内边距 `24px`。→ 差异见第 8 节第 6/8 条。

### 2.2 左侧导航（深色）

| 元素 | 规格 |
|---|---|
| 品牌区 `.brand` | `display:flex; gap:10px; padding:4px 10px 20px` |
| 品牌标 `.brand-mark` | `30×30`，圆角 `9px`，渐变 `135deg #3b82f6→#8b5cf6`，字 `700 14px #fff`，内容为字母 `W` |
| 品牌名 `.brand-name` | `14.5px / 700 / #fff / letter-spacing .2px`，内容 `WorkBuddy` |
| 导航项 `.nav-item` | `display:flex; gap:10px; padding:9px 11px; border-radius:8px; font-size:13px; color:#9aa3bd; margin-bottom:1px`；图标 `svg 16×16`（`flex:0 0 16px`）；`transition: background .15s, color .15s` |
| 导航项 hover | `background:#252a40; color:#dfe4f2` |
| 导航项选中 `.active` | `background:#2d3552; color:#fff; font-weight:600` |
| 导航项禁用 `.disabled` | `color:#5b6480; cursor:default`，hover 无变化（`background:transparent`） |
| 「迭代」小标签 `.nav-tag` | `margin-left:auto; font-size:10px; padding:0 6px; border-radius:7px; background:#2f3654; color:#7d87a6` |

demo 导航共 6 项：工作台（选中）、任务管理、项目管理、知识库（禁用+迭代）、AI 助手（禁用+迭代）、设置。

### 2.3 顶部栏 `.topbar`

| 元素 | 规格 |
|---|---|
| 搜索框 `.search` | `flex:1; max-width:400px; display:flex; gap:8px; background:#f4f6fa; border-radius:9px; padding:7px 12px; font-size:13px; color:#98a1b3`；放大镜 `svg 14×14`；内嵌 `input` 无边框透明底、`outline:none`、`font-size:13px`、`width:100%`；placeholder 文案「搜索任务、项目或人员」 |
| 右侧区 `.topbar-right` | `margin-left:auto; display:flex; gap:14px` |
| 图标按钮 `.icon-btn` | `32×32`，圆角 `8px`，`color:#5b6577`，`position:relative`；hover `background:#f4f6fa`；内含铃铛 `svg 17×17` |
| 通知红点 `.dot` | `position:absolute; top:6px; right:6px; 6×6; border-radius:50%; background:#ef4444` |
| 头像 `.avatar` | `30×30`，圆形，渐变 `135deg #34d399→#2563eb`，`font-size:12px; font-weight:600; color:#fff`，内容为单字 |

### 2.4 内容区与栅格

| 区块 | 栅格定义 | 列间距 |
|---|---|---|
| 指标卡 `.kpi-grid` | `grid-template-columns: repeat(4, 1fr)`，`margin-bottom:14px` | `gap:14px` |
| 编辑器 `.editor` | `grid-template-columns: 1fr 252px`（预览态 `1fr`），`align-items:start` | `gap:16px` |
| 组织页 `.org-wrap` | `grid-template-columns: 320px 1fr`，`align-items:start` | `gap:16px` |
| 快捷入口 `.qi-grid` | `grid-template-columns: repeat(4, 1fr)` | `gap:10px` |
| 模块库 `.lib-grid` | `grid-template-columns: repeat(3, 1fr)` | `gap:8px` |
| 画布 `.canvas` | `display:flex; flex-wrap:wrap; align-content:flex-start` | `gap:14px` |

- 画布模块宽度算法（demo 实际计算式）：
  `width = calc(w / 12 * 100% - 14 * (12 - w) / 12 px)`，`height = h px`（demo 用像素高，默认可取 206 / 200 / 180 / 170 / 150 / 140 / 120 / 56）。
- 画布容器：`background:#fbfcfe; border:1px dashed #cdd7e8; border-radius:12px; padding:14px; min-height:480px`。
- 画布拖入高亮 `.canvas.dragover`：`border-color:#2563eb; background:#f5f9ff`。
- 契约画布规格：**12 列 / 列间距 16px / 行高 72px / 左右内边距 24px / 最大宽度 1440px 居中**，w ∈ {3,4,6,12}，h 为 2–12 整数行。→ 差异见第 8 节第 6 条。

### 2.5 页面头 `.page-head`

```
.page-head  display:flex; align-items:center; gap:14px; margin-bottom:14px
├── 左侧
│   ├── .page-title  font-size:20px; font-weight:700; letter-spacing:.3px; display:flex; gap:8px
│   │   └── .pen     22×22; border-radius:6px; color:#98a1b3; cursor:pointer
│   │                hover: background #eef1f7; color #5b6577（title="重命名"）
│   └── .page-sub   color:#98a1b3; font-size:12.5px; margin-top:2px
└── .head-actions   margin-left:auto; display:flex; gap:10px; align-items:center
```

### 2.6 模块间距速查

| 间距 | 值 |
|---|---|
| 侧栏内边距 | `16px 10px` |
| 内容区内边距 | `20px 22px 30px` |
| 顶部栏内边距 | `0 22px` |
| 页面头与内容 | `margin-bottom:14px` |
| 指标卡与 Tab | `margin-bottom:14px` |
| Tab 与编辑区 | `margin-bottom:14px` |
| 通用卡片内边距 | `16px` |
| 模块库内边距 | `12px` |
| 模块卡内容区内边距 | `14px 16px` |
| 提示条 | `margin-top:14px; padding:11px 14px` |
| 空状态 | `padding:60px 0` |
| 画布空态 | `padding:96px 0 110px` |

---

## 3. 组件样式清单

两列对照：**demo 外观** → **AntD 组件 + 关键 props**。
凡 demo 没有对应物的（如下拉），标注「demo 无 → 契约新增」。

### 3.1 按钮

| demo 外观 | AntD 组件 + 关键 props |
|---|---|
| `.btn`：`1px solid #e6eaf2` 边、白底、`#5b6577` 字、圆角 `9px`、`padding 7px 16px`、`13px`、`gap 6px`、hover 边变 `#c9d4e8` 字变 `#1f2937` | `<Button>`（默认 `type="default"`）；配 `ConfigProvider theme.token`：`borderRadius:9`、`fontSize:13`、`controlHeight:34`；带图标时 `icon={<EyeOutlined/>}`（demo 图标 `14×14`，AntD 图标默认 `14px`） |
| `.btn.btn-primary`：底色与描边均 `#2563eb`、字 `#fff`，hover 转 `#1d4ed8` | `<Button type="primary">`；`theme.token.colorPrimary:'#2563eb'`、`colorPrimaryHover:'#1d4ed8'` |
| `.btn.btn-ghost`：无边框、透明底 | `<Button type="text">`（AntD 5.21+ 等价 `variant="text"`） |
| `.icon-btn`：`32×32`、圆角 `8px`、无描边、`#5b6577` 图标、hover 底 `#f4f6fa` | `<Button type="text" shape="circle" icon={<BellOutlined/>} />` + `style={{width:32,height:32}}`；配 `theme.token.controlHeight` 不适用于 `shape="circle"`，直接给 style |
| `.icon-btn .dot`：`6×6` 红点，右上 `top:6px; right:6px` | `<Badge dot>` 包裹图标按钮；`<Badge dot={{ color: '#ef4444', offset: [-2, 2] }}>` |
| `.mtool`（模块删除）：`22×22`、圆角 `6px`、`rgba(255,255,255,.95)` 底、`1px solid #e6eaf2`、hover 变红底 `#fee2e2` / 红边 `#fca5a5` / 红字 `#dc2626` | `<Button size="small" type="text" danger icon={<DeleteOutlined/>} />`，`style={{width:22,height:22,padding:0}}`；删除需二次确认 → 外包 `<Popconfirm title="删除该模块？" okText="删除" cancelText="取消">` |
| `.mod-grip`（拖动手柄）：`22×22`、圆角 `6px`、白底半透明、`1px solid #e6eaf2`、`cursor:move` | 无对应 AntD 组件，用 `<HolderOutlined />` 自绘 `div`（`draggable` 手柄） |
| `.rs`（缩放手柄）：`16×16`、绝对定位右下、`cursor:nwse-resize`，内部 `8×8` L 形边 `2px solid #c3cddd` | 无对应 AntD 组件，自绘 `div`（契约：宽度吸附 3/4/6/12，高度吸附 2–12 行） |
| `.lib-item`（模块库项，可拖） | 无对应组件：`draggable` 的 `div` + `cursor:grab`；占位模块加 `disabled` 视觉 + `<Tag>迭代</Tag>` |

### 3.2 输入与选择

| demo 外观 | AntD 组件 + 关键 props |
|---|---|
| `.search` 里的 `input`：无边框透明底、`13px`、圆角容器 `9px`、底 `#f4f6fa`、`padding 7px 12px` | `<Input variant="borderless" prefix={<SearchOutlined/>} size="small" />` + 外层 `div` 承担底色/圆角（demo 形态）。**契约不做全局搜索 → 整块删除** |
| 设置页普通 `input`：`width:100%`、`padding 8px 11px`、`1px solid #e6eaf2`、圆角 `9px`、`13px`、`outline:none` | `<Input size="small" />` 放进 `<Form.Item label="工作台名称" name="name">`；`theme.token.controlHeight:30`、`paddingInline:11` |
| 权限页 `input[type=radio]`：`gap 9px`、`padding 9px 0`、`13px` | `<Radio.Group>` + `<Radio>`（**契约删除该 tab**，不实现） |
| **demo 无下拉** | 契约新增：`<Select options={...} showSearch allowClear optionFilterProp="label" placeholder="全部" />` |
| **demo 无开关 / 多选 / 日期选择 / 密码框** | 契约新增：`<Switch>`、`<Checkbox.Group>`、`<DatePicker>`、`<Input.Password>` |

### 3.3 表格

| demo 外观 | AntD 组件 + 关键 props |
|---|---|
| `table.people`：全宽、`border-collapse:collapse`、`12.5px`；表头 `12px/600/#5b6577`、底 `#f8fafc`、`padding 8px 10px`、下边 `1px solid #e6eaf2`；单元格 `padding 10px`、下边 `1px solid #f2f5f9`；行 hover 底 `#fafcff` | `<Table size="small" columns={...} dataSource={...} rowKey="id" pagination={...} scroll={{ x: 'max-content' }} />`；表头底色用 `components={{ header: { cell: { style: { background: '#f8fafc', fontSize: 12, fontWeight: 600, color: '#5b6577' } } } }}`，行 hover 底 `#fafcff` 用 `onRow` 或 `styles.body` |
| 首列姓名加粗 `600` | `columns` 里 `render: (t) => <Typography.Text strong>{t}</Typography.Text>` |
| 次列账号字色 `#5b6577` | `render: (t) => <span style={{ color: '#5b6577' }}>{t}</span>` |
| 列宽 `100px / 120px / 90px / 80px` | `columns[].width` |
| 表头「操作」列 | 契约新增：`fixed:'right'`（全局基线要求操作列固定右侧）；删除用 `<Popconfirm>` |

### 3.4 Tab

| demo 外观 | AntD 组件 + 关键 props |
|---|---|
| `.tabs`：横向 `gap 4px`、底 `1px solid #e6eaf2`、`margin-bottom 14px`；`.tab` `padding 8px 14px`、`13px`、`#5b6577`、下边 `2px solid transparent` + `margin-bottom:-1px`；`.tab.active` 字 `#2563eb`、`font-weight 600`、下边 `2px solid #2563eb` | `<Tabs type="line" tabBarGutter={4} items={[{key,label}]} />`；`tabBarStyle={{ padding: 0, marginBottom: 14, borderBottom: '1px solid #e6eaf2' }}`；选中态用 `theme.token.colorPrimary`（默认 AntD 选中色为 `#1677ff`，需覆盖为 `#2563eb` 才对齐 demo） |
| `.lib-tabs`（模块库内两个 Tab）：`gap 16px`、`padding 0 4px 10px`、下边 `1px solid #e6eaf2`；选中 `#2563eb / 600` + `2px` 下边 | 同 `<Tabs>`，`tabBarGutter={16}`；demo 的「页面样式」为纯视觉占位，实现可保留空面板或删除 |
| 设置页 Tab（顶部三页） | **契约改为左侧子导航 200px**（`<Menu mode="inline" />` 或 `<Layout.Sider width={200}>`） |

### 3.5 徽标 / 角标 / 状态标签

| demo 外观 | AntD 组件 + 关键 props |
|---|---|
| `.kpi-count`：`margin-left:auto`、`10.5px`、字 `#98a1b3`、底 `#f2f4f8`、圆角 `8px`、`padding 0 7px` | `<Badge count={n} style={{ color: '#98a1b3', background: '#f2f4f8', borderRadius: 8, fontSize: 10.5, boxShadow: 'none' }} />` |
| `.node-count`（树计数）：同上，选中行变白底 + `#2563eb` 字 | `<Badge count={n} />`，选中态样式用 `theme` 或 `className` 切换 |
| `.pill`（状态药丸）：`10.5px`、`padding 1px 8px`、圆角 `8px`、底 `#e8f8f2`、字 `#0f9d6e`、`font-weight 600` | `<Badge status="success" text="在职" />`（字色自动取 `colorSuccess`）；或 `<Tag color="success" bordered={false} style={{fontSize:10.5}}>在职</Tag>` |
| `.nav-tag`（「迭代」）：`10px`、圆角 `7px`、底 `#2f3654`、字 `#7d87a6` | `<Tag>`（深底场景用 `style={{ background:'#2f3654', color:'#7d87a6', borderRadius:7, fontSize:10 }}`） |
| 占位模块「迭代」角标 | **demo 无此表现**；契约新增：`<Tag>迭代</Tag>` + 库项置灰（`opacity` / 灰图标底） |
| 步骤/序号圆点 `.dot` | 见 3.1 `<Badge dot>` |

### 3.6 空状态 / 提示条 / Toast

| demo 外观 | AntD 组件 + 关键 props |
|---|---|
| `.empty-box`：`padding 60px 0`、居中、字 `#98a1b3`、`13px`、无图标 | `<Empty description="该节点下暂无人员" image={Empty.PRESENTED_IMAGE_SIMPLE} imageStyle={{ height: 48 }} />`；契约要求空状态**必须有图标**（用 `image` 自定义 SVG） |
| `.canvas-empty`：`width 100%`、居中、`padding 96px 0 110px`；主文案 `13.5px #aab5c9`、副文案 `12px #cbd4e4`（`margin-top 5px`） | `<Empty description={<div><div style={{fontSize:13.5,color:'#aab5c9'}}>拖拽模块到这里</div><div style={{fontSize:12,color:'#cbd4e4',marginTop:5}}>例如：任务卡片、欢迎语、项目概览等</div></div>} />` |
| `.hint`（虚线提示条）：`1px dashed #cdd8ea`、圆角 `10px`、`padding 11px 14px`、`12.5px`、字 `#5b6577`、底 `#fbfcff`、`<b>` 变 `#1f2937` | `<Alert type="info" showIcon={false} message={<>这是<b>管理员视角</b>。…</>} />`；虚线边需 `style={{ border:'1px dashed #cdd8ea', borderRadius:10, background:'#fbfcff' }}` 覆盖 |
| `.toast`：固定居中偏下 `bottom:40px`、深底 `#1f2937`、白字 `13px`、`padding 9px 20px`、圆角 `9px`、`opacity 0→1` + `translateY(20px→0)`、`transition all .25s`、`z-index 99`、1.8s 自动消失 | AntD `message`（`<App>` + `App.useApp()` → `message.success('已保存')`）。**注意：AntD 5 的 message 是白底浅色卡，不是深色浮层**；按 D-U-1「不追求像素还原」，用 AntD 默认外观即可，若要深色需自定义 `message.config({ className })` 覆盖背景 |
| **demo 无失败态 / 无骨架屏 / 无重试按钮** | 契约新增：`<Skeleton active />`、`<Result status="error" subTitle="加载失败" extra={<Button>重试</Button>} />` |

### 3.7 树 / 组织架构

| demo 外观 | AntD 组件 + 关键 props |
|---|---|
| `.tree-row`：`display:flex; gap 6px; padding 6px 7px; border-radius 7px; font-size 13px`；hover 底 `#f6f8fc`；选中底 `#eef3ff`、字 `#2563eb`、`font-weight 600` | `<Tree treeData={...} selectedKeys={...} blockNode showLine={false} switcherIcon={...} />`；选中底用 `theme.token.colorPrimaryBg:'#eef3ff'`；`switcherIcon` 换成 `13×13` 的 `<RightOutlined />`（demo 展开态 `rotate(90deg)`） |
| `.tree-children`：`margin-left 14px; padding-left 8px; border-left 1px dashed #e3e8f2` | `<Tree showLine={{ 'showLeafIcon': false }} />` + `lineClassName` 自定义虚线；或保留 demo 的手写树（demo 的树节点交互含「点击 caret 只展开不选中」，AntD `Tree` 需自行处理） |
| `.node-icon`：`14×14`，默认 `#98a1b3`，按层级 `集团 #8b5cf6 / 公司 #2563eb / 部门 #0ea5e9`，选中 `#2563eb` | `<Tree>` 的 `icon` 字段，按 `level` 取 `<FolderOutlined/>` / `<BankOutlined/>` / `<ApartmentOutlined/>`（尺寸 `14`） |
| `.caret`：`13×13`、叶节点 `visibility:hidden` | `switcherIcon` + `Tree` 的 `leaf` 判断；`#98a1b3` |
| `.tree-head`：「组织结构」`12.5px/700/#5b6577` + 右侧总数 `11.5px/#98a1b3`，底 `1px solid #e6eaf2` | 自绘 `div`，或 `<Card title={<span>组织结构 <span style={{fontWeight:400,color:'#98a1b3',fontSize:11.5}}>{n} 人</span></span>}> ` |
| 面包屑 `.crumb`：`12.5px`、`#98a1b3`，分隔符 `/` 与 `·` 用 `#c9d2e2`，当前节点 `<b>` 为 `#1f2937/600` | `<Breadcrumb items={[{title},{title:<b>…</b>}]} separator="/" />` |

### 3.8 弹层 / 抽屉

| demo 外观 | AntD 组件 + 关键 props |
|---|---|
| 模块库是**右侧 sticky 侧栏**（`.library`：`position:sticky; top:0; padding:12px; border-radius:12px; 1px solid #e6eaf2`），不是抽屉 | `<Drawer placement="right" width={252} open={...} onClose={...} title="模块库" />`（契约命名 `ModuleLibraryDrawer`）。`width={252}` 对齐 demo 侧栏宽度 |
| 设置/权限两个 tab 用同页 `div` 切换 | `<Tabs>` + `<Card>`；`<Modal>` / `<Drawer>` 用于「新增/编辑模块内容」面板（契约 `ConfigPanel`） |
| **demo 无 Modal / 无 Drawer / 无 Popconfirm** | 契约新增：`<Modal>`（`open`、`title`、`onOk`、`confirmLoading`）、`<Drawer>`、`<Popconfirm title okText cancelText>` |
| 冲突提示 | 契约新增：`<Modal title="版本冲突">` 两个按钮「刷新（丢弃本地改动）」/「覆盖保存」，覆盖需二次确认 |

### 3.9 进度条 / 统计数字 / 小型元素

| demo 外观 | AntD 组件 + 关键 props |
|---|---|
| `.pbar`：`height 7px`、圆角 `4px`、槽底 `#eef1f6`、填充渐变 `90deg #60a5fa→#2563eb` | `<Progress percent={p} showInfo={false} strokeWidth={7} trailColor="#eef1f6" strokeColor={{ from: '#60a5fa', to: '#2563eb' }} size="small" />`（AntD `size="small"` 默认 `strokeWidth 6`，需显式传 7） |
| KPI 完成率卡进度条：`height 8px`、渐变 `90deg #34d399→#10b981` | `<Progress strokeWidth={8} strokeColor={{ from: '#34d399', to: '#10b981' }} showInfo={false} />` |
| `.kpi-value`：`27px / 700 / line-height 1.25 / letter-spacing -.5px / margin-top 4px`；单位用 `<small>` `13px / 600` | `<Statistic title="今日任务" value={n} valueStyle={{ fontSize: 27, fontWeight: 700, lineHeight: 1.25, letterSpacing: -0.5 }} />`；单位走 `suffix={<span style={{fontSize:13,fontWeight:600}}>%</span>}` |
| `.stat-item .n`：`19px / 700`；`.stat-item .l`：`11.5px / #98a1b3` | `<Statistic title={<span style={{fontSize:11.5,color:'#98a1b3'}}>人员</span>} value={n} valueStyle={{ fontSize: 19, fontWeight: 700 }} />` |
| `.stat-row`：`display:flex; gap 26px` | `<Space size={26}>` 或 `<Row gutter={[26, 0]}>` |
| `.qi` 快捷入口：图标块 `36×36`、圆角 `10px`、白字，下方 `11px #5b6577` 文字 | `<Button type="text" shape="square" icon={...} style={{width:36,height:36,borderRadius:10,background:<模块色>}} />` + `<Typography.Text style={{fontSize:11,color:'#5b6577'}}>` |
| `.qi-grid`：`repeat(4,1fr)`、`gap 10px` | `<Row gutter={[10,10]}>` + `<Col span={6}>` |
| `.ck` 待办复选圈：`15×15`、圆形、`1.6px solid #d3dbe8`；选中态实心 `#2563eb` + 白色对勾 | `<Checkbox>`（`<Progress type="circle" size={15}>` 不适合交互勾选）；AntD `Checkbox` 为方形，如需圆形需 `border-radius: 50%` 覆盖 |
| `.tx.done`：字 `#b0b9c9` + 删除线 | `<Typography.Text delete style={{ color: '#b0b9c9' }}>` |
| `.hr-line` 分割线：`border-top 1px solid #e6eaf2; margin 6px 0` | `<Divider style={{ margin: '6px 0' }} />` |
| `.ph-line` 骨架占位条：`height 8px; radius 4px; bg #f0f3f8; margin-bottom 8px`（短条 `width 60%`） | `<Skeleton active paragraph={{ rows: 2 }} />` 或 `<div>` 自绘 |
| `.m-head` 模块标题栏：`display:flex; justify-content:space-between; margin-bottom 10px`；`.m-title` `13.5px/700`，可带 `<i>` 括注 `12px/#98a1b3/400`；`.m-more` `11.5px/#98a1b3`，hover `#2563eb` | `<Card title={...} extra={<a style={{fontSize:11.5,color:'#98a1b3'}}>查看全部</a>} size="small">` |
| `.proj-scroll` 滚动区：`max-height 96px; overflow-y:auto; padding-right 2px`；滚动条 `width 4px`、滑块 `#d8dfea`、圆角 `3px` | 无内置组件，自绘 `div` + `::-webkit-scrollbar` CSS；`<List>` + `scroll` 亦可 |

### 3.10 全局主题 Token（把 demo 变量翻译成 AntD `ConfigProvider theme.token`）

```ts
// ConfigProvider theme={{ token: { ... } }}
colorPrimary: '#2563eb',          // demo --primary（注意 AntD 5 默认是 #1677ff，必须覆盖）
colorPrimaryHover: '#1d4ed8',     // demo .btn-primary:hover
colorPrimaryBg: '#eef3ff',        // demo --primary-soft
colorSuccess: '#10b981',          // demo --green
colorWarning: '#f59e0b',          // demo --orange
colorError: '#ef4444',            // demo --red
colorInfo: '#2563eb',
colorText: '#1f2937',             // demo --text
colorTextSecondary: '#5b6577',    // demo --text-2
colorTextTertiary: '#98a1b3',     // demo --muted
colorBorder: '#e6eaf2',           // demo --border
colorBgLayout: '#f4f6fa',         // demo --bg
colorBgContainer: '#ffffff',      // demo --card
borderRadius: 9,                  // demo 按钮/输入框圆角
fontSize: 14,                     // demo body
fontFamily: '"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif',
controlHeight: 34,                // demo 按钮实测高 ≈ 35px
lineHeight: 1.6,
```

> 契约基线（执行包 §8.1）要求卡片圆角 `8px`、边框 `#f0f0f0`、背景 `#f5f7fa`。→ 与 demo 的 `12px / #e6eaf2 / #f4f6fa` 冲突，**以契约为准**，见第 8 节第 7 条。

---

## 4. 工作台编辑器页（`#page-editor`）

### 4.1 页头

- 标题：`我的工作台`（`.page-title`，`20px/700`），右侧紧跟一个 `22×22` 的重命名铅笔按钮（`.pen`，`#98a1b3`，hover 底 `#eef1f7`）。
- 副标题：`高效组织工作，让每一天更有成就感`（`.page-sub`，`12.5px`，`#98a1b3`，`margin-top 2px`）。
- 操作区在右（`.head-actions`，`gap 10px`）：
  - `预览`（默认按钮，左侧带 `14×14` 眼睛图标）；
  - `保存`（主按钮，蓝色实心）。
- 契约里「编辑·预览切换」是一个开关（`编辑` / `预览` 两态），demo 是单按钮切换，文案在 `预览` ↔ `退出预览` 之间变化——**以契约为准**。

### 4.2 指标卡区

demo 实际 **4 张卡**，`.kpi-grid` 为 `repeat(4, 1fr)`、`gap 14px`。

**卡外壳**（`.kpi-card`）：白底、`1px solid #e6eaf2`、圆角 `12px`、`padding 14px 16px`、`display:flex; flex-direction:column`。

**每张卡的字段与排版**

| 位置 | 规格 |
|---|---|
| 标题 `.kpi-label` | `12.5px`、`#5b6577`，`display:flex; gap 6px`（同行右侧可挂徽标） |
| 计数徽标 `.kpi-count` | `margin-left:auto`、`10.5px`、`#98a1b3`、底 `#f2f4f8`、圆角 `8px`、`padding 0 7px` |
| 数值 `.kpi-value` | `27px / 700 / line-height 1.25 / letter-spacing -.5px / margin-top 4px`；单位用 `<small>`（`13px / 600 / margin-left 2px`） |
| 副标 `.kpi-foot` | `11.5px / #98a1b3 / margin-top 3px`；其中 `<b>` 为 `#10b981 / 600` |
| 列表区 `.proj-scroll` | `max-height 96px; overflow-y:auto; margin-top 7px`；每行 `.proj-mini`：`11.5px`、`padding 3.5px 0`、`gap 7px`；项目名 `.pmn` 固定 `76px`（超出省略号），百分比 `.pmp` 固定 `30px` 右对齐 |
| 进度条 | 高 `7px`，槽底 `#eef1f6`，渐变 `90deg #60a5fa→#2563eb` |

**四张卡的结构差异**

1. `今日任务` —— 标题 + 大数值 + 副标（副标里含一个绿色加粗数字）。
2. `进行中` —— 标题 + 大数值 + 纯文字副标。
3. `项目进度` —— 标题（右侧带 `4 个` 计数徽标）+ **没有大数值**，改为一条 `max-height 96px` 的项目进度列表（名称 / 进度条 / 百分比）。
4. `KPI 完成率` —— 标题 + 数值（单位用 `<small>`）+ 一条 `8px` 高绿色渐变进度条 + 文字副标。

**图标**：demo 的指标卡**没有图标**（标题行只有文字 + 可选计数徽标）。
**颜色规则**：数值主色 `#1f2937`；副标强调数字用 `#10b981`；项目进度条蓝渐变；完成率进度条绿渐变；失败/告警色 `#ef4444` 只用于通知红点。

> 契约口径（`openapi.yaml` `/api/stats/overview` + D-03）：4 张卡 = `今日任务(总数/已完成)`、`进行中(总数/今日到期)`、`项目进度(活跃项目数 + 列表)`、`本周完成率(百分比或 —)`；数字用 `overview.projectCount` 一处算；分母为 0 显示 `—`。
> demo 的假数字一律不抄。

### 4.3 画布区

- **容器**：`.editor` 为 `grid-template-columns: 1fr 252px`，`gap 16px`，`align-items start`；`.canvas` 白偏冷底 `#fbfcfe`、`1px dashed #cdd7e8`、圆角 `12px`、`padding 14px`、`min-height 480px`、`flex-wrap:wrap`、`gap 14px`、`align-content:flex-start`。
- **模块卡片** `.mod`：白底、`1px solid #e6eaf2`、圆角 `11px`、`overflow:hidden`、`display:flex; flex-direction:column`。
  - hover：`box-shadow 0 4px 14px rgba(28,40,70,.07)`；
  - 拖拽中 `.dragging`：`opacity .4`；
  - 拖放目标 `.over`：描边变 `#2563eb`；
  - 内容区 `.mod-body`：`padding 14px 16px`、`flex 1`、`overflow:hidden`；
  - **选中态：demo 没有**（只有 hover 阴影 + 拖放描边）。契约需要区分选中，实现时补 `border-color:#2563eb` 或 `box-shadow` 高亮。
- **标题栏**（模块内部 `.m-head`）：左标题右操作一行；标题 `13.5px/700`，可带灰色括注；右侧 `查看全部` 类文字 `11.5px/#98a1b3`，hover 变 `#2563eb`。
- **工具条** `.mod-tools`：绝对定位 `top:6px; right:6px`，`gap 4px`，**仅 hover 显示**（`display:none` → `flex`），`z-index 5`。
- **拖动手柄** `.mod-grip`：绝对定位 `left:6px; top:6px`，`22×22`，`cursor:move`，**仅 hover 显示**。
- **缩放手柄** `.rs`：绝对定位 `right:0; bottom:0`，`16×16`，`cursor:nwse-resize`，**仅 hover 显示**；内含 `8×8` 的 L 形两条边 `2px solid #c3cddd`，右下圆角 `3px`。
- **预览态**：`.editor.preview` 变单列，隐藏模块库；`.canvas` 描边转透明、底色转透明、`padding 0`；`.mod-tools` / `.mod-grip` / `.rs` 全部 `display:none !important`；`body.preview-mode` 下 `.tabs` 整排隐藏。
- **空画布**：`.canvas-empty` 居中，主文案 `13.5px #aab5c9`「拖拽模块到这里」，副文案 `12px #cbd4e4`「例如：任务卡片、欢迎语、项目概览等」。
- **栅格表现**：demo 是 flex + 百分比宽度公式（见 2.4），**高度是任意像素**。契约要求 CSS Grid `repeat(12, 1fr)` / `gap 16px` / `grid-auto-rows 72px`，模块用 `grid-column: span w`、`grid-row: span h`。

### 4.4 模块库「抽屉」

demo 实为右侧 `sticky` 侧栏 `.library`（宽 `252px`、白底、`1px solid #e6eaf2`、圆角 `12px`、`padding 12px`、`position:sticky; top:0`）。

- **顶部 Tab** `.lib-tabs`：`模块库` / `页面样式`，`gap 16px`，底部 `1px solid #e6eaf2`，选中 `#2563eb/600` + `2px` 下边。
- **分组标题** `.lib-group`：`11.5px`、`#98a1b3`、`margin 10px 4px 8px`。demo 只有两组：**基础模块**、**内容模块**。
- **项网格** `.lib-grid`：`repeat(3, 1fr)`、`gap 8px`。
- **单个项** `.lib-item`：`1px solid transparent`、圆角 `9px`、`padding 10px 4px 8px`、居中、`cursor:grab`、`user-select:none`；hover 底 `#f7f9fd`、边 `#dde5f2`；`:active` 为 `cursor:grabbing`。
  - 图标块 `.lib-ic`：`28×28`、圆角 `8px`、白字、居中、下边距 `5px`，底色取模块自身颜色；
  - 名称 `.lib-name`：`11px`、`#5b6577`、`line-height 1.3`。
- **说明文字**：demo 的库项**只有图标 + 名称，没有描述文字**。
- **可拖 / 不可拖的视觉区分**：demo **没有**（15 项全部可拖）。契约要求 3 个占位模块（`file` / `knowledge-list` / `ai`）置灰 + 「迭代」角标 + 不可拖入。
- 契约分类为 5 类（任务与日程 2 / 快捷入口 2 / 项目与数据 2 / 知识与资料 3 / 个性模块 6），与 demo 的 2 组不同。

### 4.5 设置 / 权限两个 Tab

demo 顶栏三个 Tab：`页面编辑` / `页面设置` / `访问权限`。

**页面设置**（`#tabSetting`）

- 容器 `.card`（`max-width 560px`，`padding 16px`），标题「页面设置」`13.5px/700`，`margin-bottom 14px`。
- 字段一：label「工作台名称」`12.5px/#5b6577`，`margin-bottom 6px`；`input` 全宽、`padding 8px 11px`、圆角 `9px`、`13px`。
- 字段二：label「页面说明」，同上。
- 底部提示：`12.5px/#98a1b3`「演示版仅示意，实际保存后生效。」

**访问权限**（`#tabPerm`）

- 容器 `.card`（`max-width 560px`），标题「访问权限」`13.5px/700`。
- 说明行：`12.5px/#5b6577`「一期只区分「仅自己」与「部门可见」两种。」
- 两个单选行：`display:flex; gap 9px; padding 9px 0; font-size 13px` —— 「仅自己可见」（默认选中）、「本部门可见（只读）」。
- 脚注：`12px/#98a1b3`「不做细粒度权限矩阵，不做外部分享链接。」

> 契约：`/workspace` 组件树 = `PageHeader` / `MetricsRow` / `GridCanvas` / `ModuleLibraryDrawer` / `VersionConflictModal`，**没有权限 Tab，也没有独立设置 Tab**；名称与副标题走单独 PUT、不参与版本号、不触发 409。v2 §1.3 明确「部门可见工作台」一期不做。→ 以契约为准，见第 8 节第 17、18 条。

---

## 5. 设置页（`#page-settings`）

### 5.1 Tab 结构

demo 是**顶部 Tab**，三项：`个人资料` / `账号管理` / `组织架构`（默认选中「组织架构」）。样式复用 3.4 的 `.tabs` / `.tab`。
页头：标题「设置」（`20px/700`，无重命名按钮）、副标题「个人资料、账号管理与组织架构都在这里」（`12.5px/#98a1b3`）；右上角操作区 `.head-actions` 只有一个默认按钮「新增下级」——该按钮**仅在「组织架构」Tab 可见**（切 Tab 时 `visibility:hidden`）。

> 契约：设置页用**左侧子导航 200px**（个人资料、修改密码；管理员追加账号管理、组织架构、工作台模板），共 5 项。demo 的顶部 Tab 形态与项数都不一致 → 以契约为准。

### 5.2 组织树

| 元素 | 规格 |
|---|---|
| 容器 | 左列 `320px`，`.card`（白底、`1px solid #e6eaf2`、圆角 `12px`、`padding 16px`） |
| 树头 `.tree-head` | 「组织结构」`12.5px/700/#5b6577` + 右侧总数（`11.5px/#98a1b3/400`）；`padding 0 6px 10px`；下边 `1px solid #e6eaf2`；`margin-bottom 8px`；两端对齐 |
| 节点行 `.tree-row` | `display:flex; align-items:center; gap 6px; padding 6px 7px; border-radius 7px; font-size 13px`；hover 底 `#f6f8fc` |
| 选中态 `.active` | 底 `#eef3ff`、字 `#2563eb`、`font-weight 600` |
| 展开箭头 `.caret` | `13×13`、`#98a1b3`、展开时 `rotate(90deg)`、`transition transform .15s`；叶节点 `visibility:hidden` |
| 节点图标 `.node-icon` | `14×14`，默认 `#98a1b3`；层级色：集团 `#8b5cf6`、公司 `#2563eb`、部门 `#0ea5e9`；选中时统一 `#2563eb` |
| 计数徽标 `.node-count` | `margin-left:auto`、`10.5px`、`#98a1b3`、底 `#f2f4f8`、圆角 `8px`、`padding 0 6px`；选中行改白底 + `#2563eb` 字 |
| 层级缩进 `.tree-children` | `margin-left 14px; padding-left 8px; border-left 1px dashed #e3e8f2`；折叠时 `display:none` |

> 契约：树最多 **4 级**（D-07 改判），人员挂末级（无子节点）节点；`OrgNode.userCount` 只统计**直接挂在本节点**的用户（含 disabled），**不递归**。demo 的树计数是递归汇总 → 以契约为准，见第 8 节第 11、12 条。

### 5.3 面包屑 / 统计行 / 人员表格 / 空状态

**面包屑** `.crumb`：`12.5px`、`#98a1b3`、`margin-bottom 12px`；层级名用 ` / ` 连接，分隔符 `/` 与末尾 `·` 用 `#c9d2e2`；当前节点用 `<b>`（`#1f2937/600`）。

**统计行** `.stat-row`：`display:flex; gap 26px; margin-bottom 14px`；每项两块——数字 `.n`（`19px/700`）+ 标签 `.l`（`11.5px/#98a1b3`）。demo 三项：人员 / 部门 / 公司。

**人员表格** `table.people`：列与宽度 —— 姓名（`100px`，字重 600）、登录账号（`120px`，字 `#5b6577`）、所属公司、部门、状态（`80px`，`.pill` 药丸「在职」）。表头与行样式见 3.3。demo **无分页、无操作列**。

**空状态框** `#peopleEmpty`（`.empty-box`）：`padding 60px 0`、居中、`13px`、`#98a1b3`，文案「该节点下暂无人员」。

**管理员视角提示条** `.hint`（表格下方）：虚线边、圆角 `10px`、`padding 11px 14px`、`12.5px`、`#5b6577`、底 `#fbfcff`；文案「这是**管理员视角**。普通用户登录后看不到这个页面，只能在个人资料里看到自己所属的公司与部门。」，其中 `<b>` 变 `#1f2937`。

### 5.4 账号表格

- 表格上方一行：左「账号管理」`13.5px/700`；右一个默认按钮「批量导入」。
- 列：姓名（`100px`，600）、登录账号（`120px`，`#5b6577`）、部门、角色（`90px`）、状态（`80px`，`.pill`「在职」）。
- demo **没有**新增/编辑/停用/重置的行内操作，也**没有分页**。

### 5.5 个人资料（demo 版）

- 容器 `.card`（`max-width 540px`），标题「个人资料」`13.5px/700`。
- 用两列描述表（`table.people`）：左列固定 `110px`、字 `#98a1b3`；右列为值，**仅姓名加粗 600**。字段：姓名 / 登录账号 / 所属公司 / 所属部门 / 角色。
- 底部 `.hint`：「普通用户只能看到自己所属的公司与部门，只读，且看不到组织架构管理入口。」
- demo 该表**全部只读、且没有改密入口**。契约：姓名可编辑（`Form` + `PUT /api/users/:id`），其余只读（`Descriptions`），并提供进入 `/settings/password` 的入口 → 见第 8 节第 19 条。

---

## 6. 占位页（`#page-ph`）

任务管理 / 项目管理在 demo 里共用一个占位页：

- 页头：标题由导航项 `data-title` 注入（`任务管理` / `项目管理`，`20px/700`）；副标题「一期范围内，本次演示未展开」（`12.5px/#98a1b3`）；**没有右侧操作区**。
- 主体：一张 `.card`（白底、`1px solid #e6eaf2`、圆角 `12px`、`padding 16px`），内含 `.empty-box`（`padding 60px 0`、居中、`13px`、`#98a1b3`），文案「这个板块已列入一期范围，演示页只做了工作台编辑与组织架构。」。

> 契约：任务管理（`/tasks`）、项目管理（`/projects`）、项目详情（`/projects/:id`）都是**一期正式页面**，不是占位页。契约里唯一的「占位」是模块库中的 3 个 placeholder 模块，`emptyState` 文案为「功能迭代中」+「迭代」角标。见第 8 节第 16 条。

---

## 7. 文案风格

### 7.1 措辞习惯

- **按钮**：动词开头、2–4 字、无感叹号、无问号。实例：`保存`、`预览`、`新增下级`、`批量导入`、`查看全部`、`全部`、`本周`、`+ 新建`、`迭代中`。
- **提示语（Toast）**：短句，常带动作结果；括号补注演示状态。实例：`已保存`、`已添加「待办清单」`、`这个模块已经在工作台上了`、`预览模式：编辑控件已隐藏`、`已回到编辑模式`、`在「示例研究院」下新增部门（演示版未接后端）`。
- **流程说明用箭头串联**：实例：`批量导入：选部门 → 上传 Excel → 逐行校验 → 导出账号与初始密码（演示版未接后端）`。
- **空状态**：先说事实、再说范围，不写「暂无数据」这种模板词。实例：`该节点下暂无人员`、`拖拽模块到这里` / `例如：任务卡片、欢迎语、项目概览等`、`这个板块已列入一期范围，演示页只做了工作台编辑与组织架构。`
- **标注"不做的事"**：契约/说明性文案会明确排除项。实例：`不做细粒度权限矩阵，不做外部分享链接。`、`演示版仅示意，实际保存后生效。`
- **中英混排**：中文名词 + 空格 + 英文缩写（`AI 助手`）；层级用中文（`集团` / `公司` / `部门`）。
- **括注补充信息**：圆括号内放限定（`本部门可见（只读）`、`（演示版未接后端）`），方括号/尖括号放程序标签。
- **句末标点**：正文说明句用句号；Toast 与按钮文案不用标点。

### 7.2 空状态话术正反例

| 正例（demo 原文风格） | 反例（不要写） |
|---|---|
| 该节点下暂无人员 | 暂无数据 |
| 拖拽模块到这里 / 例如：任务卡片、欢迎语、项目概览等 | 请添加数据 |
| 这个板块已列入一期范围，演示页只做了工作台编辑与组织架构。 | 功能开发中，敬请期待 |
| 功能迭代中（契约 `emptyState` 原文） | Module not found |
| 已添加「待办清单」 | 添加成功！🎉 |
| 这个模块已经在工作台上了 | 该模块已存在，请勿重复添加 |

### 7.3 实际出现的原文摘录（8 条）

1. `高效组织工作，让每一天更有成就感` —— 工作台副标题
2. `拖拽模块到这里` —— 画布空态主文案
3. `例如：任务卡片、欢迎语、项目概览等` —— 画布空态副文案
4. `已添加「待办清单」` —— 添加模块后的 Toast
5. `这个模块已经在工作台上了` —— 重复添加时的 Toast
6. `预览模式：编辑控件已隐藏` —— 切预览态的 Toast
7. `该节点下暂无人员` —— 人员表空状态
8. `这是管理员视角。普通用户登录后看不到这个页面，只能在个人资料里看到自己所属的公司与部门。` —— 管理员提示条
9. `不做细粒度权限矩阵，不做外部分享链接。` —— 权限说明脚注
10. `演示版仅示意，实际保存后生效。` —— 页面设置脚注

### 7.4 字号层级

见 1.5。层级关系：`20px` 页面标题 > `19px` 统计数字 > `13.5px` 卡片标题 > `13px` 按钮/导航/Tab > `12.5px` 副标题/正文说明 > `12px` 表头 > `11.5px` 脚注 > `11px` 图标下文字 > `10.5px` 徽标 > `10px` 角标。

---

## 8. 实现注意事项

### 8.1 demo 与契约冲突清单

> 统一规则：**demo 只作视觉参考。凡与 v2 / 执行包 / D-xx 冲突，一律以契约为准。**

| # | 项目 | demo 这样做 | 契约要求那样 | 结论 |
|---|---|---|---|---|
| 1 | **模块总数** | 15 个（基础 9 + 内容 6），全部可拖入画布 | 15 个 = active 12 + placeholder 3；`file`/`knowledge-list`/`ai` 只在模块库展示 | 数字巧合相同，**口径以契约为准** |
| 2 | **模块分类** | 2 组：基础模块 / 内容模块 | 5 组：任务与日程 2 / 快捷入口 2 / 项目与数据 2 / 知识与资料 3 / 个性模块 6 | 以契约为准 |
| 3 | **模块 key** | 自造 15 个 key：`todo` `project` `quick` `calendar` `file` `ai` `list` `chart` `idea` `text` `gallery` `notice` `links` `embed` `divider` | 12 active：`todo` `project-progress` `quick-entry` `calendar` `data-chart` `idea` `text` `notice` `links` `embed` `gallery` `divider` | 以契约为准，唯一来源 `packages/shared/src/modules.ts`（demo `project`→`project-progress`、`quick`→`quick-entry`、`list`→`knowledge-list`、`chart`→`data-chart`） |
| 4 | **模块中文名** | 待办清单 / 日历日程 / 图片轮播 / 链接导航 / 嵌入网页 | 今日待办 / 日历 / 图片墙 / 链接列表 / 嵌入内容 | 以契约为准 |
| 5 | **指标卡口径** | 4 张：今日任务（总数+已完成+剩余）、进行中（总数+今日到期）、项目进度（**只有列表、无总数**）、**KPI 完成率**（% + 本周 x/y） | 4 张：今日任务(总数/已完成)、进行中(总数/今日到期)、项目进度(**活跃项目数** + 列表)、**本周完成率**（百分比或 `—`） | 以契约为准；`weeklyRate` 分母为 0 显示 `—`（D-02），demo 无此态 |
| 6 | **指标卡数据来源** | 硬编码假数字 | 前三张卡取 `/stats/overview`；项目进度卡另取 `GET /projects?pageSize=100`（D-03：总数用 `overview.projectCount`，一处算） | 以契约为准；demo 的 12/5/7/28/6/76% 一律不抄 |
| 7 | **画布栅格** | 12 列、`gap 14px`、画布 `padding 14px`、无最大宽度；模块宽用百分比公式、高用任意 px；可任意拖拽缩放 | 12 列、`gap 16px`、行高 `72px`、左右内边距 `24px`、最大宽度 `1440px` 居中；`w ∈ {3,4,6,12}`、`h` 为 2–12 整数行；只存 `sort` 不存 `x/y`；**不做拖拽自由布局** | 以契约为准；demo 的自由布局与自由 px 高度全部丢弃 |
| 8 | **尺寸约束** | 宽度 3–12 连续可调，高度最小 `70px` | 宽度吸附 3/4/6/12；高度整数行 2–12；不小于各模块 `minSize`；`divider` 固定 `12×2` 不可缩放 | 以契约为准 |
| 9 | **侧栏宽度与导航项** | `208px`；6 项（含「知识库」「AI 助手」两项禁用 + 「迭代」标签） | `220px`；**固定 4 项**：工作台 / 任务管理 / 项目管理 / 设置；不显示知识库、AI 助手 | 以契约为准；demo 的禁用项与「迭代」导航标签整体删除 |
| 10 | **顶部栏内容** | 全局搜索框 + 通知铃铛（带红点）+ 渐变头像 | 只显示当前用户名 + 角色标签 + 退出；**不显示搜索 / 通知 / AI** | 以契约为准；demo 的 `.search`、`.icon-btn`、`.dot` 全部删除 |
| 11 | **品牌** | 「WorkBuddy」+ 渐变 `W` 标 | 产品名「工作台」 | 以契约为准 |
| 12 | **全局色板** | 圆角 `12px`、边框 `#e6eaf2`、底色 `#f4f6fa`、主色 `#2563eb` | 卡片圆角 `8px`、边框 `#f0f0f0`、背景 `#f5f7fa`、AntD 默认蓝 | 以契约为准（主色保持 AntD 默认蓝即可，不做品牌定制） |
| 13 | **模块总数上限 / 重复** | 不限制总数、重复模块被拒绝（`divider` 除外） | 总数 ≤ 14；同一 `module_key` 只能一条（`divider` 除外）；`divider` ≤ 3 | 以契约为准 |
| 14 | **保存与版本** | 保存写 `localStorage`（`wb_workbench_layout_v3`），无版本号 | 必须带 `version`；冲突 409 弹「刷新丢弃本地」/「覆盖保存」；`localStorage` 只做草稿不作权威存储 | 以契约为准 |
| 15 | **名称/副标题保存** | 在独立「页面设置」Tab 里改，底部写「演示版仅示意」 | 单独 PUT、不参与版本号、不触发 409；`name` 1–128、`subtitle` 0–256（空存 `null`） | 以契约为准；Tab 形态取消，改为页头内编辑 |
| 16 | **访问权限 Tab** | 有「访问权限」Tab（仅自己 / 本部门可见（只读）） | v2 §1.3 明确一期不做「部门可见工作台」；`/workspace` 组件树无权限 Tab | 以契约为准，删除该 Tab |
| 17 | **预览态** | 预览时隐藏模块库 + 工具条 + 手柄，**并隐藏整排 Tab**，按钮文案变「退出预览」 | 预览隐藏模块库、删除按钮、缩放手柄，**只读渲染**；预览不写库 | 以契约为准（Tab 与保存按钮保留） |
| 18 | **占位页** | 任务管理 / 项目管理是占位页 | 二者都是一期正式页面（`/tasks`、`/projects`、`/projects/:id`） | 以契约为准；占位只用于 3 个 placeholder 模块（`emptyState`「功能迭代中」+「迭代」角标） |
| 19 | **个人资料** | 纯只读描述表，无改密入口 | `name` 可编辑（`Form`），其余 `Descriptions` 只读；有 `/settings/password` 入口；首次登录强制改密 | 以契约为准 |
| 20 | **设置页导航形态** | 顶部 Tab 三项（个人资料 / 账号管理 / 组织架构） | 左侧子导航 `200px`，管理员 5 项（个人资料 / 修改密码 / 账号管理 / 组织架构 / 工作台模板） | 以契约为准 |
| 21 | **组织层级数** | 固定 3 层（集团 / 公司 / 部门） | **上限 4 级 + 人员挂末级（无子节点）节点**（D-07 需求变更） | 以 D-07 为准 |
| 22 | **人员计数口径** | 树节点计数 = 递归统计所有子孙节点人数 | `OrgNode.userCount` 只统计**直接挂在本节点**的用户（含 disabled），不递归 | 以契约为准 |
| 23 | **人员表列** | 姓名 / 登录账号 / 所属公司 / 部门 / 状态，无分页、无操作列 | org 页只列挂在该节点的用户；users 页列为 `account`/`name`/部门/角色/状态/最近登录/操作，操作列固定右侧（编辑 / 停用 `Popconfirm` / 重置密码），带分页 | 以契约为准 |
| 24 | **批量导入格式** | Toast 文案写「上传 **Excel** → 逐行校验 → 导出账号与初始密码」 | **CSV**（UTF-8 可带 BOM、首行表头、三列 姓名/账号/角色、≤1000 行、≤2MB）；先选部门；结果表 `success`/`skipped`/`failed` + 错误行行号 + 一次性初始密码列表 | 以契约为准，Excel 改 CSV |
| 25 | **导入 / 重置的密码呈现** | 无弹窗，密码只出现在 Toast 文案里 | `ResetPasswordModal` 显示一次性密码 + 复制，关闭后不可再查；导入结果提示「只显示一次」 | 以契约为准 |
| 26 | **角色可见性** | 账号表直接列「角色」，无权限区分说明 | 只有超管能设角色；管理员表单不显示 `role` 控件，提交 `role` 一律 403 | 以契约为准 |
| 27 | **指标卡图标** | 指标卡**没有图标** | 契约未强制指标卡图标；空状态与 403/404 页必须有图标 | 指标卡可无图标（按 demo）；空状态必须有图标 |
| 28 | **模块选中态** | 只有 hover 阴影与拖放描边，**没有选中态** | 编辑器需要区分选中模块（用于配置面板） | 实现时补选中态（建议 `border-color:#2563eb`），不违反契约 |
| 29 | **模块库说明文字** | 库项只有图标 + 名称，无描述 | 契约未强制描述，但 5 分类下建议补一行说明 | 可选 |
| 30 | **全局搜索 / 通知 / AI** | 顶部有搜索框、通知铃 + 红点，导航有「AI 助手」 | 明确不做：全局搜索、通知中心、AI 对话 | 以契约为准，删除 |
| 31 | **图表库** | 数据报表模块用手写 div 柱状图（三种渐变柱） | **不引图表库**，用 AntD `Progress` / `Statistic` 组合 | 以契约为准；视觉上保留 demo 的柱形倾向即可 |
| 32 | **未保存离开提示** | 无 | 有未保存改动离开页面要提示 | 以契约为准 |
| 33 | **数据报表模块统计口径** | demo 柱子是硬编码「已完成 / 进行中 / 未完成」三值 | `GET /stats/tasks` 返回 `todo`/`doing`/`done` | 以契约为准 |

### 8.2 demo 用手写 CSS + 原生 DOM，实现时需换成 AntD 组件的地方

| demo 写法 | 实现时换成 | 备注 |
|---|---|---|
| `.app` / `.main` / `.content` 手写 flex | `<Layout>` + `<Layout.Sider>` + `<Layout.Header>` + `<Layout.Content>` | 侧栏 `220px`（契约）；`content` 另加 `max-width:1440px; margin:0 auto` |
| `.sidebar` + `.nav-item` 手写深色列表 | `<Layout.Sider theme="dark" width={220}>` + `<Menu theme="dark" mode="inline" items={...} />` | 4 项导航，禁用的两项删除 |
| `.nav-tag` 手写小标签 | `<Tag>` | 契约里导航无「迭代」标签，整体不用 |
| `.topbar` 手写 | `<Layout.Header style={{ height: 56, lineHeight: '56px', padding: '0 22px', borderBottom: '1px solid #e6eaf2' }}>` | 右侧改「用户名 + 角色标签 + 退出」`<Dropdown>` |
| `.search` / `.icon-btn` / `.dot` / `.avatar` | `<Input.Search>` / `<Badge dot>` / `<Avatar size={30}>` | 契约删除搜索与通知，只留 `<Avatar>` + 文字 |
| `.btn` / `.btn-primary` / `.btn-ghost` | `<Button>` / `<Button type="primary">` / `<Button type="text">` | 靠 `ConfigProvider theme.token` 调圆角与主色 |
| `.tabs` / `.tab` | `<Tabs type="line" tabBarGutter={4} items={...} />` | 设置页改左侧 `<Menu>` 子导航 |
| `.lib-tabs` / `.lib-tab` | `<Tabs>` | 「页面样式」可留空或删 |
| `.kpi-card` / `.kpi-value` / `.kpi-label` / `.kpi-count` / `.kpi-foot` | `<Card size="small">` + `<Statistic>` + `<Badge>` + `<Typography.Text>` | 数值样式走 `valueStyle` |
| `.pbar` / `.pbar > i` | `<Progress showInfo={false} strokeWidth={7} strokeColor={{ from, to }} />` | 绿条同理 |
| `.canvas` / `.mod` / `.mod-body` | `<div>` + CSS Grid（`repeat(12,1fr)` / `gap 16px` / `grid-auto-rows 72px`）+ `<Card size="small" hoverable>` | **不用 `react-grid-layout`**（decisions.md 明确不引）；宽度用 `grid-column: span w`、高度 `span h` |
| `.mod-tools` / `.mtool` / `.mod-grip` / `.rs` | 无 AntD 对应件 | 全部手绘 `div` + `@ant-design/icons`；`.mtool` 里的删除外包 `<Popconfirm>` |
| `.library` sticky 侧栏 | `<Drawer placement="right" width={252}>` | 契约命名 `ModuleLibraryDrawer` |
| `.lib-item` / `.lib-ic` / `.lib-name` / `.lib-group` / `.lib-grid` | 手绘 `div` + CSS Grid（3 列 `gap 8px`），图标用 `@ant-design/icons` | 占位模块加 `<Tag>迭代</Tag>` 并置灰、禁拖 |
| `.tree` / `.tree-row` / `.caret` / `.node-icon` / `.node-count` / `.tree-children` | `<Tree treeData icon switcherIcon showLine />` + `theme.token.colorPrimaryBg` | 注意 demo 的「点 caret 只展开不选中」需自行实现 |
| `table.people` | `<Table size="small" pagination scroll={{ x }} >` | 加 `components.header.cell` 覆盖表头底色；操作列 `fixed:'right'` |
| `.pill` | `<Badge status="success" text="在职" />` | 停用态 `status="default"` |
| `.empty-box` / `.canvas-empty` | `<Empty>` | 契约要求空状态带图标 + 可选行动按钮 |
| `.hint` | `<Alert type="info" showIcon={false}>` | 覆盖虚线边与底色 |
| `.toast` | `message` / `notification`（`<App>` + `App.useApp()`） | AntD message 为白底卡，不复刻深色浮层 |
| `.pen`（重命名） | `<Button type="text" icon={<EditOutlined/>} />` | 尺寸 `22×22` |
| `.page-head` / `.page-title` / `.page-sub` / `.head-actions` | `<PageHeader>`（AntD 5.12+）或 `<Flex>` + `<Typography.Title level={3}>` | 标题 `20px` 需覆盖 `Typography.Title` 默认字号 |
| `.mod` 内部 `.m-head` / `.m-title` / `.m-more` | `<Card title extra>` | `extra` 文字 `11.5px` |
| `.todo-list` / `.ck` / `.tx` / `.tm` | `<List>` + `<Checkbox>` | 圆形勾选圈需 CSS `border-radius:50%` |
| `.qi-grid` / `.qi` / `.qi-ic` | `<Row gutter={[10,10]}>` + `<Col span={6}>` + `<Button type="text">` | |
| `.ai-list` / `.proj-row` / `.txt-note` / `.ph-line` | `<List>` / `<Typography.Text>` / `<Skeleton>` | |
| `.hr-line` | `<Divider>` | |
| `.toast` / `localStorage` 存布局 | 布局草稿可用 `localStorage`，但**权威存储是后端** | `version` CAS + 409 冲突弹窗 |
| 全部内联 `<svg>`（`stroke-width` 1.8/1.9/2/2.2/2.4） | `@ant-design/icons`（`Outlined` 系列，线宽风格接近） | 契约明确不引第二套图标库 |

### 8.3 其他实现提醒

1. **字体**：demo 是 `"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif`；契约指定 `system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif`——以契约为准。
2. **响应式**：demo 全篇无媒体查询，固定 208px 侧栏；契约为桌面优先、最小 1024px、小于 1024px 横向滚动不压缩 12 列——以契约为准。
3. **画布为空**：demo 文案「拖拽模块到这里 / 例如：任务卡片、欢迎语、项目概览等」；契约为「从模块库添加第一个模块」——以契约为准（文案）。
4. **可访问性**：demo 纯图标按钮（`.pen`、`.mtool`、`.icon-btn`）只有 `title`，无 `aria-label`；契约要求按钮有文字或 `aria-label`、表单 label 关联、颜色不是唯一状态表达（如「在职」药丸要配文字）。
5. **深色侧栏与浅色内容区的对比**：demo 侧栏 `#1c2033`（近黑蓝），内容 `#f4f6fa`（冷灰），主色 `#2563eb` 只在选中/强调处出现，整体是「低饱和 + 蓝色点缀」的观感；实现时保持这个层级关系即可，颜色值本身以契约为准。

---

### 附 A：提取自 demo 的关键 CSS 变量原始值

以下为 demo `<style>` 块中 `:root` 声明块的**原样摘录**（共 **15** 个变量，与第 1.1 节表一致）：

```css
  :root {
    --bg: #f4f6fa;
    --card: #ffffff;
    --border: #e6eaf2;
    --text: #1f2937;
    --text-2: #5b6577;
    --muted: #98a1b3;
    --primary: #2563eb;
    --primary-soft: #eef3ff;
    --green: #10b981;
    --orange: #f59e0b;
    --purple: #8b5cf6;
    --red: #ef4444;
    --radius: 12px;
    --side: #1c2033;
    --side-2: #252a40;
  }
```

引用频次（demo 全文 `var(--x)` 出现次数）：

| 变量 | 引用次数 | 变量 | 引用次数 |
|---|---|---|---|
| `--muted` | 20 | `--radius` | 4 |
| `--text-2` | 19 | `--bg` | 1 |
| `--primary` | 15 | `--side` | 1 |
| `--border` | 15 | `--side-2` | 1 |
| `--text` | 10 | `--red` | 1 |
| `--primary-soft` | 1 | `--green` | 1 |
| `--card` | 0（声明未用，正文用硬编码 `#fff`） | `--orange` | 0（声明未用） |
| `--purple` | 0（声明未用，正文用硬编码 `#8b5cf6`） | | |

---

### 附 B：自检记录

| 自检项 | 命令 | 实际结果 |
|---|---|---|
| 一级小节数 | `grep -c "^## " docs/contracts/visual-baseline.md` | **8**（`## 1.` ~ `## 8.`；附 A / 附 B 为 `###` 级标题，不计入 `^## `） |
| demo `:root` 块数 | `grep -c ":root" demo-工作台与组织架构.html` | **1**（全文件仅一处 `:root`） |
| demo `:root` 变量个数 | `awk '/:root \{/,/\}/' demo-…html \| grep -cE "^\s*--[a-z0-9-]+:"` | **15** |
| 第 1 节列出条数 | `awk '/^### 1.1 CSS 变量/,/^### 1.2/' visual-baseline.md \| grep -cE "^\| \`--"` | **15** ✅ 与 `:root` 一致 |
| demo 文件规模 | `wc -l -c demo-工作台与组织架构.html` | **1193 行 / 57517 字节（≈57KB）** |

> 一致性说明：第 1.1 节表格共 15 行，与 `:root` 块内 15 条变量声明**逐条对应**（含 3 个声明但未被 `var()` 引用的 `--card` / `--orange` / `--purple`）。
