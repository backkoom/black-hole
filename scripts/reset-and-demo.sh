#!/usr/bin/env bash
# ==============================================================================
# 服务器数据重置 —— 清掉全部业务数据，用脱敏后的示例组织重新播种 + 造演示数据
#
# 用法（服务器上）：
#   bash /data/blackhole/scripts/reset-and-demo.sh
#
# 做四件事：
#   1. 清空全部业务数据（含账号与组织树）
#   2. 用 db/seed.ts 重新播种（示例组织链 + 8 个账号，全待改密）
#   3. 跑 scripts/seed-demo.ts 造演示数据
#   4. 打印最终统计
#
# ⚠️ 会清掉所有账号与组织 —— 只在演示/试用环境用。
# ==============================================================================
set -euo pipefail

APP_DIR="/data/blackhole"
ENV_FILE="/etc/blackhole/api.env"
BASE="${BASE:-http://127.0.0.1:3000}"

log() { echo -e "\033[0;36m[reset]\033[0m $*"; }
die() { echo -e "\033[0;31m[fail]\033[0m $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行"
cd "$APP_DIR"
set -a; . "$ENV_FILE"; set +a

# ---------------------------------------------------------------------------
# 1. 清空业务数据
# ---------------------------------------------------------------------------
log "清空业务数据"
node <<'EOF'
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  // 顺序要紧：先子表后父表（app_user / org 是父表）
  const order = [
    'task', 'project', 'risk', 'file_asset', 'file_folder', 'meeting', 'milestone',
    'announcement', 'discussion', 'approval', 'idea',
    'workspace_layout', 'workspace', 'session', 'project_member',
    'app_user', 'org',
  ];
  for (const t of order) {
    try { await p.query('DELETE FROM ' + t); } catch (e) { console.log('  跳过', t, e.message.slice(0, 50)); }
  }
  // 序列重置（让 id 从 1 开始，E2E 依赖固定的 id）
  await p.query(`SELECT setval(pg_get_serial_sequence('app_user','id'), 1, false)`);
  await p.query(`SELECT setval(pg_get_serial_sequence('org','id'), 1, false)`);
  await p.query(`SELECT setval(pg_get_serial_sequence('project','id'), 1, false)`);
  await p.query(`SELECT setval(pg_get_serial_sequence('task','id'), 1, false)`);
  console.log('  已清空（含 id 序列重置）');
  await p.end();
})();
EOF

# ---------------------------------------------------------------------------
# 2. 播种（示例组织 + 8 个账号）
# ---------------------------------------------------------------------------
log "播种（示例组织链 + 8 个账号）"
npx --yes tsx db/seed.ts 2>&1 | tail -5

# ---------------------------------------------------------------------------
# 2.5 演示环境：admin 直接可登录
# ---------------------------------------------------------------------------
# ⚠️ 种子默认所有账号 must_change_password=true → 首次登录被强制跳改密页，
#    而演示脚本要调管理接口会被 403 拦。演示环境放开 admin 这一项。
log "放开 admin 的强制改密（演示环境）"
node <<'EOF'
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const r = await p.query("UPDATE app_user SET must_change_password = false WHERE account = 'admin'");
  console.log('  已放开 ' + r.rowCount + ' 个账号');
  await p.end();
})();
EOF

# ---------------------------------------------------------------------------
# 3. 演示数据
# ---------------------------------------------------------------------------
log "造演示数据"
# ⚠️ Origin 校验：演示脚本请求的 Origin 必须等于 APP_ORIGIN，否则 403「请求来源不被信任」
DEMO_BASE="${APP_ORIGIN:-http://127.0.0.1:3000}" npx --yes tsx scripts/seed-demo.ts 2>&1 | tail -8

# ---------------------------------------------------------------------------
# 4. 统计
# ---------------------------------------------------------------------------
log "最终统计"
node <<'EOF'
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const tables = ['app_user','org','project','task','milestone','meeting','risk',
                  'file_folder','file_asset','announcement','discussion','approval','workspace'];
  const out = [];
  for (const t of tables) {
    const r = await p.query('SELECT count(*)::int n FROM ' + t);
    out.push(t + '=' + r.rows[0].n);
  }
  console.log('  ' + out.join('  '));
  const o = await p.query('SELECT name FROM org ORDER BY level');
  console.log('  组织链: ' + o.rows.map(x => x.name).join(' → '));
  await p.end();
})();
EOF

echo ""
echo "✅ 完成。admin 初始口令见 $ENV_FILE 的 SEED_ADMIN_PASSWORD（首次登录需改密）"
