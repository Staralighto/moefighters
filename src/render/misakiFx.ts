import type { Effect, Projectile } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, clamp } from '../game/constants.ts';
import { CELL } from './clips.ts';
import { TAU, burst, confetti, hash, sparkle, stampText } from './fxParticles.ts';

/* 奥泽美咲 / 米歇尔 — 一人二役. Two registers that never mix on one shape:
   - 米歇尔's side is a children's show: round, soft, pink (#ff6fc8 / #ff8fd4) with cream (#ffe3f2) and the five
     band colours in the fireworks — jets, missiles, a parade of bears, all candy and no menace;
   - 美咲's side is the straight man: black ink, white paper and one flat colour — the 「喂！」 bubble, the
     rock-paper-scissors badge, the men in black.
   Every shape is one flat subject that reads from across the screen; nothing here runs all match long.
   Pure drawing: positions and timing come from the effect or the shot. */

const PINK = '#ff6fc8';
const SOFT = '#ff8fd4';
const CREAM = '#ffe3f2';
const INK = '#141418';
const PAPER = '#fbfbf6';
const HEAD_SRC = '/sprites/misaki/head.png';
const BEAR_SRC = '/sprites/misaki/michelle.png';
/** The parade: the little bears' feet sit this far under the shot, the giant's this far (combat.ts LAND_*_Y). */
const LAND_SMALL_FOOT = 38;
const LAND_BIG_FOOT = 120;
const LAND_SMALL_H = 84;
const LAND_BIG_H = 400;
const BALLOONS = ['#ffe14a', '#b48cff', '#ff9a3c', '#7fd0ff', '#ff6fc8'] as const;

let lite = false;
const n = (full: number) => (lite ? Math.ceil(full / 2) : full);
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
/** 0 → 1 over a 0.5s loop, offset per index: where a shaken-off star is along its drift. */
const cycleU = (t: number, i: number) => ((t * 2 + hash(i, 40)) % 1);
const pop = (k: number) => { const c = 2.4; const u = clamp(k, 0, 1) - 1; return 1 + (c + 1) * u * u * u + c * u * u; };

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

/** The sheet with the placeholder chrome (dark cells, magenta lines, the green key) cut away, built once. */
const cutCache = new WeakMap<HTMLImageElement, CanvasImageSource>();
function keyed(im: HTMLImageElement): CanvasImageSource {
  const hit = cutCache.get(im);
  if (hit) return hit;
  if (typeof document === 'undefined') return im;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return im;
  g.drawImage(im, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gv = px[i + 1], b = px[i + 2];
    const chroma = gv > 240 && r < 20 && b < 20;
    const sheet = Math.abs(r - 26) <= 3 && Math.abs(gv - 21) <= 3 && Math.abs(b - 40) <= 3;
    const grid = Math.abs(r - 255) <= 8 && Math.abs(gv - 54) <= 12 && Math.abs(b - 200) <= 12;
    if (chroma || sheet || grid) px[i + 3] = 0;
  }
  g.putImageData(data, 0, 0);
  cutCache.set(im, c);
  return c;
}

/** A round bear head: the fallback until head.png is in, and the far-off parade read. */
function bearHead(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.fillStyle = SOFT;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * r * .72, -r * .72, r * .34, 0, TAU); ctx.fill(); }
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.fillStyle = CREAM;
  ctx.beginPath(); ctx.ellipse(0, r * .32, r * .46, r * .34, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = INK;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * r * .36, -r * .12, r * .1, 0, TAU); ctx.fill(); }
  ctx.beginPath(); ctx.arc(0, r * .2, r * .09, 0, TAU); ctx.fill();
}

function drawHead(ctx: CanvasRenderingContext2D, images: ImageCache | undefined, size: number): void {
  const im = image(images, HEAD_SRC);
  if (im) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(keyed(im), -size / 2, -size / 2, size, size);
  } else bearHead(ctx, size * .36);
}

/** One flat suit-and-shades figure, h tall, feet at 0. The rim is a thin white edge so it reads on dark stages. */
function suit(ctx: CanvasRenderingContext2D, h: number, alpha: number, glint: number): void {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-h * .12, 0); ctx.lineTo(-h * .1, -h * .42); ctx.lineTo(-h * .17, -h * .46);
    ctx.lineTo(-h * .15, -h * .76); ctx.lineTo(h * .15, -h * .76); ctx.lineTo(h * .17, -h * .46);
    ctx.lineTo(h * .1, -h * .42); ctx.lineTo(h * .12, 0); ctx.closePath();
    ctx.moveTo(h * .095, -h * .87); ctx.arc(0, -h * .87, h * .095, 0, TAU);
  };
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,.75)';
  ctx.lineWidth = 2.5;
  body(); ctx.stroke();
  ctx.fillStyle = INK;
  body(); ctx.fill();
  // White shirt and tie: the one thing that says 黑衣人 at a glance.
  ctx.fillStyle = PAPER;
  ctx.beginPath(); ctx.moveTo(-h * .045, -h * .76); ctx.lineTo(h * .045, -h * .76); ctx.lineTo(0, -h * .62); ctx.closePath(); ctx.fill();
  // Shades, with a glint that runs across them.
  ctx.fillStyle = '#000';
  ctx.fillRect(-h * .08, -h * .9, h * .16, h * .035);
  if (glint > 0) {
    ctx.globalAlpha = alpha * glint;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-h * .07 + h * .1 * glint, -h * .9, h * .03, h * .035);
  }
  ctx.globalAlpha = 1;
}

