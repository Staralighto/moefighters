import type { CharacterData, StageData } from '../data/types.ts';

export type ImageCache = Map<string, HTMLImageElement>;

/** Leave the loading screen even if a browser request never settles. */
export async function withLoadTimeout<T>(loading: Promise<T>, ms = 30_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('资源加载超时')), ms);
    });
    return await Promise.race([loading, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** 1×1 WebP. One decode decides the browser can use the format, so a no is not N failed sheet requests. */
const WEBP_PROBE = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';

/**
 * Production lists the built WebP, then the PNG. Dev, and a browser that cannot decode
 * WebP, get the PNG only — one request, no fallback storm.
 */
/** Root paths stay root paths on the dev server. A relative base (Toy) is prefixed at the request. */
export function assetUrl(src: string, base = import.meta.env?.BASE_URL ?? '/'): string {
  if (!src.startsWith('/') || src.startsWith('//')) return src;
  if (!base || base === '/') return src;
  return (base.endsWith('/') ? base : base + '/') + src.slice(1);
}

export function imageSources(src: string, prod = import.meta.env.PROD, webpOk = true): readonly string[] {
  if (prod && webpOk && src.endsWith('.png')) return [src.slice(0, -4) + '.webp', src];
  return [src];
}

/** An image written straight into HTML or CSS, not loaded through loadImage: the Toy base prefix, and the built WebP in
 *  production (the Toy pack drops PNGs that have one). ponytail: no PNG fallback, so a browser without WebP
 *  (Safari < 14) shows these previews empty; route through assignFirst / applyImageUrl if that ever matters. */
export const staticUrl = (src: string): string => assetUrl(imageSources(src, !!import.meta.env?.PROD)[0]);

/** `url("…")` for a CSS custom property. A relative url() inside a custom property resolves where var() is used —
 *  the built stylesheet under assets/ — not the page. Absolute against the document so frames/ and stages/ hit. */
export const cssUrl = (src: string): string => {
  const u = src.startsWith('/') ? staticUrl(src) : src;
  let abs = u;
  try { abs = new URL(u, document.baseURI).href; } catch { /* keep u */ }
  return `url("${abs.replace(/["\\]/g, '\\$&')}")`;
};

/** Both dev (Vite crop) and production (built WebP) only need the 256px idle cell.
 *  common.png crops to idle.png. Any other standing sheet (michelle.png) crops to <name>-idle.png.
 *  special.png stays itself: it has no standing cell the roster should ask for. */
export function portraitSrc(common: string): string {
  if (common.endsWith('/idle.png') || common.endsWith('-idle.png')) return common;
  if (common.endsWith('/common.png')) return common.replace(/\/common\.png$/, '/idle.png');
  if (common.endsWith('/special.png') || common.endsWith('-special.png') || common.endsWith('/frenzy.png')) return common;
  if (/^\/sprites\/[a-z0-9-]+\/[a-z0-9-]+\.png$/.test(common)) return common.replace(/\.png$/, '-idle.png');
  return common;
}

/** Stage cards are 78px tall. Production asks for the 480px preview; the backdrop keeps the full file. */
export function stageThumbSrc(src: string, prod = import.meta.env.PROD): string {
  return prod && src.endsWith('.png') ? src.replace(/\.png$/, '-thumb.png') : src;
}

/** Half-size lossy copy of a sprite sheet, WebP only. Dev has none and gets the sheet back. */
export function liteSrc(src: string, prod = import.meta.env.PROD): string {
  return prod && src.startsWith('/sprites/') && src.endsWith('.png') ? src.slice(0, -4) + '-lite.webp' : src;
}
export const LITE_SCALE = 0.5;

interface Timed { transferSize?: number; responseStart: number; responseEnd: number; workerStart?: number }

/**
 * Bytes per second while something was arriving. Parallel downloads share one link, so
 * overlapping busy time is counted once. Cache hits carry no bytes and are skipped.
 * ponytail: the newest 24 downloads only. A cold connection's slow start reads low; the
 * error leans toward the lite path, which costs a soft first few seconds, not a stall.
 */
export function linkRate(entries: readonly Timed[]): number | null {
  const xs = entries.filter(e => (e.transferSize ?? 0) > 0 && e.responseEnd > e.responseStart).slice(-24)
    .sort((a, b) => a.responseStart - b.responseStart);
  let bytes = 0, busy = 0, end = -Infinity;
  for (const e of xs) {
    bytes += e.transferSize!;
    busy += Math.max(0, e.responseEnd - Math.max(e.responseStart, end));
    end = Math.max(end, e.responseEnd);
  }
  return bytes >= 32_000 && busy > 0 ? bytes / busy * 1000 : null;
}

/** Below this the full fight set (~1.3MB for 1V1) is a wait of several seconds. */
export const SLOW_RATE = 300_000;
const RATE_KEY = 'moefighters.link';

/* 有缓存 worker（public/sw.js）时，经它转交的响应在 resource timing 里只记响应头那几百字节，按它算吞吐会把快网判成慢网。
   所以经 worker 的条目不算，改用 worker 自己量的真实下载（它从网络拿到完整文件时发 {t:'rate'} 过来）。时间用绝对毫秒对齐。 */
const workerSamples: Timed[] = [];
export function noteLinkSample(bytes: number, startAbs: number, endAbs: number): void {
  if (!(bytes > 0) || !(endAbs > startAbs) || typeof performance === 'undefined') return;
  const o = performance.timeOrigin;
  workerSamples.push({ transferSize: bytes, responseStart: startAbs - o, responseEnd: endAbs - o });
  if (workerSamples.length > 24) workerSamples.shift();
}

/* resource timing 缓冲满了（main.ts 设成 1000 条）就不再记新条目，测速会一直停在旧数据上。
   后台下载一次就是几百个请求，所以满了就清空：测速只看最近 24 条，清掉旧的不影响。 */
if (typeof performance !== 'undefined') {
  performance.addEventListener?.('resourcetimingbufferfull', () => performance.clearResourceTimings());
}

function linkEntries(): Timed[] {
  const own = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter(e => !(e.workerStart > 0));
  return [...own, ...workerSamples].sort((a, b) => a.responseEnd - b.responseEnd);
}

/**
 * A slow link starts fights on lite sheets. Fresh downloads decide; a visit served from cache
 * reuses the last measured rate; with neither, the browser's own estimate, where it has one.
 */
export function slowLink(prod = import.meta.env.PROD): boolean {
  if (!prod || typeof performance === 'undefined') return false;
  // Toy 包（scripts/pack-toy.py 往 index.html 加 <meta name="mf-toy">）不带 lite 图，国内访问也不考虑慢网：一律按快网走。
  if (typeof document !== 'undefined' && document.querySelector('meta[name="mf-toy"]')) return false;
  const net = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (net?.saveData) return true;
  let rate = linkRate(linkEntries());
  try {
    if (rate != null) localStorage.setItem(RATE_KEY, String(Math.round(rate)));
    else rate = Number(localStorage.getItem(RATE_KEY)) || null;
  } catch { /* private mode: this page's measurement still counts */ }
  if (rate != null) return rate < SLOW_RATE;
  return /2g|3g/.test(net?.effectiveType ?? '');
}

/* ---- 统一下载闸 ----
   图片（和后台预取的音频）都从这里排队，不让各条路径各开各的连接一起抢带宽、在同一帧里一起解码。
   名额占到解码结束（fetchImage 在 decode 之后才 resolve），所以并发数也是同时解码的上限。
     0 挡着画面：开打预载、首屏舞台和站位立绘。最多 6 条，不受下面的总量限制。
     1 眼前要看：当前页面的图。和 0 级合计不超过 base（快网 3，慢网 2）。
     2 后台预取：对战中换高清、终幕图、下一首 BGM、音乐库时长。同时只跑 1 条，
       有 0 级在等或在跑、或有人 holdIdle 时一律不开。
     3 批量预载：设置里「立即下载全部」。比 2 级还低：前面任何一级有人在等就不开，同时最多 2 条。
     4 空闲下载：src/assets/prefetch.ts 自动排的。前面任何一级有人在等就不开，同时 1 条。
   3、4 级在联机对战中（holdBulk）一律不开。
   抢占：有 0 级在等或在跑、或 1 级在等名额时，正在跑的 3、4 级里 > 512KB 的（BGM、立绘）立刻中断，由发起方放回自己的队列；
   小文件让它下完，比中断重来省。
   同一 key 再被要求时只提升优先级，不会再下一次。 */
export type NetPri = 0 | 1 | 2 | 3 | 4;
export interface NetOpts { bytes?: number; cancel?: () => void }
interface NetJob { key: string; pri: NetPri; seq: number; start: () => void; done?: Promise<void>; bytes: number; cancel?: () => void }
/** A running bulk/idle download bigger than this gives way to a waiting foreground image. */
export const PREEMPT_BYTES = 512 * 1024;
const netWait: NetJob[] = [];
const netRun = new Set<NetJob>();
let netSeq = 0;
/** A slot held this long is given back to the queue; the request itself keeps going. */
const NET_STALL_MS = 12_000;
let idleHolds = 0;
let bulkHolds = 0;
let slowAt = -Infinity;
let slowNow = false;
/** Last moment a priority 0/1 job was waiting or running. The idle downloader waits a beat after the screen settles. */
let fgAt = -Infinity;
const nowMs = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
export function foregroundIdleMs(): number {
  if ([...netRun, ...netWait].some(j => j.pri <= 1)) { fgAt = nowMs(); return 0; }
  return nowMs() - fgAt;
}

function netBase(): number {
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (now - slowAt > 5000) { slowAt = now; slowNow = slowLink(); }
  return slowNow ? 2 : 3;
}

function netCanStart(pri: NetPri): boolean {
  let zero = 0, idle = 0, bulk = 0, auto = 0;
  for (const j of netRun) { if (j.pri === 0) zero++; else if (j.pri === 2) idle++; else if (j.pri === 3) bulk++; else if (j.pri === 4) auto++; }
  if (pri === 0) return zero < 6;
  if (netRun.size >= netBase()) return false;
  if (pri === 1) return true;
  if (idleHolds > 0 || zero > 0 || netWait.some(j => j.pri === 0)) return false;
  if (pri === 2) return idle < 1;
  if (bulkHolds > 0 || netWait.some(j => j.pri < pri)) return false;
  return pri === 3 ? bulk < 2 : auto < 1;
}

function netPump(): void {
  netWait.sort((a, b) => a.pri - b.pri || a.seq - b.seq);
  for (let i = 0; i < netWait.length;) {
    const job = netWait[i];
    if (netCanStart(job.pri)) { netWait.splice(i, 1); job.start(); }
    else i++;
  }
  // 挡画面的 0 级不管在等还是已经开了都算；1 级只在等名额时才算（选人页滚动名单一直有 1 级，不能因此把大文件反复打断）。
  if (netWait.some(j => j.pri <= 1) || [...netRun].some(j => j.pri === 0)) {
    fgAt = nowMs();
    for (const j of netRun) {
      if (j.pri < 3 || !j.cancel || j.bytes <= PREEMPT_BYTES) continue;
      const cancel = j.cancel;
      j.cancel = undefined;
      cancel();
    }
  }
}

/** Run `run` when the gate gives it a slot. */
export function netTask<T>(key: string, pri: NetPri, run: () => Promise<T>, opts: NetOpts = {}): Promise<T> {
  let made: NetJob | undefined;
  const out = new Promise<T>((resolve, reject) => {
    const job: NetJob = made = {
      key, pri, seq: netSeq++, bytes: opts.bytes ?? 0, cancel: opts.cancel,
      start: () => {
        netRun.add(job);
        // 一条卡死的连接（无响应、不报错）不能永久占着名额：超时后让出位置，请求本身继续。
        const free = () => { clearTimeout(timer); if (netRun.delete(job)) netPump(); };
        // 批量预载、空闲下载（3、4 级）不让：它们只会挡住同级文件，让了反而会越开越多条。
        if (job.pri <= 1) fgAt = nowMs();
        const timer = job.pri < 3 ? setTimeout(free, NET_STALL_MS) : undefined;
        let p: Promise<T>;
        try { p = run(); } catch (e) { p = Promise.reject(e); }
        void p.then(resolve, reject).finally(free);
      },
    };
    netWait.push(job);
    netPump();
  });
  if (made) made.done = out.then(() => {}, () => {});
  return out;
}

/** 当前的请求编号。之后发出的请求编号都更大：loadGate 用它只数「这一页自己要的」，不把别处排着的（选人页名册等）算进来。 */
export function netMark(): number { return netSeq; }

/** 还在排队或在下载、优先级不低于 maxPri、编号 ≥ since 的请求（loadGate 用它判断「眼前要看的图还有几张没到」）。 */
export function pendingNet(maxPri: NetPri = 1, since = 0): Promise<void>[] {
  const out: Promise<void>[] = [];
  for (const j of [...netRun, ...netWait]) if (j.pri <= maxPri && j.seq >= since && j.done) out.push(j.done);
  return out;
}

/** A waiting job asked for again at a higher priority moves up. A running one only re-counts. */
export function bumpNet(key: string, pri: NetPri): void {
  let moved = false;
  for (const j of netWait) if (j.key === key && pri < j.pri) { j.pri = pri; moved = true; }
  for (const j of netRun) if (j.key === key && pri < j.pri) j.pri = pri;
  if (moved) netPump();
}

/** Hold back priority-3/4 work (bulk and idle downloads) — for the whole time an online fight is on screen:
 *  tens of MB in the background would push up the match's round-trip time. */
export function holdBulk(): () => void {
  bulkHolds++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    bulkHolds--;
    netPump();
  };
}

/** Hold back priority-2/3/4 work (fight preload in progress). Call the returned function to let it go. */
export function holdIdle(): () => void {
  idleHolds++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    idleHolds--;
    netPump();
  };
}

