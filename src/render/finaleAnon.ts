import { H, W } from '../game/constants.ts';
import type { FinaleFrame, FinaleLead } from './finale.ts';

/* ---------------- 千早爱音 · 不会再逃避了 · 粉色流星 ----------------
   2026-11-16, the user's design. Docs: docs/finale-anon.md.
   Dark, dreamy: a few pink motes drift upward. A pink meteor of hot light comes in from near the screen at
   the lower left and recedes into the depth to the right; faint speed lines run right-to-left behind it, so the camera seems to follow it. It
   carries on to the right, then spirals up and round her face a few turns, tighter and tighter, gathers
   into one point on her face, and that point spreads into light that lights the whole picture up.
   The point is her face in the picture (finale.focus = anchor), so the light that opens is centred on her. */

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const ease = (x: number): number => 1 - Math.pow(1 - clamp01(x), 3);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** Fixed pseudo-random in [0,1) per integer: the picture must not draw from the match's random. */
const hash = (n: number): number => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

const PINK = '255,120,170';
/* Beats (s). */
const MOTES = .3;
const ENTER = .9, TURN = 1.6, GATHER = 2.5, LIGHT = 2.75;
const WAVE = .5;
/** Spiral: turns round her face, and its first radius (frame px). */
const TURNS = 2.5;
/** How long a stretch of the light's past makes its tail (s). */
const TRAIL = .2;

type Pt = [number, number];

/** The spiral's ring is seen at a slant: its height is this share of its width, its lower half nearer. */
const SLANT = .6;

/** Where the light is at time t, how near (s: its size factor, 1 at the start of the spiral) and how
 *  much of it faces us (front: 1 on the near side of the ring, 0 on the far side). In from near the
 *  screen at the lower left, big and fast, receding up and to the right into the depth until it reaches
 *  the spot under her face; then a slanted spiral round her face, drifting a little further back as it
 *  tightens, its near side brighter and thicker than its far side. */
interface State { x: number; y: number; s: number; front: number }
function stateAt(t: number, cx: number, cy: number, r0: number): State {
  const yIn = cy + r0 * SLANT;
  if (t < TURN) {
    const u = clamp01((t - ENTER) / (TURN - ENTER));
    // Near things cross the screen fast and far things slowly: fast at first, slowing as it recedes,
    // so it arrives at the spiral's own speed.
    const k = 1 - Math.pow(1 - u, 1.7);
    return { x: lerp(-140, cx, k), y: lerp(H * 1.02, yIn, 1 - Math.pow(1 - k, 1.5)), s: lerp(2.7, 1, k), front: 1 };
  }
  const k = clamp01((t - TURN) / (GATHER - TURN));
  const g = .3 * k + .7 * k * k;
  const th = Math.PI / 2 - g * TURNS * Math.PI * 2;
  const r = r0 * Math.pow(1 - g, 1.4);
  return { x: cx + Math.cos(th) * r, y: cy + Math.sin(th) * r * SLANT, s: lerp(1, .78, k), front: (Math.sin(th) + 1) / 2 };
}
const headAt = (t: number, cx: number, cy: number, r0: number): Pt => { const q = stateAt(t, cx, cy, r0); return [q.x, q.y]; };

/* ---- sprites ---- */

