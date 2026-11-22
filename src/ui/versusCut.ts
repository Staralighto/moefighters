import { reducedMotion } from './motion.ts';
import type { CharacterData } from '../data/types.ts';
import type { FighterView } from '../render/view.ts';
import { previewFighter, type Fighter } from '../game/fighter.ts';
import { fitCanvasCached } from './canvasFit.ts';
import type { UiSound } from '../audio/sfx.ts';
import { portraitOf } from '../data/portraits.ts';
import { loadImage } from '../assets/loader.ts';

/* 开打过场: the cut between the select screen and the fight, laid out like a gig poster. Each side
   gets one big disc in its lead's colour; the cast stands on it at close to native sprite size, so
   the pixel art never gets blown up past what it can hold. The drama is type, the VS stamp and the
   timing. It leaves through a circular iris onto the fight, which is already running behind it.
   Purely a picture: the match itself is untouched.

   全身立绘（data/portraits.ts）：每边的人各一张半身，主角在前、搭档缩小压暗站在外侧后面。
   立绘到了就挂 .art：背景换成两条代表色斜带交叉（.vs-xband），色圆、像素小人和大剪影让位，只留名字；
   人物像拳皇那样从两侧滑进来。立绘加载失败就退回原来的色圆 + 小人版。 */

export interface VersusSides { left: CharacterData[]; right: CharacterData[] }

/** Design raster of one portrait; the CSS box letterboxes it (fitCanvas). */
const FIG_W = 320;
const FIG_H = 400;
const FIG_FOOT = 392;
const FIG_SCALE = 1.7;
/** ms the cut stays up before it may open onto the fight. */
const HOLD = 1350;
const HOLD_STILL = 450;
/** The lead's big silhouette inside each disc (desktop only, CSS hides it on narrow screens):
 *  a square raster the size of the disc, the figure drawn far larger than the disc so the circle
 *  crops it, feet below the rim, pushed toward the outer edge. A flat tint has no pixel detail to
 *  expose, so it can be this big. */
const GHOST = 400;
const GHOST_SCALE = 2.7;
const GHOST_FOOT = 452;
const GHOST_SHIFT = .14;
/** Silhouette tone: the signature colour pulled toward black, so it reads as a deeper shade of
 *  the (lightened) disc whatever the hue. */
const GHOST_DARKEN = .38;
const GHOST_ALPHA = .5;
/** ms of the closing iris. */
const OUT = 500;
/** Every cut is billed as the next show: a per-browser running number. */
const LIVE_KEY = 'mf-live-no';
/** ms into the entrance when VS lands; the slam sound is cued on it. */
const SLAM = 420;

const still = reducedMotion;
const $ = (id: string) => document.getElementById(id) as HTMLElement;

let raf = 0;
let shownAt = 0;
let open = false;
let timers: number[] = [];
/** Everything drawn on the cut is a still idle cell, so each canvas is painted once per backing
 *  size (`drawn` holds the size it was painted at) instead of every frame; the motion is all CSS. */
let figures: { canvas: HTMLCanvasElement; view: FighterView | undefined; f: Fighter; drawn: string }[] = [];
let ghosts: { canvas: HTMLCanvasElement; view: FighterView | undefined; f: Fighter; tint: string; facing: 1 | -1; drawn: string }[] = [];

/** Who stands on which half for a match's character list. */
export function versusSides(characters: CharacterData[], team: boolean): VersusSides {
  return team
    ? { left: characters.slice(0, 2), right: characters.slice(2, 4) }
    : { left: characters.slice(0, 1), right: characters.slice(1) };
}

function figureHTML(c: CharacterData): string {
  return `<figure class="vs-fighter"><canvas width="${FIG_W}" height="${FIG_H}"></canvas><figcaption><small>${c.title}</small><b>${c.name}</b><em>${c.id.toUpperCase()}</em></figcaption></figure>`;
}

/** 这一边有人没有立绘（交付表里没有）就整边不出立绘，留在色圆 + 小人版。 */
function artHTML(list: CharacterData[]): string {
  const arts = list.map(c => portraitOf(c.id));
  if (arts.some(a => !a)) return '';
  return `<div class="vs-art">${arts.map((a, i) => `<i class="vs-art-${i ? 'mate' : 'lead'}"><img alt="" data-src="${a!.src}" draggable="false"></i>`).reverse().join('')}</div>`;
}

