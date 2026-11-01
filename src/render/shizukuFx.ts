import type { Effect, Projectile } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import { WIDE_APPLIANCES, WIDE_BLAST } from './clips.ts';
import { TAU, burst, confetti, cycle, dot, easeOut, flame, glow, hash, petal, snowflake, soap, span, sparkle, streak, tri } from './fxParticles.ts';

/* 四宫宁月 — 家电事故现场. She is calm; everything round her goes wrong, and the status kit is her whole
   identity, so her fx are allowed to be the loudest on the roster — built out of many small simple shapes
   (fxParticles.ts) so they have texture without thick outlines: embers and electric crackle for the foil,
   ice shards and cold breath for the ice pop, princess glitter for the smile. In the super each appliance
   drops in, rumbles, goes off in its own status colour (sparks / a blizzard / a suds geyser), then breaks into
   pieces; the suds pile round them and burst in a storm of soap bubbles with one star per status they carried.
   The appliances are PNGs the user paints; a cartoon stand-in draws until they load, and the break-up cuts
   whichever is drawn. Status looks live in statusMarks.ts. Glow comes from additive blending, never blur. */

/** Painted under every body: the appliances stand behind whoever they go off at. */
export const SHIZUKU_BACK: readonly string[] = ['wide-appliance', 'wide-zone'];

const INK = '#1b1626';
const SHIZUKU = '#9999FF';
const EMBER = ['#fff1b0', '#ffc24a', '#ff8a2a', '#ff5326'] as const;
const ICE = ['#ffffff', '#dff6ff', '#a9e0ff', '#7cc7f2'] as const;
const GLITTER = ['#ffffff', '#d9d4ff', '#ffd6f2', '#fff0a8'] as const;
const ARC = ['#ffffff', '#cdeeff', '#9fd8ff'] as const;
/** The party smile's petals: lilac, pink, white. */
const PETALS = ['#c9c4ff', '#ffc9ec', '#ffffff', '#a9a2f0'] as const;
/** The status colours, in the order status.ts counts kinds: burn, chill, freeze, confuse. */
const KIND_COLORS = ['#ff9a3c', '#9fd8ff', '#e8f8ff', '#cbb8ff'] as const;
/** ponytail: one buffer for the stars in wide-pop. drawShizukuFx does not re-enter itself. */
const liveKinds: string[] = [];
const FOIL_SRC = '/sprites/shizuku/foil.png';
const POPSICLE_SRC = '/sprites/shizuku/popsicle.png';

let lite = false;
const n = (full: number) => (lite ? Math.ceil(full / 2) : full);

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

/** The PNG's own shape filled flat with one colour (the blast flash): built once per image and colour. */
const tints = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();
function tinted(im: HTMLImageElement, color: string): CanvasImageSource {
  let m = tints.get(im);
  if (!m) tints.set(im, m = new Map());
  let c = m.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = im.naturalWidth;
    c.height = im.naturalHeight;
    const g = c.getContext('2d');
    if (g) {
      g.drawImage(im, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
    }
    m.set(color, c);
  }
  return c;
}

/** A short electric zigzag from (x0, y0) to (x1, y1); the kinks re-roll every `beat`. Stroked, additive by caller. */
function bolt(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, beat: number, jag: number, segs = 5): void {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i < segs; i++) {
    const k = i / segs, off = (hash(beat * 7 + i, 31) - .5) * 2 * jag;
    ctx.lineTo(x0 + dx * k + nx * off, y0 + dy * k + ny * off);
  }
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/* ---------- stand-ins for the five PNGs ---------- */

