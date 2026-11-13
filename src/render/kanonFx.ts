import type { Effect, Projectile } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { SEA_BIG_Y, SEA_TOP, STEPS, TRAIL, WANDER, fueeGlyph, wanderAt } from '../game/kanonPath.ts';
import { TAU, burst, cycle, dot, glow, hash, sparkle, stampText } from './fxParticles.ts';

/* 松原花音 — 水色、泡泡、水母光。Three registers, kept apart so each move reads at a glance:
   - lost: a trail of small blue footprints curling round on the floor, a 「？」 map pin bobbing over her head,
     and a little 「呼诶？」 bubble where she ends up (十米迷路; the 'kanon-maze' 混乱 look reuses the footprints);
   - the shout: fat white ふ / ぇ glyphs with a soft blue rim, each trailing a puff of cloud (云之呼诶);
   - the sea: jellyfish (jellyfish.png, or a code jellyfish while the picture streams in), soft glows, rising
     bubbles, a night-aquarium wash with slow light bands on the floor, and blue-white zigzag sparks for the sting.
   Flat shapes and cached glow stamps only; no shadowBlur. The walk's footprint positions are sampled once
   per trail (the ends do not move). The busiest moment (the big one's shock) is ~24 particles. */

export const KANON_BACK: readonly string[] = ['kanon-hug', 'kanon-warn'];
export const KANON_SCREEN_BACK: readonly string[] = ['kanon-sea'];
export const JELLYFISH = '/sprites/kanon/jellyfish.png';

const BLUE = '#44DDFF';
const DEEP = '#1d6f9c';
const PALE = '#c9f4ff';
const INK = '#14364d';
const BLUE_RGB = '68,221,255';
const PALE_RGB = '200,244,255';
const PINK_RGB = '255,170,220';
/** 水母之海's glow colours: the little ones cycle through these by their hue roll (blue, lilac, pink, aqua). */
const SEA_RGB = ['120,220,255', '190,170,255', '255,175,225', '140,255,230'] as const;
const seaRgb = (hue = 0) => SEA_RGB[((Math.round(hue) % 4) + 4) % 4];

const n = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const fadeIO = (el: number, life: number, a: number, b: number) => clamp(Math.min(el / a, life / b), 0, 1);

/* ---- little shapes ---- */

/** One footprint: a small shoe sole pointing along `ang`. The old rotate + scale(1, .55) is the ellipse's own
 *  rotation and a shorter vertical radius, so a print does not push the canvas state. */
