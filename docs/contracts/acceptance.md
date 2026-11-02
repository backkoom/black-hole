# 验收契约（acceptance）

> 来源：v2 §12（40 项，编号 A1–G4 不改）。
> 分组计数：A 5 / B 10 / C 5 / D 5 / E 8 / F 3 / G 4 = 40。

## 阅读口径

- **验收内容（原文）**：逐字照抄 v2 §12 对应条目，不改写、不概括、不补充；本文件只做编号、验证方式、落点、接口的映射。
- **引用缩写**：**v2** =《工作台与组织架构-可执行版-v2.md》，**执行包** =《AI开发执行包-工作台与组织架构.md》。
- **涉及接口**：编号与路径取执行包 §6.4「34 个接口」表，编号即该表「#」列。原文未涉及接口的条目写 `—`，不猜测填充。
- **对应 Phase**：按执行包 §9.3–§9.7 判断；同一组可能跨 Phase，见下表。
- **验证方式**：只取「自动」或「手工」两种取值；E2E 计入「自动」。
- **落点命名约定**：接口测试 `apps/api/test/<域>.<主题>.test.ts`；端到端 `apps/web/e2e/<区域>.<主题>.spec.ts`；前端纯函数 `apps/web/src/lib/__tests__/<主题>.test.ts`；共享模块 `packages/shared/src/__tests__/<主题>.test.ts`；手工项写明人工步骤与建议脚本。
- 本文件是待验收的契约，不含「已完成 / 已通过」状态；执行结论按执行包 §10.4 另记。

验收环境与执行角色（引自 v2 §12，原文照抄）：

> 验收环境：1 个集团、1 个公司、1 个部门、7 个普通用户、1 个管理员（验收前由超管创建，并在首次登录后完成改密）、1 个超级管理员，初始共 9 个账号。种子账号（7 个普通用户和超管）统一 must_change_password=true；7 个普通用户也必须先完成首次改密，否则除 /auth/me、改密、退出外的业务接口一律 403。默认用改密后的普通用户执行任务、项目、灵感类验收；组织、账号、导入、模板类用改密后的管理员执行，涉及角色授予的用超管执行。

---

## 分组索引

| 组 | 主题 | 条数 | 对应 Phase |
|---|---|---|---|
| A | 认证与会话 | 5 | Phase 1（执行包 §9.3）；A3、A5 跨 Phase 1–2（重置密码、账号管理接口在 §9.4 落地） |
| B | 工作台 | 10 | Phase 3（§9.5：工作台壳、布局保存与版本冲突）+ Phase 5（§9.7：编辑器交互与 12 个模块）+ Phase 6（§9.8：逐条执行） |
| C | 任务 | 5 | Phase 4（§9.6：任务与统计后端）；C2 的今日任务分子在 Phase 6（§9.8）统计接线后复核 |
| D | 项目 | 5 | Phase 4（§9.6） |
| E | 组织、账号、导入 | 8 | Phase 2（§9.4） |
| F | 工作台模板 | 3 | Phase 3（§9.5：模板页与版本）；F1 的拖拽/缩放/删除交互在 Phase 5（§9.7） |
| G | 部署与非功能 | 4 | Phase 7（§9.9） |
| 合计 | — | 40 | Phase 0 出本契约；Phase 1–7 逐 Phase 执行，Phase 6（§9.8）逐条跑完 40 项 |

---

## A. 认证与会话（5）

### A1 正确账号密码登录，进入工作台
- **验收内容（原文）**：正确账号密码登录，进入工作台；错误密码提示统一，不泄露账号是否存在。
- **验证方式**：自动
- **落点**：apps/api/test/auth.login.test.ts；apps/web/e2e/auth.login.spec.ts
- **涉及接口**：1 POST /api/auth/login

