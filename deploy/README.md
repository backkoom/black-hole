# Black Hole —— 部署手册

> 面向运维/实施。本文每条命令都可直接执行，**假设 Linux + systemd + nginx + PostgreSQL 18**。
>
> ⚠️ 本文所有路径与参数**以 `deploy/install.sh`、`deploy/one-shot.sh`、`deploy/smoke.sh` 的实际行为为准**。
> 脚本改了本文没跟上，**以脚本为准**。

---

## 0. 部署形态一览

```
        浏览器
          │  https://<域名>
          ▼
    ┌───────────┐        静态文件 + SPA 回退
    │   nginx   │◄────── /data/blackhole/apps/web/dist
    │  :443     │
    └─────┬─────┘
          │  /api/*  （同源反代）
          ▼
    ┌───────────┐
    │ Fastify   │  systemd: blackhole-api
    │  :3000    │  只监听 127.0.0.1
    └─────┬─────┘
          ▼
    ┌───────────┐
    │PostgreSQL │  :5432
    └───────────┘
```

**关键点：前端只写相对路径 `/api`，不做跨域，所以必须同源反代。**

## 0.1 本项目按「独立标准部署」交付（2026-11-06 定）

| | 结论 |
|---|---|
| **nginx** | **必须由本项目自带**（不依赖客户已有的 nginx）。`deploy/nginx-https.conf` 是标准配置 |
| **HTTPS** | **标准配置就带 HTTPS**：80 一律 301 → 443；证书放 `/etc/nginx/ssl/` |
| **接入客户已有 nginx** | 降为**可选**形态，见 §3.2 的 `nginx-integrate.conf.snippet`；不走它不影响交付 |
| 证书来源 | 内网无 CA 时先用自签（`gen-selfsigned-cert.sh`），换正式证书只改两行路径 |

> 现网实测（2026-11-06）：`https://192.168.102.102`，自签证书 `SAN=IP:192.168.102.102`，
> 80→301 跳转、页面 0 处 `http://` 混合内容、冒烟 21/21 通过。


---

## 1. 服务器前置准备

```bash
# Node 22 / PostgreSQL 18 / nginx
node -v            # 需 >= v22（根 package.json 的 engines 是 >=22）
psql --version     # 需 18
nginx -v

# 建服务账号与目录（不要用 root 跑服务）
sudo useradd -r -s /usr/sbin/nologin blackhole
sudo mkdir -p /data/blackhole /etc/blackhole
sudo chown blackhole:blackhole /data/blackhole

# 防火墙：只放行 80/443，不要把 3000 暴露到外网
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
```

> ⚠️ `install.sh` 自己只检查 Node ≥ 20，但仓库 `package.json` 的 `engines` 要求 **≥ 22**。
> 20 能装上但不受支持，请统一用 22。

### 数据库

```bash
sudo -u postgres psql <<'SQL'
CREATE USER blackhole WITH PASSWORD '换成强口令';
CREATE DATABASE blackhole OWNER blackhole;
-- 如需中文排序
ALTER DATABASE blackhole SET LC_COLLATE 'zh_CN.UTF-8';
SQL
```

> ⚠️ **口令里的特殊字符（`@ : / ? #`）必须 URL 编码**后再写进 `DATABASE_URL`，
> 否则连接串会被截断（`postgresql://user:p@ss@host/db` 里第一个 `@` 之后会被当成主机分隔符）。

---

## 2. 上传并安装

### 2.1 在开发机打包

```bash
cd /d/workspace/blackhole-app
bash scripts/package-release.sh          # 会先跑 verify（lint+typecheck+test+build）
# 产出：dist-release/blackhole-release-<时间戳>.tar.gz
```

### 2.2 传到服务器

```bash
scp dist-release/blackhole-release-*.tar.gz <user>@<host>:/tmp/
```

### 2.3 服务器上安装

```bash
# 解包后从包内取 install.sh（包里 scripts/ 与 deploy/ 各有一份，内容相同）
tar -xzf /tmp/blackhole-release-*.tar.gz -C /tmp
sudo bash /tmp/blackhole-release-*/scripts/install.sh --tarball /tmp/blackhole-release-*.tar.gz
```

`install.sh` 会依次完成：备份旧版本 → 解包 → 装生产依赖 → 生成环境变量文件 → 跑数据库迁移 → 装 systemd unit → 启动服务。

