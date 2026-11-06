/**
 * 种子脚本 —— 执行包 §5.1「种子」。**必须幂等**。
 *
 * 跑法：`npm run seed`（tsx db/seed.ts）
 *
 * 九条规则（原文照搬的要点）：
 *  1. 组织 6 级示例链：示例集团(集团) → 示例研究院(公司) → 示例事业部 → 示例中心 → 示例部门(部门) → 示例小组(班组)
 *     按 parent_id + name 逐级查找或创建，**不写死 id**；创建后用真实 id 生成 path
 *  2. 超管：admin / 系统管理员 / org=末级 / role=admin / is_super=true / must_change=true
 *  3. 7 个普通用户：user01~user07，姓名「用户01」~「用户07」
 *  4. 模板：kind=template，name=默认模板，version=1，4 条 layout
 *  5. 每个用户创建 kind=user 的 workspace，复制模板 4 条 layout（config 原样复制）
 *  6. 密码：优先 SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD；没有则每人随机 12 位并**只打印一次**
 *     种子也执行密码策略（至少 8 位，含字母和数字），不满足直接退出
 *  7. 种子不创建 session
 *  8. 重复执行不产生重复组织/账号/模板/布局
 *  9. manager 不进种子（验收 fixture 在 G4 前由超管创建）
 *
 * 组织链中间的三个节点是**结构示例名**；真实名称由导入时的真实组织决定。
 * 层级数本身不受系统限制（业务上限由 MAX_ORG_LEVEL 控制，默认 32）。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// 种子可能不以 app 方式启动，这里直接读 .env（生产/验收用进程环境变量，不读 .env）
try {
  const envFile = readFileSync(join(root, '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    const key = m?.[1];
    if (key && process.env[key] === undefined) {
      process.env[key] = (m?.[2] ?? '').replace(/^["']|["']$/g, '');
    }
  }
} catch {
  // 没有 .env 就用进程环境变量
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL 未设置，种子退出');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });

/** 密码策略：至少 8 位、含字母和数字（与 apps/api/src/lib/password.ts 一致） */
const PASSWORD_POLICY = /^(?=.*[A-Za-z])(?=.*[0-9]).{8,64}$/;
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePassword(length = 12): string {
  const chars: string[] = [];
  chars.push(ALPHABET[Math.floor(Math.random() * 26)] ?? 'a');
  chars.push(ALPHABET[26 + Math.floor(Math.random() * 22)] ?? '7');
  for (let i = chars.length; i < length; i += 1) {
    chars.push(ALPHABET[Math.floor(Math.random() * ALPHABET.length)] ?? 'a');
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = chars[i] as string;
    chars[i] = chars[j] as string;
    chars[j] = tmp;
  }
  return chars.join('');
}

interface OrgSeed {
  name: string;
  level: number;
}

const ORG_CHAIN: OrgSeed[] = [
  { name: '示例集团', level: 1 },
  { name: '示例研究院', level: 2 },
  { name: '示例事业部', level: 3 },
  { name: '示例中心', level: 4 },
  { name: '示例部门', level: 5 },
  { name: '示例小组', level: 6 },
];

const TEMPLATE_ITEMS: Array<{ moduleKey: string; w: number; h: number; config: string }> = [
  { moduleKey: 'todo', w: 6, h: 4, config: '{}' },
  { moduleKey: 'project-progress', w: 6, h: 4, config: '{}' },
  {
    moduleKey: 'quick-entry',
    w: 3,
    h: 4,
    config: JSON.stringify({
      items: [
        { label: '项目', url: '/projects' },
        { label: '任务', url: '/tasks' },
        { label: '灵感', url: '/workspace' },
        { label: '设置', url: '/settings/profile' },
      ],
    }),
  },
  { moduleKey: 'idea', w: 3, h: 4, config: '{}' },
];

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

async function findOrCreateOrg(
  client: Queryable,
  parentId: number | null,
  name: string,
  level: number,
  sort: number,
): Promise<number> {
  const existing = await client.query(
    'SELECT id FROM org WHERE COALESCE(parent_id, 0) = COALESCE($1, 0) AND name = $2',
    [parentId, name],
  );
  const found = existing.rows[0] as { id: number } | undefined;
  if (found) return found.id;

  const inserted = await client.query(
    'INSERT INTO org (parent_id, level, name, path, sort) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [parentId, level, name, '/tmp/', sort],
  );
  const id = (inserted.rows[0] as { id: number }).id;

  // 用真实 id 生成 path
  let parentPath = '/';
  if (parentId !== null) {
    const p = await client.query('SELECT path FROM org WHERE id = $1', [parentId]);
    parentPath = (p.rows[0] as { path: string }).path;
  }
  await client.query('UPDATE org SET path = $2 WHERE id = $1', [id, `${parentPath}${id}/`]);
  return id;
}

async function findOrCreateUser(
  client: Queryable,
  account: string,
  name: string,
  orgId: number,
  role: 'admin' | 'user',
  isSuper: boolean,
  passwordHash: string,
): Promise<number> {
  const existing = await client.query('SELECT id FROM app_user WHERE account = $1', [account]);
  const found = existing.rows[0] as { id: number } | undefined;
  if (found) return found.id;

  const inserted = await client.query(
    `INSERT INTO app_user
       (account, password_hash, name, org_id, role, is_super, status, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', true)
     RETURNING id`,
    [account, passwordHash, name, orgId, role, isSuper],
  );
  return (inserted.rows[0] as { id: number }).id;
}

