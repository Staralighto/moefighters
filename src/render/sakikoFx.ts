import type { Effect, Projectile } from '../game/game.ts';
import { H, W, clamp } from '../game/constants.ts';
import { OBLIVION } from './clips.ts';

/* 丰川祥子 — the goddess of oblivion. Every move of hers wears one visual language so she reads as a
   different class of fighter: night blue and moon silver, the gold of the Ave Mujica filigree, the
   gladiolus petal (忘却), the clock ring and the octagram (八芒星ダンス). The super turns the house
   red under a rising blood moon and keeps the eye on the light and the notes, not on the body.
   Everything here is pure drawing: positions and timing come from the effect, randomness is a
   hash of the index, so a frame always draws the same. `lite` drops the soft passes and particles.

   Restraint (v3): U, I and O come round every few seconds, so each beat has one bold subject — a thick
   ring, a beam, a pillar — and decays fast; fine filigree only reads up close and turns into noise from
   across the stage. The full spectacle is kept for L, so the super still lands as a different class. */

/** Painted under every body (floor sigils, light falling on her). */
export const SAKIKO_BACK: readonly string[] = ['saki-octagram', 'saki-rise', 'blood-spot'];
/** Screen space, behind every body (the house going dark). */
export const SAKIKO_SCREEN_BACK: readonly string[] = ['blood-moon', 'saki-pressure'];

const TAU = Math.PI * 2;
const MOON = '#e8eefc';
const ICE = '#bcd4ff';
const BLUE = '#7799CC';
const GOLD = '#e8c873';
const BLOOD = '#e5243b';

const frac = (x: number) => x - Math.floor(x);
const hash = (i: number, k = 0) => frac(Math.sin(i * 12.9898 + k * 78.233 + 1.7) * 43758.5453);
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const bump = (t: number) => Math.sin(Math.PI * clamp(t, 0, 1));

/* ---------- cached paints ---------- */

/** Gradients are built once per context, at the origin or at unit size, and placed with translate /
 *  scale; every fade rides on globalAlpha. So a frame allocates no gradients at all. */
const paints = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>();
function paint(ctx: CanvasRenderingContext2D, key: string, make: () => CanvasGradient): CanvasGradient {
  let m = paints.get(ctx);
  if (!m) paints.set(ctx, m = new Map());
  let g = m.get(key);
  if (!g) m.set(key, g = make());
  return g;
}
function stops(g: CanvasGradient, list: readonly (readonly [number, string])[]): CanvasGradient {
  for (const [o, c] of list) g.addColorStop(o, c);
  return g;
}

/* ---------- shapes ---------- */

function star8(ctx: CanvasRenderingContext2D, r: number): void {
  // {8/3} star: the octagram of the Ave Mujica stage.
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * 3 % 8) * TAU / 8 - Math.PI / 2;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r * .32, y);
  ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r * .32, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.moveTo(x - r * .7, y); ctx.quadraticCurveTo(x, y, x, y - r * .22);
  ctx.quadraticCurveTo(x, y, x + r * .7, y); ctx.quadraticCurveTo(x, y, x, y + r * .22);
  ctx.quadraticCurveTo(x, y, x - r * .7, y);
  ctx.fill();
}

/** A gladiolus petal: a long pointed leaf along +x. */
function petal(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, w: number, ang: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.quadraticCurveTo(-len * .1, -w, len / 2, 0);
  ctx.quadraticCurveTo(-len * .1, w * .7, -len / 2, 0);
  ctx.fill();
  ctx.restore();
}

/** The clock-and-octagram seal, seen at `k` (1 faces the camera, ~.22 lies on the floor). */
function sigil(ctx: CanvasRenderingContext2D, r: number, k: number, rot: number, color: string, alpha: number): void {
  if (alpha <= 0 || r <= 0) return;
  ctx.save();
  ctx.scale(1, k);
  ctx.rotate(rot);
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, r * .86, 0, TAU); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 36; i++) {
    const a = i * TAU / 36, long = i % 3 === 0;
    const r0 = r * (long ? .86 : .9), r1 = r * .97;
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
  }
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = i * TAU / 4, d = r * 1.07, z = r * .045 + 2;
    ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(z * 2, 0); ctx.lineTo(0, z); ctx.lineTo(-z * 2, 0); ctx.lineTo(0, -z); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.lineWidth = 1.6;
  star8(ctx, r * .78); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, r * .3, 0, TAU); ctx.stroke();
  ctx.restore();
}