const sprites = new Map<string, HTMLCanvasElement>();
function sprite(key: string, size: number, draw: (g: CanvasRenderingContext2D, r: number) => void): HTMLCanvasElement {
  let cv = sprites.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  g.translate(size / 2, size / 2);
  draw(g, size / 2);
  sprites.set(key, cv);
  return cv;
}
const glow = (): HTMLCanvasElement => sprite('glow', 128, (g, r) => {
  const d = g.createRadialGradient(0, 0, 0, 0, 0, r);
  d.addColorStop(0, 'rgba(255,255,255,1)');
  d.addColorStop(.1, 'rgba(255,236,246,.95)');
  d.addColorStop(.3, `rgba(${PINK},.45)`);
  d.addColorStop(1, `rgba(${PINK},0)`);
  g.fillStyle = d;
  g.fillRect(-r, -r, r * 2, r * 2);
});
/** The meteor's head flare: a soft glow to be stretched along its flight. */
const flare = (): HTMLCanvasElement => sprite('flare', 128, (g, r) => {
  const d = g.createRadialGradient(0, 0, 0, 0, 0, r);
  d.addColorStop(0, 'rgba(255,255,255,.9)');
  d.addColorStop(.2, 'rgba(255,228,240,.5)');
  d.addColorStop(.55, `rgba(${PINK},.14)`);
  d.addColorStop(1, `rgba(${PINK},0)`);
  g.fillStyle = d;
  g.fillRect(-r, -r, r * 2, r * 2);
});
const mote = (): HTMLCanvasElement => sprite('mote', 32, (g, r) => {
  const d = g.createRadialGradient(0, 0, 0, 0, 0, r);
  d.addColorStop(0, 'rgba(255,214,232,.95)');
  d.addColorStop(.35, 'rgba(255,150,200,.5)');
  d.addColorStop(1, 'rgba(255,120,170,0)');
  g.fillStyle = d;
  g.fillRect(-r, -r, r * 2, r * 2);
});
const star = (): HTMLCanvasElement => sprite('star', 96, (g, r) => {
  const core = g.createRadialGradient(0, 0, 0, 0, 0, r * .45);
  core.addColorStop(0, 'rgba(255,255,255,.95)');
  core.addColorStop(.35, 'rgba(255,190,220,.45)');
  core.addColorStop(1, 'rgba(255,150,200,0)');
  g.fillStyle = core;
  g.fillRect(-r, -r, r * 2, r * 2);
  const w = r * .07;
  g.fillStyle = 'rgba(255,248,252,.95)';
  g.beginPath();
  g.moveTo(-r, 0); g.quadraticCurveTo(0, -w, r, 0); g.quadraticCurveTo(0, w, -r, 0);
  g.moveTo(0, -r); g.quadraticCurveTo(w, 0, 0, r); g.quadraticCurveTo(-w, 0, 0, -r);
  g.fill();
});
let backTex: HTMLCanvasElement | null = null;
/** The dark: deep plum, barely lifted in the middle. */
function backdrop(): HTMLCanvasElement {
  if (backTex) return backTex;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  const bg = g.createRadialGradient(W * .55, H * .45, 10, W * .5, H * .5, W * .75);
  bg.addColorStop(0, '#22081b');
  bg.addColorStop(.6, '#10040d');
  bg.addColorStop(1, '#050205');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  backTex = cv;
  return cv;
}

/* ---- the dark, the motes, the speed lines ---- */

/** One speed line: bright at its head, fading behind. */
let streakCv: HTMLCanvasElement | null = null;
function streakTex(): HTMLCanvasElement {
  if (streakCv) return streakCv;
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 2;
  const g = cv.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, 'rgba(255,200,226,1)');
  gr.addColorStop(1, 'rgba(255,200,226,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 2);
  return streakCv = cv;
}

/** How far the camera has panned following the light (px, the background moves left by this). */
function pan(t: number): number {
  // Picks up as the light comes in, keeps drifting while it turns, settles as it gathers.
  const a = clamp01((t - ENTER) / (TURN - ENTER));
  const b = clamp01((t - TURN) / (GATHER - TURN));
  return 420 * (a * a * .5 + a * .5) + 160 * (1 - Math.pow(1 - b, 2));
}
/** How strongly the speed lines show (the camera's speed, roughly). */
function rush(t: number): number {
  return clamp01((t - ENTER) / .25) * (1 - clamp01((t - (TURN + .15)) / .5));
}

/* ---- nebulae ----
   A sky full of stars and a few nebulae (billowing gas lit blue-white from a hollow, rose at the edges,
   dark dust lanes, stars of their own) across the dark, at different depths (they slide with the pan
   at different speeds). Barely there until the meteor passes behind or through one: that cloud lights
   up from inside, pink-white, round where the light is, and darkens again slowly after it has gone; a
   light coming near lifts the whole nebula a little first. The
   gathered point on her face lights the cloud behind her too. */

/** The current lead-in's geometry (her face and the spiral's first radius), for the cloud lighting. */
let geom = { cx: W / 2, cy: H / 2, r0: 150 };

interface Cloud { x: number; y: number; w: number; h: number; depth: number; base: number; seed: number }
const CLOUDS: Cloud[] = [
  // Low on the left, nearest: the meteor comes in across it.
  { x: 240, y: 420, w: 430, h: 270, depth: .55, base: .55, seed: 1 },
  // Behind her face, far: the spiral turns in front of it and the gathered point lights it.
  { x: 720, y: 170, w: 500, h: 310, depth: .22, base: .5, seed: 2 },
  // High on the left, farthest: the meteor never reaches it, it only catches a little light.
  { x: 250, y: 95, w: 320, h: 200, depth: .15, base: .38, seed: 3 },
];
const CLOUD_TEX_W = 384, CLOUD_TEX_H = 256;
/* A nebula, baked once from noise (in the manner of a real emission nebula photograph): billowing gas
   with fine curling edges, lit from a hollow inside so it turns blue-white and bright toward that hollow
   and warm, dim rose at its edges, cut by dark dust lanes, with stars of its own sprinkled through it. */

