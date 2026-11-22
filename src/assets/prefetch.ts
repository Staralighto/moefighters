/* 后台资源下载（设计见项目文档「后台资源下载与缓存策略-设计」）。
   玩家什么都不点，空闲时把「接下来大概率要用」的文件下进缓存；眼前要看的图一出现就让路，空下来再接着下。
   · 只把字节交给浏览器（有 public/sw.js 时落进 Cache Storage，否则进 HTTP 缓存）：不 new Image、不解码、不占内存。
     真正要用时 loadImage 照常走 0/1 级，命中缓存，只剩解码。
   · 车道：预测 → 2 级（1 条）；设置里「立即下载全部」→ 3 级（2 条）；自动分档 → 4 级（1 条）。让路、抢占都在 loader.ts 的闸里。
   · 场景：选人页等后台页面照常；本地对战只下 < 1MB 的小文件，每个之间隔 2 秒；联机对战全部停下（holdBulk）并中断在跑的。
   · 网络（智能档）：省流 / 2g、3g / 实测慢网 / 低电量 → 只下预测；移动网络或拿不准（iPhone 拿不到网络类型）→ 小文件 + 预测；
     Wi-Fi、有线、或桌面端 → 全部。「全部」档不看网络；「关闭」档什么都不自动下。 */

import { assetUrl, foregroundIdleMs, imageSources, netTask, noteLinkSample, slowLink, supportsWebp, type NetPri } from './loader.ts';
import { readJson, writeJson } from '../save/storage.ts';
import { touchDevice } from '../ui/device.ts';

export type Entry = [path: string, bytes: number, hash: string];
export type Mode = 'smart' | 'all' | 'off';
export type Tier = 'core' | 'roster' | 'heavy';
export type Scene = 'menu' | 'local' | 'online';

export const ASSET_CACHE = 'mf-assets-v1';
const MODE_KEY = 'moefighters.prefetch';
const DAY_KEY = 'moefighters.prefetch.day';
const RECENT_KEY = 'moefighters.recent';
/** 智能档每天自动下的上限（不含预测和玩家点的「立即下载全部」）：异常反复重下也不会吃掉流量。 */
export const DAILY_CAP = 60 * 1048576;
/** 本地对战里只下比这小的文件。 */
const FIGHT_MAX_BYTES = 1048576;
const FIGHT_GAP_MS = 2000;
/** 前台图片都到齐后再等这么久才继续：选人页连点时不反复启停。 */
const SETTLE_MS = 1500;
const INPUT_QUIET_MS = 400;
const BACKOFF = [5_000, 30_000, 300_000];
/** 连续失败判定网络异常后，最多停这么久再自己试一次（不只等 online 事件：信号差但没断网时不会有这个事件）。 */
const STALL_MS = 300_000;
/** 网络状况每隔这么久才重新读一次：pick 每秒都会跑，读 resource timing 和 localStorage 不该每次都做。 */
const NET_TTL_MS = 5_000;

/* ---------- 纯函数（selfcheck 覆盖） ---------- */

export function tierOf(path: string): Tier {
  const dir = path.split('/')[0];
  if (dir === 'sprites') return 'roster';
  if (dir === 'stages') return /-thumb\.\w+$/.test(path) ? 'core' : 'roster';
  if (dir === 'bgm' || dir === 'portraits' || dir === 'finale') return 'heavy';
  return 'core';
}

export interface NetInfo {
  saveData?: boolean; effectiveType?: string; type?: string;
  slow: boolean; touch: boolean; lowBattery: boolean; roomy: boolean;
}

