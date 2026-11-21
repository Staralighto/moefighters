import type { Effect, Projectile } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, clamp } from '../game/constants.ts';
import { CELL, KAORU_FANS, KAORU_FANS_SRC } from './clips.ts';
import { TAU, burst, cycle, dot, glow, hash, petal, sparkle } from './fxParticles.ts';

/* 濑田薰 — 紫蔷薇、追光和小猫咪们. Three registers:
   - violet and lilac rose petals for everything she does herself: the leap, the landing, the quote vortex, the
     giant rose of 终幕 and the storm it breaks into. Petals drift and fade slowly — 儚い, here and gone;
   - stage white for the spotlight and the sparkle she gives off when she poses (and when she faints, smiling);
   - pink for her fans (fans.png under a pink wash, with a white rim and afterimages), and their hearts.
   Nothing written on screen. Shapes stay big and soft; the busiest moment, the storm, is about 30 petals.
   The giant rose, its leaves and heart, the spotlight cone and the closing light-petals are painted once into
   cached stamps (gradients included) and only drawImage after that. A petal's rolled lip is five baked curls.
   No shadowBlur. */

export const KAORU_BACK: readonly string[] = ['kaoru-mark', 'kaoru-spot', 'kaoru-fans', 'kaoru-swoon', 'kaoru-shy'];
export const KAORU_SCREEN_BACK: readonly string[] = [];

const VIOLET = '#AA33CC';
const LILAC = '#d9a8ff';
const ROSE = '#c25ad8';
const PINK = '#ff9ed2';
const VIO_RGB = '170,51,204';
const LILAC_RGB = '217,168,255';
const PINK_RGB = '255,158,210';
const WHITE_RGB = '255,246,252';
const PETALS = [VIOLET, LILAC, ROSE] as const;

const count = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;

/* Gradients live in these stamps. A frame of 终幕 only transforms them. */
const stamps = new Map<string, HTMLCanvasElement | null>();
function stamp(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
  const hit = stamps.get(key);
  if (hit !== undefined) return hit;
  let c: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined') {
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (g) paint(g); else c = null;
  }
  stamps.set(key, c);
  return c;
}

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

const tintCache = new WeakMap<CanvasImageSource, Map<string, HTMLCanvasElement>>();
/** One cell of a picture as a flat silhouette in one colour, baked once. */
function tinted(src: CanvasImageSource, sx: number, sy: number, color: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let per = tintCache.get(src);
  if (!per) { per = new Map(); tintCache.set(src, per); }
  const key = sx + ',' + sy + '|' + color;
  const got = per.get(key);
  if (got) return got;
  const c = document.createElement('canvas');
  c.width = CELL; c.height = CELL;
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(src, sx, sy, CELL, CELL, 0, 0, CELL, CELL);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, CELL, CELL);
  if (per.size >= 24) per.clear();
  per.set(key, c);
  return c;
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  if (!(s > 0)) return;
  ctx.beginPath();
  ctx.moveTo(x, y + s * .9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * .1, x - s * .6, y - s * 1.2, x, y - s * .35);
  ctx.bezierCurveTo(x + s * .6, y - s * 1.2, x + s * 1.4, y - s * .1, x, y + s * .9);
  ctx.fill();
}

/** Fan i (0..3) of fans.png, `row` 0 cheering / 1 swooning, standing at x on the floor y, facing dir.
 *  Her own colours under a pink wash (`wash` 0..1), a white rim, afterimages while she runs (`trail` px). */