/** Smooth value noise on a fixed lattice, and a few octaves of it. */
function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (a: number, b: number): number => hash(a * 157 + b * 311 + seed * 1013);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}
let octaves = 6;
function fbm(x: number, y: number, seed: number): number {
  let sum = 0, amp = .5, f = 1, norm = 0;
  for (let o = 0; o < octaves; o++) { sum += amp * vnoise(x * f, y * f, seed + o * 17); norm += amp; f *= 2.03; amp *= .5; }
  return sum / norm;
}

/** Baked once per page (the heavy part of this lead-in): prewarm() runs it behind the versus screen. */
const cloudCache = new Map<string, HTMLCanvasElement>();
function cloudCanvas(seed: number, lite: boolean): HTMLCanvasElement {
  const key = `${seed}${lite ? 'l' : ''}`;
  let cv = cloudCache.get(key);
  if (cv) return cv;
  // Computed small, then drawn up soft. Lite: about half the pixels and one octave fewer.
  const GW = lite ? 168 : 240, GH = lite ? 112 : 160;
  octaves = lite ? 5 : 6;
  const small = document.createElement('canvas');
  small.width = GW; small.height = GH;
  const sg = small.getContext('2d')!;
  const img = sg.createImageData(GW, GH);
  const d = img.data;
  // The lit hollow sits a little off centre; the cloud's overall shape is an irregular blob round it.
  const hx = .45 + (hash(seed * 11) - .5) * .2, hy = .45 + (hash(seed * 12) - .5) * .2;
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const u = i / GW, v = j / GH;
      const px = u * 5, py = v * 3.3;
      // Domain-warped noise: curling, filamentary gas.
      const wx = fbm(px + 3.1, py + 1.7, seed), wy = fbm(px + 7.4, py + 4.2, seed + 3);
      const gas = fbm(px + 2.4 * wx, py + 2.4 * wy, seed + 5);
      // Fall off toward the edges of the patch, unevenly.
      const ex = (u - .5) / .5, ey = (v - .5) / .5;
      const shape = clamp01(1 - Math.hypot(ex, ey * 1.05) + (fbm(px * .7, py * .7, seed + 9) - .5) * .9);
      const dens = Math.pow(clamp01((gas - .42) / .26), 1.3) * clamp01(shape * 1.6);
      // Light from the hollow.
      const lit = clamp01(1 - Math.hypot(u - hx, (v - hy) * 1.4) / .42);
      // Dust lanes.
      const dust = clamp01((fbm(px * 1.6 + 9, py * 1.6 + 2, seed + 21) - .55) / .15);
      const glow = 1.35 * dens * (.45 + 1.8 * Math.pow(lit, 1.5)) * (1 - .85 * dust);
      // Colour: warm dim rose at the edges, pink, then blue-white toward the lit hollow.
      const r = lerp(lerp(150, 255, dens), 215, lit * lit);
      const g = lerp(lerp(70, 140, dens), 225, lit * lit);
      const b = lerp(lerp(110, 200, dens), 255, lit * lit);
      const k = (j * GW + i) * 4;
      d[k] = r; d[k + 1] = g; d[k + 2] = b;
      d[k + 3] = Math.min(255, glow * 255);
    }
  }
  sg.putImageData(img, 0, 0);
  cv = document.createElement('canvas');
  cv.width = CLOUD_TEX_W; cv.height = CLOUD_TEX_H;
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, CLOUD_TEX_W, CLOUD_TEX_H);
  g.filter = 'none';
  // Its own stars: many faint ones, a few brighter, thickest where it glows.
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 140; i++) {
    const x = hash(seed * 900 + i) * CLOUD_TEX_W, y = hash(seed * 900 + i + 1) * CLOUD_TEX_H;
    const big = hash(seed * 900 + i + 2) > .9;
    const a = .25 + hash(seed * 900 + i + 3) * .6;
    const blue = hash(seed * 900 + i + 4) > .5;
    g.fillStyle = blue ? `rgba(200,220,255,${a.toFixed(2)})` : `rgba(255,236,246,${a.toFixed(2)})`;
    const sz = big ? 2 : 1;
    g.fillRect(x, y, sz, sz);
  }
  // Fade toward the texture's edges so no edge ever shows as a box.
  g.globalCompositeOperation = 'destination-in';
  g.save();
  g.translate(CLOUD_TEX_W / 2, CLOUD_TEX_H / 2); g.scale(CLOUD_TEX_W / CLOUD_TEX_H, 1);
  const edge = g.createRadialGradient(0, 0, 0, 0, 0, CLOUD_TEX_H / 2);
  edge.addColorStop(0, 'rgba(0,0,0,1)');
  edge.addColorStop(.6, 'rgba(0,0,0,1)');
  edge.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = edge;
  g.fillRect(-CLOUD_TEX_H / 2, -CLOUD_TEX_H / 2, CLOUD_TEX_H, CLOUD_TEX_H);
  g.restore();
  g.globalCompositeOperation = 'source-over';
  cloudCache.set(key, cv);
  return cv;
}

