import type { Effect, Projectile } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import { clamp } from '../game/constants.ts';
import { TAU, burst, glow, hash, sparkle } from './fxParticles.ts';

/* 八幡海铃 — Timoris，Lacus Timoris「恐湖」。深湖蓝 #335566 + 暗银白（银饰、项链）+ 彼岸花红（面具纹样），红色只在关键处出现。
   她的低音是 Ave Mujica 的「心跳」：冲击都是贴地、低频、厚重的水面波，不用细线圈。No text, no dark outlines.
   Registers (all visual; combat numbers untouched):
     J / K     umiri-swing                         silver flick / lake-blue boot arc, droplets and a flat thump on hit
     U 报价     milk shot, umiri-milk-splash / -land / -sip, the 'umiri-quote' silver price tag
     I 扫货     bag shot (four tints), umiri-wings (购物袋光翼), umiri-receipt, umiri-bag-land
     O 恐湖     umiri-lake, umiri-mist (霸体), umiri-geyser
     L 信用     umiri-rush, umiri-veil, umiri-grip (彼岸花), umiri-arc, umiri-crash (n = 1: 履约)
   Busiest moment: 履约 crash, ~50 particles (half on lite). */

export const UMIRI_BACK: readonly string[] = ['umiri-lake', 'umiri-mist', 'umiri-wings', 'umiri-rush', 'umiri-veil'];

const SILVER = '#e4edf2';
const SILVER_RGB = '228,237,242';
const WATER_RGB = '120,170,196';
const LAKE_RGB = '51,85,102';
const DEEP_RGB = '14,30,44';
const LILY = '#c8323c';
const LILY_HI = '#ff7070';
const CHOCO = '#6b3a22';
const CREAM = '#f2e6d6';
const MILK_SRC = '/sprites/umiri/milk.png';
const BAG_SRC = '/sprites/umiri/bag.png';

type Art = ((src: string) => CanvasImageSource | null) | undefined;
type Ctx = CanvasRenderingContext2D;

const n = (full: number, lite: boolean) => (lite ? Math.ceil(full / 2) : full);
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);

/* ---- cached stamps ---- */

type Cv = HTMLCanvasElement;
const stamps = new Map<string, Cv | null>();
function stampOf(key: string, px: number, paint: (g: Ctx, s: number) => void): Cv | null {
  if (stamps.has(key)) return stamps.get(key) ?? null;
  let c: Cv | null = null;
  if (typeof document !== 'undefined') {
    c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    if (g) paint(g, px); else c = null;
  }
  stamps.set(key, c);
  return c;
}