> ⚠️ **迁移这一步在生产包上会被跳过**：`node-pg-migrate` 是仓库根的 **devDependency**，
> 而 `install.sh` 装依赖用的是 `npm ci --omit=dev`（只装运行时依赖），
> 所以发布包里**没有** `node_modules/node-pg-migrate/bin/node-pg-migrate.js`。
> `install.sh` 检测不到它就会打印「node-pg-migrate 不在发布包里，跳过迁移」并继续 —— **不会报错，但表也没建**。
>
> 正确做法：**在开发机先跑一次迁移**，把建好的库导过去；或在服务器上手工执行（见 §4.1）。

`install.sh` 的其它参数：

| 参数 | 说明 |
|---|---|
| `--tarball <路径>` | **必填**。发布包 `.tar.gz` 的路径 |
| `--env-file <路径>` | 环境变量文件路径，默认 `/etc/blackhole/api.env` |
| `--dir <路径>` | 应用目录，默认 `/data/blackhole` |
| `--skip-migrate` | 跳过迁移步骤（表已建好时用，避免重复执行） |

**首次运行会因为环境变量还没填而退出（退出码 2），这是设计如此**：

```bash
sudo vi /etc/blackhole/api.env      # 填 DATABASE_URL / APP_ORIGIN / 口令
sudo chmod 600 /etc/blackhole/api.env
sudo bash /tmp/blackhole-release-*/scripts/install.sh --tarball /tmp/blackhole-release-*.tar.gz   # 重跑
```

> ⚠️ 重跑时 `install.sh` **不会**再重新生成 `/etc/blackhole/api.env`（文件已存在就跳过），
> 所以填错的值不会被自动纠正 —— 填完请自己核对一遍。

### 2.4 环境变量怎么填

| 键 | 内网验收（staging） | 生产（production） |
|---|---|---|
| `NODE_ENV` | `staging` | `production` |
| `APP_ORIGIN` | `http://<内网域名或IP>` | `https://<域名>`（**不带末尾斜杠**） |
| `COOKIE_SECURE` | `false` | **必须 `true`** |
| `DATABASE_URL` | `postgres://blackhole:<口令>@127.0.0.1:5432/blackhole` | 同左 |

> ⚠️ `APP_ORIGIN` 必须与浏览器地址栏**完全一致**，否则所有写请求会被 403「请求来源不被信任」拦掉。
> ⚠️ 口令含 `@ : / ? #` 等特殊字符时必须 URL 编码。
> ⚠️ 模板里的 `SEED_ADMIN_PASSWORD` / `SEED_RAQE_HYRLYHYI` 两行**只在首次播种时用得上**，
> 播种完建议删掉（见 §4）。

---

## 3. 配置 nginx

先选形态——**这两种不一样，别混着用**：

| 形态 | 适用 | 用哪个文件 |
|---|---|---|
| **A. 项目自带 nginx** | 这台机器只服务工作台，80/443 归它 | `deploy/nginx.conf.example`（完整 `server{}`） |
| **B. 接入已有 nginx** | 机器上已经跑着别的站点，工作台另开 `server{}` 或贴进现有 `server{}` | `deploy/nginx-integrate.conf.snippet`（只有 `location` 片段） |

> ⚠️ 形态 B 只支持挂在**域名根路径 `/`**。想挂 `/blackhole/` 这种子路径要改前端 router 的
> `basename`，属于代码改动，不在这套配置能力范围内——需要子路径就单独说。

### 3.1 形态 A：项目自带 nginx（**标准形态**）

两个模板，按有没有域名挑一个：

| 场景 | 用哪个 | 说明 |
|---|---|---|
| 内网 IP 访问（现网就是这种） | `deploy/nginx-https.conf` | `server_name _`，80→301→443，自签证书，不含 HSTS |
| 有正式域名/证书 | `deploy/nginx.conf.example` | 带 `server_name`、HSTS、ACME 落点，按注释改域名与证书路径 |
| 要跑**双 API 实例**（L1 高可用） | `deploy/nginx-https-lb.conf` | 换掉 `proxy_pass` 为 upstream，详见 §8.1 |

```bash
sudo cp /data/blackhole/deploy/nginx-https.conf /etc/nginx/conf.d/blackhole.conf
sudo nginx -t && sudo systemctl reload nginx
```

> 自签阶段**故意不开 HSTS**：一旦浏览器记住"只走 https"，换证书或临时退回 http 会很麻烦。
> 换正式证书时再把 HSTS 打开。

### 3.2 形态 B：接入已有 nginx

```bash
sudo vi /etc/nginx/conf.d/<你已有的站点>.conf
# 把 deploy/nginx-integrate.conf.snippet 里的 ①~⑤ 贴进那个 server{} 里
sudo nginx -t && sudo systemctl reload nginx
```

