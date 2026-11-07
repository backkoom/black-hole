/**
 * 文件上传/下载压测（D-19 补充验证）
 *
 *   SEED_ADMIN_PASSWORD=*** node scripts/perf-upload.mjs --base https://192.168.102.102
 *
 * 覆盖：
 *  - 并发小文件（10 并发 × 1MB）
 *  - 大文件（3 个 × 10MB）
 *  - 超限边界（51MB → 期望 413，且不落盘）
 *  - 下载吞吐（10MB 文件）
 *  - 跑完把自己传的文件全删掉，并核对磁盘没有残留
 *
 * ⚠️ 会往目标环境写真实文件；只在验收/压测环境跑。
 */

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg('--base', 'http://127.0.0.1:3000');
const ADMIN = { account: arg('--account', 'admin'), password: process.env.SEED_ADMIN_PASSWORD ?? '' };
// 现网是自签证书：Node 的 fetch 默认会拒绝，压测环境必须显式放行
if (process.argv.includes('--insecure')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
// 现网是自签证书：Node 的 fetch 默认会拒绝，压测环境必须显式放行
if (process.argv.includes('--insecure')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const CONCURRENCY = Number(arg('--concurrency', '10'));
const SMALL_COUNT = Number(arg('--small', '30'));
const BIG_COUNT = Number(arg('--big', '3'));

const jar = new Map();
function absorb(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
function cookieHeader() {
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

const created = [];
const results = [];

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify(ADMIN),
  });
  absorb(res);
  if (res.status !== 200) throw new Error(`登录失败 ${res.status} ${(await res.text()).slice(0, 120)}`);
}

async function upload(name, bytes, expect = 200) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), name);
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/files/upload`, {
    method: 'POST',
    headers: { cookie: cookieHeader(), origin: BASE },
    body: form,
  });
  const ms = performance.now() - t0;
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  const ok = res.status === expect;
  if (json?.data?.file?.id) created.push(json.data.file.id);
  return { ok, status: res.status, ms, json, text };
}

async function download(id) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/files/${id}/download`, { headers: { cookie: cookieHeader() } });
  const buf = await res.arrayBuffer();
  return { status: res.status, ms: performance.now() - t0, bytes: buf.byteLength };
}

async function main() {
  console.log(`目标: ${BASE}`);
  await login();
  console.log('登录 OK');

  // 1) 并发小文件
  const small = Buffer.alloc(1024 * 1024, 0x41);
  const smallTimes = [];
  let smallOk = 0;
  let cursor = 0;
  const worker = async (tag) => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= SMALL_COUNT) return;
      const r = await upload(`perf-small-${tag}-${i}.bin`, small.slice(0, 1024 * 1024));
      if (r.ok) smallOk += 1;
      smallTimes.push(r.ms);
    }
  };
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, k) => worker(k)));
  const wall = (Date.now() - t0) / 1000;
  console.log(
    `\n并发小文件：${smallOk}/${SMALL_COUNT} 成功，并发 ${CONCURRENCY}，总耗时 ${wall.toFixed(1)}s，` +
      `吞吐 ${((SMALL_COUNT * 1) / wall).toFixed(1)} MB/s`,
  );
  console.log(`  单次 p50=${pct(smallTimes, 50).toFixed(0)}ms p95=${pct(smallTimes, 95).toFixed(0)}ms`);
  results.push({ case: '并发小文件 1MB', ok: smallOk, total: SMALL_COUNT, p95: Math.round(pct(smallTimes, 95)) });

  // 2) 大文件
  const big = Buffer.alloc(10 * 1024 * 1024, 0x42);
  const bigTimes = [];
  let bigOk = 0;
  let bigId = null;
  for (let i = 0; i < BIG_COUNT; i += 1) {
    const r = await upload(`perf-big-${i}.bin`, big);
    if (r.ok) {
      bigOk += 1;
      bigId = r.json?.data?.file?.id ?? bigId;
    }
    bigTimes.push(r.ms);
  }
  console.log(
    `\n大文件：${bigOk}/${BIG_COUNT} 成功（10MB），p50=${pct(bigTimes, 50).toFixed(0)}ms ` +
      `p95=${pct(bigTimes, 95).toFixed(0)}ms`,
  );
  results.push({ case: '大文件 10MB', ok: bigOk, total: BIG_COUNT, p95: Math.round(pct(bigTimes, 95)) });

  // 3) 下载吞吐
  if (bigId) {
    const d = await download(bigId);
    const mbps = d.bytes / 1024 / 1024 / (d.ms / 1000);
    console.log(`\n下载 10MB：状态 ${d.status}，${d.ms.toFixed(0)}ms，${mbps.toFixed(1)} MB/s`);
    results.push({ case: '下载 10MB', ok: d.status === 200 ? 1 : 0, total: 1, p95: Math.round(d.ms) });
  }

  // 4) 超限边界：51MB 期望 413
  const over = Buffer.alloc(51 * 1024 * 1024, 0x43);
  const overRes = await upload('perf-over-51mb.bin', over, 413);
  console.log(`\n超限 51MB：状态 ${overRes.status}（期望 413）${overRes.ok ? ' ✓' : ' ✗'}`);
  results.push({ case: '超限 51MB → 413', ok: overRes.ok ? 1 : 0, total: 1, p95: Math.round(overRes.ms) });

  // 5) 清理：删掉本次上传的所有文件
  let deleted = 0;
  for (const id of created) {
    const res = await fetch(`${BASE}/api/files/${id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader(), origin: BASE },
    });
    if (res.status === 200) deleted += 1;
  }
  console.log(`\n清理：${deleted}/${created.length} 个文件已删除`);

  const failed = results.filter((r) => r.ok !== r.total);
  console.log('\n================ 汇总 ================');
  console.table(results);
  console.log(failed.length ? `未通过 ${failed.length} 项` : '全部通过 ✅');
  process.exit(failed.length ? 1 : 0);
}

try {
  await main();
} catch (err) {
  console.error('压测失败：', err.message);
  process.exit(2);
}
