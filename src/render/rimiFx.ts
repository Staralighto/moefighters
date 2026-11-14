import type { Effect, Projectile } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, clamp } from '../game/constants.ts';
import { DRILL, RIMI_DRAW, RIMI_DRILL, RIMI_POSE, RIMI_ROLL, RIMI_TV, ROLL } from '../game/rimiPath.ts';
import { TAU, burst, dot, glow, hash, sparkle } from './fxParticles.ts';

/* 牛込里美 — 粉（#FF55BB）、可可棕、奶油白。Three registers, so each move reads at a glance:
   - 巧克力螺 (I, O, L): the cornet picture (cornet.png, or a drawn fallback) — tossed and spinning, lying on the floor
     with a little glint, held as a drill whose spiral glints race along it, and the giant one (cornet-rimi.png) she
     turns into, rolling with a wake of chocolate splashes and cocoa dust;
   - 恐怖片 (U): an old TV (tv.png) glowing cold on the floor in a small pool of dark, a long-haired ghost (ghost.png)
     climbing out of it and crawling; pale hands holding the ankle it reached ('rimi-hands');
   - 她自己: pink hearts and sparkles when she claps, bites or eats — never words.
   Cost: the four props are pictures stamped with drawImage (a drawn fallback is painted once into a cached canvas);
   every soft shape is the shared glow stamp; no gradients per frame, no shadowBlur. The busiest moment, the rolling
   giant with its wake, stays near 30 stamps (about half in lite). */

export const RIMI_BACK: readonly string[] = ['rimi-tvdim', 'rimi-tvset', 'rimi-squish', 'rimi-drill', 'rimi-drop'];
export const RIMI_SCREEN_BACK: readonly string[] = [];
export const RIMI_SCREEN_FRONT: readonly string[] = [];
export const RIMI_CORNET_SRC = '/sprites/rimi/cornet.png';
export const RIMI_GIANT_SRC = '/sprites/rimi/cornet-rimi.png';
export const RIMI_TV_SRC = '/sprites/rimi/tv.png';
export const RIMI_GHOST_SRC = '/sprites/rimi/ghost.png';
/** Where the feet sit in the TV and ghost pictures, as a share of the picture up from its bottom edge. */
const TV_FEET = .09;
const GHOST_FEET = .06;

const PINK_RGB = '255,120,200';
const COCOA_RGB = '120,66,40';
const CREAM_RGB = '255,240,224';
const COLD_RGB = '196,214,255';
const CHOCO = '#4a2616';
const CRUMB = '#c98a4e';

const n = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const fadeIO = (el: number, life: number, a: number, b: number) => clamp(Math.min(el / a, life / b), 0, 1);

/* ---- pictures ---- */

const keyCache = new WeakMap<HTMLImageElement, CanvasImageSource>();
/** The picture with the chroma green and the placeholder sheet chrome cut out. */
function keyed(im: HTMLImageElement): CanvasImageSource {
  const got = keyCache.get(im);
  if (got) return got;
  if (typeof document === 'undefined') return im;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
  if (!g) return im;
  g.drawImage(im, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gv = px[i + 1], b = px[i + 2];
    if (gv > 240 && r < 20 && b < 20) px[i + 3] = 0;
  }
  g.putImageData(data, 0, 0);
  keyCache.set(im, c);
  return c;
}
const drawn = new Map<string, HTMLCanvasElement | null>();
function fallback(key: string, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
  const got = drawn.get(key);
  if (got !== undefined) return got;
  let c: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined') {
    c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    if (g) paint(g); else c = null;
  }
  drawn.set(key, c);
  return c;
}
/** A cornet in a 256 cell: tip at the right, the open end (with its chocolate) at the left, on the middle line. */
function paintCornet(g: CanvasRenderingContext2D): void {
  g.lineJoin = 'round';
  g.fillStyle = '#d99a58';
  g.strokeStyle = '#5a3218';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(232, 128);
  g.quadraticCurveTo(150, 70, 44, 74);
  g.quadraticCurveTo(28, 128, 44, 182);
  g.quadraticCurveTo(150, 186, 232, 128);
  g.closePath();
  g.fill(); g.stroke();
  g.strokeStyle = '#9a5c2c';
  g.lineWidth = 5;
  for (let i = 0; i < 5; i++) {
    const x = 70 + i * 32, h = 50 * (1 - i * .16);
    g.beginPath(); g.moveTo(x - 10, 128 - h); g.quadraticCurveTo(x + 14, 128, x - 4, 128 + h); g.stroke();
  }
  g.fillStyle = CHOCO;
  g.beginPath(); g.ellipse(44, 128, 18, 50, 0, 0, TAU); g.fill();
  g.fillStyle = '#8a5236';
  g.beginPath(); g.ellipse(40, 112, 6, 14, 0, 0, TAU); g.fill();
}
function cornetPic(images?: ImageCache): CanvasImageSource | null {
  const im = images?.get(RIMI_CORNET_SRC);
  return im && im.naturalWidth ? keyed(im) : fallback('cornet', paintCornet);
}
function giantPic(images?: ImageCache): CanvasImageSource | null {
  const im = images?.get(RIMI_GIANT_SRC);
  if (im && im.naturalWidth) return keyed(im);
  return fallback('giant', g => {
    paintCornet(g);
    // Her bangs and the hairclip peeking out of the open end.
    g.fillStyle = '#1c1420';
    g.beginPath(); g.ellipse(46, 116, 22, 30, 0, Math.PI * .55, Math.PI * 1.75); g.fill();
    g.fillStyle = '#ff8fd0';
    g.fillRect(54, 92, 12, 6);
  });
}
function tvPic(images?: ImageCache): CanvasImageSource | null {
  const im = images?.get(RIMI_TV_SRC);
  if (im && im.naturalWidth) return keyed(im);
  return fallback('tv', g => {
    g.fillStyle = '#5b5466'; g.strokeStyle = '#222'; g.lineWidth = 6;
    g.beginPath(); g.roundRect?.(40, 70, 176, 140, 18); g.fill(); g.stroke();
    g.fillStyle = '#c9d2e4';
    g.beginPath(); g.roundRect?.(60, 88, 120, 100, 14); g.fill();
    g.fillStyle = '#3c3646'; g.fillRect(70, 210, 20, 22); g.fillRect(166, 210, 20, 22);
  });
}
function ghostPic(images?: ImageCache): CanvasImageSource | null {
  const im = images?.get(RIMI_GHOST_SRC);
  if (im && im.naturalWidth) return keyed(im);
  return fallback('ghost', g => {
    g.fillStyle = '#f6f4fa';
    g.beginPath(); g.ellipse(110, 200, 80, 34, 0, 0, TAU); g.fill();
    g.fillStyle = '#141018';
    g.beginPath(); g.ellipse(176, 178, 44, 40, -.3, 0, TAU); g.fill();
    g.fillRect(150, 178, 70, 44);
    g.fillStyle = '#f6f4fa';
    g.fillRect(210, 210, 34, 12);
  });
}
/** The transform the current top-level draw runs under (drawRimiFx, drawRimiShot, the two auras read it once). */
let base: DOMMatrix | null = null;
function beginBase(ctx: CanvasRenderingContext2D): void { base = ctx.getTransform?.() ?? null; }
/** Stamp `c` (size × size) centred on (x, y), mirrored to `dir`, scaled (sx, sy) and turned by rot, without a
 *  save/restore: the transform is set to base × local and put straight back. The props are stamped up to six times a
 *  frame, and a full state save per stamp costs more than the stamp. Falls back to save/restore without a base. */