贴之前确认两件事：`/` 没被别的站点占用；**`add_header` 是覆盖不是合并**，
所以片段里每个 `location` 都把安全头重复写了一遍——别删。

### 3.3 模板做了这几件事（两种形态一致）

- `/api/` → 反代到 `127.0.0.1:3000`（同源，前端不跨域）
- `try_files $uri $uri/ /index.html` —— SPA 路由回退
- `/assets/` 长缓存（带 hash）、`index.html` 不缓存（发版后立刻生效）
- `.map` 源映射文件拒绝访问
- gzip + 安全响应头（HSTS / nosniff / X-Frame-Options / Referrer-Policy）
- `client_max_body_size 4m` —— 账号批量导入单文件限 2MB，这里留到 4m 宽一点
- 用 `listen 443 ssl http2;` 而不是 `http2 on;` —— 后者要 nginx ≥ 1.25.1，
  Ubuntu 24.04 是 1.24，会报 `unknown directive "http2"` 直接起不来

### 3.4 HTTPS：三条路，按手上有什么选

| 情况 | 怎么做 |
|---|---|
| 有企业 CA / 正式域名证书 | **证书由使用方自备**。把 `.crt`/`.key` 放 `/etc/nginx/ssl/`，改模板里两行路径即可——本项目不签发、不代管证书 |
| 什么都没有，先把 HTTPS 跑起来 | 自签只是**内网过渡**：`sudo bash deploy/gen-selfsigned-cert.sh <IP或域名>`（浏览器会提示不安全）。正式验收前必须换成使用方提供的证书 |
| 有公网域名 | 装 certbot 走 ACME，模板里已留 `/.well-known/acme-challenge/` 落点 |

**切 HTTPS 必须同时改 4 处，少一处就登不上或起不来：**

```bash
sudo vi /etc/blackhole/api.env
#   1. APP_ORIGIN=https://<域名>     ← 协议必须写 https，且与地址栏完全一致
#   2. COOKIE_SECURE=true            ← HTTPS 下必须开；还在 HTTP 时**不能**开，开了登录拿不到 Cookie
#   3. NODE_ENV=production           ← production 强制要求 https；反过来说 HTTP 环境得留 staging
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl restart blackhole-api
bash /data/blackhole/deploy/smoke.sh https://<域名>
```

> 顺序很重要：**先让 nginx 的 443 起来，再改 `APP_ORIGIN`/`COOKIE_SECURE` 并重启 API**。
> 反过来会有一段时间 API 拒绝所有请求（Origin 不匹配），现场看起来像"登录坏了"。

### 3.5 没有证书时（纯 HTTP 内网）

把 443 那段和 80 跳转那段注释掉，只留一个 80 的 `server`（现网就是这么跑的：
`listen 80 default_server; server_name _;` + 三个 location），并保证：

```bash
APP_ORIGIN=http://<IP或域名>
COOKIE_SECURE=false
NODE_ENV=staging
```

---

## 4. 初始化数据

### 4.1 先建表（迁移）

发布包里**没有**迁移工具（见 §2.3），所以建表要单独做。两种做法：

```bash
# 做法 A（推荐）：开发机先迁移，再把库导到服务器
#   开发机（仓库根目录）
npm run migrate        # = node-pg-migrate up -m "db/migrations/*.js" --use-glob
pg_dump -h <服务器> -U blackhole blackhole > blackhole.sql
#   服务器
psql -U blackhole -d blackhole < blackhole.sql
```

```bash
# 做法 B：服务器上临时装一次迁移工具再跑
cd /data/blackhole
npm i -g node-pg-migrate@7
export DATABASE_URL='postgres://blackhole:<口令>@127.0.0.1:5432/blackhole'
node-pg-migrate up -m "db/migrations/*.js" --use-glob
```

> ⚠️ `-m` 后面给的是 **glob 模式**，所以**必须同时带 `--use-glob`**。
> 少了 `--use-glob`，`db/migrations/*.sql` 也会被当成迁移文件执行一遍，DDL 会跑两遍。
> 迁移表名是 `pgmigrations`，重复执行 `up` 是幂等的。

### 4.2 播种账号

```bash
# tsx 是仓库根的 devDependency，生产包里没有 → 用 npx 临时拉
sudo -u blackhole bash -c '
  set -a; . /etc/blackhole/api.env; set +a
  cd /data/blackhole && npx --yes tsx db/seed.ts
'
```

播种后会创建：