const FAN_H = 166;
function fan(ctx: CanvasRenderingContext2D, images: ImageCache | undefined, i: number, row: number, x: number, y: number, dir: number,
  fade: number, wash: number, trail: number, lite: boolean): void {
  if (!(fade > 0)) return;
  const im = image(images, KAORU_FANS_SRC);
  const h = FAN_H;
  // Contact shadow.
  ctx.globalAlpha = fade * .28;
  ctx.fillStyle = '#000000';
  ctx.beginPath(); ctx.ellipse(x, y + 2, 28, 6, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  if (im) {
    const sx = (i % KAORU_FANS) * CELL, sy = row * CELL;
    const sil = tinted(im, sx, sy, PINK);
    const rim = tinted(im, sx, sy, '#ffffff');
    ctx.imageSmoothingEnabled = true;
    if (sil && trail > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 1, n = count(3, lite); k <= n; k++) {
        ctx.globalAlpha = fade * .18 / k;
        ctx.drawImage(sil, -h / 2 - k * trail, -h, h, h);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (rim) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * .3;
      ctx.drawImage(rim, -h * 1.04 / 2, -h * 1.04, h * 1.04, h * 1.04);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = fade;
    ctx.drawImage(im, sx, sy, CELL, CELL, -h / 2, -h, h, h);
    if (sil) { ctx.globalAlpha = fade * wash; ctx.drawImage(sil, -h / 2, -h, h, h); }
  } else {
    ctx.globalAlpha = fade * .85;
    ctx.fillStyle = PINK;
    ctx.beginPath(); ctx.roundRect(-18, -h * .74, 36, h * .74, 12); ctx.fill();
    dot(ctx, 0, -h * .84, 16);
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = fade * .14;
  glow(ctx, x, y - h * .45, h * .4, PINK_RGB);
  ctx.globalCompositeOperation = 'source-over';
}

/** Where fan i peeks out behind her (offset from her feet, toward her back), and how high she stands (a step back is lower). */
const PEEK: readonly [number, number][] = [[-58, 0], [-104, 6], [52, 4], [-150, 10]];

/* ---- the three flightless birds (企鹅、鸵鸟、小鸡), plain shapes, ~14 px ---- */
function bird(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, s: number, dir: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * s, s);
  if (kind === 0) {
    // Penguin: black egg, white belly, orange beak and feet.
    ctx.fillStyle = '#26232e';
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 10, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(1.6, 2, 4.4, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffa23a';
    ctx.beginPath(); ctx.moveTo(5, -5); ctx.lineTo(10, -3.5); ctx.lineTo(5, -2.4); ctx.fill();
    ctx.fillRect(-4, 9, 3.5, 2); ctx.fillRect(1, 9, 3.5, 2);
  } else if (kind === 1) {
    // Ostrich: brown body, long pale neck and legs, small head.
    ctx.strokeStyle = '#e9c9a6';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(4, -2); ctx.quadraticCurveTo(8, -9, 6, -15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, 4); ctx.lineTo(-3, 13); ctx.moveTo(2, 4); ctx.lineTo(3, 13); ctx.stroke();
    ctx.fillStyle = '#5a3f33';
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 6, -.15, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f4f0ea';
    ctx.beginPath(); ctx.ellipse(-7, -2, 3.5, 2.6, .4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e9c9a6';
    dot(ctx, 6.5, -15.5, 2.6);
  } else {
    // Chick: round yellow, a tiny beak and a little wing.
    ctx.fillStyle = '#ffe066';
    dot(ctx, 0, 0, 8);
    ctx.fillStyle = '#ffd03a';
    ctx.beginPath(); ctx.ellipse(-2.5, 1.5, 4, 2.8, .3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff9a3a';
    ctx.beginPath(); ctx.moveTo(7, -1.5); ctx.lineTo(11, 0); ctx.lineTo(7, 1.5); ctx.fill();
  }
  ctx.fillStyle = '#1a1622';
  dot(ctx, kind === 1 ? 7.5 : 3.5, kind === 1 ? -16 : -4, 1.1);
  ctx.restore();
}

/* ---- one big rose petal of 终幕, side-on: a cupped blade from the floor up, `h` tall, `w` wide, tipped by `lean`.
   `inner` shows the petal's inside (paler, blush-pink at the heart) — the back half of the cup; otherwise the outside
   (deeper violet, see-through, so the body inside still reads). `curl` 0..1 rolls the lip outward, the way a real rose
   petal's edge turns back. A faint vein, a lit rim and a pale rolled lip carry the detail; no outlines.
   Painted once per side and curl step; a frame only scales and fades the stamp. Fade rides on globalAlpha. ---- */
const PETAL_W = 54, PETAL_H = 180, PETAL_CX = 75, PETAL_FOOT = 208;
function paintBigPetal(ctx: CanvasRenderingContext2D, w: number, h: number, inner: boolean, curl: number): void {
  const a = (v: number) => v.toFixed(3);
  // The blade: narrow at the foot, swelling at two thirds, a soft notch at the tip.
  const blade = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-w * .25, -h * .05, -w * .98, -h * .34, -w * .92, -h * .7);
    ctx.quadraticCurveTo(-w * .8, -h * 1.02, -w * .2, -h * .98);
    ctx.quadraticCurveTo(0, -h * .91, w * .2, -h * .98);
    ctx.quadraticCurveTo(w * .8, -h * 1.02, w * .92, -h * .7);
    ctx.bezierCurveTo(w * .98, -h * .34, w * .25, -h * .05, 0, 0);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(0, 0, 0, -h);
  if (inner) {
    g.addColorStop(0, `rgba(120,30,150,${a(.95)})`);
    g.addColorStop(.35, `rgba(${VIO_RGB},${a(.85)})`);
    g.addColorStop(.75, `rgba(236,170,232,${a(.75)})`);
    g.addColorStop(1, `rgba(${WHITE_RGB},${a(.8)})`);
  } else {
    g.addColorStop(0, `rgba(96,24,128,${a(.75)})`);
    g.addColorStop(.45, `rgba(${VIO_RGB},${a(.42)})`);
    g.addColorStop(.85, `rgba(${LILAC_RGB},${a(.32)})`);
    g.addColorStop(1, `rgba(${WHITE_RGB},${a(.4)})`);
  }
  ctx.fillStyle = g;
  blade();
  ctx.fill();
  // Shading across the cup: one side of the blade a touch darker, so it reads curved, not flat.
  const s = ctx.createLinearGradient(-w, 0, w, 0);
  s.addColorStop(0, `rgba(40,8,60,${a(inner ? .28 : .18)})`);
  s.addColorStop(.55, 'rgba(40,8,60,0)');
  s.addColorStop(1, `rgba(255,255,255,${a(.1)})`);
  ctx.fillStyle = s;
  blade();
  ctx.fill();
  // A faint centre vein and two side veins.
  ctx.strokeStyle = `rgba(255,236,250,${a(inner ? .28 : .2)})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -h * .04); ctx.quadraticCurveTo(w * .05, -h * .5, 0, -h * .88);
  ctx.moveTo(0, -h * .2); ctx.quadraticCurveTo(-w * .4, -h * .5, -w * .5, -h * .78);
  ctx.moveTo(0, -h * .2); ctx.quadraticCurveTo(w * .4, -h * .5, w * .5, -h * .78);
  ctx.stroke();
  // The lit rim: the edge catches the spotlight.
  ctx.strokeStyle = `rgba(255,240,252,${a(inner ? .5 : .65)})`;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-w * .92, -h * .7);
  ctx.quadraticCurveTo(-w * .8, -h * 1.02, -w * .2, -h * .98);
  ctx.quadraticCurveTo(0, -h * .91, w * .2, -h * .98);
  ctx.quadraticCurveTo(w * .8, -h * 1.02, w * .92, -h * .7);
  ctx.stroke();
  // The rolled lip: a pale crescent turning back over the edge.
  if (curl > .02) {
    const c = curl;
    const lip = ctx.createLinearGradient(0, -h * .8, 0, -h * (1.02 + .1 * c));
    lip.addColorStop(0, `rgba(${LILAC_RGB},${a(0)})`);
    lip.addColorStop(.5, `rgba(250,214,246,${a(.55 * c)})`);
    lip.addColorStop(1, `rgba(255,255,255,${a(.85 * c)})`);
    ctx.fillStyle = lip;
    ctx.beginPath();
    ctx.moveTo(-w * .9, -h * .78);
    ctx.quadraticCurveTo(-w * .7, -h * (1.04 + .1 * c), 0, -h * (.97 + .08 * c));
    ctx.quadraticCurveTo(w * .7, -h * (1.04 + .1 * c), w * .9, -h * .78);
    ctx.quadraticCurveTo(w * .45, -h * (.9 - .03 * c), 0, -h * .9);
    ctx.quadraticCurveTo(-w * .45, -h * (.9 - .03 * c), -w * .9, -h * .78);
    ctx.fill();
  }
}
function petalStamp(inner: boolean, q: number): HTMLCanvasElement | null {
  return stamp('petal' + (inner ? 1 : 0) + q, PETAL_CX * 2, PETAL_FOOT + 12, g => {
    g.translate(PETAL_CX, PETAL_FOOT);
    paintBigPetal(g, PETAL_W, PETAL_H, inner, q / 4);
  });
}
function bigPetal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lean: number, alpha: number,
  inner: boolean, curl: number): void {
  if (!(alpha > .01) || !(h > 2) || !(w > 1)) return;
  // ponytail: the lip is five baked curls. A live petal is the upgrade if the roll looks stepped.
  const q = Math.round(clamp(curl, 0, 1) * 4);
  const c = petalStamp(inner, q);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);
  ctx.globalAlpha *= alpha;
  if (c) {
    ctx.scale(w / PETAL_W, h / PETAL_H);
    ctx.drawImage(c, -PETAL_CX, -PETAL_FOOT);
  } else paintBigPetal(ctx, w, h, inner, curl);
  ctx.restore();
}

/** The heart of the rose seen from the side: tight petals wound round each other in a spiral, deep at the core,
 *  paler at the curled edges. `open` 0..1 loosens it. Fade rides on globalAlpha. */
const HEART_R = 40, HEART_CX = 72, HEART_CY = 72;
function paintRoseHeart(ctx: CanvasRenderingContext2D, r: number, open: number, spin: number): void {
  const g = ctx.createRadialGradient(0, 0, r * .1, 0, 0, r);
  g.addColorStop(0, 'rgba(150,46,176,.9)');
  g.addColorStop(.7, `rgba(${VIO_RGB},.9)`);
  g.addColorStop(1, 'rgba(236,170,232,.85)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  // Five wound petals: each a crescent a little larger and further round than the last.
  for (let i = 0; i < 5; i++) {
    const k = (i + 1) / 5;
    const rr = r * (.22 + .78 * k) * (1 + .12 * open);
    const a0 = spin + i * 2.4;
    ctx.fillStyle = `rgba(${i % 2 ? '246,196,240' : LILAC_RGB},${(.35 + .4 * k).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(0, 0, rr, a0, a0 + 2.3);
    ctx.arc(rr * .16 * Math.cos(a0 + 1.15), rr * .16 * Math.sin(a0 + 1.15), rr * .8, a0 + 2.3, a0, true);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,240,252,${(.6 * k).toFixed(3)})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(0, 0, rr, a0 + .2, a0 + 2.1); ctx.stroke();
  }
}
function heartStamp(q: number): HTMLCanvasElement | null {
  return stamp('heart' + q, HEART_CX * 2, HEART_CY * 2, g => {
    g.translate(HEART_CX, HEART_CY);
    paintRoseHeart(g, HEART_R, q / 3, 0);
  });
}
function roseHeart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, open: number, spin: number, alpha: number): void {
  if (!(alpha > .01) || !(r > 1)) return;
  const q = Math.round(clamp(open, 0, 1) * 3);
  const c = heartStamp(q);
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= alpha;
  // Squash first, then spin, so the wound petals stay flat the way a side-on rose is.
  ctx.scale(r / HEART_R, r / HEART_R * .62);
  ctx.rotate(spin);
  if (c) ctx.drawImage(c, -HEART_CX, -HEART_CY);
  else paintRoseHeart(ctx, HEART_R, open, 0);
  ctx.restore();
}

/** A pointed sepal or leaf lying out from the foot of the rose: deep green under a violet cast. */
const LEAF_LEN = 80;
function paintLeaf(ctx: CanvasRenderingContext2D, len: number): void {
  const g = ctx.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, 'rgba(42,70,58,.9)');
  g.addColorStop(1, 'rgba(92,120,110,.55)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * .45, -len * .26, len, 0);
  ctx.quadraticCurveTo(len * .45, len * .16, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,230,214,.35)';
  ctx.lineWidth = .9;
  ctx.beginPath(); ctx.moveTo(len * .05, 0); ctx.quadraticCurveTo(len * .5, -len * .06, len * .92, 0); ctx.stroke();
}
function leafStamp(): HTMLCanvasElement | null {
  return stamp('leaf', 100, 56, g => {
    g.translate(6, 28);
    paintLeaf(g, LEAF_LEN);
  });
}
const SPOT_TOP = -20, SPOT_CX = 100;
function spotStamp(): HTMLCanvasElement | null {
  const h = FLOOR - SPOT_TOP;
  return stamp('spot', SPOT_CX * 2, h + 2, g => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, `rgba(${WHITE_RGB},.32)`);
    gr.addColorStop(1, `rgba(${WHITE_RGB},.08)`);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(SPOT_CX - 26, 0); g.lineTo(SPOT_CX + 26, 0);
    g.lineTo(SPOT_CX + 92, h); g.lineTo(SPOT_CX - 92, h);
    g.closePath();
    g.fill();
  });
}
const BLOOM_R = 150, BLOOM_CX = 80, BLOOM_FOOT = 170;
function bloomStamp(): HTMLCanvasElement | null {
  return stamp('bloom', BLOOM_CX * 2, BLOOM_FOOT + 10, g => {
    g.translate(BLOOM_CX, BLOOM_FOOT);
    const gr = g.createLinearGradient(0, 0, 0, -BLOOM_R);
    gr.addColorStop(0, `rgba(${WHITE_RGB},.9)`);
    gr.addColorStop(1, `rgba(${VIO_RGB},0)`);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-BLOOM_R * .45, -BLOOM_R * .3, -BLOOM_R * .3, -BLOOM_R, 0, -BLOOM_R);
    g.bezierCurveTo(BLOOM_R * .3, -BLOOM_R, BLOOM_R * .45, -BLOOM_R * .3, 0, 0);
    g.fill();
  });
}
interface RosePetal { x: number; lean: number; w: number; h: number; d: number; inner: boolean; curl: number }
const roseBuf: RosePetal[] = [];
const ROSE_ROWS: readonly [number, number, number, number, number, number, number, number][] = [
  [5, 44, 54, .7, 1.0, .0, 0, .5],
  [5, 28, 46, .84, .6, .5, .25, .25],
  [4, 12, 36, .96, .26, .2, .45, 0],
];

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number, alpha: number): void {
  if (!(alpha > .01) || !(len > 1)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalAlpha *= alpha;
  const c = leafStamp();
  if (c) {
    ctx.scale(len / LEAF_LEN, len / LEAF_LEN);
    ctx.drawImage(c, -6, -28);
  } else paintLeaf(ctx, len);
  ctx.restore();
}

export function drawKaoruShot(ctx: CanvasRenderingContext2D, p: Projectile, liteFx: boolean): boolean {
  if (p.fx !== 'kaoru-quote') return false;
  const dir = Math.sign(p.vx) || 1;
  const t = p.age;
  const r = 30;
  ctx.save();
  // A soft violet core; a thin gold ring lying tilted like a halo round the swirl.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = .4 + .08 * Math.sin(t * 7);
  glow(ctx, p.x, p.y, r * 2, VIO_RGB);
  ctx.globalAlpha = .3;
  glow(ctx, p.x, p.y, r * .9, WHITE_RGB);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(255,224,150,.6)';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.15, r * .38, -.25 * dir, 0, TAU); ctx.stroke();
  // Petals on a slow spiral: inward, round, out again — it is not going anywhere fast, and neither is the meaning.
  const n = count(12, liteFx);
  for (let i = 0; i < n; i++) {
    const u = cycle(t, .55, i, 41);
    const a = i / n * TAU + t * 3.2 * dir;
    const rad = r * (.35 + .85 * Math.sin(u * Math.PI));
    const x = p.x + Math.cos(a) * rad;
    const y = p.y + Math.sin(a) * rad * .62;
    ctx.globalAlpha = .55 + .4 * Math.sin(u * Math.PI);
    petal(ctx, x, y, 6 + 2 * hash(i, 42), a + Math.PI / 2, PETALS[i % 3]);
  }
  // A few loose petals shed behind it.
  for (let i = 0, m = count(5, liteFx); i < m; i++) {
    const k = cycle(t, .9, i, 43);
    ctx.globalAlpha = (1 - k) * .6;
    petal(ctx, p.x - dir * (18 + k * 60), p.y + (hash(i, 44) - .5) * 30 + k * 18, 5 * (1 - k * .4), t * 4 + i, PETALS[i % 3]);
  }
  ctx.restore();
  return true;
}

export function drawKaoruFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('kaoru-')) return false;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    case 'kaoru-flip': {
      // The take-off: a ring of petals kicked up off the floor and a white flick where the hair goes back.
      ctx.globalAlpha = (1 - t) * .5;
      ctx.strokeStyle = LILAC;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 20 + t * 60, 5 + t * 12, 0, 0, TAU); ctx.stroke();
      burst(el, 51, { n: count(12, liteFx), speed: [90, 230], life: .5, gravity: 260, angle: -Math.PI / 2, spread: 2.4, drag: .4 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        petal(ctx, x, y, 6 * (1 - k * .3), k * 6 + i, PETALS[i % 3]);
      }, e.x, e.y - 6);
      break;
    }
    case 'kaoru-mark': {
      // The landing spot: a shadow that darkens and tightens as she comes down, ringed by a faint violet rose-line.
      const k = ease(t);
      const r = (e.radius ?? 86) * (1.15 - .3 * k);
      ctx.globalAlpha = .12 + .3 * k;
      ctx.fillStyle = '#100818';
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, r, r * .2, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = .25 + .35 * k;
      ctx.strokeStyle = VIOLET;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, r * 1.06, r * .22, 0, 0, TAU); ctx.stroke();
      // Four small petals lying on the ring, turning slowly.
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU + el * 1.4;
        ctx.globalAlpha = .35 + .4 * k;
        petal(ctx, e.x + Math.cos(a) * r * 1.06, e.y + 2 + Math.sin(a) * r * .22, 5, a, PETALS[i % 3]);
      }
      break;
    }
    case 'kaoru-birds': {
      // Up there she loses her nerve: a drop of sweat, and the flightless birds she names go round her head.
      const fade = Math.min(1, el / .1, e.life / .12);
      const y0 = e.y - 14;
      const pts: { k: number; x: number; y: number; d: number }[] = [];
      for (let k = 0; k < 3; k++) {
        const a = el * 5.2 + k * TAU / 3;
        pts.push({ k, x: e.x + Math.cos(a) * 40, y: y0 + Math.sin(a) * 10, d: Math.sin(a) });
      }
      pts.sort((p, q) => p.d - q.d);
      for (const p of pts) {
        ctx.globalAlpha = fade * (.7 + .3 * (p.d + 1) / 2);
        bird(ctx, p.k, p.x, p.y, .85 + .15 * p.d, Math.cos(el * 5.2 + p.k * TAU / 3) > 0 ? -1 : 1);
      }
      // The sweat drop on her temple, first half only.
      if (el < .3) {
        const k = el / .3;
        ctx.globalAlpha = fade * (1 - k) * .9;
        ctx.fillStyle = '#bfe6ff';
        const sx = e.x - dir * 16, sy = e.y + 22 + k * 10;
        ctx.beginPath(); ctx.moveTo(sx, sy - 7); ctx.quadraticCurveTo(sx + 5, sy + 1, sx, sy + 3); ctx.quadraticCurveTo(sx - 5, sy + 1, sx, sy - 7); ctx.fill();
      }
      // Then the smile: a slow white twinkle over the face as she goes.
      if (el > .28) {
        const k = clamp((el - .28) / .2, 0, 1);
        ctx.globalAlpha = fade * k;
        ctx.fillStyle = '#ffffff';
        sparkle(ctx, e.x + dir * 12, e.y + 20, 6 + 3 * Math.sin(el * 14));
      }
      break;
    }
    case 'kaoru-faint': {
      // Coming down stiff as a board, smiling, with a white glow and speed lines streaming up off her.
      const fade = Math.min(1, el / .05, e.life / .12);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * .32;
      glow(ctx, e.x, e.y, 90, WHITE_RGB);
      ctx.globalAlpha = fade * .22;
      glow(ctx, e.x, e.y, 60, LILAC_RGB);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(255,240,252,.7)';
      ctx.lineCap = 'round';
      for (let i = 0, n = count(6, liteFx); i < n; i++) {
        const k = cycle(el, 6, i, 61);
        const x = e.x + (hash(i, 62) - .5) * 70;
        const y = e.y - 90 - k * 90;
        ctx.globalAlpha = fade * (1 - k) * .7;
        ctx.lineWidth = 2 - k;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 26 - 20 * hash(i, 63)); ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = fade * (.6 + .4 * Math.sin(el * 20 + i * 2));
        sparkle(ctx, e.x + (i - 1) * 30, e.y - 60 - (i % 2) * 24, 5);
      }
      break;
    }
    case 'kaoru-land': {
      // The landing: a lilac shockwave along the floor and a fountain of petals that take their time coming down.
      const hitIt = !!e.hit;
      const R = e.radius ?? 140;
      ctx.globalAlpha = (1 - t) * (hitIt ? .7 : .45);
      ctx.strokeStyle = LILAC;
      ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, R * ease(t * 1.6), R * .2 * ease(t * 1.6), 0, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - t) * .4;
      glow(ctx, e.x, e.y - 20, R * .7, VIO_RGB);
      ctx.globalCompositeOperation = 'source-over';
      burst(el, 71, { n: count(hitIt ? 18 : 12, liteFx), speed: [140, 360], life: .7, gravity: 380, angle: -Math.PI / 2, spread: 2.6, drag: .3 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        petal(ctx, x, y, 7 * (1 - k * .3), k * 7 + i, PETALS[i % 3]);
      }, e.x, e.y - 8);
      // Dust either side.
      for (const s of [-1, 1]) {
        ctx.globalAlpha = (1 - t) * .35;
        glow(ctx, e.x + s * (20 + t * 60), e.y - 6, 18 + t * 20, '230,220,240');
      }
      break;
    }
    case 'kaoru-pose': {
      // Back on her feet as if it were all part of the act: one big twinkle at the hair and three petals let go.
      ctx.globalAlpha = Math.sin(t * Math.PI);
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x - dir * 10, e.y, 9 + 4 * Math.sin(t * Math.PI));
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = (1 - t) * .85;
        petal(ctx, e.x + dir * (10 + i * 12) + t * 30 * dir, e.y + 10 + t * (30 + i * 12), 5, t * 5 + i, PETALS[i]);
      }
      break;
    }
    case 'kaoru-snap': {
      // つまり、そういうことさ: a finger snap — a white star flash, a little ring and a pop of petals.
      const k = ease(t * 1.4);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - t) * .55;
      glow(ctx, e.x, e.y, 46, LILAC_RGB);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = (1 - t);
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x, e.y, 16 * (1 - t * .6));
      ctx.strokeStyle = LILAC;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, 10 + k * 34, 0, TAU); ctx.stroke();
      burst(el, 81, { n: count(8, liteFx), speed: [100, 200], life: .5, gravity: 120, drag: .25 }, (x, y, kk, i) => {
        ctx.globalAlpha = 1 - kk;
        petal(ctx, x, y, 5, kk * 6 + i, PETALS[i % 3]);
      }, e.x, e.y);
      break;
    }
    case 'kaoru-fans': {
      // 小猫咪亲卫队: her fans lean out from behind her, waving their fans, hearts drifting up.
      for (let i = 0; i < KAORU_FANS; i++) {
        const come = ease((el - i * .05) / .2);
        if (come <= 0) continue;
        const [ox, oy] = PEEK[i];
        const x = e.x + ox * dir;
        const bob = Math.sin(el * 9 + i * 1.7) * 3;
        fan(ctx, images, i, 0, x, e.y + oy + (1 - come) * 40 + bob, dir, Math.min(come, e.life / .1), .32, 0, liteFx);
      }
      for (let i = 0, n = count(6, liteFx); i < n; i++) {
        const k = cycle(el, .9, i, 91);
        const [ox] = PEEK[i % KAORU_FANS];
        ctx.globalAlpha = Math.min(1, el / .2) * (1 - k) * .8;
        ctx.fillStyle = i % 2 ? PINK : '#ff6fb0';
        heart(ctx, e.x + ox * dir + (hash(i, 92) - .5) * 30, e.y - FAN_H * .9 - k * 50, 5 + 2 * hash(i, 93));
      }
      break;
    }
    case 'kaoru-rush': {
      // Someone swung at her: they shriek and stampede — four pink girls running over them, hearts bursting at contact.
      const reach = (e.tx ?? dir * 120) + dir * 70;
      for (let i = 0; i < KAORU_FANS; i++) {
        const k = ease((el - i * .04) / .32);
        if (k <= 0) continue;
        const [ox, oy] = PEEK[i];
        const x0 = e.x + ox * dir * .5;
        const x = x0 + (e.x + reach - x0) * k;
        const fade = Math.min(1, (el - i * .04) / .06, e.life / .2);
        fan(ctx, images, i, 0, x, e.y + oy * .5 - Math.abs(Math.sin(k * Math.PI * 3)) * 8, dir, fade, .5, 16 * (1 - k * .5), liteFx);
      }
      // Speed lines along the floor.
      ctx.strokeStyle = 'rgba(255,190,225,.7)';
      ctx.lineCap = 'round';
      for (let i = 0, n = count(6, liteFx); i < n; i++) {
        const k = cycle(el, 4, i, 95);
        const y = e.y - 20 - hash(i, 96) * 140;
        const x = e.x + reach * (.2 + k * .9);
        ctx.globalAlpha = (1 - t) * (1 - k) * .6;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dir * (30 + 30 * hash(i, 97)), y); ctx.stroke();
      }
      // The pile-in.
      burst(el - .2, 98, { n: count(14, liteFx), speed: [120, 300], life: .6, gravity: -80, drag: .3 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 2 ? PINK : '#ff6fb0';
        if (i % 3 === 0) sparkle(ctx, x, y, 6 * (1 - k)); else heart(ctx, x, y, 6 * (1 - k * .4));
      }, e.x + (e.tx ?? 0), e.y - 110);
      break;
    }
    case 'kaoru-swoon': {
      // Nobody swung: one by one they clutch their chests and swoon (儚い…), hearts popping over them.
      for (let i = 0; i < KAORU_FANS; i++) {
        const [ox, oy] = PEEK[i];
        const k = ease((el - i * .08) / .3);
        const fade = Math.min(1, e.life / .3);
        fan(ctx, images, i, k > .2 ? 1 : 0, e.x + ox * dir - dir * k * 8, e.y + oy + k * 6, dir, fade, .3, 0, liteFx);
        const p = el - i * .08 - .15;
        if (p > 0 && p < .6) {
          const kk = p / .6;
          ctx.globalAlpha = (1 - kk) * .9;
          ctx.fillStyle = '#ff6fb0';
          heart(ctx, e.x + ox * dir, e.y + oy - FAN_H * .95 - kk * 34, 7 * (1 - kk * .3));
        }
      }
      break;
    }
    case 'kaoru-shy': {
      // 千圣: the one kitten they dare not charge. They peek, freeze, and shuffle back behind her.
      for (let i = 0; i < KAORU_FANS; i++) {
        const [ox, oy] = PEEK[i];
        const back = ease((el - .15) / .4);
        const x = e.x + (ox - 30 * back) * dir;
        fan(ctx, images, i, 0, x, e.y + oy, dir, Math.min(1, e.life / .25) * (1 - back * .6), .45, 0, liteFx);
        if (el < .5) {
          ctx.globalAlpha = (1 - el / .5) * .9;
          ctx.fillStyle = '#bfe6ff';
          const sx = x + dir * 14, sy = e.y + oy - FAN_H * .92 + el * 20;
          ctx.beginPath(); ctx.moveTo(sx, sy - 6); ctx.quadraticCurveTo(sx + 4, sy + 1, sx, sy + 3); ctx.quadraticCurveTo(sx - 4, sy + 1, sx, sy - 6); ctx.fill();
        }
      }
      break;
    }
    case 'kaoru-spot': {
      // 终幕: one spotlight from the flies onto her — a soft cone, a pool of light at her feet, dust turning in the beam.
      const fade = Math.min(1, el / .25, e.life / .3);
      const top = SPOT_TOP, foot = FLOOR;
      const wTop = 26, wFoot = 92;
      const cone = spotStamp();
      if (cone) {
        ctx.save();
        ctx.globalAlpha *= fade;
        ctx.drawImage(cone, e.x - SPOT_CX, top);
        ctx.restore();
      } else {
        const g = ctx.createLinearGradient(0, top, 0, foot);
        g.addColorStop(0, `rgba(${WHITE_RGB},${(.32 * fade).toFixed(3)})`);
        g.addColorStop(1, `rgba(${WHITE_RGB},${(.08 * fade).toFixed(3)})`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(e.x - wTop, top); ctx.lineTo(e.x + wTop, top);
        ctx.lineTo(e.x + wFoot, foot); ctx.lineTo(e.x - wFoot, foot);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = fade * .55;
      glow(ctx, e.x, foot, 100, WHITE_RGB);
      ctx.globalAlpha = fade * .35;
      ctx.fillStyle = '#fff4fb';
      ctx.beginPath(); ctx.ellipse(e.x, foot + 2, wFoot, 14, 0, 0, TAU); ctx.fill();
      for (let i = 0, n = count(10, liteFx); i < n; i++) {
        const k = cycle(el, .18, i, 101);
        const y = top + (foot - top) * k;
        const half = wTop + (wFoot - wTop) * k;
        ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .7;
        ctx.fillStyle = '#ffffff';
        dot(ctx, e.x + (hash(i, 102) - .5) * 2 * half * .8 + Math.sin(el * 1.3 + i) * 6, y, 1.4);
      }
      break;
    }
    case 'kaoru-rose': {
      // 终幕: a giant translucent violet rose. A closed bud comes up out of the floor, unfurls row by row (outer petals
      // first, lips rolling back), then folds shut round them into a tall bud — inner petals first, the outer row
      // wrapping last — with a breathing light inside. Three rows of petals, back half drawn first, front half see-through.
      // e.t0 is when it shuts; it holds until the snap breaks it into the storm (see kaoru-storm), then lets go.
      const shut = e.t0 ?? .32;
      const caught = e.hit !== false;
      const grow = ease(el / .26);
      const open = ease(el / shut);
      const closing = ease((el - shut) / .2);
      const end = caught ? .66 : shut + .3;
      const gone = clamp((el - end) / .14, 0, 1);
      const fade = (1 - gone) * Math.min(1, el / .06);
      if (fade <= 0) break;
      // The bloom swells a touch while it holds someone, like a slow breath.
      const breath = caught && closing > 0 ? 1 + .025 * Math.sin(el * 11) : 1;
      // Floor: a pool of violet light, two leaves and the sepals lying out from the foot.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * (.3 + .25 * open);
      glow(ctx, e.x, e.y, 90 + 50 * open, VIO_RGB);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const spread = open * (1 - closing);
      leaf(ctx, e.x - 18, e.y - 2, 50 + 40 * grow, Math.PI + .12 - .1 * spread, fade * grow);
      leaf(ctx, e.x + 18, e.y - 2, 46 + 38 * grow, -.14 + .1 * spread, fade * grow);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU + .3;
        const side = Math.sin(a);
        leaf(ctx, e.x + side * 10, e.y - 4, 22 * grow, side > 0 ? -.5 - .6 * spread : Math.PI + .5 + .6 * spread, fade * grow * (.6 + .3 * Math.cos(a)));
      }
      // Three rows: [count, ring radius, width, height, how far it opens, phase offset, how late it opens, how early it shuts].
      const Hfull = 176;
      // The petals spring from a small receptacle just off the floor.
      const base = e.y - 16;
      let nPetal = 0;
      for (const [n, ring, w, hk, reach, phase, late, early] of ROSE_ROWS) {
        // Each row opens a little after the one outside it and shuts a little before it.
        const o = ease((open - late * .6) / (1 - late * .6));
        const c = ease((closing - early * .5) / (1 - early * .5));
        const unfurl = o * (1 - c);
        // Shut: the petals stand up tall and lean in until their tips meet over the head.
        const h = Hfull * hk * breath * (.32 + .68 * grow) * (caught ? 1 + .3 * c : 1 - .35 * c);
        for (let i = 0; i < n; i++) {
          const a = (i + phase) / n * TAU + el * .35;
          const side = Math.sin(a), d = Math.cos(a);
          const r = ring * (.35 + .65 * Math.max(unfurl, c * .55)) * breath;
          let p = roseBuf[nPetal];
          if (!p) roseBuf[nPetal] = p = { x: 0, lean: 0, w: 0, h: 0, d: 0, inner: false, curl: 0 };
          p.x = e.x + side * r;
          p.lean = side * (reach * unfurl - .32 * c);
          p.w = w * (.75 + .25 * Math.abs(side)) * (.7 + .3 * grow);
          p.h = h;
          p.d = d;
          p.inner = d < 0;
          p.curl = unfurl * (.6 + .4 * reach);
          nPetal++;
        }
      }
      roseBuf.length = nPetal;
      // Back of the cup first (inside faces), then the front (outside faces, see-through), outer rows behind inner ones.
      roseBuf.sort((p, q) => p.d - q.d);
      // The receptacle under the cup.
      ctx.globalAlpha = fade * grow;
      ctx.fillStyle = '#3a1848';
      ctx.beginPath(); ctx.ellipse(e.x, base + 4, 16, 12, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      let heartDone = false;
      const heartY = base - Hfull * .96 * (.32 + .68 * grow) * .74;
      for (const p of roseBuf) {
        // The wound heart sits between the back and front halves of the cup.
        if (!heartDone && p.d >= 0) {
          heartDone = true;
          roseHeart(ctx, e.x, heartY, 30 * (.5 + .5 * grow), spread, el * .8, fade * (1 - closing));
        }
        bigPetal(ctx, p.x, base, p.w, p.h, p.lean, fade * (p.inner ? .9 : .55 + .2 * (1 - p.d)), p.inner, p.curl);
      }
      // Dew: a few bright glints running along the lips while it is open.
      ctx.fillStyle = '#ffffff';
      for (let i = 0, n = count(5, liteFx); i < n; i++) {
        const k = cycle(el, 1.4, i, 113);
        const p = roseBuf[(i * 3) % roseBuf.length];
        ctx.globalAlpha = fade * spread * Math.sin(k * Math.PI) * .9;
        sparkle(ctx, p.x + Math.sin(p.lean) * p.h * .95, base - Math.cos(p.lean) * p.h * .95, 3 + 2 * Math.sin(k * Math.PI));
      }
      // Shut on someone: a light breathing inside the bud and a thin ribbon of light winding up round it.
      if (closing > 0 && caught) {
        const top = Hfull * 1.1;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade * closing * (.22 + .08 * Math.sin(el * 11));
        glow(ctx, e.x, e.y - top * .45, 80, LILAC_RGB);
        ctx.globalAlpha = fade * closing * .18;
        glow(ctx, e.x, e.y - top * .45, 40, WHITE_RGB);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(255,236,250,.75)';
        ctx.lineCap = 'round';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = fade * closing * .7;
        ctx.beginPath();
        for (let k = 0; k <= 24; k++) {
          const u = k / 24;
          const turn = u * TAU * 1.6 + el * 4;
          const rx = (46 - 18 * u) * Math.cos(turn);
          const yy = e.y - 20 - u * top * .85;
          if (k === 0) ctx.moveTo(e.x + rx, yy); else ctx.lineTo(e.x + rx, yy);
        }
        ctx.stroke();
      }
      // The moment it shuts: a soft ring of light pulses out from the foot.
      if (el > shut && el < shut + .3) {
        const k = (el - shut) / .3;
        ctx.globalAlpha = fade * (1 - k) * .6;
        ctx.strokeStyle = LILAC;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, 60 + k * 90, 10 + k * 16, 0, 0, TAU); ctx.stroke();
      }
      // Empty: it folds in on nothing and drops its petals.
      if (!caught && closing > 0) {
        burst(el - shut, 111, { n: count(10, liteFx), speed: [60, 160], life: .7, gravity: 200, angle: -Math.PI / 2, spread: 2.8, drag: .3 }, (x, y, k, i) => {
          ctx.globalAlpha = 1 - k;
          petal(ctx, x, y, 7, k * 5 + i, PETALS[i % 3]);
        }, e.x, e.y - 100);
      }
      break;
    }
    case 'kaoru-storm': {
      // The snap: the rose comes apart into a storm of petals spiralling up round them, tightening, then flung out.
      const caught = !!e.hit;
      const burstAt = e.max - .6;
      const pre = clamp(el / burstAt, 0, 1);
      const out = clamp((el - burstAt) / .6, 0, 1);
      const n = count(caught ? 30 : 14, liteFx);
      for (let i = 0; i < n; i++) {
        const u = (i + .5) / n;
        const turn = el * (5 + 3 * pre) + u * TAU * 3;
        const rad = (70 - 30 * pre) * (.6 + .4 * hash(i, 121)) + out * 220 * hash(i, 122);
        const height = 20 + u * 210 * Math.min(1, el / .25) + out * 40 * hash(i, 123);
        const x = e.x + Math.cos(turn) * rad;
        const y = e.y - height + out * out * 120 * hash(i, 124);
        const depth = Math.sin(turn);
        ctx.globalAlpha = (1 - out) * (.55 + .4 * (depth + 1) / 2) * Math.min(1, el / .08);
        petal(ctx, x, y, (6 + 3 * hash(i, 125)) * (1 + depth * .15), turn + i, PETALS[i % 3]);
      }
      // Thin bright arcs riding the spiral, the cuts.
      if (caught && out === 0) {
        ctx.strokeStyle = 'rgba(255,240,252,.8)';
        ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          const turn = el * 9 + k * TAU / 3;
          const y = e.y - 60 - k * 55 - Math.sin(el * 6 + k) * 10;
          ctx.globalAlpha = .55;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(e.x, y, 52 - pre * 14, 12, 0, turn, turn + 1.4); ctx.stroke();
        }
      }
      break;
    }
    case 'kaoru-bloom': {
      // The last petal-burst: a rose of light opening wide, then petals drifting down slowly — 儚い, here and gone.
      const R = e.radius ?? 150;
      const k = ease(t * 2.5);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - t) * .55;
      glow(ctx, e.x, e.y - 100, R * (.6 + .6 * k), LILAC_RGB);
      ctx.globalAlpha = (1 - t) * .4;
      glow(ctx, e.x, e.y - 100, R * .4, WHITE_RGB);
      ctx.globalCompositeOperation = 'source-over';
      // Five broad light petals opening from the centre, like a rose seen face-on.
      const light = bloomStamp();
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU - Math.PI / 2 + el * .4;
        ctx.save();
        ctx.translate(e.x, e.y - 100);
        ctx.rotate(a + Math.PI / 2);
        ctx.globalAlpha = (1 - t) * .35;
        if (light) {
          const s = k * (R / BLOOM_R);
          ctx.scale(s, s);
          ctx.drawImage(light, -BLOOM_CX, -BLOOM_FOOT);
        } else {
          const g = ctx.createLinearGradient(0, 0, 0, -R * k);
          g.addColorStop(0, `rgba(${WHITE_RGB},.9)`);
          g.addColorStop(1, `rgba(${VIO_RGB},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(-R * .45 * k, -R * .3 * k, -R * .3 * k, -R * k, 0, -R * k);
          ctx.bezierCurveTo(R * .3 * k, -R * k, R * .45 * k, -R * .3 * k, 0, 0);
          ctx.fill();
        }
        ctx.restore();
      }
      burst(el, 131, { n: count(22, liteFx), speed: [80, 260], life: 1.1, gravity: 70, drag: .2 }, (x, y, kk, i) => {
        ctx.globalAlpha = (1 - kk) * .9;
        petal(ctx, x + Math.sin(kk * 6 + i) * 10, y, 7 * (1 - kk * .3), kk * 4 + i, PETALS[i % 3]);
      }, e.x, e.y - 100);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = (1 - t) * (.5 + .5 * Math.sin(el * 12 + i * 2));
        sparkle(ctx, e.x + (hash(i, 132) - .5) * R * 1.4, e.y - 100 + (hash(i, 133) - .5) * R, 5 + 3 * hash(i, 134));
      }
      break;
    }
    case 'kaoru-blush': {
      // 「小薰」: the prince slips — cheeks gone pink and a wisp of steam off the top of her head.
      const fade = Math.min(1, el / .2, e.life / .25);
      ctx.globalAlpha = fade * (.45 + .1 * Math.sin(el * 6));
      glow(ctx, e.x, e.y, 9, '255,128,170');
      glow(ctx, e.x - 12 * Math.sign(e.ox ?? 1), e.y + 1, 7, '255,128,170');
      for (let i = 0; i < 3; i++) {
        const k = cycle(el, .9, i, 141);
        ctx.globalAlpha = fade * (1 - k) * .45;
        glow(ctx, e.x - 6 + Math.sin(k * 6 + i) * 6, e.y - 30 - k * 36, 7 + k * 8, '255,255,255');
      }
      break;
    }
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  return true;
}

/* ---------- 混乱 · 名言 (似懂非懂的名言): violet petals drifting round the head and small gold curls that loop and
   loop without arriving anywhere — the same 混乱, worn as a quote nobody understood ---------- */
export function auraKaoruQuote(ctx: CanvasRenderingContext2D, f: Fighter, h: number, left: number, t: number, lite: boolean): void {
  const fade = Math.min(1, left / .3);
  const hy = f.y - h - 4;
  ctx.save();
  for (let i = 0, n = count(5, lite); i < n; i++) {
    const a = t * 2 + i / n * TAU;
    const depth = Math.sin(a);
    ctx.globalAlpha = fade * (.55 + .35 * depth);
    petal(ctx, f.x + Math.cos(a) * 28, hy + depth * 6, 5 + depth, a * 2, PETALS[i % 3]);
  }
  // Two gold curls: a little loop-the-loop that never resolves.
  ctx.strokeStyle = 'rgba(255,224,150,.85)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const x = f.x + (i ? 16 : -14), y = hy - 14 - i * 4;
    const a0 = t * 4 + i * 2;
    ctx.globalAlpha = fade * .8;
    ctx.beginPath(); ctx.arc(x, y, 4.5, a0, a0 + TAU * .8); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 4, y + 5, 2.4, a0 + 1, a0 + 1 + TAU * .7); ctx.stroke();
  }
  ctx.restore();
}
export function applyKaoruQuote(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  burst(age, 151, { n: 10, speed: [60, 150], life: .55, gravity: 40, drag: .3 }, (x, y, k, i) => {
    ctx.globalAlpha = 1 - k;
    petal(ctx, x, y, 5.5, k * 6 + i, PETALS[i % 3]);
  }, e.x, e.y - 178);
  ctx.restore();
}