### A2 连续 5 次错误锁定 10 分钟
- **验收内容（原文）**：连续 5 次错误锁定 10 分钟；锁定期正确密码也拒绝；到期可登录。
- **验证方式**：自动
- **落点**：apps/api/test/auth.lockout.test.ts
- **涉及接口**：1 POST /api/auth/login

### A3 首次登录/重置后强制跳转修改密码
- **验收内容（原文）**：首次登录/重置后强制跳转修改密码；新密码 8 位含字母数字；改后不再强制。
- **验证方式**：自动
- **落点**：apps/api/test/auth.must-change-password.test.ts；apps/web/e2e/auth.password.spec.ts
- **涉及接口**：1 POST /api/auth/login；3 GET /api/auth/me；4 PUT /api/auth/password；12 POST /api/users/:id/reset-password

### A4 退出后 Cookie 失效
- **验收内容（原文）**：退出后 Cookie 失效，受保护接口返回 401。
- **验证方式**：自动
- **落点**：apps/api/test/auth.logout.test.ts
- **涉及接口**：2 POST /api/auth/logout；3 GET /api/auth/me

### A5 普通用户访问账号管理页/接口返回 403
- **验收内容（原文）**：普通用户访问账号管理页/接口返回 403；管理员可访问。
- **验证方式**：自动
- **落点**：apps/api/test/users.permission.test.ts；apps/web/e2e/users.access.spec.ts
- **涉及接口**：9 GET /api/users；10 POST /api/users；11 PUT /api/users/:id；12 POST /api/users/:id/reset-password；13 POST /api/users/import；14 GET /api/users/import/template

---

## B. 工作台（10）

### B1 新用户首次登录看到模板 4 个模块
- **验收内容（原文）**：新用户首次登录看到模板 4 个模块：今日待办、项目进度、快速入口、灵感记录。
- **验证方式**：自动
- **落点**：apps/web/e2e/workspace.default-template.spec.ts；apps/api/test/workspace.template-copy.test.ts
- **涉及接口**：17 GET /api/workspace；15 GET /api/workspace/template

### B2 从模块库拖入模块
- **验收内容（原文）**：从模块库拖入模块，按指针所在模块的中点插到该模块前/后；重复模块（非分割线）被拒绝并提示。
- **验证方式**：自动
- **落点**：apps/web/e2e/workspace.drag-insert.spec.ts；apps/api/test/workspace.layout.test.ts
- **涉及接口**：19 PUT /api/workspace/layout；17 GET /api/workspace

### B3 拖动排序
- **验收内容（原文）**：拖动排序：向上、向下各测一次，顺序与预期一致，向下不能差一位。
- **验证方式**：自动
- **落点**：apps/web/e2e/workspace.drag-sort.spec.ts；apps/web/src/lib/__tests__/layout-sort.test.ts
- **涉及接口**：19 PUT /api/workspace/layout

### B4 缩放
- **验收内容（原文）**：缩放：宽度只能停在 3/4/6/12；高度为整数行且不小于 minSize。
- **验证方式**：自动
- **落点**：apps/web/e2e/workspace.resize.spec.ts；apps/web/src/lib/__tests__/layout-resize.test.ts
- **涉及接口**：19 PUT /api/workspace/layout

### B5 删除模块
- **验收内容（原文）**：删除模块；分割线可重复最多 3 条；总模块数上限 14。
- **验证方式**：自动
- **落点**：apps/web/e2e/workspace.module-limits.spec.ts；apps/api/test/workspace.layout-limits.test.ts
- **涉及接口**：19 PUT /api/workspace/layout；17 GET /api/workspace

### B6 保存后刷新页面
- **验收内容（原文）**：保存后刷新页面，布局、宽高、config 全部还原。
- **验证方式**：自动
- **落点**：apps/web/e2e/workspace.save-reload.spec.ts；apps/api/test/workspace.layout.test.ts
- **涉及接口**：19 PUT /api/workspace/layout；17 GET /api/workspace

