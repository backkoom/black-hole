# Phase 0 验收清单（Gate）

> 依据：《AI 开发执行包-工作台与组织架构》§9.2「Phase 0：契约包」验收项，共 8 条。
> 复核日期：**2026-11-02**。复核方式：每条都跑真实命令取证，不靠目测。
> 复现命令见每条下方。

| # | 验收项（执行包原文） | 结论 | 证据 |
|---|---|---|---|
| 1 | OpenAPI 34 个 operation，数量脚本可数 | ✅ 通过 | 34 operation / 24 路径；28 个组件 schema；cookieAuth |
| 2 | DDL 8 张表，空库迁移成功 | ✅ 通过 | 空库执行成功，8 表 / 29 索引 |
| 3 | 15 个模块，12 active + 3 placeholder；config schema 可单测 | ✅ 通过 | 15/12/3；分类 2/2/2/3/6；7 个 content schema；16 条单测全过 |
| 4 | 10 个页面，路由与 v2 3.1 一致 | ✅ 通过 | 10 条路由与 v2 §3.1 **逐条一致** |
| 5 | 40 项验收，编号与 v2 12 一致 | ✅ 通过 | 40 条，A1–G4 序列**与 v2 完全一致**；原文逐字保留 |
| 6 | app_user 贯穿 DDL/查询/种子；没有 user 表 | ⚠️ 部分 | **DDL 侧已验证**（app_user 存在、`user` 表 0 个）；**查询与种子代码 Phase 1 才写**，落地时复核 |
| 7 | 没有业务代码；没有"先写再说"的接口 | ✅ 通过 | api/src 1 个占位文件、路由实现 **0** 处；web/src 1 个占位；seed.ts 为抛错桩 |
| 8 | 人类书面确认"契约通过" | ✅ **通过**（2026-11-02 16:16，老6 书面确认「契约通过」） | 确认人：老6（业务/验收方） |

---

## 逐条复现命令

### [1] OpenAPI 34 个 operation

```bash
node -e "
const fs=require('fs'),YAML=require('js-yaml');
const d=YAML.load(fs.readFileSync('docs/contracts/openapi.yaml','utf8'));
let ops=[];for(const [p,it] of Object.entries(d.paths||{}))
  for(const m of ['get','post','put','patch','delete'])if(it[m])ops.push(m.toUpperCase()+' '+p);
console.log('operation 总数 =',ops.length);
console.log('组件 schema 数 =',Object.keys(d.components.schemas).length);
console.log('securitySchemes =',Object.keys(d.components.securitySchemes));
"
```
实测输出：`operation 总数 = 34`、`组件 schema 数 = 28`、`securitySchemes = [ 'cookieAuth' ]`
附加：34 个 `operationId` 全部唯一（grep 计数 34 / sort -u 计数 34）；
示例覆盖已核：登录成功 / 登录失败 / 布局 409 / 任务创建 / 导入结果 / 401 / 403 / 404 / 413 / 422。

### [2] DDL 8 张表，空库迁移成功

```bash
psql -h 127.0.0.1 -p 15432 -U postgres -c "CREATE DATABASE gate_check;"
psql -h 127.0.0.1 -p 15432 -U postgres -d gate_check -c "GRANT ALL ON SCHEMA public TO workbench;"
PGPASSWORD=*** psql -h 127.0.0.1 -p 15432 -U workbench -d gate_check \
  -v ON_ERROR_STOP=1 -f db/migrations/001_init.sql
psql ... -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';"
```
实测输出：`空库执行：✅ 成功`、`表数量 = 8`、`索引数量 = 29`
附加边界验证：`level=32` 写入通过；`level=33` 与 `level=0` 被 CHECK 拒绝（符合 D-07 的宽松硬边界设计）。

### [3] 15 个模块 + config schema 可单测

```bash
npm run test
node -e "const m=require('./packages/shared/dist/modules.js');
console.log(m.MODULES.length, m.ACTIVE_MODULE_KEYS.length, m.PLACEHOLDER_MODULE_KEYS.length,
            Object.keys(m.moduleConfigSchemas).length);"
```
实测输出：`Tests 16 passed (16)`；`15 12 3 7`；分类计数 `2/2/2/3/6`。