| 账号 | 姓名 | 角色 | 说明 |
|---|---|---|---|
| `admin` | 系统管理员 | 超管 | `is_super=true` |
| `manager` | 部门管理员 | 管理员 | `is_super=false`；用于验「管理员不能授予管理员」这类规则（验收 G4 要求 9 个账号） |
| `user01` ~ `user07` | 用户01 ~ 用户07 | 普通用户 | 7 个 |

> ⚠️ `db/seed.ts` 是**幂等**的：账号已存在就跳过，不会改它的名字。
> 所以老库里可能看到 `user01` 被改成了别的账号名（例如通过「账号管理 → 批量导入」导入时改的），
> 这时重跑播种**不会**把它改回来 —— 账号名以库里为准。

**所有账号初始都要求改密**（`must_change_password=true`），首次登录会被强制跳到改密页。

口令来源（`db/seed.ts` 的实际逻辑）：

- `SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD` 环境变量里给了 → 用它；
- **没给** → 每个人随机生成 12 位，**只在这次运行的终端输出里打印一次**，之后查不到。

```bash
# 想让口令可预测，播种前显式给上（至少 8 位，含字母和数字）
set -a; . /etc/blackhole/api.env; set +a
echo "SEED_ADMIN_PASSWORD=换成强口令"  # 已存在则不生效
npx --yes tsx db/seed.ts
```

> ⚠️ 环境变量模板里的第二个种子口令键名是 **`SEED_RAQE_HYRLYHYI`**，
> 而 `db/seed.ts` 读的是 **`SEED_USER_PASSWORD`** —— 两者**对不上**，
> 所以 7 个普通用户的口令目前只能靠随机生成 + 终端打印一次拿到。
> 需要固定口令时，请在播种命令前显式 `export SEED_USER_PASSWORD=...`（见上）。

> 真实组织架构与人员数据建议直接用「账号管理 → 批量导入」导入，不要改种子脚本。

---

## 5. 验收

```bash
bash /data/blackhole/deploy/smoke.sh https://<你的域名>
```

> ⚠️ **脚本路径是 `deploy/smoke.sh`，不是 `scripts/smoke.sh`**。
> `install.sh` 只把 `deploy/` 复制到 `/data/blackhole/deploy/`，
> 发布包里的 `scripts/smoke.sh` 是**给开发机看的副本**，服务器上不存在那个路径。

脚本逐项检查并输出通过/失败：

| 检查项 | 内容 |
|---|---|
| 1/6 | 首页可达 |
| 2/6 | 未登录访问 `/api/auth/me` 返回 401 |
| 3/6 | 登录成功、会话建立 |
| 4/6 | 15 个核心接口全部 200（任务/项目/用户/组织/工作台/统计/风险/文件/里程碑/会议） |
| 5/6 | 前端 JS 包可访问、SPA 路由回退正常 |
| 6/6 | 安全响应头（X-Content-Type-Options；HSTS 缺失只提示不失败） |

退出码：`0` = 全通过，`1` = 有失败项。

### 5.1 脚本参数与环境变量

| 参数 / 变量 | 作用 |
|---|---|
| `<url>`（第 1 个位置参数） | 被检查的基地址。**默认 `http://127.0.0.1:3000`**（不传参数就跑直连） |
| `--direct` | 直连 API 模式：**跳过**首页可达、前端静态资源、SPA 回退、安全响应头这 4 项，只查接口 |
| `--origin=<url>` | 请求头 `Origin` 的值，**默认取基地址**。直连 API 时要用它覆盖成 `APP_ORIGIN`，否则写请求会被 403「请求来源不被信任」拦掉 |
| `--insecure` | 自签证书环境必带：curl 遇到不受信任的证书会直接失败（exit 60）。**正式证书环境不要带**，那等于关掉 TLS 校验 |
| `SMOKE_ACCOUNT` | 登录账号，**默认 `admin`** |
| `SEED_ADMIN_PASSWORD` | 登录口令。也可用 `SEED_ADMIN_PASSWORD_FILE`（**指向文件路径**，脚本读该文件第一行） |
| `/etc/blackhole/api.env` | 口令的第三来源：脚本会在 `SEED_ADMIN_PASSWORD` 与 `SEED_ADMIN_PASSWORD_FILE` 都没有时，从这里读 `SEED_ADMIN_PASSWORD` |