/* The star field: hundreds of stars of every brightness over the whole sky, a band wider than the frame
   so the pan can slide it, baked once. A few bright ones with four-point spikes are drawn live so they
   can twinkle. */
const FIELD_W = W + 700;
const fieldCache = new Map<boolean, HTMLCanvasElement>();
function starField(lite: boolean): HTMLCanvasElement {
  const cached = fieldCache.get(lite);
  if (cached) return cached;
  const cv = document.createElement('canvas');
  cv.width = FIELD_W; cv.height = H;
  const g = cv.getContext('2d')!;
  const n = lite ? 260 : 520;
  for (let i = 0; i < n; i++) {
    const x = hash(i * 3 + 4000) * FIELD_W, y = hash(i * 3 + 4001) * H;
    const m = hash(i * 3 + 4002);
    const a = .15 + m * m * .75;
    const tone = hash(i + 4500);
    g.fillStyle = tone < .35 ? `rgba(200,220,255,${a.toFixed(2)})` : tone < .85 ? `rgba(255,240,248,${a.toFixed(2)})` : `rgba(255,200,170,${a.toFixed(2)})`;
    if (m > .93) {
      const r = 2.4;
      const gr = g.createRadialGradient(x, y, 0, x, y, r * 2);
      gr.addColorStop(0, g.fillStyle as string);
      gr.addColorStop(1, 'rgba(255,240,248,0)');
      g.fillStyle = gr;
      g.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
    } else {
      g.fillRect(x, y, m > .7 ? 1.5 : 1, m > .7 ? 1.5 : 1);
    }
  }
  fieldCache.set(lite, cv);
  return cv;
}
const BRIGHT: readonly [number, number, number, string][] = [
  [.12, .14, 1, '200,220,255'], [.47, .36, .7, '255,240,248'], [.86, .82, .9, '200,220,255'],
  [.68, .62, .6, '255,210,180'], [.27, .7, .75, '255,240,248'], [1.08, .2, .8, '200,220,255'],
  [.95, .5, .55, '255,240,248'], [1.3, .75, .7, '200,220,255'],
];
/** A bright star with four thin spikes, as a cached sprite per colour (its glow radius is a quarter of
 *  the sprite, the spikes reach its edge). */
const spikeTex = (col: string): HTMLCanvasElement => sprite('spike' + col, 128, (g, R) => {
  const r = R / 2.6;
  const d = g.createRadialGradient(0, 0, 0, 0, 0, r);
  d.addColorStop(0, 'rgba(255,255,255,1)');
  d.addColorStop(.2, `rgba(${col},.6)`);
  d.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = d;
  g.fillRect(-r, -r, r * 2, r * 2);
  g.fillStyle = `rgba(${col},.8)`;
  const w = 1.6;
  g.beginPath();
  g.moveTo(-R, 0); g.lineTo(0, -w); g.lineTo(R, 0); g.lineTo(0, w); g.closePath();
  g.moveTo(0, -R); g.lineTo(w, 0); g.lineTo(0, R); g.lineTo(-w, 0); g.closePath();
  g.fill();
});
function spiked(c: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, col: string): void {
  const R = r * 2.6;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = a;
  c.drawImage(spikeTex(col), x - R, y - R, R * 2, R * 2);
  c.restore();
}
function stars(c: CanvasRenderingContext2D, t: number, lite: boolean, alpha: number): void {
  const p = pan(t);
  const off = -((p * .1) % (FIELD_W - W));
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = alpha;
  c.drawImage(starField(lite), off - 120, 0);
  c.restore();
  for (const [u, v, k, col] of BRIGHT) {
    const x = u * W - p * .18, y = v * H;
    if (x < -30 || x > W + 30) continue;
    const tw = .75 + .25 * Math.sin(t * (2 + k * 2) + u * 9);
    spiked(c, x, y, 7 + 7 * k, alpha * tw * k, col);
  }
}

let cloudLayer: HTMLCanvasElement | null = null;

/** Light sources on the clouds at time t: the meteor's head now and a little earlier (so a lit cloud
 *  darkens slowly after it passes), and the gathered point. [x, y, radius, strength]. */
