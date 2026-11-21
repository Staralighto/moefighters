/* 音乐库：左边一台唱机（封套 + 半露的黑胶 + 唱臂），右边曲目表。直接驱动 audio/bgm.ts 的那一个播放器：
   这里点的歌就是全站当前的 BGM，退出页面继续放，播放方式与设置页共用，不另开音源。

   动效：
   - 进页：唱片保持半露，随整页渐入。
   - 换曲：唱臂抬起 → 黑胶滚回封套 → 新封面从左往右揭开 → 黑胶滚出 → 真正出声时唱臂落下。连点会直接截断重来。
   - 播放：黑胶匀速转（1.8 秒一圈，33⅓ 转），高光不跟着转；暂停时唱臂抬起、黑胶慢慢减速停下。
   - 封面几何随低频能量很轻地起伏，背后一大块色面跟着当前曲目换色。 */

import { reducedMotion } from './motion.ts';
import { cycleMusicOrder, musicEnabled, musicIndex, musicLevel, musicLoading, musicOrder, musicPlaying, musicPosition, musicTracks, musicVolume, onMusicChange, playTrack, pokeMusic, seekMusic, setMusicEnabled, setMusicOrder, setMusicVolume, stepMusic, type MusicOrder } from '../audio/bgm.ts';
import { coverHTML, coverLook } from './cover.ts';
import { assetUrl, netTask } from '../assets/loader.ts';
import { appendHubItems, registerHubPage } from './hub.ts';

const ORDER_NAMES: Record<MusicOrder, string> = { seq: '列表循环', shuffle: '随机播放', one: '单曲循环' };
/* 播放方式图标：24 网格、2px 描边、圆头，和控件里的 Phosphor 图标同一粗细观感。 */
const LOOP = '<path d="M17 2.5 20 5.5 17 8.5"/><path d="M4 11.5V10a4.5 4.5 0 0 1 4.5-4.5H20"/><path d="M7 21.5 4 18.5 7 15.5"/><path d="M20 12.5V14a4.5 4.5 0 0 1-4.5 4.5H4"/>';
export const ORDER_ICONS: Record<MusicOrder, string> = {
  seq: LOOP,
  shuffle: '<path d="M16 3.5h4.5V8"/><path d="M4 19.5 20.5 3.5"/><path d="M20.5 16v4.5H16"/><path d="M14.5 14.5l6 6"/><path d="M4 4.5l5.5 5.5"/>',
  one: LOOP + '<path d="M11 10.2 12.4 9.2V14.8"/>',
};
const orderIcon = (o: MusicOrder) => `<svg class="mp-oi" viewBox="0 0 24 24" aria-hidden="true">${ORDER_ICONS[o]}</svg>`;
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const reduced = reducedMotion;
const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const icon = (id: string) => `<svg class="btn-icon" viewBox="0 0 256 256" aria-hidden="true"><use href="#${id}"/></svg>`;

/* 时长：解码前不知道，用媒体元素只读文件头拿到，按需探一次。 */
const durations = new Map<number, number>();
let nextDuration = 0;
let probing = false;
function probeDurations(): void {
  if (probing) return;
  const list = musicTracks();
  const next = () => {
    while (nextDuration < list.length && durations.has(nextDuration)) nextDuration++;
    if (!open || nextDuration >= list.length) { probing = false; return; }
    const k = nextDuration++;
    // 后台车道：只读文件头，但仍排在图片后面，不和眼前的图抢。地址必须过 assetUrl（Toy 的相对 base）。
    void netTask(`meta:${list[k].src}`, 2, () => new Promise<void>(settle => {
      const a = new Audio();
      a.preload = 'metadata';
      const done = () => { a.onloadedmetadata = a.onerror = null; a.removeAttribute('src'); a.load(); settle(); };
      a.onloadedmetadata = () => { if (Number.isFinite(a.duration)) saveDuration(k, a.duration); done(); };
      a.onerror = done;
      a.src = assetUrl(list[k].src);
    })).then(next, next);
  };
  probing = true;
  next();
}

let root: HTMLElement;
let q: <T extends HTMLElement = HTMLElement>(sel: string) => T;
let open = false;
let raf = 0;
let shownIndex = -1;
let spin: Animation | null = null;
let coverMotion: Animation | null = null;
let rate = 0;
let swapJob = 0;
/* 正在换过去的那首，换曲途中的重复通知不重新开始。 */
let swapping = -1;
let unsub: (() => void) | null = null;
let durationCells: NodeListOf<HTMLElement> | undefined;