### B7 两个标签页同时编辑
- **验收内容（原文）**：两个标签页同时编辑：后保存者收到 409；选择刷新丢弃本地，或确认覆盖后保存成功。
- **验证方式**：自动
- **落点**：apps/web/e2e/workspace.version-conflict.spec.ts；apps/api/test/workspace.version-conflict.test.ts
- **涉及接口**：19 PUT /api/workspace/layout

### B8 文本/公告/链接模块编辑内容并保存
- **验收内容（原文）**：文本/公告/链接模块编辑内容并保存，刷新后不丢失；内容按纯文本渲染，无 XSS。
- **验证方式**：自动
- **落点**：apps/web/e2e/workspace.content-module.spec.ts；packages/shared/src/__tests__/module-config.test.ts
- **涉及接口**：19 PUT /api/workspace/layout；17 GET /api/workspace

### B9 数据模块空状态（无任务/无项目/无灵感）
- **验收内容（原文）**：数据模块空状态（无任务/无项目/无灵感）与接口失败态（断网/500）显示正确，不白屏。
- **验证方式**：自动
- **落点**：apps/web/e2e/workspace.empty-error.spec.ts
- **涉及接口**：20 GET /api/tasks；25 GET /api/projects；30 GET /api/ideas；34 GET /api/stats/tasks

### B10 占位模块在模块库置灰
- **验收内容（原文）**：占位模块在模块库置灰、带“迭代”角标、不可拖入；默认布局不含占位模块。
- **验证方式**：自动
- **落点**：apps/web/e2e/workspace.placeholder.spec.ts；apps/api/test/workspace.placeholder-reject.test.ts
- **涉及接口**：17 GET /api/workspace；19 PUT /api/workspace/layout

---

## C. 任务（5）

### C1 新增任务
- **验收内容（原文）**：新增任务（标题、项目可选、优先级、截止日），列表出现。
- **验证方式**：自动
- **落点**：apps/api/test/tasks.crud.test.ts；apps/web/e2e/tasks.spec.ts
- **涉及接口**：21 POST /api/tasks；20 GET /api/tasks

### C2 改状态为进行中/已完成
- **验收内容（原文）**：改状态为进行中/已完成；done_at 自动写入/清空；今日到期的已完成任务进入今日任务分子。
- **验证方式**：自动
- **落点**：apps/api/test/tasks.status.test.ts；apps/api/test/stats.overview.test.ts
- **涉及接口**：23 PATCH /api/tasks/:id/status；33 GET /api/stats/overview

### C3 筛选今日、逾期、本周、按项目、按状态
- **验收内容（原文）**：筛选今日、逾期、本周、按项目、按状态，结果与定义一致。
- **验证方式**：自动
- **落点**：apps/api/test/tasks.filter.test.ts；apps/web/e2e/tasks.filter.spec.ts
- **涉及接口**：20 GET /api/tasks

### C4 任务可不挂项目
- **验收内容（原文）**：任务可不挂项目；挂项目后项目进度实时变化。
- **验证方式**：自动
- **落点**：apps/api/test/tasks.project-binding.test.ts；apps/api/test/projects.progress.test.ts
- **涉及接口**：21 POST /api/tasks；27 GET /api/projects/:id；25 GET /api/projects

### C5 软删任务后列表、统计、项目进度不再计入
- **验收内容（原文）**：软删任务后列表、统计、项目进度不再计入；数据库 deleted_at 非空。
- **验证方式**：自动
- **落点**：apps/api/test/tasks.soft-delete.test.ts
- **涉及接口**：24 DELETE /api/tasks/:id；20 GET /api/tasks；33 GET /api/stats/overview；25 GET /api/projects

---

## D. 项目（5）

### D1 新建项目进度 0%
- **验收内容（原文）**：新建项目进度 0%，任务数 0，状态进行中。
- **验证方式**：自动
- **落点**：apps/api/test/projects.crud.test.ts；apps/web/e2e/projects.spec.ts
- **涉及接口**：26 POST /api/projects；25 GET /api/projects

