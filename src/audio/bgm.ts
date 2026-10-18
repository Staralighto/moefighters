/* 站点 BGM：固定曲目列表，选人和战斗共用。一次只解码当前这一首。走 Web Audio 缓冲而不是媒体元素——iOS 忽略媒体元素
   的 volume 属性（音量条失灵、默认音量失效，音乐盖过音效），还会把播放中的元素收编成系统
   「正在播放」会话：灵动岛接管、切后台继续出声，而页面在这条路径上收不到可靠的暂停事件。
   纯 Web Audio 两样都不沾，增益节点在 iOS 照常生效。代价是整条解码成 PCM 驻留内存（比压缩
   文件大一个数量级），所以音乐关掉时把缓冲一起释放，下次开启重新拉取再解码。
   开关是同步布尔：点击立即翻转、UI 立即跟手，出声只是跟着状态走；点击路径上没有可悬挂的
   promise（解码异步落地后由 sync 接上）。开关、音量、播放方式和当前下标存 localStorage，关掉标签页也在。
   旧的 sessionStorage 只读一次：能解析就迁到 localStorage 再删掉；坏 JSON 当成没有，
   不让存档把页面打崩。没有存档时默认开着，用户拨过开关之后以存档为准。浏览器允许时
   开着的音乐会自己响；不允许就保持开关为开，选人页先不出声，开打的点击再接上。静默
   试播只用同一个 AudioContext：手势里 resume 它，不再关掉后另建一个，避免和音效抢
   第二次创建并把这一页的音乐标死。 */
import { assetUrl, imagesBusy, slowLink } from '../assets/loader.ts';
import { migrateLinearSlider, musicGain } from './mix.ts';

const TRACKS = [
  { src: '/bgm/garupa-pico-instrumental.m4a', title: '少女乐团PICO' },
  { src: '/bgm/全速前进！.m4a', title: '全速前进！' },
  { src: '/bgm/胜利的冲动.m4a', title: '胜利的冲动' },
  { src: '/bgm/燃烧的冲动.m4a', title: '燃烧的冲动' },
  { src: '/bgm/钢铁之诗.m4a', title: '钢铁之诗' },
  { src: '/bgm/黑色剧场序曲.m4a', title: '黑色剧场序曲' },
] as const;
const ORDERS = ['seq', 'shuffle', 'one'] as const;
export type MusicOrder = (typeof ORDERS)[number];
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

function prefsJson(enabled: boolean, volume: number, extra?: { order: MusicOrder; index: number; fight: boolean }): string {
  const rec: { enabled: boolean; volume: number; curve: string; order?: MusicOrder; index?: number; fight?: boolean } = { enabled, volume, curve: CURVE };
  if (extra) { rec.order = extra.order; rec.index = extra.index; rec.fight = extra.fight; }
  return JSON.stringify(rec);
}

/** 开打换曲只在随机播放、并且这项开着时发生。 */
export function shouldShuffleOnFight(order: MusicOrder, on: boolean): boolean {
  return order === 'shuffle' && on;
}

/** 进页时均匀抽一首。count 不够或抽到界外就回到 0。 */
export function shuffleStartIndex(count: number, pick: (n: number) => number): number {
  if (count <= 1) return 0;
  const n = pick(count);
  return Number.isInteger(n) && n >= 0 && n < count ? n : 0;
}

/** 当前这首已经在播、图片没在下、链路不慢，才预取下一首的压缩字节。单曲循环不用。 */
export function shouldWarmNext(opts: { order: MusicOrder; held: boolean; busy: boolean; slow: boolean; haveBuffer: boolean }): boolean {
  return opts.haveBuffer && !opts.held && !opts.busy && !opts.slow && opts.order !== 'one';
}

export function cycleMusicOrder(order: MusicOrder): MusicOrder {
  const i = ORDERS.indexOf(order);
  return ORDERS[(i < 0 ? 0 : i + 1) % ORDERS.length];
}

/** 左右箭头：始终按列表走，不看随机。 */
export function stepTrack(index: number, dir: -1 | 1, count: number): number {
  if (count <= 0) return 0;
  return (index + dir + count) % count;
}

