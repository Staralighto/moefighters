import type { Effect, Projectile } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import type { Fighter } from '../game/fighter.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { CELL, KITA_DUO_SRC, KITA_SOLO } from './clips.ts';
import { TAU, burst, cycle, dot, glow, hash, sparkle } from './fxParticles.ts';

/* 喜多郁代 — 阳角光芒. Three registers:
   - the Kita aura: warm white light with a gold core, soft rays turning slowly behind her, four-point glints that blink
     on and off around the body and a few red / pink glitter flecks drifting up. Bright, never neon; no rings.
   - her red (#E4524E) and ketchup red for the maid-café heart: a glossy heart with one white highlight, small hearts
     and glitter around it; 一里's pink for the moment she is pulled back into the band.
   - the 文化祭 stage for 撑住舞台的即兴: the house goes dark behind the bodies, one warm spotlight on her, dust in the
     beam, crescent sound waves in red and pink; 一里 behind her for the last bars (a pink wash over her own art).
   Nothing written on screen. The busiest frame (the finale) is about 40 particles; lite halves the counts. */

export const KITA_SCREEN_BACK: readonly string[] = ['kita-stage'];
/** The same beam again, faint, over the bodies: she is standing in the light, not in front of it (as 狼王来了 does). */
export const KITA_SCREEN_FRONT: readonly string[] = ['kita-stage-front'];
export const KITA_BACK: readonly string[] = ['kita-aura', 'kita-duo'];

const RED = '#E4524E';
const RED_RGB = '228,82,78';
const WARM_RGB = '255,236,196';
const GOLD_RGB = '255,214,128';
const WHITE_RGB = '255,252,244';
const PINK = '#F5A9C0';
const PINK_RGB = '245,169,192';
/** Glitter: warm white, gold, her red, 一里 pink. */
const GLITTER: readonly string[] = ['#fffaf0', '#ffd98a', '#ff8a7a', '#ffc2d4'];

const count = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

/** A heart of half-width s, point down, centred on x, y. Fills the current path; the caller sets the style. */
function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * .95);
  ctx.bezierCurveTo(x - s * 1.5, y - s * .05, x - s * .7, y - s * 1.25, x, y - s * .4);
  ctx.bezierCurveTo(x + s * .7, y - s * 1.25, x + s * 1.5, y - s * .05, x, y + s * .95);
  ctx.closePath();
}
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  if (!(s > 0)) return;
  heartPath(ctx, x, y, s);
  ctx.fill();
}
const HEART_STEPS = 40;
/** The classic parametric heart, point down, sampled once into a unit table (half-width 1): x, y pairs from the top
 *  dip round and back. Every heart outline is this table scaled, so no trig runs per frame. */
const HEART_UNIT: Float32Array = (() => {
  const out = new Float32Array((HEART_STEPS + 1) * 2);
  for (let i = 0; i <= HEART_STEPS; i++) {
    const t = i / HEART_STEPS * TAU;
    out[i * 2] = Math.sin(t) ** 3;
    out[i * 2 + 1] = (-(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) + 2) / 16;
  }
  return out;
})();
/** Lays the heart outline as the current path, from the top dip up to share k of the way round. Returns the pen tip
 *  in `tip` (reused, so the per-frame draw allocates nothing). */
