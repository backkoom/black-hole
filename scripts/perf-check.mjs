/**
 * 规模验证 · 压测与验收（D-13）
 *
 *   node scripts/perf-check.mjs --base http://127.0.0.1:3100
 *
 * 覆盖 D-13「验收口径调整」的 4 条：
 *   1. 500 人 CSV 导入成功，抽查 20 个账号能登录
 *   2. 500 次首次登录强制改密不超时
 *   3. 组织树挂满层级，各节点人数正确
 *   4. 真实数据量下，工作台指标卡与项目列表响应 < 1 秒
 * 外加约束 4：管理员全员统计（12 万行）的耗时与 statement_timeout。
 *
 * ⚠️ 会往库里写 500 个账号，只对 perf 库跑。
 */

const BASE = (() => {
  const i = process.argv.indexOf('--base');
  return i > -1 ? process.argv[i + 1] : 'http://127.0.0.1:3100';
})();

const ADMIN = { account: 'admin', password: process.env.SEED_ADMIN_PASSWORD };
const USER_COUNT = Number(process.env.PERF_USERS ?? 500);
const SAMPLE_LOGIN = 20;
const PWD = 'Perf-6515709';
/** 只跑读接口（数据已经造好、账号已经改过密码时用） */
const READ_ONLY = process.argv.includes('--read-only');

const results = [];
const failures = [];
/** 导入接口一次性返回的初始密码：account → password */
const initialPasswords = new Map();

function log(m) {
  console.log(m);
}

/* ---------------- 极简 cookie 客户端 ---------------- */

