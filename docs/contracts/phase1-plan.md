# Phase 1 开工清单（地基 · 认证 · 会话 · 应用壳）

> 依据：《AI 开发执行包》§9.3「Phase 1：地基、认证、会话、应用壳」。
> 本文件是**开工前的自检与范围确认**，不是实现记录；实现另走提交历史。
> 契约口径见 [openapi.yaml](openapi.yaml) / [decisions.md](decisions.md) / [pages.md](pages.md)。

## 0. 开工前环境自检（2026-11-02 已跑，全部通过）

| 项 | 结果 |
|---|---|
| Node | v22.22.2 ✅ |
| 依赖 | 13/13 已装（fastify、@fastify/cookie、@fastify/multipart、pg、zod、pino、bcryptjs、csv-parse、dotenv、node-pg-migrate、tsx、vitest、supertest）✅ |
| PostgreSQL | 18.6 原生实例，`127.0.0.1:15432`，库 `blackhole_dev` ✅ |
| 迁移基线 | `001_init.sql` 已应用，`blackhole_dev` 现有 8 张表 ✅ |
| `.env` | 未创建（**不提交仓库**，Phase 1 第一步从 `.env.example` 复制） |
| 迁移包装器 | `db/migrations/001_init.js` 待建（D-10 决策，Phase 1 第一件活） |

## 1. 范围（执行包 §9.3 原文）

- 仓库、npm workspaces、tsconfig、lint、Vitest、Docker Compose、CI
- 配置校验、数据库连接、迁移命令、种子命令
- 统一响应/错误处理、requestId、pino 日志
- Cookie 会话、登录/退出/me/改密、锁定、must_change、Origin 校验
- 登录页、修改密码页、App Shell、403/404 页面、路由守卫
- 会话清理任务（每日一次；可先用 setInterval，文档写清）

**Phase 1 不做**：组织/账号/导入接口（Phase 2）、工作台布局（Phase 3）、任务/项目（Phase 4）。

## 2. 必做实现点（逐条对应契约）

| # | 实现点 | 契约依据 | 验收挂钩 |
|---|---|---|---|
| 1 | `.env` 加载 + zod 环境校验，缺关键变量**直接退出**（不用默认密码兜底） | 执行包 §4.3 | — |
| 2 | `001_init.js` 包装器读同目录 `.sql` 执行（SQL 保持唯一基线） | D-10 | Gate 第 6 条（app_user 贯穿） |
| 3 | 数据库连接：`pg` Pool + `timezone=Asia/Shanghai`；**连接池上限 20** | D-04、D-13 | — |
| 4 | 统一响应 `{code,message,data}`；全局 errorHandler 映射 400/404/413/422/500 | §6.1、D-06 | — |
| 5 | requestId 贯穿日志（pino JSON 行），**500 不回堆栈**，只带 requestId | §6.3、D-06 | G4 |
| 6 | Cookie 会话：HttpOnly `sid`，**只存 token 的 hash**；session 表有 `expires_at` | §3.3 | A4 |
| 7 | 登录：5 次错误锁 10 分钟；锁定到期 `failed_attempts` 归零；status≠active 按密码错误返回 401 | §3.3 | A2 |
| 8 | must_change 中间件：只放行 `/auth/me`、改密、退出，其余 403 | §3.3、D-05 | A3 |
| 9 | Origin/Referer 同源校验（**放在认证之前**） | D-05 | — |
| 10 | 登录页 / 改密页 / App Shell / 403 / 404 页 + 路由守卫（未登录回原路由） | §8.3、§9.3 | A1、A5 |
| 11 | 会话清理任务：每日一次，`setInterval` 先顶着，**文档写清** | §9.3 | D-13（500 人必需） |
| 12 | `statement_timeout` 必须配 | D-13 | — |

## 3. Phase 1 必测项（执行包 §9.3「测试」原文）

| 项 | 对应验收 |
|---|---|
| 登录成功 / 失败 / 锁定 / 到期 | A1、A2 |
| must_change 只放行 3 个接口 | A3 |
| 退出后 Cookie 失效；返回 401 | A4 |
| Origin 不同源 403 | —（D-05） |
| bcrypt 密码校验；session token **只存 hash** | A4 |
| 登录后跳转；未登录回原路由 | A1 |
| 普通用户看不到管理导航 | A5 |

## 4. 规模相关的 Phase 1 约束（D-13，500 人）

- pg 连接池上限 **20**（不是 10，也不是 500）
- 会话清理**必须做**，不能延后（500 人 × 多设备，session 表会持续涨）
- `statement_timeout` 必配（管理员可查全员统计 = 12 万行聚合）
- **不引入 Redis、不引入连接池中间件**——这是每天用几次的办公工具，峰值并发远小于 500

## 5. 开工时需要新建的文件

```
apps/api/src/
  server.ts          # 入口：加载 env、建 app、listen
  app.ts             # Fastify 实例：注册插件/中间件/路由、errorHandler
  config.ts          # zod 环境变量校验
  db.ts              # pg Pool + timezone + statement_timeout
  lib/               # errors.ts / requestId.ts / serialize.ts / password.ts
  auth/              # login / logout / me / password / session / lockout / middleware
apps/web/src/
  main.tsx  App.tsx
  pages/Login.tsx  pages/ChangePassword.tsx  pages/Forbidden.tsx  pages/NotFound.tsx
  components/AppShell.tsx
  api/  auth/
apps/api/test/
  auth.login.test.ts  auth.lockout.test.ts  auth.must-change.test.ts
  auth.session.test.ts  auth.origin.test.ts  migrations.test.ts
```

## 6. 开工前没有阻塞项

U-2（7 人真名）/ U-3（域名证书）/ U-4（备份目标）/ U-6（导入角色）/ U-7（第四级叫法）
都是**上线前**才需要的信息；U-9（GitHub 远端）只影响提交历史，不影响编码。

**唯一还缺的是 Phase 0 gate 第 8 条：人类书面确认「契约通过」。**
