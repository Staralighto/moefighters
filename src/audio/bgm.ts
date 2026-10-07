/* 站点 BGM：一条循环曲，选人和战斗共用。走 Web Audio 缓冲而不是媒体元素——iOS 忽略媒体元素
   的 volume 属性（音量条失灵、默认音量失效，音乐盖过音效），还会把播放中的元素收编成系统
   「正在播放」会话：灵动岛接管、切后台继续出声，而页面在这条路径上收不到可靠的暂停事件。
   纯 Web Audio 两样都不沾，增益节点在 iOS 照常生效。代价是整条解码成 PCM 驻留内存（比压缩
   文件大一个数量级），所以音乐关掉时把缓冲一起释放，下次开启重新拉取再解码。
   开关是同步布尔：点击立即翻转、UI 立即跟手，出声只是跟着状态走；点击路径上没有可悬挂的
   promise（解码异步落地后由 sync 接上）。开关与音量存 localStorage，关掉标签页也在。
   旧的 sessionStorage 只读一次：能解析就迁到 localStorage 再删掉；坏 JSON 当成没有，
   不让存档把页面打崩。   浏览器允许时开着的音乐会自己响；不允许就保持开关为开，等下一次
   点击或按键再接上。静默试播只用同一个 AudioContext：手势里 resume 它，
   不再关掉后另建一个，避免和音效抢第二次创建并把这一页的音乐标死。 */
import { migrateLinearSlider, musicGain } from './mix.ts';

const MUSIC_SRC = '/bgm/garupa-pico-instrumental.m4a';
const STORE_KEY = 'moefighters.bgm';
const CURVE = 'db';
/* 没有 curve 字段的旧档把音量当成线性滑条位置，默认 15%。先按这个读，再折成对数档。 */
const LEGACY_DEFAULT = 0.15;
const DEFAULT_VOLUME = migrateLinearSlider(LEGACY_DEFAULT);

function clampSlider(v: number, fallback: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
}

function readRecord(raw: string | null): { enabled: boolean; volume: number; legacy: boolean } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const rec = v as { enabled?: unknown; volume?: unknown; curve?: unknown };
    const legacy = rec.curve !== CURVE;
    const fallback = legacy ? LEGACY_DEFAULT : DEFAULT_VOLUME;
    let volume = clampSlider(Number(rec.volume), fallback);
    if (legacy) volume = migrateLinearSlider(volume);
    return { enabled: rec.enabled === true, volume, legacy };
  } catch { return null; }
}

function prefsJson(enabled: boolean, volume: number): string {
  return JSON.stringify({ enabled, volume, curve: CURVE });
}

/** local 优先。旧的线性滑条折成对数档后写回；坏 JSON 当成没有。 */
export function resolveMusicPrefs(localRaw: string | null, sessionRaw: string | null): {
  enabled: boolean;
  volume: number;
  writeLocal: string | null;
  dropSession: boolean;
} {
  const local = readRecord(localRaw);
  if (local) {
    return {
      enabled: local.enabled,
      volume: local.volume,
      writeLocal: local.legacy ? prefsJson(local.enabled, local.volume) : null,
      dropSession: sessionRaw != null,
    };
  }
  const session = readRecord(sessionRaw);
  if (!session) return { enabled: false, volume: DEFAULT_VOLUME, writeLocal: null, dropSession: false };
  return {
    enabled: session.enabled,
    volume: session.volume,
    writeLocal: prefsJson(session.enabled, session.volume),
    dropSession: true,
  };
}

function openStorage(name: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    const bag = globalThis as unknown as { localStorage?: Storage; sessionStorage?: Storage };
    const s = bag[name];
    if (!s || typeof s.getItem !== 'function' || typeof s.setItem !== 'function') return null;
    return s;
  } catch { return null; }
}

function readRaw(store: Storage | null): string | null {
  if (!store) return null;
  try { return store.getItem(STORE_KEY); } catch { return null; }
}

function loadPrefs(): { enabled: boolean; volume: number } {
  const localStore = openStorage('localStorage');
  const sessionStore = openStorage('sessionStorage');
  const resolved = resolveMusicPrefs(readRaw(localStore), readRaw(sessionStore));
  /* 迁入写失败就留着 session，下次打开还能再试；写成功才删旧键。 */
  let localReady = resolved.writeLocal == null;
  if (resolved.writeLocal && localStore) {
    try { localStore.setItem(STORE_KEY, resolved.writeLocal); localReady = true; }
    catch { localReady = false; }
  }
  if (localReady && resolved.dropSession) {
    try { sessionStore?.removeItem(STORE_KEY); } catch { /* local 已经有了 */ }
  }
  return resolved;
}

const stored = loadPrefs();
let enabled = stored.enabled;
let volume = stored.volume;

/* ctx 懒建。unlocked 只在点击开关或 pokeMusic（按下/按键）之后放开，切回前台不会在
   还没有手势时把 context 建出来。音乐关着的访客一个字节都不下载。 */
let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let buffer: AudioBuffer | null = null;
let decoding = false;
let bufferBroken = false;
let ctxBroken = false;
let src: AudioBufferSourceNode | null = null;
/* src 从 offset 秒起播；停的时候把已播时长并回 offset，续播就接在原地。 */
let offset = 0;
let startedAt = 0;
let pageSuspended = typeof document !== 'undefined' && document.hidden;
let unlocked = false;
/* 静默开播的临时 context。只有已经 running 才收编；失败或一直挂起就关掉，手势另建。
   ponytail: 只试一次，不排队重试。升级路径是下一次 pokeMusic。 */