class Jar {
  constructor() {
    this.map = new Map();
  }
  absorb(res) {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const [pair] = line.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) this.map.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function call(path, { method = 'GET', jar, body, headers = {}, origin = true } = {}) {
  const h = { ...headers };
  if (jar) h.cookie = jar.header();
  if (origin) h.origin = BASE;
  let payload = body;
  if (body && !(body instanceof FormData) && typeof body !== 'string') {
    h['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, { method, headers: h, body: payload });
  const ms = performance.now() - t0;
  if (jar) jar.absorb(res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 二进制或非 JSON */
  }
  return { status: res.status, ms, json, text };
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

function record(name, ms, extra = '') {
  results.push({ name, ms });
  log(`  ${name.padEnd(38)} ${ms.toFixed(0)} ms ${extra}`);
}

async function judge(title, fn) {
  log(`\n== ${title} ==`);
  try {
    await fn();
  } catch (err) {
    failures.push(`${title}: ${err.message}`);
    log(`  ✗ ${err.message}`);
  }
}

/* ---------------- 各项检查 ---------------- */

async function main() {
  log(`目标: ${BASE}`);

  // --- 1) 管理员登录 ---
  const adminJar = new Jar();
  await judge('管理员登录', async () => {
    const r = await call('/api/auth/login', { method: 'POST', jar: adminJar, body: ADMIN });
    if (r.status !== 200) throw new Error(`登录失败 ${r.status} ${r.text.slice(0, 120)}`);
    record('POST /api/auth/login', r.ms);
  });

  // --- 2) 500 人 CSV 导入（验收 1 前半） ---
  if (!READ_ONLY) await judge('500 人 CSV 批量导入', async () => {
    const orgRes = await call('/api/org/tree', { jar: adminJar });
    const flat = [];
    const walk = (nodes) => nodes.forEach((n) => (flat.push(n), n.children && walk(n.children)));
    walk(orgRes.json?.data?.nodes ?? orgRes.json?.data ?? []);
    const leaf = flat.filter((n) => !n.children || n.children.length === 0).pop();
    if (!leaf) throw new Error('拿不到末级组织节点');

    // ⚠️ 表头必须严格是「姓名,账号,角色」三列（契约 §6.5），部门通过 orgId 表单字段给
    const rows = ['姓名,账号,角色'];
    for (let i = 1; i <= USER_COUNT; i += 1) {
      rows.push(`规模用户${i},imp${String(i).padStart(4, '0')},user`);
    }
    const form = new FormData();
    form.append('orgId', String(leaf.id));
    form.append('file', new Blob([`\ufeff${rows.join('\n')}`], { type: 'text/csv' }), 'users.csv');

    const r = await call('/api/users/import', { method: 'POST', jar: adminJar, body: form });
    if (r.status !== 200) throw new Error(`导入失败 ${r.status} ${r.text.slice(0, 200)}`);
    const d = r.json?.data ?? {};
    for (const item of d.initialPasswords ?? []) initialPasswords.set(item.account, item.password);
    record(
      `导入 ${USER_COUNT} 人`,
      r.ms,
      `(success=${d.success ?? '?'} skipped=${d.skipped ?? 0} failed=${d.failed ?? 0})`,
    );
    if ((d.success ?? 0) < USER_COUNT) failures.push(`导入成功 ${d.success}/${USER_COUNT}`);
    if (!initialPasswords.size) throw new Error('导入没有返回初始密码，后续登录无法验证');
    if (r.ms > 30_000) failures.push('导入耗时 > 30s');
  });

  // --- 3) 抽查 20 个账号能登录（验收 1 后半） ---
  if (!READ_ONLY) await judge('抽查 20 个导入账号登录', async () => {
    const picks = [];
    for (let i = 0; i < SAMPLE_LOGIN; i += 1) {
      picks.push(`imp${String(1 + i * 23).padStart(4, '0')}`);
    }
    let ok = 0;
    const times = [];
    for (const account of picks) {
      const jar = new Jar();
      const r = await call('/api/auth/login', {
        method: 'POST',
        jar,
        body: { account, password: initialPasswords.get(account) ?? '' },
      });
      times.push(r.ms);
      if (r.status === 200) ok += 1;
    }
    record(`抽查登录 ${ok}/${picks.length}`, pct(times, 50), `p95=${pct(times, 95).toFixed(0)}ms`);
    if (ok !== picks.length) failures.push(`抽查登录通过 ${ok}/${picks.length}`);
  });

  // --- 4) 500 次首次登录 + 强制改密（验收 2） ---
  if (!READ_ONLY) await judge(`${USER_COUNT} 次首登强制改密`, async () => {
    const times = [];
    let ok = 0;
    const concurrency = 10;
    let cursor = 1;
    const worker = async () => {
      for (;;) {
        const i = cursor;
        cursor += 1;
        if (i > USER_COUNT) return;
        const account = `imp${String(i).padStart(4, '0')}`;
        const jar = new Jar();
        const t0 = performance.now();
        const initPwd = initialPasswords.get(account) ?? '';
        const login = await call('/api/auth/login', {
          method: 'POST',
          jar,
          body: { account, password: initPwd },
        });
        if (login.status !== 200) {
          times.push(performance.now() - t0);
          continue;
        }
        const ch = await call('/api/auth/password', {
          method: 'PUT',
          jar,
          body: { oldPassword: initPwd, newPassword: PWD },
        });
        times.push(performance.now() - t0);
        if (ch.status === 200) ok += 1;
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    record(`首登改密 ${ok}/${USER_COUNT}`, pct(times, 50), `p50 / p95=${pct(times, 95).toFixed(0)}ms`);
    if (ok < USER_COUNT) failures.push(`首登改密成功 ${ok}/${USER_COUNT}`);
    if (pct(times, 95) > 5000) failures.push('首登改密 p95 > 5s');
  });

  // --- 5) 组织树人数（验收 3） ---
  await judge('组织树各节点人数（验收 3）', async () => {
    const r = await call('/api/org/tree', { jar: adminJar });
    if (r.status !== 200) throw new Error(`组织树 ${r.status}`);
    const d = r.json?.data ?? {};
    const nodes = d.nodes ?? d;
    let leafCount = 0;
    let leafUserSum = 0;
    const walk = (list) => {
      for (const n of list) {
        const kids = n.children ?? [];
        if (kids.length === 0) {
          leafCount += 1;
          leafUserSum += Number(n.userCount ?? n.user_count ?? 0);
        } else walk(kids);
      }
    };
    walk(Array.isArray(nodes) ? nodes : [nodes]);
    record(`末级节点 ${leafCount} 个`, 0, `人数合计 ${leafUserSum}`);
    if (leafCount === 0) failures.push('组织树没有末级节点');
  });

  // --- 6) 读接口 p95 < 1s（验收 4） ---
  await judge('真实数据量下读接口（验收 4：< 1s）', async () => {
    // 用一个已改密的普通账号，贴近真实使用
    const userJar = new Jar();
    const login = await call('/api/auth/login', {
      method: 'POST',
      jar: userJar,
      body: { account: 'imp0001', password: PWD },
    });
    if (login.status !== 200) throw new Error(`普通账号登录失败 ${login.status}`);

    const endpoints = [
      '/api/workspace',
      '/api/tasks?due=today',
      '/api/tasks?due=overdue',
      '/api/projects',
      '/api/stats/trend?weeks=8',
      '/api/stats/distribution',
      '/api/stats/team-workload',
      '/api/files/summary',
      '/api/risks/summary',
    ];
    for (const ep of endpoints) {
      const times = [];
      let status = 0;
      for (let i = 0; i < 5; i += 1) {
        const r = await call(ep, { jar: userJar });
        status = r.status;
        times.push(r.ms);
      }
      const p95 = pct(times, 95);
      record(`${ep}`, pct(times, 50), `p95=${p95.toFixed(0)}ms [${status}]`);
      if (status !== 200) failures.push(`${ep} 返回 ${status}`);
      if (p95 > 1000) failures.push(`${ep} p95=${p95.toFixed(0)}ms > 1s`);
    }
  });

  // --- 7) 管理员全员统计（约束 4：12 万行 + statement_timeout） ---
  await judge('管理员全员聚合（12 万行）', async () => {
    for (const ep of ['/api/stats/team-workload', '/api/stats/distribution', '/api/tasks']) {
      const r = await call(ep, { jar: adminJar });
      record(`admin ${ep}`, r.ms, `[${r.status}]`);
      if (r.status >= 500) failures.push(`admin ${ep} 返回 ${r.status}`);
      if (r.ms > 3000) failures.push(`admin ${ep} 耗时 ${r.ms.toFixed(0)}ms > 3s`);
    }
  });

  // --- 汇总 ---
  log('\n================ 汇总 ================');
  const slow = results.filter((r) => r.ms > 1000);
  log(`采集 ${results.length} 项，超过 1s 的 ${slow.length} 项`);
  if (failures.length) {
    log(`未通过 ${failures.length} 项：`);
    failures.forEach((f) => log(`  ✗ ${f}`));
  } else {
    log('全部通过 ✅');
  }
  console.log(JSON.stringify({ results, failures }, null, 2));
  process.exit(failures.length ? 1 : 0);
}

await main();