function cloudLights(t: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const { cx, cy, r0 } = geom;
  if (t >= ENTER && t < LIGHT) {
    for (let k = 0; k < 4; k++) {
      const ti = t - k * .12;
      if (ti < ENTER) break;
      const q = stateAt(Math.min(ti, GATHER), cx, cy, r0);
      out.push([q.x, q.y, 210 * q.s, (1 - k * .22) * (.6 + .4 * q.front) * (ti > GATHER ? .4 : 1)]);
    }
  }
  const gk = clamp01((t - GATHER + .08) / (LIGHT - GATHER + .08));
  if (gk > 0 && t < LIGHT + .3) out.push([cx, cy, 160 + 200 * gk, gk * 1.8 * (1 - clamp01((t - LIGHT) / .3))]);
  return out;
}

function clouds(c: CanvasRenderingContext2D, t: number, alpha: number, lite: boolean): void {
  const p = pan(t);
  const lights = cloudLights(t);
  if (!cloudLayer) { cloudLayer = document.createElement('canvas'); cloudLayer.width = CLOUD_TEX_W; cloudLayer.height = CLOUD_TEX_H; }
  const lg = cloudLayer.getContext('2d')!;
  for (const cl of CLOUDS) {
    const tex = cloudCanvas(cl.seed, lite);
    const x = cl.x - p * cl.depth - cl.w / 2 + Math.sin(t * .3 + cl.seed) * 6, y = cl.y - cl.h / 2;
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.globalAlpha = 1;
    // At rest: the nebula's own colours, faint.
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = alpha * cl.base;
    c.drawImage(tex, x, y, cl.w, cl.h);
    c.restore();
    // A light coming near lifts the whole nebula a little, before it reaches it.
    const ccx = x + cl.w / 2, ccy = y + cl.h / 2, reach = Math.max(cl.w, cl.h) * 1.3;
    let lift = 0;
    for (const [lx, ly, , k] of lights) lift = Math.max(lift, Math.min(1, k) * clamp01(1 - Math.hypot(lx - ccx, ly - ccy) / reach));
    if (lift > 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = alpha * .9 * lift * lift;
      c.drawImage(tex, x, y, cl.w, cl.h);
      c.restore();
    }
    // Lit from inside where the light is.
    const sx = CLOUD_TEX_W / cl.w, sy = CLOUD_TEX_H / cl.h;
    const near = lights.filter(([lx, ly, lr]) => lx + lr > x && lx - lr < x + cl.w && ly + lr > y && ly - lr < y + cl.h);
    if (!near.length) continue;
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, CLOUD_TEX_W, CLOUD_TEX_H);
    lg.drawImage(tex, 0, 0);
    lg.globalCompositeOperation = 'source-in';
    lg.setTransform(sx, 0, 0, sy, -x * sx, -y * sy);
    for (const [lx, ly, lr, k] of near) {
      const gr = lg.createRadialGradient(lx, ly, 0, lx, ly, lr);
      gr.addColorStop(0, `rgba(255,236,246,${Math.min(1, .95 * k).toFixed(3)})`);
      gr.addColorStop(.4, `rgba(255,150,200,${Math.min(1, .55 * k).toFixed(3)})`);
      gr.addColorStop(1, 'rgba(255,120,170,0)');
      lg.fillStyle = gr;
      lg.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
    }
    lg.setTransform(1, 0, 0, 1, 0, 0);
    // Twice: the wisp's own alpha is thin, and a lit cloud should glow clearly.
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = alpha;
    c.drawImage(cloudLayer, x, y, cl.w, cl.h);
    if (!lite) c.drawImage(cloudLayer, x, y, cl.w, cl.h);
    c.restore();
  }
}

