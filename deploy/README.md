# 工作台与组织架构 —— 部署手册

> 面向运维/实施。本文每条命令都可直接执行，**假设 Linux + systemd + nginx + PostgreSQL 16+**。

---

## 0. 部署形态一览

```
        浏览器
          │  https://<域名>
          ▼
    ┌───────────┐        静态文件 + SPA 回退
    │   nginx   │◄────── /opt/workbench/apps/web/dist
    │  :443     │
    └─────┬─────┘
          │  /api/*  （同源反代）
          ▼
    ┌───────────┐
    │ Fastify   │  systemd: workbench-api
    │  :3000    │  只监听 127.0.0.1
    └─────┬─────┘
          ▼
    ┌───────────┐
    │PostgreSQL │  :5432
    └───────────┘
```

**关键点：前端只写相对路径 `/api`，不做跨域，所以必须同源反代。**

---

## 1. 服务器前置准备

```bash
# Node 20+ / PostgreSQL 16+ / nginx
node -v            # 需 >= v20
psql --version
nginx -v

# 建服务账号与目录（不要用 root 跑服务）
sudo useradd -r -s /usr/sbin/nologin workbench
sudo mkdir -p /opt/workbench /etc/workbench
sudo chown workbench:workbench /opt/workbench

# 防火墙：只放行 80/443，不要把 3000 暴露到外网
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
```

### 数据库

```bash
sudo -u postgres psql <<'SQL'
CREATE USER workbench WITH PASSWORD '换成强口令';
CREATE DATABASE workbench OWNER workbench;
-- 如需中文排序
ALTER DATABASE workbench SET LC_COLLATE 'zh_CN.UTF-8';
SQL
```

---

## 2. 上传并安装

### 2.1 在开发机打包

```bash
cd /d/workspace/workbench-app
bash scripts/package-release.sh          # 会先跑 verify（lint+typecheck+test+build）
# 产出：dist-release/workbench-release-<时间戳>.tar.gz
```

### 2.2 传到服务器

```bash
scp dist-release/workbench-release-*.tar.gz <user>@<host>:/tmp/
```

### 2.3 服务器上安装

```bash
sudo bash /tmp/install.sh --tarball /tmp/workbench-release-*.tar.gz
```

`install.sh` 会依次完成：备份旧版本 → 解包 → 装生产依赖 → 生成环境变量文件 → 跑数据库迁移 → 装 systemd unit → 启动服务。

**首次运行会因为环境变量还没填而退出（退出码 2），这是设计如此**：

```bash
sudo vi /etc/workbench/api.env      # 填 DATABASE_URL / APP_ORIGIN / 口令
sudo chmod 600 /etc/workbench/api.env
sudo bash /tmp/install.sh --tarball /tmp/workbench-release-*.tar.gz   # 重跑
```

### 2.4 环境变量怎么填

| 键 | 内网验收（staging） | 生产（production） |
|---|---|---|
| `NODE_ENV` | `staging` | `production` |
| `APP_ORIGIN` | `http://<内网域名或IP>` | `https://<域名>`（**不带末尾斜杠**） |
| `COOKIE_SECURE` | `false` | **必须 `true`** |
| `DATABASE_URL` | `postgres://workbench:<口令>@127.0.0.1:5432/workbench` | 同左 |

> ⚠️ `APP_ORIGIN` 必须与浏览器地址栏**完全一致**，否则所有写请求会被 403「请求来源不被信任」拦掉。
> ⚠️ 口令含 `@ : / ? #` 等特殊字符时必须 URL 编码。

---

## 3. 配置 nginx

```bash
sudo cp /opt/workbench/deploy/nginx.conf.example /etc/nginx/conf.d/workbench.conf
sudo vi /etc/nginx/conf.d/workbench.conf      # 改 server_name / 证书路径
sudo nginx -t && sudo systemctl reload nginx
```

模板里做了这几件事：

- `/api/` → 反代到 `127.0.0.1:3000`（同源）
- `try_files $uri $uri/ /index.html` —— SPA 路由回退
- `/assets/` 长缓存（带 hash）、`index.html` 不缓存（发版后立刻生效）
- `.map` 源映射文件拒绝访问
- gzip + 安全响应头 + 2MB 上传上限（账号批量导入用）