### [4] 10 个页面，路由与 v2 3.1 一致

```bash
python - <<'PY'
import io,re
s=io.open('docs/contracts/pages.md',encoding='utf-8').read()
m=re.search(r'## 页面清单\n\n\| 路由 \|.*?\n\n',s,re.S)
routes=re.findall(r'^\| (/[a-z/:-]+) \|',m.group(0),re.M)
exp=['/login','/workspace','/tasks','/projects','/projects/:id','/settings/profile',
     '/settings/password','/settings/users','/settings/org','/settings/workspace-template']
print(len(routes), routes==exp)
PY
```
实测输出：`10 True`（逐条列出与 v2 §3.1 一致）。

### [5] 40 项验收，编号与 v2 12 一致

```bash
python - <<'PY'
import io,re
a=io.open('docs/contracts/acceptance.md',encoding='utf-8').read()
ids=re.findall(r'^### ([A-G]\d+) ',a,re.M)
exp=[f'{g}{i}' for g,n in [('A',5),('B',10),('C',5),('D',5),('E',8),('F',3),('G',4)] for i in range(1,n+1)]
print(len(ids), ids==exp)
PY
```
实测输出：`40 True`。
附加：40 条「验收内容（原文）」由脚本从 v2 §12 程序化抽取，逐字比对 **0 差异**；
D-07 引入的层级口径变化以**独立的「口径调整」行**记录，**原文一字未改**。

### [6] app_user 贯穿 DDL/查询/种子

```bash
psql ... -c "select count(*) from information_schema.tables where table_name='user';"      -- 0
psql ... -c "select count(*) from information_schema.tables where table_name='app_user';"  -- 1
```
实测输出：`user 表 = 0`、`app_user = 1` ✅
**未覆盖部分（如实标注）**：「查询与种子」的代码在 Phase 1 才写（Phase 0 禁止写业务代码），
`db/seed.ts` 目前是抛错占位桩。**Phase 1 落地时必须复核**：种子写入的表名是 `app_user`，
且全仓库无 `user` 表引用（用 `grep -rn "\buser\b" apps/ packages/ db/` 核对）。

### [7] 没有业务代码

```bash
find apps/api/src -name '*.ts' | wc -l                       # 1
grep -rn "app\.\(get\|post\|put\|patch\|delete\)" apps/api/src | wc -l   # 0
find apps/web/src -name '*.tsx' | wc -l                      # 1
grep -c "throw new Error" db/seed.ts                          # 1
```
实测：路由实现 **0** 处；`server.ts` / `main.tsx` 均为空壳（`export {}`）；
`db/seed.ts` 是一句 `throw new Error(...)` 占位，附 D-07 的 6 级种子结构说明。

### [8] 人类书面确认

✅ **2026-11-02 16:16，老6 书面回复「契约通过」。**
执行包 §9.2 要求「Phase 0 之后停止，等人类回复；不要自动进入 Phase 1」——已遵守：
Phase 0 交付后停下等待，确认后才开 Phase 1。

**当前阻塞项**：
- U-9（GitHub 远端）：连接器授权失败中，排查结论见 [decisions.md](decisions.md) D-12；
  已有可用的备用通道（gh CLI + 设备流验证码），不阻塞编码。
- U-2 / U-3 / U-4 / U-6 / U-7：均为上线前才需要的外部信息，不阻塞 Phase 1。

---

## 结论

**技术侧 7 条全部通过**（第 6 条 DDL 侧通过、查询与种子待 Phase 1 复核）；
**只差第 8 条人类的书面确认**。

Phase 0 的产出是"契约"，不是"能跑的程序"——它存在的意义就是**把要猜的东西全部写死再让人审**。
现在该猜的都写死了（34 接口字段、8 张表、15 模块、40 条验收、10 个页面、13 条决策），
剩下的分歧只有 U-2/U-3/U-4/U-6/U-7 那几个上线前才需要的东西。