function darkness(c: CanvasRenderingContext2D, t: number, lite: boolean, alpha: number): void {
  c.save();
  c.globalAlpha = alpha;
  c.drawImage(backdrop(), 0, 0, W, H);
  c.restore();
  stars(c, t, lite, alpha);
  clouds(c, t, alpha, lite);
  // Speed lines: few, faint, thin, running right to left.
  const sp = rush(t) * alpha;
  if (sp > 0) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const n = lite ? 6 : 11;
    for (let i = 0; i < n; i++) {
      const len = 90 + hash(i + 40) * 200;
      const y = H * (.08 + hash(i + 41) * .84);
      const speed = 1500 + hash(i + 42) * 900;
      const span = W + len * 2;
      const x = W + len - (((t - ENTER) * speed + hash(i + 43) * span) % span);
      c.globalAlpha = sp * (.05 + hash(i + 44) * .08);
      c.drawImage(streakTex(), x, y, len, 1 + hash(i + 45));
    }
    c.restore();
  }
  // Motes: a few soft pink points drifting up, pulled left by the camera's pan.
  c.save();
  c.globalCompositeOperation = 'lighter';
  const n = lite ? 8 : 14;
  const p = pan(t);
  for (let i = 0; i < n; i++) {
    const far = hash(i + 60);
    const life = 5 + hash(i + 61) * 3;
    const q = ((t + hash(i + 62) * life) % life) / life;
    const span = W + 80;
    const x = (((hash(i + 63) * span - p * (.3 + far * .5) + Math.sin(t * .7 + i) * 10) % span) + span) % span - 40;
    const y = H * (1.05 - q * 1.15);
    const r = 2.5 + far * 4.5;
    c.globalAlpha = alpha * Math.sin(q * Math.PI) * (.35 + far * .45);
    c.drawImage(mote(), x - r * 2, y - r * 2, r * 4, r * 4);
  }
  c.restore();
}

/* ---- the light ---- */

const glint = (c: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, rot = 0): void => {
  if (a <= 0) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = Math.min(1, a);
  c.translate(x, y); c.rotate(rot);
  c.drawImage(star(), -r, -r, r * 2, r * 2);
  c.restore();
};

/** The light at time t, a meteor: a white-hot head with a flare stretched along its flight, a hot core
 *  trail cooling from white to pink, a wide soft glow round it, and embers shed behind. Everything is
 *  sized by how near it is, and dimmer on the far side of the ring. A plain soft light: no beads, no
 *  sparks. `fade` thins it all out. */
function bolt(c: CanvasRenderingContext2D, t: number, cx: number, cy: number, r0: number, lite: boolean, fade = 1): void {
  if (t < ENTER || fade <= 0) return;
  const N = lite ? 16 : 26;
  const st: State[] = [];
  for (let i = 0; i <= N; i++) {
    const ti = Math.max(ENTER, t - TRAIL * (1 - i / N));
    st.push(stateAt(Math.min(ti, GATHER), cx, cy, r0));
  }
  const head = st[N];
  const lit = (q: State): number => .5 + .5 * q.front;
  const thick = (q: State): number => q.s * (.75 + .4 * q.front);
  c.save();
  c.globalCompositeOperation = 'lighter';
  // Butt ends: round ends on short overlapping pieces read as a string of beads.
  c.lineCap = 'butt';
  c.lineJoin = 'round';
  const passes: [number, number, number, string][] = lite
    ? [[3, 4, .8, '255,214,232']]
    : [[14, 26, .16, PINK], [5, 9, .45, '255,170,210'], [1.2, 3.6, .95, '255,246,250']];
  for (const [w0, w1, a0, col] of passes) {
    for (let i = 1; i <= N; i++) {
      const k = Math.pow(i / N, 1.6);
      const q = st[i];
      c.beginPath();
      c.moveTo(st[i - 1].x, st[i - 1].y);
      c.lineTo(q.x, q.y);
      c.strokeStyle = `rgba(${col},${(a0 * k * lit(q) * fade).toFixed(3)})`;
      c.lineWidth = (w0 + w1 * k) * thick(q) * .5;
      c.stroke();
    }
  }
  c.restore();
  // The head: a flare stretched along the flight, a round white-hot core, a slow glint.
  const prev = st[N - 2];
  const ang = Math.atan2(head.y - prev.y, head.x - prev.x);
  const flick = .92 + .08 * Math.sin(t * 47) * Math.sin(t * 23);
  const hs = head.s * (.8 + .3 * head.front);
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = fade * lit(head) * flick;
  c.translate(head.x, head.y);
  c.rotate(ang);
  c.drawImage(flare(), -110 * hs, -30 * hs, 140 * hs, 60 * hs);
  c.rotate(-ang);
  const hr = 30 * hs;
  c.drawImage(glow(), -hr, -hr, hr * 2, hr * 2);
  c.restore();
  glint(c, head.x, head.y, 22 * hs, fade * lit(head), t * 1.2);
}

/** How long the light's path keeps glowing behind it (s): a long exposure. */
const AFTER = .65;

/** The long-exposure afterglow: the whole recent path stays as a soft, wide, faint pink trace that spreads
 *  and fades, left behind in the world so it slides back with the camera's pan while the light runs on.
 *  As the light gathers, the trace is drawn into the point on her face. */