function drawFoilStandIn(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.fillStyle = '#d7dbe3';
  ctx.strokeStyle = '#7d8494';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = i * TAU / 9, rr = r * (.75 + hash(i, 3) * .35);
    if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawPopsicleStandIn(ctx: CanvasRenderingContext2D, len: number): void {
  const w = len * .32;
  ctx.fillStyle = '#f4f1ff';
  ctx.strokeStyle = '#8f88c9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-len / 2, -w / 2, len, w, w / 2);
  ctx.fill();
  ctx.stroke();
}

/** n: 0 microwave, 1 fridge, 2 washer. Drawn standing on (0, 0) in a w × h box, facing the screen. */
function drawApplianceStandIn(ctx: CanvasRenderingContext2D, k: number, w: number, h: number): void {
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.fillStyle = k === 1 ? '#eef3f8' : '#f3f1ec';
  ctx.beginPath(); ctx.roundRect(-w / 2, -h, w, h, 12); ctx.fill(); ctx.stroke();
  if (k === 0) {
    ctx.fillStyle = '#3a3d4a';
    ctx.beginPath(); ctx.roundRect(-w / 2 + 10, -h + 12, w * .6, h - 24, 6); ctx.fill(); ctx.stroke();
  } else if (k === 1) {
    ctx.beginPath(); ctx.moveTo(-w / 2, -h * .62); ctx.lineTo(w / 2, -h * .62); ctx.stroke();
  } else {
    ctx.fillStyle = '#bfe3ff';
    ctx.beginPath(); ctx.arc(0, -h * .45, h * .27, 0, TAU); ctx.fill(); ctx.stroke();
  }
}

/* ---------- shots ---------- */

/** 锡纸加热实验 / 一人一半. True when this shot is hers (the stock dots and art stay off). */
export function drawShizukuShot(ctx: CanvasRenderingContext2D, p: Projectile, images: ImageCache | undefined, liteFx: boolean): boolean {
  if (p.fx !== 'foil-spark' && p.fx !== 'popsicle') return false;
  lite = liteFx;
  const dir = Math.sign(p.vx) || 1;
  ctx.save();
  if (p.fx === 'foil-spark') {
    // Behind it, a wake of sparks: short streaks thrown back off it that droop as they cool.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let j = 0, m = n(12); j < m; j++) {
      const back = (j + cycle(p.age, 6, j)) * .028;
      if (back > p.age) continue;
      const x = p.x - p.vx * back + (hash(j, 41) - .5) * 12;
      const y = p.y - p.vy * back + 320 * back * back + (hash(j, 42) - .5) * 12;
      ctx.globalAlpha = 1 - j / m;
      ctx.strokeStyle = j % 3 ? '#ffc65a' : '#e6f7ff';
      streak(ctx, x + Math.sign(p.vx) * 6, y - 2, x, y + 640 * back * .02, 1.8);
    }
    // A blue-white electric glow so it reads as live.
    ctx.globalAlpha = .7;
    glow(ctx, p.x, p.y, 34, '170,220,255');
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.age * 9 * dir);
    const im = image(images, FOIL_SRC);
    if (im) ctx.drawImage(im, -26, -26, 52, 52); else drawFoilStandIn(ctx, 18);
    ctx.restore();
    // The crackle: three arcs off the foil, re-rolled every 40 ms.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const beat = Math.floor(p.age * 25);
    for (let i = 0, m = n(3); i < m; i++) {
      const a = hash(beat, i + 50) * TAU;
      const r = 30 + hash(beat, i + 60) * 18;
      ctx.globalAlpha = .9;
      ctx.strokeStyle = ARC[i % 3];
      ctx.lineWidth = 2;
      bolt(ctx, p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, p.x + Math.cos(a + .4) * r, p.y + Math.sin(a + .4) * r, beat + i, 5, 4);
    }
  } else {
    // Cold wake: a trail of mist it leaves hanging, little snowflakes shed off it, a few white sparkles.
    for (let j = 0, m = n(7); j < m; j++) {
      const back = j * .045;
      if (back > p.age) continue;
      ctx.globalAlpha = (1 - j / m) * .5;
      glow(ctx, p.x - p.vx * back, p.y - p.vy * back + j * 2, 12 + j * 3, '226,244,255');
    }
    for (let j = 0, m = n(8); j < m; j++) {
      const back = (j + cycle(p.age, 4, j, 43)) * .04;
      if (back > p.age) continue;
      ctx.globalAlpha = (1 - j / m) * .95;
      snowflake(ctx, p.x - p.vx * back, p.y - p.vy * back + (hash(j, 44) - .5) * 18 + back * 40, 4 + hash(j, 47) * 2, p.age * 3 + j, j % 2 ? '#ffffff' : '#c4e8ff');
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const k = cycle(p.age, 3, i, 44);
      ctx.globalAlpha = Math.sin(k * Math.PI);
      sparkle(ctx, p.x + (hash(i, 45) - .5) * 40, p.y + (hash(i, 46) - .5) * 30, 6);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.translate(p.x, p.y);
    // Flip first, then tilt nose-down as it sinks.
    ctx.scale(dir, 1);
    ctx.rotate(Math.atan2(p.vy, Math.abs(p.vx) || 1));
    const im = image(images, POPSICLE_SRC);
    if (im) ctx.drawImage(im, -30, -30, 60, 60); else drawPopsicleStandIn(ctx, 46);
  }
  ctx.restore();
  return true;
}

/* ---------- the appliances ---------- */

/** The break-up: a fan of triangles from a point inside the box, so any PNG cuts into clean pieces. Unit box,
 *  x 0–1 left to right, y 0–1 top to bottom. */
const CRACK = { x: .48, y: .55 };
const RIM: readonly [number, number][] = [[0, 0], [.42, 0], [1, 0], [1, .38], [1, 1], [.55, 1], [0, 1], [0, .45]];
const CRACK_TINT = '#3a3346';

/** Break-up pieces of one appliance PNG. Clipping the live image eight times a frame is the expensive part;
 *  each triangle is cut once and then stamped. Stand-ins, and the headless sweep (no document), keep the live clip.
 *  ponytail: one set per image at the size it is drawn. Retuning WIDE_APPLIANCES changes that size and rebuilds. */