/** One bold flat ring on the floor: a thick stroke over a soft halo of the same ring. */
function floorRing(ctx: CanvasRenderingContext2D, r: number, k: number, color: string, width: number, alpha: number, lite: boolean): void {
  if (alpha <= 0 || r <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (!lite) {
    ctx.strokeStyle = color; ctx.lineWidth = width * 3; ctx.globalAlpha *= .25;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * k, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha /= .25;
  }
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * k, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}

/** A plain seal: outer ring, inner ring, octagram — no ticks, bold enough to read from across the stage. */
function simpleSeal(ctx: CanvasRenderingContext2D, r: number, k: number, rot: number, color: string, alpha: number): void {
  if (alpha <= 0 || r <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.scale(1, k);
  ctx.rotate(rot);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(0, 0, r * .82, 0, TAU); ctx.stroke();
  ctx.lineWidth = 2.2;
  star8(ctx, r * .8); ctx.stroke();
  ctx.restore();
}

/** Refraction: inside the ring band between `r - band` and `r`, redraw what is already on the canvas
 *  magnified about the centre, so the band pushes the picture outward — air bent by an unseen force.
 *  It reads the canvas itself, so it must be drawn after the bodies. Skipped when the context has no canvas. */
function lens(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, band: number, mag: number, alpha: number): void {
  const cv = ctx.canvas;
  if (!cv || alpha <= 0 || typeof DOMPoint === 'undefined') return;
  const m = ctx.getTransform();
  const c = m.transformPoint(new DOMPoint(cx, cy));
  const sc = Math.hypot(m.a, m.b);
  const R = r * sc, B = band * sc;
  if (R < 6) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  ctx.arc(c.x, c.y, R, 0, TAU);
  ctx.arc(c.x, c.y, Math.max(0, R - B), 0, TAU, true);
  ctx.clip();
  ctx.globalAlpha = alpha;
  const src = R / mag;
  ctx.drawImage(cv, c.x - src, c.y - src, src * 2, src * 2, c.x - R, c.y - R, R * 2, R * 2);
  ctx.restore();
}

/** A filled crescent facing +x. `thick` is how far the inner circle sits back: .5 is a fat moon, .2 a blade. */
function crescent(ctx: CanvasRenderingContext2D, r: number, thick = .5): void {
  const c = r * thick, R = Math.hypot(c, r), a = Math.atan2(r, c);
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  ctx.arc(-c, 0, R, a, -a, true);
  ctx.closePath();
}

/* ---------- the blood moon's parts ---------- */

const MOON_R = 74;
/** Maria on the moon: offset x, offset y, radius (all in moon radii) and darkness. */
const MARIA = [[-.32, -.05, .42, .32], [.25, -.3, .3, .26], [.1, .35, .34, .22], [-.15, -.5, .2, .2], [.45, .18, .22, .18]] as const;
/** Half the side of the baked clock ring, in stage pixels. */
const CLOCK_HALF = Math.ceil(MOON_R * 1.75);
const CLOCK_RES = 2;
let clockArt: HTMLCanvasElement | null | undefined;
/** The moon's clock ring — two rings, sixty ticks, twelve numerals — drawn once into its own canvas
 *  at twice stage resolution, then only rotated and blitted. Null where there is no DOM. */
function clockSprite(): HTMLCanvasElement | null {
  if (clockArt !== undefined) return clockArt;
  if (typeof document === 'undefined') return clockArt = null;
  const c = document.createElement('canvas');
  c.width = c.height = CLOCK_HALF * 2 * CLOCK_RES;
  const x = c.getContext('2d');
  if (!x) return clockArt = null;
  x.scale(CLOCK_RES, CLOCK_RES);
  x.translate(CLOCK_HALF, CLOCK_HALF);
  x.strokeStyle = 'rgba(232,170,140,.75)';
  x.fillStyle = 'rgba(232,170,140,.85)';
  x.lineWidth = 2;
  x.beginPath(); x.arc(0, 0, MOON_R * 1.45, 0, TAU); x.stroke();
  x.lineWidth = 1;
  x.beginPath(); x.arc(0, 0, MOON_R * 1.32, 0, TAU); x.stroke();
  x.beginPath();
  for (let i = 0; i < 60; i++) {
    const an = i / 60 * TAU, r0 = MOON_R * (i % 5 ? 1.36 : 1.32);
    x.moveTo(Math.cos(an) * r0, Math.sin(an) * r0); x.lineTo(Math.cos(an) * MOON_R * 1.43, Math.sin(an) * MOON_R * 1.43);
  }
  x.stroke();
  x.font = '13px serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const NUM = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  for (let i = 0; i < 12; i++) {
    const an = i / 12 * TAU - Math.PI / 2;
    x.save(); x.translate(Math.cos(an) * MOON_R * 1.62, Math.sin(an) * MOON_R * 1.62); x.rotate(an + Math.PI / 2);
    x.fillText(NUM[i], 0, 0);
    x.restore();
  }
  return clockArt = c;
}

/* ---------- the effects ---------- */

/** Draws e if it is one of hers. Returns false for anything else. */
export function drawSakikoFx(ctx: CanvasRenderingContext2D, e: Effect, lite: boolean): boolean {
  const p = 1 - e.life / e.max;
  const t = e.max - e.life;
  const r = e.radius ?? 100;
  const dir = e.dir ?? 1;
  switch (e.type) {
    /* ---- presence: walk and J / K (data.aura) ---- */
    case 'saki-step': {
      // A footfall: one thin ring opens on the floor and is gone, a single glint at its heart.
      ctx.save();
      ctx.translate(e.x, e.y);
      const k = 1 - p;
      floorRing(ctx, 8 + 30 * ease(p), .25, MOON, 1.6, .5 * k, true);
      ctx.fillStyle = GOLD;
      ctx.globalAlpha = k * k * .8;
      sparkle(ctx, 0, -2, 4 * k + 1);
      ctx.restore();
      return true;
    }
    case 'saki-swing': {
      // J / K: a thin silver moon-blade along the swing, a touch of gold on the kick; a glint where it lands.
      ctx.save();
      ctx.translate(e.x, e.y);
      const k = 1 - p;
      const heavy = !!e.heavy;
      ctx.scale(dir, 1);
      ctx.rotate(heavy ? .35 : -.25);
      const rr = r * (heavy ? 1 : .9) * (.85 + .2 * ease(p * 2));
      ctx.globalAlpha = k * .75;
      ctx.fillStyle = heavy ? '#f1e6c6' : MOON;
      crescent(ctx, rr, .12); ctx.fill();
      if (heavy) {
        ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.globalAlpha = k * .7;
        ctx.beginPath(); ctx.arc(0, 0, rr, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      }
      if (e.hit) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = k;
        sparkle(ctx, rr * .9, 0, (heavy ? 12 : 8) * k + 2);
      }
      ctx.restore();
      return true;
    }

    /* ---- U 忘却之影 ---- */
    case 'saki-blink': {
      // The blink: one bright beam from where she was to where she is, a slit of light at each end,
      // and a few petals left hanging. e.x is the start, tx the run.
      ctx.save();
      ctx.translate(e.x, e.y);
      const run = e.tx ?? 0;
      const head = clamp(t / .06, 0, 1), tail = clamp((t - .04) / .22, 0, 1);
      const x0 = run * tail, x1 = run * head;
      const fade = 1 - p;
      ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'lighter';
      if (!lite) {
        ctx.strokeStyle = `rgba(119,153,204,${.4 * fade})`; ctx.lineWidth = 30;
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x1, 0); ctx.stroke();
      }
      ctx.strokeStyle = `rgba(255,255,255,${fade})`; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x1, 0); ctx.stroke();
      const slit = 1 - clamp(t / .2, 0, 1);
      if (slit > 0) {
        ctx.fillStyle = `rgba(255,255,255,${slit})`;
        for (const sx of [0, run]) { ctx.beginPath(); ctx.ellipse(sx, 0, 7 * slit + 2, 100, 0, 0, TAU); ctx.fill(); }
      }
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < (lite ? 4 : 7); i++) {
        const u = .1 + .8 * hash(i, 1);
        ctx.globalAlpha = fade * clamp((head - u) * 6, 0, 1);
        ctx.fillStyle = i % 3 ? MOON : ICE;
        petal(ctx, run * u, (hash(i, 3) - .5) * 70 + t * 50, 22, 6, hash(i, 7) * TAU + t * 4);
      }
      ctx.restore();
      return true;
    }
    case 'saki-moon-ring': {
      // A shove: one thick ring opening across the floor under a short burst of light. e.y is her feet.
      ctx.save();
      ctx.translate(e.x, e.y);
      const k = 1 - p;
      const rr = r * (.35 + .85 * ease(p * 1.5));
      ctx.globalCompositeOperation = 'lighter';
      if (k > .02) {
        ctx.fillStyle = paint(ctx, 'ring-col', () => stops(ctx.createLinearGradient(0, -170, 0, 0), [[0, 'rgba(188,212,255,0)'], [1, 'rgba(255,255,255,.6)']]));
        ctx.globalAlpha = k;
        ctx.fillRect(-17 * k, -170, 34 * k, 170);
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
      floorRing(ctx, rr, .24, e.color, 6 * k + 2, k, lite);
      ctx.restore();
      return true;
    }
    case 'saki-shiro-blast': {
      // The 白祥 goes. One subject: a pillar of light falling on the spot, hard and short, with one ring
      // running out across the floor and a handful of glass and petals. e.y is the floor.
      ctx.save();
      ctx.translate(e.x, e.y);
      const k = 1 - p;
      ctx.globalCompositeOperation = 'lighter';
      const pw = 130 * (1 - ease(t / .45));
      if (pw > .5) {
        // A unit-wide gradient stretched to the pillar's width.
        const top = -e.y - 10;
        ctx.save();
        ctx.scale(pw, 1);
        ctx.fillStyle = paint(ctx, 'pillar', () => stops(ctx.createLinearGradient(-.5, 0, .5, 0), [
          [0, 'rgba(119,153,204,0)'], [.3, 'rgba(188,212,255,.6)'], [.5, 'rgba(255,255,255,1)'], [.7, 'rgba(188,212,255,.6)'], [1, 'rgba(119,153,204,0)'],
        ]));
        ctx.fillRect(-.5, top, 1, -top);
        ctx.restore();
      }
      const core = 1 - clamp(t / .25, 0, 1);
      if (core > 0) {
        ctx.fillStyle = paint(ctx, 'core' + Math.round(r), () => stops(ctx.createRadialGradient(0, -70, 0, 0, -70, r * .9), [[0, 'rgba(255,255,255,.9)'], [1, 'rgba(188,212,255,0)']]));
        ctx.globalAlpha = core;
        ctx.beginPath(); ctx.ellipse(0, -40, r * .9, r * .8, 0, Math.PI, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
      floorRing(ctx, r * (.25 + 1.2 * ease(t / .55)), .22, '#ffffff', 9 * k + 2, 1 - clamp(t / .6, 0, 1), lite);
      for (let i = 0; i < (lite ? 5 : 9); i++) {
        const a = -Math.PI * (.12 + .76 * hash(i, 1));
        const v = 320 + hash(i, 2) * 300;
        const sx = Math.cos(a) * v * t;
        const sy = -80 + Math.sin(a) * v * t + 760 * t * t;
        if (sy > 0) continue;
        ctx.globalAlpha = k;
        ctx.fillStyle = i % 3 ? MOON : ICE;
        if (i % 2) {
          const z = 10 + hash(i, 3) * 6;
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(t * (6 + hash(i, 4) * 8));
          ctx.beginPath(); ctx.moveTo(0, -z); ctx.lineTo(z * .8, z * .5); ctx.lineTo(-z * .5, z * .7); ctx.closePath(); ctx.fill();
          ctx.restore();
        } else petal(ctx, sx, sy, 24, 7, a + t * 5);
      }
      ctx.restore();
      return true;
    }

    /* ---- I 神威 ---- */
    case 'saki-octagram': {
      // One bold octagram on the floor: it draws itself in through the windup (t0 seconds), flashes
      // white on the stomp, and goes out. No ticks, no second ring — it has to read from across the stage.
      ctx.save();
      ctx.translate(e.x, e.y);
      const t0 = e.t0 ?? .4;
      ctx.scale(1, .2);
      if (t < t0) {
        const q = t / t0;
        const rr = r * (.3 + .3 * ease(q));
        ctx.rotate(t * .8);
        ctx.globalAlpha = .35 + .5 * q;
        ctx.strokeStyle = GOLD; ctx.lineWidth = 7;
        ctx.setLineDash([rr * 6 * q, rr * 6]);
        star8(ctx, rr); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, 0, rr * 1.08, -Math.PI / 2, -Math.PI / 2 + TAU * q); ctx.stroke();
      } else {
        // The stomp: the power is released, so the seal does not burst — it simply goes out.
        const s = clamp((t - t0) / Math.max(.01, e.max - t0), 0, 1);
        const rr = r * .6;
        ctx.rotate(t0 * .8);
        ctx.globalAlpha = (1 - s) * (1 - s);
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 7;
        star8(ctx, rr); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, rr * 1.08, 0, TAU); ctx.stroke();
      }
      ctx.restore();
      return true;
    }
    case 'saki-rise':
    case 'saki-rise-front': {
      // While she gathers, a cylinder of light rises out of the seal round her: brighter at its two
      // walls than in the middle (that is what gives it a body), fading upward, with thin rings drifting
      // up it. The rings' far halves are drawn behind her ('saki-rise', under the bodies) and their near
      // halves in front ('saki-rise-front'), so she stands inside the light. e.y is the floor.
      ctx.save();
      ctx.translate(e.x, e.y);
      const a = Math.min(1, t / .15) * Math.min(1, e.life / .12);
      const R = r, Hc = 230, K = .22;
      const front = e.type === 'saki-rise-front';
      if (!front) {
        // The base: a soft glow on the floor in the seal's own perspective.
        ctx.save();
        ctx.scale(1, K);
        ctx.globalAlpha = a;
        ctx.fillStyle = paint(ctx, 'rise-base' + R, () => stops(ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.3), [[0, 'rgba(255,236,180,.4)'], [1, 'rgba(255,236,180,0)']]));
        ctx.beginPath(); ctx.arc(0, 0, R * 1.3, 0, TAU); ctx.fill();
        ctx.restore();
        // The wall: horizontal falloff (bright rims, faint core), stacked in bands that thin out upward.
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = paint(ctx, 'rise-wall' + R, () => stops(ctx.createLinearGradient(-R, 0, R, 0), [
          [0, 'rgba(255,236,180,0)'], [.08, 'rgba(255,236,180,.42)'], [.3, 'rgba(255,236,180,.12)'], [.5, 'rgba(255,236,180,.07)'],
          [.7, 'rgba(255,236,180,.12)'], [.92, 'rgba(255,236,180,.42)'], [1, 'rgba(255,236,180,0)'],
        ]));
        const bands = lite ? 5 : 10;
        for (let i = 0; i < bands; i++) {
          ctx.globalAlpha = a * (1 - i / bands) ** 1.6;
          ctx.fillRect(-R, -Hc * (i + 1) / bands, R * 2, Hc / bands + .5);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      // Rings rising up the cylinder.
      ctx.strokeStyle = '#fff4d0';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const u = frac(t * .9 + i / 3);
        const y = -Hc * .85 * u;
        ctx.globalAlpha = a * (1 - u) * (front ? .9 : .5);
        ctx.beginPath();
        ctx.ellipse(0, y, R * (1 - u * .12), R * K * (1 - u * .12), 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }
    case 'divine-quake': {
      // 神威: a light tap of the heel, and an unseen force goes out. Nothing breaks: the floor only
      // trembles (one faint ring, dust specks hopping as it passes), and a clear wave of bent air rolls
      // out from her — no colour of its own, it pushes the picture outward as it goes. e.y is the floor.
      ctx.save();
      const cx = e.x, cy = e.y - 70;
      // The wave of bent air, and a fainter echo just behind it.
      for (const [delay, strength] of [[0, 1], [.09, .55]] as const) {
        const q = clamp((t - delay) / .4, 0, 1);
        if (q <= 0 || q >= 1) continue;
        const rr = 30 + (r * 1.05) * ease(q);
        const fade = (1 - q) * strength;
        if (!lite) lens(ctx, cx, cy, rr, 34, 1 + .1 * fade, .95);
        ctx.strokeStyle = `rgba(232,238,252,${.32 * fade})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, rr, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
        ctx.strokeStyle = `rgba(232,238,252,${.14 * fade})`;
        ctx.beginPath(); ctx.arc(cx, cy, rr - 12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      }
      ctx.translate(e.x, e.y);
      // The heel: a small white touch on the floor.
      const tap = 1 - clamp(t / .16, 0, 1);
      if (tap > 0) {
        ctx.fillStyle = `rgba(255,255,255,${.8 * tap})`;
        ctx.beginPath(); ctx.ellipse(0, 0, 34 * (1.4 - tap * .4), 6, 0, 0, TAU); ctx.fill();
      }
      // The floor trembles: one faint ring, and specks of dust hopping once as the wave passes them.
      const fq = clamp(t / .5, 0, 1);
      floorRing(ctx, 20 + r * ease(fq), .16, MOON, 1.5, .35 * (1 - fq), true);
      ctx.fillStyle = 'rgba(214,220,236,1)';
      for (let i = 0; i < (lite ? 8 : 16); i++) {
        const side = i % 2 ? 1 : -1;
        const d = 30 + hash(i, 1) * r;
        const local = (t - d / (r * 1.05) * .3) / .25;
        if (local <= 0 || local >= 1) continue;
        ctx.globalAlpha = .7 * bump(local);
        ctx.fillRect(side * d - 1.5, -bump(local) * (6 + hash(i, 2) * 8) - 1.5, 3, 3);
      }
      ctx.restore();
      return true;
    }
    case 'saki-lift': {
      // On someone the force throws: the air round them bends once and a few motes rise. No sparks —
      // nothing touched them.
      ctx.save();
      const k = 1 - p;
      if (!lite) lens(ctx, e.x, e.y, 30 + 40 * ease(p), 18, 1 + .06 * k, .9);
      ctx.strokeStyle = `rgba(232,238,252,${.4 * k})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, 30 + 40 * ease(p), 0, TAU); ctx.stroke();
      ctx.fillStyle = GOLD;
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = k;
        sparkle(ctx, e.x + (hash(i, 1) - .5) * 60, e.y + 30 - p * (50 + hash(i, 2) * 40), 4 * k + 1);
      }
      ctx.restore();
      return true;
    }
    case 'saki-pressure': {
      // The divine weight: the edges of the stage dip dark for a breath. Screen space.
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = bump(p);
      ctx.fillStyle = paint(ctx, 'pressure', () => stops(ctx.createRadialGradient(0, 0, 120, 0, 0, W * .75), [[0, 'rgba(4,6,16,0)'], [1, 'rgba(4,6,16,.32)']]));
      ctx.fillRect(-e.x, -e.y, W, H);
      ctx.restore();
      return true;
    }

    /* ---- O 双月轮舞 ---- */
    case 'twin-moon': {
      // One crescent of the trail, glowing, drifting back as it fades, with sparks at its horns.
      ctx.save();
      const k = 1 - p;
      ctx.translate(e.x - dir * p * 22, e.y);
      ctx.scale(dir, 1);
      const rr = r * (1 + p * .15);
      if (!lite) {
        ctx.globalAlpha = k * .22;
        ctx.fillStyle = e.color;
        ctx.save(); ctx.scale(1.18, 1.18); crescent(ctx, rr, .32); ctx.fill(); ctx.restore();
      }
      ctx.globalAlpha = k * .75;
      ctx.fillStyle = e.color;
      crescent(ctx, rr, .2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, rr, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = k;
      sparkle(ctx, 0, -rr, 6 * k + 2);
      sparkle(ctx, 0, rr, 6 * k + 2);
      ctx.restore();
      return true;
    }
    case 'saki-eclipse': {
      // The turn: the blue moon and the silver moon meet — a corona bursts and petals fly.
      ctx.save();
      ctx.translate(e.x, e.y);
      const k = 1 - p;
      const mr = r * (.55 + .3 * ease(p * 2));
      ctx.globalCompositeOperation = 'lighter';
      if (!lite) {
        ctx.save();
        ctx.scale(mr, mr);
        ctx.globalAlpha = k;
        ctx.fillStyle = paint(ctx, 'eclipse', () => stops(ctx.createRadialGradient(0, 0, .6, 0, 0, 2.6), [[0, 'rgba(232,238,252,.3)'], [1, 'rgba(119,153,204,0)']]));
        ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = k;
      ctx.globalCompositeOperation = 'source-over';
      // Blue moon and silver moon, the silver one cut by the blue: an eclipse, not a white ball.
      ctx.fillStyle = 'rgba(119,153,204,.9)';
      ctx.beginPath(); ctx.arc(-mr * .35, 0, mr, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(232,238,252,.9)';
      ctx.save(); ctx.translate(mr * .35, 0); crescent(ctx, mr, .7); ctx.fill(); ctx.restore();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4 * k + 1;
      ctx.beginPath(); ctx.arc(0, 0, mr * (1.3 + p * 1.2), 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + p * .6, l = mr * (1.4 + 1.4 * ease(p * 1.5));
        ctx.moveTo(Math.cos(a - .04) * mr, Math.sin(a - .04) * mr);
        ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l);
        ctx.lineTo(Math.cos(a + .04) * mr, Math.sin(a + .04) * mr);
      }
      ctx.fill();
      for (let i = 0; i < (lite ? 3 : 6); i++) {
        const a = hash(i, 1) * TAU, d = mr * (1 + 2.2 * ease(p) * (.5 + hash(i, 2) * .5));
        ctx.fillStyle = i % 3 ? MOON : BLUE;
        petal(ctx, Math.cos(a) * d, Math.sin(a) * d + p * 30, 15, 4.5, a + p * 5);
      }
      ctx.restore();
      return true;
    }
    case 'saki-crossmoon': {
      // The brake: two crescents cross over where she stops, flare, and are gone.
      ctx.save();
      ctx.translate(e.x, e.y);
      const k = 1 - p;
      const rr = r * (.85 + .3 * ease(p * 2));
      for (const [rot, color] of [[-.6, BLUE], [.6 + Math.PI, MOON]] as const) {
        ctx.save(); ctx.rotate(rot);
        ctx.globalAlpha = k * .9; ctx.fillStyle = color;
        crescent(ctx, rr, .25); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, rr, -Math.PI / 2, Math.PI / 2); ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = k;
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, 0, 0, 20 * (1 - p * .5));
      ctx.restore();
      return true;
    }
    case 'saki-moon-cut': {
      // Where a moon passes through them: a thin bright crescent slash and a few sparks.
      ctx.save();
      ctx.translate(e.x, e.y);
      const k = 1 - p;
      ctx.rotate(-.5 * dir);
      ctx.scale(dir, .55);
      ctx.globalAlpha = k;
      ctx.fillStyle = e.color;
      crescent(ctx, r * (1 + p * .3), .22); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r * (1 + p * .3), -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = k;
      for (let i = 0; i < 6; i++) {
        const a = hash(i, 1) * TAU, d = r * (.4 + 1.2 * ease(p));
        sparkle(ctx, Math.cos(a) * d, Math.sin(a) * d, 5 * k + 1);
      }
      ctx.restore();
      return true;
    }

    /* ---- L 血月的奏鸣 ---- */
    case 'blood-moon': {
      // The house goes black, a blood moon rises with its clock ring turning, red light pours down
      // and petals fall through the whole screen. Screen space, behind every body. Every gradient is
      // cached at the moon's own origin and the clock ring is a baked sprite, so a frame only transforms.
      ctx.save();
      const a = Math.min(1, t / .2) * Math.min(1, e.life / .4);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(5,1,5,.8)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = paint(ctx, 'moon-vig', () => stops(ctx.createRadialGradient(W / 2, H * .55, H * .25, W / 2, H * .55, W * .72), [[0, 'rgba(60,0,12,0)'], [1, 'rgba(60,0,12,.6)']]));
      ctx.fillRect(0, 0, W, H);
      const rise = ease(t / .8);
      const my = H * .64 + (H * .25 - H * .64) * rise;
      ctx.translate(W / 2, my);
      // Light pouring down: one unit beam gradient, each beam a rotated, scaled triangle.
      ctx.globalCompositeOperation = 'lighter';
      const beam = paint(ctx, 'moon-beam', () => stops(ctx.createLinearGradient(0, 0, 1, 0), [[0, 'rgba(229,36,59,.2)'], [1, 'rgba(229,36,59,0)']]));
      const beams = lite ? 4 : 9;
      ctx.globalAlpha = a * rise;
      ctx.fillStyle = beam;
      for (let i = 0; i < beams; i++) {
        const u = (i + .5) / beams - .5;
        const half = .035 + hash(i, 1) * .03;
        ctx.save();
        ctx.rotate(Math.PI / 2 + u * 1.5 + Math.sin(t * .7 + i * 1.3) * .05);
        ctx.scale(640, 640);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1, -half); ctx.lineTo(1, half); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      if (!lite) {
        ctx.globalAlpha = a;
        ctx.fillStyle = paint(ctx, 'moon-halo', () => stops(ctx.createRadialGradient(0, 0, MOON_R * .9, 0, 0, MOON_R * 3.2), [[0, 'rgba(229,36,59,.38)'], [1, 'rgba(229,36,59,0)']]));
        ctx.beginPath(); ctx.arc(0, 0, MOON_R * 3.2, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a;
      // The clock ring, turning slowly; a dotted ring counter-turning outside it.
      const ring = clockSprite();
      if (ring) {
        ctx.save();
        ctx.rotate(t * .22);
        ctx.drawImage(ring, -CLOCK_HALF, -CLOCK_HALF, CLOCK_HALF * 2, CLOCK_HALF * 2);
        ctx.restore();
      }
      ctx.save();
      ctx.rotate(-t * .28);
      ctx.strokeStyle = 'rgba(232,170,140,.75)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 9]);
      ctx.beginPath(); ctx.arc(0, 0, MOON_R * 1.82, 0, TAU); ctx.stroke();
      ctx.restore();
      // The moon: limb-darkened, mottled maria, the earth's shadow still on one side, a thin hot rim.
      ctx.fillStyle = paint(ctx, 'moon-disc', () => stops(ctx.createRadialGradient(-MOON_R * .25, -MOON_R * .3, MOON_R * .05, 0, 0, MOON_R), [[0, '#ff9a7a'], [.45, '#d42034'], [.85, '#7a0818'], [1, '#3a0208']]));
      ctx.beginPath(); ctx.arc(0, 0, MOON_R, 0, TAU); ctx.fill();
      ctx.save();
      ctx.clip();
      MARIA.forEach(([dx, dy, cr, al], i) => {
        ctx.fillStyle = paint(ctx, 'maria' + i, () => stops(ctx.createRadialGradient(dx * MOON_R, dy * MOON_R, 0, dx * MOON_R, dy * MOON_R, cr * MOON_R), [[0, `rgba(60,0,10,${al})`], [1, 'rgba(60,0,10,0)']]));
        ctx.fillRect(-MOON_R, -MOON_R, MOON_R * 2, MOON_R * 2);
      });
      ctx.fillStyle = paint(ctx, 'moon-shade', () => stops(ctx.createLinearGradient(-MOON_R, MOON_R, MOON_R * .4, -MOON_R * .2), [[0, 'rgba(20,0,4,.7)'], [.6, 'rgba(20,0,4,0)']]));
      ctx.fillRect(-MOON_R, -MOON_R, MOON_R * 2, MOON_R * 2);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,200,180,.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, MOON_R - 1, -1.9, .2); ctx.stroke();
      ctx.translate(-W / 2, -my);
      // Falling petals across the screen.
      const n = lite ? 12 : 30;
      for (let i = 0; i < n; i++) {
        const sp = 50 + hash(i, 3) * 70;
        const x = hash(i, 1) * W + Math.sin(t * 1.2 + i) * 28;
        const y = frac(hash(i, 2) + t * sp / (H + 60)) * (H + 60) - 30;
        ctx.globalAlpha = a * (.45 + hash(i, 4) * .4);
        ctx.fillStyle = i % 3 ? BLOOD : '#7a0a1c';
        petal(ctx, x, y, 12 + hash(i, 5) * 8, 4, t * (1 + hash(i, 6) * 2) + i);
      }
      ctx.restore();
      return true;
    }
    case 'blood-spot': {
      // A red light falls on her from above and pools at her feet, a slow seal turning in the pool.
      ctx.save();
      ctx.translate(e.x, e.y);
      const a = Math.min(1, t / .25) * Math.min(1, e.life / .3);
      const top = Math.round(-e.y - 10);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.fillStyle = paint(ctx, 'spot' + top, () => stops(ctx.createLinearGradient(0, top, 0, 0), [[0, 'rgba(229,36,59,0)'], [.6, 'rgba(229,36,59,.14)'], [1, 'rgba(255,90,110,.32)']]));
      ctx.beginPath(); ctx.moveTo(-34, top); ctx.lineTo(34, top); ctx.lineTo(130, 0); ctx.lineTo(-130, 0); ctx.closePath(); ctx.fill();
      ctx.save();
      ctx.scale(1, .2);
      ctx.fillStyle = paint(ctx, 'spot-pool', () => stops(ctx.createRadialGradient(0, 0, 0, 0, 0, 150), [[0, 'rgba(255,70,90,.45)'], [1, 'rgba(229,36,59,0)']]));
      ctx.beginPath(); ctx.arc(0, 0, 150, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      sigil(ctx, 120 + Math.sin(t * 2) * 4, .2, t * .8, '#ff6a7d', a * .8);
      ctx.restore();
      return true;
    }
    case 'blood-staff': {
      // The music itself, in front of her: five staff lines pour out of her hands and wave away across
      // the stage, small notes riding them; two red orbits turn round her body; embers rise. This layer
      // sits over the body on purpose — the eye follows the light, not the pose. Follows her (ox, oy).
      ctx.save();
      ctx.translate(e.x, e.y);
      const a = Math.min(1, t / .3) * Math.min(1, e.life / .35);
      const L = 820;
      const step = lite ? 40 : 20;
      const yAt = (x: number, j: number) => {
        const u = x / L;
        return Math.sin(x * .011 - t * 4.2) * 34 * u + (j - 2) * 7 * (1 + u * 1.4) - x * .06;
      };
      ctx.lineCap = 'round';
      // One gradient per facing, cached; the fade-in rides on globalAlpha.
      ctx.strokeStyle = paint(ctx, 'staff' + dir, () => stops(ctx.createLinearGradient(0, 0, dir * L, 0), [[0, 'rgba(255,120,135,.8)'], [.5, 'rgba(232,170,110,.5)'], [1, 'rgba(232,200,115,0)']]));
      ctx.globalAlpha = a;
      for (let j = 0; j < 5; j++) {
        ctx.lineWidth = j === 2 ? 2 : 1.4;
        ctx.beginPath();
        for (let x = 0; x <= L; x += step) {
          if (x === 0) ctx.moveTo(0, yAt(0, j)); else ctx.lineTo(dir * x, yAt(x, j));
        }
        ctx.stroke();
      }
      // Notes riding the staff.
      for (let i = 0; i < (lite ? 4 : 9); i++) {
        const u = frac(t * .32 + i / 9);
        const x = u * L, y = yAt(x, Math.floor(hash(i, 1) * 5)) - 4;
        ctx.globalAlpha = a * bump(u);
        ctx.fillStyle = i % 3 ? '#ff6a7d' : GOLD;
        const nx = dir * x;
        ctx.beginPath(); ctx.ellipse(nx, y, 4.5, 3.2, -.5, 0, TAU); ctx.fill();
        ctx.fillRect(nx + 3.2, y - 15, 1.6, 15);
      }
      // Two orbits round the body, turning opposite ways.
      ctx.globalAlpha = a;
      for (const [tilt, speed, color] of [[.35, 1, 'rgba(255,90,110,.85)'], [-.3, -1.4, 'rgba(232,200,115,.7)']] as const) {
        ctx.save();
        ctx.translate(-(e.ox ?? 0), 10);
        ctx.rotate(tilt);
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.setLineDash([16, 10]);
        ctx.lineDashOffset = -t * 60 * speed;
        ctx.beginPath(); ctx.ellipse(0, 0, 82, 20, 0, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        const an = t * 2.2 * speed;
        sparkle(ctx, Math.cos(an) * 82, Math.sin(an) * 20, 5);
        ctx.restore();
      }
      // Embers rising round her.
      ctx.fillStyle = '#ff8a8a';
      for (let i = 0; i < (lite ? 6 : 16); i++) {
        const rise = frac(t * (.5 + hash(i, 2) * .5) + hash(i, 3));
        ctx.globalAlpha = a * (1 - rise) * .9;
        const x = -(e.ox ?? 0) + (hash(i, 1) - .5) * 160 + Math.sin(t * 2 + i) * 8;
        const y = 90 - rise * 220;
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
      ctx.restore();
      return true;
    }
    case 'blood-flash': {
      // A note leaves the keys: a four-point star and a small ring.
      ctx.save();
      ctx.translate(e.x, e.y);
      const k = 1 - p;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,140,150,${k})`;
      sparkle(ctx, 0, 0, 30 * (.5 + p));
      ctx.fillStyle = `rgba(255,255,255,${k})`;
      sparkle(ctx, 0, 0, 14 * (.5 + p));
      ctx.strokeStyle = `rgba(229,36,59,${k})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 8 + p * 26, 0, TAU); ctx.stroke();
      ctx.restore();
      return true;
    }
    case 'blood-hit': {
      // A note lands: a red bloom of petals and a white star.
      ctx.save();
      ctx.translate(e.x, e.y);
      const k = 1 - p;
      ctx.strokeStyle = `rgba(255,90,110,${k})`; ctx.lineWidth = 4 * k + 1;
      ctx.beginPath(); ctx.arc(0, 0, 10 + 40 * ease(p), 0, TAU); ctx.stroke();
      for (let i = 0; i < (lite ? 4 : 9); i++) {
        const an = i / 9 * TAU + hash(i, 1), d = 10 + 46 * ease(p);
        ctx.globalAlpha = k;
        ctx.fillStyle = i % 2 ? BLOOD : '#ff9aa6';
        petal(ctx, Math.cos(an) * d, Math.sin(an) * d + p * 10, 14, 5, an);
      }
      ctx.globalAlpha = k;
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, 0, 0, 18 * k + 4);
      ctx.restore();
      return true;
    }
    case 'blood-finale': {
      // The last chord: a red shock ring across the floor, a standing ring, and a storm of petals. e.y is the floor.
      ctx.save();
      ctx.translate(e.x, e.y);
      const k = 1 - p;
      const rr = r * ease(p * 1.2);
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8 * k + 2;
      ctx.beginPath(); ctx.ellipse(0, 0, rr, rr * .2, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = BLOOD; ctx.lineWidth = 5 * k + 1;
      ctx.beginPath(); ctx.ellipse(0, 0, rr * .82, rr * .17, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -100, rr * .45, rr * .45, 0, 0, TAU); ctx.stroke();
      sigil(ctx, rr * .5, 1, p, '#ff6a7d', k * .7);
      for (let i = 0; i < (lite ? 10 : 28); i++) {
        const an = hash(i, 1) * TAU, d = rr * (.3 + hash(i, 2) * .7);
        ctx.fillStyle = i % 3 ? BLOOD : '#ffd0d6';
        petal(ctx, Math.cos(an) * d, -100 + Math.sin(an) * d * .6 + p * 40, 18, 6, an + p * 6);
      }
      ctx.restore();
      return true;
    }
  }
  return false;
}

/** 忘却之影: the 白祥's own floor — a seal whose gold arc runs down like a clock as the fuse burns,
 *  and motes rising off her. Called under the phantom image, at the shot's own origin. */
export function drawShiroFloor(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean): void {
  const left = clamp(1 - p.age / OBLIVION.fuse, 0, 1);
  const warn = OBLIVION.fuse - p.age < OBLIVION.flicker;
  const born = Math.min(1, p.age / .15);
  const R = 74;
  ctx.save();
  simpleSeal(ctx, R, .22, p.age * .6, warn ? '#ffffff' : ICE, .75 * born);
  // The fuse: one thick arc round the seal that shortens to nothing, white once it is about to go.
  ctx.scale(1, .22);
  ctx.globalAlpha = born;
  ctx.strokeStyle = warn ? '#ffffff' : GOLD;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 0, R * 1.14, -Math.PI / 2, -Math.PI / 2 + TAU * left); ctx.stroke();
  ctx.restore();
}

/** 血月的奏鸣: twinkles strewn along a note's ribbon. */
export function bloodSparkles(ctx: CanvasRenderingContext2D, p: Projectile): void {
  const pts = p.trail;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  for (let i = 2; i < pts.length; i += 3) {
    const k = i / pts.length;
    const tw = .5 + .5 * Math.sin(p.age * 18 + i * 1.7 + (p.wave ?? 0));
    ctx.globalAlpha = k * tw * .8;
    sparkle(ctx, pts[i].x, pts[i].y - 4 + (i % 2 ? 6 : 0), 2 + 3 * k);
  }
  ctx.restore();
}
