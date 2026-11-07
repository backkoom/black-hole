import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { TEST_PASSWORD, cleanTestData, clearSessions, closeApp, ensureUser, getApp } from './helpers.js';
import { resolveKey, storageRoot } from '../src/files/storage.js';
import { rm } from 'node:fs/promises';

/**
 * 文件上传 / 下载 —— D-19。
 *
 * 覆盖点：
 *  - 上传：落盘、元数据（大小以实际写入为准，不信客户端）、hasFile 标记
 *  - 下载：内容、Content-Type、中文名的 RFC 5987 编码
 *  - 超限：413，且**不留半截文件**（最容易漏的清理分支）
 *  - 删除：行软删 + 磁盘实体一起删，再下载 404
 *  - 历史数据（只有元数据没有实体）：下载给明确文案，不是 500
 *  - 存储键：`../` 一律拒绝
 *
 * ⚠️ 测试把 MAX_UPLOAD_MB 压到 1MB（见 setup.ts），不用真造 50MB 文件。
 */

const ACCOUNT = 'fileuser01';

async function login() {
  const app = await getApp();
  const agent = request.agent(app.server);
  const res = await agent.post('/api/auth/login').send({ account: ACCOUNT, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

describe('文件上传与下载', () => {
  beforeAll(async () => {
    await ensureUser(ACCOUNT, { mustChange: false });
    // 每次从干净的存储目录开始，避免上一轮的残留影响"文件被删干净"的断言
    await rm(storageRoot(), { recursive: true, force: true });
    const { ensureStorage } = await import('../src/files/storage.js');
    await ensureStorage();
  });

  afterAll(async () => {
    await rm(storageRoot(), { recursive: true, force: true });
    await cleanTestData();
    await clearSessions();
    await closeApp();
  });

  it('上传：落盘 + 元数据正确（大小以实际字节数为准）', async () => {
    const agent = await login();
    const body = Buffer.from('hello 上传\n第二行\n', 'utf8');

    const res = await agent
      .post('/api/files/upload')
      .attach('file', body, { filename: '测试文档.txt', contentType: 'text/plain' });

    expect(res.status).toBe(200);
    const file = res.body.data.file;
    expect(file.name).toBe('测试文档.txt');
    expect(file.kind).toBe('doc');
    expect(file.sizeBytes).toBe(body.length);
    expect(file.hasFile).toBe(true);
    expect(file.mimeType).toBe('text/plain');

    // 元数据里不能出现磁盘路径（别把内部结构漏给前端）
    expect(JSON.stringify(file)).not.toContain('storage');
  });

  it('下载：内容一致，中文名走 RFC 5987', async () => {
    const agent = await login();
    const body = Buffer.from('下载内容校验\n', 'utf8');
    const up = await agent
      .post('/api/files/upload')
      .attach('file', body, { filename: '设计方案说明.txt', contentType: 'text/plain' });
    const id = up.body.data.file.id as number;

    const res = await agent.get(`/api/files/${id}/download`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-disposition']).toContain("filename*=UTF-8''");
    expect(res.headers['content-disposition']).toContain(encodeURIComponent('设计方案说明.txt'));
    // nosniff 由 nginx 在 server 级统一加，接口层不再重复设置（会出两个同名头）
    expect(res.headers['x-content-type-options']).toBeUndefined();
    expect(Buffer.compare(res.body as Buffer, body)).toBe(0);
  });

  it('超过上限：413，且不留下半截文件', async () => {
    const agent = await login();
    const before = await listStoredFiles();

    // setup.ts 里 MAX_UPLOAD_MB=1，这里给 1.2MB
    const big = Buffer.alloc(Math.round(1.2 * 1024 * 1024), 0x41);
    const res = await agent.post('/api/files/upload').attach('file', big, {
      filename: 'big.bin',
      contentType: 'application/octet-stream',
    });

    expect(res.status).toBe(413);
    const after = await listStoredFiles();
    expect(after.length).toBe(before.length);
  });

  it('删除：磁盘实体一起清掉，再下载 404', async () => {
    const agent = await login();
    const up = await agent
      .post('/api/files/upload')
      .attach('file', Buffer.from('待删除'), { filename: 'todelete.txt', contentType: 'text/plain' });
    const id = up.body.data.file.id as number;

    const target = await findStoredKey(id);
    expect(target).toBeTruthy();
    await expect(readFile(resolveKey(target as string))).resolves.toBeInstanceOf(Buffer);

    const del = await agent.delete(`/api/files/${id}`);
    expect(del.status).toBe(200);

    // 盘上已经没有了
    await expect(readFile(resolveKey(target as string))).rejects.toThrow();
    // 再下载 → 404
    const again = await agent.get(`/api/files/${id}/download`);
    expect(again.status).toBe(404);
  });

  it('历史登记数据（只有元数据）：下载 404 且文案明确', async () => {
    const agent = await login();
    const created = await agent
      .post('/api/files')
      .send({ name: '只有登记的旧文件.pdf', kind: 'pdf', sizeBytes: 1234 });
    expect(created.status).toBe(200);
    expect(created.body.data.file.hasFile).toBe(false);

    const res = await agent.get(`/api/files/${created.body.data.file.id}/download`);
    expect(res.status).toBe(404);
    expect(res.body.message).toContain('没有可下载的实体');
  });

  it('存储键：拒绝目录穿越', () => {
    expect(() => resolveKey('../../etc/passwd')).toThrow('非法的存储路径');
    expect(() => resolveKey('2026/11/../../../secret.txt')).toThrow('非法的存储路径');
  });
});

/** 递归列出存储目录下的文件（用于"没有留下半截文件"的断言） */
async function listStoredFiles(): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else out.push(full);
    }
  }
  await walk(storageRoot());
  return out;
}

/** 从数据库取某个文件 id 的存储键（接口不回传，测试直接从库里查） */
async function findStoredKey(id: number): Promise<string | null> {
  const { queryOne } = await import('../src/db.js');
  const row = await queryOne<{ storage_key: string | null }>(
    'SELECT storage_key FROM file_asset WHERE id = $1',
    [id],
  );
  return row?.storage_key ?? null;
}
