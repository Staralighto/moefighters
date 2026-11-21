import type { Effect, Projectile } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { MAYA_CONSOLE_SRC, MAYA_LEO_SRC } from './clips.ts';
import { TAU, burst, confetti, dot, glow, hash, sparkle, streak } from './fxParticles.ts';

/* 大和麻弥 — 她的标志是一道绿色声波 (#99DD88, 白芯). Every move is drawn from two shapes, so they read as one set:
   - the wave ribbon: a sine laid along a line with a smooth envelope, a green band and a thin pale core, crisp
     strokes rather than soft glows;
   - the EQ bars: a row of rounded bars with pale tips, the spectrum of whatever she is playing.
   Registers (the super opens on a ring of sound that shoves the stage clear, 'maya-repel'):
   - 双调怪笑: 呼嘿嘿 is a wave packet travelling at chest height whose crests tremble (goosebumps), led by one crisp
     crescent; 哦吼吼 is the same ribbon in pink, fanned three ways from the mouth with a few sparkles. The rooted
     shiver ('maya-shiver') is pale blue tremble strokes, a small trembling wave over the head and cold breath.
   - 器材宅讲座: the talk is a dense chattering ribbon from her mouth into their head; gear silhouettes (mic, XLR
     plug, knob, drum key, cable coil) orbit them on a green track ring and speed up; a small EQ flick on every
     tick; comic smoke puffs off the head at the end, and a slow wisp and a turning gear for the 沉默
     ('maya-gearhead').
   - 金毛惊魂: shock lines round her head; the bark is two jagged spikes of wave behind her; Leo (leo.png) gallops
     with dust; the pounce is paw prints, sparkles and dust puffs; Leo trots off; a sweat drop for the bow.
   - 幕后演出·全开: a flat dark wash; behind the bodies a stage-wide green wave and a floor-wide EQ that pump on
     every beat of 1-2-3-2-1; the console (console.png) with live meters and fader trails; the bass is a standing
     wave running the floor with the floor ribbon trailing back to the console; crisp moving-head beams from small
     fixtures in the rig; laser fans fired from the console deck; CO2 as flat comic cloud columns; a gold
     cold-spark curtain from a lit rig bar; confetti to close.
   Flat fills, strokes and cached stamps only, no shadowBlur. The stage wave samples about ten points a cycle
   (a full-width sine does not need a point every 8px) and the floor EQ is two fills, not one path per bar.
   The heaviest frame (the spark curtain over the stage wave) is about 120 small marks, stroked as two paths. */

export const MAYA_BACK: readonly string[] = ['maya-beam'];
export const MAYA_SCREEN_BACK: readonly string[] = ['maya-dim', 'maya-stagewave'];
export const MAYA_SCREEN_FRONT: readonly string[] = ['maya-confetti'];

const GREEN = '#99DD88';
const GREEN_DEEP = '#4f9a4a';
const GREEN_PALE = '#e2f8da';
const PINK = '#ffa8c8';
const PINK_PALE = '#ffe3ee';
const GOLD = '#ffd77a';
const GOLD_HOT = '#fff3c4';
const ICE = '#cfeeff';
const CLOUD = '#eef4fa';
const CLOUD_SHADE = '#c9d6e2';

const particleCount = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
/** Smooth hump, 0 at both ends and 1 in the middle. */
const hump = (k: number) => Math.sin(clamp(k, 0, 1) * Math.PI);

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

/* ---- the signature: wave ribbon and EQ bars ---- */

interface WaveSpec {
  /** Peak displacement, px. */
  amp: number;
  /** Full sine cycles along the line. */
  cycles: number;
  /** Phase, radians; scroll it with time to make the wave run. */
  phase: number;
  /** Envelope over k in [0, 1]. Default: a hump, tapering both ends. */
  env?: (k: number) => number;
  /** Extra per-point jitter (goosebumps / chatter), px, with its seed and clock. */
  jitter?: number;
  seed?: number;
  clock?: number;
  /** Band width and colour, then core width and colour (0 width skips the pass). */
  band: number; bandColor: string;
  core: number; coreColor: string;
}
/** The sound wave: a sine laid along (x0, y0) → (x1, y1). A green band, then a thin pale core over it. */
function waveRibbon(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: WaveSpec): void {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if (!(len > 2)) return;
  const nx = -dy / len, ny = dx / len;
  // Ten-plus samples a cycle stays smooth; len/5 put 120 points on the stage-wide wave for 6.5 cycles.
  const steps = clamp(Math.round(Math.min(len / 5, Math.max(14, w.cycles * 12))), 14, 120);
  const env = w.env ?? hump;
  const jitter = w.jitter ?? 0, seed = w.seed ?? 0, clock = w.clock ?? 0;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    let off = Math.sin(k * w.cycles * TAU + w.phase) * w.amp * env(k);
    if (jitter) off += Math.sin(clock * 55 + i * 2.3 + seed) * jitter * env(k) * (i % 2 ? 1 : -1);
    const px = x0 + dx * k + nx * off, py = y0 + dy * k + ny * off;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (w.band > 0) {
    ctx.strokeStyle = w.bandColor;
    ctx.lineWidth = w.band;
    ctx.stroke();
  }
  if (w.core > 0) {
    ctx.strokeStyle = w.coreColor;
    ctx.lineWidth = w.core;
    ctx.stroke();
  }
}

