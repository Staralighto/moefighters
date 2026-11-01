/* Small-geometry particles, shared by any effect that wants texture out of many little shapes instead of one
   big outlined icon: diamonds, triangles, four-point sparkles, dots and soap bubbles, plus a stateless burst.
   Everything is a pure function of time and an index (hash noise), so it needs no per-particle state, replays
   the same on every client, and costs nothing when nothing is drawn.

   Cost rules (these run tens to hundreds of times a frame):
   - Every primitive skips a size that is not positive and an alpha that is not visible. A negative radius
     makes canvas arc() throw, and one throw stops the render loop.
   - Noise is a table lookup, not a Math.sin per call.
   - The shapes with curves or several passes (sparkle, soap bubble, glyph) are painted once into a small
     cached canvas per colour and stamped with drawImage, which is the cheapest thing a 2D canvas does.
   - A dot under 2.5 px is a fillRect: at that size a circle and a square look the same. */

export const TAU = Math.PI * 2;

const frac = (x: number) => x - Math.floor(x);

/** Stable noise in [0, 1) for a particle index and a channel. A lookup into one precomputed table. */
const HASH_SIZE = 8192;
let hashTable: Float32Array | null = null;
export function hash(i: number, k = 0): number {
  if (!hashTable) {
    hashTable = new Float32Array(HASH_SIZE);
    for (let j = 0; j < HASH_SIZE; j++) hashTable[j] = frac(Math.sin(j * 12.9898 + 2.31) * 43758.5453);
  }
  return hashTable[((i * 131 + k * 977) | 0) & (HASH_SIZE - 1)];
}
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const cycle = (t: number, rate: number, i: number, k = 0) => frac(t * rate + hash(i, k));

/** Below this the particle is not drawn at all. */
const MIN_ALPHA = .02;
const visible = (ctx: CanvasRenderingContext2D) => ctx.globalAlpha > MIN_ALPHA;

/* ---- cached stamps ---- */

type Stamp = HTMLCanvasElement;
const stamps = new Map<string, Stamp>();
function stamp(key: string, size: number, paint: (g: CanvasRenderingContext2D, s: number) => void): Stamp | null {
  let c = stamps.get(key);
  if (c) return c;
  if (typeof document === 'undefined') return null;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;
  paint(g, size);
  stamps.set(key, c);
  return c;
}
function colorKey(ctx: CanvasRenderingContext2D): string {
  const f = ctx.fillStyle;
  return typeof f === 'string' ? f : '#ffffff';
}

/** A diamond of half-width w and half-height h, turned by rot. Filled with the current fillStyle. */
export function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rot = 0): void {
  if (!(w > 0) || !(h > 0) || !visible(ctx)) return;
  if (h < 1.6) { ctx.fillRect(x - w, y - h, w * 2, h * 2); return; }
  const c = Math.cos(rot), s = Math.sin(rot);
  ctx.beginPath();
  ctx.moveTo(x - s * h, y - c * h);
  ctx.lineTo(x + c * w, y + s * w);
  ctx.lineTo(x + s * h, y + c * h);
  ctx.lineTo(x - c * w, y - s * w);
  ctx.closePath();
  ctx.fill();
}

/** A triangle of radius r, turned by rot. Filled with the current fillStyle. */
export function tri(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0): void {
  if (!(r > 0) || !visible(ctx)) return;
  const c = Math.cos(rot), s = Math.sin(rot);
  // The three corners at rot, rot + 120°, rot + 240°, from one cos/sin pair.
  const c2 = -.5, s2 = .8660254;
  ctx.beginPath();
  ctx.moveTo(x + c * r, y + s * r);
  ctx.lineTo(x + (c * c2 - s * s2) * r, y + (s * c2 + c * s2) * r);
  ctx.lineTo(x + (c * c2 + s * s2) * r, y + (s * c2 - c * s2) * r);
  ctx.closePath();
  ctx.fill();
}

const SPARKLE_PX = 64;
/** A thin four-point sparkle of radius r, in the current fillStyle. Stamped from a cached canvas. */
export function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (!(r > 0) || !visible(ctx)) return;
  const col = colorKey(ctx);
  const c = stamp('sp' + col, SPARKLE_PX, (g, s) => {
    const m = s / 2, R = m - 1, w = R * .22;
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(m, m - R); g.lineTo(m + w, m - w); g.lineTo(m + R, m); g.lineTo(m + w, m + w);
    g.lineTo(m, m + R); g.lineTo(m - w, m + w); g.lineTo(m - R, m); g.lineTo(m - w, m - w);
    g.closePath();
    g.fill();
  });
  if (!c) return;
  const d = r * SPARKLE_PX / (SPARKLE_PX / 2 - 1);
  ctx.drawImage(c, x - d / 2, y - d / 2, d, d);
}

export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (!(r > 0) || !visible(ctx)) return;
  if (r < 2.5) { ctx.fillRect(x - r, y - r, r * 2, r * 2); return; }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

