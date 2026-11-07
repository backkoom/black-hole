/**
 * 规模验证 · 造数据（D-13：500 人）
 *
 * 分两个阶段：
 *   node scripts/perf-seed.mjs --stage base   组织树 + admin + 模板工作台
 *   node scripts/perf-seed.mjs --stage data   200 项目 + 12.5 万任务 + 每人工作台
 *
 * 设计依据（docs/contracts/decisions.md D-13）：
 *   - 500 普通用户 × 人均 250 任务 ≈ 12 万行（管理员全员统计就压这个量级）
 *   - 组织树 3 层（1 根 + 5 部门 + 20 小组），人员挂末级
 *   - 批次写库，不逐条往返（约束 1）
 *
 * ⚠️ 只在独立库上跑（PERF_DATABASE_URL），别指向生产库。
 */

import { Client } from 'pg';

const STAGE = (() => {
  const i = process.argv.indexOf('--stage');
  return i > -1 ? process.argv[i + 1] : 'base';
})();

const URL = process.env.PERF_DATABASE_URL;
if (!URL) {
  console.error('缺少 PERF_DATABASE_URL');
  process.exit(2);
}

const TASKS_PER_USER = Number(process.env.PERF_TASKS ?? 250);
const PROJECTS = Number(process.env.PERF_PROJECTS ?? 200);

const DEPTS = ['产品部', '研发部', '交付部', '运维部', '综合部'];
const TEAMS_PER_DEPT = 4;

const client = new Client({ connectionString: URL });

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function base() {
  log('清空旧数据…');
  await client.query(`TRUNCATE task, project, workspace_layout, workspace, session, file_asset, file_folder, risk, idea, announcement, discussion, approval, app_user, org RESTART IDENTITY CASCADE`);

  log('建组织树（1 根 + 5 部门 + 20 小组）…');
  const root = await client.query(
    `INSERT INTO org (parent_id, level, name, path, sort) VALUES (NULL, 1, '示例公司', '/', 0) RETURNING id`,
  );
  const rootId = Number(root.rows[0].id);
  await client.query('UPDATE org SET path = $1 WHERE id = $2', [`/${rootId}/`, rootId]);

  const leafIds = [];
  for (const [i, dept] of DEPTS.entries()) {
    const d = await client.query(
      `INSERT INTO org (parent_id, level, name, path, sort) VALUES ($1, 2, $2, '/tmp/', $3) RETURNING id`,
      [rootId, dept, i],
    );
    const deptId = Number(d.rows[0].id);
    await client.query('UPDATE org SET path = $1 WHERE id = $2', [`/${rootId}/${deptId}/`, deptId]);

    for (let t = 1; t <= TEAMS_PER_DEPT; t += 1) {
      const g = await client.query(
        `INSERT INTO org (parent_id, level, name, path, sort) VALUES ($1, 3, $2, '/tmp/', $3) RETURNING id`,
        [deptId, `${dept}-${t}组`, t],
      );
      const teamId = Number(g.rows[0].id);
      await client.query('UPDATE org SET path = $1 WHERE id = $2', [`/${rootId}/${deptId}/${teamId}/`, teamId]);
      leafIds.push(teamId);
    }
  }

  log(`末级节点 ${leafIds.length} 个`);

  const pwd = process.env.SEED_ADMIN_PASSWORD;
  if (!pwd) throw new Error('缺少 SEED_ADMIN_PASSWORD');
  const { default: bcrypt } = await import('bcryptjs');
  const hash = bcrypt.hashSync(pwd, 12);

  await client.query(
    `INSERT INTO app_user (account, password_hash, name, org_id, role, is_super, status, must_change_password)
     VALUES ('admin', $1, '系统管理员', $2, 'admin', true, 'active', false)`,
    [hash, rootId],
  );
  log('admin 已建（密码见 SEED_ADMIN_PASSWORD）');

  const tpl = await client.query(
    `INSERT INTO workspace (user_id, kind, name) VALUES (NULL, 'template', '默认工作台') RETURNING id`,
  );
  const tplId = Number(tpl.rows[0].id);
  const mods = [
    ['metrics', 0, 12, 3],
    ['todo', 1, 6, 5],
    ['project_progress', 2, 6, 5],
    ['idea', 3, 12, 4],
  ];
  for (const [key, sort, w, h] of mods) {
    await client.query(
      `INSERT INTO workspace_layout (workspace_id, module_key, sort, w, h) VALUES ($1, $2, $3, $4, $5)`,
      [tplId, key, sort, w, h],
    );
  }
  console.log(JSON.stringify({ rootId, leafIds }));
}

