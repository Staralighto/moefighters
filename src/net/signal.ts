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

export async function postMail(body: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  if (!mailboxUsable(MAILBOX_URL)) throw new MailError('联机不可用');
  let res: Response;
  try {
    res = await fetch(MAILBOX_URL, {
      method: 'POST',
      // text/plain is CORS-safelisted, so the browser skips the preflight OPTIONS.
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new MailError('联机不可用');
  }
  let data: unknown = null;
  try { data = await res.json(); } catch { throw new MailError('联机不可用'); }
  const obj = unwrap(data);
  if (!res.ok) throw new MailError('联机不可用');
  return obj;
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const stop = () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('aborted', 'AbortError')); };
    if (signal.aborted) { stop(); return; }
    signal.addEventListener('abort', stop, { once: true });
  });
}
