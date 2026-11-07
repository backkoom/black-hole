# 决策记录（decisions）

> 来源：《AI 开发执行包-工作台与组织架构》§9.2 交付物 7「已决策项 + 未决项 + 影响」。
> 本文件是 Phase 1~7 的裁判依据。**任何一条被改动，都要在这里改并写清影响面。**

决策人：老6（业务语义） / 老七（技术实现）
最后更新：2026-11-02（Phase 0 收尾）

---

## 零、一句话交代

契约阶段共拍板 **10 条技术口径 + 2 项业务变更（组织层级不设上限、500 人规模）**。
其中 **9 条是我按文档原文定的**（技术口径，改起来都是一行），
**需要老6 动手的只剩一件**：给一个 GitHub 凭据（D-12）。

---

## 一、已决策项

### D-01 🔴 用户管理接口：未知字段「自动剥离」还是「报错」

**问题**
执行包 §6.1 写「所有写接口 zod 校验；未知字段默认剥离」，
§6.5 又写「本人只能改 name，带其他字段 403」「管理员提交 role 一律 403」。
这两条互斥——**字段一旦被剥离，后面就判断不出「他到底带没带 role」，403 永远触发不了**，
验收 E5（只有超管能授予管理员）会测不出来。

**决策**
只有这 3 个接口用**严格校验**（带了不在白名单里的字段 → 直接 403/422）：

- `POST /api/users`
- `PUT /api/users/:id`
- `POST /api/users/import`（multipart，不涉及字段剥离）

其余 **31 个接口保持「未知字段默认剥离」**，行为不变。

**理由**
权限边界必须在服务端成立。「前端不给这个控件」不算权限控制。

**影响面**
`packages/shared` 增加一份 `USER_WRITE_FIELDS` 白名单；API 侧这两个路由改用 `z.object({...}).strict()`。
不影响任何其他接口。

**推翻成本**：低（改一个常量数组）。

---

### D-02 🟡 `weeklyRate` 的单位

**问题** §10.4 示例是 `"weeklyRate": 56`（百分数），但 §6.2 类型只写 `number | null`，没写单位也没写取整。

**决策**：`weeklyRate` = **0–100 的整数，四舍五入**；分母为 0 时返回 `null`（前端显示「—」，不显示 0%）。

**理由** 与 v2 §4.2「分母为 0 显示『—』」一致；整数避免前端再格式化一次。

**影响面**：`packages/shared/src/types.ts` 的 `Overview.weeklyRate` 注释 + `stats/overview` 的 SQL `ROUND()`。

**推翻成本**：低。

---

### D-03 🟡 项目进度卡的「活跃项目数」取哪份数

**问题** §8.4 说项目进度卡「另取 `GET /projects?pageSize=100`」，§3.6 说 `projectCount` 是活跃项目数。
两份数在项目超 100 个时会不一致。

**决策**：**数字用 `overview.projectCount`**（一处算，口径统一）；
`projects` 列表只用来显示明细行，列表超过 100 条时只影响明细、不影响数字。

**理由** 一处口径，避免同一屏幕两个数字打架。

**影响面**：`stats/overview` 与 `workspace` 模块的数据源分配。

**推翻成本**：极低。

---

### D-04 🟡 时间戳「带 +08:00」怎么落地

**问题** 文档要求序列化成 `2026-10-29T11:32:37+08:00`，
但 `pg` 驱动把 `timestamptz` 转成 JS `Date`，`toISOString()` 出来是 `...Z`。

**决策**
1. 连接层固定 `timezone=Asia/Shanghai`（连接参数 + `TZ` 环境变量双保险）；
2. 序列化统一输出 `+08:00` 偏移，**不依赖机器时区**（服务器时区被人改过也不出错）；
3. `date` 类型（`due_date`）输出 `YYYY-MM-DD`，不带时间。

**理由** 服务器时区不可控；验收 G3 直接查时间戳格式。

**影响面**：`apps/api/src/lib/serialize.ts`（新增一个时间格式化工具）+ 连接配置。

**推翻成本**：低。

---

### D-05 🟡 Origin 校验、登录态、强制改密，三个 403 谁先判

**问题** 三者都返回 403，混在一起测试没法断言「到底是哪一条拦的」。

**决策**：固定顺序 **① Origin/Referer 同源校验（403）→ ② 登录态（401）→ ③ must_change（403）**；
测试工具与 E2E **统一带 Origin 头**。

**理由** 安全优先（CSRF 检查放最前）；断言稳定，便于写自动化测试。

**影响面**：`apps/api` 中间件顺序；测试基类统一注入 `Origin` 头。

**推翻成本**：低。

---

### D-06 🟡 413 / 500 也要包统一格式

**问题** §6.1 要求统一 `{code, message, data}`，但 `@fastify/multipart` 超限抛的是框架自己的错，
JSON 解析失败、路由不存在、未捕获异常同理，不接管就会漏格式。

**决策**：写一个**全局 errorHandler**，把以下情况全部映射成统一格式：

| 情况 | HTTP | code |
|---|---|---|
| JSON 体 > 2MB / 上传文件 > 2MB | 413 | 413 |
| JSON 格式错 / 参数类型错 | 400 | 400 |
| 路由不存在 | 404 | 404 |
| 未捕获异常 | 500 | 500（只记 requestId，**不回堆栈**） |

**理由** 前端拿到统一格式才能用同一个错误渲染器；500 回堆栈会泄露内部信息。

**影响面**：`apps/api/src/app.ts` 注册 `setErrorHandler`。

**推翻成本**：低。

---

### D-07 🔴 组织架构：**层级数不设固定上限**，人员挂末级（需求变更，2026-11-02 修订）

**背景（三轮演进）**

| 轮次 | 起因 | 结论 |
|---|---|---|
| 初版 | v2 / 执行包原文 | 写死 **3 层**（集团 level1 / 公司 level2 / 部门 level3），人员挂第 3 层 |
| 修订 1（11-02 上午） | 老6：「组织架构做成四级组织架构，最终交付的时候可以创建、添加、导入就行」 | 改成「**上限 4 级** + 人员挂末级」 |
| **修订 2（11-02 下午）** | 老6 给出实际架构 **集团/公司/事业部/中心/部门/班组 6 级**，并反问：**「这个必须提前设计好？不能交付后客户自己创建吗？」** | **层级数不设固定上限**（本条） |

**老6 那个反问是对的，修订 1 的「上限 4 级」是过度约束。**
把上限写进 DDL 的 CHECK，客户交付后想建第 5、6 层就会被数据库直接挡住——
那就变成「必须提前设计好」了，违背「交付时客户自己创建」的原始诉求。

**决策**

| 项 | 决定 |
|---|---|
| **层级数** | **不设固定上限。** DDL 只保留宽松硬边界 `CHECK (level BETWEEN 1 AND 32)`（防脏数据，不表达业务含义） |
| **业务上限** | 由环境变量 **`MAX_ORG_LEVEL`** 控制，默认 **32**。客户想建 6 级、10 级都能建，不用改表、不用数据迁移 |
| **每级叫什么** | **不是系统约束，是用户数据。** 节点名由管理员在页面上填、导入时填。系统不管它叫「事业部」还是「战部」 |
| **人员归属** | 挂在**末级（无子节点的节点）**——这是语义约束，必须保留 |
| **老6 的实际架构** | 集团 / 公司 / 事业部 / 中心 / 部门 / 班组（6 级）→ **种子与验收用 6 级链**，但系统不限制只能 6 级 |

**规则对照（只有「3 层」这一条被改，其余保留）**

| v2 原文 | 本项目 |
|---|---|
| `org.level` CHECK 1..3 | **CHECK 1..32**（硬边界防脏数据；业务上限走 `MAX_ORG_LEVEL`） |
| 最多 3 层 | **不设固定上限**（`MAX_ORG_LEVEL` 可配，默认 32） |
| `app_user.org_id` 必须是 level 3 | **必须挂在无子节点的节点上**（末级）——语义不变 |
| 有人员的节点移动后必须仍是 level 3，否则 422 | **有人员的节点移动后必须仍无子节点，否则 422** |
| 同一 parent 下 name 唯一 | 不变 |
| 根节点只有一个，不可移动，不能新增第二个根 | 不变 |
| 移动不能成环 | 不变 |
| path 重算整棵子树 | 不变 |