/** Which tiers the automatic lane may take, and whether predictions run at all. */
export function netPolicy(mode: Mode, n: NetInfo): { tiers: Tier[]; predict: boolean } {
  const ALL: Tier[] = ['core', 'roster', 'heavy'];
  if (mode === 'off') return { tiers: [], predict: false };
  if (mode === 'all') return { tiers: n.roomy ? ALL : ['core'], predict: true };
  if (n.saveData || /2g|3g/.test(n.effectiveType ?? '') || n.slow || n.lowBattery) return { tiers: [], predict: true };
  if (!n.roomy) return { tiers: ['core'], predict: true };
  if (n.type === 'cellular') return { tiers: ['core'], predict: true };
  if (n.type === 'wifi' || n.type === 'ethernet') return { tiers: ALL, predict: true };
  // 拿不准网络类型：桌面端几乎不按流量计费，照常全下；触屏设备（iPhone 一律拿不到）只下小文件。
  return { tiers: n.touch ? ['core'] : ALL, predict: true };
}

const SHEET_FIRST = /\/(common|special|idle)\.\w+$/;
const HEAVY_ORDER = ['portraits', 'finale', 'bgm'];

/** Download order: small common files first, then fighters in roster order (main sheets before form sheets),
 *  then the big files, music last. */
export function orderFiles(files: readonly Entry[], rosterIndex: (folder: string) => number): Entry[] {
  const rank: Record<Tier, number> = { core: 0, roster: 1, heavy: 2 };
  const key = (f: Entry): number[] => {
    const t = tierOf(f[0]);
    const parts = f[0].split('/');
    if (t === 'core') return [0, f[1]];
    if (t === 'roster') {
      if (parts[0] === 'stages') return [1, 9999, 0, f[1]];
      const ri = rosterIndex(parts[1] ?? '');
      return [1, ri < 0 ? 9998 : ri, SHEET_FIRST.test(f[0]) ? 0 : 1, f[1]];
    }
    return [rank[t], HEAVY_ORDER.indexOf(parts[0]), f[1]];
  };
  return [...files].map(f => [key(f), f] as const)
    .sort((a, b) => { for (let i = 0; i < Math.max(a[0].length, b[0].length); i++) { const d = (a[0][i] ?? 0) - (b[0][i] ?? 0); if (d) return d; } return a[1][0].localeCompare(b[1][0]); })
    .map(x => x[1]);
}

/** A logical game path (/sprites/x/common.png, /portraits/x.webp?v=…) → the manifest path production requests. */
export function manifestPath(src: string, prod: boolean, webp: boolean): string {
  return imageSources(src, prod, webp)[0].replace(/^\//, '');
}

/* ---------- 运行时 ---------- */

type Listener = () => void;
const listeners = new Set<Listener>();
let files: Entry[] = [];
let byPath = new Map<string, Entry>();
let manifestState: 'loading' | 'none' | 'ok' = 'loading';
const have = new Set<string>();
const predicted: string[] = [];
/** Which guess put each predicted path there ('cast', 'challenge', 'boot'): a new guess of the same kind replaces the old one. */
const guessOf = new Map<string, string>();
const running = new Map<string, { ctrl: AbortController; lane: 'predict' | 'boost' | 'auto' }>();
const fails = new Map<string, { n: number; until: number }>();
let streak = 0;
let stalled = false;
let stalledAt = 0;
let manifestAt = -Infinity;
let netCache: { at: number; info: NetInfo } | null = null;
let modeNow: Mode | null = null;
let scene: Scene = 'menu';
let boost = false;
let paused = false;
let started = false;
let lowBattery = false;
let roomy = true;
let webp = true;
let lastInput = -Infinity;
let lastFightStart = -Infinity;
let rosterIndex: (folder: string) => number = () => -1;
let ordered: Entry[] | null = null;
let timer = 0;

const now = () => performance.now();
const notify = () => { for (const fn of listeners) fn(); };
export function onPrefetchChange(fn: Listener): () => void { listeners.add(fn); return () => listeners.delete(fn); }

export function prefetchMode(): Mode {
  if (modeNow) return modeNow;
  const v = readJson(MODE_KEY);
  return modeNow = v === 'all' || v === 'off' ? v : 'smart';
}
export function setPrefetchMode(mode: Mode): void {
  modeNow = mode;
  writeJson(MODE_KEY, mode);
  if (mode === 'off') abortRunning(l => l !== 'boost');
  notify();
  pump();
}

const controlled = () => typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
const urlOf = (path: string) => new URL(assetUrl('/' + path), document.baseURI).href;
const today = () => new Date().toISOString().slice(0, 10);

function dayBytes(): number {
  const v = readJson(DAY_KEY) as { d?: string; b?: number } | null;
  return v?.d === today() && typeof v.b === 'number' ? v.b : 0;
}
function addDayBytes(n: number): void { writeJson(DAY_KEY, { d: today(), b: dayBytes() + n }); }

function netInfo(): NetInfo {
  const t = now();
  if (netCache && t - netCache.at < NET_TTL_MS) return { ...netCache.info, lowBattery, roomy };
  const net = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; type?: string } }).connection;
  const info: NetInfo = {
    saveData: net?.saveData, effectiveType: net?.effectiveType, type: net?.type,
    slow: slowLink(), touch: touchDevice(),
    lowBattery, roomy,
  };
  netCache = { at: t, info };
  return info;
}