```bash
# 直连 API 排查（跳过前端与安全头检查）
bash /data/blackhole/deploy/smoke.sh http://127.0.0.1:3000 --direct --origin=https://<你的域名>

# 用普通账号验收（不改 admin 的初始改密状态）
SMOKE_ACCOUNT=user01 SEED_ADMIN_PASSWORD_FILE=/root/.smoke_pw \
  bash /data/blackhole/deploy/smoke.sh https://<你的域名>

# 自签证书环境（现网就是自签）——必须带 --insecure，否则所有请求都因证书不受信任失败
bash /data/blackhole/deploy/smoke.sh https://192.168.102.102 --insecure
```

> ⚠️ **口令不要写在命令行里** —— 会进 shell 历史，也可能被中间层过滤成随机串。
> 优先用 `SEED_ADMIN_PASSWORD_FILE`，其次 `SEED_ADMIN_PASSWORD`，再次让它读 `/etc/blackhole/api.env`。

### 5.2 用普通账号跑时，管理员接口返回 403 属预期

`/api/users` 与 `/api/org/tree` 是**管理员专属**接口。用 `SMOKE_ACCOUNT=user01` 这类普通账号跑时，
这两个接口返回 **403 是权限拦截生效，不是故障** —— 脚本会把它记成
「403（管理员接口，普通账号被正确拦截）」并算作**通过**。

脚本对这两个路径的 403 做了显式豁免（`is_admin_only`），其它路径的 4xx/5xx 一律算失败。

**注意**：首次部署 admin 处于「必须改密」状态，服务端会拦截除改密外的所有接口（403）——
这是设计行为。脚本会识别并提示「请先改密」，**改完密再重跑一次才是完整验收**。

---

## 6. 日常运维

```bash
systemctl status blackhole-api          # 状态
journalctl -u blackhole-api -f           # 实时日志
journalctl -u blackhole-api -n 100 --no-pager   # 最近 100 行
sudo systemctl restart blackhole-api     # 重启
```

### 6.1 备份与恢复（每天自动 + 每季度真演练一次）

**装定时备份（一次就好）：**

```bash
sudo install -m 755 /data/blackhole/deploy/backup.sh  /data/blackhole/deploy/backup.sh
sudo cp /data/blackhole/deploy/blackhole-backup.service /etc/systemd/system/
sudo cp /data/blackhole/deploy/blackhole-backup.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now blackhole-backup.timer

systemctl list-timers blackhole-backup.timer      # 看下次触发时间
sudo systemctl start blackhole-backup.service     # 立刻跑一次（验证用）
journalctl -u blackhole-backup.service -n 40 --no-pager
```

备份内容（每次一个时间戳目录，四件套）：数据库 `pg_dump` 自定义格式、前端产物、
`api.env`（含口令，权限 600）、`manifest.txt`（SHA256 + 版本 + 各表行数）。
**备份位置 / 份数 / 开关都是配置项**，写在 `/etc/blackhole/api.env` 里（改完不用重启，下次触发即生效）：

```bash
# /etc/blackhole/api.env
BACKUP_DIR=/data/backups/blackhole   # 落哪：本地目录，或已挂载的 NAS 路径
BACKUP_KEEP=14                       # 保留几份（按时间戳目录，超出删最旧）
BACKUP_ENABLED=true                  # false = 这台机器不做定时备份（脚本直接退出 0，不报红）
```

> ⚠️ 用 NAS / 另一块盘时，**先确认已挂载**（`df -h <路径>`）。没挂上时脚本会写到本地盘，
> 看起来"备份成功"，其实盘一挂两样都没——这是最常见的踩坑。
>
> 改完可以立刻验证一次：`sudo systemctl start blackhole-backup.service`，
> 然后 `ls $BACKUP_DIR` 看有没有新的时间戳目录。

**恢复演练（每季度做一次，别等真出事才试）：**

```bash
# ① 先看这份备份对不对
cat /data/backups/blackhole/<时间戳>/manifest.txt

# ② 导进演练库（不动生产）
sudo bash /data/blackhole/deploy/restore.sh \
     --dump /data/backups/blackhole/<时间戳> --to blackhole_drill
#   脚本会自动核对 users / org_nodes / projects / tasks 行数，任一为 0 就报错退出

# ③ 核对完删掉演练库
sudo -u postgres psql -c 'DROP DATABASE "blackhole_drill"'
```

**真回滚（生产库）：**

```bash
sudo bash /data/blackhole/deploy/backup.sh                    # 先把"现在"存一份
sudo bash /data/blackhole/deploy/restore.sh \
     --dump /data/backups/blackhole/<时间戳> --to blackhole --force
bash /data/blackhole/deploy/smoke.sh http://127.0.0.1         # 回滚后必须冒烟
```