const tip: [number, number] = [0, 0];
function traceHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, k: number): [number, number] {
  const n = Math.max(1, Math.round(HEART_STEPS * clamp(k, 0, 1)));
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const px = x + HEART_UNIT[i * 2] * s, py = y + HEART_UNIT[i * 2 + 1] * s;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    tip[0] = px; tip[1] = py;
  }
  if (k >= 1) ctx.closePath();
  return tip;
}
const HEART_PINK = '#ff8fc0';
const HEART_PINK_RGB = '255,143,192';
/** The hollow pink heart: a soft pink halo stroke, the pink line, a white core line. k < 1 draws it part way. */
function hollowHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, k = 1, w = 1): [number, number] {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (!(s > 0)) return tip;
  const a = ctx.globalAlpha;
  // One path, three strokes: the halo, the line, the white core.
  const end = traceHeart(ctx, x, y, s, k);
  ctx.strokeStyle = HEART_PINK;
  ctx.globalAlpha = a * .3; ctx.lineWidth = s * .34 * w; ctx.stroke();
  ctx.globalAlpha = a; ctx.lineWidth = s * .16 * w; ctx.stroke();
  ctx.strokeStyle = '#fff3f8';
  ctx.globalAlpha = a * .95; ctx.lineWidth = s * .06 * w; ctx.stroke();
  ctx.globalAlpha = a;
  return end;
}
/** A solid pink heart with a light lobe and one highlight (the muddle over their head). */
function pinkHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot = 0): void {
  if (!(s > 0)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = '#e0568f';
  heart(ctx, 0, s * .06, s * 1.12);
  ctx.fillStyle = HEART_PINK;
  heart(ctx, 0, 0, s);
  ctx.fillStyle = '#ffc6de';
  ctx.beginPath(); ctx.ellipse(-s * .42, -s * .42, s * .3, s * .2, -.6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(-s * .5, -s * .5, s * .14, s * .08, -.6, 0, TAU); ctx.fill();
  ctx.restore();
}
/** One soft ray: a long faint wedge and a shorter brighter one inside it, so it fades with distance. */
function ray(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, r: number, w: number, alpha: number): void {
  if (!(r > 0) || alpha <= .01) return;
  for (let pass = 0; pass < 2; pass++) {
    const k = pass ? .58 : 1;
    ctx.globalAlpha = alpha * (pass ? 1 : .45);
    const rr = r * k, ww = w * k;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a + Math.PI / 2) * 6, y + Math.sin(a + Math.PI / 2) * 6);
    ctx.lineTo(x + Math.cos(a - ww) * rr, y + Math.sin(a - ww) * rr);
    ctx.lineTo(x + Math.cos(a + ww) * rr, y + Math.sin(a + ww) * rr);
    ctx.lineTo(x + Math.cos(a - Math.PI / 2) * 6, y + Math.sin(a - Math.PI / 2) * 6);
    ctx.closePath();
    ctx.fill();
  }
}
/** The Kita aura's glints: four-point sparkles that blink on and off around a body of height h at feet x, y. */
function glints(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, t: number, fade: number, n: number, seed: number, spread = 1): void {
  for (let i = 0; i < n; i++) {
    const k = cycle(t, 1.6, i, seed);
    const tw = Math.sin(k * Math.PI);
    if (tw <= .05) continue;
    const gx = x + (hash(i, seed + 1) - .5) * 110 * spread;
    const gy = y - h * (.12 + .95 * hash(i, seed + 2));
    ctx.globalAlpha = fade * tw;
    ctx.fillStyle = i % 3 === 0 ? '#ffe6a6' : '#ffffff';
    sparkle(ctx, gx, gy, (5 + hash(i, seed + 3) * 7) * (.5 + tw * .5));
  }
}
/** Glitter flecks drifting up off a body. */
function glitterUp(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, t: number, fade: number, n: number, seed: number): void {
  for (let i = 0; i < n; i++) {
    const k = cycle(t, .7, i, seed);
    ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .9;
    ctx.fillStyle = GLITTER[i % GLITTER.length];
    const sway = Math.sin(t * 3 + i * 1.7) * 6;
    dot(ctx, x + (hash(i, seed + 1) - .5) * 90 + sway, y - h * (.1 + k * 1.05), 1.6 + hash(i, seed + 2) * 1.6);
  }
}

/* ---- the spotlight: one soft cone, baked once ---- */

/** Cone geometry in screen space: half-width at the lamp (y = 0) and at the floor line; it keeps widening below. */
const CONE_TOP = 22, CONE_FOOT = 150;
let coneCache: HTMLCanvasElement | null | undefined;
/** A soft light cone, 1 px rows, each row a horizontal gradient: bright core, feathered edges; brightest at the lamp,
 *  settling to a steady glow lower down. Drawn stretched over the full screen height so it meets the floor and the
 *  stage in front of it instead of stopping on a hard line. */