function stampAt(ctx: CanvasRenderingContext2D, c: CanvasImageSource | null, x: number, y: number, size: number, dir: number, rot = 0, sx = 1, sy = 1): void {
  if (!c) return;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const la = dir * sx * cs, lb = sy * sn, lc = -dir * sx * sn, ld = sy * cs;
  if (!base) {
    ctx.save();
    ctx.transform(la, lb, lc, ld, x, y);
    ctx.drawImage(c, -size / 2, -size / 2, size, size);
    ctx.restore();
    return;
  }
  const B = base;
  ctx.setTransform(B.a * la + B.c * lb, B.b * la + B.d * lb, B.a * lc + B.c * ld, B.b * lc + B.d * ld, B.a * x + B.c * y + B.e, B.b * x + B.d * y + B.f);
  ctx.drawImage(c, -size / 2, -size / 2, size, size);
  ctx.setTransform(B);
}
/** A picture of a 256 cell, `size` px wide, its bottom on (x, foot), facing `dir`, turned by `rot` about its centre. */
function placePic(ctx: CanvasRenderingContext2D, c: CanvasImageSource | null, x: number, foot: number, size: number, dir: number, rot = 0): void {
  stampAt(ctx, c, x, foot - size / 2, size, dir, rot);
}
/** A cornet `size` px long centred on (x, y), its tip toward dir, turned by rot (in its own frame). */
function cornetAt(ctx: CanvasRenderingContext2D, c: CanvasImageSource | null, x: number, y: number, size: number, dir: number, rot = 0): void {
  stampAt(ctx, c, x, y, size, dir, rot);
}
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (!(r > 0)) return;
  ctx.beginPath();
  ctx.moveTo(x, y + r * .9);
  ctx.bezierCurveTo(x - r * 1.4, y - r * .1, x - r * .7, y - r * 1.2, x, y - r * .45);
  ctx.bezierCurveTo(x + r * .7, y - r * 1.2, x + r * 1.4, y - r * .1, x, y + r * .9);
  ctx.fill();
}
/** Chocolate drops: a round blob with a short tail up the way it came. */
function drop(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, vx: number, vy: number): void {
  if (!(r > 0)) return;
  const m = Math.hypot(vx, vy) || 1;
  ctx.beginPath();
  ctx.moveTo(x - vx / m * r * 2.2, y - vy / m * r * 2.2);
  ctx.arc(x, y, r, Math.atan2(vy, vx) - Math.PI / 2, Math.atan2(vy, vx) + Math.PI / 2, true);
  ctx.closePath();
  ctx.fill();
}

/* ---- soft stamps: every gradient and blur is painted once into a cached canvas, then only drawImage ---- */