### D2 项目下 3 个任务完成 1 个，进度 33%
- **验收内容（原文）**：项目下 3 个任务完成 1 个，进度 33%；数据库无 total_items/done_items 字段。
- **验证方式**：自动
- **落点**：apps/api/test/projects.progress.test.ts；db/migrations/001_init.sql（核对无 total_items/done_items 字段）
- **涉及接口**：25 GET /api/projects；27 GET /api/projects/:id

### D3 有至少 1 个任务且全部完成，项目自动已完成
- **验收内容（原文）**：有至少 1 个任务且全部完成，项目自动已完成；新增/重开任务后自动回进行中。
- **验证方式**：自动
- **落点**：apps/api/test/projects.auto-complete.test.ts
- **涉及接口**：23 PATCH /api/tasks/:id/status；21 POST /api/tasks；25 GET /api/projects

### D4 0 任务项目不自动完成，进度显示 0%
- **验收内容（原文）**：0 任务项目不自动完成，进度显示 0%。
- **验证方式**：自动
- **落点**：apps/api/test/projects.progress.test.ts；apps/web/e2e/projects.empty.spec.ts
- **涉及接口**：26 POST /api/projects；25 GET /api/projects

### D5 删除项目后任务 project_id 置空，任务仍在
- **验收内容（原文）**：删除项目后任务 project_id 置空，任务仍在；项目列表不再显示。
- **验证方式**：自动
- **落点**：apps/api/test/projects.delete-unbind.test.ts
- **涉及接口**：29 DELETE /api/projects/:id；20 GET /api/tasks；25 GET /api/projects

---

## E. 组织、账号、导入（8）

### E1 组织树显示集团、公司、部门三层
- **验收内容（原文）**：组织树显示集团、公司、部门三层；人员通过 user.org_id 挂部门。
- **验证方式**：自动
- **落点**：apps/api/test/org.tree.test.ts；apps/web/e2e/org.spec.ts
- **涉及接口**：5 GET /api/org/tree；9 GET /api/users

### E2 先新增第二个公司，把部门移到该公司下
- **验收内容（原文）**：先新增第二个公司，把部门移到该公司下，整棵子树 path/level 更新；不能移动到自己的子孙下。
- **验证方式**：自动
- **落点**：apps/api/test/org.move.test.ts
- **涉及接口**：6 POST /api/org；7 PUT /api/org/:id；5 GET /api/org/tree

### E3 有下级或有人员的节点删除被拒绝
- **验收内容（原文）**：有下级或有人员的节点删除被拒绝；空部门可删。
- **验证方式**：自动
- **落点**：apps/api/test/org.delete-guard.test.ts
- **涉及接口**：8 DELETE /api/org/:id

### E4 管理员新增普通用户，选择部门、角色默认普通
- **验收内容（原文）**：管理员新增普通用户，选择部门、角色默认普通；新用户工作台复制模板。
- **验证方式**：自动
- **落点**：apps/api/test/users.create.test.ts；apps/web/e2e/users.spec.ts
- **涉及接口**：10 POST /api/users；17 GET /api/workspace

### E5 只有超级管理员能把用户设为管理员
- **验收内容（原文）**：只有超级管理员能把用户设为管理员；管理员不能停用/重置其他管理员；不能停用/降级最后一个超级管理员。
- **验证方式**：自动
- **落点**：apps/api/test/users.role.test.ts
- **涉及接口**：11 PUT /api/users/:id；12 POST /api/users/:id/reset-password

### E6 停用用户后无法登录
- **验收内容（原文）**：停用用户后无法登录；重置密码返回一次性临时密码，首次登录强制修改。
- **验证方式**：自动
- **落点**：apps/api/test/users.disable-reset.test.ts
- **涉及接口**：11 PUT /api/users/:id；12 POST /api/users/:id/reset-password；1 POST /api/auth/login