/** What is downloaded and verified. With the worker: the cache entries whose hash still matches the manifest.
 *  Without it: whatever this visit already pulled (the HTTP cache cannot be listed). */
async function scanHave(): Promise<void> {
  // 只增不减：扫描途中刚下完的不能被这次扫描抹掉（清除缓存走 clearAssetCache）。
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(ASSET_CACHE);
      const hashOf = new Map(files.map(f => [urlOf(f[0]), f]));
      for (const req of await cache.keys()) {
        const f = hashOf.get(req.url);
        if (!f) continue;
        const r = await cache.match(req);
        if (r?.headers.get('x-mf-h') === f[2]) have.add(f[0]);
      }
    } catch { /* storage blocked: fall through to this visit's timings */ }
  }
  if (!controlled()) {
    try {
      const seen = new Set(performance.getEntriesByType('resource').map(e => e.name.split('#')[0]));
      for (const f of files) if (seen.has(urlOf(f[0]))) have.add(f[0]);
    } catch { /* no timing API */ }
  }
}

async function cachedOk(f: Entry): Promise<boolean> {
  if (!controlled() || typeof caches === 'undefined') return false;
  try {
    const r = await (await caches.open(ASSET_CACHE)).match(urlOf(f[0]));
    return r?.headers.get('x-mf-h') === f[2];
  } catch { return false; }
}

async function loadManifest(): Promise<void> {
  manifestAt = now();
  try {
    const r = await fetch(assetUrl('/asset-manifest.json'), { cache: 'no-cache' });
    if (!r.ok) throw Error(String(r.status));
    const m = await r.json() as { files?: unknown[]; sw?: boolean };
    files = (m.files ?? []).filter((f): f is Entry => Array.isArray(f) && typeof f[0] === 'string' && Number.isFinite(f[1]))
      .map(f => [f[0], f[1], typeof f[2] === 'string' ? f[2] : '']);
    if (!files.length) throw Error('empty');
    byPath = new Map(files.map(f => [f[0], f]));
    ordered = null;
    manifestState = 'ok';
    const sw = navigator.serviceWorker;
    if (m.sw === false) {
      void sw?.getRegistrations?.().then(rs => { for (const reg of rs) void reg.unregister(); }).catch(() => {});
      try { void caches?.delete(ASSET_CACHE); } catch { /* none */ }
    } else sw?.controller?.postMessage({ t: 'manifest', m });
  } catch {
    manifestState = 'none';
  }
  await scanHave();
  notify();
}

function registerWorker(): void {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  if (!sw || !import.meta.env.PROD || location.protocol === 'file:') return;
  // 新 worker 接管后（第一次访问、或发版换了 sw.js）把清单再交一次，并重新数一遍缓存。
  sw.addEventListener('controllerchange', () => { void loadManifest(); });
  void sw.register(assetUrl('/sw.js')).catch(() => { /* private mode, blocked: HTTP cache only */ });
}

/* 开发服务器不用缓存 worker。同一个地址以前跑过构建版（vite preview 换到同端口等）留下的 worker
   会把改过的图一直从缓存里给出来，所以开发时一律注销并删掉缓存。 */