const soft = new Map<string, HTMLCanvasElement | null>();
function softStamp(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
  const got = soft.get(key);
  if (got !== undefined) return got;
  let c: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined') {
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (g) paint(g); else c = null;
  }
  soft.set(key, c);
  return c;
}
/** A dark pool that falls off smoothly to nothing (squashed by the caller into the floor's perspective). */
function poolStamp(): HTMLCanvasElement | null {
  return softStamp('pool', 128, 128, g => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(10,8,20,1)');
    gr.addColorStop(.4, 'rgba(10,8,20,.75)');
    gr.addColorStop(.72, 'rgba(10,8,20,.3)');
    gr.addColorStop(1, 'rgba(10,8,20,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}
/** The screen's light: a fan from a narrow mouth on the left to a wide soft end on the right, bright near the
 *  screen. Blurred once so its edges have no line. */
function beamStamp(): HTMLCanvasElement | null {
  return softStamp('beam', 320, 160, g => {
    g.filter = 'blur(7px)';
    const gr = g.createLinearGradient(10, 0, 310, 0);
    gr.addColorStop(0, 'rgba(210,225,255,.95)');
    gr.addColorStop(.35, 'rgba(190,210,255,.45)');
    gr.addColorStop(1, 'rgba(180,200,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(14, 66); g.lineTo(306, 18); g.lineTo(306, 146); g.lineTo(14, 94);
    g.closePath();
    g.fill();
  });
}
/** A handprint left on the floor: a flat palm and three finger dots, pointing right. */
function printStamp(): HTMLCanvasElement | null {
  return softStamp('print', 20, 20, g => {
    g.fillStyle = '#e9ecf8';
    g.beginPath(); g.ellipse(8, 10, 6, 2.2, 0, 0, TAU); g.fill();
    for (let f = 0; f < 3; f++) { g.beginPath(); g.arc(14.5 + f * .5, 8.5 + (f - 1) * 1.8, 1.3, 0, TAU); g.fill(); }
  });
}
/** A wisp of floor mist: a long, thin, soft cloud. */
function wispStamp(): HTMLCanvasElement | null {
  return softStamp('wisp', 128, 40, g => {
    g.filter = 'blur(5px)';
    g.fillStyle = 'rgba(236,240,255,.9)';
    g.beginPath(); g.ellipse(64, 22, 48, 9, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(236,240,255,.6)';
    g.beginPath(); g.ellipse(42, 18, 26, 7, 0, 0, TAU); g.fill();
  });
}
const silhouettes = new WeakMap<object, Map<string, HTMLCanvasElement | null>>();
/** The picture's own shape in one colour, softened by `blur` px: a halo that hugs the outline instead of a circle. */
function silhouette(src: CanvasImageSource | null, color: string, blur: number): HTMLCanvasElement | null {
  if (!src || typeof document === 'undefined') return null;
  let m = silhouettes.get(src as object);
  if (!m) silhouettes.set(src as object, m = new Map());
  const key = color + '|' + blur;
  const got = m.get(key);
  if (got !== undefined) return got;
  const w = (src as HTMLCanvasElement).width || 256, h = (src as HTMLCanvasElement).height || 256;
  const flat = document.createElement('canvas');
  flat.width = w; flat.height = h;
  const g = flat.getContext('2d');
  let out: HTMLCanvasElement | null = null;
  if (g) {
    g.drawImage(src, 0, 0, w, h);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    out = document.createElement('canvas');
    out.width = w; out.height = h;
    const o = out.getContext('2d');
    if (o) {
      o.filter = `blur(${blur * w / 256}px)`;
      o.drawImage(flat, 0, 0);
      o.filter = 'none';
      o.drawImage(flat, 0, 0);
    } else out = null;
  }
  m.set(key, out);
  return out;
}

/* ---- U 今晚放映恐怖片 ---- */

/** The TV: set down with a bump; the screen glows, flickers and rolls; while the ghost climbs out the glow swells. */
function drawTv(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean, images?: ImageCache): void {
  const dir = e.dir ?? 1;
  const size = RIMI_DRAW.tv;
  const k = fadeIO(el, e.life, .12, RIMI_TV.fade);
  const drop = el < .14 ? (1 - el / .14) * 26 : Math.sin(Math.min(1, (el - .14) / .18) * Math.PI) * -4;
  const flick = .8 + .2 * hash(Math.floor(el * 20), 5);
  const birth = el < RIMI_TV.rise + .1 ? Math.sin(clamp(el / (RIMI_TV.rise + .1), 0, 1) * Math.PI) : 0;
  const sx = e.x + dir * size * .04, sy = FLOOR - size * .48 - drop;
  ctx.globalAlpha = k;
  placePic(ctx, tvPic(images), e.x, FLOOR + size * TV_FEET - drop, size, dir);
  // Scanlines rolling down the face of the screen: each is laid inside the screen's box, so no clip is needed.
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < (lite ? 2 : 4); i++) {
    const u = (el * .55 + i / 4) % 1;
    ctx.globalAlpha = k * (.12 + .1 * hash(i + Math.floor(el * 12), 9)) * flick;
    ctx.fillRect(sx - size * .3, sy - size * .2 + u * (size * .38 - 3), size * .5, 1.5 + (i % 2));
  }
  // The screen's own glow, a little fringe of colour on either side, and a swell while the ghost climbs out.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = k * (.2 + birth * .4) * flick;
  glow(ctx, sx, sy, 30 + birth * 30, COLD_RGB);
  if (!lite) {
    ctx.globalAlpha = k * .12 * flick;
    glow(ctx, sx - 3, sy, 34, '255,120,170');
    glow(ctx, sx + 3, sy, 34, '120,220,255');
  }
}
/** Under the bodies: the room goes dark round the TV, its contact shadow, and a fan of cold screen light reaching
 *  toward the foe with a few motes of dust turning in it. */
function drawTvDim(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const dir = e.dir ?? 1;
  const size = RIMI_DRAW.tv;
  const k = fadeIO(el, e.life, .3, RIMI_TV.fade);
  const flick = .8 + .2 * hash(Math.floor(el * 20), 5);
  const pool = poolStamp();
  if (pool) {
    ctx.globalAlpha = k * .9;
    ctx.drawImage(pool, e.x + dir * 60 - 280, FLOOR - 230, 560, 340);
    ctx.globalAlpha = k * .55;
    ctx.drawImage(pool, e.x - 70, FLOOR - 12, 140, 22);
  }
  const beam = beamStamp();
  if (beam) {
    ctx.save();
    ctx.translate(e.x + dir * size * .2, FLOOR - size * .48);
    ctx.scale(dir, 1);
    ctx.rotate(.2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * .55 * flick;
    ctx.drawImage(beam, 0, -60, 320, 160);
    ctx.restore();
    // Where it lands: a cold patch of light lying on the floor in front of the screen.
    const spill = softStamp('spill', 128, 32, g => {
      const gr = g.createRadialGradient(64, 16, 0, 64, 16, 64);
      gr.addColorStop(0, 'rgba(200,215,255,.9)');
      gr.addColorStop(.5, 'rgba(190,205,255,.35)');
      gr.addColorStop(1, 'rgba(190,205,255,0)');
      g.setTransform(1, 0, 0, .25, 0, 12);
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
    if (spill) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k * .55 * flick;
      ctx.drawImage(spill, e.x + dir * 150 - 130, FLOOR - 16, 260, 30);
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#dfe8ff';
  for (let i = 0; i < (lite ? 3 : 7); i++) {
    const u = (el * (.15 + hash(i, 3) * .1) + hash(i, 4)) % 1;
    const along = 40 + hash(i, 5) * 230;
    const x = e.x + dir * along + Math.sin(el * 1.3 + i) * 6;
    const y = FLOOR - size * .48 + along * .16 - 40 + u * 80;
    ctx.globalAlpha = k * Math.sin(u * Math.PI) * .7 * (1 - along / 300);
    dot(ctx, x, y, 1.4 + hash(i, 6));
  }
}
/** The ghost: climbing over the lip of the screen; then crawling, a cold halo hugging its outline, its hair and
 *  hem trailing in two cold afterimages, mist dragging along the floor, pale handprints left behind it that fade,
 *  and now and then a VHS glitch that splits it into red and cyan. */
function drawGhost(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean, images?: ImageCache): void {
  const dir = p.face ?? (Math.sign(p.vx) || 1);
  const pic = ghostPic(images);
  const halo = silhouette(pic, '#b8ccff', 6);
  const size = RIMI_DRAW.ghost;
  const sink = size * GHOST_FEET;
  if (p.age < RIMI_TV.rise) {
    const u = ease(p.age / RIMI_TV.rise);
    const x = p.x + dir * u * 34;
    const lift = Math.sin(u * Math.PI) * 40 + (1 - u) * RIMI_DRAW.tv * .45;
    const sc = .55 + .45 * u, rot = (1 - u) * .9;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(p.age / .12, 0, 1) * .55;
    placePic(ctx, halo, x, FLOOR + sink - lift, size * sc * 1.06, dir, rot);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = clamp(p.age / .12, 0, 1) * .9;
    placePic(ctx, pic, x, FLOOR + sink - lift, size * sc, dir, rot);
    return;
  }
  const t = p.age - RIMI_TV.rise;
  const sway = Math.sin(t * 7) * .05;
  const bob = Math.abs(Math.sin(t * 7)) * 4;
  // Handprints along the way, fading behind it.
  const from = (p.aim ?? p.x) + dir * 34;
  const went = (p.x - from) * dir;
  const print = printStamp();
  if (print) {
    for (let d = 30 + Math.max(0, Math.ceil((went - 200) / 38)) * 38; d < went; d += 38) {
      const back = went - d;
      if (back > 170) continue;
      const side = Math.floor(d / 38) % 2 ? 1 : -1;
      ctx.globalAlpha = (1 - back / 170) * .4;
      stampAt(ctx, print, from + dir * d + dir * 2, FLOOR - 2 + side, 20, dir);
    }
  }
  // Mist dragging along the floor.
  const wisp = wispStamp();
  if (wisp) {
    for (let i = 0; i < (lite ? 2 : 4); i++) {
      const u = (t * .9 + i / 4) % 1;
      const w = 90 + u * 80, h = 26 + u * 14;
      ctx.globalAlpha = (1 - u) * .42;
      ctx.drawImage(wisp, p.x - dir * (10 + u * 110) - w / 2, FLOOR - h * .7 - u * 10, w, h);
    }
  }
  // Two cold afterimages, then the halo.
  for (let i = lite ? 0 : 2; i >= 1; i--) {
    ctx.globalAlpha = .18 / i;
    placePic(ctx, halo, p.x - dir * i * 20, FLOOR + sink - bob * .5, size, dir, sway * .5);
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = .32 + .12 * Math.sin(t * 5);
  placePic(ctx, halo, p.x, FLOOR + sink - bob, size * 1.05, dir, sway);
  ctx.globalCompositeOperation = 'source-over';
  const glitch = (t * 1.1) % 1 < .06;
  const waver = .88 + .08 * Math.sin(t * 11);
  if (glitch && !lite) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .45;
    placePic(ctx, silhouette(pic, '#ff3070', 0), p.x - 5, FLOOR + sink - bob, size, dir, sway);
    placePic(ctx, silhouette(pic, '#30d8ff', 0), p.x + 5, FLOOR + sink - bob, size, dir, sway);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = glitch ? .7 : waver;
  placePic(ctx, pic, p.x + (glitch ? (hash(Math.floor(t * 60), 2) - .5) * 6 : 0), FLOOR + sink - bob, size, dir, sway);
}
function drawGhostPuff(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const k = el / e.max;
  burst(el, 41, { n: n(10, lite), speed: [40, 130], life: .55, gravity: -90, drag: .4 }, (x, y, kk) => {
    ctx.globalAlpha = (1 - kk) * .7;
    glow(ctx, x, y, 14 + kk * 20, CREAM_RGB);
  }, e.x, e.y);
  ctx.globalAlpha = (1 - k) * .6;
  ctx.strokeStyle = '#f4f1ff';
  ctx.lineWidth = 2.5 * (1 - k) + .5;
  ctx.beginPath(); ctx.ellipse(e.x, e.y + 22, 30 + k * 50, 8 + k * 10, 0, 0, TAU); ctx.stroke();
}
/** She claps: little pink hearts and sparkles bounce up off her hands. */
function drawCheer(ctx: CanvasRenderingContext2D, e: Effect, lite: boolean): void {
  const h = (e.radius ?? 172) * RIMI_POSE;
  const t = e.age ?? 0;
  const hx = e.x + (e.dir ?? 1) * 22, hy = e.y - h * .56;
  for (let i = 0; i < (lite ? 2 : 4); i++) {
    const u = (t * 1.6 + i / 4) % 1;
    const x = hx + (hash(i, 3) - .5) * 40 + Math.sin(u * 6 + i) * 6;
    const y = hy - u * 60;
    ctx.globalAlpha = (1 - u) * .9 * clamp(e.life / .2, 0, 1);
    ctx.fillStyle = i % 2 ? '#ff8fd0' : '#ffd0ec';
    if (i % 2) heart(ctx, x, y, 6 + (1 - u) * 3); else sparkle(ctx, x, y, 6 + (1 - u) * 3);
  }
}

/* ---- I 巧克力螺，请收下！ ---- */

function drawCornetShot(ctx: CanvasRenderingContext2D, p: Projectile, images?: ImageCache): void {
  const pic = cornetPic(images);
  const dir = p.face ?? 1;
  const size = RIMI_DRAW.cornet;
  if (!p.settled) {
    const spin = p.age * (9 + (p.wave ?? 0) * 2) * dir;
    ctx.globalAlpha = .3;
    glow(ctx, p.x, p.y, 22, CREAM_RGB);
    ctx.globalAlpha = 1;
    cornetAt(ctx, pic, p.x, p.y, size, dir, spin);
    return;
  }
  // Lying on the floor: a slow bob, a soft pink ring under it so she can see where to walk, a glint now and then.
  const k = clamp(p.life / .4, 0, 1);
  const bob = Math.sin(p.age * 4 + (p.wave ?? 0)) * 1.5;
  ctx.globalAlpha = k * .35;
  ctx.fillStyle = '#ff9fd8';
  ctx.beginPath(); ctx.ellipse(p.x, FLOOR - 1, 20, 5, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = k;
  cornetAt(ctx, pic, p.x, FLOOR - size * .2 + bob, size * .9, dir, -.1 * dir);
  const g = (p.age * .7 + (p.wave ?? 0) * .23) % 1;
  if (g < .18) {
    ctx.globalAlpha = k * (1 - g / .18);
    ctx.fillStyle = '#ffffff';
    sparkle(ctx, p.x + 10, FLOOR - size * .38, 7);
  }
}
function drawCrumb(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const k = el / e.max;
  ctx.globalAlpha = (1 - k) * .55;
  glow(ctx, e.x, e.y, 26 + k * 26, COCOA_RGB);
  burst(el, 13, { n: n(12, lite), speed: [90, 260], life: .5, gravity: 700, drag: .5 }, (x, y, kk, i) => {
    ctx.globalAlpha = 1 - kk;
    ctx.fillStyle = i % 3 === 0 ? CHOCO : CRUMB;
    dot(ctx, x, y, i % 3 === 0 ? 3.2 : 2.4);
  }, e.x, e.y);
}
function drawYum(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const k = el / e.max;
  ctx.globalAlpha = (1 - k);
  ctx.fillStyle = '#ff6fc4';
  heart(ctx, e.x, e.y - 20 - ease(k) * 36, 9 + Math.sin(Math.min(1, k * 4) * Math.PI) * 3);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < (lite ? 2 : 4); i++) {
    const a = (i / 4) * TAU + k * 2;
    ctx.globalAlpha = (1 - k) * .9;
    sparkle(ctx, e.x + Math.cos(a) * (18 + k * 26), e.y - 20 + Math.sin(a) * (12 + k * 18), 5 * (1 - k) + 1);
  }
}

/* ---- O 告一段"螺" ---- */

/** The drill she holds, drawn UNDER her body (RIMI_BACK) so her own forearms and hands lie over its tail and it reads
 *  as gripped, not pasted on: a soft shadow where her hands close on it, a contact shadow on the floor, a thrust and
 *  recoil on every tick, a spin blur of two faint copies, glints racing to the tip, chocolate flung off the open end.
 *  Wrong way round first (哪边才是上面？), flipped tip-first. e.n is the move's mode, e.age its clock. */
function drawDrill(ctx: CanvasRenderingContext2D, e: Effect, lite: boolean, images?: ImageCache): void {
  const dir = e.dir ?? 1;
  const h = (e.radius ?? 172) * RIMI_POSE;
  const t = e.age ?? 0;
  const mode = e.n ?? DRILL.wind;
  const size = RIMI_DRAW.drill;
  const pic = cornetPic(images);
  const fade = clamp(e.life / .1, 0, 1);
  // Where her hands are in the O cells: arms out in front at shoulder height. The tail sits under them, so her
  // hands close over its last sixth.
  const grip = { x: e.x + dir * h * .4, y: e.y - h * .67 };
  let rot = 0, flip = 1, push = 0, jitter = 0;
  if (mode === DRILL.wind) {
    const u = clamp((t - .06) / .12, 0, 1);
    flip = u < .5 ? -1 : 1;
    rot = -(1 - Math.abs(u * 2 - 1)) * .5;
  } else if (mode === DRILL.drill) {
    const ph = (t % RIMI_DRILL.tick) / RIMI_DRILL.tick;
    push = Math.sin(ph * Math.PI) * 7;
    jitter = (hash(Math.floor(t * 50), 2) - .5) * 2;
  }
  const cx = grip.x + dir * (size * .24 + push), cy = grip.y + jitter;
  const pool = poolStamp();
  if (pool) {
    ctx.globalAlpha = fade * .35;
    ctx.drawImage(pool, cx - size * .4, FLOOR - 7, size * .8, 14);
  }
  if (mode === DRILL.drill && !lite) {
    // Spin blur: two faint copies a hair turned either way.
    ctx.globalAlpha = fade * .22;
    cornetAt(ctx, pic, cx - dir * 4, cy, size, dir, .05);
    cornetAt(ctx, pic, cx - dir * 4, cy, size, dir, -.05);
  }
  ctx.globalAlpha = fade;
  cornetAt(ctx, pic, cx, cy, size, dir * flip, rot);
  // Her grip: the tail darkens where her hands close round it.
  ctx.globalAlpha = fade * .5;
  glow(ctx, grip.x + dir * 6, grip.y + 4, 24, '40,20,12');
  if (mode !== DRILL.drill) return;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < (lite ? 2 : 4); i++) {
    const u = (t * 5 + i / 4) % 1;
    const x = cx + dir * (-size * .2 + u * size * .58);
    const r = size * .19 * (1 - u * .85);
    ctx.globalAlpha = fade * .5 * Math.sin(u * Math.PI);
    ctx.strokeStyle = '#fff3e0';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(x, cy, Math.max(1, r * .28), Math.max(1, r), 0, -Math.PI / 2, Math.PI / 2, dir < 0); ctx.stroke();
  }
  ctx.globalAlpha = fade * .7;
  ctx.fillStyle = '#ffffff';
  sparkle(ctx, cx + dir * size * .42, cy, 7 + Math.sin(t * 40) * 2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = CHOCO;
  for (let i = 0; i < (lite ? 3 : 6); i++) {
    const u = (t * 3 + hash(i, 7)) % 1;
    ctx.globalAlpha = fade * (1 - u);
    drop(ctx, cx - dir * (size * .3 + u * 40), cy + (hash(i, 8) - .5) * 26 + u * u * 70, 3.2 * (1 - u * .5), -dir * 120, 80 + u * 200);
  }
  for (let i = 0; i < (lite ? 2 : 3); i++) {
    const u = (t * 2.4 + i / 3) % 1;
    ctx.globalAlpha = fade * (1 - u) * .45;
    glow(ctx, e.x - dir * (10 + u * 60), FLOOR - 8 - u * 20, 16 + u * 16, COCOA_RGB);
  }
}
/** She lets go of the drill: it drops from where her hands were, bounces once on its side and fades. */
function drawDrop(ctx: CanvasRenderingContext2D, e: Effect, el: number, images?: ImageCache): void {
  const dir = e.dir ?? 1;
  const h = (e.radius ?? 172) * RIMI_POSE;
  const size = RIMI_DRAW.drill;
  const x0 = e.x + dir * (h * .4 + size * .24), y0 = e.y - h * .67;
  const rest = FLOOR - size * .2;
  const fall = Math.sqrt(2 * (rest - y0) / 1800);
  let y = rest, rot = dir * .5;
  if (el < fall) { y = y0 + 900 * el * el; rot = dir * (el / fall) * .5; }
  else {
    const b = el - fall;
    y = rest - Math.max(0, Math.sin(Math.min(1, b / .22) * Math.PI)) * 14;
    rot = dir * (.5 - Math.min(1, b / .22) * .5);
  }
  ctx.globalAlpha = clamp(e.life / .2, 0, 1);
  const pool = poolStamp();
  if (pool) {
    ctx.globalAlpha *= .35 * clamp(1 - (rest - y) / 120, 0, 1);
    ctx.drawImage(pool, x0 + dir * 8 - size * .4, FLOOR - 7, size * .8, 14);
    ctx.globalAlpha = clamp(e.life / .2, 0, 1);
  }
  cornetAt(ctx, cornetPic(images), x0 + dir * Math.min(el, fall) * 40, y, size, dir, rot);
}
function drawSpray(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const dir = e.dir ?? 1;
  const k = el / e.max;
  ctx.globalAlpha = (1 - k) * .6;
  glow(ctx, e.x + dir * 30, e.y, 40 + k * 50, COCOA_RGB);
  ctx.fillStyle = CHOCO;
  burst(el, 19, { n: n(18, lite), speed: [220, 520], life: .55, gravity: 900, drag: .5, angle: dir > 0 ? -.25 : Math.PI + .25, spread: 1.4 }, (x, y, kk, i) => {
    ctx.globalAlpha = 1 - kk;
    const vx = dir * 300, vy = -120 + kk * 600;
    drop(ctx, x, y, (i % 3 === 0 ? 5.5 : 3.6) * (1 - kk * .4), vx, vy);
  }, e.x, e.y);
  // A splat on the floor where it comes down.
  ctx.globalAlpha = clamp((el - .18) / .1, 0, 1) * (1 - k) * .8;
  ctx.beginPath(); ctx.ellipse(e.x + dir * 90, FLOOR - 2, 40 * ease((el - .18) / .2), 7, 0, 0, TAU); ctx.fill();
}

/* ---- L 我的心是巧克力螺 ---- */

function drawBite(ctx: CanvasRenderingContext2D, e: Effect, lite: boolean): void {
  const h = (e.radius ?? 172) * RIMI_POSE;
  const t = e.age ?? 0;
  const dir = e.dir ?? 1;
  const mx = e.x + dir * 14, my = e.y - h * .78;
  // Cheeks full: two pink puffs; hearts rising faster and faster.
  ctx.globalAlpha = clamp(t / .2, 0, 1) * .75;
  ctx.fillStyle = '#ff9fd8';
  ctx.beginPath(); ctx.ellipse(mx - 8, my + 6, 7, 4, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(mx + 12, my + 6, 7, 4, 0, 0, TAU); ctx.fill();
  for (let i = 0; i < (lite ? 3 : 5); i++) {
    const u = (t * (1.2 + t) + i / 5) % 1;
    ctx.globalAlpha = (1 - u) * .9;
    ctx.fillStyle = i % 2 ? '#ff6fc4' : '#ffc0e6';
    heart(ctx, mx + (hash(i, 4) - .5) * 50, my - 10 - u * 70, 5 + (1 - u) * 4);
  }
}
function drawPoof(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const k = el / e.max;
  const r = e.radius ?? 120;
  burst(el, 31, { n: n(12, lite), speed: [80, 260], life: .7, gravity: -60, drag: .3 }, (x, y, kk, i) => {
    ctx.globalAlpha = (1 - kk) * .8;
    glow(ctx, x, y, 22 + kk * 34, i % 3 === 0 ? COCOA_RGB : PINK_RGB);
  }, e.x, FLOOR - r * .6);
  ctx.globalAlpha = (1 - k) * .7;
  ctx.strokeStyle = '#ffe0f2';
  ctx.lineWidth = 3 * (1 - k) + 1;
  ctx.beginPath(); ctx.arc(e.x, FLOOR - r * .6, r * .3 + ease(k) * r, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < (lite ? 4 : 8); i++) {
    const a = (i / 8) * TAU;
    sparkle(ctx, e.x + Math.cos(a) * (30 + k * r), FLOOR - r * .6 + Math.sin(a) * (30 + k * r), 7 * (1 - k) + 1);
  }
}
/** The giant cornet rolling tip-first along the floor, with a wake of chocolate splashes and cocoa dust. e.tx is
 *  which way it is rolling, e.n the mode (the turn squashes it against the wall). */
function drawGiant(ctx: CanvasRenderingContext2D, e: Effect, lite: boolean, images?: ImageCache): void {
  const dir = e.tx ?? e.dir ?? 1;
  const t = e.age ?? 0;
  const size = RIMI_DRAW.giant;
  const turning = e.n === ROLL.turn;
  const fade = clamp(e.life / .1, 0, 1);
  const sq = turning ? 1 - .14 * Math.sin(clamp((t % RIMI_ROLL.turn) / RIMI_ROLL.turn, 0, 1) * Math.PI) : 1;
  const wob = Math.sin(t * 26) * .025;
  // Shadow.
  ctx.globalAlpha = fade * .35;
  ctx.fillStyle = '#1b0f0a';
  ctx.beginPath(); ctx.ellipse(e.x, FLOOR - 1, size * .38, 10, 0, 0, TAU); ctx.fill();
  // The wake behind.
  if (!turning) {
    ctx.fillStyle = CHOCO;
    for (let i = 0; i < (lite ? 3 : 6); i++) {
      const u = (t * 4 + i / 6) % 1;
      const bx = e.x - dir * (size * .36 + u * 110);
      ctx.globalAlpha = fade * (1 - u) * .9;
      drop(ctx, bx + (hash(i, 9) - .5) * 20, FLOOR - 10 - Math.sin(u * Math.PI) * 46, 5 * (1 - u * .6), -dir * 80, -60 + u * 300);
    }
    for (let i = 0; i < (lite ? 2 : 4); i++) {
      const u = (t * 2.2 + i / 4) % 1;
      ctx.globalAlpha = fade * (1 - u) * .45;
      glow(ctx, e.x - dir * (size * .3 + u * 90), FLOOR - 14 - u * 30, 22 + u * 26, COCOA_RGB);
    }
  }
  ctx.globalAlpha = fade;
  stampAt(ctx, giantPic(images), e.x, FLOOR - size * .2, size, dir, wob, sq, 2 - sq);
  if (turning) return;
  // Spinning: crescents of light run to the tip, and a sparkle rides the tip.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < (lite ? 2 : 3); i++) {
    const u = (t * 4 + i / 3) % 1;
    const x = e.x + dir * (-size * .3 + u * size * .62);
    const r = size * .18 * (1 - u * .8);
    ctx.globalAlpha = fade * .5 * Math.sin(u * Math.PI);
    ctx.strokeStyle = '#fff3e0';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(x, FLOOR - size * .2, Math.max(1, r * .3), Math.max(1, r), 0, -Math.PI / 2, Math.PI / 2, dir < 0); ctx.stroke();
  }
  ctx.globalAlpha = fade * .8;
  ctx.fillStyle = '#ffffff';
  sparkle(ctx, e.x + dir * size * .44, FLOOR - size * .2, 10 + Math.sin(t * 30) * 3);
  ctx.globalCompositeOperation = 'source-over';
}
function drawSquish(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const k = el / e.max;
  ctx.globalAlpha = (1 - k) * .7;
  ctx.fillStyle = CHOCO;
  ctx.beginPath(); ctx.ellipse(e.x, FLOOR - 1, (e.radius ?? 60) * (.5 + ease(k) * .6), 6, 0, 0, TAU); ctx.fill();
}
function drawPress(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const k = el / e.max;
  ctx.globalAlpha = (1 - k) * .5;
  glow(ctx, e.x, e.y, 20 + k * 30, COCOA_RGB);
  burst(el, 7 + (e.n ?? 0), { n: n(6, lite), speed: [60, 180], life: .3, gravity: 600, angle: -Math.PI / 2, spread: 2.2 }, (x, y, kk) => {
    ctx.globalAlpha = 1 - kk;
    ctx.fillStyle = CRUMB;
    dot(ctx, x, y, 2.6);
  }, e.x, e.y);
}
function drawLaunch(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const k = el / e.max;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (1 - k) * .8;
  glow(ctx, e.x, e.y - 20, 50 + k * 70, PINK_RGB);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#ffd6ee';
  ctx.lineWidth = 3 * (1 - k) + 1;
  ctx.globalAlpha = (1 - k) * .8;
  ctx.beginPath(); ctx.arc(e.x, e.y - 20, 20 + ease(k) * 110, 0, TAU); ctx.stroke();
  burst(el, 23, { n: n(14, lite), speed: [180, 420], life: .6, gravity: 500, drag: .5 }, (x, y, kk, i) => {
    ctx.globalAlpha = 1 - kk;
    ctx.fillStyle = i % 3 === 0 ? '#ff6fc4' : i % 3 === 1 ? CRUMB : CHOCO;
    if (i % 3 === 0) heart(ctx, x, y, 5 * (1 - kk) + 2); else dot(ctx, x, y, 3);
  }, e.x, e.y - 20);
}
function drawSlurp(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const k = el / e.max;
  ctx.globalAlpha = 1 - k;
  ctx.fillStyle = '#ff6fc4';
  heart(ctx, e.x, e.y - 24 - k * 40, 7);
  ctx.fillStyle = '#ffffff';
  sparkle(ctx, e.x + 12, e.y - 10 - k * 20, 6 * (1 - k) + 1);
}
function drawWall(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const dir = e.dir ?? 1;
  const k = el / e.max;
  ctx.globalAlpha = (1 - k) * .8;
  ctx.strokeStyle = '#ffe0f0';
  ctx.lineWidth = 4 * (1 - k) + 1;
  ctx.beginPath(); ctx.ellipse(e.x, e.y, 14 + k * 20, (e.radius ?? 90) * (.4 + ease(k) * .6), 0, 0, TAU); ctx.stroke();
  burst(el, 37, { n: n(10, lite), speed: [100, 260], life: .45, gravity: 400, angle: dir > 0 ? Math.PI : 0, spread: 1.6 }, (x, y, kk, i) => {
    ctx.globalAlpha = 1 - kk;
    ctx.fillStyle = i % 2 ? CRUMB : CHOCO;
    dot(ctx, x, y, 3);
  }, e.x, e.y);
}
function drawSpit(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const h = (e.radius ?? 172) * RIMI_POSE;
  ctx.globalAlpha = (1 - ease(el / .3)) * .8;
  ctx.strokeStyle = '#ffd0ea';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(e.x, FLOOR - h * .4, 20 + ease(el / .3) * 90, 0, TAU); ctx.stroke();
  burst(el, 11, { n: n(8, lite), speed: [60, 160], life: .45, gravity: -40, drag: .4 }, (x, y, kk) => {
    ctx.globalAlpha = (1 - kk) * .6;
    glow(ctx, x, y, 14 + kk * 14, PINK_RGB);
  }, e.x, FLOOR - h * .4);
  // A little burp: one pink bubble wobbling up from her mouth.
  const u = clamp((el - .3) / .55, 0, 1);
  if (u > 0 && u < 1) {
    const bx = e.x + (e.dir ?? 1) * 18 + Math.sin(u * 9) * 3, by = FLOOR - h * .56 - u * 50;
    const r = 6 + u * 5;
    ctx.globalAlpha = (1 - u) * .85;
    ctx.strokeStyle = '#ff8fd0';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    dot(ctx, bx - r * .35, by - r * .35, 1.8);
  }
}

export function drawRimiFx(ctx: CanvasRenderingContext2D, e: Effect, lite = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('rimi-') || e.type.includes('@')) return false;
  const el = e.max - e.life;
  ctx.save();
  beginBase(ctx);
  switch (e.type) {
    case 'rimi-tvdim': drawTvDim(ctx, e, el, lite); break;
    case 'rimi-tvset': drawTv(ctx, e, el, lite, images); break;
    case 'rimi-ghostpuff': drawGhostPuff(ctx, e, el, lite); break;
    case 'rimi-cheer': drawCheer(ctx, e, lite); break;
    case 'rimi-crumb': drawCrumb(ctx, e, el, lite); break;
    case 'rimi-plop': {
      const k = el / e.max;
      ctx.globalAlpha = (1 - k) * .6;
      ctx.strokeStyle = '#e8d6c0';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 2, (e.radius ?? 22) * (.5 + k), 4 + k * 3, 0, 0, TAU); ctx.stroke();
      break;
    }
    case 'rimi-yum': drawYum(ctx, e, el, lite); break;
    case 'rimi-drill': drawDrill(ctx, e, lite, images); break;
    case 'rimi-drillgo': {
      const k = el / e.max, dir = e.dir ?? 1, h = e.radius ?? 172;
      ctx.globalAlpha = (1 - k) * .6;
      glow(ctx, e.x - dir * 20, FLOOR - 16, 30 + k * 30, CREAM_RGB);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 1 - k;
      sparkle(ctx, e.x + dir * (RIMI_DRILL.carry + 30), e.y - h * .5, 12 * (1 - k) + 2);
      break;
    }
    case 'rimi-grind': {
      const k = el / e.max, dir = e.dir ?? 1;
      burst(el, 5 + (e.n ?? 0), { n: n(7, lite), speed: [120, 300], life: .25, gravity: 500, angle: dir > 0 ? -2.4 : -.7, spread: 1.6 }, (x, y, kk, i) => {
        ctx.globalAlpha = 1 - kk;
        ctx.fillStyle = i % 2 ? CRUMB : '#fff0d8';
        dot(ctx, x, y, 2.6);
      }, e.x, e.y);
      ctx.globalAlpha = (1 - k) * .5;
      glow(ctx, e.x, e.y, 18 + k * 16, CREAM_RGB);
      break;
    }
    case 'rimi-spray': drawSpray(ctx, e, el, lite); break;
    case 'rimi-drop': drawDrop(ctx, e, el, images); break;
    case 'rimi-bite': drawBite(ctx, e, lite); break;
    case 'rimi-poof': drawPoof(ctx, e, el, lite); break;
    case 'rimi-giant': drawGiant(ctx, e, lite, images); break;
    case 'rimi-squish': drawSquish(ctx, e, el); break;
    case 'rimi-press': drawPress(ctx, e, el, lite); break;
    case 'rimi-launch': drawLaunch(ctx, e, el, lite); break;
    case 'rimi-slurp': drawSlurp(ctx, e, el); break;
    case 'rimi-wall': drawWall(ctx, e, el, lite); break;
    case 'rimi-spit': drawSpit(ctx, e, el, lite); break;
    default:
      ctx.restore();
      base = null;
      return false;
  }
  ctx.restore();
  base = null;
  return true;
}

export function drawRimiShot(ctx: CanvasRenderingContext2D, p: Projectile, lite = false, images?: ImageCache): boolean {
  if (!p.fx.startsWith('rimi-')) return false;
  ctx.save();
  beginBase(ctx);
  switch (p.fx) {
    case 'rimi-tv': drawGhost(ctx, p, lite, images); break;
    case 'rimi-cornet': drawCornetShot(ctx, p, images); break;
    default:
      ctx.restore();
      base = null;
      return false;
  }
  ctx.restore();
  base = null;
  return true;
}

/* ---- 'rimi-hands' (定身 from 今晚放映恐怖片): two pale little hands out of the floor, holding the ankles ---- */

/** A pale little hand up out of the floor, four fingers curled over an ankle; two grips, painted once each. */
function handStamp(grip: 0 | 1): HTMLCanvasElement | null {
  return softStamp('hand' + grip, 40, 40, g => {
    g.translate(20, 32);
    g.fillStyle = '#eceaf4';
    g.strokeStyle = '#8f8aa6';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-5, 6); g.lineTo(-5, -14); g.quadraticCurveTo(-4, -24, 6, -26);
    g.lineTo(10 + grip * 2, -22); g.lineTo(9, -16); g.lineTo(4, -14); g.lineTo(5, 6);
    g.closePath();
    g.fill(); g.stroke();
  });
}
function hand(ctx: CanvasRenderingContext2D, x: number, y: number, side: number, grip: number): void {
  const c = handStamp(grip > .5 ? 1 : 0);
  if (!c) return;
  // The wrist on the floor is 12 px below the stamp's centre.
  stampAt(ctx, c, x, y - 12, 40, side);
}
export function auraRimiHands(ctx: CanvasRenderingContext2D, f: Fighter, bodyH: number, left: number, t: number): void {
  const fade = Math.min(1, left / .25);
  const grip = Math.sin(t * 9) * .5 + .5;
  ctx.save();
  beginBase(ctx);
  ctx.globalAlpha = fade * .45;
  ctx.fillStyle = '#0d0a14';
  ctx.beginPath(); ctx.ellipse(f.x, FLOOR, 34, 6, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = fade;
  hand(ctx, f.x - 10, FLOOR, -1, grip);
  hand(ctx, f.x + 10, FLOOR, 1, 1 - grip);
  // Cold motes drifting up off them.
  for (let i = 0; i < 3; i++) {
    const u = (t * .8 + i / 3) % 1;
    ctx.globalAlpha = fade * (1 - u) * .5;
    glow(ctx, f.x + (i - 1) * 16 + Math.sin(u * 5 + i) * 4, FLOOR - 10 - u * bodyH * .3, 7 + u * 6, CREAM_RGB);
  }
  ctx.restore();
  base = null;
}
export function applyRimiHands(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  burst(age, 47, { n: 8, speed: [40, 120], life: .5, gravity: -60, drag: .4, angle: -Math.PI / 2, spread: 2.4 }, (x, y, k) => {
    ctx.globalAlpha = (1 - k) * .7;
    glow(ctx, x, y, 10 + k * 12, CREAM_RGB);
  }, e.x, FLOOR - 6);
  ctx.restore();
}

/* ---- 'rimi-choco' (冻僵 from 告一段"螺"): chocolate dripping slowly off the body into a puddle at the feet ---- */

export function auraRimiChoco(ctx: CanvasRenderingContext2D, f: Fighter, bodyH: number, left: number, t: number): void {
  const fade = Math.min(1, left / .3);
  ctx.save();
  ctx.globalAlpha = fade * .75;
  ctx.fillStyle = CHOCO;
  ctx.beginPath(); ctx.ellipse(f.x, FLOOR - 1, 26 + Math.sin(t * 2) * 2, 5, 0, 0, TAU); ctx.fill();
  for (let i = 0; i < 5; i++) {
    const u = (t * .7 + hash(i, 12)) % 1;
    const x = f.x + (hash(i, 13) - .5) * 40;
    const y0 = f.y - bodyH * (.45 + hash(i, 14) * .4);
    ctx.globalAlpha = fade * (u < .85 ? 1 : (1 - u) / .15);
    drop(ctx, x, y0 + (FLOOR - y0) * u * u, 2.8 + hash(i, 15) * 1.4, 0, 1);
  }
  ctx.globalAlpha = fade * .5;
  ctx.fillStyle = '#8a5236';
  for (let i = 0; i < 3; i++) dot(ctx, f.x + (i - 1) * 14, f.y - bodyH * (.55 + i * .08), 3.4);
  ctx.restore();
}
export function applyRimiChoco(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  ctx.fillStyle = CHOCO;
  burst(age, 53, { n: 10, speed: [80, 200], life: .45, gravity: 700, drag: .5, angle: -Math.PI / 2, spread: 2.6 }, (x, y, k) => {
    ctx.globalAlpha = 1 - k;
    dot(ctx, x, y, 3);
  }, e.x, e.y - 90);
  ctx.restore();
}