interface Shard { c: HTMLCanvasElement; tint: HTMLCanvasElement; x: number; y: number }
const shards = new WeakMap<HTMLImageElement, { w: number; h: number; parts: Shard[] }>();
function applianceShards(im: HTMLImageElement, w: number, h: number): Shard[] | null {
  if (typeof document === 'undefined') return null;
  const hit = shards.get(im);
  if (hit && hit.w === w && hit.h === h) return hit.parts;
  const bw = Math.max(1, Math.ceil(w)), bh = Math.max(1, Math.ceil(h));
  const base = document.createElement('canvas');
  base.width = bw; base.height = bh;
  const bg = base.getContext('2d');
  if (!bg) return null;
  bg.drawImage(im, 0, 0, w, h);
  const dark = document.createElement('canvas');
  dark.width = bw; dark.height = bh;
  const dg = dark.getContext('2d');
  if (!dg) return null;
  dg.drawImage(base, 0, 0);
  dg.globalCompositeOperation = 'source-in';
  dg.fillStyle = CRACK_TINT;
  dg.fillRect(0, 0, bw, bh);
  const crackX = CRACK.x * w, crackY = CRACK.y * h;
  const parts: Shard[] = [];
  const cut = (src: HTMLCanvasElement, minX: number, minY: number, pw: number, ph: number, ax: number, ay: number, bx: number, by: number) => {
    const c = document.createElement('canvas');
    c.width = pw; c.height = ph;
    const g = c.getContext('2d');
    if (!g) return c;
    g.beginPath();
    g.moveTo(crackX - minX, crackY - minY);
    g.lineTo(ax - minX, ay - minY);
    g.lineTo(bx - minX, by - minY);
    g.closePath();
    g.clip();
    g.drawImage(src, -minX, -minY);
    return c;
  };
  for (let i = 0; i < RIM.length; i++) {
    const a = RIM[i], b = RIM[(i + 1) % RIM.length];
    const ax = a[0] * w, ay = a[1] * h, bx = b[0] * w, by = b[1] * h;
    const minX = Math.max(0, Math.floor(Math.min(crackX, ax, bx)) - 1);
    const minY = Math.max(0, Math.floor(Math.min(crackY, ay, by)) - 1);
    const maxX = Math.min(bw, Math.ceil(Math.max(crackX, ax, bx)) + 1);
    const maxY = Math.min(bh, Math.ceil(Math.max(crackY, ay, by)) + 1);
    const pw = Math.max(1, maxX - minX), ph = Math.max(1, maxY - minY);
    parts.push({
      c: cut(base, minX, minY, pw, ph, ax, ay, bx, by),
      tint: cut(dark, minX, minY, pw, ph, ax, ay, bx, by),
      x: minX, y: minY,
    });
  }
  shards.set(im, { w, h, parts });
  return parts;
}

