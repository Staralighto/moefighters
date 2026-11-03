import type { Effect } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import type { Fighter } from '../game/fighter.ts';
import { H, W, clamp } from '../game/constants.ts';
import { CELL, heartTier, SHADOW_CELLS, SHADOW_LET, SHADOW_SCALE, YOMOGI_BODY, YOMOGI_CHEST, YOMOGI_EYE } from './clips.ts';
import { TAU, burst, hash, sparkle, stampText } from './fxParticles.ts';

/* 矢仓蓬咲 — 脑子里是番长，身体是底层人类. Two registers, never mixed on one shape:
   - her heart: a cartoon heart on her chest that will not calm down, in a frightened red (#ff4d6d), with low
     teal rings along the floor on every beat (she is the bassist — the heartbeat is her bass line);
   - the 不良漫画 in her head: black ink, white paper, halftone, speed lines, ゴゴゴ and big onomatopoeia.
   Teal (#448888, mint #9fe3e0) is her own colour and only ever marks her. Every shape is one flat subject that
   reads from across the screen; the effects that run all match long (the heart, the rings, ゴゴゴ) stay small and
   soft so they never tire the eye. Pure drawing: positions and timing come from the effect or the fighter. */

/** Painted under every body: the floor rings, the radar sweep, the shadow pooling up. */
export const YOMOGI_BACK: readonly string[] = ['yomogi-thump', 'yomogi-radar', 'yomogi-rise', 'yomogi-banchou', 'yomogi-cord'];
/** Screen space, behind every body: the manga speed lines while the shadow fights. */
export const YOMOGI_SCREEN_BACK: readonly string[] = ['yomogi-focus'];
/** Screen space, over everything: the one-frame halftone on a slap. */
export const YOMOGI_SCREEN_FRONT: readonly string[] = ['yomogi-tone'];

const TEAL = '#448888';
const MINT = '#9fe3e0';
const RED = '#ff4d6d';
const INK = '#0b1b1d';
const PAPER = '#fbfbf6';
/** What each punch says, faster and faster. */
const PANEL_WORDS = ['咚！', '咚！', '咚咚！', '咚咚咚！', '咚咚咚咚！'] as const;

const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
/** A pop: overshoots to ~1.18 and settles at 1. */
const pop = (k: number) => { const c = 2.4; const u = clamp(k, 0, 1) - 1; return 1 + (c + 1) * u * u * u + c * u * u; };