/** The rock-paper-scissors hand as one flat white icon built from rounded shapes, no outline: a palm, and
 *  capsule fingers (paper: four up and a thumb; scissors: two in a V over folded knuckles; rock: the knuckles
 *  over a round fist and the thumb across it). `r` is about half the icon's height. */
function hand(ctx: CanvasRenderingContext2D, which: number, r: number, gap = PINK): void {
  const cap = (x: number, y: number, w: number, len: number, rot: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -len, w, len + w / 2, w / 2);
    ctx.fill();
    ctx.restore();
  };
  ctx.fillStyle = '#ffffff';
  const fw = r * .26;
  if (which === 2) {
    for (let i = 0; i < 4; i++) cap((i - 1.5) * r * .27, -r * .05, fw, r * (.62 + (i === 1 || i === 2 ? .1 : 0)), (i - 1.5) * .13);
    cap(-r * .5, r * .3, fw, r * .42, -1.0);
  } else if (which === 1) {
    cap(-r * .14, -r * .05, fw, r * .72, -.3);
    cap(r * .14, -r * .05, fw, r * .72, .3);
    for (const x of [-r * .3, r * .3]) { ctx.beginPath(); ctx.arc(x, r * .02, fw * .55, 0, TAU); ctx.fill(); }
  } else {
    // Rock: a bigger, squarer fist with four round knuckles along the top.
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc((i - 1.5) * r * .27, -r * .22, r * .16, 0, TAU); ctx.fill(); }
    ctx.beginPath();
    ctx.roundRect(-r * .55, -r * .26, r * 1.1, r * .86, r * .26);
    ctx.fill();
    // Cut into the face in the bubble's own colour (no outline): the finger creases and the thumb across them.
    ctx.strokeStyle = gap;
    ctx.lineCap = 'round';
    ctx.lineWidth = r * .07;
    for (let i = 0; i < 3; i++) { const x = (i - 1) * r * .27; ctx.beginPath(); ctx.moveTo(x, -r * .2); ctx.lineTo(x, r * .05); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-r * .38, r * .2); ctx.lineTo(r * .16, r * .2); ctx.stroke();
    return;
  }
  ctx.beginPath();
  ctx.roundRect(-r * .48, -r * .16, r * .96, r * .7, r * .3);
  ctx.fill();
}

/** A comic starburst: `points` spikes between rIn and rOut, filled and edged. */
function starburst(ctx: CanvasRenderingContext2D, x: number, y: number, rOut: number, rIn: number, points: number, rot: number, fill: string, edge: string, lw = 3): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? rIn : rOut * (.86 + .14 * hash(i, 3));
    const a = rot + i * Math.PI / points;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = edge; ctx.stroke(); }
}