function coneSprite(): HTMLCanvasElement | null {
  if (coneCache !== undefined) return coneCache;
  if (typeof document === 'undefined') return (coneCache = null);
  const w = 128, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (!g) return (coneCache = null);
  const foot = CONE_FOOT + (CONE_FOOT - CONE_TOP) * (H - FLOOR) / FLOOR;
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    const hw = (CONE_TOP + (foot - CONE_TOP) * v) / foot * (w / 2);
    const a = .72 + .28 * (1 - v) ** 2;
    const gr = g.createLinearGradient(w / 2 - hw, 0, w / 2 + hw, 0);
    gr.addColorStop(0, `rgba(${WARM_RGB},0)`);
    gr.addColorStop(.2, `rgba(${WARM_RGB},${(a * .4).toFixed(3)})`);
    gr.addColorStop(.36, `rgba(${WARM_RGB},${(a * .78).toFixed(3)})`);
    gr.addColorStop(.5, `rgba(${WHITE_RGB},${a.toFixed(3)})`);
    gr.addColorStop(.64, `rgba(${WARM_RGB},${(a * .78).toFixed(3)})`);
    gr.addColorStop(.8, `rgba(${WARM_RGB},${(a * .4).toFixed(3)})`);
    gr.addColorStop(1, `rgba(${WARM_RGB},0)`);
    g.fillStyle = gr;
    g.fillRect(0, y, w, 1);
  }
  return (coneCache = c);
}
const CONE_FOOT_SCREEN = CONE_FOOT + (CONE_FOOT - CONE_TOP) * (H - FLOOR) / FLOOR;

/* ---- the duo: 一里 as a pink wash over her own art, baked once ---- */

const washCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
function pinkWash(src: HTMLImageElement): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const hit = washCache.get(src);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = src.naturalWidth;
  c.height = src.naturalHeight;
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = PINK;
  g.fillRect(0, 0, c.width, c.height);
  washCache.set(src, c);
  return c;
}
const DUO_H = 176;
/** 一里's solo cell: L column (3), the second row. */
const DUO_COL = 3, DUO_ROW = 1;

/* ---- status looks (statusMarks.ts) ---- */

/** 'kita-sun' (减速 from 阳角光环): a warm light falling on them from above and a couple of drops sliding down the
 *  sides — the way 一里 melts when the aura reaches her. */
export function auraKitaSun(ctx: CanvasRenderingContext2D, f: Fighter, h: number, left: number, t: number, lite: boolean): void {
  const fade = Math.min(1, left / .25);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = fade * .32;
  glow(ctx, f.x, f.y - h * .85, h * .42, GOLD_RGB);
  ctx.globalAlpha = fade * .18;
  glow(ctx, f.x, f.y - h * .45, h * .5, WARM_RGB);
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0, n = count(3, lite); i < n; i++) {
    const k = cycle(t, .9, i, 71);
    const side = i % 2 ? 1 : -1;
    const x = f.x + side * (14 + hash(i, 72) * 12);
    const y = f.y - h * (.82 - k * .6);
    ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .85;
    ctx.fillStyle = '#ffe2b8';
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.quadraticCurveTo(x + 3.4, y, x, y + 3.6);
    ctx.quadraticCurveTo(x - 3.4, y, x, y - 6);
    ctx.fill();
  }
  ctx.restore();
}
export function applyKitaSun(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  const k = Math.min(1, age / .4);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (1 - k) * .5;
  glow(ctx, e.x, e.y - 110, 50 + k * 30, WARM_RGB);
  ctx.restore();
}
/** 'kita-heart' (混乱 from 变好吃的咒语): three little ketchup hearts circling over the head, a glint now and then. */
export function auraKitaHeart(ctx: CanvasRenderingContext2D, f: Fighter, h: number, left: number, t: number, lite: boolean): void {
  const fade = Math.min(1, left / .2);
  const cx = f.x, cy = f.y - h - 12;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const a = t * 3.2 + i * TAU / 3;
    const depth = Math.sin(a);
    ctx.globalAlpha = fade * (.7 + depth * .3);
    pinkHeart(ctx, cx + Math.cos(a) * 24, cy + depth * 7, 6.5 + depth * 1.5, Math.cos(a) * .3);
  }
  if (!lite) {
    const k = cycle(t, 1.3, 0, 74);
    ctx.globalAlpha = fade * Math.sin(k * Math.PI);
    ctx.fillStyle = '#ffffff';
    sparkle(ctx, cx + (hash(Math.floor(t * 1.3), 75) - .5) * 50, cy - 6, 6);
  }
  ctx.restore();
}
export function applyKitaHeart(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  const k = Math.min(1, age / .45);
  ctx.globalAlpha = (1 - k) * .45;
  glow(ctx, e.x, e.y - 120, 46 + k * 30, PINK_RGB);
  ctx.restore();
}