function fetchImage(src: string): Promise<HTMLImageElement> {
  const once = (): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      // Decode here, while the loading screen or the queue is the thing waiting, so a
      // first drawImage mid-fight never stalls on a 2048px sheet's synchronous decode.
      const decoded = im.decode?.().catch(() => {}) ?? Promise.resolve();
      void decoded.then(() => resolve(im));
    };
    im.onerror = () => reject(Error('图片加载失败：' + src));
    im.src = assetUrl(src);
  });
  // data: URLs fail because those bytes cannot decode, so a second try would fail the same way.
  // A network URL gets one more try: a reset on a lossy link should not stick as a missing sheet.
  return src.startsWith('data:') ? once() : once().catch(() => once());
}

let webpOk: Promise<boolean> | null = null;
export function supportsWebp(): Promise<boolean> {
  if (!import.meta.env.PROD) return Promise.resolve(false);
  webpOk ??= withLoadTimeout(fetchImage(WEBP_PROBE)).then(() => true, () => false);
  return webpOk;
}

/** One in-flight load per logical path. A later caller joins it instead of starting a second download. */
const loaded = new Map<string, Promise<HTMLImageElement>>();

async function fetchFirst(src: string): Promise<HTMLImageElement> {
  const sources = imageSources(src, import.meta.env.PROD, src.endsWith('.png') ? await supportsWebp() : false);
  let err: unknown;
  for (const url of sources) {
    try { return await fetchImage(url); }
    catch (e) { err = e; }
  }
  throw err instanceof Error ? err : Error('图片加载失败：' + src);
}