if (import.meta.env?.DEV && typeof navigator !== 'undefined') {
  void navigator.serviceWorker?.getRegistrations?.().then(rs => { for (const r of rs) void r.unregister(); }).catch(() => {});
  try { void globalThis.caches?.delete(ASSET_CACHE).catch(() => {}); } catch { /* none */ }
}

/* worker 的消息从页面一打开就收（不等 startPrefetch）：上一次访问装好的 worker 这次一开始就在转交图片，
   它量的真实吞吐是慢网判断（lite 动作图）唯一的依据。 */
{
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  sw?.addEventListener('message', e => {
    const d = e.data as { t?: string; b?: number; s?: number; e?: number } | null;
    if (d?.t === 'rate') noteLinkSample(Number(d.b), Number(d.s), Number(d.e));
    else if (d?.t === 'swept') void scanHave().then(notify);
  });
  sw?.startMessages?.();
}

/** Read the body to the end so the cache keeps it, without holding the bytes. */
async function warm(path: string, signal: AbortSignal): Promise<void> {
  // x-mf-bg: the worker files this as a background download it may abort on our message (see launch).
  const r = await fetch(assetUrl('/' + path), { priority: 'low', signal, headers: controlled() ? { 'x-mf-bg': '1' } : undefined } as RequestInit);
  if (!r.ok) throw Error(String(r.status));
  const reader = r.body?.getReader();
  if (!reader) { await r.arrayBuffer(); return; }
  for (;;) { const { done } = await reader.read(); if (done) return; }
}

function abortRunning(which: (lane: 'predict' | 'boost' | 'auto') => boolean): void {
  for (const [, job] of running) if (which(job.lane)) job.ctrl.abort();
}

function waiting(path: string, t: number): boolean {
  if (have.has(path) || running.has(path)) return false;
  const f = fails.get(path);
  return !f || (f.n <= BACKOFF.length && t >= f.until);
}

/** The next file and its lane, or null. Predictions first, then the boost/auto list in order. */
function pick(): { f: Entry; lane: 'predict' | 'boost' | 'auto' } | null {
  const t = now();
  if (stalled && t - stalledAt > STALL_MS) { stalled = false; streak = 0; }
  // 清单没拿到（启动时断网）：隔一分钟再要一次。开发版本来就没有清单，不要。
  if (manifestState === 'none' && import.meta.env.PROD && t - manifestAt > 60_000) void loadManifest().then(pump);
  // 不支持 WebP 的浏览器（Safari < 14）游戏请求的是 PNG，清单里的 webp 下了也用不上。
  if (manifestState !== 'ok' || !webp || paused || stalled || document.hidden || scene === 'online') return null;
  const mode = prefetchMode();
  const pol = netPolicy(mode, netInfo());
  const fight = scene === 'local';
  if (fight && t - lastFightStart < FIGHT_GAP_MS) return null;
  if (!fight && t - lastInput < INPUT_QUIET_MS) return null;
  const fits = (f: Entry) => !fight || f[1] < FIGHT_MAX_BYTES;
  const lanes = [...running.values()].map(j => j.lane);
  // 智能档每天的自动流量上限（预测也算，只有玩家点的「立即下载全部」不算）。
  const capped = !boost && mode === 'smart' && dayBytes() >= DAILY_CAP;
  // 受限网络（智能档只剩预测）在对战里连预测也不下。
  if (pol.predict && !capped && !lanes.includes('predict') && !(fight && !pol.tiers.length && !boost)) {
    for (const p of predicted) {
      const f = byPath.get(p);
      if (f && waiting(p, t) && fits(f)) return { f, lane: 'predict' };
    }
  }
  if (foregroundIdleMs() < SETTLE_MS) return null;
  const cap = fight ? 1 : boost ? 2 : 1;
  if (lanes.filter(l => l !== 'predict').length >= cap) return null;
  const tiers = boost ? ['core', 'roster', 'heavy'] : pol.tiers;
  if (!tiers.length) return null;
  if (capped) return null;
  ordered ??= orderFiles(files, rosterIndex);
  for (const f of ordered) {
    if (!tiers.includes(tierOf(f[0])) || !waiting(f[0], t) || !fits(f)) continue;
    return { f, lane: boost ? 'boost' : 'auto' };
  }
  if (boost) { boost = false; notify(); }
  return null;
}

