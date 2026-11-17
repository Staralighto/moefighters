/* 本机存储的薄壳：读写都吞异常（无痕模式、配额满、WebView 禁用存储），坏 JSON 当成没有。
   业务模块自己决定默认值，这里只负责「拿得到就给，拿不到给 null」。 */

export function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? null : JSON.parse(raw) as unknown;
  } catch { return null; }
}

export function writeJson(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

/** 别的标签页写了这个键（或清空了存储）时回调。各模块缓存着存档，不重读的话两个标签页会互相覆盖：
 *  这边买了东西扣了碎片，那边打完一局拿旧余额加 5 写回去，扣款就没了。本页自己的写入不会触发。 */
export function onOtherTab(key: string, fn: () => void): void {
  globalThis.addEventListener?.('storage', (e: StorageEvent) => { if (e.key === key || e.key === null) fn(); });
}

export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** 非负整数；不合法给 fallback。存档里的计数一律走这个。 */
export function count(v: unknown, fallback = 0, max = 1e9): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : fallback;
}

let persistAsked = false;
/** 请浏览器把本站存储标成持久，降低被自动清理的概率。只问一次，失败无所谓。 */
export function askPersist(): void {
  if (persistAsked) return;
  persistAsked = true;
  try { void navigator.storage?.persist?.().catch(() => {}); } catch { /* 不支持 */ }
}