export function loadImage(src: string, pri: NetPri = 1): Promise<HTMLImageElement> {
  let pending = loaded.get(src);
  if (pending) bumpNet(src, pri);
  else {
    pending = netTask(src, pri, () => withLoadTimeout(fetchFirst(src))).catch(err => {
      loaded.delete(src);
      throw err;
    });
    loaded.set(src, pending);
  }
  return pending;
}

/** Paint the URL that already loaded. A swapped icon does not treat the aborted request as a PNG fallback. */
export function assignImage(img: HTMLImageElement, src: string): void {
  assignFirst(img, [src]);
}

/** First URL that loads wins. A later assign on the same element still cancels this one. */
export function assignFirst(img: HTMLImageElement, srcs: readonly string[]): void {
  const gen = String((Number(img.dataset.imgGen) || 0) + 1);
  img.dataset.imgGen = gen;
  img.onerror = null;
  const tryAt = (i: number): void => {
    if (img.dataset.imgGen !== gen) return;
    const src = srcs[i];
    if (!src) return;
    void loadImage(src).then(im => {
      if (img.dataset.imgGen !== gen) return;
      if (img.src !== im.src) img.src = im.src;
    }).catch(() => tryAt(i + 1));
  };
  tryAt(0);
}

/** CSS has no error event. The url is applied only after loadImage picked WebP or PNG, so the sheet is not fetched twice. */
export function applyImageUrl(src: string, apply: (url: string) => void, pri: NetPri = 1): void {
  void loadImage(src, pri).then(im => apply(im.src)).catch(() => {});
}