function footprint(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, s: number): void {
  const c = Math.cos(ang), sn = Math.sin(ang);
  ctx.beginPath();
  ctx.ellipse(x + c * 1.5 * s, y + sn * 1.5 * s, 4.2 * s, 2.6 * s * .55, ang, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x - c * 4.4 * s, y - sn * 4.4 * s, 2 * s, 2.1 * s * .55, ang, 0, TAU);
  ctx.fill();
}
/** A hollow bubble with a glint. */
function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(x - r * .35, y - r * .35, Math.max(.6, r * .25), 0, TAU); ctx.fill();
}
/** A short zigzag spark from (x, y) toward `ang`, length len, in three kinks. */
function zap(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, seed: number): void {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 1; i <= 3; i++) {
    const d = len * i / 3, w = (hash(seed, i) - .5) * len * .5 * (i < 3 ? 1 : 0);
    ctx.lineTo(x + cs * d - sn * w, y + sn * d + cs * w);
  }
  ctx.stroke();
}
/** A puff of cloud: three to five overlapping circles, white with a soft blue rim. */
function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number): void {
  const m = 4;
  ctx.fillStyle = PALE;
  ctx.beginPath();
  for (let i = 0; i < m; i++) {
    const a = i / m * TAU + hash(seed, i) * .6;
    const rr = r * (.55 + hash(seed, i + 9) * .25);
    ctx.moveTo(x + Math.cos(a) * r * .45 + rr, y + Math.sin(a) * r * .3);
    ctx.arc(x + Math.cos(a) * r * .45, y + Math.sin(a) * r * .3, rr, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < m; i++) {
    const a = i / m * TAU + hash(seed, i) * .6;
    const rr = r * (.55 + hash(seed, i + 9) * .25) * .8;
    ctx.moveTo(x + Math.cos(a) * r * .4 + rr, y + Math.sin(a) * r * .25 - r * .08);
    ctx.arc(x + Math.cos(a) * r * .4, y + Math.sin(a) * r * .25 - r * .08, rr, 0, TAU);
  }
  ctx.fill();
}

/** A jellyfish centred on (x, y) at `size` px across: the picture when it has arrived, else a code one (a dome, a frill
 *  and four wavy tentacles). `t` sways the tentacles; `squeeze` 0..1 pulls them in (the sting). */
export function jellyfish(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, t: number, squeeze: number, images?: ImageCache, glowA = .5): void {
  if (glowA > 0) {
    ctx.save();
    ctx.globalAlpha *= glowA;
    glow(ctx, x, y - size * .1, size * .75, PINK_RGB);
    glow(ctx, x, y, size * .55, BLUE_RGB);
    ctx.restore();
  }
  const pulse = 1 + Math.sin(t * 4.2) * .05;
  const im = images?.get(JELLYFISH);
  if (im?.naturalWidth) {
    const w = size * pulse, h = size * (2 - pulse) * (1 - squeeze * .12);
    ctx.drawImage(im, x - w / 2, y - h / 2, w, h);
    return;
  }
  ctx.save();
  const r = size * .32 * pulse;
  const top = y - size * .18;
  // Tentacles first, behind the bell.
  ctx.strokeStyle = 'rgba(255,190,230,.8)';
  ctx.lineWidth = Math.max(1.2, size * .03);
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const bx = x + (i - 1.5) * r * .42;
    const len = size * .55 * (1 - squeeze * .5);
    ctx.beginPath();
    ctx.moveTo(bx, top + r * .2);
    for (let k = 1; k <= 6; k++) {
      const d = len * k / 6;
      ctx.lineTo(bx + Math.sin(t * 3 + i * 1.7 + k * .9) * size * .05 * (k / 6) * (1 - squeeze), top + r * .2 + d);
    }
    ctx.stroke();
  }
  // The bell: a half dome with a frilly hem.
  ctx.fillStyle = 'rgba(176,236,255,.82)';
  ctx.beginPath();
  ctx.ellipse(x, top + r * .25, r, r * .9, 0, Math.PI, TAU);
  for (let i = 0; i <= 8; i++) ctx.lineTo(x + r - i * r / 4, top + r * .25 + (i % 2 ? r * .16 : 0));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,190,230,.7)';
  ctx.beginPath(); ctx.ellipse(x, top, r * .45, r * .3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath(); ctx.ellipse(x - r * .45, top - r * .35, r * .16, r * .1, -.5, 0, TAU); ctx.fill();
  ctx.restore();
}

/* ---- shots ---- */

/** Drawn prints for one trail: x, dy, ang, nx, ny per step, then the two 「？」 bases (x, dy). Built once. */
interface TrailStamp { from: number; to: number; n: number; pts: Float32Array; mark: Float32Array }
const trailStamps = new WeakMap<Projectile, { full?: TrailStamp; lite?: TrailStamp }>();
const trailA = { x: 0, dy: 0 }, trailB = { x: 0, dy: 0 };
function trailStamp(p: Projectile, lite: boolean): TrailStamp {
  let box = trailStamps.get(p);
  if (!box) trailStamps.set(p, box = {});
  const from = p.aim ?? p.x;
  const slot = lite ? 'lite' : 'full';
  const prev = box[slot];
  if (prev && prev.from === from && prev.to === p.x) return prev;
  const n = lite ? Math.ceil(STEPS * .7) : STEPS;
  const pts = new Float32Array(n * 5);
  for (let k = 0; k < n; k++) {
    const u = (k + .5) / n;
    wanderAt(from, p.x, u, trailA);
    wanderAt(from, p.x, u + .02, trailB);
    const ang = Math.atan2((trailB.dy - trailA.dy) * .6, trailB.x - trailA.x);
    const side = k % 2 ? 1 : -1;
    const i = k * 5;
    pts[i] = trailA.x;
    pts[i + 1] = trailA.dy;
    pts[i + 2] = ang;
    pts[i + 3] = -Math.sin(ang) * 3.5 * side;
    pts[i + 4] = Math.cos(ang) * 2 * side;
  }
  const mark = new Float32Array(4);
  for (let i = 0; i < 2; i++) {
    wanderAt(from, p.x, .25 + i * .4, trailA);
    mark[i * 2] = trailA.x;
    mark[i * 2 + 1] = trailA.dy;
  }
  const stamp: TrailStamp = { from, to: p.x, n, pts, mark };
  box[slot] = stamp;
  return stamp;
}
function drawTrail(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean): void {
  const laid = clamp(p.age / WANDER, 0, 1);
  const fade = clamp((p.life) / .6, 0, 1);
  const stamp = trailStamp(p, lite);
  const pts = stamp.pts;
  ctx.save();
  ctx.fillStyle = BLUE;
  for (let k = 0; k < stamp.n; k++) {
    const u = (k + .5) / stamp.n;
    if (u > laid) break;
    const i = k * 5;
    // A fresh print is darker; they pale as the trail gets old.
    ctx.globalAlpha = fade * (.45 + .4 * (1 - clamp(p.age - u * WANDER, 0, TRAIL) / TRAIL));
    footprint(ctx, pts[i] + pts[i + 3], FLOOR - 8 + pts[i + 1] + pts[i + 4], pts[i + 2], 1.15);
  }
  // A couple of small question marks hover over the tightest curls.
  if (laid > .3) {
    const mark = stamp.mark;
    for (let i = 0; i < 2; i++) {
      const u = .25 + i * .4;
      if (u > laid) break;
      ctx.globalAlpha = fade * .8 * (.6 + .4 * Math.sin(p.age * 5 + i));
      stampText(ctx, '？', mark[i * 2], FLOOR - 26 + mark[i * 2 + 1] - Math.sin(p.age * 3 + i * 2) * 3, 15, '#ffffff', DEEP);
    }
  }
  ctx.restore();
}

