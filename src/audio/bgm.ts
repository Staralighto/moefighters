/* 站点 BGM：一条循环曲，选人和战斗共用。用 HTMLAudio 就够——不参与战斗音效的合成图。
   开关是同步布尔：点击立即翻转、UI 立即跟手，播放/暂停只是跟着状态走；点击路径上没有
   可悬挂的 promise。播放被自动播放策略拒绝时保持开启状态，由 pokeMusic 在下一次手势重试。
   开关与音量存 sessionStorage：页面内跳转、刷新都保持，关掉标签页才回到默认。 */
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

let el: HTMLAudioElement | null = null;
let enabled = stored?.enabled ?? false;
let volume = stored?.volume ?? DEFAULT_VOLUME;

function save(): void {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ enabled, volume })); } catch { /* 同上 */ }
}

function ensureEl(): HTMLAudioElement {
  if (!el) {
    el = new Audio(MUSIC_SRC);
    el.loop = true;
    el.volume = volume * MAX_GAIN;
    el.load();
  }
  return el;
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
  if (on) {
    const audio = ensureEl();
    audio.muted = false;
    void audio.play().catch(() => { /* 被拒：等下一次手势的 pokeMusic 重试 */ });
  } else {
    el?.pause();
  }
}

/** 每次用户手势调用：音乐开着才创建播放器（文件 4MB，关着的访客一个字节都不下载）；
   此前播放被拒时借这一次手势再试。首次开启的那次点击里 setMusicEnabled 已建好播放器。 */
export function pokeMusic(): void {
  if (!enabled) return;
  const audio = ensureEl();
  if (audio.paused) void audio.play().catch(() => {});
}

export function setMusicVolume(v: number): void {
  volume = clampVolume(v);
  save();
  if (el) el.volume = volume * MAX_GAIN;
}

/** 切到后台/回前台：音乐跟着暂停与恢复，不在看不见的标签页里继续出声。 */
export function setMusicSuspended(suspended: boolean): void {
  if (!el) return;
  if (suspended) el.pause();
  else if (enabled && el.paused) void el.play().catch(() => {});
}
