import { parse } from 'csv-parse/sync';
import type { Role } from '@workbench/shared/types';
import { query, withTransaction } from '../db.js';
import { forbidden, unprocessable } from '../lib/errors.js';
import { generateInitialPassword, hashPassword } from '../lib/password.js';
import { createUserWorkspaces } from '../lib/workspace.js';
import type { SessionContext } from '../auth/service.js';

/**
 * 批量导入 —— 执行包 §6.4 的 13/14 号接口。
 *
 * 规则（§6.5）：
 *  - UTF-8 CSV，允许 BOM；表头必须「姓名,账号,角色」
 *  - 最多 1000 数据行；字段内逗号用双引号包裹，不支持字段内换行
 *  - 角色只允许 user/admin；**管理员提交含 admin 行的文件整批 403**，不静默降级
 *  - 重复账号跳过（计入 skipped）；其他错误行给行号并继续处理后续行
 *  - 有效行仍导入，不因单行错误回滚整批
 *  - 每个成功用户 must_change=true，并在同一事务创建 workspace 复制模板
 *  - 初始密码一次性返回，服务端不保存明文
 *
 * D-13（500 人）：写库必须批量 INSERT；bcrypt hash 用限流并发，避免 500 次串行算力拖死请求。
 */

const MAX_ROWS = 1000;
const EXPECTED_HEADER = ['姓名', '账号', '角色'];
const ACCOUNT_PATTERN = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;

interface ParsedRow {
  /** CSV 行号（1 基，表头是第 1 行） */
  row: number;
  account: string;
  name: string;
  role: Role;
}

export interface ParsedCsv {
  rows: ParsedRow[];
  errors: { row: number; message: string }[];
  /** 文件里是否出现过 admin 角色 */
  hasAdmin: boolean;
}

export function parseImportCsv(content: Buffer): ParsedCsv {
  let matrix: string[][];
  try {
    matrix = parse(content, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as string[][];
  } catch {
    throw unprocessable('CSV 解析失败，请确认文件格式与编码');
  }
  if (matrix.length === 0) {
    throw unprocessable('CSV 文件为空');
  }

  const header = (matrix[0] ?? []).map((h) => h.trim());
  if (header.join(',') !== EXPECTED_HEADER.join(',')) {
    throw unprocessable(`CSV 表头必须是 ${EXPECTED_HEADER.join(',')}`);
  }

  const dataRows = matrix.slice(1);
  if (dataRows.length > MAX_ROWS) {
    throw unprocessable(`最多导入 ${MAX_ROWS} 行，当前 ${dataRows.length} 行`);
  }

  const rows: ParsedRow[] = [];
  const errors: { row: number; message: string }[] = [];
  let hasAdmin = false;

  dataRows.forEach((cells, idx) => {
    const rowNo = idx + 2; // 表头占第 1 行
    const [rawName = '', rawAccount = '', rawRole = ''] = cells;
    const name = rawName.trim();
    const account = rawAccount.trim().toLowerCase();
    const role = rawRole.trim().toLowerCase();

    // 只要文件里出现 admin 角色就整批拒绝（管理员提交含 admin 的文件时 403），
    // **不管该行其他字段是否合法** —— 否则「账号写错 + 角色是 admin」就能绕过这道闸。
    if (role === 'admin') hasAdmin = true;

    if (!name) {
      errors.push({ row: rowNo, message: '姓名不能为空' });
      return;
    }
    if (name.length > 64) {
      errors.push({ row: rowNo, message: '姓名不能超过 64 个字符' });
      return;
    }
    if (!ACCOUNT_PATTERN.test(account)) {
      errors.push({
        row: rowNo,
        message: `账号 ${rawAccount.trim()} 不合法（4-32 位，字母开头，仅含字母数字下划线）`,
      });
      return;
    }
    if (role !== 'user' && role !== 'admin') {
      errors.push({ row: rowNo, message: `角色 ${rawRole.trim()} 不合法（只允许 user/admin）` });
      return;
    }
    rows.push({ row: rowNo, account, name, role: role as Role });
  });

  return { rows, errors, hasAdmin };
}

/** 限流并发的 bcrypt —— 500 个账号串行算会拖死请求 */
async function hashMany(
  passwords: readonly string[],
  concurrency = 8,
): Promise<string[]> {
  const out: string[] = new Array(passwords.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, passwords.length) }, async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= passwords.length) return;
      out[i] = await hashPassword(passwords[i] as string);
    }
  });
  await Promise.all(workers);
  return out;
}