/** 播完之后的下一首。pick(n) 返回 [0, n)。随机抽到当前这首时改走下一首。 */
export function nextTrack(order: MusicOrder, index: number, count: number, pick: (n: number) => number): number {
  if (count <= 1 || order === 'one') return index;
  if (order === 'seq') return stepTrack(index, 1, count);
  const picked = pick(count);
  return picked === index ? stepTrack(index, 1, count) : picked;
}

function readQueue(raw: string | null): { order: MusicOrder; index: number; fight: boolean } {
  const fallback = { order: 'seq' as const, index: 0, fight: true };
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fallback;
    const rec = v as { order?: unknown; index?: unknown; fight?: unknown };
    const order = ORDERS.includes(rec.order as MusicOrder) ? rec.order as MusicOrder : 'seq';
    const index = Number.isInteger(rec.index) && (rec.index as number) >= 0 && (rec.index as number) < TRACKS.length ? rec.index as number : 0;
    const fight = typeof rec.fight === 'boolean' ? rec.fight : true;
    return { order, index, fight };
  } catch { return fallback; }
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
  if (!session) return { enabled: true, volume: DEFAULT_VOLUME, writeLocal: null, dropSession: false };
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

function loadPrefs(): { enabled: boolean; volume: number; order: MusicOrder; index: number; fight: boolean } {
  const localStore = openStorage('localStorage');
  const sessionStore = openStorage('sessionStorage');
  const localRaw = readRaw(localStore);
  const sessionRaw = readRaw(sessionStore);
  const resolved = resolveMusicPrefs(localRaw, sessionRaw);
  /* 迁入写失败就留着 session，下次打开还能再试；写成功才删旧键。 */
  let localReady = resolved.writeLocal == null;
  if (resolved.writeLocal && localStore) {
    try { localStore.setItem(STORE_KEY, resolved.writeLocal); localReady = true; }
    catch { localReady = false; }
  }
  if (localReady && resolved.dropSession) {
    try { sessionStore?.removeItem(STORE_KEY); } catch { /* local 已经有了 */ }
  }
  const queue = readQueue(readRecord(localRaw) ? localRaw : sessionRaw);
  return { enabled: resolved.enabled, volume: resolved.volume, order: queue.order, index: queue.index, fight: queue.fight };
}

const stored = loadPrefs();
let enabled = stored.enabled;
let volume = stored.volume;
let order: MusicOrder = stored.order;
let index = stored.index;
let fightShuffleOn = stored.fight;
let startRolled = false;
/* 换曲或关掉时递增。过期的解码结果看见代数对不上就丢掉，连点不会把旧歌套回来。 */
let loadGen = 0;
/* 只留下一首的压缩字节，不解码。解码后的 PCM 一首就要几十 MB。 */
let warmBytes: { index: number; buf: ArrayBuffer } | null = null;
let warmAbort: AbortController | null = null;
let warmTimer = 0;
/* 随机播放提前定好的下一首，这样预取的就是即将播的那首。 */
let planned: number | null = null;

/* ctx 懒建。unlocked 只在点击开关或 pokeMusic（开打）之后放开，切回前台不会在
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
/* 静默开播还没成功时，选人页的点击不接音乐。开打或用户自己点开关才清掉。 */
let waitForFight = enabled;
/* 静默开播的临时 context。只有已经 running 才收编；失败或一直挂起就关掉，开打的手势另建。
   ponytail: 只试一次，不排队重试。升级路径是开打时的 pokeMusic，或用户自己点开关。 */
let pending: AudioContext | null = null;