### E7 批量导入 7 个新账号
- **验收内容（原文）**：批量导入 7 个新账号（如 user08–user14，不与种子重复）：先选部门，CSV 三列（姓名/账号/角色）；重复账号另测一条跳过，错误行给行号；导入后 7 人挂在所选部门。
- **验证方式**：自动
- **落点**：apps/api/test/users.import.test.ts；apps/web/e2e/users.import.spec.ts
- **涉及接口**：13 POST /api/users/import；14 GET /api/users/import/template；9 GET /api/users

### E8 导入结果中的初始密码只返回一次
- **验收内容（原文）**：导入结果中的初始密码只返回一次，不落库；未修改前除 /auth/me、改密、退出外接口返回 403。
- **验证方式**：自动
- **落点**：apps/api/test/users.import.password.test.ts
- **涉及接口**：13 POST /api/users/import；3 GET /api/auth/me；4 PUT /api/auth/password；2 POST /api/auth/logout

---

## F. 工作台模板（3）

### F1 管理员在模板页编辑
- **验收内容（原文）**：管理员在模板页编辑（拖拽/缩放/删除），保存后版本 +1。
- **验证方式**：自动
- **落点**：apps/web/e2e/workspace-template.spec.ts；apps/api/test/workspace.template.test.ts
- **涉及接口**：15 GET /api/workspace/template；16 PUT /api/workspace/template

### F2 新建用户首次登录复制模板
- **验收内容（原文）**：新建用户首次登录复制模板；之后管理员改模板不影响已创建用户。
- **验证方式**：自动
- **落点**：apps/api/test/workspace.template-copy.test.ts
- **涉及接口**：10 POST /api/users；16 PUT /api/workspace/template；17 GET /api/workspace

### F3 普通用户访问模板页/接口返回 403
- **验收内容（原文）**：普通用户访问模板页/接口返回 403。
- **验证方式**：自动
- **落点**：apps/api/test/workspace.template.permission.test.ts；apps/web/e2e/workspace-template.spec.ts
- **涉及接口**：15 GET /api/workspace/template；16 PUT /api/workspace/template

---

## G. 部署与非功能（4）

### G1 HTTPS 打开无混合内容
- **验收内容（原文）**：HTTPS 打开无混合内容；HTTP 自动跳 HTTPS；测试机已信任内网 CA。
- **验证方式**：手工
- **落点**：手工：浏览器访问内网 https 域名，确认页面无 http:// 混合内容；执行 curl -I http:// 内网域名 验证 301 跳 https；测试机根证书信任状态由运维核对（内网 CA 推送属部署周事项）
- **涉及接口**：—

### G2 备份
- **验收内容（原文）**：备份：有独立备份目标时 pg_dump 每日全量保留 14 天；无目标按 11.3 降级为 7 天并书面接受；恢复到测试库，数据一致。
- **验证方式**：手工
- **落点**：手工：在备份目标机执行 pg_dump -Fc 每日全量并核对保留份数（有独立备份目标保留 14 天；无独立目标按 v2 11.3 降级为 7 天并书面接受）；恢复到测试库后抽查任务、项目、用户数量与源库一致。脚本建议：scripts/backup.sh、scripts/restore.sh
- **涉及接口**：—

### G3 时区
- **验收内容（原文）**：时区：容器 TZ=Asia/Shanghai；跨 00:00 创建任务，“今日”归属正确；时间戳显示 +08:00。
- **验证方式**：手工
- **落点**：手工：在验收环境确认应用容器与数据库 TZ=Asia/Shanghai；于当日 23:59:5x 与次日 00:00 前后各建一条任务，分别核对 GET /api/tasks?due=today 与 GET /api/stats/overview 的今日归属；页面任务时间显示为 +08:00。另在 apps/api/test/stats.timezone.test.ts 固化今日/本周口径断言
- **涉及接口**：21 POST /api/tasks；20 GET /api/tasks；33 GET /api/stats/overview