**「末级」的判定口径**：该 org 节点没有子节点
（`NOT EXISTS (SELECT 1 FROM org c WHERE c.parent_id = $1)`）。
校验时机：创建用户 / 改用户部门 / 移动或新增组织节点时。
**存量数据不追溯**——已有人员挂在某节点后，该节点若被加了子节点，则它不再是末级，
此时**拒绝新增子节点**并提示「请先把人员移到新的末级节点」（422），避免留下不一致状态。

**为什么「人员挂末级」这条必须留**
它防的是「人员挂在中间层、下面还挂着子部门」导致的**归属含混**——
一个人算这个部门还是算上级？这是语义问题，跟层级数无关。
反过来，层级数纯粹是树有多深的问题，客户想多深就多深，系统没理由管。

**连带改动（已同步落地）**

| 位置 | 改动 |
|---|---|
| `db/migrations/001_init.sql` | `level smallint NOT NULL CHECK (level BETWEEN 1 AND 32)` + 注释说明 |
| `packages/shared/src/types.ts` | `OrgNode.level` 由 `1 \| 2 \| 3 \| 4` 改为 **`number`**（范围由后端保证） |
| `packages/shared/src/modules.ts` | 无 |
| `docs/contracts/openapi.yaml` | `OrgNode.level` enum → `integer, minimum 1, maximum 32`；`/api/org`、`/api/org/:id` 描述改为「不设固定上限」+ 末级规则 |
| `docs/contracts/pages.md` | 组织架构页 9 处层级表述（页面清单、组件树、字段校验、导入、必须覆盖、验收对应） |
| `docs/contracts/acceptance.md` | **原文一字未改**；新增 E 组「口径调整」说明 + E1 单条口径调整行；**编号与条数不变（仍 40 项）** |
| `docs/contracts/modules.md` | 无 |
| `.env.example` | 新增 `MAX_ORG_LEVEL=32` |
| 种子（Phase 1 实现） | 组织链改为 **6 级示例**：示例集团(集团) → 示例研究院(公司) → 示例事业部 → 示例中心 → 示例部门(部门) → 示例小组(班组)；中间三级为**结构示例名**，真实名称由导入时填 |

**影响面**：DDL 1 处、类型 1 处、应用层常量 1 个（`MAX_ORG_LEVEL`，读环境变量）、
接口描述若干、页面文档 9 处、验收**措辞行 2 处（原文不动）**。
**没有任何一条 40 项验收的编号、条数、原文被改动。**

**推翻成本**：极低（一个环境变量 + 一个 CHECK 常量）。
**这正是本次修订的收益——上限从「写死」变成「可配」，以后客户加层级永远不用改表。**

---

### D-08 🔴 数据库版本：统一 18（本条需要老6 配合一件事）

**问题**
文档 §4.1 写 PostgreSQL **16**，但**老6 本机装的是 18.6**。

**决策**：**开发与生产统一用 PostgreSQL 18**。

**理由（这条不是"哪个新用哪个"，是硬约束）**

> `pg_dump` 只能「低版本 → 高版本」恢复，**不能「18 → 16」倒着恢复**。
> 如果开发用 18、内网服务器装 16，验收 G2「备份恢复到测试库」会直接失败——
> **而且是在第 4 周才发现**。

既然本机已经是 18，就统一 18，把风险前移到今天。

**已同步落地**
- `docker-compose.yml`：`image: postgres:16` → `postgres:18`
- 本地开发实例：见下

**⚠️ 需要老6 做的唯一一件事**
**确认内网服务器能装 PostgreSQL 18**。
如果内网只有 16 的离线安装包，告诉我，我整体改回 16（含 docker-compose 与文档），
**越早越好，Phase 1 建表之后就难改了**。

**本机开发环境（已就绪，不用老6 动手）**

| 实例 | 端口 | 归属 | 用途 |
|---|---|---|---|
| 老6 自己装的 PG 服务 | 5432、5433 | 他的，**不碰** | 保留 |
| 本项目开发实例 | **15432** | 我新建 | 本项目开发与实测 |

- 数据目录：`D:\workspace\pg-dev\data`（独立，不与老6 的库混）
- 库/账号：`blackhole_dev` / `blackhole`（仅本地开发用，口令写在 `.env.example` 占位）
- **未改老6 已装的 PG 任何配置**（5432/5433 端口是他那个服务在监听，我第一次撞端口才发现）

---

### D-09 🔴 代码仓库位置与远端策略

**决策**