/** Poster lettering: `fill` over a thick `line`, falling back to plain text without a DOM stamp. */
function word(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, line: string): void {
  if (stampText(ctx, text, x, y, size, fill, line) !== -1) return;
  ctx.font = `900 ${Math.round(size)}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * .2); ctx.strokeStyle = line; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

/** A little heart, centred on x, y. */
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + r * .9);
  ctx.bezierCurveTo(x - r * 1.4, y - r * .1, x - r * .6, y - r * 1.1, x, y - r * .35);
  ctx.bezierCurveTo(x + r * .6, y - r * 1.1, x + r * 1.4, y - r * .1, x, y + r * .9);
  ctx.fill();
}

const HHW = ['#ffe14a', '#b48cff', '#ff9a3c', '#7fd0ff', '#ff6fc8'] as const;

export function drawMisakiFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('misaki-')) return false;
  lite = liteFx;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    case 'misaki-jet': {
      // Two jets out of the bear's back, pointing down and behind: a cream core in a pink flame, flickering.
      const full = (e.n ?? 0) > 0;
      const grow = full ? 1 : ease(el / Math.max(.05, e.max)) * .6;
      ctx.globalAlpha = Math.min(1, e.life * 8);
      ctx.globalCompositeOperation = 'lighter';
      for (const s of [0, 1]) {
        const bx = e.x - dir * (26 + s * 10), by = e.y - 108 + s * 14;
        const len = (36 + 22 * Math.sin(el * 47 + s * 2)) * grow;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(dir > 0 ? Math.PI * .72 : Math.PI * .28);
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, 'rgba(255,240,250,.95)');
        g.addColorStop(.45, 'rgba(255,111,200,.75)');
        g.addColorStop(1, 'rgba(255,111,200,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -7); ctx.quadraticCurveTo(len * .6, -9, len, 0); ctx.quadraticCurveTo(len * .6, 9, 0, 7);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'misaki-firework': {
      // One bloom: a quick white flash, then sparks thrown out in its colour that droop and wink out.
      const r = e.radius ?? 70;
      if (el < .1) {
        ctx.globalAlpha = 1 - el / .1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(e.x, e.y, 10 + el * 160, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = e.color;
      burst(el, 31 + (e.n ?? 0) * 7, { n: n(22), life: e.max, speed: [r * 2.2, r * 3], gravity: 160, drag: .14 }, (x, y, k, i) => {
        ctx.globalAlpha = (1 - k) * (1 - k);
        const s = 2.6 * (1 - k * .6);
        if (i % 4 === 0) sparkle(ctx, x, y, s * 2.2);
        else { ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill(); }
      }, e.x, e.y);
      break;
    }
    case 'misaki-reticle': {
      // The mark on the floor: a flat crosshair ring that turns slowly and pulses, pale enough to stand on.
      const r = e.radius ?? 60;
      const k = ease(el / .18);
      ctx.translate(e.x, e.y - 2);
      ctx.scale(1, .3);
      ctx.globalAlpha = Math.min(1, e.life * 5) * (.55 + .2 * Math.sin(el * 14));
      ctx.strokeStyle = PINK;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, r * (1.5 - .5 * k), 0, TAU); ctx.stroke();
      ctx.rotate(el * 1.6);
      ctx.lineWidth = 5;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(TAU / 4);
        ctx.beginPath(); ctx.moveTo(r * .55, 0); ctx.lineTo(r * 1.05, 0); ctx.stroke();
      }
      ctx.rotate(-el * 1.6 - TAU);
      // 米歇尔's face in the middle of the mark: the crosshair is hers.
      ctx.fillStyle = PINK;
      const fr = r * .3 * (1 + .12 * Math.sin(el * 14));
      for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(k * fr * .75, -fr * .75, fr * .38, 0, TAU); ctx.fill(); }
      ctx.beginPath(); ctx.arc(0, 0, fr, 0, TAU); ctx.fill();
      ctx.fillStyle = CREAM;
      ctx.beginPath(); ctx.ellipse(0, fr * .35, fr * .45, fr * .3, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'misaki-launch': {
      // A hatch pops: a white ring, a puff that drifts back and down, three sparks.
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4 * (1 - t);
      ctx.beginPath(); ctx.arc(e.x, e.y, 8 + ease(t) * 26, 0, TAU); ctx.stroke();
      ctx.fillStyle = CREAM;
      for (let i = 0; i < 4; i++) {
        const k = ease(t);
        ctx.globalAlpha = (1 - t) * .9;
        ctx.beginPath(); ctx.arc(e.x - dir * (6 + i * 9) * k, e.y + 10 + i * 6 * k, (7 + i * 2) * (1 - t * .4), 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#fff3b0';
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * .7;
        ctx.globalAlpha = 1 - t;
        sparkle(ctx, e.x + Math.cos(a) * 30 * ease(t), e.y + Math.sin(a) * 30 * ease(t), 6 * (1 - t));
      }
      break;
    }
    case 'misaki-fallshadow': {
      // The shadow of the missile on its way down: small and pale, then big and dark just before it lands.
      const k = ease(t);
      ctx.globalAlpha = .15 + .45 * k;
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, (e.radius ?? 30) * (.3 + .7 * k), (e.radius ?? 30) * .22 * (.3 + .7 * k), 0, 0, TAU); ctx.fill();
      break;
    }
    case 'misaki-boom': {
      // A candy blast, crisp rather than a haze: a yellow comic star with a pink edge pops and shrinks, a ring of
      // round cream puffs rolls out, confetti flies, and one small heart floats up out of it.
      const r = e.radius ?? 60;
      const seed = (e.n ?? 0) % 97;
      const popK = el < .08 ? pop(el / .08) : 1 - ease((el - .08) / .25);
      if (popK > 0) starburst(ctx, e.x, e.y, r * 1.05 * popK, r * .5 * popK, 9, seed, '#fff3b0', PINK, 3.5);
      if (popK > .2) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(e.x, e.y, r * .28 * popK, 0, TAU); ctx.fill(); }
      for (let i = 0, m = n(7); i < m; i++) {
        const a = -Math.PI + i / (m - 1) * Math.PI + (hash(i, seed) - .5) * .3;
        const d = r * (.5 + ease(t) * .8);
        ctx.globalAlpha = clamp(1.3 - t * 1.6, 0, 1);
        ctx.fillStyle = i % 2 ? CREAM : '#ffffff';
        ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * .55 - t * 14, r * (.2 + .08 * hash(i, 9)) * (1 - t * .5), 0, TAU); ctx.fill();
      }
      burst(el, 53 + seed, { n: n(12), life: e.max, speed: [200, 360], gravity: 620, angle: -Math.PI / 2, spread: Math.PI * 1.3 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = HHW[i % HHW.length];
        confetti(ctx, x, y, 8, 4, el * 9 + i, Math.cos(el * 14 + i));
      }, e.x, e.y);
      ctx.globalAlpha = clamp(1.4 - t * 1.4, 0, 1);
      ctx.fillStyle = PINK;
      heart(ctx, e.x + Math.sin(el * 9) * 6, e.y - 20 - ease(t) * 60, 9);
      break;
    }
    case 'misaki-pop': {
      // The cartoon puff a costume change leaves.
      const r = e.radius ?? 50;
      ctx.fillStyle = CREAM;
      for (let i = 0, m = n(7); i < m; i++) {
        const a = i / m * TAU + hash(i, 5);
        const d = r * ease(t) * (.6 + .4 * hash(i, 6));
        ctx.globalAlpha = (1 - t) * .85;
        ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * .7, r * (.34 + .2 * hash(i, 7)) * (1 - t * .5), 0, TAU); ctx.fill();
      }
      break;
    }
    case 'misaki-cloud': {
      // The costume change: a dense cartoon cloud over the whole body that pops up at once, churns, then thins
      // out from the edges. It is what hides the change, so it stays opaque until `t0` (default: 60% of its life).
      const r = e.radius ?? 90;
      const hold = e.t0 ?? e.max * .6;
      const grow = ease(el / .07);
      const thin = clamp((el - hold) / Math.max(.05, e.max - hold), 0, 1);
      const cy = e.y - 95;
      const m = n(11);
      for (let i = 0; i < m; i++) {
        const a = i / m * TAU + hash(i, 11) * .6;
        const d = r * (.42 + .3 * hash(i, 12)) * (1 + thin * .7);
        const pr = r * (.42 + .16 * hash(i, 13)) * grow * (1 - thin * .55) * (1 + .05 * Math.sin(el * 18 + i));
        ctx.globalAlpha = 1 - thin;
        ctx.fillStyle = i % 3 === 0 ? '#ffffff' : CREAM;
        ctx.beginPath(); ctx.arc(e.x + Math.cos(a + el * .8) * d, cy + Math.sin(a + el * .8) * d * 1.05, pr, 0, TAU); ctx.fill();
      }
      // The core keeps the middle solid.
      ctx.globalAlpha = 1 - thin;
      ctx.fillStyle = CREAM;
      ctx.beginPath(); ctx.ellipse(e.x, cy, r * .7 * grow * (1 - thin * .4), r * 1.02 * grow * (1 - thin * .4), 0, 0, TAU); ctx.fill();
      // A few pink stars spin out of it.
      ctx.fillStyle = PINK;
      for (let i = 0, k = n(5); i < k; i++) {
        const a = hash(i, 14) * TAU + el * 3;
        const d = r * (.9 + el * 1.4);
        ctx.globalAlpha = (1 - thin) * clamp(el / .1, 0, 1);
        sparkle(ctx, e.x + Math.cos(a) * d, cy + Math.sin(a) * d * .9, 7);
      }
      break;
    }
    case 'misaki-tsukkomi': {
      // 「喂！」 in a white bubble with a black edge, and three shock lines: the straight man cutting in.
      const s = pop(el / .18) * (1 - Math.max(0, t - .8) * 2);
      ctx.translate(e.x, e.y);
      ctx.scale(s, s);
      ctx.globalAlpha = Math.min(1, e.life * 6);
      ctx.fillStyle = PAPER;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-38, -24, 76, 46, 16);
      ctx.moveTo(-dir * 6, 22); ctx.lineTo(-dir * 18, 38); ctx.lineTo(-dir * 20, 22);
      ctx.fill(); ctx.stroke();
      if (stampText(ctx, '喂！', 0, -1, 26, INK) === -1) {
        ctx.fillStyle = INK; ctx.font = '900 26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('喂！', 0, -1);
      }
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        const a = -Math.PI / 2 + i * .55;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 46, Math.sin(a) * 34); ctx.lineTo(Math.cos(a) * 60, Math.sin(a) * 46); ctx.stroke();
      }
      break;
    }
    case 'misaki-janken': {
      // The hand over her head through the windup, on a pink badge, so the foe can read it.
      // A small pink bubble with a soft lighter rim and a little tail down to her head.
      const r = 17;
      const s = pop(el / .16);
      ctx.translate(e.x, e.y + 22 + Math.sin(el * 10) * 2);
      ctx.scale(s, s);
      ctx.globalAlpha = Math.min(1, e.life * 6);
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.moveTo(-5, r + 4); ctx.lineTo(0, r + 13); ctx.lineTo(5, r + 4); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r + 9, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.beginPath(); ctx.arc(-4, -5, r + 2, 0, TAU); ctx.fill();
      // A slot machine: the hand spins through all three, then lands with a 「叮」 sparkle.
      const spin = .22;
      const shown = el < spin ? Math.floor(el / .045) % 3 : e.n ?? 0;
      ctx.translate(0, 3);
      hand(ctx, shown, r * 1.4, e.color);
      if (el >= spin && el < spin + .2) {
        const k = (el - spin) / .2;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#fff3b0';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, -2, r + 11 + k * 16, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#fff3b0';
        for (let i = 0; i < 4; i++) sparkle(ctx, Math.cos(i * TAU / 4 + .4) * (r + 15 + k * 14), -2 + Math.sin(i * TAU / 4 + .4) * (r + 15 + k * 14), 5);
      }
      break;
    }
    case 'misaki-jankenhit': {
      // What the hand does when it lands. Rock: a fist-shaped star and 「咚！」. Scissors: two white blades
      // cross and 「咔嚓！」. Paper: a palm print of air and 「啪！」.
      const which = e.n ?? 0;
      const k = el < .1 ? pop(el / .1) : 1;
      const fade = clamp(1.6 - t * 1.6, 0, 1);
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = fade;
      if (which === 0) {
        starburst(ctx, 0, 0, 52 * k, 26 * k, 11, el * 2, '#ffe14a', INK, 3.5);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, 0, 18 * k, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 5 * (1 - t);
        ctx.beginPath(); ctx.arc(0, 0, 50 + ease(t) * 60, 0, TAU); ctx.stroke();
        word(ctx, '咚！', dir * 40, -108, 32 * k, INK, '#ffe14a');
      } else if (which === 1) {
        ctx.lineCap = 'round';
        for (const s of [-1, 1]) {
          const sw = ease(el / .12);
          ctx.save();
          ctx.rotate(s * (.75 - .5 * sw));
          ctx.strokeStyle = INK; ctx.lineWidth = 13;
          ctx.beginPath(); ctx.moveTo(-dir * 70, 0); ctx.lineTo(dir * 70, 0); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7;
          ctx.beginPath(); ctx.moveTo(-dir * 66, 0); ctx.lineTo(dir * 66, 0); ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle = '#b48cff';
        for (let i = 0; i < 5; i++) sparkle(ctx, Math.cos(i * 1.3) * 40 * ease(t * 2), Math.sin(i * 1.3) * 40 * ease(t * 2), 8 * (1 - t));
        word(ctx, '咔嚓！', dir * 40, -108, 28 * k, INK, '#b48cff');
      } else {
        // Five fingers of air fanned forward, and a ring of wind.
        ctx.strokeStyle = '#ffffff';
        ctx.lineCap = 'round';
        for (let i = 0; i < 5; i++) {
          const a = (i - 2) * .32;
          const len = 40 + 70 * ease(t * 1.4);
          ctx.globalAlpha = fade * .9;
          ctx.lineWidth = 9 - Math.abs(i - 2) * 1.5;
          ctx.beginPath(); ctx.moveTo(dir * Math.cos(a) * 20, Math.sin(a) * 20); ctx.lineTo(dir * Math.cos(a) * len, Math.sin(a) * len); ctx.stroke();
        }
        ctx.strokeStyle = '#7fd0ff';
        ctx.globalAlpha = fade * .8;
        ctx.lineWidth = 5 * (1 - t);
        ctx.beginPath(); ctx.ellipse(dir * 30, 0, 22 + ease(t) * 30, 34 + ease(t) * 40, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = fade;
        word(ctx, '啪！', dir * 40, -108, 30 * k, INK, '#7fd0ff');
      }
      break;
    }
    case 'misaki-rainbow': {
      // 美咲's dash trails the band in five ribbons, wavy and bright, with a few stars shaken off them.
      const len = (50 + 140 * ease(el / .2)) * (1 - Math.max(0, t - .5) / .5);
      const fade = clamp(e.life * 4, 0, 1) * .8;
      ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const y = e.y - 62 - i * 17;
        ctx.globalAlpha = fade;
        ctx.strokeStyle = HHW[i];
        ctx.lineWidth = 7;
        ctx.beginPath();
        for (let k = 0; k <= 10; k++) {
          const u = k / 10;
          const x = e.x - dir * (18 + u * len);
          const yy = y + Math.sin(u * 7 - el * 26 + i) * 5 * u;
          if (k === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      for (let i = 0, m = n(6); i < m; i++) {
        const u = cycleU(el, i);
        ctx.globalAlpha = fade * (1 - u);
        sparkle(ctx, e.x - dir * (40 + u * len), e.y - 70 - hash(i, 4) * 70 + u * 20, 6 * (1 - u * .6));
      }
      break;
    }
    case 'misaki-harisen': {
      // The paper fan: pleats swing down from overhead onto them, a 「啪！」 star where it lands, then it lifts away.
      // Swung from straight up down onto the top of their head, pivoting on her hand up and behind them.
      const swing = ease(el / .09);
      const down = -1.9 + 2.5 * swing;
      const fade = clamp(1.6 - t * 1.6, 0, 1);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(e.x - dir * 70, e.y - 110);
      ctx.scale(dir, 1);
      ctx.rotate(down);
      // Handle, then seven pleats fanning out from it.
      ctx.fillStyle = PINK;
      ctx.fillRect(0, -6, 36, 12);
      for (let i = 0; i < 7; i++) {
        const a0 = (i - 3.5) * .16, a1 = a0 + .16;
        ctx.fillStyle = i % 2 ? '#ffffff' : '#e9e6f0';
        ctx.beginPath(); ctx.moveTo(30, 0);
        ctx.lineTo(30 + Math.cos(a0) * 96, Math.sin(a0) * 96); ctx.lineTo(30 + Math.cos(a1) * 96, Math.sin(a1) * 96);
        ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(30, 0, 96, -.56, .56); ctx.stroke();
      ctx.restore();
      if (el > .08) {
        const k = pop((el - .08) / .12);
        ctx.globalAlpha = fade;
        starburst(ctx, e.x + dir * 34, e.y - 46, 52 * k, 26 * k, 10, .3, '#ffffff', INK, 3);
        word(ctx, '啪！', e.x + dir * 34, e.y - 46, 28 * k, INK, '#ffe14a');
        ctx.fillStyle = HHW[0];
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * TAU + .3;
          sparkle(ctx, e.x + dir * 34 + Math.cos(a) * (50 + ease(t) * 30), e.y - 46 + Math.sin(a) * (50 + ease(t) * 30), 7 * (1 - t));
        }
      }
      break;
    }
    case 'misaki-suits': {
      // 黑衣人: four of them run in from both sides through the windup, circle her as a curtain, then scatter.
      const t0 = e.t0 ?? .3;
      const out = e.max - .14;
      const h = 168;
      const glint = el > t0 && el < t0 + .25 ? (el - t0) / .25 : 0;
      for (let i = 0; i < 4; i++) {
        const side = i % 2 ? 1 : -1;
        let x: number, depth: number, a: number;
        if (el < t0) {
          const k = ease(el / t0);
          x = side * (300 - 240 * k) + (i < 2 ? 0 : side * 40);
          depth = i < 2 ? 1 : 0;
          a = k;
        } else if (el < out) {
          const ang = (el - t0) * 9 + i * TAU / 4;
          x = Math.cos(ang) * 64;
          depth = (Math.sin(ang) + 1) / 2;
          a = 1;
        } else {
          const k = ease((el - out) / .14);
          const ang = (out - t0) * 9 + i * TAU / 4;
          x = Math.cos(ang) * (64 + 220 * k);
          depth = 1;
          a = 1 - k;
        }
        const sc = .9 + depth * .14;
        ctx.save();
        ctx.translate(e.x + x, e.y);
        ctx.scale(sc * (x > 0 ? -1 : 1), sc);
        // A short afterimage while they move fast.
        if (!lite && (el < t0 || el > out)) suit(ctx, h, a * .25, 0);
        ctx.translate((el < t0 ? -side : 0) * -10, 0);
        suit(ctx, h, a, glint);
        ctx.restore();
      }
      break;
    }
    case 'misaki-bearify': {
      // How she sees them: two pink bear ears on their head and a pink haze, manga focus lines round the pair, and
      // little 米歇尔 heads circling them like stars after a knock. Purely the gag; the body stays readable.
      const k = ease(el / .2);
      ctx.save();
      ctx.globalAlpha = Math.min(1, e.life * 5) * .35;
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      for (let i = 0, m = n(16); i < m; i++) {
        const a = i / m * TAU + hash(i, 21) * .2;
        const r0 = 120 + hash(i + Math.floor(el * 20), 22) * 25;
        ctx.lineWidth = 1.5 + hash(i, 23) * 2;
        ctx.beginPath(); ctx.moveTo(e.x + Math.cos(a) * r0, e.y - 95 + Math.sin(a) * r0 * .9); ctx.lineTo(e.x + Math.cos(a) * (r0 + 55), e.y - 95 + Math.sin(a) * (r0 + 55) * .9); ctx.stroke();
      }
      ctx.restore();
      for (let i = 0; i < 3; i++) {
        const a = el * 5 + i * TAU / 3;
        ctx.save();
        ctx.globalAlpha = Math.min(1, e.life * 5) * k;
        ctx.translate(e.x + Math.cos(a) * 52, e.y - 205 + Math.sin(a) * 14);
        ctx.scale(.9, .9);
        bearHead(ctx, 11);
        ctx.restore();
      }
      ctx.globalAlpha = Math.min(1, e.life * 5) * .2 * k;
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 95, 62, 100, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = Math.min(1, e.life * 5);
      const wob = Math.sin(el * 30) * 3;
      for (const s of [-1, 1]) {
        ctx.fillStyle = SOFT;
        ctx.beginPath(); ctx.arc(e.x + s * 28, e.y - 178 - 10 * k + wob * s, 16 * pop(el / .2), 0, TAU); ctx.fill();
        ctx.fillStyle = CREAM;
        ctx.beginPath(); ctx.arc(e.x + s * 28, e.y - 178 - 10 * k + wob * s, 8 * pop(el / .2), 0, TAU); ctx.fill();
      }
      break;
    }
    case 'misaki-yank': {
      // Each tug: three white speed lines straight up over their head, longer every yank.
      const len = 30 + (e.n ?? 0) * 12;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      ctx.lineWidth = 4;
      for (let i = -1; i <= 1; i++) {
        const x = e.x + i * 22;
        ctx.beginPath(); ctx.moveTo(x, e.y - ease(t) * 20); ctx.lineTo(x, e.y - len - ease(t) * 30); ctx.stroke();
      }
      break;
    }
    case 'misaki-headfly': {
      // The head she tore off sails up and away, spinning, then drops out of the frame.
      const x = e.x + dir * 260 * el;
      const y = e.y - 420 * el + 700 * el * el;
      ctx.translate(x, y);
      ctx.rotate(dir * el * 9);
      ctx.globalAlpha = Math.min(1, e.life * 4);
      drawHead(ctx, images, 80);
      break;
    }
    case 'misaki-bagdash': {
      // The bagged lunge: grey speed lines behind her and two 「？」 bobbing off the bag.
      const fade = clamp(e.life * 6, 0, 1);
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const y = e.y - 40 - i * 24;
        const len = 50 + hash(i + Math.floor(el * 24), 31) * 70;
        ctx.globalAlpha = fade * .55;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(e.x - dir * 40, y); ctx.lineTo(e.x - dir * (40 + len), y); ctx.stroke();
      }
      ctx.globalAlpha = fade;
      for (let i = 0; i < 2; i++) word(ctx, '？', e.x + dir * (10 + i * 22), e.y - 205 - i * 14 + Math.sin(el * 18 + i * 2) * 5, 20 + i * 4, INK, PAPER);
      break;
    }
    case 'misaki-tear': {
      // The tear: a big pink star, 「米歇尔？！」 across it, a ring of hearts and the band's confetti.
      const k = el < .12 ? pop(el / .12) : 1;
      const fade = clamp(1.5 - t * 1.5, 0, 1);
      ctx.globalAlpha = fade;
      starburst(ctx, e.x, e.y, 96 * k, 48 * k, 12, el, '#ffffff', PINK, 5);
      word(ctx, '米歇尔？！', e.x, e.y, 30 * k, PINK, INK);
      ctx.fillStyle = PINK;
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + el * 2;
        heart(ctx, e.x + Math.cos(a) * (90 + ease(t) * 50), e.y + Math.sin(a) * (60 + ease(t) * 40), 9 * (1 - t * .5));
      }
      burst(el, 77, { n: n(16), life: e.max, speed: [260, 460], gravity: 600 }, (x, y, kk, i) => {
        ctx.globalAlpha = 1 - kk;
        ctx.fillStyle = HHW[i % HHW.length];
        confetti(ctx, x, y, 9, 5, el * 10 + i, Math.cos(el * 16 + i));
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

/** 米歇尔's walk cell, `h` tall with the feet at 0, facing `face`. Falls back to a pink bear figure. */
function paradeBear(ctx: CanvasRenderingContext2D, images: ImageCache | undefined, h: number, face: number, step: number): void {
  const im = image(images, BEAR_SRC);
  ctx.save();
  ctx.scale(face, 1);
  if (im) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(keyed(im), (1 + step) * CELL, 0, CELL, CELL, -h / 2, -h * (1 - 12 / CELL), h, h);
  } else {
    ctx.fillStyle = SOFT;
    ctx.beginPath(); ctx.ellipse(0, -h * .3, h * .2, h * .28, 0, 0, TAU); ctx.fill();
    ctx.translate(0, -h * .72);
    bearHead(ctx, h * .2);
  }
  ctx.restore();
}

/** The giant as a parade balloon: the idle cell turned into one flat glossy pink shape (blown up 2.2×, a sheet
 *  cell goes soft — a flat fill with a painted highlight and a white rim cannot), floating a little off the
 *  floor, bobbing and leaning, held down on two ropes by two little 米歇尔 walking under it. Cached per image. */
const balloonCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
function balloonCell(im: HTMLImageElement): HTMLCanvasElement | undefined {
  const hit = balloonCache.get(im);
  if (hit) return hit;
  if (typeof document === 'undefined') return undefined;
  const pad = 10, size = CELL + pad * 2;
  const shape = document.createElement('canvas');
  shape.width = shape.height = size;
  const sg = shape.getContext('2d');
  if (!sg) return undefined;
  sg.drawImage(keyed(im), 0, 0, CELL, CELL, pad, pad, CELL, CELL);
  // A pink skin over the art: enough of it shows through to know her, the soft detail drowns in the gloss.
  sg.globalCompositeOperation = 'source-atop';
  sg.fillStyle = 'rgba(255,127,207,.42)';
  sg.fillRect(0, 0, size, size);
  // Painted volume, clipped to the shape: a soft shine up and to the left, a deeper pink round the bottom.
  const shine = sg.createRadialGradient(size * .42, size * .26, 4, size * .42, size * .3, size * .42);
  shine.addColorStop(0, 'rgba(255,255,255,.85)');
  shine.addColorStop(.35, 'rgba(255,220,240,.35)');
  shine.addColorStop(1, 'rgba(255,220,240,0)');
  sg.fillStyle = shine;
  sg.fillRect(0, 0, size, size);
  const deep = sg.createLinearGradient(0, size * .45, 0, size);
  deep.addColorStop(0, 'rgba(200,40,140,0)');
  deep.addColorStop(1, 'rgba(200,40,140,.55)');
  sg.fillStyle = deep;
  sg.fillRect(0, 0, size, size);
  // A white rim: the shape stamped round itself, under it.
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const og = out.getContext('2d');
  if (!og) return undefined;
  const rim = document.createElement('canvas');
  rim.width = rim.height = size;
  const rg = rim.getContext('2d');
  if (!rg) return undefined;
  rg.drawImage(shape, 0, 0);
  rg.globalCompositeOperation = 'source-in';
  rg.fillStyle = '#ffffff';
  rg.fillRect(0, 0, size, size);
  for (let i = 0; i < 12; i++) og.drawImage(rim, Math.cos(i / 12 * TAU) * 3, Math.sin(i / 12 * TAU) * 3);
  og.drawImage(shape, 0, 0);
  balloonCache.set(im, out);
  return out;
}
function paradeBalloon(ctx: CanvasRenderingContext2D, images: ImageCache | undefined, p: Projectile, face: number): void {
  const h = LAND_BIG_H;
  const floor = p.y + LAND_BIG_FOOT;
  const bob = Math.sin(p.age * 3.2) * 8;
  const lean = Math.sin(p.age * 2.1) * .05 - face * .04;
  const lift = 34;
  const cx = p.x, base = floor - lift + bob;
  // Its shadow on the floor, smaller when it bobs up: it floats.
  ctx.globalAlpha = .28 - bob * .01;
  ctx.fillStyle = '#12060f';
  ctx.beginPath(); ctx.ellipse(cx, floor - 2, h * .24 - bob, 12, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  // The two handlers and their ropes, drawn first so the balloon sits over the knots.
  const handlers = [-.28, .22];
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = 2.5;
  for (const k of handlers) {
    const hx = cx + face * k * h;
    ctx.beginPath(); ctx.moveTo(hx, floor - 52); ctx.quadraticCurveTo(hx - face * 10, (floor + base - h * .45) / 2, cx + face * k * h * .55, base - h * .42); ctx.stroke();
  }
  for (const k of handlers) {
    ctx.save();
    ctx.translate(cx + face * k * h, floor);
    paradeBear(ctx, images, LAND_SMALL_H, face, Math.floor(p.age * 10 + (k > 0 ? 2 : 0)) % 4);
    ctx.restore();
  }
  const im = image(images, BEAR_SRC);
  const cell = im ? balloonCell(im) : undefined;
  ctx.save();
  ctx.translate(cx, base);
  ctx.rotate(lean);
  ctx.scale(face, 1);
  if (cell) {
    const pad = 10 * h / CELL;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(cell, -h / 2 - pad, -h * (1 - 12 / CELL) - pad, h + pad * 2, h + pad * 2);
  } else {
    ctx.fillStyle = SOFT;
    ctx.beginPath(); ctx.ellipse(0, -h * .3, h * .22, h * .3, 0, 0, TAU); ctx.fill();
    ctx.translate(0, -h * .72);
    bearHead(ctx, h * .2);
  }
  ctx.restore();
  // Glitter shaken off the balloon.
  ctx.fillStyle = '#ffffff';
  for (let i = 0, m = n(8); i < m; i++) {
    const u = cycleU(p.age, i);
    ctx.globalAlpha = 1 - u;
    sparkle(ctx, cx - face * (h * .2 + u * 120) + (hash(i, 61) - .5) * h * .4, base - h * (.2 + hash(i, 62) * .7) + u * 40, 6 + 4 * hash(i, 63));
  }
  ctx.globalAlpha = 1;
}

/** Shots: the missiles, the thrown head and the parade. True when drawn here (the stock dot trail is skipped). */
export function drawMisakiShot(ctx: CanvasRenderingContext2D, p: Projectile, images: ImageCache | undefined, liteFx: boolean): boolean {
  if (p.fx !== 'happy-missile' && p.fx !== 'bear-head' && p.fx !== 'michelle-land' && p.fx !== 'michelle-land-big') return false;
  lite = liteFx;
  ctx.save();
  if (p.fx === 'happy-missile') {
    // Round white smoke puffs behind it, growing as they thin out.
    for (let i = 0; i < p.trail.length; i++) {
      const q = p.trail[i], k = (i + 1) / p.trail.length;
      ctx.globalAlpha = k * .7;
      ctx.fillStyle = i % 2 ? CREAM : '#ffffff';
      ctx.beginPath(); ctx.arc(q.x, q.y, 4 + (1 - k) * 12, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(p.vy, p.vx));
    ctx.scale(1.5, 1.5);
    // Flame, body with a white band and a heart, nose cone, and two round bear-ear fins at the tail.
    const fl = 14 + Math.sin(p.age * 60) * 4;
    ctx.fillStyle = '#ffb347';
    ctx.beginPath(); ctx.moveTo(-15, -6); ctx.lineTo(-15 - fl, 0); ctx.lineTo(-15, 6); ctx.fill();
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath(); ctx.moveTo(-15, -3.5); ctx.lineTo(-15 - fl * .6, 0); ctx.lineTo(-15, 3.5); ctx.fill();
    ctx.fillStyle = SOFT;
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(-12, k * 9, 5.5, 0, TAU); ctx.fill(); }
    ctx.fillStyle = PINK;
    ctx.beginPath(); ctx.roundRect(-17, -7.5, 29, 15, 7.5); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-6, -7.5, 5, 15);
    ctx.fillStyle = PAPER;
    ctx.beginPath(); ctx.moveTo(11, -7.5); ctx.quadraticCurveTo(25, 0, 11, 7.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.save(); ctx.translate(4, 0); ctx.rotate(Math.PI / 2); heart(ctx, 0, 0, 3.2); ctx.restore();
  } else if (p.fx === 'bear-head') {
    // Rolls: the spin follows the distance it has travelled.
    ctx.translate(p.x, p.y);
    ctx.rotate((p.x / 34) * (Math.sign(p.vx) || 1) * .5);
    drawHead(ctx, images, p.size);
  } else {
    const big = p.fx === 'michelle-land-big';
    if (big) {
      paradeBalloon(ctx, images, p, Math.sign(p.vx) || 1);
      ctx.restore();
      return true;
    }
    const h = big ? LAND_BIG_H : LAND_SMALL_H;
    const face = Math.sign(p.vx) || 1;
    const step = Math.floor(p.age * (big ? 5 : 10) + (p.wave ?? 0)) % 4;
    const bob = Math.abs(Math.sin(p.age * (big ? 10 : 20) + (p.wave ?? 0))) * (big ? 6 : 4);
    ctx.translate(p.x, p.y + (big ? LAND_BIG_FOOT : LAND_SMALL_FOOT) - bob);
    // The balloon on its string, held up behind.
    const color = BALLOONS[(p.wave ?? 0) % BALLOONS.length];
    const bx = -face * h * .22, by = -h * (big ? 1.08 : 1.25);
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.lineWidth = big ? 3 : 1.5;
    ctx.beginPath(); ctx.moveTo(-face * h * .12, -h * .55); ctx.quadraticCurveTo(bx - face * 6, (by - h * .55) / 2 - h * .3, bx, by); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(bx, by - h * .08, h * .09, h * .11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.ellipse(bx - h * .03, by - h * .12, h * .02, h * .035, -.4, 0, TAU); ctx.fill();
    paradeBear(ctx, images, h, face, step);
    void FLOOR;
  }
  ctx.restore();
  return true;
}