### G4 初始 9 个账号（7 普通 + 管理员 + 超管）可登录
- **验收内容（原文）**：初始 9 个账号（7 普通 + 管理员 + 超管）可登录（在 E7 导入前执行）；管理员看全员统计，普通用户只看自己；日志可按 requestId grep。
- **验证方式**：自动
- **落点**：apps/web/e2e/auth.accounts.spec.ts；apps/api/test/stats.scope.test.ts；scripts/verify-log-requestid.sh（按 requestId 检索服务端 JSON 行日志）。执行顺序：在 E7 批量导入之前执行；管理员账号由超管创建后先完成首次改密
- **涉及接口**：1 POST /api/auth/login；3 GET /api/auth/me；33 GET /api/stats/overview；34 GET /api/stats/tasks

---

## 未覆盖项说明

以下条目的「涉及接口」写 `—` 或接口只覆盖部分断言，原因逐条列明，不做猜测填充：

- **G1（HTTPS 打开无混合内容）**：涉及证书链终止、HTTP 301 跳转、客户端根证书信任，属部署与运维配置，34 个业务接口中无对应项，故接口写 `—`；落点为人工核对步骤。
- **G2（备份与恢复）**：涉及 `pg_dump -Fc` 调度、保留份数、恢复到测试库与数据抽查，属运维脚本，34 个业务接口中无对应项，故接口写 `—`；落点为人工步骤 + 建议脚本路径。
- **G3（时区）**：仅任务创建、任务列表、统计概览三个接口参与「今日归属」断言（21、20、33）；容器与数据库 `TZ` 配置、时间戳显示 `+08:00` 属环境与显示层，无接口对应，不另填。
- **G4（初始 9 个账号与日志）**：登录、当前用户、统计范围分别对应 1、3、33、34；「日志可按 requestId grep」是对服务端 JSON 行日志文件的检索，无接口对应，不另填。
- **D2（数据库无 total_items/done_items 字段）**：进度断言由 25、27 覆盖；字段缺失属迁移结构核对，落在 `db/migrations/001_init.sql`，无接口对应。
- **B9（接口失败态：断网 / 500）**：断网由 E2E 侧拦截请求模拟，500 由服务端异常触发；接口列只写各数据模块真实的数据源接口（20、25、30、34），失败注入方式属测试手段，无独立接口。

统计行：A 5 + B 10 + C 5 + D 5 + E 8 + F 3 + G 4 = 40。

## 自检

自检命令与实际结果（在本文件写完后于 `docs/contracts/` 目录执行）：

```
$ grep -c "^### " acceptance.md
40

$ grep -cE "^## [A-G]\. " acceptance.md
7

$ grep -nE "^## [A-G]\. " acceptance.md
37:## A. 认证与会话（5）
71:## B. 工作台（10）
135:## C. 任务（5）
169:## D. 项目（5）
203:## E. 组织、账号、导入（8）
255:## F. 工作台模板（3）
277:## G. 部署与非功能（4）
```

自检实际数字：

- `^### ` 开头的验收条目数：**40**（要求 40，一致）。
- `^## A. ` ~ `^## G. ` 开头的分组标题数：**7**（要求 7，一致）；A–G 分别为 5 / 10 / 5 / 5 / 8 / 3 / 4，合计 40。
- 编号序列：抽取自 v2 §12 的 `- [ ] ` 条目，A1–A5、B1–B10、C1–C5、D1–D5、E1–E8、F1–F3、G1–G4，与 v2 完全一致，未增、删、改。
- 说明：文件内 `^## ` 开头的二级标题共 11 行，含「阅读口径」「分组索引」「未覆盖项说明」「自检」4 个非分组标题；分组标题按 `^## [A-G]\. ` 计数，为 7 个。
- 验收内容一致性：40 条「验收内容（原文）」与 v2 §12 对应条目逐字比对无差异（含全角引号、空格与标点）。
