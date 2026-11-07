/**
 * 示例 CSV 导入自检：走真实接口验证「示例文件能直接导进去」。
 *   node scripts/check-sample-import.mjs --base http://127.0.0.1:3000 --csv docs/examples/users-sample.csv
 * 仅用于开发/验收环境，跑完会把导入的账号删掉。
 */
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg('--base', 'http://127.0.0.1:3000');
const CSV = arg('--csv', 'docs/examples/users-sample.csv');
const ACCOUNT = process.env.SMOKE_ACCOUNT ?? 'admin';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? '';

const jar = new Map();
const call = async (path, init = {}) => {
  const headers = { origin: BASE, ...(init.headers ?? {}) };
  if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(BASE + path, { ...init, headers });
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, json, text };
};

const login = await call('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ account: ACCOUNT, password: PASSWORD }),
});
if (login.status !== 200) {
  console.error('登录失败', login.status, login.text.slice(0, 120));
  process.exit(1);
}

const tree = await call('/api/org/tree');
const flat = [];
const walk = (list) => list.forEach((n) => { flat.push(n); walk(n.children ?? []); });
walk(tree.json?.data?.nodes ?? []);
const leaf = flat.filter((n) => (n.children ?? []).length === 0).pop();
if (!leaf) { console.error('没有末级组织节点'); process.exit(1); }

const csv = await readFile(CSV);
const form = new FormData();
form.append('orgId', String(leaf.id));
form.append('file', new Blob([csv], { type: 'text/csv' }), 'users-sample.csv');

const started = Date.now();
const res = await call('/api/users/import', { method: 'POST', body: form });
const ms = Date.now() - started;
console.log(`导入状态=${res.status} 耗时=${ms}ms`);
console.log(JSON.stringify(res.json?.data ?? res.json, null, 2).slice(0, 800));

const data = res.json?.data;
if (!data) process.exit(1);

// 抽查第一个账号能不能用返回的初始密码登录
const first = data.initialPasswords?.[0];
if (first) {
  const probe = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ account: first.account, password: first.password }),
  });
  console.log(`抽查登录 ${first.account} → ${probe.status}`);
}

// 清理：删掉刚导入的账号（含 workspace 级联）
if (process.env.DATABASE_URL) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const accounts = data.initialPasswords.map((x) => x.account);
  // ⚠️ workspace.user_id / workspace_layout.workspace_id 都没有 ON DELETE CASCADE，
  //    直接删用户会撞外键 —— 必须按 布局 → 工作台 → 用户 的顺序清
  // session 也引用了 app_user（无级联），先清
  await client.query(
    'DELETE FROM session WHERE user_id IN (SELECT id FROM app_user WHERE account = ANY($1::text[]))',
    [accounts],
  );
  await client.query(
    `DELETE FROM workspace_layout WHERE workspace_id IN
       (SELECT id FROM workspace WHERE user_id IN (SELECT id FROM app_user WHERE account = ANY($1::text[])))`,
    [accounts],
  );
  await client.query(
    'DELETE FROM workspace WHERE user_id IN (SELECT id FROM app_user WHERE account = ANY($1::text[]))',
    [accounts],
  );
  const del = await client.query(
    'DELETE FROM app_user WHERE account = ANY($1::text[]) RETURNING account',
    [accounts],
  );
  await client.end();
  console.log(`已清理 ${del.rowCount} 个测试账号`);
} else {
  console.log('（没给 DATABASE_URL，跳过清理）');
}
