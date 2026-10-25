import { MAILBOX_URL, mailboxUsable } from './endpoint.ts';

export class MailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailError';
  }
}

function unwrap(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  const body = (data as { body?: unknown }).body;
  if (typeof body === 'string') {
    try {
      const inner = JSON.parse(body) as unknown;
      if (inner && typeof inner === 'object') return inner as Record<string, unknown>;
    } catch { /* the gateway already gave us the object */ }
  }
  return data as Record<string, unknown>;
}

function checkError(obj: Record<string, unknown>): void {
  const code = typeof obj.error === 'string' ? obj.error : (typeof obj.err === 'string' ? obj.err : '');
  if (!code) return;
  if (code === 'busy') throw new MailError('联机人数较多，请稍后再试');
  if (code === 'full' || code === 'locked') throw new MailError('房间已满');
  if (code === 'expired' || code === 'stale' || code === 'gone') throw new MailError('房间号无效');
  if (code === 'limit') throw new MailError('操作太频繁，请稍后重试');
  if (code === 'auth') throw new MailError('房间验证失败');
  if (code === 'origin') throw new MailError('访问受限，请从官网进入');
  throw new MailError('联机不可用');
}

function linkSignal(parent?: AbortSignal, timeoutMs = 8000): { signal: AbortSignal; cleanup: () => void; isTimeout: () => boolean } {
  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort(new DOMException('timeout', 'TimeoutError'));
  }, timeoutMs);
  const onParentAbort = () => ac.abort(parent?.reason);
  if (parent) {
    if (parent.aborted) ac.abort(parent.reason);
    else parent.addEventListener('abort', onParentAbort, { once: true });
  }
  const cleanup = () => {
    clearTimeout(timer);
    if (parent) parent.removeEventListener('abort', onParentAbort);
  };
  return { signal: ac.signal, cleanup, isTimeout: () => timedOut };
}

const RETRY_MAX = 3;

function retryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function postMail(body: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  if (!mailboxUsable(MAILBOX_URL)) throw new MailError('联机不可用');
  let lastWasTimeout = false;
  for (let attempt = 0; attempt < RETRY_MAX; attempt++) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('aborted', 'AbortError');
    const { signal: reqSignal, cleanup, isTimeout } = linkSignal(signal, 8000);
    let res: Response;
    try {
      res = await fetch(MAILBOX_URL, {
        method: 'POST',
        // text/plain is CORS-safelisted, so the browser skips the preflight OPTIONS.
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify(body),
        signal: reqSignal,
      });
    } catch (err) {
      lastWasTimeout = isTimeout();
      cleanup();
      if (signal?.aborted) throw err;
      if (attempt + 1 < RETRY_MAX) {
        await sleep(300 * (attempt + 1), signal);
        continue;
      }
      throw new MailError(lastWasTimeout
        ? '网络连接超时，请检查网络后重试'
        : '网络连接失败，请检查网络后重试');
    }
    cleanup();
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      if (attempt + 1 < RETRY_MAX && retryable(res.status)) {
        await sleep(300 * (attempt + 1), signal);
        continue;
      }
      if (res.status === 429) throw new MailError('联机人数较多，请稍后再试');
      if (res.status >= 500) throw new MailError('服务响应异常，请稍后再试');
      throw new MailError('网络连接失败，请检查网络后重试');
    }
    const obj = unwrap(data);
    if (!res.ok) {
      if (attempt + 1 < RETRY_MAX && retryable(res.status)) {
        await sleep(300 * (attempt + 1), signal);
        continue;
      }
      checkError(obj);
      if (res.status === 429) throw new MailError('联机人数较多，请稍后再试');
      if (res.status >= 500) throw new MailError('服务响应异常，请稍后再试');
      throw new MailError('联机不可用');
    }
    checkError(obj);
    return obj;
  }
  throw new MailError(lastWasTimeout
    ? '网络连接超时，请检查网络后重试'
    : '网络连接失败，请检查网络后重试');
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    const stop = () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('aborted', 'AbortError')); };
    if (signal.aborted) { stop(); return; }
    signal.addEventListener('abort', stop, { once: true });
  });
}