/** The lake: deep blue at the heart, open water at the rim, nothing past it. Drawn squashed onto the floor. */
function lakeStamp(): Cv | null {
  return stampOf('lake', 128, (g, s) => {
    const m = s / 2;
    const gr = g.createRadialGradient(m, m, 0, m, m, m);
    gr.addColorStop(0, `rgba(${DEEP_RGB},.82)`);
    gr.addColorStop(.5, `rgba(${DEEP_RGB},.6)`);
    gr.addColorStop(.82, `rgba(${LAKE_RGB},.32)`);
    gr.addColorStop(1, `rgba(${LAKE_RGB},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
}
/** A glossy chocolate-milk puddle, soft at the rim so it sinks into the floor. */
function puddleStamp(): Cv | null {
  return stampOf('puddle', 128, (g, s) => {
    const m = s / 2;
    const gr = g.createRadialGradient(m, m, 0, m, m, m);
    gr.addColorStop(0, 'rgba(96,54,32,.92)');
    gr.addColorStop(.55, 'rgba(112,64,38,.8)');
    gr.addColorStop(.8, 'rgba(126,76,46,.4)');
    gr.addColorStop(1, 'rgba(126,76,46,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    // A cream swirl folded into it.
    g.globalAlpha = .35;
    g.strokeStyle = CREAM;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath(); g.arc(m - 6, m + 2, 22, .4, 2.6); g.stroke();
  });
}
const BAG_TINTS = ['#e2bf8c', '#4d4f58', '#f6b6c9', ''] as const;
/** bag.png tinted kraft, black, pink or left grey. Built once the art has loaded. */
function bagStamp(v: number, art: Art): CanvasImageSource | null {
  const im = art?.(BAG_SRC);
  if (!im) return null;
  const tint = BAG_TINTS[v % BAG_TINTS.length];
  if (!tint) return im;
  return stampOf('bag' + v, 160, (g, s) => {
    g.drawImage(im, 0, 0, s, s);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = tint;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(im, 0, 0, s, s);
  });
}

/** One golden feather pointing right, root at the left edge: warm gold core, pale rim, a light quill.
 *  The canvas is FEATHER_W × FEATHER_H so it scales without squashing. */
const FEATHER_W = 160, FEATHER_H = 54;
let featherCv: Cv | null | undefined;
function featherStamp(): Cv | null {
  if (featherCv !== undefined) return featherCv;
  featherCv = null;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = FEATHER_W; c.height = FEATHER_H;
  const g = c.getContext('2d');
  if (!g) return null;
  const w = FEATHER_W, h = FEATHER_H, m = h / 2;
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, '#d29a4c');
  gr.addColorStop(.5, '#ecc77e');
  gr.addColorStop(1, '#fbeac0');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(2, m);
  g.bezierCurveTo(w * .25, 3, w * .7, 2, w - 3, m - 2);
  g.bezierCurveTo(w * .7, h - 2, w * .25, h - 3, 2, m);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,247,222,.9)';
  g.lineWidth = 2.5;
  g.stroke();
  g.strokeStyle = 'rgba(160,110,50,.4)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(4, m); g.quadraticCurveTo(w * .5, m - 3, w * .92, m - 2); g.stroke();
  return featherCv = c;
}
/** Wing rows, as angles from straight up (−π/2) out to the side (0). Back row first. */
const WING_ROWS = [
  { n: 8, r: 34, len: 104, a0: -1.25, a1: -.05, alpha: .85 },
  { n: 7, r: 24, len: 74, a0: -1.15, a1: .05, alpha: .92 },
  { n: 6, r: 14, len: 46, a0: -1, a1: .15, alpha: 1 },
];
const WING_ROWS_LITE = [
  { n: 6, r: 34, len: 104, a0: -1.25, a1: -.05, alpha: .85 },
  { n: 5, r: 18, len: 62, a0: -1.05, a1: .1, alpha: .95 },
];
/** Tints of the bags hanging off each arm, wrist outwards: grey-white, kraft, black, grey-white, kraft. */
const WING_BAGS = [3, 0, 1, 3, 0];

/* ---- shapes ---- */

/** One 彼岸花 petal: long, thin, its tip curling back. Base at x, y, pointing along rot. */
function lilyPetal(ctx: Ctx, x: number, y: number, len: number, rot: number, color = LILY): void {
  if (!(len > 1)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const w = len * .14;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * .5, -w * 1.6, len, -w * .2);
  ctx.quadraticCurveTo(len * 1.08, w * 1.4, len * .82, w * 1.6);
  ctx.quadraticCurveTo(len * .82, w * .3, len * .7, w * .5);
  ctx.quadraticCurveTo(len * .4, w * .9, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
/** A whole 彼岸花 opening: six curled petals and the long stamens that make the flower read. */
function lily(ctx: Ctx, x: number, y: number, s: number, open: number, rot: number): void {
  if (!(open > 0)) return;
  const len = s * (.35 + .65 * open);
  ctx.strokeStyle = LILY_HI;
  ctx.lineWidth = Math.max(.8, s * .022);
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = rot + i * TAU / 6;
    lilyPetal(ctx, x, y, len * .62, a, i % 2 ? LILY : '#b02634');
    // Stamens reach past the petals and curve up.
    const sa = a + .25;
    const L = len * (.95 + .2 * open);
    const ex = x + Math.cos(sa) * L, ey = y + Math.sin(sa) * L - L * .18;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(sa) * L * .6, y + Math.sin(sa) * L * .6 - L * .3, ex, ey);
    ctx.stroke();
    ctx.fillStyle = '#ffe2c4';
    ctx.beginPath(); ctx.arc(ex, ey, Math.max(.8, s * .028), 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#e04a52';
  ctx.beginPath(); ctx.arc(x, y, s * .05, 0, TAU); ctx.fill();
}
/** A flat water wave on the floor: a broad dim band, a thin silver crest on the near side. */
function wave(ctx: Ctx, rx: number, ry: number, width: number, alpha: number): void {
  if (!(rx > 1) || !(alpha > 0)) return;
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * alpha * .5;
  ctx.strokeStyle = `rgba(${WATER_RGB},1)`;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.stroke();
  ctx.globalAlpha = a0 * alpha * .9;
  ctx.strokeStyle = SILVER;
  ctx.lineWidth = Math.max(1.2, width * .16);
  ctx.beginPath(); ctx.ellipse(0, width * .12, rx, ry, 0, .15, Math.PI - .15); ctx.stroke();
  ctx.globalAlpha = a0;
}
function drop(ctx: Ctx, x: number, y: number, r: number): void {
  if (!(r > .3)) return;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
/** Water droplets thrown out of a point. */
function splash(ctx: Ctx, t: number, seed: number, count: number, x: number, y: number, speed: [number, number], life: number, angle = -Math.PI / 2, spread = 1.8, size = 3.2): void {
  burst(t, seed, { n: count, speed, life, gravity: 1000, angle, spread }, (px, py, q, i) => {
    ctx.globalAlpha = (1 - q) * .9;
    ctx.fillStyle = i % 3 ? `rgba(${WATER_RGB},1)` : SILVER;
    drop(ctx, px, py, size * (1 - q * .5));
  }, x, y);
}

/* ---- the silver price tag (报价) ---- */

function tagPath(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(-8, 17);
  ctx.lineTo(0, 10);
  ctx.lineTo(8, 17);
  ctx.lineTo(8, 33);
  ctx.quadraticCurveTo(8, 35, 6, 35);
  ctx.lineTo(-6, 35);
  ctx.quadraticCurveTo(-8, 35, -8, 33);
  ctx.closePath();
}
/** Hangs over a quoted foe by a red thread, swaying; a glint runs across it now and then. */
export function auraUmiriQuote(ctx: Ctx, f: Fighter, h: number, left: number, t: number): void {
  ctx.save();
  ctx.globalAlpha = Math.min(1, left * 3);
  ctx.translate(f.x, f.y - h - 40);
  ctx.scale(1.15, 1.15);
  ctx.rotate(Math.sin(t * 2.6) * .2);
  // Thread with a little loop at the top.
  ctx.strokeStyle = LILY;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, -2, 2.5, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, .5); ctx.lineTo(0, 14); ctx.stroke();
  const gr = ctx.createLinearGradient(-8, 10, 8, 35);
  gr.addColorStop(0, '#f6f9fb');
  gr.addColorStop(.55, '#c9d4dc');
  gr.addColorStop(1, '#9aaab6');
  tagPath(ctx);
  ctx.fillStyle = gr;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,.8)';
  ctx.stroke();
  ctx.fillStyle = '#335566';
  ctx.beginPath(); ctx.arc(0, 15.5, 1.7, 0, TAU); ctx.fill();
  // Glint: a pale band sweeps the tag once every 1.8 s.
  const g = (t % 1.8) / .45;
  if (g < 1) {
    ctx.save();
    tagPath(ctx);
    ctx.clip();
    ctx.globalAlpha *= Math.sin(g * Math.PI) * .85;
    ctx.fillStyle = '#ffffff';
    const x = -16 + g * 32;
    ctx.beginPath();
    ctx.moveTo(x - 3, 40); ctx.lineTo(x + 3, 40); ctx.lineTo(x + 11, 6); ctx.lineTo(x + 5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/* ---- shots ---- */

const bagVariant = new WeakMap<Projectile, number>();
let bagCount = 0;

export function drawUmiriShot(ctx: Ctx, p: Projectile, lite: boolean, art: Art): boolean {
  if (p.fx === 'milk') { drawMilk(ctx, p, lite, art); return true; }
  if (p.fx === 'bag') { drawBag(ctx, p, art); return true; }
  return false;
}

function drawCarton(ctx: Ctx, p: Projectile, art: Art): void {
  const im = art?.(MILK_SRC);
  const s = Math.max(16, p.size);
  if (im) { ctx.drawImage(im, -s / 2, -s / 2, s, s); return; }
  ctx.fillStyle = CHOCO;
  ctx.fillRect(-p.radius * .7, -p.radius, p.radius * 1.4, p.radius * 1.8);
  ctx.fillStyle = CREAM;
  ctx.fillRect(-p.radius * .45, -p.radius * .85, p.radius * .9, p.radius * .35);
}

function drawMilk(ctx: Ctx, p: Projectile, lite: boolean, art: Art): void {
  ctx.save();
  if (!p.settled) {
    // A few drops shaken loose behind it.
    const pts = p.trail;
    for (let i = 0; i < pts.length; i += lite ? 3 : 2) {
      const k = (i + 1) / pts.length;
      ctx.globalAlpha = k * .6;
      ctx.fillStyle = i % 4 ? CREAM : CHOCO;
      drop(ctx, pts[i].x, pts[i].y + (1 - k) * 12, 1.4 + k * 2.4);
    }
    ctx.globalAlpha = 1;
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.sin(p.age * 11) * .2 * (Math.sign(p.vx) || 1));
    drawCarton(ctx, p, art);
    ctx.restore();
    return;
  }
  const age = Math.max(0, 3 - p.life);
  const fade = clamp(p.life / .35, 0, 1);
  ctx.translate(p.x, p.y);
  // The puddle spreads under the carton and stays while it can be picked up.
  const rx = p.size * 1.35 * ease(age / .28), ry = rx * .22;
  const pud = puddleStamp();
  ctx.globalAlpha = fade * .9;
  if (pud && rx > 1) ctx.drawImage(pud, -rx, -ry, rx * 2, ry * 2);
  // Breathing gloss: there is something here to collect.
  const breath = .5 + .5 * Math.sin(age * 4.5);
  ctx.globalAlpha = fade * (.12 + .14 * breath);
  glow(ctx, 0, -4, rx * .9, WATER_RGB);
  ctx.globalAlpha = fade * (.35 + .35 * breath);
  ctx.fillStyle = '#fff4e6';
  ctx.beginPath(); ctx.ellipse(-rx * .32, -ry * .25, rx * .16, ry * .2, -.1, 0, TAU); ctx.fill();
  if (!lite && breath > .85) {
    ctx.globalAlpha = fade * (breath - .85) * 6;
    ctx.fillStyle = '#ffffff';
    sparkle(ctx, -rx * .32, -ry * .3, 4);
  }
  // Carton: lands with a small squash on its base.
  const sq = age < .18 ? Math.sin(age / .18 * Math.PI) * .14 : 0;
  ctx.globalAlpha = fade;
  ctx.scale(1 + sq, 1 - sq);
  ctx.translate(0, -p.size * (247 - 128) / 256);
  drawCarton(ctx, p, art);
  ctx.restore();
}

function drawBag(ctx: Ctx, p: Projectile, art: Art): void {
  let v = bagVariant.get(p);
  if (v == null) bagVariant.set(p, v = bagCount++ % BAG_TINTS.length);
  const dir = Math.sign(p.vx) || 1;
  ctx.save();
  // Paper whoosh: two faint silver lines behind it.
  const pts = p.trail;
  if (pts.length > 3) {
    ctx.strokeStyle = SILVER;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    for (let j = -1; j <= 1; j += 2) {
      ctx.globalAlpha = .28;
      ctx.beginPath();
      const a = pts[Math.max(0, pts.length - 6)];
      ctx.moveTo(a.x, a.y + j * 7);
      ctx.lineTo(p.x - dir * p.radius, p.y + j * 6);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.age * 3 * dir);
  const sq = Math.sin(p.age * 14) * .07;
  ctx.scale(1 + sq, 1 - sq);
  const c = bagStamp(v, art);
  const s = Math.max(16, p.size);
  if (c) ctx.drawImage(c, -s / 2, -s / 2, s, s);
  else {
    ctx.fillStyle = BAG_TINTS[v] || '#d8d4cc';
    ctx.beginPath();
    ctx.moveTo(-p.radius, -p.radius * .2);
    ctx.lineTo(-p.radius * .7, p.radius);
    ctx.lineTo(p.radius * .7, p.radius);
    ctx.lineTo(p.radius, -p.radius * .2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** A pale shopping-bag silhouette for the 光翼: trapezoid body, handle arc. Centre at 0, 0. */
function bagShape(ctx: Ctx, s: number): void {
  ctx.beginPath();
  ctx.moveTo(-s * .8, -s * .45);
  ctx.lineTo(s * .8, -s * .45);
  ctx.lineTo(s * .95, s * .9);
  ctx.lineTo(-s * .95, s * .9);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); ctx.arc(0, -s * .45, s * .42, Math.PI, 0); ctx.stroke();
}

/* ---- effects ---- */

export function drawUmiriFx(ctx: Ctx, e: Effect, lite = false, art?: Art): boolean {
  if (!e.type.startsWith('umiri-')) return false;
  const el = e.max - e.life;
  const t = clamp(el / e.max, 0, 1);
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    /* -- J / K -- */
    case 'umiri-swing': {
      const R = (e.radius ?? 40) * (e.heavy ? 1.4 : 1.5);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      const fade = 1 - span(t, .4, 1);
      if (!e.heavy) {
        // 点指: a short silver flick off the fingertip.
        const reach = ease(t / .3);
        const x0 = -R * .45, x1 = -R * .45 + R * 1.2 * reach;
        const gr = ctx.createLinearGradient(x0, 0, x1, 0);
        gr.addColorStop(0, `rgba(${LAKE_RGB},0)`);
        gr.addColorStop(.7, `rgba(${WATER_RGB},.55)`);
        gr.addColorStop(1, 'rgba(255,255,255,.95)');
        ctx.globalAlpha = fade;
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.lineTo(x1, -2.6);
        ctx.quadraticCurveTo(x1 + 4, 0, x1, 2.6);
        ctx.closePath();
        ctx.fill();
      } else {
        // 靴踢: a lake-blue crescent that thins away.
        const reveal = ease(t / .32);
        const a0 = -.95, a1 = a0 + 2 * reveal;
        const gr = ctx.createLinearGradient(-R * .5, 0, R, 0);
        gr.addColorStop(0, `rgba(${LAKE_RGB},0)`);
        gr.addColorStop(.55, `rgba(${WATER_RGB},.6)`);
        gr.addColorStop(1, 'rgba(240,248,252,.95)');
        ctx.globalAlpha = fade * .9;
        ctx.fillStyle = gr;
        const thin = R * (.2 - .1 * t);
        ctx.rotate(.3);
        ctx.beginPath();
        ctx.arc(-R * .35, 0, R, a0, a1);
        ctx.arc(-R * .35 - thin, 0, R - thin * .4, a1, a0, true);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      if (e.hit) {
        const tipX = e.x + dir * R * (e.heavy ? .55 : .7);
        splash(ctx, el, e.heavy ? 41 : 43, n(e.heavy ? 8 : 4, lite), tipX, e.y, [80, e.heavy ? 220 : 150], e.max * 1.2, dir > 0 ? -.5 : Math.PI + .5, 1.6, e.heavy ? 3 : 2.4);
        if (e.heavy) {
          // The bass thump: one flat ring.
          const k = ease(t / .7);
          ctx.save();
          ctx.translate(tipX, e.y);
          wave(ctx, 10 + 34 * k, 4 + 9 * k, 7 * (1 - k) + 1.5, 1 - k);
          ctx.restore();
        }
      }
      break;
    }

    /* -- U 报价 -- */
    case 'umiri-milk-splash': {
      ctx.globalAlpha = (1 - t) * .35;
      glow(ctx, e.x, e.y, 26 + t * 24, '150,92,58');
      burst(el, 51, { n: n(14, lite), speed: [120, 300], life: e.max, gravity: 750 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i % 2 ? CHOCO : CREAM;
        drop(ctx, x, y, 3.6 * (1 - q * .5));
      }, e.x, e.y);
      break;
    }
    case 'umiri-milk-land': {
      burst(el, 53, { n: n(8, lite), speed: [90, 200], life: e.max, gravity: 800, angle: -Math.PI / 2, spread: 2.2 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i % 2 ? CHOCO : CREAM;
        drop(ctx, x, y, 2.8 * (1 - q * .5));
      }, e.x, e.y - 4);
      break;
    }
    case 'umiri-sip': {
      // Picked back up: lake-blue motes climb her body.
      const m = n(8, lite);
      for (let i = 0; i < m; i++) {
        const q = clamp((el - i * .03) / (e.max * .8), 0, 1);
        if (q <= 0 || q >= 1) continue;
        const x = e.x + Math.sin(q * 6 + i * 1.7) * 16 * (1 - q * .6);
        const y = e.y - 6 - q * 130;
        ctx.globalAlpha = Math.sin(q * Math.PI) * .8;
        glow(ctx, x, y, 7, i % 2 ? WATER_RGB : SILVER_RGB);
        ctx.fillStyle = SILVER;
        drop(ctx, x, y, 1.6);
      }
      if (!lite && t > .5) {
        ctx.globalAlpha = Math.sin(span(t, .5, 1) * Math.PI);
        ctx.fillStyle = '#ffffff';
        sparkle(ctx, e.x, e.y - 140, 6);
      }
      break;
    }

    /* -- I 扫货 -- */
    case 'umiri-wings': {
      // 扫货的名场面：金色羽翼在身后展开，两臂挂满购物袋，袋子沿手臂扇形垂落。
      const open = ease(t / .28);
      const fade = 1 - span(t, .6, 1);
      const feather = featherStamp();
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = fade * .16;
      glow(ctx, 0, -30, 90 * open + 20, '255,226,160');
      for (let side = -1; side <= 1; side += 2) {
        ctx.save();
        ctx.scale(side, 1);
        // Three rows of feathers, longest at the back; they swing up and out as the wing opens.
        for (const row of lite ? WING_ROWS_LITE : WING_ROWS) {
          for (let i = 0; i < row.n; i++) {
            const u = row.n > 1 ? i / (row.n - 1) : 0;
            const target = row.a0 + (row.a1 - row.a0) * u;
            const a = -Math.PI / 2 + (target + Math.PI / 2) * open;
            const rootX = 6 + Math.cos(a) * row.r, rootY = -6 + Math.sin(a) * row.r * .9;
            const L = row.len * (.85 + .3 * Math.sin(u * Math.PI)) * (.4 + .6 * open);
            ctx.globalAlpha = fade * row.alpha;
            if (feather) {
              ctx.save();
              ctx.translate(rootX, rootY);
              ctx.rotate(a);
              const fh = L * FEATHER_H / FEATHER_W * 1.1;
              ctx.drawImage(feather, 0, -fh / 2, L, fh);
              ctx.restore();
            }
          }
        }
        // Bags hang off the raised arm in a fan, the far ones first.
        const wx = 18, wy = -14;
        for (let j = WING_BAGS.length - 1; j >= 0; j--) {
          const ang = (.05 + j * .2) * open + (1 - open) * 1.3;
          const d = 30 + j * 14;
          const sz = (40 + j * 3) * (.6 + .4 * open);
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.translate(wx + Math.cos(ang) * d, wy + Math.sin(ang) * d);
          // Halfway between hanging straight down and lying along the fan.
          ctx.rotate((ang - Math.PI / 2) * .55);
          const c = bagStamp(WING_BAGS[j], art);
          if (c) ctx.drawImage(c, -sz / 2, -sz * .3, sz, sz);
          else {
            ctx.fillStyle = BAG_TINTS[WING_BAGS[j]] || '#ece8e0';
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 2;
            ctx.translate(0, sz * .2);
            bagShape(ctx, sz * .4);
          }
          ctx.restore();
        }
        ctx.restore();
      }
      break;
    }
    case 'umiri-receipt': {
      // Receipts and paper bits flutter out of the burst bag.
      ctx.globalAlpha = (1 - t) * .4;
      glow(ctx, e.x, e.y, 20 + t * 16, '255,255,255');
      burst(el, 61, { n: n(6, lite), speed: [80, 220], life: e.max, gravity: 260, drag: .45, angle: -Math.PI / 2, spread: 2.6 }, (x, y, q, i) => {
        ctx.save();
        ctx.globalAlpha = 1 - q;
        ctx.translate(x, y);
        ctx.rotate(el * (5 + i) + i);
        ctx.scale(Math.cos(el * 12 + i * 2), 1);
        ctx.fillStyle = i % 3 ? '#f8f5ef' : '#e9e2d4';
        ctx.fillRect(-2.5, -6, 5, 12);
        ctx.restore();
      }, e.x, e.y);
      break;
    }
    case 'umiri-bag-land': {
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = (1 - t) * .3;
        glow(ctx, e.x + (i - 1) * 14 * (1 + t), e.y - 6 - t * 8, 12 + t * 18, '222,208,186');
      }
      burst(el, 63, { n: n(3, lite), speed: [60, 140], life: e.max, gravity: 300, drag: .5, angle: -Math.PI / 2, spread: 2.4 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i % 2 ? '#f8f5ef' : '#cdb48c';
        ctx.fillRect(x - 2, y - 2, 4, 4);
      }, e.x, e.y - 6);
      break;
    }

    /* -- O 恐湖 -- */
    case 'umiri-lake': {
      const R = e.radius ?? 300;
      const fade = 1 - span(t, .7, 1);
      ctx.translate(e.x, e.y);
      const rx = R * (.3 + .75 * ease(el / .16)), ry = rx * .15;
      const lake = lakeStamp();
      ctx.globalAlpha = fade;
      if (lake) ctx.drawImage(lake, -rx, -ry, rx * 2, ry * 2);
      // Light on the surface.
      ctx.strokeStyle = SILVER;
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < n(7, lite); i++) {
        const hx = (hash(i, 3) - .5) * rx * 1.4 + Math.sin(el * 2 + i) * 6;
        const hy = (hash(i, 5) - .5) * ry * 1.1;
        const len = 8 + hash(i, 7) * 16;
        ctx.globalAlpha = fade * .55 * (.5 + .5 * Math.sin(el * 9 + i * 2.1));
        ctx.beginPath(); ctx.moveTo(hx - len / 2, hy); ctx.lineTo(hx + len / 2, hy); ctx.stroke();
      }
      ctx.globalAlpha = fade;
      // Three low, heavy beats.
      for (let i = 0; i < 3; i++) {
        const k = (el - .04 - i * .11) / .42;
        if (k <= 0 || k >= 1) continue;
        const r = R * ease(k);
        wave(ctx, r, r * .16, 16 * (1 - k) + 3, (1 - k) * (1 - i * .2));
      }
      // Water kicks up where the first wave stops: that is how far it reaches.
      for (let side = -1; side <= 1; side += 2) {
        splash(ctx, el - .34, 71 + side, n(8, lite), side * R * .94, 0, [120, 260], .45, -Math.PI / 2 + side * .35, .9, 3.2);
      }
      // 彼岸花 petals float up off the lake.
      for (let i = 0; i < n(7, lite); i++) {
        const st = .06 + hash(i, 9) * .25;
        const q = (el - st) / .6;
        if (q <= 0 || q >= 1) continue;
        const px = (hash(i, 11) - .5) * rx * 1.3 + Math.sin(q * 4 + i) * 8;
        const py = (hash(i, 13) - .5) * ry - q * 80;
        ctx.globalAlpha = Math.sin(q * Math.PI) * fade * .9;
        lilyPetal(ctx, px, py, 10 + hash(i, 15) * 6, hash(i, 17) * TAU + q * 2.4);
      }
      break;
    }
    case 'umiri-mist': {
      // 霸体: cold lake air rises round her legs.
      const fade = Math.min(1, el / .08) * (1 - span(t, .7, 1));
      for (let i = 0; i < n(6, lite); i++) {
        const q = (el * 1.5 + hash(i, 21)) % 1;
        const x = e.x + (hash(i, 23) - .5) * 56;
        const y = e.y - 8 - q * 74;
        ctx.globalAlpha = Math.sin(q * Math.PI) * .3 * fade;
        glow(ctx, x, y, 14 + q * 16, i % 2 ? WATER_RGB : SILVER_RGB);
      }
      break;
    }
    case 'umiri-geyser': {
      ctx.save();
      ctx.translate(e.x, e.y - 40);
      ctx.scale(.45, 1.7);
      ctx.globalAlpha = (1 - t) * .6;
      glow(ctx, 0, 0, 38 + t * 10, WATER_RGB);
      ctx.restore();
      splash(ctx, el, 81, n(12, lite), e.x, e.y - 4, [260, 500], e.max, -Math.PI / 2, .55, 3.8);
      break;
    }

    /* -- L 信用 -- */
    case 'umiri-rush': {
      const fade = 1 - span(t, .6, 1);
      const len = 150 * ease(t / .5);
      const y = e.y - 92;
      const gr = ctx.createLinearGradient(e.x - dir * len, 0, e.x, 0);
      gr.addColorStop(0, `rgba(${LAKE_RGB},0)`);
      gr.addColorStop(.75, `rgba(${WATER_RGB},.3)`);
      gr.addColorStop(1, 'rgba(228,237,242,.45)');
      ctx.globalAlpha = fade;
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(e.x - dir * len, y);
      ctx.quadraticCurveTo(e.x - dir * len * .5, y - 40, e.x, y - 48);
      ctx.lineTo(e.x, y + 48);
      ctx.quadraticCurveTo(e.x - dir * len * .5, y + 40, e.x - dir * len, y);
      ctx.closePath();
      ctx.fill();
      // The necklace catches the light as she sets off.
      const g = span(el, .12, .32);
      if (g > 0 && g < 1) {
        ctx.globalAlpha = Math.sin(g * Math.PI);
        ctx.fillStyle = '#ffffff';
        sparkle(ctx, e.x + dir * 6, e.y - 136, 7);
      }
      break;
    }
    case 'umiri-veil': {
      // The world goes lake-dark round the grab; the two bodies stay lit.
      const k = Math.min(1, el / .08) * (1 - span(t, .55, 1));
      const gr = ctx.createRadialGradient(e.x, e.y, 170, e.x, e.y, 640);
      gr.addColorStop(0, `rgba(${DEEP_RGB},0)`);
      gr.addColorStop(1, `rgba(${DEEP_RGB},.62)`);
      ctx.globalAlpha = k;
      ctx.fillStyle = gr;
      ctx.fillRect(e.x - 1600, e.y - 1200, 3200, 2400);
      break;
    }
    case 'umiri-grip': {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - span(t, 0, .25)) * .8;
      glow(ctx, e.x, e.y, 46 - t * 20, '255,255,255');
      ctx.globalCompositeOperation = 'source-over';
      const k = ease(t / .6);
      ctx.globalAlpha = (1 - k) * .8;
      ctx.strokeStyle = SILVER;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 20 + 50 * k, 20 + 50 * k, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = (1 - span(t, .4, .85)) * .9;
      lily(ctx, e.x, e.y, 24, ease(t / .3), el * .8);
      break;
    }
    case 'umiri-arc': {
      // Over the shoulder: front, up past her head, down behind.
      const p0x = e.x + dir * 48, p0y = e.y - 95;
      const c1x = e.x + dir * 30, c1y = e.y - 230;
      const c2x = e.x - dir * 70, c2y = e.y - 200;
      const p3x = e.x - dir * 82, p3y = e.y - 10;
      const head = ease(el / .12), tail = span(el, .06, .3);
      const N = 18;
      ctx.lineCap = 'round';
      for (let i = 0; i < N; i++) {
        const u0 = i / N, u1 = (i + 1) / N;
        if (u1 > head || u0 < tail) continue;
        const pt = (u: number) => {
          const v = 1 - u;
          return [v * v * v * p0x + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * p3x,
            v * v * v * p0y + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * p3y];
        };
        const [ax, ay] = pt(u0), [bx, by] = pt(u1);
        const w = (u1 - tail) / Math.max(.01, head - tail);
        ctx.globalAlpha = .7 * w;
        ctx.strokeStyle = `rgba(${WATER_RGB},1)`;
        ctx.lineWidth = 4 + 14 * w;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.globalAlpha = .9 * w;
        ctx.strokeStyle = SILVER;
        ctx.lineWidth = 1.5 + 3 * w;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
      break;
    }
    case 'umiri-crash': {
      const kept = (e.n ?? 0) > 0;
      ctx.translate(e.x, e.y);
      // Dark water under the impact.
      ctx.globalAlpha = (1 - t) * .5;
      const lake = lakeStamp();
      if (lake) ctx.drawImage(lake, -90, -16, 180, 32);
      // Heavy shock along the floor.
      const sk = ease(el / .38);
      const rx = 40 + 160 * sk * (kept ? 1.25 : 1);
      ctx.globalAlpha = 1;
      wave(ctx, rx, rx * .17, 18 * (1 - sk) + 3, 1 - sk);
      // A crown of water, as if she threw them into the lake.
      const rise = Math.sin(Math.min(1, el / .4) * Math.PI);
      const m = n(12, lite);
      for (let i = 0; i < m; i++) {
        const a = i / m * TAU;
        const bx = Math.cos(a) * 38, by = Math.sin(a) * 7;
        const h = rise * (40 + hash(i, 31) * 34) * (kept ? 1.2 : 1);
        if (h < 2) continue;
        const tx = bx + Math.cos(a) * h * .3, ty = by - h;
        ctx.globalAlpha = .75;
        ctx.fillStyle = `rgba(${WATER_RGB},1)`;
        ctx.beginPath();
        ctx.moveTo(bx - 4, by);
        ctx.quadraticCurveTo(tx, ty + h * .4, tx, ty);
        ctx.quadraticCurveTo(tx, ty + h * .4, bx + 4, by);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = SILVER;
        drop(ctx, tx, ty - 3, 2.6);
      }
      splash(ctx, el, 91, n(14, lite), 0, -6, [200, 420], .7, -Math.PI / 2, 1.5, 3.4);
      // Petals scatter.
      burst(el, 93, { n: n(6, lite), speed: [100, 230], life: e.max, gravity: 140, drag: .4, angle: -Math.PI / 2, spread: 2.6 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        lilyPetal(ctx, x, y, 11, i + el * 5);
      }, 0, -20);
      if (kept) {
        // 履约: the price tag snaps into silver, the 彼岸花 opens wide.
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - span(el, 0, .22)) * .7;
        glow(ctx, 0, -95, 95, '255,255,255');
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = (1 - span(t, .45, .9)) * .85;
        lily(ctx, 0, -95, 44, ease(el / .3), el * .6);
        burst(el, 95, { n: n(10, lite), speed: [120, 260], life: .6, gravity: 600 }, (x, y, q) => {
          ctx.globalAlpha = 1 - q;
          ctx.fillStyle = q < .4 ? '#ffffff' : SILVER;
          sparkle(ctx, x, y, 4.5 * (1 - q * .4));
        }, 0, -210);
      }
      break;
    }
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  return true;
}