`restore.sh` 不带 `--force` 时**拒绝**覆盖服务正在用的库——这是故意的，防手滑。

### 6.2 文件存储（用户上传的实体）

用户端「文件资料」的上传文件**不存数据库**，落在磁盘上：

```bash
# /etc/blackhole/api.env
FILE_STORAGE_DIR=/data/blackhole/storage/files   # 实体目录
MAX_UPLOAD_MB=50                                 # 单文件上限
```

- 目录结构是 `年/月/<uuid>.<ext>`，**文件名不参与路径**（中文名、重名、`../` 都不会出问题）；
- 服务启动时会自动建目录，建不出来就直接起不来（别等用户点上传才 500）；
- 删除文件会**同时删磁盘实体**，不然磁盘只涨不降；
- 备份脚本（§6.1）会把整个目录打进 `files.tar.gz`，恢复时一并铺回；
- 换机器迁移：拷 `FILE_STORAGE_DIR` 整个目录 + 数据库，两样缺一不可。

> ⚠️ 磁盘要单独盯：数据库只有几十 MB，文件可能几百 GB。
> 建议把 `FILE_STORAGE_DIR` 指到独立数据盘，并加一条 `df -h` 的巡检。

### 6.3 系统设置页（备份 / 存储 / 证书）

管理员登录后：**设置 → 系统管理 → 系统设置**。三块内容：

| 面板 | 能改吗 | 说明 |
|---|---|---|
| **备份** | ✅ 可改（仅超管） | 目录 / 保留份数 / 是否启用定时。存数据库，**备份脚本下次运行就生效，不用重启** |
| **文件存储** | ❌ 只读 | 目录、单文件上限、已用容量；改要动 `FILE_STORAGE_DIR` / `MAX_UPLOAD_MB` 并重启 |
| **HTTPS 证书** | ❌ 只读 | 显示当前证书的主题/颁发者/有效期/剩余天数/SAN；剩余 < 30 天标橙 |

> 备份配置的优先级：**命令行参数 > 数据库（页面设置的）> 环境变量 > 默认值**。
> 换证书、把备份挪到 NAS 的完整步骤见 [docs/使用指南-证书替换与异地备份.md](../docs/使用指南-证书替换与异地备份.md)。
> 所以 `api.env` 里的 `BACKUP_DIR` 现在是"默认值"，页面上改了以页面为准；
> 想清掉页面设置，直接 `DELETE FROM system_setting WHERE key LIKE 'backup.%'` 即可回退。

### 6.4 密码哈希成本（500 人环境要调）

```bash
# /etc/blackhole/api.env
BCRYPT_COST=10     # 8~15，默认 12
```

- 服务端实测（8 vCPU / Xeon Gold 6530，bcryptjs 纯 JS）：**cost 12 = 466 ms/次，cost 10 = 141 ms/次**；
- 500 人批量导入 = 连续 500 次哈希。默认 12 在弱一点的机器上会拖到 1 分钟以上，
  甚至撞反代超时 → **500 人环境建议 10**（仍高于 OWASP 的 10 下限）；
- 几十人的小环境保持 12 更稳；**任何情况下不要低于 10**；
- 哈希已经在 worker 线程池里跑（`lib/password-pool.ts`），不会阻塞其它请求。

### 6.5 开机自启的三个服务

| 服务 | unit 名 | 谁来 enable | 检查命令 |
|---|---|---|---|
| API | `blackhole-api` | `install.sh` 自动 `systemctl enable` | `systemctl is-enabled blackhole-api` |
| nginx | `nginx` | **要自己 enable**（`install.sh` 只装 unit 不动 nginx） | `systemctl is-enabled nginx` |
| PostgreSQL | `postgresql` | **要自己 enable**（`one-shot.sh` 会做，`install.sh` 不会） | `systemctl is-enabled postgresql` |

```bash
# 走 install.sh 路线的话，nginx 与 postgresql 要自己补上开机自启
sudo systemctl enable nginx
sudo systemctl enable postgresql
```

> ⚠️ 忘了 enable nginx 或 postgresql，机器重启后站点就起不来 —— 这是最常见的「昨天还好好的，今天打不开了」。

### 升级

```bash
# 开发机
bash scripts/package-release.sh
scp dist-release/blackhole-release-*.tar.gz <user>@<host>:/tmp/
# 服务器
tar -xzf /tmp/blackhole-release-*.tar.gz -C /tmp
sudo bash /tmp/blackhole-release-*/scripts/install.sh --tarball /tmp/blackhole-release-*.tar.gz
bash /data/blackhole/deploy/smoke.sh https://<域名>
```