function save(): void {
  try { openStorage('localStorage')?.setItem(STORE_KEY, prefsJson(enabled, volume, { order, index, fight: fightShuffleOn })); }
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

/* 选人或开打还在等图时不拉音乐：3MB 的文件会和立绘、精灵表分同一条慢链路。 */
let held = false;

export function setMusicHeld(on: boolean): void {
  if (held === on) return;
  held = on;
  if (on) abortWarm();
  else { sync(); scheduleWarm(); }
}

function prefetchSlow(): boolean {
  const net = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (net?.saveData) return true;
  if (/2g|3g/.test(net?.effectiveType ?? '')) return true;
  return slowLink();
}

function clearWarmTimer(): void {
  if (!warmTimer) return;
  clearTimeout(warmTimer);
  warmTimer = 0;
}

function abortWarm(): void {
  warmAbort?.abort();
  warmAbort = null;
}

function nextPlanned(): number | null {
  if (order === 'one' || TRACKS.length < 2) return null;
  if (order === 'seq') return stepTrack(index, 1, TRACKS.length);
  if (planned == null || planned === index) planned = nextTrack('shuffle', index, TRACKS.length, n => Math.floor(Math.random() * n));
  return planned;
}

function takePlanned(): number {
  if (order === 'shuffle' && planned != null && planned !== index) {
    const n = planned;
    planned = null;
    return n;
  }
  planned = null;
  return nextTrack(order, index, TRACKS.length, n => Math.floor(Math.random() * n));
}

/* 当前曲已经开声、图片队列空了、链路不慢，才以最低优先级拉下一首的压缩文件。
   慢网和省流直接不预取：换曲时再下，避免和立绘抢带宽。ponytail: 只留一首压缩缓存。 */
function scheduleWarm(): void {
  if (warmTimer || typeof window === 'undefined') return;
  warmTimer = window.setTimeout(tryWarm, 2000);
}

function tryWarm(): void {
  warmTimer = 0;
  if (!enabled || pageSuspended || !buffer) return;
  if (held || imagesBusy()) { scheduleWarm(); return; }
  if (!shouldWarmNext({ order, held: false, busy: false, slow: prefetchSlow(), haveBuffer: true })) return;
  const next = nextPlanned();
  if (next == null || next === index || warmBytes?.index === next || warmAbort) return;
  const ctrl = new AbortController();
  warmAbort = ctrl;
  const gen = loadGen;
  fetch(assetUrl(TRACKS[next].src), { priority: 'low', signal: ctrl.signal })
    .then(r => { if (!r.ok) throw new Error('bgm warm ' + r.status); return r.arrayBuffer(); })
    .then(bytes => {
      if (gen !== loadGen || ctrl.signal.aborted) return;
      warmBytes = { index: next, buf: bytes };
    })
    .catch(() => { /* 预取失败就等真正换曲时再下 */ })
    .finally(() => { if (warmAbort === ctrl) warmAbort = null; });
}

function ensureBuffer(): void {
  if (buffer || decoding || bufferBroken || held || !ctx) return;
  decoding = true;
  const gen = loadGen;
  const cached = warmBytes?.index === index ? warmBytes.buf : null;
  if (cached) warmBytes = null;
  const job = cached
    ? Promise.resolve(cached)
    : fetch(assetUrl(TRACKS[index].src)).then(r => { if (!r.ok) throw new Error('bgm fetch ' + r.status); return r.arrayBuffer(); });
  job
    .then(ab => ctx!.decodeAudioData(ab))
    .then(decoded => {
      if (gen !== loadGen) return;
      decoding = false;
      if (!enabled || !ctx) return; /* 等待期间被关掉：结果直接丢，不驻留内存 */
      buffer = decoded;
      sync();
    })
    .catch(() => {
      if (gen !== loadGen) return;
      decoding = false;
      bufferBroken = true;
    });
}

function startSrc(): void {
  if (src || !ctx || !gain || !buffer) return;
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = order === 'one';
  s.connect(gain);
  s.onended = () => {
    if (src !== s) return;
    const duration = s.buffer?.duration ?? 0;
    const played = ctx ? ctx.currentTime - startedAt + offset : duration;
    src = null;
    /* 单曲循环时 onended 只可能是被系统掐断。顺序和随机播到结尾才换曲，中途掐断从原处续上。 */
    const finished = duration > 0 && played >= duration - 0.05;
    if (!finished || order === 'one') {
      offset = finished ? 0 : played;
      sync();
      return;
    }
    index = takePlanned();
    offset = 0;
    buffer = null;
    save();
    sync();
  };
  s.start(0, offset % buffer.duration);
  startedAt = ctx.currentTime;
  src = s;
  scheduleWarm();
}

function stopSrc(): void {
  if (!src || !ctx) return;
  offset = (ctx.currentTime - startedAt + offset) % src.buffer!.duration;
  const playing = src;
  src = null;
  playing.onended = null;
  playing.stop();
  playing.disconnect();
}

/* 换曲：不把上一首的进度写进 offset。先摘掉 onended，stop 才不会被当成播完。 */
function dropSrc(): void {
  if (!src) return;
  const playing = src;
  src = null;
  playing.onended = null;
  try { playing.stop(); } catch { /* 已经停了 */ }
  playing.disconnect();
}

function cutTrack(): void {
  offset = 0;
  buffer = null;
  bufferBroken = false;
  decoding = false;
  loadGen++;
  planned = null;
  if (warmBytes?.index !== index) warmBytes = null;
  abortWarm();
  clearWarmTimer();
  dropSrc();
  save();
  sync();
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

function rollShuffleStart(): void {
  if (startRolled || !enabled || order !== 'shuffle') return;
  startRolled = true;
  index = shuffleStartIndex(TRACKS.length, n => Math.floor(Math.random() * n));
  offset = 0;
  save();
}

export function setMusicEnabled(on: boolean): void {
  enabled = on;
  if (on) rollShuffleStart();
  save();
  unlocked = true; /* 点开关本身就是手势 */
  waitForFight = false;
  if (!on) {
    buffer = null; /* 解码后的 PCM 比压缩文件大一个数量级，音乐关着就不驻留内存 */
    warmBytes = null;
    planned = null;
    abortWarm();
    clearWarmTimer();
    loadGen++;
    decoding = false;
    dropPending();
  }
  sync(); /* 关：sync 收拾播放；开：借这次手势建 ctx、拉文件、接上 */
}

export function musicOrder(): MusicOrder {
  return order;
}

export function musicTitle(): string {
  return TRACKS[index].title;
}

export function setMusicOrder(next: MusicOrder): void {
  order = next;
  save();
  if (src) src.loop = order === 'one';
}

export function stepMusic(dir: -1 | 1): void {
  index = stepTrack(index, dir, TRACKS.length);
  cutTrack();
}

export function fightShuffle(): boolean {
  return fightShuffleOn;
}

export function setFightShuffle(on: boolean): void {
  fightShuffleOn = on;
  save();
}

/** 开打时换一首。不是随机播放，或这项关着，就保持当前曲。 */
export function shuffleFightTrack(): void {
  if (!shouldShuffleOnFight(order, fightShuffleOn)) return;
  const next = nextTrack('shuffle', index, TRACKS.length, n => Math.floor(Math.random() * n));
  if (next === index) return;
  index = next;
  cutTrack();
}

/** 开打时调用：音乐开着但还没出声就在这次点击里接上；已经出声则什么都不做。 */
export function pokeMusic(): void {
  if (!enabled) return;
  waitForFight = false;
  unlocked = true;
  sync();
}

/** 选人页的点击和按键。静默开播被拒时先不开，等开打；已经允许出声之后，用来把挂起的播放接回来。 */
export function nudgeMusic(): void {
  if (waitForFight) return;
  pokeMusic();
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
  if (suspended) abortWarm();
  else scheduleWarm();
  sync();
}

function trySilent(): void {
  if (!enabled || ctx || ctxBroken || pending || typeof AudioContext === 'undefined') return;
  let c: AudioContext;
  try { c = new AudioContext(); } catch { waitForFight = true; return; }
  pending = c;
  const take = (): void => {
    if (pending !== c) return;
    if (!enabled || pageSuspended || c.state !== 'running') { waitForFight = true; dropPending(); return; }
    waitForFight = false;
    sync();
  };
  if (c.state === 'running') take();
  else void c.resume().then(take).catch(() => { if (pending === c) { waitForFight = true; dropPending(); } });
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
rollShuffleStart();
scheduleSilent();