function appliance(ctx: CanvasRenderingContext2D, e: Effect, images: ImageCache | undefined): void {
  const k = e.n ?? 0;
  const spec = WIDE_APPLIANCES[k];
  const age = e.max - e.life;
  const toward = e.dir ?? 1;
  const im = image(images, spec.src);
  // The PNG is a square with the appliance standing on its bottom edge; h is the square's size.
  const h = im ? spec.h * 1.15 : spec.h, w = im ? h * im.naturalWidth / im.naturalHeight : spec.w;
  const paint = (c: CanvasRenderingContext2D) => {
    if (im) c.drawImage(im, -w / 2, -h, w, h); else drawApplianceStandIn(c, k, w, h);
  };
  const flashAt = (c: CanvasRenderingContext2D, color: string, a: number) => {
    if (a <= 0) return;
    c.save();
    c.globalAlpha *= a;
    if (im) c.drawImage(tinted(im, color), -w / 2, -h, w, h);
    else { c.fillStyle = color; c.beginPath(); c.roundRect(-w / 2, -h, w, h, 12); c.fill(); }
    c.restore();
  };
  const drop = span(age, 0, .12);
  const yOff = -280 * (1 - drop * drop);
  const land = span(age, .12, .22);
  const squash = land > 0 && land < 1 ? Math.sin(land * Math.PI) * .14 : 0;
  const rumble = age > .18 && age < .62;
  const amp = k === 2 ? 6 + span(age, .3, .45) * 5 : age < WIDE_BLAST ? 2 : 3.5;
  const sx = rumble ? Math.sin(age * 80) * amp : 0;
  const sy = rumble && k === 2 ? Math.abs(Math.sin(age * 45)) * -6 : 0;
  const breakAt = .62;
  const cx = e.x, top = e.y - h;
  // Where the appliance itself is inside its square (the stand-in's own size), for effects that sit on it.
  const bw = spec.w, bh = spec.h, btop = e.y - bh;

  if (age < breakAt) {
    ctx.save();
    ctx.translate(e.x + sx, e.y + yOff + sy);
    ctx.scale(1 + squash, 1 - squash);
    paint(ctx);
    // Rumbling up to the blast, it starts to give: the status colour seeps through it.
    flashAt(ctx, KIND_COLORS[k === 2 ? 3 : k], span(age, .18, WIDE_BLAST) * .25 + (k === 1 ? span(age, WIDE_BLAST, breakAt) * .35 : 0));
    // The blast itself: one bright flash of its own silhouette.
    if (age >= WIDE_BLAST) {
      ctx.globalCompositeOperation = 'lighter';
      flashAt(ctx, '#ffffff', 1 - span(age, WIDE_BLAST, WIDE_BLAST + .14));
    }
    ctx.restore();
  } else {
    // Broken: each piece flies off away from them, turning, under gravity, and fades.
    // A loaded PNG stamps pre-cut pieces; the stand-in still clips, which is what the headless sweep runs.
    const t = age - breakAt, fade = 1 - span(age, breakAt + .2, e.max);
    const parts = fade > 0 && im ? applianceShards(im, w, h) : null;
    if (fade > 0) for (let i = 0; i < RIM.length; i++) {
      const a = RIM[i], b = RIM[(i + 1) % RIM.length];
      const mx = (CRACK.x + a[0] + b[0]) / 3 - .5, my = (CRACK.y + a[1] + b[1]) / 3 - .55;
      const len = Math.hypot(mx, my) || 1;
      const vx = (mx / len) * (180 + hash(i, 70) * 160) - toward * 90;
      const vy = (my / len) * 160 - 260 - hash(i, 71) * 160;
      const px = cx + (mx + .5 - .5) * w, py = top + (my + .55) * h;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(px + vx * t, py + vy * t + 900 * t * t);
      ctx.rotate((hash(i, 72) - .5) * 9 * t);
      ctx.translate(-px, -py);
      const part = parts?.[i];
      if (part) {
        const dx = cx - w / 2 + part.x, dy = top + part.y;
        ctx.drawImage(part.c, dx, dy);
        const fa = span(age, breakAt, breakAt + .25) * .35;
        if (fa > 0) { ctx.globalAlpha = fade * fa; ctx.drawImage(part.tint, dx, dy); }
      } else {
        ctx.beginPath();
        ctx.moveTo(cx - w / 2 + CRACK.x * w, top + CRACK.y * h);
        ctx.lineTo(cx - w / 2 + a[0] * w, top + a[1] * h);
        ctx.lineTo(cx - w / 2 + b[0] * w, top + b[1] * h);
        ctx.closePath();
        ctx.clip();
        ctx.translate(cx, e.y);
        paint(ctx);
        flashAt(ctx, CRACK_TINT, span(age, breakAt, breakAt + .25) * .35);
      }
      ctx.restore();
    }
  }

  // Dust where it lands: soft puffs rolling out low along the floor on both sides.
  if (land > 0 && land < 1) {
    ctx.save();
    for (let i = 0, m = n(8); i < m; i++) {
      const side = i % 2 ? 1 : -1;
      const q = land;
      ctx.globalAlpha = (1 - q) * .45;
      glow(ctx, e.x + side * (spec.w * .35 + q * (40 + hash(i, 81) * 50)), e.y - 6 - q * 10 * hash(i, 82), 10 + q * 16, '214,206,228');
    }
    ctx.restore();
  }
  // Bolts and screws pop off on the blast; a burst of debris and smoke on the break.
  // Both no-op before their time, so the closures are not built until then.
  if (age >= WIDE_BLAST) {
    ctx.save();
    burst(age - WIDE_BLAST, 90 + k, { n: n(10), speed: [220, 460], life: .7, gravity: 1200, angle: -Math.PI / 2, spread: Math.PI * 1.2 }, (x, y, q, i) => {
      ctx.globalAlpha = 1 - q * q;
      ctx.fillStyle = i % 2 ? '#5b566a' : '#b7b2c4';
      confetti(ctx, x, y, 4, 2, q * 14 + i, 0);
    }, cx, btop + bh * .4);
    if (age >= breakAt) burst(age - breakAt, 100 + k, { n: n(12), speed: [40, 140], life: .55, gravity: -120, drag: .3 }, (x, y, q, i) => {
      ctx.globalAlpha = (1 - q) * .55;
      glow(ctx, x, y, 12 + q * 22, i % 2 ? '142,135,153' : '179,173,188');
    }, cx, btop + bh * .5);
    ctx.restore();
  }

  // What each one does while it is going off.
  if (age < .18) return;
  const at = age - WIDE_BLAST;
  ctx.save();
  if (k === 0) {
    // Microwave: crackle on the door before; after the blast, arcs all over it, a spark fountain and smoke.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const beat = Math.floor(age * 30);
    const arcs = at < 0 ? 1 : n(4);
    for (let i = 0; i < arcs; i++) {
      const x0 = cx + (hash(beat, i + 1) - .5) * bw * .8, y0 = btop + bh * (.2 + .6 * hash(beat, i + 2));
      ctx.globalAlpha = at < 0 ? .6 : .95 * (1 - span(age, breakAt, breakAt + .1));
      ctx.strokeStyle = ARC[i % 3];
      ctx.lineWidth = 2.5;
      bolt(ctx, x0, y0, x0 + (hash(beat, i + 3) - .5) * 70, y0 + (hash(beat, i + 4) - .5) * 50, beat + i, 8);
    }
    // The spark fountain: streaks drawn along their own flight, so they read as fast sparks, plus a hot glow.
    if (at >= 0) {
      ctx.globalAlpha = Math.max(0, 1 - at / .5) * .5;
      glow(ctx, cx, btop + 6, 40, '255,190,90');
      const sx0 = cx, sy0 = btop + 6;
      burst(at, 110, { n: n(36), speed: [200, 520], life: .65, gravity: 900, angle: -Math.PI / 2 + toward * .4, spread: 1.4 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.strokeStyle = EMBER[(i + Math.floor(q * 3)) % 4];
        const dx = x - sx0, dy = y - sy0, d = Math.hypot(dx, dy) || 1;
        streak(ctx, x - dx / d * 10, y - dy / d * 10, x, y, 2);
      }, sx0, sy0);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0, m = n(8); i < m; i++) {
      const q = cycle(age, 1.6, i, 111);
      if (at < 0) break;
      ctx.globalAlpha = (1 - q) * .6;
      glow(ctx, cx + (hash(i, 112) - .5) * bw * .6 + Math.sin(age * 3 + i) * 6, btop - q * 90, 12 + q * 22, i % 2 ? '111,104,120' : '149,142,158');
    }
  } else if (k === 1) {
    // Fridge: frost creeping before; after the blast, a heavy cold mist spills out and pours down its front.
    // Cold mist rolling off its front and down to the floor: soft, pale, never grey.
    for (let i = 0, m = n(16); i < m; i++) {
      const q = cycle(age, 1.2, i, 120);
      const x = cx + toward * q * bw * .7 + (hash(i, 121) - .5) * bw * .6;
      const y = btop + bh * (.35 + .5 * hash(i, 122)) + q * q * 50;
      ctx.globalAlpha = (at < 0 ? .2 : .5) * Math.sin(q * Math.PI);
      glow(ctx, x, y, 10 + q * 18, '236,248,255');
    }
    // Frost spikes growing along its sides, and flakes drifting off it.
    for (let i = 0, m = n(14); i < m; i++) {
      ctx.globalAlpha = .85 * span(age, .18, WIDE_BLAST + .1);
      ctx.fillStyle = ICE[i % 4];
      const side = i % 2 ? -1 : 1;
      tri(ctx, cx + side * (bw * .5 + 2), btop + bh * (.08 + .84 * hash(i, 123)), 2.5 + hash(i, 124) * 3.5, side > 0 ? 0 : Math.PI);
    }
    for (let i = 0, m = n(10); i < m; i++) {
      const q = cycle(age, 1.5, i, 125);
      ctx.globalAlpha = Math.sin(q * Math.PI) * (at < 0 ? .5 : 1);
      snowflake(ctx, cx + (hash(i, 126) - .5) * bw * 1.2 + Math.sin(age * 5 + i) * 6, btop - 10 + q * (bh + 10), 4 + hash(i, 127) * 2, age * 2 + i, i % 2 ? '#ffffff' : '#c4e8ff');
    }
  } else {
    // Washer: suds seep from the seams before; after the blast, a geyser of bubbles out of the porthole.
    const px = cx, py = btop + bh * .55;
    for (let i = 0, m = n(at < 0 ? 8 : 34); i < m; i++) {
      const q = cycle(age, at < 0 ? .9 : 2.2, i, 130);
      const a = -Math.PI / 2 + toward * .5 + (hash(i, 131) - .5) * 1.4;
      const d = q * (at < 0 ? 30 : 150);
      soap(ctx, px + Math.cos(a) * d, py + Math.sin(a) * d + q * q * 40, 3 + hash(i, 132) * 10, 1 - q, hash(i, 133));
    }
  }
  ctx.restore();
}