function drawFuee(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean): void {
  const i = p.wave ?? 0;
  const { text } = fueeGlyph(i);
  const dir = Math.sign(p.vx) || 1;
  const size = p.size * .62;
  const wob = Math.sin(p.age * 18 + i) * 3;
  ctx.save();
  ctx.globalAlpha = Math.min(1, p.life / .2, p.age / .06);
  // The cloud it rides: puffs left behind along the way.
  for (let k = 0, m = n(3, lite); k < m; k++) {
    const back = (k + 1) * size * .32;
    ctx.globalAlpha *= .85;
    cloud(ctx, p.x - dir * back, p.y + size * .25 + Math.sin(p.age * 6 + k) * 2, size * (.32 - k * .06), i * 7 + k);
  }
  ctx.globalAlpha = Math.min(1, p.life / .2, p.age / .06);
  ctx.translate(p.x, p.y + wob);
  ctx.rotate(dir * Math.sin(p.age * 11 + i * 1.3) * .08);
  stampText(ctx, text, 0, 0, size, '#ffffff', DEEP);
  ctx.restore();
  // Sweat drops flicked off the first glyph.
  if (i === 0 && !lite) {
    ctx.save();
    ctx.fillStyle = PALE;
    for (let k = 0; k < 3; k++) {
      const q = cycle(p.age, 2.4, k, 81);
      ctx.globalAlpha = (1 - q) * .8;
      dot(ctx, p.x - dir * (10 + q * 30), p.y - size * .45 - q * 18 + k * 6, 2.4);
    }
    ctx.restore();
  }
}

function drawJellyShot(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean, images?: ImageCache): void {
  const fade = Math.min(1, p.age / .25, p.life / .4);
  ctx.save();
  ctx.globalAlpha = fade;
  // Motes drifting up out of it, like plankton in a tank.
  if (!lite) {
    ctx.fillStyle = PALE;
    for (let k = 0; k < 4; k++) {
      const q = cycle(p.age, .7, k, 91);
      ctx.globalAlpha = fade * Math.sin(q * Math.PI) * .7;
      dot(ctx, p.x + (hash(k, 92) - .5) * 60, p.y + 20 - q * 70, 1.6);
    }
    ctx.globalAlpha = fade;
  }
  const tilt = Math.sin(p.age * 2.4) * .08;
  ctx.translate(p.x, p.y);
  ctx.rotate(tilt);
  jellyfish(ctx, 0, 0, p.size, p.age, 0, images, .55);
  ctx.restore();
}