`install.sh` 幂等，重复跑安全。每次安装前自动备份到 `/data/blackhole/.releases/<时间戳>/`（保留最近 5 个）。

> ⚠️ 升级**不会**自动跑迁移（见 §2.3：发布包里没有迁移工具）。
> 这次版本带了新迁移的话，先在开发机 `npm run migrate` 并把库导过去，或在服务器上手工执行。

> ⚠️ **`install.sh` 会把 `package.json` / `package-lock.json` / `packages/` 一起替换**（2026-11-06 修）。
> 之前只换 `apps/`、`db/`，只要新版加了依赖（例如 `solarlunar`），服务器上的 lock 还是旧的，
> `npm ci` 会报 `Missing: xxx from lock file` 并中止安装（`set -euo pipefail` 生效，不会静默成功）。
> 排查口诀：**看 `/data/blackhole/package-lock.json` 里有没有新依赖**。

**升级演练实测（2026-11-06，192.168.102.102）**：打包 2.6M → scp → `install.sh` → 迁移无变更 →
服务自动重启 → 冒烟 21/21 → `RELEASE.txt` 的 Git 提交与 `index.html` 资源 hash 磁盘/线上一致。

**升级后要逐项确认（缺一项都可能"升级成功但页面是旧的"）：**

```bash
# 1. 版本对上了没（install.sh 会把包的 RELEASE.txt 拷到安装目录）
cat /data/blackhole/RELEASE.txt

# 2. 线上 index.html 引用的资源 hash 是不是新的
grep -o 'index-[A-Za-z0-9_-]*\.\(js\|css\)' /data/blackhole/apps/web/dist/index.html
curl -s http://127.0.0.1/ | grep -o 'index-[A-Za-z0-9_-]*\.\(js\|css\)'   # 两行必须一致

# 3. 服务活着、接口通
systemctl is-active blackhole-api
bash /data/blackhole/deploy/smoke.sh http://127.0.0.1
```

> 第 2 步两行不一致 = nginx 的 `root` 指到了旧目录，是最常见的"发版了但用户看不到"。

### 回滚

`install.sh` 的备份只含 **`apps/` 与 `db/` 两个目录**（不含 `deploy/`、不含环境变量）。
所以回滚就是「把这两个目录换回旧版本」：

```bash
sudo systemctl stop blackhole-api
sudo rm -rf /data/blackhole/apps /data/blackhole/db
sudo cp -r /data/blackhole/.releases/<时间戳>/apps /data/blackhole/
sudo cp -r /data/blackhole/.releases/<时间戳>/db    /data/blackhole/
sudo systemctl start blackhole-api
```

> ⚠️ **必须先 `rm -rf` 再 `cp -r`。** 直接 `cp -r 备份/apps /data/blackhole/` 会把文件
> **拷进已有目录**（变成 `apps/apps/...`），旧文件也留在那儿，回滚等于没回滚。
> `install.sh` 自己的行为也是先 `rm -rf "$APP_DIR/apps" "$APP_DIR/db"` 再拷。

> ⚠️ **数据库迁移不自动回滚**。如果新版本改了表结构，回滚代码前先确认旧版能兼容新表；
> 必要时用 `pg_dump` 备份后手工回滚表结构。
> 回滚 `db/` 目录只是还原**迁移脚本文件**，已执行的迁移记录（`pgmigrations` 表）不会回退。

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
| systemd 反复重启 | 环境变量校验失败 | `journalctl -u blackhole-api -n 50` 看具体报错 |
| 机器重启后站点打不开了 | nginx / postgresql 没 enable 自启 | `sudo systemctl enable nginx postgresql`（见 §6.1） |
| 冒烟脚本第 4 项大面积 404 | 表没建 —— 发布包没有迁移工具，迁移被跳过了 | 按 §4.1 手工建表 |
| 冒烟脚本报「node-pg-migrate 不在发布包里」 | 同上（这是**提示不是错误**，脚本会继续） | 同上 |
| 冒烟脚本找不到文件 | 用了 `scripts/smoke.sh`（服务器上没这个路径） | 改成 `deploy/smoke.sh`（见 §5） |
| 冒烟脚本登录 403「请求来源不被信任」 | `--direct` 时 Origin 与 `APP_ORIGIN` 不一致 | 加 `--origin=<APP_ORIGIN 的值>` |
| 冒烟脚本报「未提供 SEED_ADMIN_PASSWORD」 | 口令三个来源都没有 | 设 `SEED_ADMIN_PASSWORD_FILE` 指向口令文件（见 §5.1） |