export interface ImportOutcome {
  /** 成功导入的行数 */
  success: number;
  /** 跳过行数（重复账号：库中已存在，或文件内重复） */
  skipped: number;
  /** 失败行数（格式/校验不通过的行） */
  failed: number;
  /** 所有未导入行的原因（跳过与失败都在内，带行号） */
  errors: { row: number; message: string }[];
  initialPasswords: { account: string; password: string }[];
}

export async function importUsers(
  parsed: ParsedCsv,
  orgId: number,
  actor: SessionContext,
): Promise<ImportOutcome> {
  // 管理员提交含 admin 角色的文件 → 整批 403，不导入任何行
  if (parsed.hasAdmin && !actor.user.isSuper) {
    throw forbidden('只有超级管理员才能导入管理员账号');
  }

  // errors：解析阶段就失败的行（格式/校验不通过）→ 计入 failed
  const errors = [...parsed.errors];
  const failed = errors.length;
  let success = 0;
  let skipped = 0;

  // 文件内重复账号：后出现的算跳过
  const seen = new Set<string>();
  const candidates: ParsedRow[] = [];
  for (const r of parsed.rows) {
    if (seen.has(r.account)) {
      skipped += 1;
      errors.push({ row: r.row, message: `账号 ${r.account} 在文件中重复` });
      continue;
    }
    seen.add(r.account);
    candidates.push(r);
  }

  // 库里已存在的账号 → 跳过
  const accounts = candidates.map((r) => r.account);
  let existing = new Set<string>();
  if (accounts.length > 0) {
    const rows = await query<{ account: string }>(
      'SELECT account FROM app_user WHERE account = ANY($1::text[])',
      [accounts],
    );
    existing = new Set(rows.map((r) => r.account));
  }
  const toCreate = candidates.filter((r) => {
    if (existing.has(r.account)) {
      skipped += 1;
      errors.push({ row: r.row, message: `账号 ${r.account} 已存在` });
      return false;
    }
    return true;
  });

  if (toCreate.length === 0) {
    return { success, skipped, failed, errors, initialPasswords: [] };
  }

  // 每个用户一个随机 12 位初始密码（满足密码策略）
  const passwords = toCreate.map(() => generateInitialPassword(12));
  const hashes = await hashMany(passwords);

  const userIds = await withTransaction(async (client) => {
    const ins = await client.query<{ id: string }>(
      `INSERT INTO app_user (account, password_hash, name, org_id, role, is_super, status, must_change_password)
       SELECT u.account, u.password_hash, u.name, u.org_id, u.role, false, 'active', true
         FROM unnest($1::text[], $2::text[], $3::text[], $4::bigint[], $5::text[])
              AS u(account, password_hash, name, org_id, role)
       RETURNING id`,
      [
        toCreate.map((r) => r.account),
        hashes,
        toCreate.map((r) => r.name),
        toCreate.map(() => orgId),
        toCreate.map((r) => r.role),
      ],
    );
    const ids = ins.rows.map((r) => Number(r.id));
    // 同一事务内批量建 workspace 并复制模板
    await createUserWorkspaces(client, ids);
    return ids;
  });

  success = userIds.length;
  const initialPasswords = toCreate.map((r, i) => ({
    account: r.account,
    password: passwords[i] as string,
  }));

  return { success, skipped, failed, errors, initialPasswords };
}

/** 导入模板 CSV —— 表头 姓名,账号,角色 */
export function importTemplateCsv(): string {
  return [
    '姓名,账号,角色',
    '用户01,user01,user',
    '用户02,user02,user',
    '',
  ].join('\n');
}