/** A rounded EQ bar standing on y, h tall, with a pale tip. */
function eqBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, body: string, tip: string): void {
  if (!(h > 1) || !(w > 1)) return;
  const r = Math.min(w / 2, 4, h / 2);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(x, y - h, w, h, [r, r, 0, 0]);
  ctx.fill();
  ctx.fillStyle = tip;
  ctx.fillRect(x + 1, y - h + 1, Math.max(0, w - 2), Math.min(3, h - 1));
}

/** Beat strength by beats played: the wave, then 1-2-3-2-1 grows to the lasers and falls back, the sparks hit hardest. */
function beatPower(n: number): number {
  if (n <= 1) return .7;
  if (n <= 3) return .85;
  if (n <= 6) return 1;
  if (n <= 8) return .85;
  return 1.35;
}

/* ---- small shapes ---- */

/** Gear silhouettes, about s px tall, in the current fillStyle / strokeStyle. */
function gearIcon(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, s: number, rot: number): void {
  if (!(s > 1)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const k = s / 20;
  ctx.scale(k, k);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  switch (kind % 5) {
    case 0: // microphone: a round head on a stick
      ctx.beginPath(); ctx.ellipse(0, -5, 5.5, 7, 0, 0, TAU); ctx.fill();
      ctx.fillRect(-1.6, 1, 3.2, 10);
      break;
    case 1: // XLR plug: a barrel with three pins
      ctx.fillRect(-5, -2, 10, 12);
      ctx.fillRect(-3.6, -7, 2, 5); ctx.fillRect(-1, -8, 2, 6); ctx.fillRect(1.6, -7, 2, 5);
      break;
    case 2: { // knob: a round cap with a pointer notch
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
      const fill = ctx.fillStyle;
      ctx.fillStyle = 'rgba(20,30,20,.55)';
      ctx.fillRect(-1.2, -8, 2.4, 6);
      ctx.fillStyle = fill;
      break;
    }
    case 3: // drum key: a T
      ctx.fillRect(-8, -7, 16, 4);
      ctx.fillRect(-2, -5, 4, 13);
      break;
    default: // cable coil: two loops
      ctx.beginPath(); ctx.arc(-3, 0, 5.5, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(3.5, 1, 5.5, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

/** A sweat drop with a highlight. */
function sweat(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (!(r > 1)) return;
  ctx.fillStyle = '#bfe6ff';
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.7);
  ctx.quadraticCurveTo(x + r * 1.1, y - r * .2, x, y + r);
  ctx.quadraticCurveTo(x - r * 1.1, y - r * .2, x, y - r * 1.7);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  dot(ctx, x - r * .3, y - r * .1, r * .28);
}

/** A paw print: one pad and four toes. */
function paw(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (!(r > 1)) return;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * .8, 0, 0, TAU); ctx.fill();
  for (let i = 0; i < 4; i++) dot(ctx, x + (i - 1.5) * r * .62, y - r * 1.05 - (i === 1 || i === 2 ? r * .25 : 0), r * .34);
}

/** A comic cloud puff: overlapping lobes in one flat fill over a shaded underside, a lit spot on top. */
function puff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number): void {
  if (!(r > 1)) return;
  const lobes = 5;
  ctx.fillStyle = CLOUD_SHADE;
  for (let i = 0; i < lobes; i++) {
    const a = i / lobes * TAU + seed;
    dot(ctx, x + Math.cos(a) * r * .55, y + Math.sin(a) * r * .35 + r * .12, r * (.5 + hash(i, seed * 7) * .2));
  }
  ctx.fillStyle = CLOUD;
  for (let i = 0; i < lobes; i++) {
    const a = i / lobes * TAU + seed;
    dot(ctx, x + Math.cos(a) * r * .5, y + Math.sin(a) * r * .3 - r * .04, r * (.46 + hash(i, seed * 7) * .2));
  }
  ctx.fillStyle = '#ffffff';
  dot(ctx, x - r * .2, y - r * .32, r * .22);
}

/** A star of crisp spikes: the flare where a laser leaves the deck or crosses a body. */
function flare(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  if (!(r > 1)) return;
  ctx.strokeStyle = color;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 4;
    const l = i % 2 ? r * .55 : r;
    streak(ctx, x - Math.cos(a) * l, y - Math.sin(a) * l, x + Math.cos(a) * l, y + Math.sin(a) * l, i % 2 ? 2 : 3);
  }
  ctx.fillStyle = '#ffffff';
  dot(ctx, x, y, r * .18);
}

/** Leo from leo.png (256 × 256, facing right, feet on the bottom 12 px), h px tall at the feet x, y. */
function drawLeo(ctx: CanvasRenderingContext2D, im: HTMLImageElement | undefined, x: number, y: number, h: number, dir: number, clock: number): void {
  ctx.save();
  // A gallop: the body rocks and bobs, the feet stay on the floor line.
  const bob = Math.abs(Math.sin(clock * 16)) * 7;
  ctx.translate(x, y - bob);
  ctx.rotate(Math.sin(clock * 16) * .06);
  ctx.scale(dir, 1);
  if (im) {
    const s = h / (256 - 12);
    ctx.drawImage(im, -128 * s, -(256 - 12) * s, 256 * s, 256 * s);
  } else {
    ctx.fillStyle = '#e0a64a';
    ctx.beginPath(); ctx.ellipse(-6, -h * .42, h * .42, h * .24, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(h * .36, -h * .62, h * .18, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/* ---- status looks ---- */

/** 'maya-shiver' (定身 from 呼嘿嘿): pale blue tremble strokes either side of the body, a small trembling wave over
 *  the head (her laugh still in their ears) and a little cold breath. */
export function auraMayaShiver(ctx: CanvasRenderingContext2D, f: Fighter, h: number, _left: number, t: number): void {
  ctx.save();
  ctx.strokeStyle = ICE;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const y = f.y - h * (.35 + i * .2);
      const jx = Math.sin(t * 70 + i * 2 + side) * 2.5;
      const x = f.x + side * (30 + i * 4) + jx;
      ctx.globalAlpha = .55 + .35 * Math.sin(t * 9 + i);
      ctx.beginPath();
      ctx.moveTo(x, y - 9);
      ctx.lineTo(x + side * 5, y - 3);
      ctx.lineTo(x, y + 3);
      ctx.lineTo(x + side * 5, y + 9);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = .85;
  waveRibbon(ctx, f.x - 26, f.y - h - 20, f.x + 26, f.y - h - 20, {
    amp: 5, cycles: 3, phase: -t * 18, jitter: 1.6, clock: t, seed: 3,
    band: 4, bandColor: 'rgba(153,221,136,.7)', core: 1.5, coreColor: GREEN_PALE,
  });
  for (let i = 0; i < 2; i++) {
    const k = (t * .9 + i * .5) % 1;
    ctx.globalAlpha = (1 - k) * .4;
    glow(ctx, f.x + f.facing * 14 + k * f.facing * 12, f.y - h * .86 - k * 26, 6 + k * 7, '230,246,255');
  }
  ctx.restore();
}
export function applyMayaShiver(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  const k = ease(age / .25);
  ctx.globalAlpha = (1 - span(age, .1, .5)) * .85;
  ctx.strokeStyle = ICE;
  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    const r0 = 40 + 40 * k, r1 = r0 + 14;
    streak(ctx, e.x + Math.cos(a) * r0, e.y - 100 + Math.sin(a) * r0 * 1.3, e.x + Math.cos(a) * r1, e.y - 100 + Math.sin(a) * r1 * 1.3, 3);
  }
  ctx.restore();
}

/** 'maya-gearhead' (沉默 from 器材宅讲座): a slow smoke wisp and one gear turning over the head. */
export function auraMayaGearhead(ctx: CanvasRenderingContext2D, f: Fighter, h: number, _left: number, t: number): void {
  ctx.save();
  const x = f.x, y = f.y - h - 18;
  for (let i = 0; i < 3; i++) {
    const k = (t * .6 + i / 3) % 1;
    ctx.globalAlpha = Math.sin(k * Math.PI) * .7;
    puff(ctx, x + Math.sin(k * 6 + i) * 8, y - k * 36, 5 + k * 6, i + 2);
  }
  ctx.globalAlpha = .85;
  ctx.fillStyle = '#c9d6c4';
  ctx.strokeStyle = '#c9d6c4';
  gearIcon(ctx, 2 + (Math.floor(t * 1.2) % 2), x + 16, y + 4, 14, t * 1.6);
  ctx.restore();
}
export function applyMayaGearhead(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  burst(age, 211, { n: 7, speed: [60, 140], life: .6, gravity: -60, drag: .4 }, (x, y, q, i) => {
    ctx.globalAlpha = (1 - q) * .85;
    puff(ctx, x, y, 7 * (1 + q * .6), i + 4);
  }, e.x, e.y - 200);
  ctx.restore();
}

/* ---- shots ---- */

export function drawMayaShot(ctx: CanvasRenderingContext2D, p: Projectile, images?: ImageCache, liteFx = false): boolean {
  if (p.fx === 'maya-laugh') {
    // 呼嘿嘿: a wave packet at chest height, its crests trembling, led by one crisp crescent.
    const dir = Math.sign(p.vx) || 1;
    const t = p.age;
    const fade = Math.min(1, p.life / .15) * Math.min(1, t / .06);
    const tail = 70 + Math.min(1, t / .25) * 110;
    const env = (k: number) => hump(k) ** .8 * (.4 + .6 * k);
    ctx.save();
    ctx.globalAlpha = fade;
    // A wide quiet echo first, then the wave itself.
    waveRibbon(ctx, p.x - dir * tail, p.y, p.x + dir * 6, p.y, {
      amp: 30, cycles: 3.2, phase: -t * 28 + .9, env,
      band: 12, bandColor: 'rgba(153,221,136,.22)', core: 0, coreColor: '',
    });
    waveRibbon(ctx, p.x - dir * tail, p.y, p.x + dir * 6, p.y, {
      amp: 24, cycles: 3.2, phase: -t * 28, env, jitter: 2.4, clock: t, seed: 1,
      band: 7, bandColor: GREEN_DEEP, core: 3, coreColor: GREEN_PALE,
    });
    // The leading crescent: band and core, no glow.
    ctx.lineCap = 'round';
    for (const [w, c] of [[7, GREEN], [2.5, '#ffffff']] as const) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.ellipse(p.x + dir * 4, p.y, 14, 34, 0, dir > 0 ? -1.15 : Math.PI - 1.15, dir > 0 ? 1.15 : Math.PI + 1.15);
      ctx.stroke();
    }
    // Goosebump flecks shaken off behind.
    const n = particleCount(6, liteFx);
    ctx.fillStyle = GREEN_PALE;
    for (let i = 0; i < n; i++) {
      const k = (t * 3 + i / n) % 1;
      ctx.globalAlpha = (1 - k) * .75 * fade;
      dot(ctx, p.x - dir * (24 + k * tail * .8), p.y + (hash(i, 7) - .5) * 64, 2.2);
    }
    ctx.restore();
    return true;
  }
  if (p.fx === 'maya-leo-dog') {
    const dir = Math.sign(p.vx) || 1;
    ctx.save();
    const n = particleCount(5, liteFx);
    for (let i = 0; i < n; i++) {
      const k = (p.age * 4 + i / n) % 1;
      ctx.globalAlpha = (1 - k) * .85;
      puff(ctx, p.x - dir * (40 + k * 50), FLOOR - 8 - k * 12, 5 + k * 6, i + 20);
    }
    ctx.globalAlpha = Math.min(1, p.life / .15, p.age / .05);
    drawLeo(ctx, image(images, MAYA_LEO_SRC), p.x, FLOOR, 104, dir, p.age);
    ctx.restore();
    return true;
  }
  return false;
}

/* ---- effects ---- */

export function drawMayaFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('maya-') || e.type.includes('@')) return false;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (e.type) {
    /* ---- U ---- */
    case 'maya-glint': {
      // The lens flashes: a sparkle and a short diagonal shine across the glasses.
      const k = ease(el / .12);
      ctx.globalAlpha = 1 - span(el, .12, e.max);
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x + dir * 8, e.y - 4, 14 * k);
      ctx.strokeStyle = '#ffffff';
      streak(ctx, e.x - dir * 10, e.y + 6, e.x + dir * 4, e.y - 8, 3);
      break;
    }
    case 'maya-ohoho': {
      // 哦吼吼: the same wave in pink, fanned three ways from the mouth, a few sparkles blown along.
      const reach = (e.radius ?? 210) * ease(el / .16);
      const fade = 1 - span(el, .22, e.max);
      ctx.globalAlpha = fade;
      for (let i = 0; i < 3; i++) {
        const a = (i - 1) * .3;
        const x1 = e.x + dir * Math.cos(a) * reach, y1 = e.y + Math.sin(a) * reach * .8;
        waveRibbon(ctx, e.x, e.y, x1, y1, {
          amp: 9 - Math.abs(i - 1) * 2, cycles: 3.5, phase: -el * 30 + i, env: k => hump(k) ** .6 * (.3 + .7 * k),
          band: 6, bandColor: i === 1 ? PINK : 'rgba(255,168,200,.7)', core: 2, coreColor: PINK_PALE,
        });
      }
      burst(el, 31, { n: particleCount(10, liteFx), speed: [180, 360], life: .55, angle: dir > 0 ? 0 : Math.PI, spread: 1, drag: .3 }, (x, y, q, i) => {
        ctx.globalAlpha = (1 - q) * fade;
        ctx.fillStyle = i % 3 ? PINK : '#ffffff';
        if (i % 3) dot(ctx, x, y, 3 * (1 - q * .5)); else sparkle(ctx, x, y, 9 * (1 - q * .5));
      }, e.x, e.y);
      break;
    }

    /* ---- I ---- */
    case 'maya-orbit': {
      // Gear silhouettes on a tilted green track ring round the head, turning faster as the talk runs on.
      const fade = Math.min(1, e.life / .15, el / .15);
      const turn = el * (2.2 + el * 1.6);
      const n = 5;
      // The back half of the track and the icons behind it, then the front half and the icons in front.
      for (const front of [false, true]) {
        ctx.globalAlpha = fade * (front ? .75 : .35);
        ctx.strokeStyle = GREEN;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, 46, 14, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
        ctx.stroke();
        for (let i = 0; i < n; i++) {
          const a = turn + i * TAU / n;
          if ((Math.sin(a) > 0) !== front) continue;
          ctx.globalAlpha = fade * (front ? 1 : .55);
          ctx.fillStyle = front ? GREEN_PALE : GREEN;
          ctx.strokeStyle = ctx.fillStyle;
          gearIcon(ctx, i, e.x + Math.cos(a) * 46, e.y + Math.sin(a) * 14, front ? 18 : 14, Math.sin(a + el * 3) * .4);
        }
      }
      break;
    }
    case 'maya-chatter': {
      // Talk at full speed: a dense chattering wave from her mouth into their head.
      const fade = Math.min(1, e.life / .15, el / .1);
      const tx = e.tx ?? dir * 40, ty = e.ty ?? 0;
      ctx.globalAlpha = fade;
      waveRibbon(ctx, e.x, e.y, e.x + tx, e.y + ty, {
        amp: 7 + 3 * Math.sin(el * 9), cycles: 5, phase: -el * 40, env: k => hump(k) ** .5, jitter: 2.5, clock: el, seed: 5,
        band: 5, bandColor: GREEN, core: 1.8, coreColor: '#ffffff',
      });
      break;
    }
    case 'maya-sparkle-eyes': {
      const fade = Math.min(1, e.life / .15, el / .1);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 2; i++) {
        const s = 7 + 3 * Math.sin(el * 14 + i * 2);
        ctx.globalAlpha = fade;
        sparkle(ctx, e.x + dir * (i ? 10 : -4), e.y - 2, s);
      }
      break;
    }
    case 'maya-tick': {
      // Every point she makes: a small EQ flick over their head.
      const fade = 1 - t;
      for (let i = 0; i < 5; i++) {
        const h = (6 + hash(i, (e.n ?? 0) + 40) * 18) * hump(span(el, i * .02, .25 + i * .02));
        ctx.globalAlpha = fade;
        eqBar(ctx, e.x - 16 + i * 7, e.y + 8, 5, h, GREEN, GREEN_PALE);
      }
      break;
    }
    case 'maya-steam': {
      // Over-heated: comic smoke puffs rising off the head.
      for (let i = 0; i < particleCount(6, liteFx); i++) {
        const k = clamp((el - i * .07) / .8, 0, 1);
        if (k <= 0) continue;
        ctx.globalAlpha = Math.sin(k * Math.PI) * .85;
        puff(ctx, e.x + (hash(i, 3) - .5) * 30 + Math.sin(k * 5 + i) * 6, e.y - 6 - k * 50, 8 + k * 9, i + 1);
      }
      break;
    }

    /* ---- O ---- */
    case 'maya-startle': {
      // ビクッ: manga shock lines flung out round the head.
      const k = ease(el / .1);
      ctx.globalAlpha = 1 - span(el, .2, e.max);
      ctx.strokeStyle = '#ffffff';
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * .42;
        const r0 = 26 + k * 10, r1 = r0 + 14 + k * 8;
        streak(ctx, e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0, e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1, 4);
      }
      break;
    }
    case 'maya-bark': {
      // 汪！ Two jagged spikes of wave thrown out behind her.
      const k = ease(el / .2);
      ctx.globalAlpha = 1 - span(el, .15, e.max);
      for (let i = 0; i < 2; i++) {
        const a = i ? -.35 : .25;
        const len = 30 + 60 * k;
        waveRibbon(ctx, e.x, e.y, e.x - dir * Math.cos(a) * len, e.y + Math.sin(a) * len, {
          amp: 8, cycles: 3, phase: el * 30, env: q => (1 - q) * .4 + q * .9,
          band: 5, bandColor: '#ffd59a', core: 1.8, coreColor: '#ffffff',
        });
      }
      break;
    }
    case 'maya-pounce': {
      ctx.fillStyle = '#ffd59a';
      for (let i = 0; i < 3; i++) {
        const k = span(el, i * .05, i * .05 + .1);
        if (k <= 0) continue;
        ctx.globalAlpha = (1 - t) * k;
        paw(ctx, e.x + dir * (i - 1) * 26, e.y - 20 - i * 10, 7);
      }
      burst(el, 44, { n: particleCount(8, liteFx), speed: [120, 260], life: .45, gravity: 300, drag: .4, angle: -Math.PI / 2, spread: 2.4 }, (x, y, q) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = '#ffffff';
        sparkle(ctx, x, y, 7 * (1 - q * .5));
      }, e.x, e.y);
      ctx.globalAlpha = (1 - t) * .9;
      for (let i = 0; i < 3; i++) puff(ctx, e.x + (i - 1) * 22, FLOOR - 10 - span(el, 0, .4) * 8, 10 + t * 8, i + 9);
      break;
    }
    case 'maya-leo-off': {
      // Leo keeps going, tail up, and trots off the stage.
      const x = e.x + dir * 520 * el;
      ctx.globalAlpha = Math.min(1, e.life / .25);
      drawLeo(ctx, image(images, MAYA_LEO_SRC), x, FLOOR, 104, dir, el + 1);
      break;
    }
    case 'maya-sweat': {
      const k = ease(el / .15);
      ctx.globalAlpha = Math.min(1, e.life / .15);
      sweat(ctx, e.x + dir * 4, e.y + el * 12, 7 * k);
      break;
    }

    /* ---- L ---- */
    case 'maya-dim': {
      // The house lights go down: one flat dark wash, under the bodies.
      const a = Math.min(.55, el / .3 * .55) * Math.min(1, e.life / .3);
      ctx.fillStyle = `rgba(5,8,10,${a})`;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'maya-stagewave': {
      // The show's heartbeat, behind the bodies: a stage-wide green wave and a floor-wide EQ that pump on every beat.
      const fade = Math.min(1, el / .3, e.life / .3);
      const beats = e.n ?? 0;
      const since = e.age ?? 9;
      const pulse = beats > 0 ? Math.exp(-since * 4.5) * beatPower(beats) : 0;
      const idle = beats > 0 ? .35 : .15;
      const yMid = FLOOR - 190;
      const env = (k: number) => .35 + .65 * hump(k);
      ctx.globalAlpha = fade * .55;
      waveRibbon(ctx, -20, yMid, W + 20, yMid, {
        amp: 10 + 70 * pulse + 6 * idle, cycles: 6.5, phase: -el * 3.2 + 1.2, env,
        band: 16, bandColor: 'rgba(153,221,136,.35)', core: 0, coreColor: '',
      });
      ctx.globalAlpha = fade * .85;
      waveRibbon(ctx, -20, yMid, W + 20, yMid, {
        amp: 6 + 52 * pulse + 4 * idle, cycles: 6.5, phase: -el * 3.2, env,
        band: 6, bandColor: GREEN, core: 2, coreColor: GREEN_PALE,
      });
      // EQ along the floor, across the whole stage: one fill for the bodies, one for the tips.
      const bars = liteFx ? 24 : 40;
      const bw = W / bars;
      const levelAt = (i: number) => .18 * idle + .5 * (.5 + .5 * Math.sin(el * (5 + (i % 5)) + i * 1.7)) * (idle + pulse) + .55 * pulse * hash(i, beats + 11);
      ctx.globalAlpha = fade * .55;
      ctx.fillStyle = GREEN_DEEP;
      ctx.beginPath();
      for (let i = 0; i < bars; i++) {
        const h = 10 + levelAt(i) * 120;
        const x = i * bw + bw * .18, bar = bw * .64;
        const r = Math.min(bar / 2, 4, h / 2);
        ctx.roundRect(x, FLOOR + 2 - h, bar, h, [r, r, 0, 0]);
      }
      ctx.fill();
      ctx.fillStyle = GREEN_PALE;
      ctx.beginPath();
      for (let i = 0; i < bars; i++) {
        const h = 10 + levelAt(i) * 120;
        const x = i * bw + bw * .18, bar = bw * .64;
        ctx.rect(x + 1, FLOOR + 3 - h, Math.max(0, bar - 2), Math.min(3, h - 1));
      }
      ctx.fill();
      break;
    }
    case 'maya-console': {
      const im = image(images, MAYA_CONSOLE_SRC);
      const w = 190, h = w * 256 / 384;
      const live = (e.n ?? 0) > 0;
      ctx.globalAlpha = Math.min(1, el / .12, e.life / .2);
      if (im) ctx.drawImage(im, e.x - w / 2, FLOOR - h, w, h);
      else {
        ctx.fillStyle = '#2a2e36';
        ctx.fillRect(e.x - w / 2, FLOOR - h * .55, w, h * .55);
      }
      // Level meters jumping on the deck.
      if (live) {
        for (let i = 0; i < 10; i++) {
          const lvl = .3 + .7 * Math.abs(Math.sin(el * (7 + i) + i * 1.3));
          eqBar(ctx, e.x - w * .38 + i * w * .085, FLOOR - h * .56, 5, lvl * 22, lvl > .85 ? GOLD : GREEN, '#ffffff');
        }
      }
      break;
    }
    case 'maya-repel': {
      // The thump that clears the stage: a ring of sound bursting out of her, its rim a wave, a fainter echo behind.
      const R = e.radius ?? 240;
      const fade = 1 - span(el, .2, e.max);
      for (let j = 0; j < 2; j++) {
        const k = ease(span(el, j * .06, .3 + j * .06));
        if (k <= 0) continue;
        const r = 30 + (R - 30) * k;
        ctx.globalAlpha = fade * (j ? .4 : 1);
        ctx.beginPath();
        const steps = 72;
        for (let i = 0; i <= steps; i++) {
          const a = i / steps * TAU;
          const rr = r + Math.sin(a * 12 + el * 30) * (9 - j * 3) * (1 - k * .5);
          const px = e.x + Math.cos(a) * rr, py = e.y + Math.sin(a) * rr * .62;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = GREEN;
        ctx.lineWidth = j ? 4 : 7;
        ctx.stroke();
        if (!j) {
          ctx.strokeStyle = GREEN_PALE;
          ctx.lineWidth = 2.2;
          ctx.stroke();
        }
      }
      ctx.fillStyle = GREEN_PALE;
      burst(el, 90, { n: particleCount(12, liteFx), speed: [300, 520], life: .4, drag: .2 }, (x, y, q) => {
        ctx.globalAlpha = (1 - q) * fade;
        dot(ctx, x, e.y + (y - e.y) * .62, 2.4);
      }, e.x, e.y);
      break;
    }
    case 'maya-faders': {
      // The faders go up: thin trails racing up off the deck, a sparkle as they hit the top.
      ctx.strokeStyle = GREEN_PALE;
      for (let i = 0; i < 5; i++) {
        const k = ease(span(el, i * .03, i * .03 + .25));
        const x = e.x - 60 + i * 30;
        ctx.globalAlpha = (1 - t) * .9;
        streak(ctx, x, FLOOR - 80, x, FLOOR - 80 - k * 120, 3);
      }
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x, FLOOR - 110, 20 * ease(el / .1));
      break;
    }
    case 'maya-bass': {
      // The bass: a standing wave running along the floor, with the floor ribbon trailing back to the console.
      const front = e.x + dir * 950 * el;
      const fade = Math.min(1, e.life / .2);
      ctx.globalAlpha = fade;
      waveRibbon(ctx, e.x, FLOOR - 8, front, FLOOR - 8, {
        amp: 12, cycles: Math.max(1, Math.abs(front - e.x) / 70), phase: -el * 40, env: k => k ** 1.5,
        band: 6, bandColor: GREEN, core: 2, coreColor: GREEN_PALE,
      });
      waveRibbon(ctx, front, FLOOR, front, FLOOR - 170, {
        amp: 16, cycles: 2.5, phase: el * 50, env: k => hump(k) ** .7,
        band: 9, bandColor: GREEN, core: 3, coreColor: '#ffffff',
      });
      // A few EQ bars kicked up behind the front, and crisp flecks.
      for (let i = 0; i < 4; i++) {
        const h = 14 + 40 * hash(i, Math.floor(el * 20));
        eqBar(ctx, front - dir * (14 + i * 11) - 4, FLOOR, 7, h * (1 - i * .2), GREEN_DEEP, GREEN_PALE);
      }
      ctx.fillStyle = GREEN_PALE;
      for (let i = 0; i < particleCount(6, liteFx); i++) {
        const k = (el * 5 + i / 6) % 1;
        ctx.globalAlpha = (1 - k) * .8 * fade;
        dot(ctx, front - dir * k * 60, FLOOR - 6 - k * 40 * hash(i, 2), 2.2);
      }
      break;
    }
    case 'maya-beam': {
      // A moving-head beam from a small fixture in the rig, swinging in to cross on the target. The cone ends on
      // the floor in a lit ellipse: its sides run to the ellipse's ends and its bottom edge is the ellipse's near
      // half, so the light reads as landing on the stage rather than being cut off flat.
      const side = (e.n ?? 0) ? 1 : -1;
      const x0 = clamp(e.x + side * 360, 30, W - 30), y0 = 34;
      const k = ease(el / .18);
      const tx = e.x + side * 150 * (1 - k);
      const a = 1 - span(el, .28, e.max);
      const rx = 58, ry = 13, fy = FLOOR - 2, mouth = 7;
      // The far half of the pool sits behind the cone.
      ctx.globalAlpha = a * .35;
      ctx.fillStyle = GREEN_PALE;
      ctx.beginPath(); ctx.ellipse(tx, fy, rx, ry, 0, Math.PI, TAU); ctx.fill();
      // The cone, brighter at the lens and still bright where it lands.
      const g = ctx.createLinearGradient(x0, y0, tx, fy);
      g.addColorStop(0, `rgba(244,255,240,${.62 * a})`);
      g.addColorStop(.6, `rgba(214,250,204,${.24 * a})`);
      g.addColorStop(1, `rgba(214,250,204,${.34 * a})`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0 - mouth, y0);
      ctx.lineTo(tx - rx, fy);
      ctx.ellipse(tx, fy, rx, ry, 0, Math.PI, 0, true);
      ctx.lineTo(x0 + mouth, y0);
      ctx.closePath();
      ctx.fill();
      // Crisp edges down to the pool's ends.
      ctx.globalAlpha = a * .8;
      ctx.strokeStyle = GREEN_PALE;
      streak(ctx, x0 - mouth, y0, tx - rx, fy, 1.5);
      streak(ctx, x0 + mouth, y0, tx + rx, fy, 1.5);
      // The pool: a brighter inner ellipse and a lit near rim where the light meets the floor.
      ctx.globalAlpha = a * .5;
      ctx.fillStyle = '#f4fff0';
      ctx.beginPath(); ctx.ellipse(tx, fy, rx * .62, ry * .6, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = a * .9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(tx, fy, rx, ry, 0, .15, Math.PI - .15); ctx.stroke();
      ctx.globalAlpha = a * .4;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(tx, fy, rx, ry, 0, Math.PI + .15, TAU - .15); ctx.stroke();
      // The fixture: a head with a lit lens, tilted down the beam, hung from a short bar.
      ctx.globalAlpha = Math.min(1, el / .08, e.life / .2);
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(x0 - 16, 6, 32, 6);
      ctx.save();
      ctx.translate(x0, y0);
      ctx.rotate(Math.atan2(fy - y0, tx - x0) - Math.PI / 2);
      ctx.fillStyle = '#2a2e36';
      ctx.fillRect(-12, -20, 24, 22);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 2, 8, 0, TAU); ctx.fill();
      ctx.restore();
      break;
    }
    case 'maya-laser': {
      // A laser fan fired from the console deck: five crisp lines through the target and on across the stage,
      // the fan sweeping as it fires, a star flare at the deck and where it crosses them.
      const n = e.n ?? 0;
      const ox = e.x + (e.tx ?? -dir * 300), oy = e.y + (e.ty ?? 0);
      const col = n === 1 ? '#7ff0dc' : n === 2 ? '#c8ff78' : GREEN;
      const fade = 1 - span(el, .22, e.max);
      const on = ease(el / .06);
      const base = Math.atan2(e.y - oy, e.x - ox);
      const sweep = (span(el, 0, e.max) - .5) * .16;
      const reach = Math.hypot(W, H);
      for (let i = 0; i < 5; i++) {
        const a = base + sweep + (i - 2) * .045;
        const x1 = ox + Math.cos(a) * reach * on, y1 = oy + Math.sin(a) * reach * on;
        ctx.globalAlpha = fade * (i === 2 ? 1 : .55);
        ctx.strokeStyle = col;
        streak(ctx, ox, oy, x1, y1, i === 2 ? 5 : 2.5);
        if (i === 2) {
          ctx.strokeStyle = '#ffffff';
          streak(ctx, ox, oy, x1, y1, 1.6);
        }
      }
      ctx.globalAlpha = fade;
      flare(ctx, ox, oy, 12, '#ffffff');
      if (on > .9) flare(ctx, e.x, e.y, 26 * (1 - span(el, .05, e.max) * .5), col);
      break;
    }
    case 'maya-co2': {
      // A CO2 jet: flat comic cloud puffs blasting up out of the floor and rolling out at the top.
      const n = particleCount(8, liteFx);
      const up = ease(el / .22);
      const out = 1 - span(el, .45, e.max);
      for (let i = n - 1; i >= 0; i--) {
        const q = i / Math.max(1, n - 1);
        const y = FLOOR - 10 - q * 280 * up;
        const r = 14 + q * 22 + span(el, .25, e.max) * 14;
        ctx.globalAlpha = out * (.95 - q * .25);
        puff(ctx, e.x + Math.sin(i * 1.7 + el * 6) * (4 + q * 14), y, r, i + (e.n ?? 0) * 13);
      }
      ctx.fillStyle = '#ffffff';
      burst(el, 70 + (e.n ?? 0), { n: particleCount(8, liteFx), speed: [80, 200], life: .7, angle: -Math.PI / 2, spread: 1.6, drag: .3, gravity: -40 }, (x, y, q) => {
        ctx.globalAlpha = (1 - q) * .8;
        dot(ctx, x, y, 2.2);
      }, e.x, FLOOR - 280 * up);
      break;
    }
    case 'maya-spark': {
      // 冷焰火: a curtain of gold sparks pouring off a lit rig bar over the target, a crisp splash on the floor.
      const w = 150;
      const n = particleCount(46, liteFx);
      const pour = span(el, 0, .25);
      ctx.globalAlpha = (1 - span(el, .9, e.max)) * .95;
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(e.x - w - 8, 14, (w + 8) * 2, 8);
      ctx.fillStyle = GOLD_HOT;
      ctx.fillRect(e.x - w, 22, w * 2 * pour, 3);
      // One stroke per colour, not one per spark.
      ctx.lineWidth = 2.2;
      ctx.globalAlpha = (1 - span(el, 1, e.max)) * .95;
      for (let hot = 0; hot < 2; hot++) {
        ctx.beginPath();
        ctx.strokeStyle = hot ? GOLD_HOT : GOLD;
        let any = false;
        for (let i = 0; i < n; i++) {
          if ((i % 4 === 0) !== !!hot) continue;
          const x = e.x - w + (hash(i, 9) * 2) * w * pour;
          const speed = 700 + hash(i, 10) * 500;
          const y = 24 + (el - hash(i, 11) * .5) * speed;
          if (y < 24 || y > FLOOR + 6) continue;
          ctx.moveTo(x, y - 22);
          ctx.lineTo(x, y);
          any = true;
        }
        if (any) ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < n; i++) {
        const x = e.x - w + (hash(i, 9) * 2) * w * pour;
        const y = 24 + (el - hash(i, 11) * .5) * (700 + hash(i, 10) * 500);
        if (y < 24 || y > FLOOR + 6) continue;
        dot(ctx, x, y, 1.6);
      }
      burst(el - .15, 63, { n: particleCount(16, liteFx), speed: [140, 320], life: .6, gravity: 700, angle: -Math.PI / 2, spread: 2.6, drag: .5 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i % 2 ? GOLD : '#ffffff';
        dot(ctx, x, y, 2.4);
      }, e.x, FLOOR - 4);
      ctx.globalAlpha = 1 - span(el, .3, e.max);
      flare(ctx, e.x, FLOOR - 40, 44 * ease(span(el, .12, .3)), GOLD_HOT);
      break;
    }
    case 'maya-confetti': {
      // Confetti to close: paper in green, white, pink, gold and pale blue drifting down over the stage.
      const cols = [GREEN, '#ffffff', PINK, GOLD, '#bfe6ff'];
      const n = particleCount(36, liteFx);
      for (let i = 0; i < n; i++) {
        const x = hash(i, 21) * W + Math.sin(el * 2 + i) * 20;
        const y = -20 + (el - hash(i, 22) * .4) * (120 + hash(i, 23) * 90);
        if (y < -20) continue;
        ctx.globalAlpha = Math.min(1, e.life / .4);
        ctx.fillStyle = cols[i % cols.length];
        confetti(ctx, x, y, 5, 3, el * 3 + i, el * 7 + i);
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