**没有 HTTPS 证书时**：把 443 那段 server 注释掉，只留 80，并把 `APP_ORIGIN` 设成 `http://`，
同时 `NODE_ENV=staging`（`production` 强制要求 https，会启动失败）。

---

## 4. 初始化数据

```bash
sudo -u workbench bash -c '
  set -a; . /etc/workbench/api.env; set +a
  cd /opt/workbench && npx tsx db/seed.ts
'
```

播种后会创建 admin + 7 个普通用户（`user01` + `user02`~`user07`），**所有账号初始都要求改密**。

> 真实组织架构与人员数据建议直接用「账号管理 → 批量导入」导入，不要改种子脚本。

---

## 5. 验收

```bash
bash /opt/workbench/scripts/smoke.sh https://<你的域名>
```

脚本逐项检查并输出通过/失败：

| 检查项 | 内容 |
|---|---|
| 1/6 | 首页可达 |
| 2/6 | 未登录访问 `/api/auth/me` 返回 401 |
| 3/6 | admin 登录成功、会话建立 |
| 4/6 | 15 个核心接口全部 200（任务/项目/用户/组织/工作台/统计/风险/文件/里程碑/会议） |
| 5/6 | 前端 JS 包可访问、SPA 路由回退正常 |
| 6/6 | 安全响应头 |

**注意**：首次部署 admin 处于「必须改密」状态，服务端会拦截除改密外的所有接口（403）——
这是设计行为。脚本会识别并提示「请先改密」，**改完密再重跑一次才是完整验收**。

```bash
# 直连 API 排查用（跳过前端与安全头检查）
bash /opt/workbench/scripts/smoke.sh http://127.0.0.1:3000 --direct
```

---

## 6. 日常运维

```bash
systemctl status workbench-api          # 状态
journalctl -u workbench-api -f           # 实时日志
journalctl -u workbench-api -n 100 --no-pager   # 最近 100 行
sudo systemctl restart workbench-api     # 重启
```

### 升级

```bash
# 开发机
bash scripts/package-release.sh
scp dist-release/workbench-release-*.tar.gz <user>@<host>:/tmp/
# 服务器
sudo bash /tmp/install.sh --tarball /tmp/workbench-release-*.tar.gz
bash /opt/workbench/scripts/smoke.sh https://<域名>
```

`install.sh` 幂等，重复跑安全。每次安装前自动备份到 `/opt/workbench/.releases/<时间戳>/`（保留最近 5 个）。

### 回滚

```bash
sudo systemctl stop workbench-api
sudo cp -r /opt/workbench/.releases/<时间戳>/apps /opt/workbench/
sudo cp -r /opt/workbench/.releases/<时间戳>/db    /opt/workbench/
sudo systemctl start workbench-api
```

> ⚠️ **数据库迁移不自动回滚**。如果新版本改了表结构，回滚代码前先确认旧版能兼容新表；
> 必要时用 `pg_dump` 备份后手工回滚表结构。

---

## 7. 排障速查

| 现象 | 原因 | 处理 |
|---|---|---|
| 启动报「生产环境 COOKIE_SECURE 必须为 true」 | NODE_ENV=production 但没设 COOKIE_SECURE | 设 `COOKIE_SECURE=true`；或内网用 `NODE_ENV=staging` |
| 启动报「生产环境 APP_ORIGIN 必须是 https:// 开头」 | 同上 | 同上 |
| 所有写请求 403「请求来源不被信任」 | `APP_ORIGIN` 与浏览器地址不一致 | 改成完全一致（不带末尾斜杠） |
| 登录后其他接口全 403 | 账号处于「必须改密」 | 浏览器登录一次完成改密 |
| 前端白屏 | nginx 没做 SPA 回退 | 检查 `try_files $uri $uri/ /index.html` |
| 前端能开但接口 404 | nginx 没配 `/api/` 反代 | 检查 proxy_pass |
| 登录后刷新就掉 | Cookie 的 secure 与实际协议不匹配 | staging 用 http 时 `COOKIE_SECURE=false`；https 时 `true` |
| systemd 反复重启 | 环境变量校验失败 | `journalctl -u workbench-api -n 50` 看具体报错 |
