# 500 人规模验证报告（D-13）

> 执行日期：2026-11-07 · 环境：内网 Ubuntu 交付机（8 vCPU Xeon Gold 6530 / 31MB 数据 / PostgreSQL 18）
> 数据集：**500 普通用户 + 1 管理员 / 21 个末级组织节点 / 200 项目 / 125,000 任务 / 501 个工作台 + 2004 条布局**
> 施压方式：`scripts/perf-check.mjs` + `scripts/perf-seed.mjs`
> ⚠️ 全程在**独立库 `blackhole_perf` + 独立 API 实例（3100）**上跑，不碰生产库；跑完已销毁。

---

## 一、结论

**D-13 的 4 条验收全部通过**，但过程中查出 **1 个必须修的性能缺陷**（已修）：
bcryptjs 是纯 JS 实现且跑在主线程，500 人批量导入会**把整个 API 卡住约 3 分钟**。

| 验收项 | 修前 | 修后 | 判定 |
|---|---|---|---|
| ① 500 人 CSV 一次导入成功 + 抽查 20 个账号能登录 | 188 s / 20-20 | **12.5 s** / 20-20 | ✅ |
| ② 500 次首登强制改密不超时 | p50 11.7 s，p95 13.0 s | **p50 0.70 s，p95 0.81 s** | ✅ |
| ③ 组织树挂满层级、各节点人数正确 | — | 20 个末级节点合计 **500 人** | ✅ |
| ④ 真实数据量下指标卡与项目列表 < 1 s | — | 普通账号 p95 **≤ 31 ms**；管理员全员聚合 p95 ≤ 120 ms | ✅ |

> 「修前」不是估算：是同一脚本在同一台机器上先跑出来的真实数字（见 §四）。

---

## 二、修前 vs 修后（关键指标）

| 指标 | 修前 | 修后 | 变化 |
|---|---|---|---|
| 导入 500 人 | 188,270 ms | 12,587 ms | **快 15 倍** |
| 首登改密 p50 | 11,773 ms | 701 ms | 快 16.8 倍 |
| 首登改密 p95 | 13,037 ms | 812 ms | 快 16 倍 |
| **导入期间** `/api/auth/me` | 请求阻塞（主线程被占） | **p50 1 ms / p95 3 ms / max 49 ms** | API 不再被占住 |
| 单次 bcrypt（cost 12） | 466 ms | — | 实测基准 |
| 单次 bcrypt（cost 10） | 141 ms | — | 实测基准 |

---

## 三、读接口实测（125,000 任务 / 200 项目 / 500 用户）

普通账号（只查自己的数据）：

| 接口 | p50 | p95 |
|---|---|---|
| `/api/workspace` | 10 ms | 12 ms |
| `/api/tasks?due=today` | 9 ms | 19 ms |
| `/api/tasks?due=overdue` | 11 ms | 11 ms |
| `/api/projects` | 21 ms | 31 ms |
| `/api/stats/trend?weeks=8` | 8 ms | 9 ms |
| `/api/stats/distribution` | 15 ms | 19 ms |
| `/api/stats/team-workload` | 7 ms | 7 ms |
| `/api/files/summary` | 7 ms | 8 ms |
| `/api/risks/summary` | 7 ms | 7 ms |

管理员（全员 12.5 万行聚合）：

| 接口 | 耗时 |
|---|---|
| `/api/stats/team-workload` | 22 ms |
| `/api/stats/distribution` | 46 ms |
| `/api/tasks`（全员，无分页） | 120 ms |

**数据库不是瓶颈**——这与 D-13 约束 7 的判断一致。真正的瓶颈是密码哈希。

---

## 四、查出的问题与修复

### 问题 1（严重）：bcryptjs 阻塞主线程，导入把 API 卡死 3 分钟

**现象**：500 人导入耗时 188 秒，期间所有接口无响应。

**根因**：
- `bcryptjs` 是**纯 JS** 实现，一次 cost=12 哈希在本机要 **466 ms**；
- 它跑在 Node 主线程上，导入 500 人 = 连续 500 次哈希 ≈ 233 秒，**主线程全程被占**；
- 压测里的「首登改密 p50 11.7 s」也是同一原因：10 个并发请求排队等同一个线程。