function launch(f: Entry, lane: 'predict' | 'boost' | 'auto'): void {
  const ctrl = new AbortController();
  ctrl.signal.addEventListener('abort', () => navigator.serviceWorker?.controller?.postMessage({ t: 'abort', url: urlOf(f[0]) }));
  running.set(f[0], { ctrl, lane });
  if (scene === 'local') lastFightStart = now();
  const pri: NetPri = lane === 'predict' ? 2 : lane === 'boost' ? 3 : 4;
  void netTask(`bulk:${f[0]}`, pri, async () => {
    if (ctrl.signal.aborted) throw new DOMException('aborted', 'AbortError');
    // The game may have pulled it through the worker already: count it and spend nothing.
    if (await cachedOk(f)) return;
    await warm(f[0], ctrl.signal);
    if (lane !== 'boost' && prefetchMode() === 'smart') addDayBytes(f[1]);
  }, { bytes: f[1], cancel: () => ctrl.abort() }).then(() => {
    have.add(f[0]);
    fails.delete(f[0]);
    streak = 0;
    const pi = predicted.indexOf(f[0]);
    if (pi >= 0) predicted.splice(pi, 1);
    guessOf.delete(f[0]);
  }, err => {
    // 被抢占、被暂停：不算失败，留在队里等下一轮。
    if (ctrl.signal.aborted || (err as Error)?.name === 'AbortError') return;
    const prev = fails.get(f[0])?.n ?? 0;
    fails.set(f[0], { n: prev + 1, until: now() + (BACKOFF[prev] ?? Infinity) });
    if (++streak >= 5) { stalled = true; stalledAt = now(); } // 连着失败：网络有问题，等 online 事件或 5 分钟
  }).finally(() => {
    running.delete(f[0]);
    notify();
    pump();
  });
}

function pump(): void {
  if (!started) return;
  for (let guard = 0; guard < 4; guard++) {
    const next = pick();
    if (!next) break;
    launch(next.f, next.lane);
  }
}

/* ---------- 对外 ---------- */

/** Start after the first screen is up. `order` = sprite folders in roster order. */
export function startPrefetch(order: readonly string[], firstGuesses: readonly string[]): void {
  if (started) return;
  started = true;
  const idx = new Map(order.map((f, i) => [f, i]));
  rosterIndex = f => idx.get(f) ?? -1;
  registerWorker();
  void supportsWebp().then(ok => { webp = ok || !import.meta.env.PROD; });
  const input = () => { lastInput = now(); };
  addEventListener('pointerdown', input, { passive: true, capture: true });
  addEventListener('keydown', input, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pump(); });
  addEventListener('online', () => {
    stalled = false; streak = 0; netCache = null;
    for (const f of fails.values()) f.until = 0;
    if (manifestState === 'none' && import.meta.env.PROD) void loadManifest().then(pump);
    pump();
  });
  type Battery = EventTarget & { level: number; charging: boolean };
  void (navigator as Navigator & { getBattery?: () => Promise<Battery> }).getBattery?.().then(b => {
    const sync = () => { lowBattery = b.level < 0.2 && !b.charging; pump(); };
    sync();
    b.addEventListener('levelchange', sync);
    b.addEventListener('chargingchange', sync);
  }).catch(() => {});
  predict(firstGuesses, 'boot');
  void loadManifest().then(async () => {
    try {
      const est = await navigator.storage?.estimate?.();
      const left = files.filter(f => !have.has(f[0])).reduce((n, f) => n + f[1], 0);
      if (est?.quota != null && est.usage != null) roomy = est.quota - est.usage > left * 2;
    } catch { /* no estimate: assume room */ }
    pump();
  });
  // 前台忙完、输入停下、对战间隔这几个条件都不发事件，隔一会儿看一眼（空队列时什么都不做）。
  timer = window.setInterval(pump, 1000);
}