function afterglow(c: CanvasRenderingContext2D, t: number, cx: number, cy: number, r0: number, lite: boolean): void {
  if (t < ENTER + .03) return;
  const pull = ease((t - (GATHER - .15)) / (LIGHT - GATHER + .1));
  const now = Math.min(t, GATHER);
  const p0 = pan(t);
  const at = (ti: number): Pt => {
    const [x, y] = headAt(Math.min(ti, GATHER), cx, cy, r0);
    // Left behind in the world: it slides back with the pan since it was laid down.
    const dx = -(p0 - pan(ti)) * .35;
    return [lerp(x + dx, cx, pull), lerp(y, cy, pull)];
  };
  const N = lite ? 20 : 36;
  const t0 = Math.max(ENTER, now - AFTER);
  const pts: Pt[] = [];
  const ages: number[] = [];
  const sizes: number[] = [];
  for (let i = 0; i <= N; i++) {
    const ti = lerp(t0, now, i / N);
    pts.push(at(ti));
    ages.push(t - ti);
    const q = stateAt(ti, cx, cy, r0);
    sizes.push(lerp(q.s * (.6 + .5 * q.front), 1, pull));
  }
  c.save();
  c.globalCompositeOperation = 'lighter';
  // Butt ends: round ends on short overlapping pieces read as a string of beads.
  c.lineCap = 'butt';
  c.lineJoin = 'round';
  const fadeAll = 1 - pull * .6;
  for (const pass of lite ? [1] : [0, 1]) {
    for (let i = 1; i <= N; i++) {
      const a = clamp01(1 - ages[i] / AFTER);
      if (a <= 0) continue;
      c.beginPath();
      c.moveTo(pts[i - 1][0], pts[i - 1][1]);
      c.lineTo(pts[i][0], pts[i][1]);
      const spread = 1 - a;
      if (pass === 0) {
        c.strokeStyle = `rgba(${PINK},${(.1 * Math.pow(a, 1.3) * fadeAll).toFixed(3)})`;
        c.lineWidth = (16 + 26 * spread) * sizes[i];
      } else {
        c.strokeStyle = `rgba(255,190,220,${(.3 * Math.pow(a, 1.6) * fadeAll).toFixed(3)})`;
        c.lineWidth = (2.5 + 6 * spread) * sizes[i];
      }
      c.stroke();
    }
  }
  c.restore();
}

/** The light gathered into one point on her face: it brightens and grows a little, sparks drawn in. */
function gathered(c: CanvasRenderingContext2D, t: number, cx: number, cy: number): void {
  const k = clamp01((t - GATHER + .08) / (LIGHT - GATHER + .08));
  if (k <= 0) return;
  const r = 30 + 70 * k * k;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = .6 + .4 * k;
  c.drawImage(glow(), cx - r, cy - r, r * 2, r * 2);
  // A few sparks pulled into the point.
  for (let i = 0; i < 8; i++) {
    const a = hash(i + 200) * Math.PI * 2;
    const d = (1 - k) * (60 + hash(i + 201) * 70);
    glint(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 5 + hash(i + 202) * 5, k * (1 - k) * 3, a);
  }
  c.restore();
  glint(c, cx, cy, 36 + 40 * k, k, t * 2);
}

/* ---- the light opening ---- */

let veilCv: HTMLCanvasElement | null = null;
/** From her face outward the dark lifts off the picture, a soft bright rim riding the edge. */
function lightUp(c: CanvasRenderingContext2D, f: FinaleFrame, s: number): void {
  const k = s / WAVE;
  if (k >= 1) return;
  const cx = f.anchor.x, cy = f.anchor.y;
  const far = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy));
  const FEATHER = 130;
  const R = ease(k) * (far + FEATHER * 1.2);
  if (!veilCv) { veilCv = document.createElement('canvas'); veilCv.width = W; veilCv.height = H; }
  const g = veilCv.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, W, H);
  // The dark as it stood when the light opened, baked once per play: the wave is half a second, nobody
  // sees the sky stop, and redrawing stars and nebulae under it every frame was the costliest moment.
  g.drawImage(f.bake('anon-sky', h => darkness(h, LIGHT, f.lite, 1)), 0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  const outer = Math.max(1, R);
  const hole = g.createRadialGradient(cx, cy, 0, cx, cy, outer);
  hole.addColorStop(0, 'rgba(0,0,0,1)');
  hole.addColorStop(clamp01((R - FEATHER) / outer), 'rgba(0,0,0,1)');
  hole.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hole;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  c.drawImage(veilCv, 0, 0, W, H);
  const fade = 1 - clamp01((k - .5) / .5);
  c.save();
  c.globalCompositeOperation = 'lighter';
  const rim = c.createRadialGradient(cx, cy, Math.max(0, R - FEATHER * .9), cx, cy, R + 10);
  rim.addColorStop(0, 'rgba(255,200,226,0)');
  rim.addColorStop(.7, `rgba(255,236,246,${(.5 * fade).toFixed(3)})`);
  rim.addColorStop(1, 'rgba(255,200,226,0)');
  c.fillStyle = rim;
  // Only the ring's own square, clipped to the frame: a fill nine frames wide is pure waste.
  const x0 = Math.max(0, cx - R - 12), y0 = Math.max(0, cy - R - 12);
  c.fillRect(x0, y0, Math.min(W, cx + R + 12) - x0, Math.min(H, cy + R + 12) - y0);
  // The point itself, letting go.
  const burst = 1 - clamp01(s / .3);
  if (burst > 0) {
    const r = 100 + 160 * (1 - burst);
    c.globalAlpha = burst;
    c.drawImage(glow(), cx - r, cy - r, r * 2, r * 2);
  }
  c.restore();
  const n = f.lite ? 12 : 24;
  for (let i = 0; i < n; i++) {
    const a = hash(i + 800) * Math.PI * 2;
    const rr = R - FEATHER * (.2 + hash(i + 810) * .6);
    if (rr > 0) glint(c, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 5 + hash(i + 820) * 7, fade * (.5 + hash(i + 830) * .5), a);
  }
}