**修复**（提交见 `apps/api/src/lib/password-pool.ts`）：
1. **worker 线程池**（N = CPU-1，最多 4）承接 bcrypt 计算，主线程只收发消息；
   线程懒创建、异常自动降级到主线程；
2. **成本档位可配** `BCRYPT_COST`（8~15，默认 12）；
   500 人环境部署时设 **10**（仍高于 OWASP 的 10 下限，实测 141 ms/次）。

> 效果：导入 188 s → 12.5 s；导入期间其它请求 p95 3 ms。

### 问题 2：nginx 60 s 读超时会把长请求掐成 504

导入这类"一次性重活"即使优化后也要 12 s，弱一点的机器可能 30~60 s。
`deploy/nginx-https*.conf` 的 `/api/` 已把 `proxy_read_timeout` 从 60 s 放宽到 **300 s**。

### 问题 3：keepalive 缺 `Connection ""` 导致请求被重试（上传下载那一轮已修）

一次 DELETE 会打到两个实例（第二次 404）。详见 `decisions.md` D-19。

---

## 五、D-13 的 7 条实现约束逐条核对

| # | 约束 | 落点 | 结论 |
|---|---|---|---|
| 1 | 导入必须批量写，禁止循环写 | `users/import.ts`：单条 `INSERT ... SELECT unnest(...)` + 同事务批量插 workspace | ✅ 3000 行 12.5 s（含 500 次哈希） |
| 2 | 导入行数上限 1000 | `MAX_ROWS = 1000`，超了直接 422 | ✅ |
| 3 | 项目进度禁止 N+1 | `projects/service.ts`：一条 `GROUP BY t.project_id` + JOIN，不在循环里查库 | ✅ 200 项目列表 21 ms |
| 4 | 管理员全员统计设超时 | `db.ts` 每连接 `SET statement_timeout`，默认 10 s（`DB_STATEMENT_TIMEOUT_MS`） | ✅ |
| 5 | 会话清理必须做 | `server.ts` 定时 `DELETE FROM session WHERE expires_at <= now()` | ✅ |
| 6 | 连接池 20，不上 Redis | `DB_POOL_MAX` 默认 20 | ✅ |
| 7 | 数据库不是瓶颈 | 12.5 万任务 = 21 MB，库总额 31 MB；实测读接口毫秒级 | ✅ |

---

## 六、复现方式

```bash
# 1) 独立库（不要指向生产库）
createdb -O blackhole blackhole_perf
for f in db/migrations/00*.sql; do psql -d blackhole_perf -f "$f"; done

# 2) 起一个指向该库的实例
NODE_ENV=staging PORT=3100 HOST=127.0.0.1 \
DATABASE_URL=postgres://blackhole:***@127.0.0.1:5432/blackhole_perf \
APP_ORIGIN=http://127.0.0.1:3100 COOKIE_SECURE=false BCRYPT_COST=10 \
node apps/api/dist/server.js

# 3) 造数 + 验收
PERF_DATABASE_URL=... SEED_ADMIN_PASSWORD=... node scripts/perf-seed.mjs --stage base
SEED_ADMIN_PASSWORD=... node scripts/perf-check.mjs --base http://127.0.0.1:3100
PERF_DATABASE_URL=... node scripts/perf-seed.mjs --stage data
SEED_ADMIN_PASSWORD=... node scripts/perf-check.mjs --base http://127.0.0.1:3100 --read-only
```

---

## 七、遗留与建议

1. **导入仍是同步接口**：500 人 12.5 s 可接受；若将来要导 5000 人，应改成异步任务 + 进度查询。
2. **`BCRYPT_COST` 按机器定**：本机 10 合适；更弱的机器建议 10 并接受更慢，**不要低于 10**。
3. **管理员 `/api/tasks` 无分页**：12.5 万行 120 ms 还能接受，但如果客户数据量再翻十倍需要加分页。
4. **未压测项**：文件上传/下载的并发吞吐（单文件 50 MB 场景）本轮未覆盖，属下一轮。
