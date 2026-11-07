<p align="center">
  <img src="docs/brand/blackhole-brand.png#gh-light-mode-only" alt="Black Hole" width="240" />
  <img src="docs/brand/blackhole-mark.png#gh-dark-mode-only" alt="Black Hole" width="120" />
</p>

# Black Hole

内网项目管理系统：用户端 10 页固定界面 + 管理员端（工作台编排 / 账号 / 组织架构 / 模板）。

前后端分离的 **BS 架构**：浏览器端 React SPA + 服务端 Fastify REST API + PostgreSQL。

```
浏览器 (React 18 + Vite 5 + Ant Design 5)
   │  fetch /api/*   ← 同源，不启用 CORS
   ▼
Fastify 5 (Node 22 + TypeScript strict + zod + 手写参数化 SQL)
   ▼
PostgreSQL 18
```

---

## 功能

### 用户端（10 页）

| 路由 | 页面 | 说明 |
|---|---|---|
| `/` | 项目总览 | 指标卡 · 项目进度 · 日程 · 今日任务 · 任务状态环图 |
| `/kanban` | 项目看板 | 4 列看板（待开始 / 进行中 / 已逾期 / 已完成），拖拽换列 |
| `/tasks` | 任务清单 | 10 列表格 + 5 个筛选下拉 + 日期范围 + 导出 |
| `/calendar` | 日程安排 | 周一起始月历 + 今日时间轴 + 里程碑 + 任务提醒 |
| `/progress` | 进度追踪 | 项目进度计划 + 健康度 + 阶段进度 + 偏差分析 |
| `/team` | 团队协作 | 成员 · 角色分工 · 会议纪要 |
| `/files` | 文件资料 | 文件夹 / 分类 / 清单 / 版本历史（**只存元数据**） |
| `/risks` | 风险问题管理 | 3×3 影响×概率矩阵 · 应对计划 · 状态统计 |
| `/analytics` | 数据统计 | 完成趋势 · 分类分布 · 进度分布 · 团队工作量 · 排行 |
| `/settings/*` | 设置 | 个人资料 / 修改密码 / 账号管理 / 组织架构 / 工作台模板 |

### 管理员端

工作台编辑器（12 个 active 模块自由编排、拖拽排序、缩放、草稿、模板）、账号管理（批量导入）、组织架构树、工作台模板。

---

## 技术栈

TypeScript 5（strict）· Node 22 · npm workspaces · React 18 + Vite 5 + Ant Design 5 · Fastify 5 · PostgreSQL 18 · pg 8（手写参数化 SQL）· zod 3 · Vitest 2 / Playwright

**刻意不用**：Prisma/TypeORM、Redis、消息队列、CDN、图表库、react-grid-layout。
图表全部手写 SVG（`apps/web/src/components/ui/charts.tsx`）。

---

## 目录

```
blackhole-app/
  apps/api/          Fastify 后端（路由 / 服务 / 认证 / 测试）
  apps/web/          React 前端（页面 / 组件 / 主题）
  packages/shared/   跨端共享类型与纯函数
  db/                迁移（.sql + .js 包装）与种子脚本
  deploy/            部署资产（systemd / nginx / 环境变量模板 / 手册）
  scripts/           打包 / 截图 / 脱敏工具
  docs/contracts/    接口契约、决策记录、模块与页面定义、验收清单
```

---

## 快速开始（本地开发）

```bash
# 依赖
npm install

# 准备数据库（独立开发库，别用系统库）
docker compose up -d          # 或用你自己的 PostgreSQL 16+
cp .env.example .env          # 改 DATABASE_URL 等

# 迁移 + 种子
npm run migrate
npm run seed

# 开发（API 3000 + Web 5173，/api 已配同源代理）
npm run dev
```

打开 <http://localhost:5173>，种子账号 `admin`，口令见 `npm run seed` 的输出（**首次登录强制改密**）。

### 质量门

```bash
npm run verify     # lint + typecheck + vitest + build
npm run test:e2e   # Playwright（需先起 dev server）
```

---

## 部署

`deploy/` 里有完整链路：打包 → 安装 → 验收 → 升级/回滚。

```bash
# 开发机打包（先跑 verify）
bash scripts/package-release.sh
# 产物：dist-release/blackhole-release-<时间戳>.tar.gz

# 上传后，在服务器上
sudo bash install.sh --tarball /tmp/blackhole-release-*.tar.gz
```

详见 **[deploy/README.md](deploy/README.md)**（前置准备 / nginx / 播种 / 验收 / 升级 / 回滚 / 排障速查表）。

部署形态：nginx 托管静态资源并把 `/api` 同源反代到 Fastify；API **只监听回环地址**；systemd 托管；环境变量集中在 `/etc/blackhole/api.env`（`chmod 600`）。

> ⚠️ 内网无 HTTPS 证书时用 `NODE_ENV=staging`（允许 http）；`production` 强制 https + `COOKIE_SECURE=true`。

---

## 安全说明

- 口令 bcrypt（cost 12）；会话走 HttpOnly Cookie；同源校验（Origin/Referer）
- 所有 SQL 参数化绑定；无 `dangerouslySetInnerHTML`；iframe 强制 `sandbox`
- 改密强制拦截（`must_change_password`）；登录失败锁定；会话定期清理
- API 非开发环境只绑 `127.0.0.1`；nginx 侧安全头 + gzip + 上传体积限制

### 脱敏

本仓库曾用于内网交付，发布前已做脱敏：组织架构链与账号名替换为示例数据，**并重写了全部 git 历史**（`git filter-repo`）。仓库内不含任何真实组织信息。

脱敏工具留在仓库里，便于二次发布前复查：

```bash
python3 scripts/gen-replace-text.py         # 生成替换表
python3 scripts/scrub-sensitive.py --scan   # 扫工作区 + git 历史
```

---

## 文档

| 文件 | 内容 |
|---|---|
| [docs/contracts/openapi.yaml](docs/contracts/openapi.yaml) | 接口契约（OpenAPI 3.1） |
| [docs/contracts/decisions.md](docs/contracts/decisions.md) | 已决策项 + 未决项 + 影响面 |
| [docs/contracts/modules.md](docs/contracts/modules.md) | 15 个模块（12 active + 3 placeholder）与 config schema |
| [docs/contracts/pages.md](docs/contracts/pages.md) | 页面组件树、字段、交互、状态 |
| [docs/contracts/acceptance.md](docs/contracts/acceptance.md) | 验收项映射到测试与手工步骤 |
| [deploy/README.md](deploy/README.md) | 部署手册 |

页面截图见 `docs/screenshots/`。

---

## License

MIT