function drawSeaSmall(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean, images?: ImageCache): void {
  const fade = Math.min(1, p.age / .3, p.life / .5);
  const rgb = seaRgb(p.wave);
  ctx.save();
  // A bioluminescent wake: soft dots of its own colour left behind on the way up, swaying with the bell's beat.
  for (let k = 0, m = n(5, lite); k < m; k++) {
    const back = (k + 1) * 14;
    ctx.globalAlpha = fade * (1 - k / m) * .32;
    glow(ctx, p.x + Math.sin((p.age - k * .08) * 3) * 6, p.y + p.size * .35 + back, 9 - k, rgb);
  }
  // Bubbles trailing below as it rises.
  ctx.strokeStyle = PALE;
  ctx.fillStyle = PALE;
  ctx.lineWidth = 1;
  for (let k = 0, m = n(3, lite); k < m; k++) {
    const q = cycle(p.age, 1.6, k, (p.wave ?? 0) * 3 + 5);
    ctx.globalAlpha = fade * (1 - q) * .7;
    bubble(ctx, p.x + Math.sin(p.age * 3 + k * 2) * 8, p.y + p.size * .4 + q * 46, 2 + hash(k, 7) * 2.5);
  }
  // Its own halo, breathing with the bell (each one in its colour), so the shoal reads as lanterns, not stickers.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = fade * (.28 + .14 * Math.sin(p.age * 4.2 + (p.wave ?? 0)));
  glow(ctx, p.x, p.y, p.size * .9, rgb);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = fade * .8;
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.sin(p.age * 2 + (p.hue ?? 0)) * .12);
  jellyfish(ctx, 0, 0, p.size, p.age + (p.wave ?? 0), 0, images, 0);
  ctx.restore();
}

function drawSeaBig(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean, images?: ImageCache): void {
  const landed = !!p.returned;
  const since = landed ? p.age - (p.ticked ?? p.age) : 0;
  const squeeze = landed ? ease(since / .15) : 0;
  ctx.save();
  const show = landed ? clamp(p.life / .35, 0, 1) : 1;
  // Its light reaches the floor before it does: a soft cone under the bell and a pool of light that tightens
  // and brightens on the floor as it comes down (the warning ring sits inside the pool).
  const near = clamp((p.y - SEA_TOP) / (FLOOR - SEA_BIG_Y - SEA_TOP), 0, 1);
  ctx.globalCompositeOperation = 'lighter';
  const top = p.y + p.size * .1;
  const cone = ctx.createLinearGradient(0, top, 0, FLOOR);
  cone.addColorStop(0, 'rgba(200,244,255,.28)');
  cone.addColorStop(1, 'rgba(200,244,255,0)');
  ctx.globalAlpha = show * (.4 + near * .6);
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(p.x - p.size * .28, top); ctx.lineTo(p.x + p.size * .28, top);
  ctx.lineTo(p.x + p.size * .62, FLOOR); ctx.lineTo(p.x - p.size * .62, FLOOR);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = show * (.25 + near * .55);
  ctx.save();
  ctx.translate(p.x, FLOOR - 4);
  ctx.scale(1, .22);
  glow(ctx, 0, 0, p.size * (.9 - near * .3), PALE_RGB);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = show;
  jellyfish(ctx, p.x, p.y, p.size * (1 + squeeze * .06), p.age, squeeze, images, lite ? .4 : .7);
  if (landed && !lite) {
    // Sparks crawl down the tentacles after the sting.
    ctx.strokeStyle = '#e8fbff';
    ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      const q = cycle(since, 4, k, 71);
      ctx.globalAlpha = (1 - q) * clamp(p.life / .35, 0, 1);
      zap(ctx, p.x + (hash(k, 72) - .5) * p.size * .5, p.y + p.size * (.05 + q * .35), Math.PI / 2 + (hash(k, 73) - .5), 18, k + Math.floor(since * 20));
    }
  }
  ctx.restore();
}

export function drawKanonShot(ctx: CanvasRenderingContext2D, p: Projectile, lite = false, images?: ImageCache): boolean {
  switch (p.fx) {
    case 'kanon-trail': drawTrail(ctx, p, lite); return true;
    case 'kanon-fuee': drawFuee(ctx, p, lite); return true;
    case 'kanon-jelly': drawJellyShot(ctx, p, lite, images); return true;
    case 'kanon-sea-small': drawSeaSmall(ctx, p, lite, images); return true;
    case 'kanon-sea-big': drawSeaBig(ctx, p, lite, images); return true;
  }
  return false;
}

/* ---- effects ---- */

