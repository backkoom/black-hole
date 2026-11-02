# 工作台与组织架构（workbench-app）

一期「工作台 + 任务 + 项目 + 组织账号 + 模板」内网管理系统。
**Phase 0 契约包已完成，等待人类书面确认契约后再进入 Phase 1。**

## 契约文档（先看这些）

| 文件 | 内容 |
|---|---|
| [docs/contracts/openapi.yaml](docs/contracts/openapi.yaml) | 34 个接口的唯一契约（OpenAPI 3.1） |
| [docs/contracts/decisions.md](docs/contracts/decisions.md) | **已决策项 + 未决项 + 影响面** —— 动手前先看这份 |
| [docs/contracts/modules.md](docs/contracts/modules.md) | 15 个模块（12 active + 3 placeholder）与 config schema |
| [docs/contracts/pages.md](docs/contracts/pages.md) | 10 个页面的组件树、字段、交互、状态 |
| [docs/contracts/acceptance.md](docs/contracts/acceptance.md) | 40 项验收逐条映射到测试与手工步骤 |

上游契约：《工作台与组织架构-可执行版-v2.md》（产品口径）、《AI 开发执行包-工作台与组织架构.md》（工程契约）。
本仓库的文档**不替代**它们，只做落地与追踪。

## 技术栈

TypeScript 5（strict）· Node 22 · npm workspaces · React 18 + Vite 5 + Ant Design 5 · Fastify 5 · PostgreSQL 18 · pg 8 手写参数化 SQL · zod 3 · Vitest 2 / Playwright

不用 Prisma/TypeORM、Redis、消息队列、CDN、图表库、react-grid-layout。

## 目录

```
workbench-app/
  apps/api/          Fastify 后端
  apps/web/          React 前端
  packages/shared/   前后端共享类型、模块定义、错误码
  db/migrations/     SQL 迁移（001_init.sql）
  db/seed.ts         种子脚本（幂等）
  docs/contracts/    契约文档
```

## 本地开发

### 前置

- Node.js 22
- PostgreSQL 18

### 数据库

本机已备好一个**独立的开发实例**（与已装的 5432 / 5433 实例完全隔离，端口 **15432**）：

```bash
# 启动（数据目录 D:/workspace/pg-dev/data）
"/c/Program Files/PostgreSQL/18/bin/pg_ctl" -D "D:/workspace/pg-dev/data" -o "-p 15432" -l "D:/workspace/pg-dev/server.log" start

# 建库建角色（首次）
psql -h 127.0.0.1 -p 15432 -U postgres -c "CREATE DATABASE workbench_dev;"
psql -h 127.0.0.1 -p 15432 -U postgres -c "CREATE ROLE workbench LOGIN PASSWORD 'workbench_dev_only';"
psql -h 127.0.0.1 -p 15432 -U postgres -d template1 -c "GRANT ALL ON SCHEMA public TO workbench;"
```

> PostgreSQL 15+ 起 `public` schema 默认不给 PUBLIC `CREATE` 权限，必须显式 `GRANT`。
> 授到 `template1` 是为了让以后新建的库都带上这条授权。

用 docker 的话：`docker compose up -d db`（compose 里是 `postgres:18`，端口 5432，`docker compose config` 已校验通过）。

> ⚠️ **本机 5432 / 5433 已被老6 自己装的 PostgreSQL 服务占用**，所以本项目开发实际用上面的 15432 原生实例。
> compose 是给「没有冲突的机器」和 CI 用的（执行包 §4.4 规定的标准启动路径）。
> Docker 29.9.2 + Compose v5.6.1 已装，PATH 里默认看不见，手动加一次即可：
> `export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"`

### 命令

```bash
npm install          # 装依赖（npm 缓存与全局目录在 D 盘）
npm run migrate      # 执行迁移
npm run seed         # 跑种子（Phase 1 实现）
npm run dev          # api:3000 + web:5173（Vite 把 /api 代理到 3000）
npm run verify       # lint + typecheck + test + build
```

开发端口固定：Vite **5173**，API **3000**。前端只写相对路径 `/api`，不启用 CORS。

### 环境变量

复制 `.env.example` 为 `.env`（**`.env` 不进仓库**）。启动时用 zod 校验，缺关键变量直接退出，不用默认密码兜底。

## 硬约束（摘自执行包，违反即返工）

- 页面不直接拼 SQL；API 不返回数据库行原样，做显式映射
- `apps/api` 不 import `apps/web`；共享类型放 `packages/shared`
- 所有写接口 zod 校验；数据库异常不直接返回
- 所有非 GET 校验 Origin/Referer 同源
- 未知字段默认剥离（`/api/users*` 三个接口例外，见 decisions.md D-01）
- 所有 `:id` 用 bigint 字符串解析，非法 id 返回 400 且不查库
- 密码 bcryptjs cost 12；初始密码只返回一次、不落库
- 不把 `.env`、密码、token、证书私钥、内网服务器信息提交进仓库

## 当前状态

| Phase | 范围 | 状态 |
|---|---|---|
| **Phase 0** | 契约包（不写业务代码） | ✅ 已完成，待人类审 |
| Phase 1 | 地基、认证、会话、应用壳 | ⏸ 待契约确认后开工 |
| Phase 2 | 组织、账号、导入 | ⏸ |
| Phase 3 | 工作台壳、布局、版本、模板 | ⏸ |
| Phase 4 | 任务、项目、进度 | ⏸ |
| Phase 5 | 任务/项目/设置页 UI 还原 | ⏸ |
| Phase 6 | 统计与指标卡接线 | ⏸ |
| Phase 7 | 部署与验收 | ⏸ |

Phase 0 验收清单见 [docs/contracts/decisions.md](docs/contracts/decisions.md)。
