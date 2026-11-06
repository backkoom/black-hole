import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 服务器实况巡检 —— 逐页访问 + 收集控制台错误 + 截图。
 *
 * 用法：
 *   export NO_PROXY="192.168.0.0/16,127.0.0.1,localhost"
 *   node scripts/inspect-server.mjs http://192.168.102.102
 *
 * 口令从服务器上的本地文件读（不在命令行传递，也不落到日志）。
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// ⚠️ 巡检截图可能带真实业务数据（项目名、任务名）—— 输出到**仓库外**，
// 不进版本库、不进公开仓库。
const OUT = process.env.INSPECT_OUT ?? join(ROOT, '..', 'inspect-out');
mkdirSync(OUT, { recursive: true });

const BASE = process.argv[2] ?? 'http://192.168.102.102';
const ACCOUNT = process.argv[3] ?? 'smoke_test';
const PW = process.env.SMOKE_PW ?? '';

if (!PW) {
  console.error('需要 SMOKE_PW 环境变量（从服务器 /etc/blackhole/.smoke_pw 取）');
  process.exit(1);
}

const PAGES = [
  ['/', '总览'],
  ['/kanban', '看板'],
  ['/tasks', '任务清单'],
  ['/calendar', '日程'],
  ['/progress', '进度'],
  ['/team', '协作'],
  ['/files', '文件'],
  ['/risks', '风险'],
  ['/analytics', '统计'],
  ['/settings/profile', '个人资料'],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
});
const page = await ctx.newPage();

const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push({ where: page.url(), msg: m.text().slice(0, 220) });
});
page.on('pageerror', (e) => {
  problems.push({ where: page.url(), msg: `PAGEERROR ${String(e).slice(0, 220)}` });
});
page.on('requestfailed', (r) => {
  const f = r.failure();
  problems.push({ where: page.url(), msg: `REQFAIL ${r.method()} ${r.url().slice(0, 120)} ${f?.errorText ?? ''}` });
});
page.on('response', (r) => {
  if (r.status() >= 400 && r.url().includes('/api/')) {
    problems.push({ where: page.url(), msg: `HTTP${r.status()} ${r.url().replace(BASE, '').slice(0, 120)}` });
  }
});

// 登录
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.getByPlaceholder(/用户名|账号/).first().fill(ACCOUNT);
await page.getByPlaceholder(/密码/).first().fill(PW);
await page.getByRole('button', { name: /登\s*录/ }).click();
await page.waitForTimeout(3000);
const after = page.url();
console.log(`登录后 URL: ${after}`);
if (after.includes('/login')) {
  console.error('✗ 登录失败');
  await browser.close();
  process.exit(1);
}

for (const [route, name] of PAGES) {
  const before = problems.length;
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);

  // 抓页面上的告警文案（AntD Alert / Empty 描述）
  const alerts = await page.locator('.ant-alert-message, .ant-empty-description').allInnerTexts();
  const text = await page.locator('body').innerText();
  const white = text.trim().length < 40;

  console.log(
    `\n[${name}] ${route}\n  文本长度 ${text.length}${white ? '  ⚠️ 疑似白屏' : ''}` +
      `\n  新增问题 ${problems.length - before} 条` +
      (alerts.length ? `\n  提示: ${alerts.slice(0, 2).join(' | ').slice(0, 100)}` : ''),
  );
  await page.screenshot({ path: join(OUT, `srv-${route.replace(/\//g, '') || 'home'}.png`) });
}

console.log('\n================ 问题汇总 ================');
if (problems.length === 0) {
  console.log('  ✓ 无控制台错误 / 无失败请求 / 无 4xx-5xx API');
} else {
  const seen = new Set();
  for (const p of problems) {
    const k = p.msg.slice(0, 80);
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`  ✗ [${p.where.replace(BASE, '')}] ${p.msg}`);
  }
  console.log(`  合计 ${problems.length} 条（去重后 ${seen.size} 类）`);
}

await browser.close();
