import { parentPort } from 'node:worker_threads';
import bcrypt from 'bcryptjs';

/**
 * bcrypt 计算线程（D-13 规模验证的产物）。
 *
 * 为什么需要它：bcryptjs 是**纯 JS** 实现，一次 cost=12 的哈希在服务器上要 ~466ms，
 * 而且它跑在 Node 的主线程上 —— 批量导入 500 人时，主线程被连续占用 ~3 分钟，
 * 期间所有接口都卡住（压测里表现为"导入 188 秒，同时别人什么都点不动"）。
 * 放到 worker 里之后，主线程只负责收发消息。
 *
 * 协议：主线程 postMessage({ id, op: 'hash' | 'verify', plain, hash?, cost? })
 *       本线程回 postMessage({ id, ok, result?, error? })
 */

const port = parentPort;
if (!port) throw new Error('hash-worker 必须在 worker_threads 里运行');

port.on('message', (msg) => {
  const { id, op, plain, hash, cost } = msg as {
    id: number;
    op: 'hash' | 'verify';
    plain: string;
    hash?: string;
    cost?: number;
  };
  try {
    if (op === 'hash') {
      const result = bcrypt.hashSync(plain, cost ?? 12);
      port.postMessage({ id, ok: true, result });
      return;
    }
    const result = bcrypt.compareSync(plain, hash ?? '');
    port.postMessage({ id, ok: true, result });
  } catch (err) {
    port.postMessage({ id, ok: false, error: (err as Error).message });
  }
});