/** Every image a match needs: sprite views plus the stage backdrop. */
export function assetsFor(characters: CharacterData[], stage: StageData): string[] {
  const srcs = characters.flatMap(c => c.view.kind === 'sprite'
    ? [c.view.common, c.view.special, ...(c.view.frenzy ? [c.view.frenzy] : []), ...(c.view.king ? [c.view.king] : []), ...(c.view.world ? [c.view.world] : []), ...(c.view.box ? [c.view.box] : []), ...(c.forms ? [c.forms.alt.common, c.forms.alt.special] : []), ...(c.view.extras ?? [])]
    : []);
  if (stage.image) srcs.push(stage.image);
  for (const c of characters) for (const s of c.skills) if (s.domain) srcs.push(s.domain.background);
  return [...new Set(srcs)];
}

/**
 * Slow link: the fight waits only for each fighter's two main sheets at half size and the
 * stage preview. `rest` (lite form sheets) and then the full set follow during the fight.
 * A sheet `have` already holds in full needs no stand-in.
 */
export function liteFight(characters: CharacterData[], stage: StageData, have: (src: string) => boolean, prod = import.meta.env.PROD): { need: string[]; rest: string[] } {
  const views = characters.flatMap(c => c.view.kind === 'sprite' ? [c.view] : []);
  const small = (s: string | undefined, to: (s: string) => string) => s && !have(s) ? [to(s)] : [];
  const lite = (s: string) => liteSrc(s, prod);
  const need = views.flatMap(v => [...small(v.common, lite), ...small(v.special, lite)]);
  need.push(...small(stage.image, s => stageThumbSrc(s, prod)));
  const rest = views.flatMap(v => [v.frenzy, v.king, v.world, v.box].flatMap(s => small(s, lite)));
  // 一人二役: the alt form's sheets come in with the other form sheets.
  for (const c of characters) if (c.forms) rest.push(...small(c.forms.alt.common, lite), ...small(c.forms.alt.special, lite));
  return { need: [...new Set(need)], rest: [...new Set(rest)] };
}