async function main(): Promise<void> {
  const client = await pool.connect();
  const printed: Array<{ account: string; password: string }> = [];

  try {
    await client.query('BEGIN');

    // 1. 组织链：逐级查找或创建
    let parentId: number | null = null;
    let leafOrgId = 0;
    for (let i = 0; i < ORG_CHAIN.length; i += 1) {
      const node = ORG_CHAIN[i] as OrgSeed;
      leafOrgId = await findOrCreateOrg(client, parentId, node.name, node.level, i);
      parentId = leafOrgId;
    }

    // 6. 密码：优先环境变量，否则随机 12 位只打印一次
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? generatePassword();
    const userPassword = process.env.SEED_USER_PASSWORD ?? generatePassword();
    if (!PASSWORD_POLICY.test(adminPassword) || !PASSWORD_POLICY.test(userPassword)) {
      throw new Error('种子密码不满足策略（至少 8 位，含字母和数字），种子退出');
    }
    const adminHash = await bcrypt.hash(adminPassword, 12);
    const userHash = await bcrypt.hash(userPassword, 12);

    // 2. 超管
    const adminId = await findOrCreateUser(
      client,
      'admin',
      '系统管理员',
      leafOrgId,
      'admin',
      true,
      adminHash,
    );
    if (process.env.SEED_ADMIN_PASSWORD === undefined) {
      printed.push({ account: 'admin', password: adminPassword });
    }

    // 2.5 管理员（非超管）—— 验收 G4 要求 9 个账号：7 普通 + 1 管理员 + 1 超管。
    //     只种超管的话，「管理员不能授予管理员」「只有超管能建管理员」这类用例
    //     在验收环境里没有可用的管理员身份去复现。
    await findOrCreateUser(
      client,
      'manager',
      '部门管理员',
      leafOrgId,
      'admin',
      false,
      adminHash,
    );
    if (process.env.SEED_ADMIN_PASSWORD === undefined) {
      printed.push({ account: 'manager', password: adminPassword });
    }

    // 3. 7 个普通用户
    const userIds: number[] = [];
    for (let i = 1; i <= 7; i += 1) {
      const account = `user${String(i).padStart(2, '0')}`;
      const uid = await findOrCreateUser(
        client,
        account,
        `用户${String(i).padStart(2, '0')}`,
        leafOrgId,
        'user',
        false,
        userHash,
      );
      userIds.push(uid);
      if (process.env.SEED_USER_PASSWORD === undefined) {
        printed.push({ account, password: userPassword });
      }
    }

    // 4. 模板 workspace + 4 条 layout
    const templateExists = await client.query("SELECT id FROM workspace WHERE kind = 'template'");
    let templateId = (templateExists.rows[0] as { id: number } | undefined)?.id;
    if (!templateId) {
      const ins = await client.query(
        "INSERT INTO workspace (user_id, kind, name, subtitle, version) VALUES (NULL, 'template', $1, NULL, 1) RETURNING id",
        ['默认模板'],
      );
      templateId = (ins.rows[0] as { id: number }).id;
    }
    for (let i = 0; i < TEMPLATE_ITEMS.length; i += 1) {
      const item = TEMPLATE_ITEMS[i] as (typeof TEMPLATE_ITEMS)[number];
      const has = await client.query(
        'SELECT id FROM workspace_layout WHERE workspace_id = $1 AND module_key = $2',
        [templateId, item.moduleKey],
      );
      if (has.rows.length > 0) continue;
      await client.query(
        `INSERT INTO workspace_layout (workspace_id, module_key, sort, w, h, config)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [templateId, item.moduleKey, i, item.w, item.h, item.config],
      );
    }

    // 5. 每个用户一个 kind=user 的 workspace，复制模板 4 条 layout（config 原样复制）
    const templateLayout = await client.query(
      'SELECT module_key, sort, w, h, config FROM workspace_layout WHERE workspace_id = $1 ORDER BY sort',
      [templateId],
    );
    for (const uid of [adminId, ...userIds]) {
      const ws = await client.query(
        "SELECT id FROM workspace WHERE user_id = $1 AND kind = 'user'",
        [uid],
      );
      let wsId = (ws.rows[0] as { id: number } | undefined)?.id;
      if (!wsId) {
        const ins = await client.query(
          "INSERT INTO workspace (user_id, kind, name, subtitle, version) VALUES ($1, 'user', '我的工作台', NULL, 1) RETURNING id",
          [uid],
        );
        wsId = (ins.rows[0] as { id: number }).id;
      }
      const layoutCount = await client.query(
        'SELECT count(*)::int AS n FROM workspace_layout WHERE workspace_id = $1',
        [wsId],
      );
      if ((layoutCount.rows[0] as { n: number }).n > 0) continue;
      for (const row of templateLayout.rows) {
        await client.query(
          `INSERT INTO workspace_layout (workspace_id, module_key, sort, w, h, config)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [wsId, row.module_key, row.sort, row.w, row.h, JSON.stringify(row.config)],
        );
      }
    }

    await client.query('COMMIT');

    console.log('种子完成：');
    console.log(`  组织链（${ORG_CHAIN.length} 级）：${ORG_CHAIN.map((o) => o.name).join(' → ')}`);
    console.log(`  账号：1 超管 + 7 普通 = 8 个（末级节点 id=${leafOrgId}）`);
    console.log(`  模板：${TEMPLATE_ITEMS.length} 条 layout；每个用户 workspace 已复制`);
    if (printed.length > 0) {
      console.log('\n初始密码（只打印这一次，请立即保存）：');
      for (const p of printed) {
        console.log(`  ${p.account}  ${p.password}`);
      }
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('种子失败:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