export function drawKanonFx(ctx: CanvasRenderingContext2D, e: Effect, lite = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('kanon-') || e.type.includes('@')) return false;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  const h = e.radius ?? 181;
  ctx.save();
  switch (e.type) {
    /* -- U 十米迷路 -- */
    case 'kanon-pin': {
      // A map pin with a 「？」 in it, bobbing and turning this way and that as she wanders.
      const k = fadeIO(el, e.life, .08, .1);
      ctx.globalAlpha = k;
      ctx.translate(e.x, e.y - Math.abs(Math.sin(el * 9)) * 6);
      ctx.rotate(Math.sin(el * 7) * .3);
      ctx.fillStyle = BLUE;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -14, 12, Math.PI * .8, Math.PI * 2.2);
      ctx.lineTo(0, 6);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      stampText(ctx, '？', 0, -14, 15, '#ffffff');
      break;
    }
    case 'kanon-huh': {
      // 「呼诶？」 in a round bubble that pops in and floats off.
      const k = ease(el / .15);
      ctx.globalAlpha = Math.min(1, e.life / .25);
      ctx.translate(e.x, e.y - el * 14);
      ctx.scale(k, k);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = DEEP;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 34, 17, 0, 0, TAU);
      ctx.moveTo(-dir * 8, 14); ctx.lineTo(-dir * 16, 26); ctx.lineTo(-dir * 2, 16);
      ctx.fill(); ctx.stroke();
      stampText(ctx, '呼诶？', 0, 0, 15, DEEP);
      break;
    }
    case 'kanon-stepped': {
      // Someone walked onto the trail: the prints under them flash and a ring of bubbles goes up.
      ctx.strokeStyle = PALE; ctx.fillStyle = PALE; ctx.lineWidth = 1.2;
      burst(el, 31, { n: n(8, lite), speed: [40, 110], life: .5, gravity: -120, angle: -Math.PI / 2, spread: 2.6 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        bubble(ctx, x, y, 2 + (i % 3));
      }, e.x, e.y - 6);
      ctx.globalAlpha = clamp(e.life / e.max, 0, 1) * .6;
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 4, 18 + el * 60, 5 + el * 14, 0, 0, TAU); ctx.stroke();
      break;
    }
    case 'kanon-chisato': {
      // 一个路痴和一个不会搭电车的人: 白鹭千圣 gets the extra 混乱 and says so.
      ctx.globalAlpha = fadeIO(el, e.life, .12, .3);
      stampText(ctx, '一起迷路了……', e.x, e.y - el * 10, 15, '#ffffff', DEEP);
      break;
    }
    /* -- I 云之呼诶 -- */
    case 'kanon-cloud': {
      // The puff she breathes the shout out of.
      const k = ease(el / .25);
      ctx.globalAlpha = Math.min(1, e.life / .3) * .95;
      cloud(ctx, e.x + dir * k * 14, e.y, 14 + k * 16, 3);
      ctx.fillStyle = PALE;
      burst(el, 41, { n: n(6, lite), speed: [50, 120], life: .45, gravity: -60, angle: dir > 0 ? 0 : Math.PI, spread: 1.6, drag: .4 }, (x, y, q) => {
        ctx.globalAlpha = (1 - q) * .8;
        dot(ctx, x, y, 3 * (1 - q * .5));
      }, e.x, e.y);
      break;
    }
    /* -- O 迷宫水母 -- */
    case 'kanon-bloom': {
      // The jellyfish arrives in a little swirl of bubbles.
      ctx.strokeStyle = PALE; ctx.fillStyle = PALE; ctx.lineWidth = 1.2;
      burst(el, 51, { n: n(10, lite), speed: [50, 130], life: .5, gravity: -90, drag: .4 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        bubble(ctx, x, y, 2 + (i % 3) * .8);
      }, e.x, e.y);
      ctx.globalAlpha = clamp(e.life / e.max, 0, 1) * .5;
      glow(ctx, e.x, e.y, 30 + el * 60, BLUE_RGB);
      break;
    }
    case 'kanon-sting': {
      // The sting: blue-white zigzags out of the touch, and a quick glow.
      const k = clamp(e.life / e.max, 0, 1);
      ctx.globalAlpha = k * .6;
      glow(ctx, e.x, e.y, 40 + el * 50, PALE_RGB);
      ctx.strokeStyle = '#e8fbff';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (let i = 0, m = n(7, lite); i < m; i++) {
        ctx.globalAlpha = k;
        zap(ctx, e.x, e.y, i / m * TAU + hash(i, 61), 20 + el * 70, i + Math.floor(el * 24));
      }
      break;
    }
    /* -- L 水母之海 -- */
    case 'kanon-sea': {
      // The night aquarium, seen from inside the tank (screen space, behind every body):
      //   1 the water: deep navy at the top fading to teal at the floor, edges darker (the tank's glass);
      //   2 the surface from below: a wavering bright band along the top with glitter where the light breaks;
      //   3 Tyndall shafts fanning down from the surface, soft at the top and gone by the floor, breathing;
      //   4 a caustic net on the floor: two families of wavy light lines crossing and drifting, so the
      //     knots of the net crawl like light through ripples;
      //   5 bokeh: a few big, out-of-focus pastel discs far back, drifting slowly (the dreamy depth);
      //   6 plankton motes rising and twinkling.
      // Everything bright is additive and low alpha, so the bodies in front stay clear.
      const fade = fadeIO(el, e.life, .35, .45);
      const t = el;
      ctx.globalAlpha = fade;
      const water = ctx.createLinearGradient(0, 0, 0, H);
      water.addColorStop(0, 'rgba(4,14,42,.7)');
      water.addColorStop(.55, 'rgba(8,46,88,.5)');
      water.addColorStop(1, 'rgba(14,92,120,.42)');
      ctx.fillStyle = water;
      ctx.fillRect(0, 0, W, H);
      const glass = ctx.createRadialGradient(W / 2, H * .55, H * .35, W / 2, H * .55, W * .72);
      glass.addColorStop(0, 'rgba(3,10,30,0)');
      glass.addColorStop(1, 'rgba(3,10,30,.55)');
      ctx.fillStyle = glass;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      // 2 — the surface from below.
      const surf = ctx.createLinearGradient(0, 0, 0, 70);
      surf.addColorStop(0, 'rgba(150,230,255,.35)');
      surf.addColorStop(1, 'rgba(150,230,255,0)');
      ctx.fillStyle = surf;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= W; x += 32) ctx.lineTo(x, 34 + Math.sin(x * .018 + t * 1.6) * 8 + Math.sin(x * .041 - t * 2.3) * 4);
      ctx.lineTo(W, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8fbff';
      for (let i = 0, m = n(16, lite); i < m; i++) {
        const tw = Math.sin(t * (3 + hash(i, 101) * 4) + i * 2.1);
        if (tw < .35) continue;
        ctx.globalAlpha = fade * (tw - .35) * 1.2;
        const x = hash(i, 102) * W + Math.sin(t * .7 + i) * 18;
        const y = 22 + Math.sin(x * .018 + t * 1.6) * 8 + hash(i, 103) * 10;
        sparkle(ctx, x, y, 2.2 + hash(i, 104) * 2.5);
      }
      // 3 — Tyndall shafts from the surface, fanning out from a sun somewhere above the middle.
      // One vertical gradient for the whole fan: every shaft uses the same stops.
      const shaft = ctx.createLinearGradient(0, 0, 0, FLOOR);
      shaft.addColorStop(0, 'rgba(170,235,255,.2)');
      shaft.addColorStop(.6, 'rgba(170,235,255,.07)');
      shaft.addColorStop(1, 'rgba(170,235,255,0)');
      ctx.fillStyle = shaft;
      for (let i = 0, m = n(6, lite); i < m; i++) {
        const u = (i + .5) / m;
        const x0 = W * (.08 + u * .84) + Math.sin(t * .5 + i * 1.9) * 26;
        const lean = (x0 - W * .5) * .45;
        const w0 = 14 + hash(i, 111) * 22, w1 = w0 * 3.2;
        const breathe = .55 + .45 * Math.sin(t * (.9 + hash(i, 112) * .8) + i * 2.4);
        ctx.globalAlpha = fade * breathe;
        ctx.beginPath();
        ctx.moveTo(x0 - w0, 0); ctx.lineTo(x0 + w0, 0);
        ctx.lineTo(x0 + lean + w1, FLOOR); ctx.lineTo(x0 + lean - w1, FLOOR);
        ctx.closePath(); ctx.fill();
      }
      // 4 — the caustic net on the floor (squashed into the floor's depth) where the shafts land.
      ctx.save();
      ctx.beginPath(); ctx.rect(0, FLOOR - 14, W, H - FLOOR + 14); ctx.clip();
      ctx.strokeStyle = 'rgba(180,245,255,1)';
      ctx.lineWidth = 1.6;
      for (let fam = 0; fam < 2; fam++) {
        const slope = fam ? .42 : -.42;
        for (let i = 0, m = n(9, lite); i < m; i++) {
          ctx.globalAlpha = fade * (.12 + .08 * Math.sin(t * 1.7 + i * 1.3 + fam));
          const base = (i / m) * (W + 240) - 120 + (fam ? 1 : -1) * ((t * 22) % ((W + 240) / m));
          ctx.beginPath();
          for (let k = 0; k <= 10; k++) {
            const d = k / 10;
            const y = FLOOR - 10 + d * (H - FLOOR + 10);
            const x = base + slope * (y - FLOOR) * 2.2 + Math.sin(d * 7 + t * 2.4 + i * 1.9 + fam * 2) * 9;
            if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
      // 5 — bokeh far back.
      for (let i = 0, m = n(7, lite); i < m; i++) {
        const k = cycle(t, .05, i, 121);
        ctx.globalAlpha = fade * Math.sin(k * Math.PI) * (.1 + hash(i, 122) * .1);
        glow(ctx, hash(i, 123) * W + Math.sin(t * .4 + i) * 30, FLOOR * (1 - k) + 40, 30 + hash(i, 124) * 46, SEA_RGB[i % 4]);
      }
      // 6 — plankton motes, a few twinkling as crosses.
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = PALE;
      for (let i = 0, m = n(18, lite); i < m; i++) {
        const q = cycle(t, .16, i, 21);
        const x = hash(i, 22) * W + Math.sin(t * .9 + i) * 12;
        const y = FLOOR - q * FLOOR * .95;
        const a = Math.sin(q * Math.PI) * (.35 + .35 * Math.sin(t * 5 + i * 3));
        ctx.globalAlpha = fade * Math.max(0, a);
        if (i % 5 === 0) sparkle(ctx, x, y, 3.2);
        else dot(ctx, x, y, 1.1 + hash(i, 23) * 1.3);
      }
      break;
    }
    case 'kanon-hug': {
      // She hugs her jellyfish cushion (drawn on the L cells) and shuts her eyes: a soft glow behind her and bubbles
      // going up round her.
      const fade = fadeIO(el, e.life, .2, .3);
      ctx.globalAlpha = fade * .55;
      glow(ctx, e.x, e.y - h * .55, h * .6, BLUE_RGB);
      ctx.strokeStyle = PALE; ctx.fillStyle = PALE; ctx.lineWidth = 1;
      for (let i = 0, m = n(6, lite); i < m; i++) {
        const q = cycle(el, .8, i, 25);
        ctx.globalAlpha = fade * (1 - q) * .8;
        bubble(ctx, e.x + (hash(i, 26) - .5) * 80 + Math.sin(el * 3 + i) * 5, e.y - 20 - q * h * 1.1, 2 + hash(i, 27) * 3);
      }
      break;
    }
    case 'kanon-warn': {
      // Where the big one will come down: a ring on the floor closing in, and its shadow growing.
      const k = ease(el / (e.max - .3));
      const r = e.radius ?? 110;
      ctx.globalAlpha = Math.min(1, e.life / .2) * .35 * k;
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 2, r * (.4 + k * .6), r * .16 * (.4 + k * .6), 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = Math.min(1, e.life / .2) * (.5 + .5 * Math.sin(el * 30));
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 2, r * (1.4 - k * .4), r * .2 * (1.4 - k * .4), 0, 0, TAU); ctx.stroke();
      break;
    }
    case 'kanon-shock': {
      // The big one closes on them: a flat flash ring on the floor, sparks, bubbles bursting up.
      const k = clamp(e.life / e.max, 0, 1);
      const r = e.radius ?? 120;
      ctx.globalAlpha = k * .7;
      glow(ctx, e.x, e.y - 90, r * (1 + el * 2), PALE_RGB);
      ctx.strokeStyle = '#e8fbff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = k;
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 3, r * (.6 + el * 2.4), r * .18 * (.6 + el * 2.4), 0, 0, TAU); ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      for (let i = 0, m = n(8, lite); i < m; i++) {
        ctx.globalAlpha = k;
        zap(ctx, e.x + (hash(i, 63) - .5) * r, e.y - 60 - hash(i, 64) * 80, i / m * TAU, 22 + el * 60, i + Math.floor(el * 20));
      }
      // Ripples of light running out along the floor, the way a drop spreads on the surface of a tank.
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(190,245,255,1)';
      for (let i = 0; i < 3; i++) {
        const q = clamp((el - i * .08) / .5, 0, 1);
        if (q <= 0 || q >= 1) continue;
        ctx.globalAlpha = (1 - q) * .7;
        ctx.lineWidth = 2.4 * (1 - q) + .6;
        ctx.beginPath(); ctx.ellipse(e.x, e.y - 3, r * (.5 + q * 3), r * .14 * (.5 + q * 3), 0, 0, TAU); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = PALE; ctx.fillStyle = PALE; ctx.lineWidth = 1.2;
      burst(el, 65, { n: n(10, lite), speed: [80, 220], life: .55, gravity: -160, angle: -Math.PI / 2, spread: 2.4, drag: .5 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        bubble(ctx, x, y, 2.5 + (i % 3));
      }, e.x, e.y - 40);
      break;
    }
    /* -- 越慌越稳 -- */
    case 'kanon-steady': {
      // No more sweat: a calm blue ring at her feet and one slow, quiet glint over her head.
      const fade = fadeIO(el, e.life, .1, .2);
      ctx.globalAlpha = fade * .5;
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 2, 40 + Math.sin(el * 4) * 3, 9, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = fade * (.5 + .4 * Math.sin(el * 5));
      ctx.fillStyle = PALE;
      sparkle(ctx, e.x, e.y - h - 10, 6);
      break;
    }
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  return true;
}

/* ---- status looks (statusMarks.ts) ---- */

/** 混乱 'kanon-maze': lost — small blue footprints walking a ring round their feet, and two 「？」 over the head. */
export function auraMaze(ctx: CanvasRenderingContext2D, f: Fighter, bodyH: number, left: number, t: number): void {
  ctx.save();
  const fade = Math.min(1, left / .3);
  ctx.fillStyle = BLUE;
  for (let i = 0; i < 6; i++) {
    const a = t * 2.2 + i * TAU / 6;
    ctx.globalAlpha = fade * (.25 + .55 * ((i / 6 + t * .35) % 1));
    footprint(ctx, f.x + Math.cos(a) * 34, FLOOR - 4 + Math.sin(a) * 7, a + Math.PI / 2, 1);
  }
  for (let i = 0; i < 2; i++) {
    ctx.globalAlpha = fade * .9;
    stampText(ctx, '？', f.x + (i ? 14 : -12), f.y - bodyH - 16 - (i ? 8 : 0) + Math.sin(t * 4 + i * 2) * 4, i ? 22 : 17, '#ffffff', DEEP);
  }
  ctx.restore();
}
export function applyMaze(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  ctx.fillStyle = BLUE;
  burst(age, 33, { n: 8, speed: [60, 150], life: .45, drag: .4 }, (x, y, q, i) => {
    ctx.globalAlpha = 1 - q;
    footprint(ctx, x, e.y - 4 + (y - e.y) * .2, i, 1);
  }, e.x, e.y);
  ctx.restore();
}
/** 定身 'kanon-zap': stung — little blue-white sparks crawling over the body and a faint jellyfish glow. */
export function auraZap(ctx: CanvasRenderingContext2D, f: Fighter, bodyH: number, left: number, t: number): void {
  ctx.save();
  const fade = Math.min(1, left / .2);
  ctx.globalAlpha = fade * .35;
  glow(ctx, f.x, f.y - bodyH * .5, bodyH * .45, BLUE_RGB);
  ctx.strokeStyle = '#e8fbff';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  const beat = Math.floor(t * 14);
  for (let i = 0; i < 4; i++) {
    if (hash(i, beat) < .35) continue;
    ctx.globalAlpha = fade * .9;
    zap(ctx, f.x + (hash(i, beat + 3) - .5) * 50, f.y - bodyH * (.2 + hash(i, beat + 5) * .7), hash(i, beat + 7) * TAU, 14, i + beat);
  }
  ctx.restore();
}
export function applyZap(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  const k = clamp(1 - age / .4, 0, 1);
  ctx.globalAlpha = k * .7;
  glow(ctx, e.x, e.y - 95, 50 + age * 80, PALE_RGB);
  ctx.restore();
}