/** 马善政毛笔楷书, subset to the nine kuji characters. OFL, see public/fonts/MaShanZheng-OFL.txt. */
let kujiFont: Promise<void> | null = null;
export function loadKujiFont(): Promise<void> {
  if (kujiFont) return kujiFont;
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const face = new FontFace('Ma Shan Zheng', `url(${assetUrl('/fonts/ma-shan-zheng-kuji.woff2')})`);
  kujiFont = withLoadTimeout(face.load()).then(loaded => { document.fonts.add(loaded); }).catch(() => { kujiFont = null; });
  return kujiFont;
}

/** Sheets that still failed after one retry. Portraits stop waiting and fall back to the block figure. */
export const missingImages = new Set<string>();

const inflight = new Map<string, Promise<boolean>>();

/** True while anything is on the wire or waiting at the gate. Music lookahead waits for this. */
export function imagesBusy(): boolean {
  return inflight.size > 0 || [...netRun, ...netWait].some(j => j.pri < 3);
}

/** One request per src, shared by the select queue and the fight preload. */
export function loadInto(cache: ImageCache, src: string, pri: NetPri = 1): Promise<boolean> {
  if (cache.has(src)) return Promise.resolve(true);
  if (missingImages.has(src)) return Promise.resolve(false);
  let pending = inflight.get(src);
  if (pending) bumpNet(src, pri);
  else {
    pending = loadImage(src, pri).then(im => {
      cache.set(src, im);
      return true;
    }).catch(() => {
      missingImages.add(src);
      return false;
    }).finally(() => { inflight.delete(src); });
    inflight.set(src, pending);
  }
  return pending;
}

/**
 * 解码后的整张动作图常驻内存：2048×768 一张就是 6MB，全角色加起来约 700MB。
 * 无尽闯关一关换一批对手，不清理的话手机会被系统杀掉页面。每次开打后调用：
 * 本场要用的移到最新，其余从最旧的开始丢，直到解码字节数回到 budget 以内。
 * 小于 1MB 的图（256px 站位裁图、舞台缩略图、道具小图）不丢：便宜，而且选人队列会把它们记成已完成，不会再排。
 * 丢掉的同时从 loadImage 的去重表里删除，Image 对象才能被回收；以后再要会重新走（HTTP 缓存里通常还在）。
 */
export function trimImages(cache: ImageCache, keep: ReadonlySet<string>, budget: number): number {
  const size = (im: HTMLImageElement) => (im.naturalWidth * im.naturalHeight * 4) || 0;
  for (const s of keep) {
    const im = cache.get(s);
    if (im) { cache.delete(s); cache.set(s, im); }
  }
  let bytes = 0;
  for (const im of cache.values()) bytes += size(im);
  let freed = 0;
  for (const [s, im] of cache) {
    if (bytes <= budget) break;
    const b = size(im);
    if (keep.has(s) || b < 1 << 20) continue;
    cache.delete(s);
    loaded.delete(s);
    bytes -= b;
    freed += b;
  }
  return freed;
}