/** Manga lettering: black ink with a paper outline, or a colour fill. Cached by stampText. */
function ink(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill = INK, line = PAPER): void {
  if (stampText(ctx, text, x, y, size, fill, line) !== -1) return;
  ctx.font = `900 ${Math.round(size)}px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * .2);
  ctx.strokeStyle = line;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}
/** Lettering turned by `rot` about its centre. */
/** Lettering turned by `rot` and grown by `scale` about its centre. The stamp is always made at `size`: a pop or a
 *  pump goes through the transform, so an animated word is one cached stamp, not a new one every frame (stampText
 *  keys on the rounded size and its cache is shared by every character). The transform is undone by hand. */
function inkAt(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, rot: number, fill = INK, line = PAPER, scale = 1): void {
  if (!(size > 0) || !(scale > 0)) return;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (scale !== 1) ctx.scale(scale, scale);
  ink(ctx, text, 0, 0, size, fill, line);
  if (scale !== 1) ctx.scale(1 / scale, 1 / scale);
  if (rot) ctx.rotate(-rot);
  ctx.translate(-x, -y);
}

/** The cartoon heart, point down, centred on (x, y). */
function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + size * .9);
  ctx.bezierCurveTo(x - size * 1.4, y - size * .1, x - size * .6, y - size * 1.2, x, y - size * .35);
  ctx.bezierCurveTo(x + size * .6, y - size * 1.2, x + size * 1.4, y - size * .1, x, y + size * .9);
  ctx.closePath();
}
/** Filled heart with an ink rim and one highlight. */
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill = RED): void {
  if (!(size > 0)) return;
  heartPath(ctx, x, y, size);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, size * .18);
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.beginPath();
  ctx.ellipse(x - size * .45, y - size * .35, size * .22, size * .14, -.6, 0, TAU);
  ctx.fill();
}
/** The heart again, baked once at 2× and blitted: for the many small ones (burst shards, beat hearts, the cord's pulse). */
const HEART_UNIT = 16;
let heartBake: HTMLCanvasElement | null | undefined;
function heartQuick(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  if (!(size > 0)) return;
  if (heartBake === undefined) {
    heartBake = null;
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = HEART_UNIT * 3.4 * 2;
      c.height = HEART_UNIT * 2.8 * 2;
      const g = c.getContext('2d');
      if (g) { g.scale(2, 2); heart(g, HEART_UNIT * 1.7, HEART_UNIT * 1.5, HEART_UNIT); heartBake = c; }
    }
  }
  if (!heartBake) { heart(ctx, x, y, size); return; }
  ctx.drawImage(heartBake, x - size * 1.7, y - size * 1.5, size * 3.4, size * 2.8);
}
/** A drop (sweat or tears): round at the bottom, a point on top. */
function drop(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  if (!(r > 0)) return;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 2);
  ctx.quadraticCurveTo(x + r * 1.1, y - r * .4, x + r, y);
  ctx.arc(x, y, r, 0, Math.PI);
  ctx.quadraticCurveTo(x - r * 1.1, y - r * .4, x, y - r * 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
}
/** Manga speed lines: `n` ink spokes round (x, y) between r0 and r1. */
function speedLines(ctx: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, n: number, seed: number, width = 3, color = INK): void {
  if (!(r1 > r0)) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i + hash(seed, i) * .6) / n * TAU;
    const a0 = r0 * (.85 + hash(seed + 7, i) * .3);
    const c = Math.cos(a), s = Math.sin(a);
    const w = width * (.6 + hash(seed + 3, i) * .8);
    ctx.moveTo(x + c * a0 - s * w, y + s * a0 + c * w);
    ctx.lineTo(x + c * r1, y + s * r1);
    ctx.lineTo(x + c * a0 + s * w, y + s * a0 - c * w);
    ctx.closePath();
  }
  ctx.fill();
}
/** A zigzag arc of current: centre (x, y), radius r, spanning the half-circle toward `dir`. */
function zigzag(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, dir: number, seed: number, jag: number): void {
  if (!(r > 0)) return;
  const n = 14;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    const rr = r + (i % 2 ? jag : -jag) * (.6 + hash(seed, i) * .8);
    const px = x + dir * Math.cos(a) * rr, py = y + Math.sin(a) * rr * .9;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.stroke();
}
/** An open hand: palm and five fingers, fingers pointing up at rot 0. */
/** The five fingers: base (x, y) on the palm, length, and lean — in units of the hand size. */
const FINGERS: readonly (readonly [number, number, number, number])[] = [[-.48, -.25, .5, -.55], [-.2, -.42, .62, -.12], [.08, -.46, .66, .05], [.34, -.38, .56, .22], [.68, .1, .42, .95]];
/** An open hand, fingers up at rot 0: the palm and five rotated ellipses in one path, one fill. */
function hand(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number): void {
  if (!(s > 0)) return;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, s * .25, s * .62, s * .58, 0, 0, TAU);
  for (const [fx, fy, len, ang] of FINGERS) {
    const half = len * s * .5, rx = s * .15;
    const cx = fx * s + Math.sin(ang) * half, cy = fy * s - Math.cos(ang) * half;
    // Start each finger on its own outline, so no joining edge is filled.
    ctx.moveTo(cx + Math.cos(ang) * rx, cy + Math.sin(ang) * rx);
    ctx.ellipse(cx, cy, rx, len * s * .55, ang, 0, TAU);
  }
  ctx.fill();
  ctx.rotate(-rot);
  ctx.translate(-x, -y);
}

/* ---- the heart, every frame ---- */

/** 爆表's closing dark: clear inside, dark at the rim, at unit radius (inner edge 90 / 210 of it). Built once per context. */
const darks = new WeakMap<CanvasRenderingContext2D, CanvasGradient>();
function closingDark(ctx: CanvasRenderingContext2D): CanvasGradient {
  let g = darks.get(ctx);
  if (!g) {
    g = ctx.createRadialGradient(0, 0, 90 / 210, 0, 0, 1);
    g.addColorStop(0, 'rgba(4,10,12,0)');
    g.addColorStop(1, 'rgba(4,10,12,1)');
    darks.set(ctx, g);
  }
  return g;
}

/** 失控 and up: ゴゴゴ hangs in the air behind her (she is terrified; it reads as killing intent), and at 爆表 a soft
 *  dark ring closes in round her on every beat. Drawn before her body. */
export function drawHeartBack(ctx: CanvasRenderingContext2D, f: Fighter, age: number, lite = false): void {
  if (f.hp <= 0) return;
  const tier = heartTier(f.gauge);
  if (tier < 2) return;
  const pump = Math.exp(-f.heartPhase * 9);
  ctx.save();
  if (tier === 3 && !lite) {
    // One gradient per context, built at unit size: the pump moves only the transform and the alpha.
    const r1 = 210 - pump * 18;
    ctx.save();
    ctx.translate(f.x, f.y - 100);
    ctx.scale(r1, r1);
    ctx.globalAlpha = .16 + pump * .08;
    ctx.fillStyle = closingDark(ctx);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  const n = tier === 3 && !lite ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const drift = ((age * .35 + hash(i, 2)) % 1);
    const x = f.x - f.facing * (34 + i * 16 + Math.sin(age * 3 + i) * 3);
    const y = f.y - 132 - i * 24 - drift * 18;
    ctx.globalAlpha = (.55 + .3 * pump) * Math.sin(drift * Math.PI);
    inkAt(ctx, 'ゴ', x, y, 22 + i * 3, -.18 * f.facing + Math.sin(age * 4 + i) * .06, INK, PAPER, 1 + pump * .12);
  }
  ctx.restore();
}

/** The heart on her chest, and the tear at 失控. Drawn after her body. Its shape walks the four tiers:
 *  平静 a small steady beat; 紧张 wrung like a rag; 失控 it jumps out of her chest on each beat; 爆表 it swells and cracks. */
export function drawHeartFront(ctx: CanvasRenderingContext2D, f: Fighter, age: number, images?: ImageCache): void {
  if (f.hp <= 0) return;
  // She is on screen: have the super's shadow cells baked in idle time before it is ever cast.
  warmShadow(images);
  const max = f.data.gauge?.max ?? 100;
  const tier = heartTier(f.gauge);
  const pump = Math.exp(-f.heartPhase * 9);
  const dir = f.facing;
  let x = f.x + dir * YOMOGI_CHEST.x, y = f.y - YOMOGI_CHEST.y;
  let size = (7 + tier) * (1 + .22 * pump);
  ctx.save();
  if (tier === 2) {
    // 「心脏都要被吓得蹦出来了」: out in front of her on the beat, back in between.
    const out = pump * 16;
    x += dir * out;
    y -= out * .55;
    size *= 1 + .5 * pump;
    if (pump > .2) {
      ctx.globalAlpha = pump * .7;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      for (let k = -1; k <= 1; k += 2) {
        ctx.beginPath();
        ctx.moveTo(x - dir * 10, y + k * 8);
        ctx.lineTo(x - dir * 18, y + k * 13);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  } else if (tier === 3) {
    size *= 1 + .5 * clamp((f.gauge / max * 100 - 85) / 15, 0, 1) + .25 * pump;
  }
  ctx.translate(x, y);
  if (tier === 1) ctx.rotate(Math.sin(age * 9) * .18 + pump * .15 * dir);
  heart(ctx, 0, 0, size);
  if (tier === 1) {
    // 「像抹布一样被拧紧了」: three wring lines across it.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-size * .9, i * size * .38 - size * .3);
      ctx.quadraticCurveTo(0, i * size * .38 + size * .1, size * .9, i * size * .38 - size * .1);
      ctx.stroke();
    }
  } else if (tier === 3) {
    // Cracks grow toward the top of the gauge; the rim flickers white on the beat.
    const cracks = 1 + Math.floor(clamp((f.gauge / max * 100 - 85) / 15, 0, .99) * 4);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < cracks; i++) {
      const a = -1.9 + i * .95;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * size * .45, Math.sin(a) * size * .45 + 2);
      ctx.lineTo(Math.cos(a + .3) * size * .85, Math.sin(a + .3) * size * .8);
      ctx.stroke();
    }
    if (pump > .3) {
      ctx.globalAlpha = pump;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      heartPath(ctx, 0, 0, size * 1.12);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
  // 咚 — one per tier, beside the heart, only right after a beat.
  if (tier >= 1 && pump > .12) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, pump * 1.6);
    const word = tier === 1 ? '咚咚' : tier === 2 ? '咚咚咚' : '咚咚咚咚';
    const tilt = (f.heartBeats % 2 ? -.14 : .1) * (tier === 3 ? 1.8 : 1);
    inkAt(ctx, word, x + dir * (30 + tier * 6), y - 26 - tier * 3, 12 + tier * 3, tilt, RED, PAPER, 1 + pump * .2);
    ctx.restore();
  }
  // 失控 and up: a tear at the eye (she is crying behind the killing intent).
  if (tier >= 2) {
    const ex = f.x + dir * YOMOGI_EYE.x, ey = f.y - YOMOGI_EYE.y;
    const fall = (age * 26) % 16;
    ctx.save();
    ctx.globalAlpha = 1 - fall / 16;
    drop(ctx, ex + dir * 2, ey + 8 + fall, 2.6, '#bfe8ff');
    ctx.restore();
  }
}

/* ---- the shadow 番长 (想象吧，变强的我) ---- */

/** Her two sheets: the shadow is drawn from the very cell the script names, keyed, inked and rimmed. */
const SHEET_SRC = { common: '/sprites/yomogi/common.png', special: '/sprites/yomogi/special.png' } as const;
/** How much of her art shows through the ink, like 蕾叶's family (FAMILY_SHOW .35) but darker: a shadow. */
const INK_SHOW = .2;
const RIM = '#8ff5e4';
const AURA = '#2fb8a4';
/** The glow bake is this much wider than the cell, so the aura (1.12×) fits round the rim (1.035×). */
const GLOW_PAD = 1.2;
/** One cell, baked once into the two pictures the shadow draws every frame: the art with the ink wash over it
 *  (`inked`), and the mint rim with the teal aura round it (`glow`, GLOW_PAD × the cell). `top` / `headX` say where
 *  the head is in the cell, for the headband and the eye.
 *  ponytail: per cell, not per sheet — the super uses the six SHADOW_POSES cells only (~0.6 MB each), instead of
 *  tinted 2048-wide sheets. Keyed by the image object (a WeakMap), so a reloaded sheet drops the old bakes. */
interface CellBake { inked: HTMLCanvasElement; glow: HTMLCanvasElement; top: number; headX: number }
const bakes = new WeakMap<HTMLImageElement, (CellBake | null | undefined)[]>();
function canvasOf(w: number, h = w): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
/** The cell with its colour painted over every opaque pixel (source-atop), on a fresh canvas. */
function tinted(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = canvasOf(CELL);
  const g = c.getContext('2d');
  if (g) { g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = color; g.fillRect(0, 0, CELL, CELL); }
  return c;
}
function bakeCell(im: HTMLImageElement, sheet: 'common' | 'special', col: number, row: number): CellBake | null {
  // A half-size lite sheet maps onto the same grid.
  const k = im.naturalWidth / (sheet === 'special' ? CELL * 4 : CELL * 8);
  const read = canvasOf(CELL);
  const g = read.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(im, col * CELL * k, row * CELL * k, CELL * k, CELL * k, 0, 0, CELL, CELL);
  const data = g.getImageData(0, 0, CELL, CELL);
  const px = data.data;
  let top = -1, sum = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gv = px[i + 1], b = px[i + 2];
    // The same cut as fx.ts keyed(): the chroma green, the placeholder's sheet colour and its magenta grid.
    if ((gv > 240 && r < 20 && b < 20) || (Math.abs(r - 26) <= 3 && Math.abs(gv - 21) <= 3 && Math.abs(b - 40) <= 3)
      || (Math.abs(r - 255) <= 8 && Math.abs(gv - 54) <= 12 && Math.abs(b - 200) <= 12)) { px[i + 3] = 0; continue; }
    if (px[i + 3] < 60) continue;
    const y = (i >> 2) / CELL | 0;
    if (top < 0) top = y;
    if (y < top + 22) { sum += (i >> 2) % CELL; n++; }
  }
  if (top < 0) return null;
  // The keyed cell goes onto a plain (GPU-backed) canvas; the read-back canvas is dropped with this frame.
  const art = canvasOf(CELL);
  art.getContext('2d')?.putImageData(data, 0, 0);
  const inked = canvasOf(CELL);
  const ig = inked.getContext('2d');
  if (ig) { ig.drawImage(art, 0, 0); ig.globalAlpha = 1 - INK_SHOW; ig.drawImage(tinted(art, '#071618'), 0, 0); }
  const G = Math.round(CELL * GLOW_PAD);
  const glow = canvasOf(G);
  const gg = glow.getContext('2d');
  if (gg) {
    const at = (img: HTMLCanvasElement, scale: number, alpha: number) => { const s = CELL * scale; gg.globalAlpha = alpha; gg.drawImage(img, (G - s) / 2, (G - s) / 2, s, s); };
    at(tinted(art, AURA), 1.12, .4);
    at(tinted(art, RIM), 1.035, 1);
  }
  return { inked, glow, top, headX: n ? sum / n : CELL / 2 };
}
function cellOf(im: HTMLImageElement, sheet: 'common' | 'special', col: number, row: number): CellBake | null {
  let list = bakes.get(im);
  if (!list) bakes.set(im, list = []);
  const i = col + row * 8;
  let b = list[i];
  if (b === undefined) list[i] = b = typeof document === 'undefined' || !im.naturalWidth ? null : bakeCell(im, sheet, col, row);
  return b;
}
/** Bake the super's six cells ahead of time, one per idle slice, as soon as her sheets are in — so the first super
 *  never stops a frame to read pixels back. Started from drawHeartFront (she is on screen, the sheets are loading). */
const warming = new WeakSet<HTMLImageElement>();
const SHEETS = ['common', 'special'] as const;
const idle = (cb: () => void) => typeof requestIdleCallback === 'function' ? requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 50);
/** Run the jobs one per idle slice. */
function inIdle(jobs: (() => void)[]): void {
  let i = 0;
  const next = () => { const job = jobs[i++]; if (!job) return; job(); idle(next); };
  idle(next);
}
/** Her words at the sizes they are stamped at (inkAt scales by transform, so these are all the keys there are). */
const WORDS: readonly [string, number, string][] = [
  ['咚咚', 15, RED], ['咚咚咚', 18, RED], ['咚咚咚咚', 21, RED], ['心脏要炸开了——！！', 20, RED], ['被发现了！', 17, INK], ['呀——！', 17, INK],
  ['啪——！！', 21, INK], ['啪——！！', 26, RED], ['咚！', 21, INK], ['呀——！？', 19, INK], ['啪————！！', 30, RED], ['！！', 20, RED],
  ...[0, 1, 2, 3].map(n => ['呀————！！', 17 + n * 2, INK] as [string, number, string]),
  ...PANEL_WORDS.map((w, n) => [w, 22 + n * 1.5, INK] as [string, number, string]),
  ...[...'脑内番长参上'].map(c => [c, 22, INK] as [string, number, string]),
  ...[0, 1, 2, 3, 4].map(i => ['ゴ', 22 + i * 3, INK] as [string, number, string]),
];
let warmedArt = false;
/** Everything the super and her loud moves bake on first use, done ahead in idle slices instead: the six shadow
 *  cells per sheet image as soon as it is in, and once, the halftone, the panels and her words. */
function warmShadow(images: ImageCache | undefined): void {
  if (!images || typeof document === 'undefined') return;
  if (!warmedArt) {
    warmedArt = true;
    const probe = document.createElement('canvas').getContext('2d');
    const jobs: (() => void)[] = [() => { toneOf(); }];
    for (const big of [false, true]) for (let n = 0; n <= 5; n++) for (const dir of [-1, 1]) if (big === (n === 5)) jobs.push(() => { panelOf(big, n, dir, false); });
    if (probe) jobs.push(() => { for (const [w, size, fill] of WORDS) stampText(probe, w, 0, 0, size, fill, PAPER); });
    inIdle(jobs);
  }
  for (const sheet of SHEETS) {
    const im = images.get(SHEET_SRC[sheet]);
    if (!im?.naturalWidth || warming.has(im)) continue;
    // Each sheet image is queued once; a reloaded sheet is a new image and is queued again.
    warming.add(im);
    inIdle(SHADOW_CELLS.filter(c => c[0] === sheet).map(c => () => { cellOf(im, sheet, c[1], c[2]); }));
  }
}
/** Where inkFigure found the head, in its local frame. Reused: one shadow is drawn at a time. */
const HEAD = { x: 0, y: 0 };
/** The shadow figure at the origin (feet), facing +x, `h` tall: the glow bake ('lighter'), then the inked bake.
 *  Two blits. Returns the head in local coordinates (for the headband and the eye). */
function inkFigure(ctx: CanvasRenderingContext2D, cb: CellBake | null, h: number, lift: number, alpha: number, flare: number, trail: boolean): typeof HEAD {
  if (!cb) {
    // Until the sheet is in: a plain ink figure, so the move still reads.
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#0d2427';
    ctx.fillRect(-12, -h * .66, 24, h * .4);
    ctx.fillRect(-11, -h * .28, 8, h * .28);
    ctx.fillRect(3, -h * .28, 8, h * .28);
    ctx.beginPath(); ctx.arc(0, -h * .78, h * .09, 0, TAU); ctx.fill();
    HEAD.x = 0; HEAD.y = -h * .86;
    return HEAD;
  }
  ctx.imageSmoothingEnabled = true;
  if (!trail) {
    const G = h * GLOW_PAD;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * (.7 + .3 * flare);
    ctx.drawImage(cb.glow, -G / 2, -lift - h / 2 - G / 2, G, G);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = alpha;
  ctx.drawImage(cb.inked, -h / 2, -lift - h, h, h);
  HEAD.x = (cb.headX / CELL - .5) * h;
  HEAD.y = -lift - h + (cb.top / CELL) * h;
  return HEAD;
}

/** 想象吧，变强的我's shadow, every frame. Its clock is `age` and `until` (both kept by the host, both on the wire):
 *  rising for the first .38 s, holding after the move lets go, then sinking. */
function drawBanchou(ctx: CanvasRenderingContext2D, e: Effect, lite: boolean, images?: ImageCache): void {
  const el = e.age ?? 0;
  const dir = e.dir ?? 1;
  const h = YOMOGI_BODY.height * SHADOW_SCALE, lift = YOMOGI_BODY.lift * SHADOW_SCALE;
  const rise = ease(el / .38);
  const gone = (e.until ?? -1) >= 0 ? el - (e.until ?? 0) - SHADOW_LET.hold : -1;
  const sink = gone > 0 ? clamp(gone / SHADOW_LET.sink, 0, 1) : 0;
  const alpha = 1 - sink * sink;
  if (alpha <= 0) return;
  const since = (e.t0 ?? -1) >= 0 ? el - (e.t0 ?? 0) : 9;
  const big = !!e.heavy;
  const punch = since < .16 ? Math.sin(since / .16 * Math.PI) : 0;
  const flare = Math.max(punch * (big ? 1 : .8), 1 - rise);
  const sx = 1 + punch * (big ? .2 : .12), sy = (1 - punch * .09) * (1 - sink * .5);
  const sheet = e.sheet === 'special' ? 'special' : 'common';
  const im = images?.get(SHEET_SRC[sheet]);
  const cb = im?.naturalWidth ? cellOf(im, sheet, e.col ?? 0, e.row ?? 0) : null;
  ctx.save();
  // Still joined to her feet: an ink band along the floor from her to it, and the pool it stands in.
  const tx = e.tx ?? 0;
  ctx.globalAlpha = .7 * alpha * rise;
  ctx.fillStyle = '#071618';
  ctx.beginPath();
  ctx.moveTo(e.x + tx, e.y - 3);
  ctx.quadraticCurveTo(e.x + tx * .5, e.y + 4, e.x - dir * 10, e.y - 9);
  ctx.lineTo(e.x - dir * 10, e.y + 9);
  ctx.quadraticCurveTo(e.x + tx * .5, e.y + 7, e.x + tx, e.y + 3);
  ctx.closePath();
  ctx.moveTo(e.x + 66 * (1 + punch * .2), e.y);
  ctx.ellipse(e.x, e.y, 66 * (1 + punch * .2), 11, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = .45 * alpha * rise;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, 66 * (1 + punch * .2), 11, 0, 0, TAU);
  ctx.stroke();
  // Afterimages while it rushes: the inked bake only.
  const v = e.vx ?? 0;
  if (v && cb) {
    for (let k = lite ? 1 : 3; k >= 1; k--) {
      ctx.save();
      ctx.translate(e.x - v * k * .035, e.y);
      ctx.scale(dir * (1 + Math.min(.25, Math.abs(v) / 4000)), 1);
      inkFigure(ctx, cb, h, lift, .3 / k, 0, true);
      ctx.restore();
    }
  }
  // The body: rises out of the floor (revealed from the feet up), squashes on every blow, sinks at the end.
  ctx.translate(e.x, e.y);
  ctx.scale(dir * sx, sy);
  const rising = rise < 1;
  if (rising) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-h, -lift - h * 1.2 * rise, h * 2, h * 1.2 * rise + lift + 4);
    ctx.clip();
  }
  const head = inkFigure(ctx, cb, h, lift, alpha, flare, false);
  if (rising) ctx.restore();
  if (rise > .6) {
    const hx = head.x, hy = head.y;
    ctx.globalAlpha = alpha * span(rise, .6, 1);
    // 番长 headband tails streaming off the back of the head, longer while it rushes.
    const flap = Math.abs(v) / 600;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 2; i++) {
      const bx = hx - h * .06, by = hy + h * (.05 + i * .015);
      const w = Math.sin(el * 11 + i * 1.3) * h * .03 * (1 + flap);
      const reach = (.2 - i * .03) * (1 + flap * .5), reach2 = (.19 - i * .03) * (1 + flap * .5);
      ctx.moveTo(bx, by - 3);
      ctx.quadraticCurveTo(bx - h * .1, by + w, bx - h * reach, by + h * .03 + w * 1.6);
      ctx.lineTo(bx - h * reach2, by + h * .045 + w * 1.6);
      ctx.quadraticCurveTo(bx - h * .1, by + 5 + w, bx, by + 3);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    // The eye: one white slit, brighter on every blow.
    const ex = hx + h * .05, ey = hy + h * .105;
    ctx.globalAlpha = alpha * (.35 + .4 * flare);
    ctx.fillStyle = RIM;
    ctx.beginPath(); ctx.ellipse(ex, ey, 10, 5, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(ex, ey, 6, 2.4, -.1, 0, TAU); ctx.fill();
    // Her heart beats in its chest too.
    const pump = (e.t0 ?? -1) >= 0 ? Math.exp(-since * 9) : 0;
    ctx.globalAlpha = alpha * (.45 + .55 * pump);
    heart(ctx, hx + h * .02, hy + h * .3, 7 + 5 * pump);
  }
  ctx.restore();
  // 「脑内番长参上！！」: stamped down its far side while it stands (before the rush), one manga column.
  if (el > .08 && el < .55 && sink === 0) {
    const k = span(el, .08, .2), out = span(el, .42, .55);
    ctx.save();
    ctx.globalAlpha = (1 - out) * k;
    const words = '脑内番长参上';
    const cx = e.x + dir * h * .42, top = e.y - h * 1.02;
    for (let i = 0; i < words.length; i++) inkAt(ctx, words[i], cx, top + i * 25 * pop(k), 22, 0, INK, PAPER);
    inkAt(ctx, '！！', cx, top + words.length * 25 + 6, 20, Math.PI / 2, RED, PAPER);
    ctx.restore();
  }
}

/** Fade of a rig piece that lets go over `over` seconds once the move releases it (cord / speed lines). */
function letGo(e: Effect, over: number): number {
  const age = e.age ?? 0;
  const out = (e.until ?? -1) >= 0 ? clamp(1 - (age - (e.until ?? 0)) / over, 0, 1) : 1;
  return Math.min(1, age / .15) * out;
}

/** The full-screen halftone flash, baked once (it never changes; only its alpha does). */
let toneBake: HTMLCanvasElement | null | undefined;
function toneOf(): HTMLCanvasElement | null {
  if (toneBake !== undefined) return toneBake;
  if (typeof document === 'undefined') return toneBake = null;
  const c = canvasOf(W, H);
  const g = c.getContext('2d');
  if (g) {
    const step = 30, cx = W / 2, cy = H / 2, far = Math.hypot(cx, cy);
    g.fillStyle = INK;
    g.beginPath();
    for (let y = step / 2; y < H; y += step) {
      for (let x = step / 2 + ((y / step) % 2) * step / 2; x < W; x += step) {
        const r = 1 + 6 * (Math.hypot(x - cx, y - cy) / far);
        g.moveTo(x + r, y);
        g.arc(x, y, r, 0, TAU);
      }
    }
    g.fill();
  }
  return toneBake = c;
}

/** One manga panel without its word — paper, halftone, speed lines, the ink frame — baked at 2× per (big, beat, side). */
const PANEL_SCALE = 2;
const panels = new Map<number, HTMLCanvasElement | null>();
function panelOf(big: boolean, n: number, dir: number, lite: boolean): HTMLCanvasElement | null {
  const key = (big ? 100 : 0) + n * 4 + (dir > 0 ? 2 : 0) + (lite ? 1 : 0);
  const hit = panels.get(key);
  if (hit !== undefined) return hit;
  if (typeof document === 'undefined') { panels.set(key, null); return null; }
  const w = big ? 190 : 124, h = big ? 112 : 78;
  const c = canvasOf((w + 12) * PANEL_SCALE, (h + 12) * PANEL_SCALE);
  const g = c.getContext('2d');
  if (g) {
    g.scale(PANEL_SCALE, PANEL_SCALE);
    g.translate((w + 12) / 2, (h + 12) / 2);
    g.beginPath();
    g.moveTo(-w / 2 + 10, -h / 2);
    g.lineTo(w / 2, -h / 2 + 6);
    g.lineTo(w / 2 - 10, h / 2);
    g.lineTo(-w / 2, h / 2 - 6);
    g.closePath();
    g.fillStyle = PAPER;
    g.fill();
    g.save();
    g.clip();
    if (!lite) {
      g.fillStyle = 'rgba(11,27,29,.16)';
      g.beginPath();
      for (let y = -h / 2 + 6; y < h / 2; y += 9) {
        for (let x = -w / 2 + 6 + ((y / 9) % 2) * 4.5; x < w / 2; x += 9) {
          const r = 1.4 + 1.6 * ((x * dir + w / 2) / w);
          g.moveTo(x + r, y);
          g.arc(x, y, r, 0, TAU);
        }
      }
      g.fill();
    }
    speedLines(g, -dir * w * .5, 0, w * .35, w * 1.3, big ? 16 : 10, 50 + n, 2.4);
    g.restore();
    g.lineWidth = 4;
    g.strokeStyle = INK;
    g.stroke();
  }
  panels.set(key, c);
  return c;
}

/* ---- move effects ---- */

/** Returns true when the effect is one of hers. */
export function drawYomogiFx(ctx: CanvasRenderingContext2D, e: Effect, lite = false, images?: ImageCache): boolean {
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  switch (e.type) {
    case 'yomogi-thump': {
      // One beat along the floor: two flat rings running out both ways, wider at the higher tiers.
      const n = e.n ?? 1;
      const rx = 26 + 120 * ease(t) * (.8 + .2 * n);
      ctx.save();
      ctx.globalAlpha = (1 - t) * (.35 + .1 * n);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = Math.max(.5, 3.2 * (1 - t));
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, rx, rx * .14, 0, 0, TAU);
      ctx.stroke();
      if (!lite && n >= 2) {
        ctx.globalAlpha *= .6;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, rx * .62, rx * .09, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }
    case 'yomogi-sweat': {
      ctx.save();
      ctx.globalAlpha = 1 - t * t;
      drop(ctx, e.x, e.y + ease(t) * 14, 4 + (e.n ?? 2) * .5, e.color);
      ctx.restore();
      return true;
    }
    case 'yomogi-burst': {
      // 「心脏快要炸开了」: the heart swells, pops into shards and star bits, a ring and speed lines, and the shout.
      const r = e.radius ?? 150;
      ctx.save();
      if (t < .12) {
        heart(ctx, e.x, e.y, 10 + 30 * ease(t / .12));
      } else {
        const k = span(t, .12, 1);
        ctx.globalAlpha = 1 - k;
        speedLines(ctx, e.x, e.y, r * (.55 + .2 * k), r * (1.15 + .15 * k), lite ? 12 : 20, 11, 4);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(e.x, e.y, Math.max(1, r * ease(span(t, .12, .4))), 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = RED;
        ctx.lineWidth = 3 * (1 - k) + .5;
        ctx.stroke();
        burst(el - .1, 31, { n: lite ? 6 : 10, speed: [220, 420], life: .7, gravity: 380, drag: .5 }, (x, y, q, i) => {
          ctx.globalAlpha = 1 - q;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(hash(i, 4) * TAU + q * 4);
          heartQuick(ctx, 0, 0, 6 * (1 - q * .5));
          ctx.restore();
        }, e.x, e.y);
        if (!lite) {
          ctx.fillStyle = '#fff3b0';
          burst(el - .1, 47, { n: 10, speed: [160, 360], life: .5, drag: .4 }, (x, y, q) => {
            ctx.globalAlpha = 1 - q;
            sparkle(ctx, x, y, 7 * (1 - q));
          }, e.x, e.y);
        }
      }
      ctx.globalAlpha = Math.min(1, life * 2.2);
      inkAt(ctx, '心脏要炸开了——！！', e.x, e.y - 96 - 10 * ease(t), 20, -.06 * dir, RED, PAPER, pop(span(t, 0, .2)));
      ctx.restore();
      return true;
    }
    case 'yomogi-shy': {
      // 请不要看我: three drops of cold sweat thrown off the one she flailed at.
      ctx.save();
      ctx.globalAlpha = 1 - t * t;
      for (let i = 0; i < 3; i++) {
        const spread = (i - 1) * 20;
        drop(ctx, e.x + dir * (8 + 38 * t) + spread * t, e.y - 26 * t + 70 * t * t + spread * .2, 3.4, e.color);
      }
      ctx.restore();
      return true;
    }
    case 'yomogi-shriek': {
      // 怪叫 — 像被电了: jagged arcs of current running forward, hair standing on end, and the scream.
      const reach = e.radius ?? 126;
      const n = e.n ?? 0;
      ctx.save();
      ctx.lineJoin = 'round';
      const rings = lite ? 2 : 3;
      for (let i = 0; i < rings; i++) {
        const k = span(t, i * .12, .55 + i * .12);
        if (k <= 0 || k >= 1) continue;
        const r = 16 + reach * ease(k);
        ctx.globalAlpha = (1 - k) * .45;
        ctx.strokeStyle = TEAL;
        ctx.lineWidth = 7;
        zigzag(ctx, e.x, e.y + 40, r, dir, 5 + i + Math.floor(el * 30), 5 + n);
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2.2;
        zigzag(ctx, e.x, e.y + 40, r, dir, 5 + i + Math.floor(el * 30), 5 + n);
      }
      // Hair on end round her head.
      const hx = e.x - dir * 22, hy = e.y - 6;
      const stand = 1 - span(t, .5, 1);
      if (stand > 0) {
        ctx.globalAlpha = stand;
        ctx.fillStyle = '#8f9c9c';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI * .95 + i * Math.PI * .9 / 6 + Math.sin(el * 60 + i) * .06;
          const c = Math.cos(a), s = Math.sin(a);
          const len = (14 + hash(i, 9) * 8) * stand;
          ctx.beginPath();
          ctx.moveTo(hx + c * 18 - s * 4, hy + s * 18 + c * 4);
          ctx.lineTo(hx + c * (18 + len), hy + s * (18 + len));
          ctx.lineTo(hx + c * 18 + s * 4, hy + s * 18 - c * 4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.globalAlpha = Math.min(1, life * 2);
      inkAt(ctx, '呀————！！', e.x + dir * 30, e.y - 48 - 6 * ease(t), 17 + n * 2, -.08 * dir + Math.sin(el * 50) * .03, INK, PAPER, pop(span(t, 0, .18)));
      ctx.restore();
      return true;
    }
    case 'yomogi-hide': {
      // Crouched at their back: …… one dot at a time, trembling.
      ctx.save();
      ctx.globalAlpha = Math.min(1, life * 4);
      ctx.fillStyle = INK;
      for (let i = 0; i < 3; i++) {
        if (el < i * .1) continue;
        const jx = Math.sin(el * 70 + i * 2) * 1.2;
        ctx.beginPath();
        ctx.arc(e.x + (i - 1) * 9 + jx, e.y, 3, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      return true;
    }
    case 'yomogi-reflex': {
      // The punch her own heartbeat scared out of her: ink speed lines round the fist, and the cry. Caught first: 被发现了！
      ctx.save();
      ctx.globalAlpha = 1 - t;
      speedLines(ctx, e.x, e.y, 26 + 10 * t, 70 + 16 * t, lite ? 10 : 16, 21, 3);
      if (e.hit) {
        ctx.fillStyle = PAPER;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 16 * (1 - t) + 2, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = Math.min(1, life * 2);
      inkAt(ctx, e.heavy ? '被发现了！' : '呀——！', e.x - dir * 30, e.y - 82, 17, -.1 * dir, INK, PAPER, pop(span(t, 0, .2)));
      ctx.restore();
      return true;
    }
    case 'yomogi-palm': {
      // 拳化为掌: a broad teal sweep with the hand trailing along it; at the strike the fist opens — a white hand
      // flashes, a ripple runs off the cheek it hit. A held fist instead lands as a round impact with a shock cone.
      const beat = (e.n ?? 0) > 0;
      const arc = (q: number) => dir > 0 ? -1.2 + 1.9 * q : Math.PI + 1.2 - 1.9 * q;
      const ax = e.x - dir * 40, ay = e.y + 10;
      ctx.save();
      // A crescent: thick at the hand end, thin where the sweep began.
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      const w = 12 * (1 - t) + 2;
      for (let i = 0; i <= 16; i++) { const q = arc(i / 16); const r = 58 + w * (i / 16) * .5; ctx.lineTo(ax + Math.cos(q) * r, ay + Math.sin(q) * r); }
      for (let i = 16; i >= 0; i--) { const q = arc(i / 16); const r = 58 - w * (i / 16) * .5; ctx.lineTo(ax + Math.cos(q) * r, ay + Math.sin(q) * r); }
      ctx.closePath();
      ctx.fill();
      const k = pop(span(t, 0, .25));
      if (e.heavy) {
        ctx.fillStyle = PAPER;
        ctx.beginPath();
        ctx.arc(e.x + dir * 8, e.y, 20 * k * (1 - t * .5), 0, TAU);
        ctx.fill();
        speedLines(ctx, e.x + dir * 8, e.y, 24, 56, lite ? 8 : 12, 33, 3);
        ctx.strokeStyle = PAPER;
        ctx.lineWidth = 3 * (1 - t);
        for (let i = 0; i < 2; i++) {
          const r = 20 + 50 * ease(span(t, i * .12, .7 + i * .12));
          ctx.beginPath();
          ctx.ellipse(e.x + dir * (14 + r * .6), e.y, Math.max(1, r * .35), Math.max(1, r), 0, 0, TAU);
          ctx.stroke();
        }
      } else {
        // Two fading hands behind along the sweep, then the open hand itself.
        if (!lite) for (let i = 2; i >= 1; i--) {
          const q = arc(1 - i * .22);
          ctx.globalAlpha = (1 - t) * .22 * (3 - i);
          ctx.fillStyle = e.color;
          hand(ctx, ax + Math.cos(q) * 58, ay + Math.sin(q) * 58, 16, dir * 1.2);
        }
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = PAPER;
        ctx.fillStyle = INK;
        hand(ctx, e.x + dir * 6, e.y, 29 * k, dir * 1.2);
        ctx.fillStyle = PAPER;
        hand(ctx, e.x + dir * 6, e.y, 26 * k, dir * 1.2);
        if (e.hit) {
          // Three short white streaks off the cheek: the sting.
          ctx.strokeStyle = PAPER;
          ctx.lineCap = 'round';
          ctx.lineWidth = 3 * (1 - t) + .5;
          for (let i = -1; i <= 1; i++) {
            const a = i * .45, r0 = 30 + 20 * ease(t), r1 = r0 + 18 * (1 - t);
            ctx.beginPath();
            ctx.moveTo(e.x + dir * (20 + Math.cos(a) * r0), e.y - 6 + Math.sin(a) * r0);
            ctx.lineTo(e.x + dir * (20 + Math.cos(a) * r1), e.y - 6 + Math.sin(a) * r1);
            ctx.stroke();
          }
          ctx.strokeStyle = e.color;
          ctx.lineWidth = 2.5 * (1 - t) + .5;
          for (let i = 0; i < 2; i++) {
            const r = 12 + 46 * ease(span(t, i * .1, .65 + i * .1));
            ctx.beginPath();
            ctx.ellipse(e.x + dir * 26, e.y - 8, Math.max(1, r * .45), Math.max(1, r), 0, 0, TAU);
            ctx.stroke();
          }
        }
      }
      if (beat) {
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = RED;
        ctx.lineWidth = 3 * (1 - t) + .5;
        heartPath(ctx, e.x, e.y, 18 + 26 * ease(t));
        ctx.stroke();
        if (!lite) burst(el, 77, { n: 6, speed: [120, 220], life: .35, drag: .5 }, (x, y, q) => {
          ctx.globalAlpha = 1 - q;
          heartQuick(ctx, x, y, 5 * (1 - q * .5));
        }, e.x, e.y);
      }
      if (e.hit) {
        ctx.globalAlpha = Math.min(1, life * 2);
        inkAt(ctx, e.heavy ? '咚！' : '啪——！！', e.x + dir * 6, e.y - 62, beat ? 26 : 21, .08 * dir, beat ? RED : INK, PAPER, pop(span(t, 0, .2)));
      }
      ctx.restore();
      return true;
    }
    case 'yomogi-tone': {
      // One beat of halftone over the whole screen: the panel freezes on the slap. Baked once, drawn by alpha.
      const tone = toneOf();
      if (!tone) return true;
      ctx.save();
      ctx.globalAlpha = (1 - t) * ((e.n ?? 0) ? .24 : .16);
      ctx.drawImage(tone, 0, 0, W, H);
      ctx.restore();
      return true;
    }
    case 'yomogi-handprint': {
      // A red handprint on the cheek she slapped, fading over its last third.
      ctx.save();
      ctx.globalAlpha = Math.min(1, el / .08) * Math.min(1, life * 3) * .72;
      ctx.fillStyle = e.color;
      hand(ctx, e.x, e.y, e.heavy ? 18 : 14, -.35 * dir);
      ctx.restore();
      return true;
    }
    case 'yomogi-radar': {
      // 人体感应雷达: thin rings sweep out along the floor from where she is curled up.
      const r = e.radius ?? 150;
      ctx.save();
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2;
      const rings = lite ? 2 : 3;
      for (let i = 0; i < rings; i++) {
        const k = ((el * 2.4) + i / rings) % 1;
        ctx.globalAlpha = (1 - k) * .55 * Math.min(1, life * 6);
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, Math.max(1, r * k), Math.max(1, r * k * .16), 0, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = .3 * Math.min(1, life * 6);
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, r, r * .16, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return true;
    }
    case 'yomogi-rise': {
      // Her shadow pools on the floor ahead of her and starts to climb.
      const k = ease(t * 1.3);
      ctx.save();
      ctx.globalAlpha = .8 * Math.min(1, life * 5);
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, Math.max(1, 70 * k), Math.max(1, 12 * k), 0, 0, TAU);
      ctx.fill();
      if (!lite) {
        for (let i = 0; i < 7; i++) {
          const q = (el * 1.6 + hash(i, 1)) % 1;
          const x = e.x + (hash(i, 3) - .5) * 110 * k;
          ctx.globalAlpha = .55 * (1 - q) * k;
          ctx.fillRect(x - 2, e.y - q * 150 * k - 20, 4, 20 + 30 * (1 - q));
        }
      }
      ctx.restore();
      return true;
    }
    case 'yomogi-banchou': {
      drawBanchou(ctx, e, lite, images);
      return true;
    }
    case 'yomogi-cord': {
      // A red cord from her heart to its chest: an ECG trace, and every beat runs down it as a spike.
      const tx = e.tx ?? 0, ty = e.ty ?? 0;
      const len = Math.hypot(tx, ty);
      if (!(len > 4)) return true;
      const ux = tx / len, uy = ty / len;
      const age = e.age ?? 0;
      const since = (e.t0 ?? -1) >= 0 ? age - (e.t0 ?? 0) : 9;
      const head = since < .22 ? since / .22 : -1;
      const fade = letGo(e, SHADOW_LET.cord);
      if (fade <= 0) return true;
      ctx.save();
      ctx.lineJoin = 'round';
      const steps = lite ? 24 : 40;
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = fade * (pass ? .9 : .25);
        ctx.strokeStyle = pass ? e.color : '#ff9aac';
        ctx.lineWidth = pass ? 2 : 6;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const q = i / steps;
          const sag = Math.sin(q * Math.PI) * 18;
          let off = Math.sin(q * 30 - age * 14) * 1.2;
          if (head >= 0) {
            const d = (q - head) * 14;
            if (Math.abs(d) < 1) off += (d < 0 ? -1 : 1) * Math.sin(Math.abs(d) * Math.PI) * 13 * (1 - head * .3);
          }
          const x = e.x + tx * q - uy * off, y = e.y + ty * q + sag + ux * off;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      if (head >= 0) {
        const q = head, x = e.x + tx * q, y = e.y + ty * q + Math.sin(q * Math.PI) * 18;
        ctx.globalAlpha = fade * (1 - head * .4);
        heartQuick(ctx, x, y, 6);
      }
      ctx.restore();
      return true;
    }
    case 'yomogi-focus': {
      // Manga focus lines closing on the fight from the screen edge, behind every body; restrained, flickering.
      const fx = e.tx ?? W / 2, fy = e.ty ?? H / 2;
      const age = e.age ?? 0;
      const fade = letGo(e, SHADOW_LET.focus);
      if (fade <= 0) return true;
      const n = lite ? 22 : 40;
      const frame = Math.floor(age * 15);
      const far = Math.hypot(W, H);
      ctx.save();
      ctx.globalAlpha = .16 * fade;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i + hash(i, frame)) / n * TAU;
        const r0 = 230 + hash(i, frame + 7) * 140, w = .006 + hash(i, frame + 3) * .01;
        ctx.moveTo(fx + Math.cos(a) * r0, fy + Math.sin(a) * r0);
        ctx.lineTo(fx + Math.cos(a - w) * far, fy + Math.sin(a - w) * far);
        ctx.lineTo(fx + Math.cos(a + w) * far, fy + Math.sin(a + w) * far);
        ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
      return true;
    }
    case 'yomogi-bighand': {
      // The slap, as big as the shadow: an open ink hand with a mint rim, flung through them.
      const k = pop(span(t, 0, .18));
      ctx.save();
      ctx.globalAlpha = Math.min(1, life * 2.5);
      ctx.translate(e.x - dir * 40 * (1 - ease(t * 2)), e.y);
      speedLines(ctx, 0, 0, 70 * k, 150 + 30 * t, lite ? 12 : 20, 61, 3, PAPER);
      ctx.globalAlpha *= .5;
      ctx.fillStyle = RIM;
      hand(ctx, 0, 0, 70 * k, dir * 1.25);
      ctx.globalAlpha = Math.min(1, life * 2.5);
      ctx.fillStyle = INK;
      hand(ctx, 0, 0, 62 * k, dir * 1.25);
      ctx.fillStyle = PAPER;
      hand(ctx, 0, 0, 56 * k, dir * 1.25);
      ctx.restore();
      return true;
    }
    case 'yomogi-impact': {
      // One of the shadow's punches landing: a white pop, short white speed lines, a mint ring and a small heart —
      // the slap's language at a fraction of its size, a little bigger with each beat.
      const n = e.n ?? 0;
      const g = 1 + n * .08;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      speedLines(ctx, e.x, e.y, (18 + 10 * t) * g, (46 + 14 * t) * g, lite ? 6 : 10, 70 + n, 2.4, PAPER);
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(1, 15 * g * (1 - t * .6) * pop(span(t, 0, .25))), 0, TAU);
      ctx.fill();
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3 * (1 - t) + .5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(1, (14 + 30 * ease(t)) * g), 0, TAU);
      ctx.stroke();
      heartQuick(ctx, e.x + dir * 20 * ease(t), e.y - 22 * ease(t), 5 * (1 - t * .4));
      ctx.restore();
      return true;
    }
    case 'yomogi-dizzy': {
      // Slapped silly: three stars (four on the beat) circling the head while the stun lasts.
      const n = (e.n ?? 0) ? 4 : 3;
      ctx.save();
      ctx.fillStyle = e.color;
      for (let i = 0; i < n; i++) {
        const a = el * 9 + i / n * TAU;
        const z = Math.sin(a);
        ctx.globalAlpha = Math.min(1, life * 4) * (.55 + .45 * (z + 1) / 2);
        sparkle(ctx, e.x + Math.cos(a) * 26, e.y + z * 7, 6 + 2 * z);
      }
      ctx.restore();
      return true;
    }
    case 'yomogi-scare': {
      // She sees her own shadow: 呀——！？ and a burst of sweat.
      ctx.save();
      ctx.globalAlpha = Math.min(1, life * 3);
      inkAt(ctx, '呀——！？', e.x, e.y - 8 * ease(t), 19, -.12 * dir + Math.sin(el * 60) * .04, INK, PAPER, pop(span(t, 0, .2)));
      for (let i = 0; i < 3; i++) drop(ctx, e.x + (i - 1) * 26, e.y + 30 + ease(t) * 10 - Math.abs(i - 1) * 6, 3.4, MINT);
      ctx.restore();
      return true;
    }
    case 'yomogi-panel': {
      // One manga panel per punch: a slanted frame, halftone, speed lines and the sound. The slap gets the big one.
      // The panel itself is a bake (panelOf); every frame is that blit and the stamped word.
      const n = e.n ?? 0;
      const big = !!e.heavy;
      const w = big ? 190 : 124, h = big ? 112 : 78;
      const k = pop(span(t, 0, .16));
      if (!(k > 0)) return true;
      const fade = Math.min(1, life * 3.3);
      ctx.save();
      ctx.translate(e.x, e.y - 74);
      ctx.rotate((n % 2 ? -.1 : .09) * dir);
      ctx.scale(k, k);
      const bake = panelOf(big, n, dir, lite);
      if (bake) {
        ctx.globalAlpha = .92 * fade;
        ctx.drawImage(bake, -(w + 12) / 2, -(h + 12) / 2, w + 12, h + 12);
      }
      ctx.globalAlpha = fade;
      if (big) inkAt(ctx, '啪————！！', 0, 0, 30, -.06 * dir, RED, PAPER);
      else inkAt(ctx, PANEL_WORDS[Math.min(n, PANEL_WORDS.length - 1)], 0, 0, 22 + n * 1.5, .05 * dir);
      ctx.restore();
      return true;
    }
    case 'yomogi-oxygen': {
      // 第 18 话's oxygen can: a few white puffs from her mouth, drifting forward and spreading.
      ctx.save();
      for (let i = 0; i < (lite ? 4 : 7); i++) {
        const q = span(t, i * .06, .6 + i * .06);
        if (q <= 0 || q >= 1) continue;
        ctx.globalAlpha = (1 - q) * .8;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(e.x + dir * (6 + 46 * ease(q)) + (hash(i, 1) - .5) * 10, e.y - 18 * q + (hash(i, 2) - .5) * 14, Math.max(1, 4 + 9 * q), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      return true;
    }
  }
  return false;
}
