import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';

/**
 * bcrypt 工作线程池（D-13）。
 *
 * bcryptjs 是纯 JS，一次 cost=12 的哈希约 466ms（服务器实测），而且同步占用主线程。
 * 500 人批量导入 = 500 次哈希，串行要 3 分钟，期间整个 API 都卡着响应不了。
 *
 * 这里用 `worker_threads` 起 N 个常驻线程（N = CPU-1，最多 4），主线程只排队等结果：
 *   - 导入 500 人：由 1 个线程串行 → 4 个线程并行，耗时降到 1/4；
 *   - 单次登录：仍然只用一个线程，延迟不变，但不再阻塞其它请求。
 *
 * ⚠️ 线程是**懒创建**的：没有哈希需求时（比如只读接口）不会白占内存。
 * ⚠️ 任何一步失败都退回主线程直接算（正确性优先于性能）。
 */

type Job = {
  id: number;
  op: 'hash' | 'verify';
  plain: string;
  hash?: string;
  cost?: number;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

interface Slot {
  worker: Worker;
  busy: boolean;
  job: Job | null;
}

const POOL_SIZE = Math.max(1, Math.min(4, availableParallelism() - 1));
/**
 * 只有编译产物（dist/*.js）旁边才有 hash-worker.js。
 * 开发/测试是 tsx 直跑 .ts，起不了 .js 的 worker —— 那种情况下退回主线程，
 * 免得一跑测试就报「找不到模块」。生产（node dist/server.js）走线程池。
 */
const POOL_AVAILABLE = import.meta.url.endsWith('.js');
let slots: Slot[] | null = null;
let seq = 0;
const queue: Job[] = [];

function spawnSlot(): Slot {
  const worker = new Worker(new URL('./hash-worker.js', import.meta.url));
  const slot: Slot = { worker, busy: false, job: null };

  worker.on('message', (msg: { id: number; ok: boolean; result?: unknown; error?: string }) => {
    const job = slot.job;
    slot.busy = false;
    slot.job = null;
    if (job && job.id === msg.id) {
      if (msg.ok) job.resolve(msg.result);
      else job.reject(new Error(msg.error ?? 'bcrypt 计算失败'));
    }
    drain();
  });

  // 线程挂了：把它手上的任务退回主线程算，然后补一个新线程
  worker.on('error', (err) => {
    const job = slot.job;
    slot.busy = false;
    slot.job = null;
    if (job) {
      void fallback(job).then(job.resolve, job.reject);
    }
    console.warn('[password] 哈希线程异常，已降级到主线程：', err.message);
    const idx = slots?.indexOf(slot) ?? -1;
    if (idx >= 0 && slots) slots[idx] = spawnSlot();
    drain();
  });

  return slot;
}

function ensurePool(): Slot[] {
  if (!slots) slots = Array.from({ length: POOL_SIZE }, spawnSlot);
  return slots;
}

function drain(): void {
  if (!slots) return;
  for (const slot of slots) {
    if (slot.busy) continue;
    const job = queue.shift();
    if (!job) return;
    slot.busy = true;
    slot.job = job;
    slot.worker.postMessage({ id: job.id, op: job.op, plain: job.plain, hash: job.hash, cost: job.cost });
  }
}

async function fallback(job: Job): Promise<unknown> {
  const bcrypt = (await import('bcryptjs')).default;
  return job.op === 'hash' ? bcrypt.hash(job.plain, job.cost ?? 12) : bcrypt.compare(job.plain, job.hash ?? '');
}

function submit(op: Job['op'], plain: string, extra: { hash?: string; cost?: number } = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    try {
      seq += 1;
      const job: Job = { id: seq, op, plain, ...extra, resolve, reject };
      if (!POOL_AVAILABLE) {
        void fallback(job).then(resolve, reject);
        return;
      }
      ensurePool();
      queue.push(job);
      drain();
    } catch (err) {
      // 线程起不来（受限容器等）：直接主线程算，别把功能搞挂
      console.warn('[password] 线程池不可用，降级到主线程：', (err as Error).message);
      slots = null;
      fallback({ id: -1, op, plain, ...extra, resolve, reject }).then(resolve, reject);
    }
  });
}

/** 哈希（走线程池） */
export function hashInPool(plain: string, cost: number): Promise<string> {
  return submit('hash', plain, { cost }) as Promise<string>;
}

/** 校验（走线程池） */
export function verifyInPool(plain: string, hash: string): Promise<boolean> {
  return submit('verify', plain, { hash }) as Promise<boolean>;
}

/** 进程退出时收线程（测试里也要调，否则 vitest 不退出） */
export async function closePool(): Promise<void> {
  if (!slots) return;
  const current = slots;
  slots = null;
  await Promise.all(current.map((s) => s.worker.terminate()));
}