---

## 8. 高可用（可选）

> 现状：单机三层（nginx / API / PostgreSQL）已经是分离的，只是跑在一台机器上。
> 下面两级按需启用，**不启用不影响任何功能**。

### 8.1 L1：API 双实例（代码零改动，已在 192.168.102.102 实测）

API 是**无状态**的（会话存在数据库里），所以直接起两个进程、nginx 轮询即可。
单实例挂掉时 nginx 自动切到另一个，用户无感。

```bash
# 1) 装模板单元（一个文件，端口由实例名决定）
sudo cp /data/blackhole/deploy/blackhole-api@.service /etc/systemd/system/
sudo systemctl daemon-reload

# 2) 停单实例，起两个
sudo systemctl disable --now blackhole-api
sudo systemctl enable --now blackhole-api@3001 blackhole-api@3002

# 3) nginx 换成 upstream 版本
sudo cp /data/blackhole/deploy/nginx-https-lb.conf /etc/nginx/conf.d/blackhole.conf
sudo nginx -t && sudo systemctl reload nginx
```

**验证（三步都要看）**

```bash
curl -s -o /dev/null -w '3001=%{http_code}\n' http://127.0.0.1:3001/api/health   # 或 /api/auth/me 401 也算通
curl -s -o /dev/null -w '3002=%{http_code}\n' http://127.0.0.1:3002/api/health
curl -sk -o /dev/null -w 'site=%{http_code}\n' https://<域名>/

# 拔掉一个，站点应仍然可用
sudo systemctl stop blackhole-api@3002
curl -sk -o /dev/null -w 'after-kill=%{http_code}\n' https://<域名>/
sudo systemctl start blackhole-api@3002
```

**降回单实例**

```bash
sudo systemctl disable --now blackhole-api@3001 blackhole-api@3002
sudo systemctl enable --now blackhole-api
sudo cp /data/blackhole/deploy/nginx-https.conf /etc/nginx/conf.d/blackhole.conf
sudo nginx -t && sudo systemctl reload nginx
```

> ⚠️ 升级（`install.sh`）会自动识别当前是单实例还是多实例：多实例时只重启 `@3001/@3002`，
> 不会再拉起 3000 那个单元。

### 8.2 L2：PostgreSQL 主从（**当前规模不需要，留档备查**）

> ⚠️ **2026-11-08 结论：500 人这个量级不需要做数据库主从。**
> 依据：`docs/contracts/perf-report.md` 实测——12.5 万任务下读接口 p95 ≤ 31ms、
> 管理员全员聚合 ≤ 120ms，库总共 31MB。瓶颈从来不在数据库。
> 真要做异地容灾，优先级是"备份放到另一块盘/NAS"（现在可以在
> 设置 → 系统设置 里改目录），而不是先上主从。
> 具体做法见 [docs/使用指南-证书替换与异地备份.md](../docs/使用指南-证书替换与异地备份.md) 第二节。
> 下面这段保留，等真的有多机需求再执行。

> 这一步需要**第二台机器**，且 PG 大版本必须一致（本项目统一 18）。
> 本项目不引 keepalived / VIP / 中间件，**不做自动故障转移**——切换是人工步骤。

**主库（现有这台）**

```sql
-- postgresql.conf
wal_level = replica
max_wal_senders = 10
wal_keep_size = 512MB
-- pg_hba.conf：只允许从库 IP 复制
host replication replicator <从库IP>/32 scram-sha-256
```

```sql
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD '<强口令>';
SELECT pg_reload_conf();
```

**从库（第二台）**

```bash
sudo -u postgres pg_basebackup -h <主库IP> -U replicator -D /var/lib/postgresql/18/main \
     -Fp -Xs -P -R      # -R 会自动写 standby.signal 与 primary_conninfo
sudo systemctl start postgresql
sudo -u postgres psql -c 'select status, sender_host from pg_stat_wal_receiver'   # streaming 即成功
```

**切换（主库挂了）**

```bash
# 从库提升为主
sudo -u postgres pg_ctl promote -D /var/lib/postgresql/18/main
# 改应用连接串
sudo vi /etc/blackhole/api.env     # DATABASE_URL 指向新的主
sudo systemctl restart blackhole-api
bash /data/blackhole/deploy/smoke.sh https://<域名> --insecure
```

> ⚠️ 提升后**原主库不能再直接启回来**（会脑裂）：确认它已下线，重建为从库再入集群。
> 这一步建议写到客户运维手册里，作为演练项。