| 项 | 决定 |
|---|---|
| 本地仓库 | `D:\workspace\blackhole-app\`（符合「新建的一律放 D:\workspace」的规矩；`node_modules` + `pgdata` 都在 D 盘，C 盘不动） |
| 版本管理 | git，本地仓库，已初始化并提交（3 次提交，工作区干净） |
| **远端** | **不推 github.com 公共仓库**。这系统装的是公司真实组织架构与 7 名员工姓名，v2 明确「纯内网」。若要用 GitHub，必须 private + 人员用占位名；更推荐内网 Gitea/GitLab |

**理由**
v2 §0.1/§1.3 的前提是纯内网部署。代码泄露的组织架构与人员名单价值不低，
不值得为省事放公共仓库。

**本机 GitHub 工具链侦察（2026-11-02）**

| 项 | 结果 |
|---|---|
| GitHub Desktop | **已安装 3.6.7**（`C:\Users\Admin\AppData\Local\GitHubDesktop\app-3.6.7`），自带 git 可执行 |
| 登录状态 | ❌ **未登录**（`%APPDATA%\GitHub Desktop\accounts.yml` 不存在） |
| 仓库根目录 | 无 `Documents\GitHub` / `D:\GitHub` 等目录，**还没建过仓库** |
| git 凭据管理器 | ✅ `credential.helper = manager`（Git Credential Manager 2.9.0）→ push 可走浏览器授权，**无需我接触 token** |
| gh CLI | ✅ **2.103.3 已装**（`D:\workspace\_install\gh\extract\bin`，已入用户 PATH）；见 D-12 |
| Docker | ✅ **29.9.2 + Compose v5.6.1**（此前是 PATH 被裁剪才不可见）；`docker compose config` 已校验通过 |

**影响面**：不影响开发。远端等老6 给仓库地址再加，不影响排期。

**推翻成本**：零（加远端随时可加）。

---

## 一之三、D-12 GitHub 远端：通道已探明，只差一个凭据

**为什么不自己来**：建仓库、推代码都是**对外写操作**，且涉及公司组织架构信息。
按协作规矩，我先侦察、列清单，等你批。老6 已批准走 **gh CLI 自动化**路线。

**已完成的准备（2026-11-02）**

| 项 | 结果 |
|---|---|
| gh CLI | ✅ **2.103.3 已装**到 `D:\workspace\_install\gh\extract\bin`，已加入用户 PATH |
| 安装途径 | ⚠️ curl / Node 直连 GitHub 资产 CDN 均失败（`schannel` 断连 / 传输卡死），**最后用 PowerShell `Invoke-WebRequest` 下载成功** |
| `api.github.com` | ✅ 放行（200）→ **建库、token 校验、Git Data API 全部可用** |
| `github.com/*.git/info/refs` | ✅ 放行（200） |
| `github.com/*.git/git-receive-pack`（push 用） | ✅ 放行（401「No anonymous write access」= 通道通，只缺认证） |
| `github.com` 首页 / `/login/device/code` | ❌ **被本机代理（127.0.0.1:65001）502 挡死** |
| 直连不走代理 | ❌ 无直连出口，github.com 超时 |

**⚠️ 关键结论：浏览器设备流走不通，但不是网络不通**
`gh auth login --web` 依赖 `POST github.com/login/device/code`，该端点被代理挡 → 报 Bad Gateway。
**换 `--with-token` 即可**：token 校验只打 api.github.com（放行），完全绕开被挡的端点。

**所以只需要老6 做两件事（各自 1 分钟）**

1. **建私有仓库**（GitHub Desktop 里操作，浏览器授权也在这步完成）
   - 打开 GitHub Desktop → 登录 → File → New repository
   - 仓库名：`blackhole-app`；**Visibility 必须选 Private**
   - ⚠️ 必须 Private：仓库里有 `示例集团` / `示例研究院` / `示例部门` 这类真实组织名（openapi.yaml 示例与种子约定里）

2. **生成一个最小权限 token，写进文件（不要贴在聊天里）**
   - GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate
   - Resource owner：你的账号；Repository access：**Only select repositories → blackhole-app**（第 1 步建好后才选得到）
   - Repository permissions：**Contents → Read and write**（够 push 即可，其余一律不给）
   - 把 token 写进文件：`D:\workspace\_install\gh\token.txt`（纯文本，一行），然后只告诉我**文件路径**

**然后我做**：`gh auth login --with-token` → `gh repo view` 验证 → `git remote add origin` →
`git push -u origin master` → 回读仓库文件清单核对。全程 token 不进对话记录、不打日志。

**备选（不想生成 token 的话）**：老6 在 GitHub Desktop 里 Add local repository →
选 `D:\workspace\blackhole-app` → Push repository。首次 push 就完成了；
代价是以后每次同步要老6 点一下（或再给 token 让我走 API）。

**分支名**：当前是 `master`（git 默认）。要改成 `main` 我在推之前 `git branch -m main`，一句话即可。

**🔍 授权失败排查记录（2026-11-02 15:5x，连接器与 gh 都失败）**

老6 反馈：WorkBuddy 的 GitHub 连接器点「启用」也授权失败。实测结论如下：

| 出网通道 | 进程 | github.com | api.github.com | api.githubcopilot.com | POST /login/device/code |
|---|---|---|---|---|---|
| **127.0.0.1:47897** | `verge-mihomo.exe`（Clash Verge 内核，系统代理 `ProxyEnable=1`）—— **老6 的浏览器走这条** | 200 | 200 | 401（可达） | **成功返回 device_code** |
| **127.0.0.1:65001** | `sandbox-cli.exe`（WorkBuddy 沙箱代理）—— **我的命令行工具走这条** | CONNECT 502 | 200 | 401（可达） | **CONNECT 502** |

**根因**：不是账号问题，是**两条出网通道的能力不一致**。
沙箱出口 65001 只放行 `api.*` 与 `*.git/*` 这类 API/协议路径，
**`github.com` 主站（登录页、OAuth 授权页、设备流端点）一律 502**。

**连接器的授权流程（从 WorkBuddy 日志 `main.log` 抓到的真实 URL）**：

```
https://github.com/login/oauth/authorize?client_id=Iv23liIip3I7DTZzqlzq
  &redirect_uri=https://www.codebuddy.cn/console/as/p/connector/oauth/github/connect
  &response_type=code&scope=repo+user&state=...
```

即 **OAuth 授权码流程**：浏览器开授权页 → 回调 WorkBuddy 云端 → 云端换 token。
浏览器这一段走 47897 正常；**回调后云端要向 GitHub 换 token**，
若 WorkBuddy daemon 进程的出口也是 65001，这一步会被 502 挡死 → 表现为「授权失败」。

**已验证的解法（绕开主站主流程）**：**gh CLI 的设备流**。
`gh auth login --web` 失败，也是因为它请求 `/login/device/code` 被挡；
但**只要把 gh 的代理指向 47897，整条设备流立刻打通**：

```bash
export http_proxy=http://127.0.0.1:47897 https_proxy=http://127.0.0.1:47897
gh auth login --hostname github.com --git-protocol https --web --skip-ssh-key
```

实测：正常吐出一次性验证码（形如 `1C7F-346A`）+ `https://github.com/login/device`，
老6 在浏览器（走 47897，正常）输入验证码授权即可。
**设备流不需要 OAuth 回调、不需要 WorkBuddy 会话、不绑 WorkBuddy 账号**，
绕开了连接器失败的那个环节。拿到 token 后 `gh auth login --with-token` 落盘，
再 `gh repo create --private` + `git push`（push 同样要带 47897 代理）。

**连接器本身能不能修**：属于 WorkBuddy 侧把 daemon 进程的出网指向系统代理（47897）的问题，
**不在本项目范围内，也不该由本项目绕过**。本项目走 gh 通道即可。

**给老6 的判断依据**（连接器那条路若还想修，需要这些现象）：

1. 点启用后浏览器是否**真的打开了** `github.com/login/oauth/authorize` 授权页？
2. 授权页上显示的是**报错**（如 "This application is not authorized" / 404 / 证书错误）还是正常登录页？
3. 授权完跳回 `www.codebuddy.cn/console/as/p/connector/oauth/github/connect` 时显示什么？
   （实测该回调接口在**两条代理下都活着**，会返回结构化错误码
   `code=10001 / httpstatus=401 / msg=user identity cannot be verified`）
4. GitHub 账号：邮箱是否已验证？是否开了 2FA？是否属于启用了 SAML SSO 的组织？


---

## 一之二、D-10 迁移执行器：SQL 是唯一基线，但 node-pg-migrate 只认 .js/.ts

**问题**
执行包 §5 要求把 DDL 落成 `db/migrations/001_init.sql`，并明说「不要维护第二份 schema.sql，避免漂移」；
§4.4 又要求 `npm run migrate` = `node-pg-migrate up`。
但 **node-pg-migrate 只加载 `.js` / `.ts` 迁移文件，不执行 `.sql`**。两条要求直接对撞。

**决策**：**保留 `db/migrations/001_init.sql` 作为 DDL 唯一基线**，
另加一个极薄的 JS 迁移 `db/migrations/001_init.js`，作用只是**读取同目录的 `.sql` 并执行**。
不复制第二份 schema，不引入 SQL→JS 的生成步骤。

**为什么**
1. 契约基线必须是人能读、能 diff、能直接用 psql 验证的纯 SQL（Phase 0 验收项「空库迁移成功」就是这么验的）；
2. node-pg-migrate 提供迁移版本表、只向前、失败回滚事务，正是 §5.2 要的；
3. SQL 换行必须是 **LF**——已用 `.gitattributes` 锁住，避免 Windows 下被改成 CRLF 导致执行出错。

**影响面**：`db/migrations/001_init.js`（Phase 1 新增，约 20 行）。
**推翻成本**：极低；换成别的迁移器也不影响 SQL 基线本身。

---

## 二之二、D-11 demo 的定位：视觉基准，不是契约

**背景**
demo 文件已找到：`D:\Agent\WorkBuddyAI Cache\2026-10-27-08-01-26\demo-工作台与组织架构.html`
（1193 行 / 57KB，标题「WorkBuddy 个人工作台 — 拖拽编辑演示」）。
同目录还有两份更早的设计底稿：`WorkBuddy个人工作台-开发设计文档.docx`（v1.0，2026-10-27）与 `workspace.md`（2026-10-27）。

**决策**

| 文件 | 定位 | 效力 |
|---|---|---|
| **v2 + 执行包**（2026-10-29） | **正典**：产品口径 + 工程契约 | 冲突时以此为准 |
| `demo-工作台与组织架构.html` | **视觉基准** | 只管长什么样；数据/计数/交互以契约为准 |
| `workspace.md` + docx（2026-10-27） | 设计底稿 | 被 v2 取代；v2 未覆盖且不冲突的部分可吸收 |

**为什么这么判**
1. v2 自称「替代 v1.3 中互相冲突的部分」，且比底稿晚两天；
2. 执行包 §2.1 把 v2 列为唯一产品契约；
3. 底稿自身矛盾——§1.1 写「约 500 名使用者」，§1.8 排期表又写「7 个账号导入成功」，
   **v2 的 7 人很可能就是收敛这份矛盾后的版本**（规模差异见 U-8）。

**已落地**
- 视觉规格已提取到 [visual-baseline.md](visual-baseline.md)：15 个设计变量、侧栏 208px、
  模块库 252px、栅格 gap 16px、圆角 12px、暗色侧栏 #1c2033、主色 #2563eb 等，
  并给出「demo 外观 → AntD 5 组件 + props」映射表。
- 其中 **33 处 demo 与契约冲突已逐条标注「以契约为准」**，最要紧的几条：

| 项 | demo | 契约 | 结论 |
|---|---|---|---|
| 模块数 | 2 组全可拖 | 15 个（12 active + 3 placeholder 置灰不可拖） | 契约 |
| 指标卡 | 第 3 张 KPI 完成率、第 4 张活跃项目数 | 第 3 张项目进度、第 4 张本周完成率（分母 0 显示「—」） | 契约 |
| 画布 | 自由像素高 | 12 列栅格、gap 16px、行高 72px、只存 `sort` | 契约 |
| 侧栏 | 208px / 6 项 | 220px / 4 项 | 契约（搜索、通知铃铛、AI 助手入口一期不做） |
| 组织树 | 3 层、计数递归 | 层级数不设固定上限、人员挂末级、计数只算直接挂载 | 契约（D-07） |
| 导入 | Excel | CSV | 契约 |

**铁律重申**：demo 里的假数据（12/5/7、76%、7 名员工、项目名）**一个都不许进代码**。

---

## 一之四、D-13 规模假设变更：7 人 → 500 人（功能范围一个字不改）

**背景**
老6 确认：**最终使用者 500 人，第一期仍做小版本**。
v2 §0.1 的前提是「7 名普通用户 + 1 个部门」，v2 §0.3/§13.4 明确写了「前提不成立要重排」。

**决策：功能范围一字不改，只改规模假设。**

| 项 | 原假设（v2 §0.1） | 新口径 |
|---|---|---|
| 普通用户 | 7 名 | **最多 500 名** |
| 部门 | 1 个 | 取决于真实组织树（见 U-10） |
| 功能范围 | 10 页面 / 34 接口 / 15 模块 / 40 验收 | **完全不变** |
| 种子数据 | 8 个账号（admin + user01~07） | **不变**——种子是开发/验收 fixture，不是真实用户 |
| 真实用户来源 | 7 个普通用户 | **CSV 批量导入（接口 13）** |

**为什么功能范围不变**
「第一期是小版本」= 先把功能做扎实、不铺开。
**500 人是上线后的使用者规模，不是一期要做的功能量。**
所以 v2 的 10 页面 / 34 接口 / 40 项验收**全部照原样执行**。

**500 人真正改变的是这 7 件事 —— Phase 落地必须按这个做**

1. **导入必须批量写，禁止循环写**
   500 人 ×（1 个 user + 1 个 workspace + 4 条 layout）= **3000 行**。
   契约已要求「同一事务」，落地时必须**批量 INSERT**，不能逐条往返（几百次网络往返会让导入慢到不可接受）。

2. **导入行数上限 1000 有余量但不宽裕**
   契约上限 1000 数据行 > 500 人 ✓。若还要导历史/测试账号，余量只有一倍 → **分批导入**，每批各自 ≤1000。

3. **项目进度绝不能 N+1 查询** ⚠️ 最重要的一条
   契约说项目进度「实时算，不落库」。500 人若有上千个项目，列表每行各查一次聚合 = 上千次查询，页面直接卡死。
   → Phase 4 硬要求：**一条 `GROUP BY project_id` 聚合 + JOIN 一次取回**，禁止在循环里查库。
   「不落库」的原则不变，只是实现必须一次性聚合。

4. **管理员查全员统计要设超时**
   单用户统计走 `idx_task_user_status_due (user_id, status, due_date) WHERE deleted_at IS NULL` → 毫秒级 ✓。
   但 `userId` 可选意味着管理员能查全员：500 人 × 人均 250 任务 ≈ **12 万行**聚合（几十毫秒，可接受），
   必须配 `statement_timeout`，避免一次手滑拖垮连接池。

5. **会话清理从「可选」变成「必需」**
   500 人 × 每人可能多设备 → session 表持续增长。
   Phase 1 的每日会话清理任务**必须做，不能延后**。

6. **连接池：设 20 就够，别过度设计**
   这是每天用几次的办公工具，**峰值并发远小于 500**。
   pg 默认池 10 偏小，Phase 1 设 **20**；nginx 反代超时按 500 人峰值留余量。
   **不要因为"500 人"就去上 Redis 或连接池中间件**——一期不需要。

7. **数据库不是瓶颈，别算错方向**
   估算：12 万任务 × 约 200 字节 ≈ 25MB，加索引约 100MB 量级。
   v2 §0.1 的「人均 2GB 文件配额」一期用不上（一期没有文件上传，只有 CSV 导入）。
   **真正的瓶颈是导入速度与登录并发，不是磁盘。**

**验收口径的调整**
- **40 项验收的编号与条数完全不变**（那是功能验收，与人数无关）。
- **规模验收放进 Phase 7 上线检查**（不在 40 项里，单列）：
  1. 500 人 CSV 一次或分批导入成功，抽查 20 个账号能登录；
  2. 500 次首次登录强制改密不超时；
  3. 组织树挂满真实层级，各节点人数显示正确；
  4. 真实数据量下，工作台指标卡与项目列表响应 **< 1 秒**。

**影响面**
**不改任何接口、不改任何表结构、不改 40 项验收。**
只新增四条实现约束：Phase 2 批量插入、Phase 4 聚合查询、Phase 1 连接池与会话清理、Phase 7 规模验收清单。

---

## 一之五、D-14 OpenAPI 契约对齐实际实现（24 路径 → 40 路径 / 57 路由）

**背景**
用户端批次 2/3 落地后，`docs/contracts/openapi.yaml` 只声明了 **24 条路径 / 34 个操作**，
而 `apps/api/src/**/routes.ts` 的路由注册表里实际有 **40 条路径 / 57 个操作**。
契约自称「唯一契约」，实际漏掉了 16 条路径（统计聚合、风险问题、文件资料、里程碑与会议），
以及任务 / 项目的新增字段与筛选参数——**契约与代码已经对不上了**。

**决策**
把契约**改成代码的现状**（代码是裁判，不是反过来），路径数从 24 补到 40、路由数对齐到 57。

| 项 | 改前 | 改后 |
|---|---|---|
| 路径数 | 24 | **40** |
| 操作数 | 34 | **57** |
| 缺失路径 | — | 补 16 条（见下） |
| `info.version` | 2.0.0 | 2.1.0 |

**补齐的 16 条路径（23 个操作）**
- 统计聚合：`GET /api/stats/trend`、`GET /api/stats/distribution`、`GET /api/stats/team-workload`
- 风险：`GET /api/risks`、`GET /api/risks/summary`、`POST /api/risks`、`PUT /api/risks/{id}`、`PATCH /api/risks/{id}/status`、`DELETE /api/risks/{id}`
- 文件：`GET /api/files`、`GET /api/files/summary`、`POST /api/files`、`DELETE /api/files/{id}`、`GET /api/folders`、`POST /api/folders`、`DELETE /api/folders/{id}`
- 里程碑：`GET /api/milestones`、`POST /api/milestones`、`PATCH /api/milestones/{id}`、`DELETE /api/milestones/{id}`
- 会议：`GET /api/meetings`、`POST /api/meetings`、`DELETE /api/meetings/{id}`

**顺手修正的原有契约错误（以代码为准）**
| 位置 | 原来写的 | 代码实际 | 处理 |
|---|---|---|---|
| `POST /api/auth/logout` | 401 未登录 | **无会话也返回 200**（幂等） | 去掉 401 |
| `PUT /api/auth/password` | 422 旧密码错误 | **400**（`badRequest`） | 422 → 400 |
| `PUT /api/auth/password` 200 响应 | `data: null` | `data: { user }`（查不到用户才为 null） | 改为 `oneOf` |
| `CreateUserRequest.account` | maxLength 32 + `^[A-Za-z][A-Za-z0-9_]*$` | **maxLength 64，无 pattern**（4-32 字母开头只约束 CSV 导入） | 改宽 + 加说明 |
| `POST /api/users` 响应 `user` | `User` | `UserListItem`（多 status / lastLoginAt） | 换 schema |
| `POST /api/org` | 无 404 | **上级节点不存在 → 404** | 补 404 |
| `DELETE /api/org/{id}` | 无 400 | **非法 id → 400** | 补 400 |
| `GET /api/workspace/template` | 无 404 | **模板不存在 → 404** | 补 404 |
| `PUT /api/workspace/template` | 无 404 | 同上 | 补 404 + 新增 `WorkspaceTemplateRequest`（带 name/subtitle） |
| `PUT /api/workspace`、`PUT /api/workspace/layout` | 无 404、无 403 | **工作台不存在 → 404**；非 GET 还要 Origin 403 | 补齐 |
| `POST /api/projects`、`PUT /api/projects/{id}` | 无 422 | **名称 / 负责人超长 → 422** | 补 422 |
| `GET /api/ideas`、`GET /api/stats/*`、`GET /api/tasks` 等 | 无 400 | **查询参数不合法 → 400** | 补 400 |
| 全部 GET（除 auth 白名单） | 无 403 | **must_change → 403**（onRequest 全局拦截，GET 也拦） | 补 403 + 新增 `ForbiddenMustChange` |
| 422 文案「超过 4 层」 | 4 层 | **MAX_ORG_LEVEL（默认 32）** | 改文案（对齐 D-07） |
| `info.description` 的 D-07 | 「上限 4 级」 | 「不设固定上限」 | 改文案 |

**新增字段（批次 2/3）**
- `Task` 响应 +`assigneeId / assigneeName / category / reminderAt / parentId / subtaskCount / startAt`
- `Project` 响应 +`icon / color / phase / members / memberCount`
- `GET /api/tasks` 查询 +`priority / assigneeId / category / from / to`
- `POST/PUT /api/tasks` 请求体 +`assigneeId / category / reminderAt / parentId / startAt`
- `POST/PUT /api/projects` 请求体 +`icon / color / phase`

**⚠️ 发现一处代码与共享类型的不一致（已在契约里如实标注，未改代码）**
`GET /api/projects/{id}` 的任务数组由 `projects/service.ts` **手工映射**，
只返回 11 个基础字段，**不含**批次 2 的 `assigneeId / assigneeName / category /
reminderAt / parentId / subtaskCount / startAt`——但共享类型 `Task` 把这 7 个字段都标成了必填。
契约里已明确标注该差异（`ProjectDetail.tasks` 的 description），并提示需要这些字段请用 `GET /api/tasks`。
**这是代码侧的问题，契约不替代码圆场，也不擅自改代码。**

**影响面**
**只改 `docs/contracts/openapi.yaml`（+ 本条决策记录），零代码改动。**
不改任何接口行为、不改表结构、不改前端调用方式——前端 `apps/web/src/api/*.ts` 的调用本来就是对的，
是契约没跟上。

**验证方式（脚本比对，不靠眼力）**
1. 从 `routes.ts` 正则抽取全部 `app.<method>('<path>'` → 与契约 `paths` 做集合比对
   → **57 操作 / 40 路径，差异 0**
2. 逐个 operation 的 query 参数 / requestBody 字段 vs 对应 zod schema 的键 → **36 处全对**
3. 响应 schema 字段名 + 可空性 vs `packages/shared/src/types.ts` 的 interface → **22 个类型全对**
4. `x-errors` 声明 vs `responses` 实际状态码 → **57 个 operation 全一致**
5. `$ref` 悬空检查 + `openapi-spec-validator` 校验 OpenAPI 3.1 → **通过**

**推翻成本**：低（纯文档；代码若再变，重跑上面的脚本即可）。

---

## 一之六、D-15 用户端 10 页 E2E 冒烟补齐 + 部署手册与脚本对齐（2026-11-05）

**背景**
仓库转公开后，两处「没人能测」的空档暴露出来：

1. **用户端 10 页完全没有 E2E** —— `e2e/` 只有 `auth.spec.ts`（5 条）与
   `workspace.spec.ts`（8 条），覆盖的是认证链路与工作台编辑器。
   而用户真正每天用的 10 个页面（总览/看板/任务清单/日程/进度/团队/文件/风险/统计/个人资料）
   **一条 E2E 都没有** —— 公开仓库后别人改坏前端，没有任何测试能拦住。
2. **`deploy/README.md` 与脚本实际行为对不上** —— 手册写的冒烟脚本路径
   `/data/blackhole/scripts/smoke.sh` 在服务器上**根本不存在**（`install.sh` 只复制 `deploy/`）；
   脚本支持的 `--direct` / `--origin=` / `SMOKE_ACCOUNT` / `SEED_ADMIN_PASSWORD_FILE`
   四个参数手册一个字没提；「普通账号跑时管理员接口 403 属预期」这条也没写 ——
   运维照手册跑会误判成故障。

**决策**

### 一、用户端 10 页 E2E 冒烟（新增 `e2e/user-pages.spec.ts`，12 条）

**核心原则：断言「页面上的数字 === 接口返回的数字」，不接受「页面没白屏」这种弱断言。**

| 页面 | 路由 | 断言要点（数字一律与接口比对） |
|---|---|---|
| 项目总览 | `/` | 4 张指标卡（项目总数/进行中/待办任务/团队成员）分别等于 `GET /api/projects` 的 `total`、`GET /api/stats/overview` 的 `projectCount`、`GET /api/stats/tasks` 的 `todo`、`GET /api/users` 的 `items.length`；5 个面板标题齐全；「项目进度」「今日任务」「项目列表」里能看到造出来的数据 |
| 项目看板 | `/kanban` | 4 列（待开始/进行中/已逾期/已完成）的 `aria-label` 计数分别等于按 `GET /api/tasks` 全量算出的口径；指标卡「全部任务/待处理」等于 `GET /api/stats/tasks` |
| 项目看板（交互） | `/kanban` | 用列内「快速添加」新建一个任务后，「待开始」列计数 **+1**，且新卡片标题可见 |
| 任务清单 | `/tasks` | 卡片标题「任务列表（共 N 项）」的 N === `GET /api/tasks` 的 `total`；每页切到 50 行后，**表格行数 === 接口 total** |
| 任务清单（筛选） | `/tasks` | 5 个筛选下拉（全部项目/状态/优先级/负责人/分类）+ 搜索框 + 「更多筛选」「重置」都存在；按「已完成」筛选后标题计数 === `GET /api/tasks?status=done` 的 total；「重置」后回到全量；关键字搜索命中 1 条 |
| 日程安排 | `/calendar` | 月历格子数 **= 42**（6 行 × 7 列）；表头 7 天；「今天」那格 `aria-label` 含「N 项任务」且**有圆点**；6 个面板标题齐全；「今日会议」「任务提醒」「重要里程碑」里能看到造出来的数据；指标卡「会议安排」「重要里程碑」=== 接口条数 |
| 进度追踪 | `/progress` | 4 个面板标题齐全；指标卡「已完成任务」「进行中任务」=== `GET /api/stats/tasks`；「里程碑达成」=== 已完成项目数/项目总数；「项目进度计划」「阶段进度」里有造出来的项目与阶段 |
| 团队协作 | `/team` | 3 个面板标题齐全；指标卡「团队成员数」=== `GET /api/users` 条数；成员行数一致；「会议纪要」里有造出来的会议 |
| 文件资料 | `/files` | 6 个面板标题齐全；指标卡「文件总数」=== `GET /api/files/summary` 的 `totalCount`；「文件夹」「文件列表」里有造出来的文件夹与文件；分类里有 PDF |
| 风险问题 | `/risks` | 6 个面板标题齐全；指标卡「高风险数」「待解决问题数」=== `GET /api/risks/summary`；「风险问题列表」「风险应对计划」里有造出来的风险 |
| 数据统计 | `/analytics` | 6 个面板标题齐全；指标卡「项目总数」「任务总数」「已完成任务」=== 对应接口；「项目完成率排行」里有造出来的项目 |
| 个人资料 | `/settings/profile` | 当前仍是 Placeholder 占位页 → 断言页面出现「迭代」字样（⚠️ 主线程把它做成真页面后，这条断言要相应调整） |

**造数与清理**
- `beforeAll` 里**用真实接口**造数据（POST /api/projects、/api/tasks、/api/risks、
  /api/files、/api/folders、/api/meetings、/api/milestones），**不 mock**；
  账号统一用 `e2e-user-` 前缀，与其它 spec 的数据隔离。
- `afterAll` 里用 **DELETE 接口**清理（任务/风险/文件/文件夹/会议/里程碑/项目），
  再按 `e2e-user-` 前缀扫描一遍兜底（覆盖「页面上快速添加」产生的那条）。
- admin 的 `must_change_password` 默认是 `true` → 登录前调 `e2e/helpers.ts` 里已有的
  `clearMustChange()`（**复用，不重复实现**），跑完用 `resetAdmin()` 恢复种子状态
  （口令 + 必须改密标记 + 清会话）。

**错误收集（每条用例的 `afterEach` 断言）**
任何 `console.error`、`pageerror`、4xx/5xx 的 `/api/` 响应都算失败。
**显式豁免两处预期行为**：

| 豁免 | 原因 |
|---|---|
| `GET /api/auth/me` → 401 | 未登录时前端首屏探测登录态的正常分支 |
| `GET /api/users*` → 403 | 普通账号访问管理员接口，权限拦截生效，**不是故障** |

另有一条**已知第三方噪音**白名单：antd 5.29+ 对 `ConfigProvider` 的
`autoInsertSpaceInButton` 属性打弃用警告（`apps/web/src/main.tsx` 仍在用旧写法，
该文件不在本次改动范围内）。除这一条外，任何 `console.error` 仍然算失败。

**口令来源**：`process.env.SEED_ADMIN_PASSWORD`，由 `playwright.config.ts` 注入
（新增 `process.loadEnvFile('.env')`，不覆盖外部已有的环境变量 → CI 的值优先）。
**口令绝不写进代码或提交进仓库。**

**影响面**
只新增 `e2e/user-pages.spec.ts` + 改 `playwright.config.ts`（加 env 注入）。
**不改任何前端页面、后端接口、共享类型** —— 用户端 10 页的源码本次一行没动。
跑测顺序：Playwright 按文件名排序，`auth.spec.ts` → `user-pages.spec.ts` → `workspace.spec.ts`；
`auth.spec.ts` 与 `workspace.spec.ts` 各自 `afterAll` 都会 `resetAdmin()`，
与本 spec 的 `afterAll` 顺序兼容，三份 spec 可连续跑通（**实测 25 条全绿**）。

**推翻成本**：低（纯测试文件；页面口径变了就改断言，改的是测试不是契约）。

### 二、部署手册与脚本对齐（改 `deploy/README.md`）

**原则：手册以脚本实际行为为准。** 本次逐条核对 `deploy/install.sh`、
`deploy/one-shot.sh`、`deploy/smoke.sh` 的真实参数与行为，修正如下：

| # | 手册原来写的 | 实际行为 | 处理 |
|---|---|---|---|
| 1 | 冒烟脚本在 `/data/blackhole/scripts/smoke.sh` | `install.sh` 只复制 `deploy/` → 服务器上是 **`/data/blackhole/deploy/smoke.sh`**；`scripts/` 只是发布包里的副本 | 改正路径，并加「找不到文件」的排障条目 |
| 2 | 未提 `--direct` | 跳过首页/前端静态资源/SPA 回退/安全头 4 项，只查接口 | 补参数说明 |
| 3 | 未提 `--origin=` | 写请求的 `Origin` 头，默认取基地址。**直连 API 时必须显式指定**，否则登录就被 403「请求来源不被信任」拦掉（实测） | 补参数说明 + 排障条目 |
| 4 | 未提 `SMOKE_ACCOUNT` | 登录账号，默认 `admin` | 补环境变量表 |
| 5 | 未提 `SEED_ADMIN_PASSWORD_FILE` | 口令来源之一（**指向文件路径**，脚本读该文件第一行）；另有 `SEED_ADMIN_PASSWORD` 与 `/etc/blackhole/api.env` 两个来源 | 补三个来源的优先级 + 「口令不要写命令行」提醒 |
| 6 | 未写普通账号的 403 预期 | 脚本对 `/api/users*` 与 `/api/org/tree` 的 403 **显式豁免**并计为通过（实测：普通账号跑，17 项全过） | 补「403 属预期，不是故障」专节 |
| 7 | 「迁移」当作 `install.sh` 的一步 | `node-pg-migrate` 是**仓库根的 devDependency**，生产装依赖用 `npm ci --omit=dev` → 发布包里**没有**迁移工具 → `install.sh` 会打印「跳过迁移」**继续执行**，表其实没建 | 单开 §4.1「先建表」，给开发机迁移 + 手工迁移两种做法，并加排障条目 |
| 8 | 未提 `--use-glob` 的必要性 | `-m` 给的是 glob，**少 `--use-glob` 会把 `.sql` 也当迁移跑一遍，DDL 跑两遍** | 在迁移小节明确标注 |
| 9 | 播种账号写作 `user01` + `user02`~`user07` | `db/seed.ts` 实际造的是 **`user01`~`user07`**（`user${i}` 补零），现有库里的 `user01` 是被导入改过名的历史数据 | 按脚本改正，并说明播种幂等、账号名以库里为准 |
| 10 | 播种口令来源未说明 | 优先 `SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD`；**没给就随机生成 12 位且只打印一次** | 补口径 |
| 11 | 未提种子口令变量名对不上 | 模板里是 `SEED_RAQE_HYRLYHYI`，而 `db/seed.ts` 读的是 **`SEED_USER_PASSWORD`** → 7 个普通用户的固定口令目前设不进去 | 写明差异 + 给绕过办法（播种前显式 export） |
| 12 | 回滚只写 `cp -r` | `cp -r 备份/apps /data/blackhole/` 会**拷进已有目录**（变成 `apps/apps/...`），旧文件也留着 → 等于没回滚。`install.sh` 自己也是先 `rm -rf` 再拷 | 回滚步骤补 `rm -rf`，并说明备份只含 `apps/` 与 `db/` |
| 13 | 开机自启只提 API | `install.sh` 只 enable 了 `blackhole-api`；**nginx 与 postgresql 要自己 enable**（`one-shot.sh` 才做） | 新增 §6.1「开机自启的三个服务」表 |
| 14 | Node 20+ / PG 16+ | `package.json` 的 `engines` 要求 **Node ≥ 22**；PG 已定统一 **18**（D-08 / U-5） | 改正版本号，并说明 `install.sh` 自己只查 Node ≥ 20 但仓库要求 ≥ 22 |
| 15 | 未提 `install.sh` 的其它参数 | 实际支持 `--tarball`（必填）/ `--env-file` / `--dir` / `--skip-migrate` | 补参数表 |

**影响面**
只改 `deploy/README.md` 一个文件。**不改 `deploy/install.sh` / `one-shot.sh` / `smoke.sh`**
—— 本条记录的是「文档向脚本对齐」，不是「改脚本」。
排障表补了 8 条新条目（迁移被跳过、nginx/postgresql 没自启、脚本路径找不到、
`--direct` 缺 `--origin` 报 403、口令三个来源都没有等），
每条都是运维照手册操作时**真实会踩**的坑。

**推翻成本**：低（纯文档；脚本参数变了就再对一次）。

---

## 二、未决项（等外部条件，不阻塞编码）

| # | 未决项 | 卡在谁 | 什么时候要 | 默认怎么先跑 |
|---|---|---|---|---|
| U-1 | ~~demo-工作台与组织架构.html~~ | — | — | ✅ **已解决（2026-11-02）**：文件在 `D:\Agent\WorkBuddyAI Cache\2026-10-27-08-01-26\`；视觉规格见 [visual-baseline.md](visual-baseline.md)，定位见 D-11 |
| U-2 | **7 名员工真实姓名**（v2 Q20） | 老6 | Phase 7 上线前 | 种子用「用户01」~「用户07」占位，导入后由管理员改名 |
| U-3 | **内网域名 + HTTPS 证书** | 老6 | Phase 7 部署 | 本地 `http://localhost:5173` |
| U-4 | **备份目标**（v2 §11.3 / 验收 G2） | 老6 | Phase 6 | 无独立目标时按 v2 降级为 7 天并**书面接受** |
| U-5 | ~~内网 PG 版本~~ | — | — | ✅ **已解决（2026-11-02）**：老6 确认统一 **18**。开发用本机 PG 18.6 原生实例（15432），生产也必须 18 |
| U-6 | **导入 CSV 的真实角色分布** | 老6 | Phase 2 | 角色只允许 user/admin；管理员提交含 admin 的文件整批 403 |
| U-7 | **第四级节点的真实叫法** | 老6 | Phase 2 | 默认叫「信息科」，页面上可改名 |
| **U-8** | ~~使用者规模：7 人 还是 500 人？~~ | — | — | ✅ **已解决（2026-11-02）**：老6 确认 **最终 500 人，第一期仍做小版本**。功能范围一字不改，规模假设改为 500 人 → 见 **D-13**（含 7 条落地约束） |
| U-9 | **远端仓库（GitHub / 内网 Git）** | 老6 | 不阻塞 | 通道已探明，gh CLI 已装；**待老6 建私有仓库 + 给一个最小权限 token**（见 D-12） |
| **U-10** | ~~500 人的真实组织树长什么样？~~ | — | — | ✅ **已解决（2026-11-02）**：老6 给出 **集团/公司/事业部/中心/部门/班组 6 级**；并追问「不能交付后客户自己创建吗」→ **D-07 改为层级数不设固定上限**，系统不限制只能 6 级 |

> **U-8 已结**：设计底稿 `workspace.md` §1.1 写「约 500 名使用者」、§1.8 写「7 个账号导入成功」，
> 这个矛盾由老6 一句话定案：**最终 500 人，一期小版本**。落地细节见 D-13。

> **U-10 已结**：老6 给的实际架构是 **集团/公司/事业部/中心/部门/班组 6 级**，
> 并追问了一句很关键的话：**「这个必须提前设计好？不能交付后客户自己创建吗？」**
> → 结论：**不用提前设计死**。D-07 已改为「层级数不设固定上限」，6 级只作为种子与验收的示例，
> 客户交付后自己建 6 级、10 级都不用改表、不用数据迁移。**每级叫什么也是用户数据，不是系统约束。**

> **U-1 补充**：demo 找到后，Phase 5 的 UI 还原基准不再是问题。但 demo 只解决「长什么样」，
> 不解决「数据对不对」——所有计数口径仍以契约为准。

---

## 三、明确不做（防止范围蔓延）

- 不用 Prisma / TypeORM，手写参数化 SQL
- 不引 Redis、消息队列、CDN
- 不引第二套组件库、不引图表库、不引 react-grid-layout
- 不做月视图日历、不做移动端、不做 SSR
- 不做布局历史版本回滚、不做自动快照（409 冲突由用户显式选择刷新或覆盖）
- 不建「以后可能用」的空表（prompt / attachment 二期只留文档结构）
- 不做第 11 个页面（quick-entry 的「灵感」指向 `/workspace`）
- 不把内网服务器、真实姓名、证书私钥、初始密码写进仓库

---

## 四、变更记录

| 日期 | 变更 | 影响 |
|---|---|---|
| 2026-11-07 | **D-18：仓库更名 Black Hole + 备份可配置 + L1 双实例 + 证书口径** —— ① GitHub 仓库 `workbench-app` → `black-hole`（本地 origin 已改），项目全面更名；② 备份改成配置项（`BACKUP_DIR` / `BACKUP_KEEP` / `BACKUP_ENABLED`，写 `/etc/blackhole/api.env`，由备份单元的 `EnvironmentFile` 注入），`BACKUP_ENABLED=false` 时脚本退出 0 不报错；③ 提供 L1 高可用配方（`blackhole-api@.service` 模板 + `nginx-https-lb.conf` upstream + `install.sh` 自动识别单/多实例），L2 PG 主从只写手册（`deploy/README.md` §8）；④ 证书口径改为「由使用方自备」，自签仅作内网过渡 | 改动集中在 `deploy/`（backup.sh / install.sh / 单元 / nginx 模板 / README）与 README，**零业务代码改动**。实测：`BACKUP_DIR=/tmp/bk-test` 生效（1 份/KEEP=2）；systemd 触发写 `/data/backups/blackhole`；双实例 3001/3002 各返回 401，停掉 3002 后 10 次请求 10 次正常，恢复后 6/6；冒烟 21/21。踩坑：**systemd 的 `%i` 不在 `Environment=` 里展开**，必须写成 `ExecStart=/usr/bin/env PORT=%i node ...`，否则两个实例都监听 3000 |
| 2026-11-06 | **D-17：组织可建根节点 + 日历农历/节假日** —— ① `POST /api/org` 的 `parentId` 允许为 null：仅在**组织树为空**时新增根节点（level 固定 1、path=/id/），已有根再传 null 一律 422，保持「根节点只有一个」的契约不变；前端在空树时把「新增下级」换成「新增根节点」。② 日历页补齐农历、二十四节气、传统/公历节日，以及法定节假日「休 / 班」角标；节假日数据内置 2026 年（国办发明电〔2025〕7号，含 7 段放假区间与 6 个调休上班日），界面上标注数据年份与文号 | ① 后端 `createOrg` 签名 `parentId: number \| null`，`routes.ts` 的 zod 改 `nullable().optional()`；前端 `CreateOrgInput.parentId` 放宽、`OrgFormModal` 传 null、`OrgPage` 空态给入口。② 新增依赖 `solarlunar`（~15KB，纯计算、离线可用，替代手抄 1900–2100 农历表）；新增 `apps/web/src/utils/lunar.ts`、`apps/web/src/data/holidays.ts`、`types/solarlunar.d.ts`；月历格高 56→70px。验证：104 单测 / 25 E2E / 冒烟 21 项全过，`/calendar` 10 月实测 1–7 日「休」、10 日「班」、国庆节/寒露/霜降/重阳节标红 |
| 2026-11-05 | **D-16：上线收口三件套（备份恢复 / 两种 nginx 形态 / HTTPS 切换）** —— 新增 `deploy/backup.sh`（库 dump + 前端产物 + `api.env` + manifest，按时间戳目录保留 14 份）、`deploy/restore.sh`（默认只允许恢复到演练库，覆盖生产必须 `--force`）、`blackhole-backup.{service,timer}`（每天 02:30，Persistent 补跑）、`deploy/nginx-integrate.conf.snippet`（形态 B：贴进已有 nginx 的 location 片段）、`deploy/gen-selfsigned-cert.sh`（内网自签，SAN 自动按 IP/DNS 生成）；`nginx.conf.example` 从 `http2 on;` 改回 `listen 443 ssl http2;`（后者要 nginx ≥1.25.1，Ubuntu 24.04 是 1.24 会报 unknown directive 起不来）；手册补「两种形态 / HTTPS 三条路 / 切 HTTPS 必改 4 处 / 升级后逐项确认」 | **零业务代码改动**（只动 `deploy/`、`scripts/package-release.sh` 去重两条重复 cp 并补 backup/restore 进包）。实测：`backup.sh` 在 192.168.102.102 跑通（189 个对象 / web 2.4M / manifest 含 SHA256 与 18 张表行数）；`restore.sh --to blackhole_drill` 恢复后 app_user 8 / org 6 / project 3 / task 17 与生产一致，演练库已删；不带 `--force` 覆盖生产被拒绝（退出码 2）；自签证书 SAN=IP:192.168.102.102 有效期至 2029-02-07 |
| 2026-11-05 | **D-15：用户端 10 页 E2E 冒烟补齐 + 部署手册与脚本对齐** —— 新增 `e2e/user-pages.spec.ts`（**12 条**）覆盖总览/看板/任务清单/日程/进度/团队/文件/风险/统计/个人资料 10 个路由：数据**全部走真实接口**造（`beforeAll` POST / `afterAll` DELETE，前缀 `e2e-user-`），断言一律「页面数字 === 接口数字」（指标卡、看板 4 列计数、任务表格行数与 total、月历 42 格、今天有圆点、面板标题与数据区非空），每条用例 `afterEach` 断言无 `console.error` / `pageerror` / 4xx-5xx 接口响应（**显式豁免** `GET /api/auth/me` 的 401 与 `GET /api/users*` 的 403 两处预期行为）；口令从 `process.env.SEED_ADMIN_PASSWORD` 读（`playwright.config.ts` 新增 env 注入），复用 `helpers.ts` 的 `clearMustChange()` / `resetAdmin()`。同时把 `deploy/README.md` 与 `deploy/*.sh` 的实际行为逐条对齐（改正冒烟脚本路径为 `deploy/smoke.sh`、补 `--direct` / `--origin=` / `SMOKE_ACCOUNT` / `SEED_ADMIN_PASSWORD_FILE`、补普通账号 403 属预期、点明发布包无迁移工具所以 `install.sh` 会跳过建表、补回滚必须先 `rm -rf`、补 nginx+postgresql 开机自启、改正 Node ≥ 22 / PG 18 / 种子账号 `user01`~`user07`） | **不改任何前端页面、后端接口、共享类型**，用户端 10 页源码一行没动；只新增 `e2e/user-pages.spec.ts`、改 `playwright.config.ts`（加 env 注入）与 `deploy/README.md`；**不改 `deploy/*.sh`**（本条记录的是文档向脚本对齐）。实测 `npx playwright test` **25 条全绿**（原 13 + 新 12），跑完开发库无 `e2e-user-` 残留 |
| 2026-11-05 | **D-14：OpenAPI 契约对齐实际实现** —— 路径 24 → **40**、操作 34 → **57**，补齐用户端批次 2/3 的 16 条路径（统计聚合 / 风险 / 文件 / 里程碑 / 会议）与任务·项目的新增字段、筛选参数；并修正 16 处与代码不一致的原有描述（401/404/400/422 归属、account 长度、`info.version` → 2.1.0） | **只改 `docs/contracts/openapi.yaml` + 本决策记录，零代码改动**。路径集合经脚本比对差异为 0；发现 `GET /api/projects/{id}` 的任务数组缺批次 2 扩展字段（代码侧问题，已在契约里如实标注，未改代码） |
| 2026-11-02 | Phase 0 建立本文件；D-01~D-09 定稿；组织层级改为上限 4 级 + 人员挂末级 | DDL 1 处、类型 1 处、应用层 3 处、验收措辞 4 条、接口描述若干 |
| 2026-11-02 | 补 D-10（迁移执行器）、D-11（demo 定位）、D-12（GitHub 通道）、**D-13（规模 7 人 → 500 人）**；关闭 U-1 / U-5 / U-8；新增 U-10 | D-13 **不改任何接口、表结构、40 项验收**；只新增 Phase 1/2/4/7 四条实现约束 |
| 2026-11-02 | **D-07 二次修订**：从「上限 4 级」改为「**层级数不设固定上限**」，业务上限走 `MAX_ORG_LEVEL` 环境变量（默认 32） | DDL `level CHECK 1..4` → `1..32`；`OrgNode.level` 类型放宽为 `number`；openapi 3 处描述、pages 9 处、验收新增 2 行口径调整（**原文未动**）；新增 `.env.example` 的 `MAX_ORG_LEVEL` |
| 2026-11-03 | **测试库自动复位** | `npm run test` 跑完自动调 `npm run db:clean-test` 把开发库恢复到种子状态（vitest 2.x **没有** `globalTeardown`，实测整个 dist 里都搜不到这个词，所以用 npm script 串联）。否则测试造的账号会残留（实测残留到 18 个），污染 Phase 2 的账号列表验收。清理顺序必须是 **task → project → app_user**（后两者有外键指向 app_user） |
| 2026-11-04 | **产品形态变更：用户端固定 10 页** | 老六提供最终用户端设计稿（10 页）并明确「这 10 张稿子是最终给用户的界面，管理员界面不是这样的」→ 最终形态 = **用户端固定 10 页**（总览/看板/任务清单/日程/进度追踪/团队协作/文件资料/风险问题/数据统计/设置）+ **管理员端照旧**（工作台/账号/组织/模板）两套并存。设计稿图1「项目总览」本身就是模块组合 → 原「可自定义工作台」不废弃，改为管理员端能力，用户端 10 页可视为预设模板。第一批做 **视觉还原 + 数据字段补齐**（task 加负责人/分类/提醒/父任务，project 加图标/主题色/阶段，新增 project_member） |
| 2026-11-04 | **手写 SVG 图表，不引图表库** | 用户端视觉层新增 `apps/web/src/components/ui/`：`charts.tsx`（Sparkline / DonutChart / LineChart / ProgressRing 全手写 SVG）+ `index.tsx`（MetricCard 带涨跌箭头与迷你折线 / Panel / ToneTag / AvatarGroup / LegendItem）。沿用契约「不引图表库」的约束 |
| 2026-11-04 | **统计口径必须与列表口径一致** | 管理员不传 userId 时 `GET /api/stats/*` 统计**全员**（原来只统计自己），否则指标卡数字与任务列表表格对不上。stats 的 userId 改为可选，SQL 按需拼过滤条件 |
| 2026-11-03 | **Phase 4 实施修正** | ① 项目进度的聚合子查询必须用 **LEFT JOIN + COALESCE** —— 用 INNER JOIN 的话**新建的 0 任务项目在列表里会整个消失**（聚合子查询里没有它的行）；② SQL 里**不要跳过参数占位符**（`$3` 配 `[a, null, b]` 会报 `could not determine data type of parameter $2`）；③ 普通用户访问他人项目详情返回 **404**（不泄露存在性），不要用 400；④ `POST /api/tasks` **没有 userId 字段** —— 管理员也不能代建，归属人恒为当前登录用户；⑤ 项目进度的 `progress`/`status` 由服务端实时算好下发，**前端不要自己再算一遍**；⑥ 统计的「本周」是**自然周（周一至周日）**，周一所在的那一周从昨天开始，写测试时注意边界 |
| 2026-11-03 | **Phase 3 实施修正** | ① 布局保存严格按 §7.6 用 **CAS**：`UPDATE workspace SET version=version+1 WHERE id=$1 AND version=$2 RETURNING version`，影响 0 行直接 409 且 `data` 带服务端当前 version/items（**不先 SELECT 再 UPDATE**）；② 409 的 `data` 结构固定为 `{version, items}`，前端据此提供「刷新丢弃本地」/「覆盖保存」两个选项；③ 模板保存用同一套 CAS，但 `WHERE id` 是**模板 workspace 的 id**，不与用户工作台混用；④ 名称/副标题走单独接口，**不参与 version**；⑤ 空 workspace 自动复制模板用 `ON CONFLICT DO NOTHING` + 回查，保证重复请求不重复创建 |
| 2026-11-03 | **Phase 2 实施修正**（不改契约，只改实现） | ① 导入接口用 `req.parts()` 自己收字段与文件，**不能开 `attachFieldsToBody`**（它会先消费 multipart 流，导致 `req.file()` 返回 null）；② 批量 INSERT 的 `unnest` 列数要与目标列数对齐，漏写 `is_super`/`status`/`must_change_password` 会报 `INSERT has more target columns than expressions`；③ 导入结果语义明确为 **`skipped`=重复账号、`failed`=格式错误行**，`errors` 含两者；④ **「文件里出现 admin 角色就整批 403」的判断放在格式校验之前** —— 否则「账号写错 + 角色是 admin」能绕过这道闸；⑤ pg 的 `bigint` 返回字符串这条坑第三次出现，**所有 id 一律显式 `Number()`** |
| 2026-11-02 | **Phase 1 实施修正**（不改契约，只改实现） | ① `must_change` 拦截从路由处理器移到 **onRequest 全局层**——否则未实现的业务路径先落 404 而不是 403；② 迁移命令用 `-m "db/migrations/*.js" --use-glob`——node-pg-migrate 会把同目录 `.sql` 也当迁移文件，DDL 会跑两遍；③ `.env` 加载改为**相对模块路径**——npm workspace 脚本的 cwd 是 `apps/api`，`dotenv/config` 按 cwd 找不到仓库根的 `.env`；④ `bigint` 主键显式转 `number`——pg 默认返回字符串，与契约 §6.2 不符 |