async function data() {
  const t0 = Date.now();
  const users = await client.query(
    `SELECT id FROM app_user WHERE account LIKE 'imp%' OR account LIKE 'load%' ORDER BY id`,
  );
  const ids = users.rows.map((r) => Number(r.id));
  if (ids.length === 0) throw new Error('还没有导入用户：先跑 CSV 导入再做 --stage data');
  log(`参与造数的用户 ${ids.length} 个`);

  // 工作台：CSV 导入时**已经**给每人建了一个（契约：同一事务复制模板），
  // 这里只补布局，别重复建（会撞 uq_workspace_user）。
  // 用 account 前缀筛，不走数组参数（pg 对 bigint[] 的隐式转换会报 variable_coerce_param_hook）
  const existing = await client.query(
    `SELECT w.id, (SELECT count(*) FROM workspace_layout l WHERE l.workspace_id = w.id)::int AS n
       FROM workspace w
       JOIN app_user u ON u.id = w.user_id
      WHERE u.account LIKE 'imp%'`,
  );
  log(`已有工作台 ${existing.rows.length} 个（导入时建的）`);
  const wsIds = existing.rows.map((r) => Number(r.id));
  const needLayout = existing.rows.filter((r) => r.n === 0).map((r) => Number(r.id));
  const layoutRows = [];
  const MODS = ['metrics', 'todo', 'project_progress', 'idea'];
  needLayout.forEach((ws) => {
    MODS.forEach((m, sIdx) => layoutRows.push([ws, m, sIdx, sIdx === 0 ? 12 : 6, 4]));
  });
  for (let i = 0; i < layoutRows.length; i += 1000) {
    const chunk = layoutRows.slice(i, i + 1000);
    const values = chunk
      .map((_, k) => `($${k * 5 + 1}, $${k * 5 + 2}, $${k * 5 + 3}, $${k * 5 + 4}, $${k * 5 + 5})`)
      .join(',');
    await client.query(
      `INSERT INTO workspace_layout (workspace_id, module_key, sort, w, h) VALUES ${values}`,
      chunk.flat(),
    );
  }
  log(`补布局 ${layoutRows.length} 条`);

  // 项目 200 个，owner 轮转
  log(`${PROJECTS} 个项目…`);
  const projRows = [];
  for (let i = 0; i < PROJECTS; i += 1) {
    projRows.push([ids[i % ids.length], `规模验证项目-${String(i + 1).padStart(3, '0')}`, `负责人${(i % ids.length) + 1}`]);
  }
  const projIds = [];
  for (let i = 0; i < projRows.length; i += 100) {
    const chunk = projRows.slice(i, i + 100);
    const values = chunk.map((_, k) => `($${k * 3 + 1}, $${k * 3 + 2}, $${k * 3 + 3})`).join(',');
    const res = await client.query(
      `INSERT INTO project (user_id, name, owner) VALUES ${values} RETURNING id`,
      chunk.flat(),
    );
    projIds.push(...res.rows.map((r) => Number(r.id)));
  }
  log(`项目 ${projIds.length} 个`);

  // 任务：每人 TASKS_PER_USER 条，状态/日期混合（过度日期≈三成，保证逾期统计有量）
  const total = ids.length * TASKS_PER_USER;
  log(`任务 ${total} 条（每批 2000）…`);
  const today = new Date();
  let inserted = 0;
  for (let u = 0; u < ids.length; u += 1) {
    const uid = ids[u];
    for (let start = 0; start < TASKS_PER_USER; start += 200) {
      const rows = [];
      const n = Math.min(200, TASKS_PER_USER - start);
      for (let k = 0; k < n; k += 1) {
        const idx = start + k;
        const status = idx % 3 === 0 ? 'done' : idx % 3 === 1 ? 'doing' : 'todo';
        const due = new Date(today);
        due.setDate(due.getDate() + ((idx % 60) - 30));
        const pid = idx % 5 === 0 ? projIds[(u + idx) % projIds.length] : null;
        // done_at 直接算好传值：写成 `CASE WHEN $N = 'done'` 会让 pg 无法推断参数类型
        // （variable_coerce_param_hook 报错），别在 SQL 里做这种判断
        const doneAt = status === 'done' ? new Date().toISOString() : null;
        rows.push([
          uid,
          pid,
          `规模任务-${u + 1}-${idx + 1}`,
          status,
          idx % 3 === 0 ? 'high' : 'medium',
          due.toISOString().slice(0, 10),
          doneAt,
        ]);
      }
      const values = rows
        .map((_, k) => {
          const b = k * 7;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7}::timestamptz)`;
        })
        .join(',');
      await client.query(
        `INSERT INTO task (user_id, project_id, title, status, priority, due_date, done_at) VALUES ${values}`,
        rows.flat(),
      );
      inserted += n;
    }
    if ((u + 1) % 100 === 0) log(`  已插 ${inserted} 条…`);
  }

  const stat = await client.query(
    `SELECT (SELECT count(*) FROM app_user) users, (SELECT count(*) FROM project) projects,
            (SELECT count(*) FROM task) tasks, (SELECT count(*) FROM workspace) ws`,
  );
  log(`完成，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s：${JSON.stringify(stat.rows[0])}`);
  console.log(JSON.stringify(stat.rows[0]));
}

await client.connect();
try {
  if (STAGE === 'base') await base();
  else if (STAGE === 'data') await data();
  else throw new Error(`未知 stage: ${STAGE}`);
} finally {
  await client.end();
}
