/* 站点 BGM：一条循环曲，选人和战斗共用。走 Web Audio 缓冲而不是媒体元素——iOS 忽略媒体元素
   的 volume 属性（音量条失灵、默认音量失效，音乐盖过音效），还会把播放中的元素收编成系统
   「正在播放」会话：灵动岛接管、切后台继续出声，而页面在这条路径上收不到可靠的暂停事件。
   纯 Web Audio 两样都不沾，增益节点在 iOS 照常生效。代价是整条解码成 PCM 驻留内存（比压缩
   文件大一个数量级），所以音乐关掉时把缓冲一起释放，下次开启重新拉取再解码。
   开关是同步布尔：点击立即翻转、UI 立即跟手，出声只是跟着状态走；点击路径上没有可悬挂的
   promise（解码异步落地后由 sync 接上）。开关与音量存 sessionStorage：页面内跳转、刷新都
   保持，关掉标签页才回到默认。 */
const MUSIC_SRC = '/bgm/garupa-pico-instrumental.m4a';
const STORE_KEY = 'moefighters.bgm';

/* 滑条按百分比走，但实际增益封顶 0.63（对齐 abfighters 的 setVolume(value/100*.63)），
   文件本体又预先降了 6 dB——音乐开到最大也压不过战斗音效。 */
const MAX_GAIN = 0.63;
const DEFAULT_VOLUME = 0.15;

function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULT_VOLUME;
}

const stored = (() => {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { enabled?: unknown; volume?: unknown };
    return { enabled: v.enabled === true, volume: clampVolume(Number(v.volume)) };
  } catch { /* 存不进或读不出（隐私模式等）就用默认 */ }
})();

let enabled = stored?.enabled ?? false;
let volume = stored?.volume ?? DEFAULT_VOLUME;

/* ctx 懒建，且只经 sync 在用户手势路径上建（自动播放策略的要求）；音乐关着的访客一个字节
   都不下载。 */
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
let pageSuspended = false;

function save(): void {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ enabled, volume })); } catch { /* 同上 */ }
}

function ensureCtx(): AudioContext | null {
  if (ctxBroken) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      gain = ctx.createGain();
      gain.gain.value = volume * MAX_GAIN;
      gain.connect(ctx.destination);
    } catch { ctxBroken = true; return null; /* 同 sfx：这台设备没有音频就算了 */ }
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
  if (!on) buffer = null; /* 解码后的 PCM 比压缩文件大一个数量级，音乐关着就不驻留内存 */
  sync(); /* 关：sync 收拾播放；开：借这次手势建 ctx、拉文件、接上 */
}

/** 每次用户手势调用：音乐开着但还没出声（刷新后恢复、被自动播放策略拒过、解码刚落地）
   就在这里接上；已经出声则什么都不做。 */
export function pokeMusic(): void {
  if (!enabled) return;
  sync();
}

export function setMusicVolume(v: number): void {
  volume = clampVolume(v);
  save();
  if (gain) gain.gain.value = volume * MAX_GAIN;
}

/** 切到后台/回前台：音乐跟着停与续，不在看不见的标签页里出声。 */
export function setMusicSuspended(suspended: boolean): void {
  pageSuspended = suspended;
  sync();
}