let pending: AudioContext | null = null;

function save(): void {
  try { openStorage('localStorage')?.setItem(STORE_KEY, prefsJson(enabled, volume)); }
  catch { /* 隐私模式等存不进：这一页的内存状态照旧 */ }
}

function dropPending(): void {
  const c = pending;
  pending = null;
  if (!c || c === ctx) return;
  try { void c.close().catch(() => {}); } catch { /* 已经关了 */ }
}

function ensureCtx(): AudioContext | null {
  if (ctxBroken) return null;
  if (ctx) return ctx;
  if (pending?.state === 'closed') pending = null;
  /* 静默试播留下的 context 直接接着用。手势里再 new 一个会和它叠在一起，
     创建失败时原来的 catch 会把 ctxBroken 钉死，这页音乐就再也开不了。 */
  const reused = pending;
  if (reused?.state !== 'running' && !unlocked) return null;
  pending = null;
  try {
    ctx = reused ?? new AudioContext();
    gain = ctx.createGain();
    gain.gain.value = musicGain(volume);
    gain.connect(ctx.destination);
  } catch {
    const failed = ctx ?? reused;
    ctx = null;
    gain = null;
    if (failed) { try { void failed.close().catch(() => {}); } catch { /* 已经关了 */ } }
    ctxBroken = true; /* 这台设备没有音频 */
    return null;
  }
  return ctx;
}

function ensureBuffer(): void {
  if (buffer || decoding || bufferBroken || !ctx) return;
  decoding = true;
  fetch(MUSIC_SRC)
    .then(r => { if (!r.ok) throw new Error('bgm fetch ' + r.status); return r.arrayBuffer(); })
    .then(ab => ctx!.decodeAudioData(ab))
    .then(decoded => {
      decoding = false;
      if (!enabled) return; /* 等待期间被关掉：结果直接丢，不驻留内存 */
      buffer = decoded;
      sync();
    })
    .catch(() => { decoding = false; bufferBroken = true; });
}

function startSrc(): void {
  if (src || !ctx || !gain || !buffer) return;
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.connect(gain);
  s.onended = () => { if (src === s) { src = null; sync(); } /* 被系统中断杀掉时自行续上 */ };
  s.start(0, offset % buffer.duration);
  startedAt = ctx.currentTime;
  src = s;
}

function stopSrc(): void {
  if (!src || !ctx) return;
  offset = (ctx.currentTime - startedAt + offset) % src.buffer!.duration;
  src.stop();
  src.disconnect();
  src = null;
}

/* 唯一的状态汇合点：想让音乐出声 = 开关开着 && 页面在前台。幂等，差多少补多少。 */
function sync(): void {
  if (!enabled || pageSuspended) { stopSrc(); return; }
  const c = ensureCtx();
  if (!c) return;
  void c.resume().catch(() => { /* 低电量模式等会把 ctx 挂起：借下一次手势的 pokeMusic 重试 */ });
  if (!buffer) { ensureBuffer(); return; } /* 解码落地后 sync 会再来一次 */
  startSrc();
}

export function musicEnabled(): boolean {
  return enabled;
}

export function musicVolume(): number {
  return volume;
}

export function setMusicEnabled(on: boolean): void {
  enabled = on;
  save();
  unlocked = true; /* 点开关本身就是手势 */
  if (!on) {
    buffer = null; /* 解码后的 PCM 比压缩文件大一个数量级，音乐关着就不驻留内存 */
    dropPending();
  }
  sync(); /* 关：sync 收拾播放；开：借这次手势建 ctx、拉文件、接上 */
}

/** 每次用户手势调用：音乐开着但还没出声（重新打开页面后静默开播被拒、解码刚落地）
   就在这里接上；已经出声则什么都不做。 */
export function pokeMusic(): void {
  if (!enabled) return;
  unlocked = true;
  sync();
}

export function setMusicVolume(v: number): void {
  volume = clampSlider(v, DEFAULT_VOLUME);
  save();
  if (gain) gain.gain.value = musicGain(volume);
}

/** 切到后台/回前台：音乐跟着停与续，不在看不见的标签页里出声。 */
export function setMusicSuspended(suspended: boolean): void {
  pageSuspended = suspended;
  /* 还没接上音源的试播如果已经在跑，后台标签不要留着空转的音频线程。 */
  if (suspended && pending?.state === 'running') dropPending();
  sync();
}

function trySilent(): void {
  if (!enabled || ctx || ctxBroken || pending || typeof AudioContext === 'undefined') return;
  let c: AudioContext;
  try { c = new AudioContext(); } catch { return; }
  pending = c;
  const take = (): void => {
    if (pending !== c) return;
    if (!enabled || pageSuspended || c.state !== 'running') { dropPending(); return; }
    sync();
  };
  if (c.state === 'running') take();
  else void c.resume().then(take).catch(() => { if (pending === c) dropPending(); });
}

function scheduleSilent(): void {
  if (typeof window === 'undefined' || !enabled) return;
  const run = (): void => { if (enabled && !pageSuspended) trySilent(); };
  if (typeof document !== 'undefined' && document.hidden) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      pageSuspended = false;
      run();
    }, { once: true });
    return;
  }
  requestAnimationFrame(run);
}
scheduleSilent();