const SOAP_PX = 96;
function soapStamp(variant: number): Stamp | null {
  // 0 / 1: the clear bubble with a cyan or a pink sheen. 2 / 3: the same with a denser, shaded body, for the
  // packed foam where bubbles sit in each other's shadow.
  return stamp('soap' + variant, SOAP_PX, (g, s) => {
    const m = s / 2, r = m - 2;
    g.fillStyle = variant >= 2 ? 'rgba(206,222,255,.62)' : 'rgba(236,246,255,.22)';
    g.beginPath(); g.arc(m, m, r, 0, TAU); g.fill();
    g.lineWidth = Math.max(1.5, r * .08);
    g.strokeStyle = 'rgba(255,255,255,.88)';
    g.stroke();
    g.lineWidth = r * .14;
    g.strokeStyle = variant % 2 ? 'rgba(255,170,230,.75)' : 'rgba(150,230,255,.75)';
    g.beginPath(); g.arc(m, m, r * .78, .5, 1.9); g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(m - r * .38, m - r * .4, r * .2, 0, TAU); g.fill();
  });
}
/** A soap bubble: nearly clear body, a hair-thin rim, a sliver of iridescence and one highlight. No outline.
 *  `dense` gives it a shaded body for packed foam. Stamped from one of four cached canvases. */
export function soap(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number, hue = 0, dense = false): void {
  if (!(r > .8) || !(alpha > MIN_ALPHA)) return;
  const c = soapStamp((dense ? 2 : 0) + (hue > .5 ? 1 : 0));
  if (!c) return;
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * alpha;
  const d = r * SOAP_PX / (SOAP_PX / 2 - 2);
  ctx.drawImage(c, x - d / 2, y - d / 2, d, d);
  ctx.globalAlpha = a0;
}

const GLYPH_PX = 48;
/** One character in a heavy face, in the current fillStyle, `size` px tall. Stamped from a cached canvas,
 *  so a status that shows a question mark every frame never lays out text. */
export function glyph(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, size: number): void {
  if (!(size > 0) || !visible(ctx)) return;
  const col = colorKey(ctx);
  const c = stamp('gl' + ch + col, GLYPH_PX, (g, s) => {
    g.font = `900 ${Math.round(s * .8)}px Inter, ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = col;
    g.fillText(ch, s / 2, s / 2 + 1);
  });
  if (!c) return;
  const d = size * 1.25;
  ctx.drawImage(c, x - d / 2, y - d / 2, d, d);
}

/* ---- richer stamps: soft glow, snowflake, flame, petal; and two cheap path shapes, streak and confetti ---- */

const GLOW_PX = 64;
/** A soft round glow, fading to nothing at radius r: smoke, mist, dust, cold air, heat. `rgb` is "r,g,b" so the
 *  gradient fades within one colour (fading to transparent black would leave a grey fringe); density is globalAlpha. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string): void {
  if (!(r > 0) || !visible(ctx)) return;
  const c = stamp('gw' + rgb, GLOW_PX, (g, s) => {
    const m = s / 2;
    const gr = g.createRadialGradient(m, m, 0, m, m, m);
    gr.addColorStop(0, `rgba(${rgb},1)`);
    gr.addColorStop(.4, `rgba(${rgb},.65)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
  if (!c) return;
  ctx.drawImage(c, x - r, y - r, r * 2, r * 2);
}

const FLAKE_PX = 64;
/** A six-armed snowflake with a pair of branches per arm, in `color`, radius r, turned by rot. */
export function snowflake(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, color: string): void {
  if (!(r > 0) || !visible(ctx)) return;
  const c = stamp('sf' + color, FLAKE_PX, (g, s) => {
    const m = s / 2, R = m - 3;
    g.strokeStyle = color;
    g.lineCap = 'round';
    g.lineWidth = s * .07;
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a);
      g.moveTo(m, m); g.lineTo(m + ca * R, m + sa * R);
      for (const at of [.45, .72]) {
        const bx = m + ca * R * at, by = m + sa * R * at, b = R * (at < .5 ? .3 : .2);
        for (const side of [-1, 1]) {
          const ba = a + side * .9;
          g.moveTo(bx, by); g.lineTo(bx + Math.cos(ba) * b, by + Math.sin(ba) * b);
        }
      }
    }
    g.stroke();
    g.fillStyle = color;
    g.beginPath(); g.arc(m, m, s * .06, 0, TAU); g.fill();
  });
  if (!c) return;
  const d = r * FLAKE_PX / (FLAKE_PX / 2 - 3);
  if (rot) {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    ctx.save();
    ctx.transform(cs, sn, -sn, cs, x, y);
    ctx.drawImage(c, -d / 2, -d / 2, d, d);
    ctx.restore();
  } else ctx.drawImage(c, x - d / 2, y - d / 2, d, d);
}