function rowHTML(t: ReturnType<typeof musicTracks>[number], i: number): string {
  return `<li style="--n:${i}"><button type="button" class="mp-row" data-i="${i}">`
    + `<span class="mp-n">${String(i + 1).padStart(2, '0')}</span>`
    + '<span class="mp-eq" aria-hidden="true"><i></i><i></i><i></i></span>'
    + `<span class="mp-t"><b>${esc(t.title)}</b>${t.from ? `<small>${esc(t.from)}</small>` : ''}</span>`
    + `<span class="mp-d" data-d="${i}">--:--</span></button></li>`;
}

function mount(host: HTMLElement): void {
  root = host;
  q = <T extends HTMLElement = HTMLElement>(sel: string) => host.querySelector(sel) as T;
  const count = musicTracks().length;
  host.innerHTML = `<div class="mp">
  <section class="mp-deck" data-scheme="dark" aria-label="唱机">
    <i class="mp-glow" aria-hidden="true"></i>
    <div class="mp-table">
      <div class="mp-vinyl" aria-hidden="true"><div class="mp-roll"><div class="mp-disc"><div class="mp-label"><b></b><i></i></div></div></div><i class="mp-sheen"></i></div>
      <div class="mp-sleeve" aria-hidden="true"><div class="mp-cover mp-old"></div><div class="mp-cover mp-new"></div></div>
      <svg class="mp-arm" viewBox="0 0 50 90" aria-hidden="true"><g class="mp-arm-g"><circle class="mp-pivot" cx="40" cy="8" r="5.5"/><path class="mp-rod" d="M40 8 L40 52 L16 66"/><rect class="mp-head" x="9" y="62" width="10" height="6" rx="1.5" transform="rotate(-30 14 65)"/></g></svg>
    </div>
    <div class="mp-info">
      <p class="mp-state"></p>
      <h3 class="mp-title"></h3>
      <p class="mp-from"></p>
      <div class="mp-progress"><div class="mp-bar" role="slider" aria-label="播放进度" tabindex="0"><i></i></div><span class="mp-time">00:00 / --:--</span></div>
      <div class="mp-controls">
        <button type="button" class="mp-step" data-step="-1" aria-label="上一首">${icon('i-caret-left')}</button>
        <button type="button" class="mp-play" aria-label="播放">${icon('i-play')}${icon('i-pause')}</button>
        <button type="button" class="mp-step" data-step="1" aria-label="下一首">${icon('i-caret-right')}</button>
        <span class="seg mp-order" role="radiogroup" aria-label="播放方式">${(['seq', 'shuffle', 'one'] as const).map(o => `<button type="button" role="radio" data-order="${o}" aria-label="${ORDER_NAMES[o]}" title="${ORDER_NAMES[o]}">${orderIcon(o)}</button>`).join('')}</span>
        <label class="mp-vol">${icon('i-speaker-high')}<input type="range" min="0" max="100" step="5" aria-label="音乐音量"></label>
      </div>
    </div>
  </section>
  <section class="mp-side" aria-label="曲目">
    <div class="mp-list-head"><b>曲目</b><small>TRACKLIST · ${count}</small></div>
    <ol class="mp-list"></ol>
  </section>
</div>`;
  q('.mp-list').onclick = e => {
    const row = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('.mp-row') : null;
    if (row) playTrack(Number(row.dataset.i));
  };
  for (const b of host.querySelectorAll<HTMLButtonElement>('.mp-step')) b.onclick = () => { stepMusic(Number(b.dataset.step) as -1 | 1); if (!musicEnabled()) setMusicEnabled(true); };
  q('.mp-play').onclick = () => setMusicEnabled(!musicEnabled());
  for (const b of host.querySelectorAll<HTMLButtonElement>('.mp-order button')) b.onclick = () => setMusicOrder(b.dataset.order as MusicOrder);
  q('.mp-order').ondblclick = () => setMusicOrder(cycleMusicOrder(musicOrder()));
  const vol = q<HTMLInputElement>('.mp-vol input');
  vol.oninput = () => { setMusicVolume(Number(vol.value) / 100); if (!musicEnabled() && Number(vol.value) > 0) setMusicEnabled(true); };
  const bar = q('.mp-bar');
  const seekAt = (x: number) => {
    const pos = musicPosition();
    if (!pos) return;
    const r = bar.getBoundingClientRect();
    seekMusic(Math.max(0, Math.min(1, (x - r.left) / r.width)) * pos.d);
  };
  bar.onpointerdown = e => { seekAt(e.clientX); };
  bar.onkeydown = e => {
    const pos = musicPosition();
    if (!pos || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    seekMusic(pos.t + (e.key === 'ArrowRight' ? 5 : -5));
  };
  spin = q('.mp-disc').animate([{ rotate: '0deg' }, { rotate: '360deg' }], { duration: 1800, iterations: Infinity });
  spin.playbackRate = 0;
  paintCover(musicIndex(), false);
}

function saveDuration(index: number, duration: number): void {
  if (durations.get(index) === duration) return;
  durations.set(index, duration);
  const cell = durationCells?.[index];
  if (cell) cell.textContent = mmss(duration);
  if (open && index === musicIndex()) scheduleTick();
}

/** 封面、标签、背景色面换成第 i 首。animate=false 时直接换。 */
function paintCover(i: number, animate: boolean): void {
  const t = musicTracks()[i];
  const look = coverLook(t.title);
  const deck = q('.mp-deck');
  deck.style.setProperty('--cv-main', look.main);
  deck.style.setProperty('--cv-accent', look.accent);
  q('.mp-label b').textContent = t.title;
  const html = coverHTML(t.title, i + 1);
  const oldC = q('.mp-old'), newC = q('.mp-new');
  coverMotion?.cancel();
  coverMotion = null;
  if (!animate) { oldC.innerHTML = html; newC.innerHTML = ''; shownIndex = i; return; }
  newC.innerHTML = html;
  const a = newC.animate([{ clipPath: 'inset(0 100% 0 0)', scale: 1.04 }, { clipPath: 'inset(0 0% 0 0)', scale: 1 }],
    { duration: 300, easing: 'cubic-bezier(.6, 0, .2, 1)' });
  coverMotion = a;
  a.onfinish = () => {
    if (coverMotion !== a) return;
    coverMotion = null;
    oldC.innerHTML = html;
    newC.innerHTML = '';
  };
  shownIndex = i;
}

/** 黑胶出 / 进封套。滚动：平移的同时转过「距离 ÷ 半径」那么多角度。 */
function slide(out: boolean, ms: number, delay = 0): Promise<void> {
  const vinyl = q('.mp-vinyl'), roll = q('.mp-roll');
  const dist = q('.mp-sleeve').offsetWidth * .5;
  const deg = dist / (vinyl.offsetWidth / 2) * 57.3;
  const from = out ? 0 : dist, to = out ? dist : 0;
  const ease = out ? 'cubic-bezier(.22, 1.2, .36, 1)' : 'cubic-bezier(.5, 0, .75, 0)';
  const opt: KeyframeAnimationOptions = { duration: ms, delay, easing: ease, fill: 'forwards' };
  vinyl.getAnimations().forEach(x => x.cancel());
  roll.getAnimations().forEach(x => x.cancel());
  const a = vinyl.animate([{ translate: `${from}px 0` }, { translate: `${to}px 0` }], opt);
  roll.animate([{ rotate: out ? '0deg' : `${deg}deg` }, { rotate: out ? `${deg}deg` : '0deg' }], opt);
  root.classList.toggle('mp-out', out);
  return a.finished.then(() => {}, () => {});
}

async function swapTo(i: number): Promise<void> {
  const job = ++swapJob;
  swapping = i;
  if (reduced()) { paintCover(i, false); swapping = -1; return; }
  q('.mp').classList.add('mp-swapping');
  await slide(false, 200);
  if (job !== swapJob) return;
  paintCover(i, true);
  await new Promise(r => setTimeout(r, 160));
  if (job !== swapJob) return;
  await slide(true, 360);
  if (job === swapJob) { q('.mp').classList.remove('mp-swapping'); swapping = -1; }
}

/** 状态同步：按钮、列表高亮、唱臂。逐帧的进度和律动在 tick 里。 */
function paint(): void {
  if (!root) return;
  const i = musicIndex(), t = musicTracks()[i];
  const on = musicEnabled(), playing = musicPlaying(), loading = on && !playing && musicLoading();
  const mp = q('.mp');
  mp.classList.toggle('mp-playing', playing);
  mp.classList.toggle('mp-loading', loading);
  q('.mp-state').textContent = playing ? 'NOW PLAYING' : loading ? 'LOADING…' : on ? '— 暂停 —' : 'PAUSED';
  q('.mp-title').textContent = t.title;
  q('.mp-from').textContent = t.from ?? '';
  q('.mp-play').setAttribute('aria-label', on ? '暂停' : '播放');
  q('.mp-play').classList.toggle('on', on);
  for (const b of root.querySelectorAll<HTMLButtonElement>('.mp-order button')) {
    const sel = b.dataset.order === musicOrder();
    b.classList.toggle('active', sel);
    b.setAttribute('aria-checked', String(sel));
  }
  q<HTMLInputElement>('.mp-vol input').value = String(Math.round(musicVolume() * 100));
  for (const b of root.querySelectorAll<HTMLButtonElement>('.mp-row')) {
    const cur = Number(b.dataset.i) === i;
    if (cur) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    b.classList.toggle('playing', cur && playing);
  }
  if (open && shownIndex !== i && swapping !== i) void swapTo(i);
  scheduleTick();
}

/* 逐帧要碰的节点在 mount 后取一次。 */
let els: { bar: HTMLElement; time: HTMLElement; deck: HTMLElement } | null = null;
let lastLevelAt = -Infinity;
let lastTime = '';
let lastLv = '';
let lastProgress = -1;

function scheduleTick(): void {
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick(now: number): void {
  raf = 0;
  if (!els) els = { bar: q('.mp-bar > i'), time: q('.mp-time'), deck: q('.mp-deck') };
  const playing = musicPlaying();
  /* 起转 0.4 秒到速，停转约 1 秒滑停。 */
  const target = playing ? 1 : 0;
  rate += (target - rate) * (playing ? .12 : .045);
  if (Math.abs(rate - target) < .004) rate = target;
  if (spin && spin.playbackRate !== rate) spin.playbackRate = rate;
  /* 停稳后由播放状态、进度调整或新时长唤醒。 */
  if (playing || rate > 0) scheduleTick();
  const pos = musicPosition();
  const index = musicIndex();
  if (pos && !durations.has(index)) saveDuration(index, pos.d);
  const progress = pos ? pos.t / pos.d : 0;
  if (progress !== lastProgress) { lastProgress = progress; els.bar.style.scale = `${progress} 1`; }
  const d = pos?.d ?? durations.get(index);
  const text = `${mmss(pos?.t ?? 0)} / ${d ? mmss(d) : '--:--'}`;
  if (text !== lastTime) { lastTime = text; els.time.textContent = text; }
  if (!playing || now - lastLevelAt >= 32) {
    lastLevelAt = now;
    const lv = (playing && !reduced() ? musicLevel() : 0).toFixed(2);
    if (lv !== lastLv) { lastLv = lv; els.deck.style.setProperty('--lv', lv); }
  }
}

function* enter(): Generator<void> {
  if (!durationCells) {
    const list = q('.mp-list');
    list.replaceChildren();
    yield* appendHubItems(list, musicTracks(), rowHTML);
    durationCells = root.querySelectorAll('.mp-d');
  }
  open = true;
  swapping = -1;
  q('.mp').classList.remove('mp-swapping');
  /* 点进音乐库本身就是手势：音乐开着却因自动播放被拦而没出声的，这里接上。 */
  pokeMusic();
  unsub ??= onMusicChange(paint);
  const i = musicIndex();
  if (shownIndex !== i) paintCover(i, false);
  rate = musicPlaying() ? 1 : 0;
  spin?.play();
  paint();
  /* 进页不演唱片套落下、唱片滑出：直接停在「唱片已滑出」的样子（motion.ts：进页面只做整页渐入）。切歌时的滑动照旧。 */
  q('.mp-sleeve').getAnimations().forEach(a => a.cancel());
  q('.mp-vinyl').getAnimations().forEach(a => a.cancel());
  root.classList.add('mp-out');
  q('.mp-vinyl').style.translate = `${q('.mp-sleeve').offsetWidth * .5}px 0`;
}

function leave(): void {
  if (!open) return;
  open = false;
  unsub?.();
  unsub = null;
  cancelAnimationFrame(raf);
  raf = 0;
  spin?.pause();
  if (coverMotion) { shownIndex = -1; coverMotion.cancel(); coverMotion = null; }
  if (swapping !== -1) {
    for (const el of root.querySelectorAll('.mp-vinyl, .mp-roll')) el.getAnimations().forEach(a => a.cancel());
  }
  swapJob++;
}

/** 选人页「音乐库」入口卡：在放歌时显示转着的小黑胶和曲名。 */
let tileTitle: string | null = null;
function paintTile(): void {
  const now = document.getElementById('bs-now');
  if (!now) return;
  const playing = musicPlaying();
  const title = playing ? musicTracks()[musicIndex()].title : '';
  if (tileTitle === title) return;
  tileTitle = title;
  now.classList.toggle('on', playing);
  now.innerHTML = playing ? `<i class="bs-disc" aria-hidden="true"></i><span>${esc(title)}</span>` : '';
}

export function bindMusicPage(): void {
  registerHubPage('music', { title: '音乐库', en: 'RECORDS', mount, enter, ready: probeDurations, leave, loading: { line: '调音中', en: 'SOUNDCHECK' } });
  onMusicChange(paintTile);
  paintTile();
}