function sideHTML(list: CharacterData[]): string {
  return `<div class="vs-disc"><div class="vs-ghost"><canvas width="${GHOST}" height="${GHOST}"></canvas></div><i class="vs-ring"></i><i class="vs-stripe"></i></div>${artHTML(list)}<div class="vs-cast">${list.map(figureHTML).join('')}</div>`;
}

/** 立绘全部到了才换成立绘版；有一张失败就留在小人版。 */
let artGen = 0;
function mountArt(half: HTMLElement): void {
  const imgs = [...half.querySelectorAll<HTMLImageElement>('.vs-art img')];
  half.classList.remove('art', 'art-ok');
  if (!imgs.length) return;
  half.classList.add('art');
  // 连开两次过场（再来一局很快）时，上一次晚到的图不能改这一次的状态。
  const gen = String(++artGen);
  half.dataset.artGen = gen;
  const current = () => half.dataset.artGen === gen;
  void Promise.all(imgs.map(img => loadImage(img.dataset.src!).then(im => { if (current()) img.src = im.src; })))
    .then(() => { if (current()) half.classList.add('art-ok'); })
    .catch(() => { if (current()) half.classList.remove('art'); });
}

/** #rrggbb mixed toward black by `k`. */
function darken(hex: string, k: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - k));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** #rrggbb mixed toward `to` (also #rrggbb) by `k`, as rgb(). */
function mix(hex: string, to: string, k: number): string {
  const p = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  if (!/^#?[0-9a-f]{6}$/i.test(hex)) return hex;
  const a = p(hex), b = p(to);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
}

/** 斜带的颜色：浅色角色（亮度 > .62）统一压暗约 24%，再做和必杀快切同款的同色深浅渐变（人物一端亮、远端暗）。 */
function bandFill(hex: string, dir: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  let base = hex;
  if (m) {
    const n = parseInt(m[1], 16);
    const l = (.2126 * ((n >> 16) & 255) + .7152 * ((n >> 8) & 255) + .0722 * (n & 255)) / 255;
    if (l > .62) base = '#' + [16, 8, 0].map(s => Math.round(((n >> s) & 255) * .76).toString(16).padStart(2, '0')).join('');
  }
  return `linear-gradient(${dir}, ${mix(base, '#ffffff', .18)} 0%, ${base} 40%, ${mix(base, '#000000', .35)} 100%)`;
}

/** LIVE No.0001, 0002…: counts up once per cut; storage failing just shows 0001. */
function nextLiveNo(): string {
  let n = 1;
  try {
    n = (Number(localStorage.getItem(LIVE_KEY)) || 0) + 1;
    localStorage.setItem(LIVE_KEY, String(n));
  } catch { /* private mode */ }
  return 'LIVE No.' + String(n % 10000).padStart(4, '0');
}

export function showVersus(sides: VersusSides, stageName: string, modeLabel: string, views: Map<string, FighterView>, cue: (k: UiSound) => void): void {
  const cut = $('vs-cut');
  timers.forEach(clearTimeout);
  timers = [];
  cancelAnimationFrame(raf);
  const lead = (list: CharacterData[]) => list[0]?.color ?? '#888888';
  for (const [id, list] of [['vs-left', sides.left], ['vs-right', sides.right]] as const) {
    const half = $(id);
    half.innerHTML = sideHTML(list);
    half.classList.toggle('duo', list.length > 1);
    half.style.setProperty('--c', lead(list));
    mountArt(half);
  }
  /* 双斜带对冲：每人一条代表色斜带，从自己头顶那一角斜贯全场，在 VS 处交叉。 */
  if (!cut.querySelector('.vs-xband')) cut.insertAdjacentHTML('afterbegin', '<i class="vs-xband l"></i><i class="vs-xband r"></i>');
  cut.querySelector<HTMLElement>('.vs-xband.l')!.style.background = bandFill(lead(sides.left), '90deg');
  cut.querySelector<HTMLElement>('.vs-xband.r')!.style.background = bandFill(lead(sides.right), '270deg');
  $('vs-stage').textContent = stageName;
  $('vs-mode').textContent = modeLabel;
  $('vs-live').textContent = nextLiveNo();
  $('vs-bar').style.width = '0%';
  cut.classList.remove('in', 'out', 'loading');
  cut.hidden = false;
  document.body.classList.add('vs-on');
  void cut.offsetWidth; // restart the entrance keyframes
  cut.classList.add('in');
  figures = [];
  const canvases = [...cut.querySelectorAll<HTMLCanvasElement>('.vs-fighter canvas')];
  const cast = [...sides.left.map(c => [c, 1] as const), ...sides.right.map(c => [c, -1] as const)];
  cast.forEach(([c, facing], i) => figures.push({ canvas: canvases[i], view: views.get(c.id), f: previewFighter(c, 0, facing), drawn: '' }));
  ghosts = [];
  for (const [id, list, facing] of [['vs-left', sides.left, 1], ['vs-right', sides.right, -1]] as const) {
    const c = list[0];
    const canvas = $(id).querySelector<HTMLCanvasElement>('.vs-ghost canvas');
    if (c && canvas) ghosts.push({ canvas, view: views.get(c.id), f: previewFighter(c, 0, facing), tint: darken(c.color, GHOST_DARKEN), facing, drawn: '' });
  }
  shownAt = performance.now();
  open = true;
  cue('whoosh');
  if (!still()) timers.push(window.setTimeout(() => cue('vs'), SLAM));
  raf = requestAnimationFrame(draw);
}

/** Resolves once the cut has been on screen long enough to read. */
export function versusHeld(): Promise<void> {
  const left = (still() ? HOLD_STILL : HOLD) - (performance.now() - shownAt);
  return new Promise(resolve => window.setTimeout(resolve, Math.max(0, left)));
}

/** The fight's loading fraction. The bar only shows while there is something to wait for. */
export function versusProgress(fraction: number): void {
  if (!open) return;
  const cut = $('vs-cut');
  cut.classList.toggle('loading', fraction < .999);
  $('vs-bar').style.width = `${Math.round(fraction * 1000) / 10}%`;
}

/** Wipe the halves apart onto whatever is behind (the fight, already running). */
export function hideVersus(): void {
  if (!open) return;
  open = false;
  const cut = $('vs-cut');
  cut.classList.remove('loading');
  cut.classList.add('out');
  timers.push(window.setTimeout(() => {
    cancelAnimationFrame(raf);
    cut.hidden = true;
    cut.classList.remove('in', 'out');
    document.body.classList.remove('vs-on');
    figures = [];
    ghosts = [];
  }, still() ? 180 : OUT));
}

/** Paint `fig` once per backing size; skipped (and retried next frame) until its picture is ready. */
function paint(fig: { canvas: HTMLCanvasElement; view: FighterView | undefined; drawn: string }, w: number, h: number, body: (ctx: CanvasRenderingContext2D, k: number) => void): void {
  const ctx = fig.canvas.getContext('2d');
  const k = fitCanvasCached(fig.canvas, w, h);
  if (!ctx || k === null || !fig.view) return;
  if (fig.view.idleReady && !fig.view.idleReady()) return;
  const sig = `${fig.canvas.width}x${fig.canvas.height}`;
  if (fig.drawn === sig) return;
  fig.drawn = sig;
  ctx.clearRect(0, 0, fig.canvas.width, fig.canvas.height);
  ctx.save();
  body(ctx, k);
  ctx.restore();
}

function draw(): void {
  for (const fig of figures) {
    paint(fig, FIG_W, FIG_H, (ctx, k) => {
      ctx.translate(FIG_W / 2 * k, FIG_FOOT * k);
      ctx.scale(FIG_SCALE * k, FIG_SCALE * k);
      fig.view!.draw(ctx, fig.f, 0, 0, 1);
    });
  }
  for (const g of ghosts) {
    paint(g, GHOST, GHOST, (ctx, k) => {
      // Pushed toward the outer rim: left side leans left, right side leans right.
      ctx.translate(GHOST * (.5 - g.facing * GHOST_SHIFT) * k, GHOST_FOOT * k);
      ctx.scale(GHOST_SCALE * k, GHOST_SCALE * k);
      g.view!.draw(ctx, g.f, 0, 0, GHOST_ALPHA, g.tint);
    });
  }
  raf = requestAnimationFrame(draw);
}