/** Files the player is about to need (the cast on stage, the next challenge foes). Newest guesses go first.
 *  A guess of the same `kind` replaces the previous one: tapping through twenty fighters keeps only the last cast,
 *  not twenty casts' worth of sheets queued on a phone's data plan. */
export function predict(srcs: readonly string[], kind: string): void {
  const prod = !!import.meta.env.PROD;
  const paths = [...new Set(srcs.map(s => manifestPath(s, prod, webp)))].filter(p => !have.has(p));
  for (let i = predicted.length - 1; i >= 0; i--) {
    const p = predicted[i];
    if (guessOf.get(p) === kind && !paths.includes(p)) { predicted.splice(i, 1); guessOf.delete(p); }
  }
  for (let i = paths.length - 1; i >= 0; i--) {
    const at = predicted.indexOf(paths[i]);
    if (at >= 0) predicted.splice(at, 1);
    predicted.unshift(paths[i]);
    guessOf.set(paths[i], kind);
  }
  for (const p of predicted.splice(48)) guessOf.delete(p);
  pump();
}

export function setPrefetchScene(next: Scene): void {
  if (scene === next) return;
  scene = next;
  if (next === 'online') abortRunning(() => true);
  // 本地对战：在跑的大文件中断，开打后只走小文件慢车道。
  else if (next === 'local') for (const [path, job] of running) if ((byPath.get(path)?.[1] ?? 0) >= FIGHT_MAX_BYTES) job.ctrl.abort();
  pump();
}

/** True when this logical path's production file is already in the worker cache (a slow link need not fetch its lite stand-in). */
export function prefetchHas(src: string): boolean {
  return have.has(manifestPath(src, !!import.meta.env.PROD, webp));
}

/** The settings button: everything, now, at level 3. */
export function boostPrefetch(): void { boost = true; paused = false; stalled = false; streak = 0; for (const f of fails.values()) { f.n = 0; f.until = 0; } notify(); pump(); }
export function pausePrefetch(): void { paused = true; boost = false; abortRunning(() => true); notify(); }
export function resumePrefetch(): void { paused = false; notify(); pump(); }

export async function clearAssetCache(): Promise<void> {
  abortRunning(() => true);
  try { await caches?.delete(ASSET_CACHE); } catch { /* none */ }
  have.clear();
  fails.clear();
  notify();
}

/** Recently played fighters, newest first (ids only). */
export function noteRecent(ids: readonly string[]): void {
  const old = readJson(RECENT_KEY);
  const list = [...ids, ...(Array.isArray(old) ? old.filter((x): x is string => typeof x === 'string') : [])];
  writeJson(RECENT_KEY, [...new Set(list)].slice(0, 5));
}
export function recentIds(): string[] {
  const v = readJson(RECENT_KEY);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 5) : [];
}

export interface PrefetchView {
  state: 'loading' | 'none' | 'ok';
  files: readonly Entry[]; have: ReadonlySet<string>;
  mode: Mode; boost: boolean; paused: boolean; stalled: boolean;
  /** Something is downloading or will be as soon as the screen is idle: steadier than "a file is on the wire right now". */
  active: boolean;
  /** Bytes the automatic lane will never take under the current mode and network (the button offers them). */
  outside: number; persistent: boolean;
}
export function prefetchView(): PrefetchView {
  const mode = prefetchMode();
  const pol = netPolicy(mode, netInfo());
  const outside = files.filter(f => !have.has(f[0]) && !pol.tiers.includes(tierOf(f[0]))).reduce((n, f) => n + f[1], 0);
  return {
    state: manifestState, files, have, mode, boost, paused, stalled,
    active: manifestState === 'ok' && !paused && !stalled && (boost || [...running.values()].some(j => j.lane !== 'predict')
      || (prefetchMode() !== 'off' && !(mode === 'smart' && dayBytes() >= DAILY_CAP) && files.some(f => !have.has(f[0]) && pol.tiers.includes(tierOf(f[0]))))),
    outside, persistent: controlled(),
  };
}

export function stopPrefetchForTests(): void { clearInterval(timer); started = false; }