/** Loads independently so one missing file does not wipe the rest of the cache. */
export async function preload(cache: ImageCache, srcs: string[], pri: NetPri = 0): Promise<string[]> {
  const results = await Promise.all(srcs.map(async s => (await loadInto(cache, s, pri)) ? null : s));
  return results.filter((s): s is string => s !== null);
}

/**
 * Displayed load fraction. Creeps while nothing has arrived yet, and stays under 1
 * until `real` is 1 so the bar cannot finish early.
 */
export function easeLoad(display: number, real: number, elapsedMs: number): number {
  const creep = 1 - Math.exp(-Math.max(0, elapsedMs) / 6000);
  const target = real >= 1 ? 1 : Math.min(0.96, Math.max(real * 0.9, creep * 0.85));
  const next = display + (target - display) * 0.12;
  return real >= 1 ? Math.min(1, next) : Math.min(next, 0.96);
}

/** Next download: a pinned src before anything that merely jumped the queue. */
export function nextSrc(pins: readonly string[], front: readonly string[], back: readonly string[], settled: ReadonlySet<string>): string | null {
  const waiting = (s: string) => !settled.has(s);
  const pinned = pins.find(s => waiting(s) && (front.includes(s) || back.includes(s)));
  return pinned ?? front.find(waiting) ?? back.find(waiting) ?? null;
}

export interface ImageQueue {
  /** These finish before `soon` entries. The first screen pins the stage and whoever is standing on it. */
  pin(srcs: readonly string[]): void;
  /** Jump the queue, still behind anything pinned. */
  soon(srcs: readonly string[]): void;
  /** After the pinned and jumped entries. */
  later(srcs: readonly string[]): void;
  /** Stop dispatching new background loads (a fight preload takes the link); in-flight ones finish. */
  pause(): void;
  /** Resume dispatching. */
  resume(): void;
  /** Forget failures (network came back): anything not in the cache may be queued and loaded again. */
  retry(): void;
}

/**
 * ponytail: two downloads at a time so a phone does not decode every sheet in one frame.
 * A desktop with memory to spare can raise the limit; the pin order stays the same.
 */
export function imageQueue(cache: ImageCache, limit: number, load: (src: string, pri: NetPri) => Promise<boolean> = (s, p) => loadInto(cache, s, p)): ImageQueue {
  const pins: string[] = [];
  const front: string[] = [];
  const back: string[] = [];
  const flying = new Set<string>();
  const settled = new Set<string>();
  let active = 0;
  let paused = false;

  function drop(src: string): void {
    const fi = front.indexOf(src);
    if (fi >= 0) front.splice(fi, 1);
    const bi = back.indexOf(src);
    if (bi >= 0) back.splice(bi, 1);
  }

  function pump(): void {
    if (paused) return;
    while (active < limit) {
      const src = nextSrc(pins, front, back, settled);
      if (!src) return;
      drop(src);
      if (cache.has(src) || missingImages.has(src)) { settled.add(src); continue; }
      active++;
      flying.add(src);
      void load(src, pins.includes(src) ? 0 : 1).finally(() => {
        flying.delete(src);
        settled.add(src);
        active--;
        pump();
      });
    }
  }

  function soon(srcs: readonly string[]): void {
    for (let i = srcs.length - 1; i >= 0; i--) {
      const src = srcs[i];
      if (!src || settled.has(src) || flying.has(src)) continue;
      if (cache.has(src) || missingImages.has(src)) { settled.add(src); continue; }
      drop(src);
      front.unshift(src);
    }
    pump();
  }

  return {
    pin(srcs) {
      pins.splice(0, pins.length, ...new Set(srcs.filter(Boolean)));
      soon(pins);
    },
    soon,
    later(srcs) {
      for (const src of srcs) {
        if (!src || settled.has(src) || flying.has(src) || front.includes(src) || back.includes(src)) {
          if (src && (cache.has(src) || missingImages.has(src))) settled.add(src);
          continue;
        }
        if (cache.has(src) || missingImages.has(src)) { settled.add(src); continue; }
        back.push(src);
      }
      pump();
    },
    pause() { paused = true; },
    retry() {
      for (const src of [...settled]) if (!cache.has(src)) settled.delete(src);
      soon(pins);
    },
    resume() {
      paused = false;
      pump();
    },
  };
}