const FLAME_PX = 64;
/** A teardrop of flame pointing up, white-hot at the root: 'hot' is yellow-white, 'warm' orange-red. r is its height / 2. */
export function flame(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, heat: 'hot' | 'warm'): void {
  if (!(r > 0) || !visible(ctx)) return;
  const c = stamp('fl' + heat, FLAME_PX, (g, s) => {
    const m = s / 2;
    const gr = g.createRadialGradient(m, m * 1.25, 0, m, m * 1.15, m * .9);
    if (heat === 'hot') { gr.addColorStop(0, '#ffffff'); gr.addColorStop(.35, '#fff0a0'); gr.addColorStop(.75, '#ffb23a'); }
    else { gr.addColorStop(0, '#ffe08a'); gr.addColorStop(.4, '#ff8a2a'); gr.addColorStop(.8, '#e8401e'); }
    gr.addColorStop(1, 'rgba(232,64,30,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(m, 2);
    g.bezierCurveTo(m + s * .12, s * .3, m + s * .36, s * .5, m + s * .3, s * .72);
    g.bezierCurveTo(m + s * .24, s * .94, m - s * .24, s * .94, m - s * .3, s * .72);
    g.bezierCurveTo(m - s * .36, s * .5, m - s * .12, s * .3, m, 2);
    g.fill();
  });
  if (!c) return;
  ctx.drawImage(c, x - r, y - r * 1.1, r * 2, r * 2);
}

const PETAL_PX = 48;
/** A small petal (a notched oval), in `color`, length 2r, turned by rot. */
export function petal(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, color: string): void {
  if (!(r > 0) || !visible(ctx)) return;
  const c = stamp('pt' + color, PETAL_PX, (g, s) => {
    const m = s / 2;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(m, s - 3);
    g.bezierCurveTo(m - s * .42, s * .62, m - s * .3, 3, m - s * .06, s * .12);
    g.lineTo(m, s * .2);
    g.lineTo(m + s * .06, s * .12);
    g.bezierCurveTo(m + s * .3, 3, m + s * .42, s * .62, m, s - 3);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.beginPath(); g.ellipse(m - s * .08, s * .45, s * .07, s * .2, -.2, 0, TAU); g.fill();
  });
  if (!c) return;
  const d = r * 2;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  ctx.save();
  ctx.transform(cs, sn, -sn, cs, x, y);
  ctx.drawImage(c, -d / 2, -d / 2, d, d);
  ctx.restore();
}

/** A spark streak: a short line from where it was to where it is, round-capped, in the current strokeStyle. */
export function streak(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, width: number): void {
  if (!(width > 0) || !visible(ctx)) return;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** A paper confetti strip w × h turning in the air: `flip` (radians) squeezes it as it tumbles. Current fillStyle. */
export function confetti(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rot: number, flip: number): void {
  if (!(w > 0) || !(h > 0) || !visible(ctx)) return;
  const sq = Math.cos(flip);
  if (Math.abs(sq) < .08) return;
  const c = Math.cos(rot), s = Math.sin(rot);
  const ax = c * w * sq, ay = s * w * sq, bx = -s * h, by = c * h;
  ctx.beginPath();
  ctx.moveTo(x - ax - bx, y - ay - by);
  ctx.lineTo(x + ax - bx, y + ay - by);
  ctx.lineTo(x + ax + bx, y + ay + by);
  ctx.lineTo(x - ax + bx, y - ay + by);
  ctx.closePath();
  ctx.fill();
}

export interface BurstSpec {
  n: number;
  /** Launch speed range, px/s. */
  speed: [number, number];
  /** Seconds each particle lives (each one gets 60–100% of it). */
  life: number;
  /** px/s² downward (negative floats up). */
  gravity?: number;
  /** Centre direction and the full fan width, radians. Default: all round. */
  angle?: number;
  spread?: number;
  /** Air drag: speed multiplier per second (1 = none). */
  drag?: number;
}

/** A stateless burst. `t` is seconds since it went off; draw(x, y, k, i) gets each live particle, k 0 → 1 over its life. */
export function burst(t: number, seed: number, spec: BurstSpec, draw: (x: number, y: number, k: number, i: number) => void, x0 = 0, y0 = 0): void {
  if (!(t >= 0) || t >= spec.life) return;
  const spread = spec.spread ?? TAU, angle = spec.angle ?? 0, g = spec.gravity ?? 0, drag = spec.drag ?? 1;
  // Distance under exponential drag is v·(1 − drag^t)/(−ln drag); the factor depends on t only.
  const travel = drag >= 1 ? t : (1 - drag ** t) / -Math.log(drag);
  const fall = .5 * g * t * t;
  const v0 = spec.speed[0], dv = spec.speed[1] - spec.speed[0];
  for (let i = 0; i < spec.n; i++) {
    const life = spec.life * (.6 + .4 * hash(i, seed));
    if (t >= life) continue;
    const a = angle + (hash(i, seed + 1) - .5) * spread;
    const d = (v0 + dv * hash(i, seed + 2)) * travel;
    draw(x0 + Math.cos(a) * d, y0 + Math.sin(a) * d + fall, t / life, i);
  }
}