/** Everything before and during the lighting. */
function lead(f: FinaleFrame): void {
  const { c, t, lite } = f;
  const cx = f.anchor.x, cy = f.anchor.y;
  // The spiral's first radius: it starts straight under her face and its first loop stays inside the frame.
  const r0 = Math.min(175, (cy - 14) / SLANT);
  geom = { cx, cy, r0 };
  // Bake the sky during the freeze, so the heavy part never lands while something moves.
  if (t < MOTES) prewarm(lite);
  if (t < LIGHT) {
    c.save();
    c.globalAlpha = ease((t - .12) / .3);
    c.fillStyle = '#050208';
    c.fillRect(0, 0, W, H);
    c.restore();
    if (t < MOTES) return;
    darkness(c, t, lite, ease((t - MOTES) / .4));
    afterglow(c, t, cx, cy, r0, lite);
    bolt(c, t, cx, cy, r0, lite, 1 - clamp01((t - GATHER) / .12));
    gathered(c, t, cx, cy);
    return;
  }
  lightUp(c, f, t - LIGHT);
}

/** Over the held picture: the dreamy motes carry on, faint, and a little glitter flares now and then. */
function over(f: FinaleFrame): void {
  const { c, t, lite } = f;
  const on = ease((t - LIGHT - .3) / 1);
  if (on <= 0) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const n = lite ? 8 : 14;
  for (let i = 0; i < n; i++) {
    const far = hash(i + 60);
    const life = 5 + hash(i + 61) * 3;
    const q = ((t + hash(i + 62) * life) % life) / life;
    const x = W * hash(i + 63) + Math.sin(t * .7 + i) * 10;
    const y = H * (1.05 - q * 1.15);
    const r = 2.5 + far * 4.5;
    c.globalAlpha = on * Math.sin(q * Math.PI) * (.3 + far * .35);
    c.drawImage(mote(), x - r * 2, y - r * 2, r * 4, r * 4);
  }
  c.restore();
  const g = lite ? 8 : 14;
  for (let i = 0; i < g; i++) {
    const tw = Math.pow(Math.max(0, Math.sin(t * (2.2 + hash(i + 1700) * 2) + i * 1.9)), 8);
    glint(c, W * hash(i + 1710), H * hash(i + 1720) * .85, 6 + hash(i + 1730) * 8, tw * on * .8, hash(i + 1740));
  }
}

/** Bake everything heavy (nebulae, star field, sprites). main.ts calls it behind the versus screen so
 *  the cut-in never pays for it; the lead-in calls it again during the freeze as a fallback (cached). */
function prewarm(lite: boolean): void {
  for (const cl of CLOUDS) cloudCanvas(cl.seed, lite);
  starField(lite);
  glow(); flare(); mote(); star(); streakTex(); backdrop();
  for (const [, , , col] of BRIGHT) spikeTex(col);
}

/** The light opens at LIGHT (later than the shared 2.35 s); the break cue follows it
 *  (characters.ts finale.sfx.shatterAt). */
export const PINK_METEOR: FinaleLead = {
  lead: LIGHT + .35, reveal: .35, tail: .6, accent: '#ff7aa8',
  tint: [190, 70, 130], glow: [255, 150, 200], exit: 'fade', selfLit: true,
  drawLead: lead, drawOver: over, prewarm,
};