/* ---------- effects ---------- */

export function drawShizukuFx(ctx: CanvasRenderingContext2D, e: Effect, images: ImageCache | undefined, liteFx: boolean): boolean {
  lite = liteFx;
  const p = 1 - e.life / e.max;
  const age = e.max - e.life;
  const dir = e.dir ?? 1;
  switch (e.type) {
    case 'bow-push': {
      // 请多关照: a lilac crescent swoosh where the push lands — a polite shove with weight behind it — a white
      // inner edge, and a few sparkles spilling forward.
      ctx.save();
      const k = easeOut(p * 1.4);
      const fade = 1 - span(p, .35, 1);
      const R = 22 + k * 26;
      const cx0 = e.x + dir * k * 14;
      const crescent = (r: number, thick: number, color: string, alpha: number) => {
        ctx.globalAlpha = alpha * fade;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(cx0, e.y, r * .55, r, 0, -Math.PI / 2, Math.PI / 2, dir < 0);
        ctx.ellipse(cx0 - dir * thick, e.y, Math.max(1, r * .55 - thick), r * .86, 0, Math.PI / 2, -Math.PI / 2, dir > 0);
        ctx.closePath();
        ctx.fill();
      };
      crescent(R, 9, SHIZUKU, .85);
      crescent(R * .8, 4, '#ffffff', .9);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * .35;
      glow(ctx, cx0, e.y, R * 1.2, '170,170,255');
      burst(age, 140, { n: n(8), speed: [80, 200], life: .35, angle: dir > 0 ? 0 : Math.PI, spread: 1.6, drag: .2 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = GLITTER[i % 4];
        sparkle(ctx, x, y, 5 * (1 - q * .5));
      }, cx0, e.y);
      ctx.restore();
      return true;
    }
    case 'foil-pop': {
      // The foil goes up: a hot white flash, licks of flame, sparks streaking out, arcs crackling, then smoke.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.max(0, 1 - age / .15);
      glow(ctx, e.x, e.y, 46 + age * 120, '255,236,190');
      ctx.globalCompositeOperation = 'source-over';
      burst(age, 150, { n: n(10), speed: [60, 200], life: .45, gravity: -260, drag: .2 }, (x, y, k) => {
        ctx.globalAlpha = 1 - k;
        flame(ctx, x, y, 12 * (1 - k * .5), k < .4 ? 'hot' : 'warm');
      }, e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      burst(age, 154, { n: n(22), speed: [200, 460], life: .45, gravity: 600, drag: .3 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = EMBER[i % 4];
        const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy) || 1;
        streak(ctx, x - dx / d * 12, y - dy / d * 12, x, y, 2);
      }, e.x, e.y);
      ctx.strokeStyle = ARC[1];
      ctx.lineWidth = 2;
      ctx.globalAlpha = Math.max(0, 1 - age / .25);
      for (let i = 0; i < n(3); i++) {
        const a = hash(i, 152) * TAU;
        bolt(ctx, e.x, e.y, e.x + Math.cos(a) * 46, e.y + Math.sin(a) * 46, Math.floor(age * 30) + i, 7, 4);
      }
      ctx.globalCompositeOperation = 'source-over';
      burst(age - .08, 153, { n: n(6), speed: [20, 60], life: .4, gravity: -90 }, (x, y, k, i) => {
        ctx.globalAlpha = (1 - k) * .55;
        glow(ctx, x, y, 12 + k * 18, i % 2 ? '111,104,120' : '142,135,153');
      }, e.x, e.y - 10);
      ctx.restore();
      return true;
    }
    case 'popsicle-bite': {
      // Crunch: sparkles off her mouth and a soft puff of cold breath forward.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      burst(age, 160, { n: n(8), speed: [40, 120], life: .45, angle: dir > 0 ? -.5 : Math.PI + .5, spread: 1.6, drag: .3 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = i % 2 ? '#ffffff' : '#bfe8ff';
        sparkle(ctx, x, y, 3 + (1 - k) * 3);
      }, e.x, e.y);
      ctx.globalCompositeOperation = 'source-over';
      burst(age, 161, { n: n(5), speed: [30, 70], life: .5, angle: dir > 0 ? 0 : Math.PI, spread: .6, gravity: -40 }, (x, y, k) => {
        ctx.globalAlpha = (1 - k) * .55;
        glow(ctx, x, y, 6 + k * 12, '236,248,255');
      }, e.x + dir * 6, e.y + 4);
      ctx.restore();
      return true;
    }
    case 'popsicle-hit': {
      // Ice shatters off the hit: chips falling, snowflakes thrown out, a cold puff, one bright glint.
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / .4) * .6;
      glow(ctx, e.x, e.y, 30 + age * 80, '226,244,255');
      burst(age, 170, { n: n(16), speed: [120, 340], life: .5, gravity: 700, drag: .3 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = ICE[i % 4];
        tri(ctx, x, y, 2.5 + hash(i, 171) * 3.5, i + k * 9);
      }, e.x, e.y);
      burst(age, 172, { n: n(8), speed: [90, 220], life: .5, gravity: 200, drag: .25 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        snowflake(ctx, x, y, 6 * (1 - k * .4), i + k * 4, i % 2 ? '#ffffff' : '#c4e8ff');
      }, e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.max(0, 1 - age / .18);
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x, e.y, 22);
      ctx.restore();
      return true;
    }
    case 'smile-glint': {
      // The party smile: one glint at her face, and a few petals turning slowly round her head with sparkles.
      ctx.save();
      const fade = Math.min(1, age / .1, e.life / .08);
      for (let i = 0, m = n(8); i < m; i++) {
        const a = age * 1.6 + i * TAU / m;
        const depth = Math.sin(a);
        ctx.globalAlpha = fade * (.6 + depth * .35);
        const x = e.x + Math.cos(a) * 36, y = e.y - 2 + depth * 10 + Math.sin(age * 2 + i) * 3;
        petal(ctx, x, y, 5 + depth, a * 1.5 + i, PETALS[i % PETALS.length]);
      }
      ctx.globalCompositeOperation = 'lighter';
      const tw = .6 + .4 * Math.abs(Math.sin(age * 7));
      ctx.globalAlpha = fade * tw;
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x + dir * 12, e.y - 6, 10 * tw);
      for (let i = 0, m = n(5); i < m; i++) {
        const q = cycle(age, 1.4, i, 181);
        ctx.globalAlpha = fade * Math.sin(q * Math.PI);
        ctx.fillStyle = GLITTER[i % 4];
        sparkle(ctx, e.x + (hash(i, 182) - .5) * 70, e.y + (hash(i, 183) - .5) * 40, 4);
      }
      ctx.restore();
      return true;
    }
    case 'smile-flash': {
      // Caught swinging into the smile: the glint flares, a soft lilac ring opens, petals and sparkles burst out.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const r = 18 + easeOut(p) * 58;
      ctx.globalAlpha = (1 - p) * .9;
      ctx.strokeStyle = '#c9c4ff';
      ctx.lineWidth = 5 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = (1 - p) * .4;
      glow(ctx, e.x, e.y, r * .8, '200,196,255');
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x + dir * 12, e.y - 6, 24 * (1 - p * .5));
      burst(age, 184, { n: n(10), speed: [80, 240], life: .5, gravity: 120, drag: .2 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = GLITTER[i % 4];
        sparkle(ctx, x, y, 5 * (1 - k * .4));
      }, e.x, e.y);
      ctx.globalCompositeOperation = 'source-over';
      burst(age, 180, { n: n(14), speed: [90, 260], life: .6, gravity: 160, drag: .25 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k * k;
        petal(ctx, x, y, 6 * (1 - k * .3), i * 1.3 + k * 6, PETALS[i % PETALS.length]);
      }, e.x, e.y);
      ctx.restore();
      return true;
    }
    case 'curtsy-ring': {
      // The curtsy: petals swept off her skirt fan out low along the floor, a soft lilac light spreads under them,
      // and sparkles lift off it.
      ctx.save();
      const r = e.radius ?? 60;
      ctx.save();
      ctx.translate(e.x + dir * p * 24, e.y - 4);
      ctx.scale(1, .25);
      ctx.globalAlpha = (1 - p) * .55;
      glow(ctx, 0, 0, r * (.5 + easeOut(p) * .8), '170,170,255');
      ctx.restore();
      burst(age, 191, { n: n(14), speed: [120, 300], life: .55, angle: dir > 0 ? -.15 : Math.PI + .15, spread: 1.3, gravity: 220, drag: .2 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k * k;
        petal(ctx, x, Math.min(y, e.y - 4), 6 * (1 - k * .3), i * 1.7 + k * 5, PETALS[i % PETALS.length]);
      }, e.x + dir * 14, e.y - 30);
      ctx.globalCompositeOperation = 'lighter';
      burst(age, 190, { n: n(10), speed: [40, 120], life: .45, angle: -Math.PI / 2, spread: 1.2, gravity: -60 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = GLITTER[i % 4];
        sparkle(ctx, x, y, 4);
      }, e.x + dir * 30, e.y - 6);
      ctx.restore();
      return true;
    }
    case 'wide-eyes': {
      // 世界真是广阔啊: stars in her eyes, and more stars floating up and out round her head.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fade = Math.min(1, age / .1, e.life / .1);
      for (let i = 0; i < 2; i++) {
        const tw = .7 + .3 * Math.sin(age * 9 + i * 2);
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#fff3a8';
        sparkle(ctx, e.x + dir * (i * 9 - 2), e.y - 4 + i * 2, 6 * tw);
      }
      for (let i = 0, m = n(14); i < m; i++) {
        const k = cycle(age, 1.1, i, 200);
        const a = -Math.PI / 2 + (hash(i, 201) - .5) * 2.6;
        ctx.globalAlpha = fade * Math.sin(k * Math.PI);
        ctx.fillStyle = GLITTER[i % 4];
        sparkle(ctx, e.x + Math.cos(a) * (14 + k * 50), e.y - 10 + Math.sin(a) * (14 + k * 40), 2 + 4 * (1 - k));
      }
      ctx.restore();
      return true;
    }
    case 'wide-fizzle': {
      // Nobody there: one small bubble floats up and pops into a few droplets.
      ctx.save();
      if (p < .8) soap(ctx, e.x, e.y - p * 50, 10 + p * 4, 1, .3);
      burst(age - e.max * .8, 210, { n: 8, speed: [50, 110], life: .25, gravity: 300 }, (x, y, k) => {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#e6f4ff';
        dot(ctx, x, y, 2);
      }, e.x, e.y - 40);
      ctx.restore();
      return true;
    }
    case 'wide-appliance':
      appliance(ctx, e, images);
      return true;
    case 'wide-zone': {
      // The open kitchen (nobody caught): a soft lilac light on the floor where the accidents will reach, pulsing,
      // with a few sparkles lifting off it, so whoever is near can see where not to stand.
      const r = e.radius ?? 110;
      const fade = Math.min(1, age / .15, e.life / .2);
      ctx.save();
      ctx.save();
      ctx.translate(e.x, e.y - 3);
      ctx.scale(1, .2);
      ctx.globalAlpha = fade * (.45 + .15 * Math.sin(age * 8));
      glow(ctx, 0, 0, r * 1.15, '170,170,255');
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0, m = n(8); i < m; i++) {
        const q = cycle(age, .9, i, 260);
        ctx.globalAlpha = fade * Math.sin(q * Math.PI);
        ctx.fillStyle = GLITTER[i % 4];
        sparkle(ctx, e.x + (hash(i, 261) - .5) * r * 1.8, e.y - 6 - q * 60, 4);
      }
      ctx.restore();
      return true;
    }
    case 'wide-sparks': {
      // Microwave → them: a forked lightning bolt that keeps re-striking, and a river of embers along it.
      const tx = e.tx ?? dir * 96;
      const x0 = e.x, y0 = e.y - 60, x1 = e.x + tx, y1 = e.y - 100;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const on = 1 - span(p, .6, 1);
      const beat = Math.floor(age * 28);
      for (let i = 0; i < n(3); i++) {
        ctx.globalAlpha = on * (i ? .55 : 1);
        ctx.strokeStyle = ARC[i];
        ctx.lineWidth = i ? 2 : 3.5;
        bolt(ctx, x0, y0, x1 + (hash(beat, i + 210) - .5) * 30, y1 + (hash(beat, i + 211) - .5) * 40, beat * 3 + i, 16, 6);
      }
      // A glow where it strikes, and sparks streaming along the bolt, each drawn as a streak along its run.
      ctx.globalAlpha = on * .45;
      glow(ctx, x1, y1, 34 + Math.sin(age * 40) * 4, '200,230,255');
      const ux = (x1 - x0), uy = (y1 - y0), ul = Math.hypot(ux, uy) || 1;
      for (let i = 0, m = n(28); i < m; i++) {
        const k = cycle(age, 2.4, i, 212);
        const lane = (hash(i, 213) - .5) * 50;
        const x = x0 + ux * k, y = y0 + uy * k + lane * Math.sin(k * Math.PI) + k * k * 30;
        ctx.globalAlpha = on * (1 - k);
        ctx.strokeStyle = EMBER[i % 4];
        streak(ctx, x - ux / ul * 9, y - uy / ul * 9, x, y, 2);
      }
      ctx.restore();
      return true;
    }
    case 'wide-cold': {
      // Fridge → them: a blizzard — streaks, flakes and shards streaming in a wide cone, with mist behind.
      const tx = e.tx ?? dir * 96;
      const x0 = e.x, y0 = e.y - 110;
      const on = 1 - span(p, .65, 1);
      ctx.save();
      // A wall of cold mist rolling across, then wind streaks, snowflakes and fine snow riding it.
      for (let i = 0, m = n(10); i < m; i++) {
        const k = cycle(age, 1.6, i, 220);
        ctx.globalAlpha = on * .5 * Math.sin(k * Math.PI);
        glow(ctx, x0 + tx * k * 1.2, y0 + (hash(i, 221) - .5) * 100 * k + 30 * k, 22 + k * 26, '230,246,255');
      }
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffffff';
      for (let i = 0, m = n(42); i < m; i++) {
        const k = cycle(age, 2.8, i, 222);
        const lane = (hash(i, 223) - .5) * 2;
        const x = x0 + tx * k * (1.1 + hash(i, 224) * .3);
        const y = y0 + lane * 70 * k + Math.sin(age * 12 + i) * 4 + k * 40;
        ctx.globalAlpha = on * (1 - k * .6);
        if (i % 3 === 0) streak(ctx, x - tx * .14, y - 2, x, y, 1.4);
        else if (i % 3 === 1) snowflake(ctx, x, y, 4.5 + hash(i, 225) * 2.5, age * 5 + i, i % 2 ? '#ffffff' : '#c4e8ff');
        else {
          ctx.fillStyle = '#ffffff';
          dot(ctx, x, y, 1.6);
        }
      }
      ctx.restore();
      return true;
    }
    case 'wide-bubbles': {
      // Washer → them: a hose of suds, bubbles of every size tumbling along the arc and wobbling.
      const tx = e.tx ?? dir * 96;
      const x0 = e.x, y0 = e.y - 85;
      const on = 1 - span(p, .7, 1);
      ctx.save();
      for (let i = 0, m = n(34); i < m; i++) {
        const k = cycle(age, 2.2, i, 230);
        const lane = (hash(i, 231) - .5) * 60;
        const x = x0 + tx * k * 1.15;
        const y = y0 - Math.sin(k * Math.PI) * 50 + lane * k + k * 40;
        soap(ctx, x, y, (3 + hash(i, 232) * 12) * (1 + Math.sin(age * 14 + i) * .06), on * (1 - k * .4), hash(i, 233));
      }
      ctx.restore();
      return true;
    }
    case 'wide-foam': {
      // Suds well up round them, waist high: a mound of packed bubbles, shaded darker underneath, little ones
      // bubbling up off the top and popping.
      const t0 = e.t0 ?? 0;
      const grow = easeOut(span(age, t0, t0 + .35));
      if (grow <= 0) return true;
      ctx.save();
      ctx.globalAlpha = Math.min(1, e.life / .06);
      const m = n(46);
      for (let i = 0; i < m; i++) {
        const u = hash(i, 240) * 2 - 1;
        const x = e.x + u * 78;
        const crest = 104 * grow * (1 - u * u * .85);
        const y = e.y - 4 - hash(i, 241) * crest;
        const r = (8 + hash(i, 242) * 16) * grow * (1 + Math.sin(age * 5 + i) * .05);
        // Packed bubbles have a shaded body; the lower ones sit deeper in shadow.
        const deep = 1 - (e.y - y) / (crest + 1);
        soap(ctx, x, y, r, .75 + .25 * (1 - deep), hash(i, 243), true);
      }
      for (let i = 0, m2 = n(14); i < m2; i++) {
        const k = cycle(age, 1.3, i, 244);
        const x = e.x + (hash(i, 245) - .5) * 120;
        const y = e.y - 104 * grow - k * 60;
        if (k < .85) soap(ctx, x + Math.sin(age * 4 + i) * 5, y, 3 + hash(i, 246) * 5, 1 - k * .5, hash(i, 247));
        else {
          ctx.globalAlpha = (1 - (k - .85) / .15) * .9;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, 6 + (k - .85) * 40, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
      return true;
    }
    case 'wide-pop': {
      // The burst: a white flash, a storm of soap bubbles thrown outward, confetti in the status colours, and
      // one big star per status they carried going in, each trailing sparkles of its colour. e.n is the kind
      // mask (status.ts statusMask).
      const r = e.radius ?? 90;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.max(0, .85 * (1 - age / .16));
      glow(ctx, e.x, e.y, r * (1 + age * 5), '255,255,255');
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      burst(age, 250, { n: n(64), speed: [180, 560], life: .75, gravity: 260, drag: .25 }, (x, y, k, i) => {
        soap(ctx, x, y, (4 + hash(i, 251) * 16) * (1 - k * .5), 1 - k * k, hash(i, 252));
      }, e.x, e.y);
      // Paper confetti in the status colours, tumbling (the flip squeezes each strip as it turns over).
      burst(age, 253, { n: n(36), speed: [200, 520], life: .9, gravity: 420, drag: .3 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k * k;
        ctx.fillStyle = KIND_COLORS[i % 4];
        confetti(ctx, x + Math.sin(age * 9 + i) * 6 * k, y, 3.5, 2, i + age * 3, age * (10 + hash(i, 254) * 8) + i);
      }, e.x, e.y);
      const mask = e.n ?? 0;
      liveKinds.length = 0;
      for (let i = 0; i < KIND_COLORS.length; i++) if (mask & (1 << i)) liveKinds.push(KIND_COLORS[i]);
      const kinds = liveKinds;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < kinds.length; i++) {
        const a = -Math.PI / 2 + (i - (kinds.length - 1) / 2) * .6;
        const d = 30 + easeOut(p) * r * 1.3;
        const sx = e.x + Math.cos(a) * d, sy = e.y + Math.sin(a) * d;
        ctx.fillStyle = kinds[i];
        for (let j = 1; j <= 6; j++) {
          const dj = Math.max(0, d - j * 10);
          ctx.globalAlpha = (1 - p) * (1 - j / 7);
          sparkle(ctx, e.x + Math.cos(a) * dj, e.y + Math.sin(a) * dj, 4);
        }
        ctx.globalAlpha = 1 - span(p, .6, 1);
        sparkle(ctx, sx, sy, 22 * (1 - p * .3));
        ctx.fillStyle = '#ffffff';
        sparkle(ctx, sx, sy, 9);
      }
      ctx.restore();
      return true;
    }
  }
  return false;
}