/* ---- the shot ---- */

export function drawKitaShot(ctx: CanvasRenderingContext2D, p: Projectile, liteFx: boolean): boolean {
  if (p.fx !== 'kita-spell') return false;
  const dir = Math.sign(p.vx) || 1;
  const beat = 1 + Math.sin(p.age * 16) * .05;
  ctx.save();
  // Soft pink warmth, then the little hollow hearts and glints it leaves behind.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = .45;
  glow(ctx, p.x, p.y, 48, HEART_PINK_RGB);
  ctx.globalCompositeOperation = 'source-over';
  const n = count(4, liteFx);
  for (let i = 1; i <= n; i++) {
    const k = cycle(p.age, 2.4, i, 81);
    const back = 16 + k * 62;
    ctx.globalAlpha = (1 - k) * .85;
    if (i % 2) hollowHeart(ctx, p.x - dir * back, p.y + Math.sin(p.age * 9 + i * 2) * 10, 6 * (1 - k * .4), 1, 1.3);
    else {
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, p.x - dir * back, p.y + (hash(i, 82) - .5) * 26, 5 * (1 - k * .4));
    }
  }
  ctx.globalAlpha = 1;
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.sin(p.age * 7) * .1);
  hollowHeart(ctx, 0, 0, 24 * beat);
  ctx.restore();
  return true;
}

/* ---- effects ---- */

export function drawKitaFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('kita-')) return false;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    case 'kita-aura': {
      // Behind her: a gold-cored warmth and slow soft rays, breathing. It swells in and thins out at the end.
      const h = e.radius ?? 181;
      const fade = Math.min(1, el / .18, e.life / .35);
      const cx = e.x, cy = e.y - h * .55;
      const breath = 1 + Math.sin(el * 5) * .05;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * .55;
      glow(ctx, cx, cy, h * .78 * breath, WARM_RGB);
      ctx.globalAlpha = fade * .4;
      glow(ctx, cx, cy - h * .08, h * .36, GOLD_RGB);
      ctx.fillStyle = `rgb(${WHITE_RGB})`;
      const n = count(9, liteFx);
      for (let i = 0; i < n; i++) {
        const a = el * .35 + i * TAU / n + (hash(i, 61) - .5) * .3;
        const len = h * (.62 + .3 * hash(i, 62)) * (.9 + .1 * Math.sin(el * 4 + i));
        ray(ctx, cx, cy, a, len * breath, .05 + .03 * hash(i, 63), fade * .2);
      }
      // A light pool on the floor under her.
      ctx.globalAlpha = fade * .35;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(1, .16);
      glow(ctx, 0, 0, h * .6, WARM_RGB);
      ctx.restore();
      break;
    }
    case 'kita-aura-glint': {
      // In front: glints blinking on and off around her, glitter drifting up.
      const h = e.radius ?? 181;
      const fade = Math.min(1, el / .15, e.life / .3);
      glints(ctx, e.x, e.y, h, el, fade, count(8, liteFx), 64);
      glitterUp(ctx, e.x, e.y, h, el, fade * .9, count(7, liteFx), 66);
      break;
    }
    case 'kita-shine': {
      // The moment it switches on: a white flash and glints thrown out to the reach of the light.
      const R = e.radius ?? 150;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - ease(t)) * .8;
      glow(ctx, e.x, e.y, 60 + R * .7 * ease(t), WHITE_RGB);
      ctx.globalCompositeOperation = 'source-over';
      burst(el, 91, { n: count(10, liteFx), speed: [R * 1.4, R * 2.4], life: .45, drag: .02 }, (x, y, k, i) => {
        ctx.globalAlpha = (1 - k) * .95;
        ctx.fillStyle = i % 3 ? '#ffffff' : '#ffe0a0';
        sparkle(ctx, x, y, 9 * (1 - k * .5));
      }, e.x, e.y);
      break;
    }
    case 'kita-burn': {
      // A burn of the light: a small warm flare and three glints.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = life * .7;
      glow(ctx, e.x, e.y, 26 + 16 * t, GOLD_RGB);
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * .9 + dir * .2;
        const d = 10 + 26 * ease(t);
        ctx.globalAlpha = life;
        ctx.fillStyle = i === 1 ? '#ffffff' : '#ffe6a6';
        sparkle(ctx, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 7 * (1 - t * .5));
      }
      break;
    }
    case 'kita-dust': {
      // She bolts: a cartoon dust puff kicked up where she stood and a few speed streaks pointing the way she ran.
      const h = e.radius ?? 181;
      for (let i = 0, n = count(6, liteFx); i < n; i++) {
        const k = ease(t * (1.1 + hash(i, 31) * .4));
        const x = e.x - dir * (6 + 40 * k * hash(i, 32)) + (hash(i, 33) - .5) * 30;
        const y = e.y - 10 - 26 * k * hash(i, 34);
        ctx.globalAlpha = life * .7;
        ctx.fillStyle = i % 2 ? '#f5e6df' : '#e8cfc4';
        dot(ctx, x, y, (10 + hash(i, 35) * 9) * (.6 + k * .6));
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const y = e.y - h * (.3 + i * .2);
        const x0 = e.x + dir * (20 + 70 * t);
        ctx.globalAlpha = life * .55;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + dir * 46 * life, y); ctx.stroke();
      }
      break;
    }
    case 'kita-sweat': {
      // One glossy sweat drop by her head while she laughs it off.
      const fade = Math.min(1, el / .08, e.life / .12);
      const y = e.y + Math.min(el, .3) * 20;
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath();
      ctx.moveTo(e.x, y - 11);
      ctx.quadraticCurveTo(e.x + 7.5, y + 1, e.x, y + 7);
      ctx.quadraticCurveTo(e.x - 7.5, y + 1, e.x, y - 11);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      dot(ctx, e.x - 2, y + 1, 1.8);
      break;
    }
    case 'kita-rejoin': {
      // Pulled back in: a pink ribbon (一里) and a red one (hers) stream off her back as she rushes, glints on them.
      const h = e.radius ?? 181;
      const fade = Math.min(1, el / .06, e.life / .14);
      ctx.lineCap = 'round';
      for (let r = 0; r < 2; r++) {
        const y0 = e.y - h * (r ? .46 : .62), ph = r ? 1.7 : 0;
        ctx.strokeStyle = r ? RED : PINK;
        for (let pass = 0; pass < 2; pass++) {
          ctx.globalAlpha = fade * (pass ? .9 : .35);
          ctx.lineWidth = pass ? 6 : 14;
          ctx.beginPath();
          ctx.moveTo(e.x - dir * 10, y0);
          for (let s = 1; s <= 6; s++) {
            const u = s / 6;
            ctx.lineTo(e.x - dir * (10 + u * 150), y0 + Math.sin(el * 26 + u * 5 + ph) * 12 * u);
          }
          ctx.stroke();
        }
      }
      glints(ctx, e.x - dir * 60, e.y, h, el * 2, fade, count(5, liteFx), 37, 1.4);
      break;
    }
    case 'kita-hug': {
      // The tackle lands: a white starburst, red and pink glints and a few small hearts thrown out.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - ease(t)) * .85;
      glow(ctx, e.x, e.y, 40 + 50 * ease(t), WHITE_RGB);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x, e.y, 34 * (1 - t * .6));
      burst(el, 41, { n: count(12, liteFx), speed: [160, 340], life: .5, gravity: 260, drag: .1, angle: dir > 0 ? 0 : Math.PI, spread: Math.PI * 1.5 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        if (i % 3 === 0) { ctx.fillStyle = i % 2 ? PINK : '#ff7d70'; heart(ctx, x, y, 5.5 * (1 - k * .4)); }
        else { ctx.fillStyle = GLITTER[i % GLITTER.length]; sparkle(ctx, x, y, 7 * (1 - k * .5)); }
      }, e.x, e.y);
      break;
    }
    case 'kita-spell-cast': {
      // 「变得好吃吧☆」: a hollow pink heart drawn in the air in one stroke at her hands, a glint riding the pen;
      // when it closes it flashes and leaves as the shot (the projectile takes over from here).
      const t0 = e.t0 ?? .34;
      const S = 24;
      if (el < t0) {
        // An even pen: smoothstep, closing just before the shot leaves, so the stroke is seen going round.
        const u = clamp(el / (t0 * .92), 0, 1);
        const k = u * u * (3 - 2 * u);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = .25 + k * .35;
        glow(ctx, e.x, e.y, 26 + k * 18, HEART_PINK_RGB);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        const [tx, ty] = hollowHeart(ctx, e.x, e.y, S, k);
        if (k < 1) {
          ctx.fillStyle = '#ffffff';
          sparkle(ctx, tx, ty, 9);
          ctx.fillStyle = '#ffd1e6';
          for (let i = 0; i < count(3, liteFx); i++) {
            const q = cycle(el, 3, i, 83);
            ctx.globalAlpha = 1 - q;
            dot(ctx, tx + (hash(i, 84) - .5) * 14 * q * 2, ty + q * 16, 1.8);
          }
        }
      } else {
        const k = clamp((el - t0) / .22, 0, 1);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - k) * .8;
        glow(ctx, e.x, e.y, 30 + k * 34, WHITE_RGB);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = (1 - k) * .9;
        ctx.fillStyle = '#ffffff';
        sparkle(ctx, e.x + dir * 6, e.y, 20 * (1 - k * .5));
      }
      break;
    }
    case 'kita-heart-pop': {
      // The heart lands: it bursts into small hearts and a pink puff.
      ctx.globalAlpha = (1 - t) * .55;
      glow(ctx, e.x, e.y, 30 + 34 * ease(t), PINK_RGB);
      burst(el, 51, { n: count(9, liteFx), speed: [120, 240], life: .55, gravity: -60, drag: .08 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        if (i % 3 === 2) { ctx.fillStyle = '#ffffff'; sparkle(ctx, x, y, 6 * (1 - k * .5)); }
        else { ctx.fillStyle = i % 2 ? HEART_PINK : '#ffc6de'; heart(ctx, x, y, 5 * (1 - k * .3)); }
      }, e.x, e.y);
      break;
    }
    case 'kita-stage': {
      // The school stage: the house goes dark behind the bodies; one soft warm spotlight on her, running from the lamp
      // through the floor into the stage edge, a bright pool where it lands, dust turning in the beam.
      const fade = Math.min(1, el / .25, e.life / .3);
      ctx.globalAlpha = fade * .72;
      ctx.fillStyle = 'rgb(14,10,22)';
      ctx.fillRect(0, 0, W, H);
      const x = e.x;
      const flare = el > KITA_SOLO.burst - .05 ? Math.max(0, 1 - (el - KITA_SOLO.burst) / .6) : 0;
      ctx.globalCompositeOperation = 'lighter';
      const cone = coneSprite();
      if (cone) {
        ctx.globalAlpha = fade * (.7 + flare * .3);
        ctx.drawImage(cone, x - CONE_FOOT_SCREEN, 0, CONE_FOOT_SCREEN * 2, H);
      }
      // The lamp itself, a soft hot spot at the top.
      ctx.globalAlpha = fade * .55;
      glow(ctx, x, -6, 60, WHITE_RGB);
      // The pool where it lands: a wide soft ellipse on the floor line, with a little spill toward the audience.
      ctx.save();
      ctx.translate(x, FLOOR);
      ctx.scale(1, .2);
      ctx.globalAlpha = fade * (.55 + flare * .3);
      glow(ctx, 0, 0, 210, WARM_RGB);
      ctx.globalAlpha = fade * .5;
      glow(ctx, 0, 0, 120, WHITE_RGB);
      ctx.restore();
      // Dust motes turning slowly in the light.
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0, n = count(12, liteFx); i < n; i++) {
        const k = cycle(el, .18, i, 21);
        const y = FLOOR * (1 - k);
        const half = CONE_TOP + (CONE_FOOT - CONE_TOP) * (y / FLOOR);
        ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .7;
        ctx.fillStyle = '#fff1d6';
        dot(ctx, x + (hash(i, 22) - .5) * 2 * half * .7 + Math.sin(el * 1.3 + i) * 6, y, 1.4 + hash(i, 23) * 1.2);
      }
      break;
    }
    case 'kita-stage-front': {
      // The front pass: the cone once more at low strength over the bodies, and a soft wash on her upper body,
      // so the light falls on her instead of sitting behind her. No darkening here.
      const fade = Math.min(1, el / .25, e.life / .3);
      const flare = el > KITA_SOLO.burst - .05 ? Math.max(0, 1 - (el - KITA_SOLO.burst) / .6) : 0;
      ctx.globalCompositeOperation = 'lighter';
      const cone = coneSprite();
      if (cone) {
        ctx.globalAlpha = fade * (.16 + flare * .12);
        ctx.drawImage(cone, e.x - CONE_FOOT_SCREEN, 0, CONE_FOOT_SCREEN * 2, H);
      }
      const h = e.radius ?? 181;
      ctx.globalAlpha = fade * .16;
      glow(ctx, e.x, FLOOR - h * .62, h * .42, WARM_RGB);
      break;
    }
    case 'kita-wave': {
      // One improvised phrase: two crescents of sound, red then pink, travelling out to the reach, glints riding them.
      const R = e.radius ?? 380;
      const i = e.n ?? 0;
      ctx.lineCap = 'round';
      for (let j = 0; j < 2; j++) {
        const u = clamp((el - j * .07) / .4, 0, 1);
        if (u <= 0 || u >= 1) continue;
        const d = 10 + (R - 10) * ease(u);
        const fade = 1 - u;
        const cx = e.x + dir * (d - 60);
        const arc = .62 + .12 * (i % 2);
        ctx.strokeStyle = j ? PINK : RED;
        for (let pass = 0; pass < 2; pass++) {
          ctx.globalAlpha = fade * (pass ? .95 : .25);
          ctx.lineWidth = (pass ? 6 : 16) * (1 - u * .4);
          ctx.beginPath();
          const c = dir > 0 ? 0 : Math.PI;
          ctx.arc(cx, e.y, 60 + u * 30, c - arc, c + arc);
          ctx.stroke();
        }
        if (j === 0) {
          ctx.globalAlpha = fade;
          ctx.fillStyle = '#ffffff';
          const ga = (dir > 0 ? 0 : Math.PI) + (hash(i, 12) - .5) * arc * 1.6;
          sparkle(ctx, cx + Math.cos(ga) * (60 + u * 30), e.y + Math.sin(ga) * (60 + u * 30), 8 * fade + 2);
        }
      }
      // The flick of the pick: a short flash at her guitar.
      if (el < .12) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - el / .12;
        glow(ctx, e.x, e.y, 34, e.hit ? WHITE_RGB : RED_RGB);
      }
      break;
    }
    case 'kita-duo': {
      // 彩蛋: 一里 behind her for the last bars — her own solo cell under a pink wash, art faintly showing through,
      // a soft rim of light and a few pink glints. Fades in, holds, fades out.
      const fade = Math.min(1, el / .3, e.life / .3);
      const im = image(images, KITA_DUO_SRC);
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * .35;
      glow(ctx, 0, -DUO_H * .55, DUO_H * .55, PINK_RGB);
      ctx.globalCompositeOperation = 'source-over';
      ctx.scale(dir, 1);
      if (im) {
        const wash = pinkWash(im);
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = fade * .5;
        ctx.drawImage(im, DUO_COL * CELL, DUO_ROW * CELL, CELL, CELL, -DUO_H / 2, -DUO_H, DUO_H, DUO_H);
        if (wash) {
          ctx.globalAlpha = fade * .55;
          ctx.drawImage(wash, DUO_COL * CELL, DUO_ROW * CELL, CELL, CELL, -DUO_H / 2, -DUO_H, DUO_H, DUO_H);
        }
      } else {
        ctx.globalAlpha = fade * .5;
        ctx.fillStyle = PINK;
        ctx.beginPath(); ctx.ellipse(0, -DUO_H * .45, 24, DUO_H * .42, 0, 0, TAU); ctx.fill();
        dot(ctx, 0, -DUO_H * .9, 17);
      }
      ctx.scale(dir, 1);
      for (let i = 0, n = count(5, liteFx); i < n; i++) {
        const k = cycle(el, 1.2, i, 27);
        ctx.globalAlpha = fade * Math.sin(k * Math.PI);
        ctx.fillStyle = i % 2 ? '#ffffff' : PINK;
        sparkle(ctx, (hash(i, 28) - .5) * 90, -DUO_H * (.15 + .85 * hash(i, 29)), 4 + hash(i, 30) * 5);
      }
      break;
    }
    case 'kita-finale': {
      // The whole aura goes off: a white bloom, long rays turning out of her, a storm of glints and glitter forward.
      const R = e.radius ?? 460;
      const bloom = ease(Math.min(1, el / .3));
      const fade = 1 - ease(Math.max(0, (el - .25) / .75));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * .8;
      glow(ctx, e.x, e.y, 70 + 200 * bloom, WHITE_RGB);
      ctx.globalAlpha = fade * .45;
      glow(ctx, e.x + dir * R * .4, e.y, R * .5 * bloom, WARM_RGB);
      ctx.fillStyle = `rgb(${WHITE_RGB})`;
      const n = count(12, liteFx);
      for (let i = 0; i < n; i++) {
        const a = el * .6 + i * TAU / n + (hash(i, 13) - .5) * .25;
        ray(ctx, e.x, e.y, a, (240 + 160 * hash(i, 14)) * bloom, .045 + .02 * hash(i, 15), fade * .32);
      }
      ctx.globalCompositeOperation = 'source-over';
      burst(el, 17, { n: count(26, liteFx), speed: [R * .6, R * 1.6], life: .9, drag: .05, gravity: 40, angle: dir > 0 ? 0 : Math.PI, spread: Math.PI * 1.1 }, (x, y, k, i) => {
        ctx.globalAlpha = (1 - k) * .95;
        ctx.fillStyle = GLITTER[i % GLITTER.length];
        if (i % 3 === 0) sparkle(ctx, x, y, 10 * (1 - k * .5));
        else dot(ctx, x, y, 2.4 * (1 - k * .3));
      }, e.x, e.y);
      break;
    }
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  return true;
}
