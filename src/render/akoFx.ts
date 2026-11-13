import type { Effect, Projectile } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import type { ImageCache } from '../assets/loader.ts';
import { H, W, clamp } from '../game/constants.ts';
import { AKO_CHANT, AKO_LINES } from '../game/akoPath.ts';
import { CELL, HIMARI_FRIEND_ROW, HIMARI_FRIENDS, HIMARI_FRIENDS_SRC } from './clips.ts';
import { TAU, burst, dot, glow, hash, sparkle, stampText } from './fxParticles.ts';

/* 宇田川亚子 — 暗紫与亮粉，越中二越好。Four registers, kept apart so each move reads at a glance:
   - 龙之右眼 / 魔法: a great eye that opens in front of her face (U), a standing spell circle behind her that
     stalls grey while she is stuck and relights pink with an eye glint once 燐子 (rinko.png) has slipped her the
     line (I), a dark orb on little bat wings that sheds black feathers and stamps a pentagram where it lands;
   - sleep: a hypnosis disc (bands of violet and pink, wobbling) with ripples and Z's; the 'ako-hypno' 定身 look is
     a swinging coin on a string over the head and Z's drifting off;
   - 宇田川姐妹: drum-hit words (咚！ 哒！) on her jabs, and behind 巴 a spinning 三つ巴 crest (her name) in festival
     red, then a 「咚！！」 the size of a drum skin;
   - the game (NFO): a violet vignette, a summoning gate behind her, a cast window, RPG damage numbers and a HIT
     counter, CRITICAL!!, and a gold 「STAGE 1 CLEAR!」 over turning rays.
   Flat shapes and cached glow / text stamps only; no shadowBlur. The eight small spirits, the orb fill, the
   gate mouth and the light pillars are stamped once and blitted; the one big spirit stays a live path so its
   tail does not step. The busiest moment (the landing) is ~30 particles. */

export const AKO_BACK: readonly string[] = ['ako-circle', 'ako-sigil', 'ako-nfo-circle', 'ako-gate', 'ako-rinko', 'ako-tomoe', 'ako-warn'];
export const AKO_SCREEN_BACK: readonly string[] = ['ako-dim'];
export const AKO_SCREEN_FRONT: readonly string[] = ['ako-nfo', 'ako-clear'];
export const RINKO = '/sprites/ako/rinko.png';

const PINK = '#DD0088';
const HOT = '#ff5cc8';
const VIOLET = '#6b2fb3';
const INK = '#1c0f2e';
const PINK_RGB = '255,92,200';
const VIOLET_RGB = '140,80,230';
const TOMOE = '#BB0033';
const TOMOE_RGB = '230,40,80';
const GOLD = '#ffd66b';
const PALE = '#ffd1f0';
const GREY = '#8a7fa0';
const GOLD_RGB = '255,214,107';
const INK_RGB = '60,20,100';

const n = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const fadeIO = (el: number, life: number, a: number, b: number) => clamp(Math.min(el / a, life / b), 0, 1);

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

/* ---- baked silhouettes ---- */

const keyCache = new WeakMap<HTMLImageElement, CanvasImageSource>();
/** The picture with the chroma green and the placeholder sheet chrome cut out. */
function keyed(im: HTMLImageElement): CanvasImageSource {
  const hit = keyCache.get(im);
  if (hit) return hit;
  if (typeof document === 'undefined') return im;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
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
  keyCache.set(im, c);
  return c;
}
const tintCache = new WeakMap<CanvasImageSource, Map<string, HTMLCanvasElement>>();
/** A region of a picture as a flat silhouette in one colour, baked once. */
function tinted(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, color: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let per = tintCache.get(src);
  if (!per) { per = new Map(); tintCache.set(src, per); }
  const key = sx + ',' + sy + ',' + sw + '|' + color;
  const hit = per.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, sw, sh);
  if (per.size >= 16) per.clear();
  per.set(key, c);
  return c;
}
/** A summoned figure: her art, a wash of `color` over it (the art shows through), a soft white rim, two afterimages. */
function summon(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, h: number, color: string, k: number, wash: number): void {
  const sil = tinted(src, sx, sy, sw, sh, color);
  const rim = tinted(src, sx, sy, sw, sh, '#ffffff');
  if (!sil || !rim) return;
  const w = h * sw / sh;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 1; i <= 2; i++) {
    ctx.globalAlpha = k * .14 / i;
    ctx.drawImage(sil, -w / 2 - i * 9, -h, w, h);
  }
  const big = 1.05;
  ctx.globalAlpha = k * .35;
  ctx.drawImage(rim, -w * big / 2, -h * big + h * .03, w * big, h * big);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = k;
  ctx.drawImage(src, sx, sy, sw, sh, -w / 2, -h, w, h);
  ctx.globalAlpha = k * wash;
  ctx.drawImage(sil, -w / 2, -h, w, h);
}
/** Before a picture streams in: a plain figure in one colour. */
function stand(ctx: CanvasRenderingContext2D, h: number, color: string, k: number): void {
  ctx.globalAlpha = k * .8;
  ctx.fillStyle = color;
  ctx.fillRect(-11, -h * .66, 22, h * .4);
  ctx.fillRect(-10, -h * .28, 8, h * .28);
  ctx.fillRect(2, -h * .28, 8, h * .28);
  ctx.beginPath(); ctx.arc(0, -h * .77, h * .095, 0, TAU); ctx.fill();
}

/* ---- little shapes ---- */

/** A five-pointed star outline (the pentagram) of radius r, turned by rot. Flattened by squash for a floor circle. */
function pentagram(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, squash = 1): void {
  if (!(r > 0)) return;
  ctx.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = rot + (i * 2 % 5) * TAU / 5 - Math.PI / 2;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * squash;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
}
/** Tick runes round a ring: short strokes and little crosses, every `skip`-th one dropped (a sputtering circle). */
function runes(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, squash: number, count: number, gap = -1): void {
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    if (gap >= 0 && hash(i, gap) < .35) continue;
    const a = rot + i * TAU / count;
    const c = Math.cos(a), s = Math.sin(a);
    const px = x + c * r, py = y + s * r * squash;
    if (i % 3 === 0) {
      ctx.moveTo(px - 3, py); ctx.lineTo(px + 3, py); ctx.moveTo(px, py - 3 * squash); ctx.lineTo(px, py + 3 * squash);
    } else {
      ctx.moveTo(px - c * 4, py - s * 4 * squash); ctx.lineTo(px + c * 4, py + s * 4 * squash);
    }
  }
  ctx.stroke();
}
/** A spell circle: glow, two rings, a pentagram and runes. squash flattens it onto the floor. */
function spellCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, squash: number, alpha: number, line: string, rgb: string, gap = -1): void {
  if (!(r > 0)) return;
  ctx.globalAlpha = alpha * .4;
  glow(ctx, x, y, r * 1.15, rgb);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = line;
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * squash, 0, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(x, y, r * .8, r * .8 * squash, 0, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1.8;
  pentagram(ctx, x, y, r * .78, rot, squash);
  ctx.lineWidth = 1.4;
  runes(ctx, x, y, r * .9, -rot * 1.4, squash, 18, gap);
}
/** Violet flame wisps licking up round a point on the floor. */
function wisps(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, t: number, count: number, alpha: number): void {
  for (let i = 0; i < count; i++) {
    const u = (t * 1.3 + hash(i, 11)) % 1;
    const px = x + (hash(i, 12) - .5) * w * 2 + Math.sin(t * 6 + i) * 4;
    const py = y - u * 70;
    const s = (1 - u) * (7 + hash(i, 13) * 6);
    ctx.globalAlpha = alpha * (1 - u) * .9;
    ctx.fillStyle = i % 2 ? '#a46cff' : HOT;
    ctx.beginPath();
    ctx.moveTo(px, py - s * 2.2);
    ctx.quadraticCurveTo(px + s, py - s * .2, px, py + s * .7);
    ctx.quadraticCurveTo(px - s, py - s * .2, px, py - s * 2.2);
    ctx.fill();
  }
}
/** A black feather, quill along rot. */
function feather(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number): void {
  if (!(s > 0)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * .55, -s * .1, 0, s);
  ctx.quadraticCurveTo(-s * .55, -s * .1, 0, -s);
  ctx.fill();
  ctx.strokeStyle = '#7a3fc0';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -s * .9); ctx.lineTo(0, s * 1.1); ctx.stroke();
  ctx.restore();
}
/** A little bat wing on the orb, `side` -1 above / 1 below the heading, opened by flap 0..1. */
function wing(ctx: CanvasRenderingContext2D, s: number, side: number, flap: number): void {
  const k = side * (.45 + flap * .55);
  ctx.fillStyle = INK;
  ctx.strokeStyle = HOT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-s * .2, 0);
  ctx.lineTo(-s * .6, -s * 1.5 * k);
  ctx.quadraticCurveTo(-s * .9, -s * 1.05 * k, -s * 1.25, -s * 1.15 * k);
  ctx.quadraticCurveTo(-s * 1.15, -s * .7 * k, -s * 1.5, -s * .65 * k);
  ctx.quadraticCurveTo(-s * 1.1, -s * .3 * k, -s * .6, -s * .05 * k);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
}
/** 三つ巴: three commas chasing round a ring, in festival red with a gold rim. */
function mitsudomoe(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  if (!(r > 0)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = '#fff3e0';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = Math.max(2, r * .08);
  ctx.stroke();
  ctx.fillStyle = TOMOE;
  for (let k = 0; k < 3; k++) {
    ctx.save();
    ctx.rotate(k * TAU / 3);
    ctx.beginPath();
    ctx.arc(0, -r * .42, r * .3, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * .3, -r * .42);
    ctx.quadraticCurveTo(r * .55, r * .2, -r * .1, r * .55);
    ctx.quadraticCurveTo(r * .2, r * .1, -r * .05, -r * .2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
/** The teardrop body in local space: violet tail to pink head. `wob` is the tail's vertical twitch. */
function paintSpiritBody(ctx: CanvasRenderingContext2D, s: number, wob: number): void {
  const gr = ctx.createLinearGradient(-s * 1.7, 0, s * .6, 0);
  gr.addColorStop(0, 'rgba(107,47,179,0)');
  gr.addColorStop(.45, VIOLET);
  gr.addColorStop(1, HOT);
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.moveTo(s * .58, 0);
  ctx.bezierCurveTo(s * .58, -s * .66, -s * .25, -s * .66, -s * .55, -s * .32);
  ctx.quadraticCurveTo(-s * 1.15, -s * .05 + wob, -s * 1.7, wob * 1.6);
  ctx.quadraticCurveTo(-s * 1.15, s * .2 + wob, -s * .55, s * .34);
  ctx.bezierCurveTo(-s * .25, s * .66, s * .58, s * .66, s * .58, 0);
  ctx.fill();
}
/* ponytail: eight small spirits share 16 wobble stamps instead of a gradient and a bezier each frame.
   At their size a step is under a pixel. The big spirit (s > 64) stays live. More steps if the tail ticks. */
const SPIRIT_S = 48;
const SPIRIT_STEPS = 16;
const SPIRIT_OX = 1.7 * SPIRIT_S + 8;
const SPIRIT_OY = .8 * SPIRIT_S + 8;
const SPIRIT_W = SPIRIT_OX + .7 * SPIRIT_S + 8;
const SPIRIT_H = SPIRIT_OY + .8 * SPIRIT_S + 8;
const spiritFrames: (HTMLCanvasElement | undefined)[] = [];
function spiritStamp(q: number): HTMLCanvasElement | null {
  const hit = spiritFrames[q];
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.ceil(SPIRIT_W); c.height = Math.ceil(SPIRIT_H);
  const g = c.getContext('2d');
  if (!g) return null;
  g.translate(SPIRIT_OX, SPIRIT_OY);
  paintSpiritBody(g, SPIRIT_S, (-1 + q * 2 / (SPIRIT_STEPS - 1)) * SPIRIT_S * .12);
  spiritFrames[q] = c;
  return c;
}
function drawSpiritBody(ctx: CanvasRenderingContext2D, s: number, wob: number): void {
  if (s > 64) { paintSpiritBody(ctx, s, wob); return; }
  const u = wob / (s * .12);
  let q = Math.round((u + 1) * (SPIRIT_STEPS - 1) / 2);
  if (q < 0) q = 0; else if (q >= SPIRIT_STEPS) q = SPIRIT_STEPS - 1;
  const c = spiritStamp(q);
  if (!c) { paintSpiritBody(ctx, s, wob); return; }
  const k = s / SPIRIT_S;
  ctx.drawImage(c, -SPIRIT_OX * k, -SPIRIT_OY * k, c.width * k, c.height * k);
}
/** A teardrop spirit: violet tail to pink head, round eyes, a small open mouth; `devil` adds horns and a grin. */
function spirit(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, ang: number, t: number, devil = false): void {
  if (!(s > 0)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const wob = Math.sin(t * 14) * s * .12;
  drawSpiritBody(ctx, s, wob);
  ctx.rotate(-ang);
  const ex = Math.cos(ang) * s * .2, ey = Math.sin(ang) * s * .2;
  if (devil) {
    ctx.fillStyle = INK;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(ex + side * s * .22, ey - s * .42);
      ctx.quadraticCurveTo(ex + side * s * .5, ey - s * .75, ex + side * s * .42, ey - s * 1.05);
      ctx.quadraticCurveTo(ex + side * s * .32, ey - s * .7, ex + side * s * .05, ey - s * .5);
      ctx.fill();
    }
    // Glowing slanted eyes and a zigzag grin.
    ctx.fillStyle = '#fff0fa';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(ex + side * s * .06, ey - s * .12);
      ctx.lineTo(ex + side * s * .34, ey - s * .2);
      ctx.lineTo(ex + side * s * .28, ey - s * .02);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(ex - s * .3, ey + s * .1);
    for (let i = 0; i <= 6; i++) ctx.lineTo(ex - s * .3 + i * s * .1, ey + s * (i % 2 ? .22 : .12));
    ctx.lineTo(ex + s * .3, ey + s * .3);
    ctx.quadraticCurveTo(ex, ey + s * .46, ex - s * .3, ey + s * .3);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#ffffff';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(ex + side * s * .17, ey - s * .06, s * .11, s * .15, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = INK;
    for (const side of [-1, 1]) dot(ctx, ex + side * s * .17 + Math.cos(ang) * s * .03, ey - s * .04, s * .06);
    ctx.beginPath(); ctx.ellipse(ex, ey + s * .17, s * .07, s * .09 + Math.abs(wob) * .3, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
/** The hypnosis disc: bands of violet and pink, each centre wobbling a little round the last, a pale rim. */
function hypnoDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, dir: number): void {
  if (!(r > 0)) return;
  const rx = .42;
  for (let i = 0; i < 5; i++) {
    const k = 1 - i * .19;
    const a = t * 7 * dir + i * 1.3;
    const cx = x + Math.cos(a) * r * .06 * i * rx, cy = y + Math.sin(a) * r * .06 * i;
    ctx.fillStyle = i % 2 ? HOT : i === 4 ? PALE : VIOLET;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * k * rx, r * k, 0, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y, r * rx, r, 0, -Math.PI / 2, Math.PI / 2, dir < 0); ctx.stroke();
}
function zee(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  stampText(ctx, 'Z', x, y, s, color, INK, 900);
}
function drop(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.4);
  ctx.quadraticCurveTo(x + s, y - s * .1, x, y + s * .8);
  ctx.quadraticCurveTo(x - s, y - s * .1, x, y - s * 1.4);
  ctx.fill();
}
/** A four-point anime glint: a long horizontal streak and a short vertical one. */
function glint(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, k: number): void {
  if (!(len > 0)) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = k * .7;
  glow(ctx, x, y, len * .35, PINK_RGB);
  ctx.globalAlpha = k;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x - len, y); ctx.lineTo(x, y - 3); ctx.lineTo(x + len, y); ctx.lineTo(x, y + 3); ctx.closePath();
  ctx.moveTo(x, y - len * .45); ctx.lineTo(x + 2.5, y); ctx.lineTo(x, y + len * .45); ctx.lineTo(x - 2.5, y); ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}
function medal(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, face: string, label: string, sway: number): void {
  if (!(r > 0)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  ctx.fillStyle = '#4b2a7a';
  ctx.beginPath(); ctx.moveTo(-r * .5, -r * 2); ctx.lineTo(0, -r * .7); ctx.lineTo(r * .5, -r * 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = face;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * .7;
  ctx.beginPath(); ctx.arc(-r * .35, -r * .35, r * .22, 0, TAU); ctx.fill();
  ctx.globalAlpha = a;
  stampText(ctx, label, 0, 1, r * .78, INK, '', 900);
  ctx.restore();
}
/** A word that pops in big and settles: drum hits, damage numbers. */
function popWord(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, el: number, life: number, fill: string, line: string): void {
  const pop = 1 + Math.max(0, .1 - el) * 6;
  ctx.globalAlpha = fadeIO(el, life, .04, .18);
  stampText(ctx, text, x, y, size * pop, fill, line, 900);
}
/** One column of the pillar gradient, with a clear head so the bright core can stand 1.1× taller. */
const pillarStamps = new Map<string, HTMLCanvasElement>();
const PILLAR_TOP = 10;
const PILLAR_BODY = 100;
function pillarStamp(rgb: string): HTMLCanvasElement | null {
  const hit = pillarStamps.get(rgb);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 4; c.height = PILLAR_TOP + PILLAR_BODY;
  const g = c.getContext('2d');
  if (!g) return null;
  const gr = g.createLinearGradient(0, PILLAR_TOP, 0, c.height);
  gr.addColorStop(0, `rgba(${rgb},0)`);
  gr.addColorStop(.7, `rgba(${rgb},.55)`);
  gr.addColorStop(1, 'rgba(255,255,255,.8)');
  g.fillStyle = gr;
  g.fillRect(0, PILLAR_TOP, c.width, PILLAR_BODY);
  pillarStamps.set(rgb, c);
  return c;
}
/** A pale cloud of a vertical light pillar, brightest at the floor, narrowing as it fades. */
function pillar(ctx: CanvasRenderingContext2D, x: number, floor: number, w: number, hgt: number, k: number, rgb: string): void {
  if (!(w > 0) || !(hgt > 0) || !(k > 0)) return;
  ctx.globalCompositeOperation = 'lighter';
  const stamp = pillarStamp(rgb);
  if (stamp) {
    ctx.globalAlpha = k;
    ctx.drawImage(stamp, 0, PILLAR_TOP, stamp.width, PILLAR_BODY, x - w / 2, floor - hgt, w, hgt);
    ctx.drawImage(stamp, 0, 0, stamp.width, stamp.height, x - w * .18, floor - hgt * 1.1, w * .36, hgt * 1.1);
  } else {
    const gr = ctx.createLinearGradient(0, floor - hgt, 0, floor);
    gr.addColorStop(0, `rgba(${rgb},0)`);
    gr.addColorStop(.7, `rgba(${rgb},${(.55 * k).toFixed(3)})`);
    gr.addColorStop(1, `rgba(255,255,255,${(.8 * k).toFixed(3)})`);
    ctx.fillStyle = gr;
    ctx.fillRect(x - w / 2, floor - hgt, w, hgt);
    ctx.fillRect(x - w * .18, floor - hgt * 1.1, w * .36, hgt * 1.1);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** The dark orb's shaded body, one radial fill scaled to `s`. */
const ORB_S = 64;
const ORB_PAD = 4;
let orbFill: HTMLCanvasElement | null | undefined;
function blitOrb(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  if (orbFill === undefined && typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    const d = (ORB_S + ORB_PAD) * 2;
    c.width = c.height = d;
    const g = c.getContext('2d');
    if (g) {
      const m = ORB_S + ORB_PAD;
      const gr = g.createRadialGradient(m - ORB_S * .25, m - ORB_S * .25, ORB_S * .1, m, m, ORB_S);
      gr.addColorStop(0, '#b27bff');
      gr.addColorStop(.55, '#3a1466');
      gr.addColorStop(1, INK);
      g.fillStyle = gr;
      g.beginPath(); g.arc(m, m, ORB_S, 0, TAU); g.fill();
      orbFill = c;
    } else orbFill = null;
  }
  const c = orbFill;
  if (!c) {
    const gr = ctx.createRadialGradient(x - s * .25, y - s * .25, s * .1, x, y, s);
    gr.addColorStop(0, '#b27bff');
    gr.addColorStop(.55, '#3a1466');
    gr.addColorStop(1, INK);
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
    return;
  }
  const k = s / ORB_S;
  ctx.drawImage(c, x - (ORB_S + ORB_PAD) * k, y - (ORB_S + ORB_PAD) * k, c.width * k, c.height * k);
}
/** The gate's dark mouth: a circular gradient filled into a standing ellipse, scaled to `r`. */
const GATE_R = 100;
let gateMouth: HTMLCanvasElement | null | undefined;
function blitGate(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (gateMouth === undefined && typeof document !== 'undefined') {
    const rx = GATE_R * .62, ry = GATE_R, pad = 2;
    const c = document.createElement('canvas');
    c.width = Math.ceil(rx * 2 + pad * 2); c.height = Math.ceil(ry * 2 + pad * 2);
    const g = c.getContext('2d');
    if (g) {
      const cx = c.width / 2, cy = c.height / 2;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, GATE_R);
      gr.addColorStop(0, '#05010c');
      gr.addColorStop(.7, '#2a0d52');
      gr.addColorStop(1, '#7a3fc0');
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill();
      gateMouth = c;
    } else gateMouth = null;
  }
  const c = gateMouth;
  if (!c) {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, '#05010c');
    gr.addColorStop(.7, '#2a0d52');
    gr.addColorStop(1, '#7a3fc0');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(x, y, r * .62, r, 0, 0, TAU); ctx.fill();
    return;
  }
  const k = r / GATE_R;
  ctx.drawImage(c, x - c.width / 2 * k, y - c.height / 2 * k, c.width * k, c.height * k);
}

/* ---- shots ---- */

function drawHypno(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean): void {
  const dir = Math.sign(p.vx) || 1;
  const s = p.size * .55;
  const k = clamp(p.age / .1, 0, 1) * clamp(p.life / .2, 0, 1);
  ctx.save();
  // Ripples left behind, opening as they fall back.
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const u = (p.age * 2.4 + i / 3) % 1;
    ctx.globalAlpha = k * (1 - u) * .7;
    ctx.strokeStyle = i % 2 ? HOT : '#b58cff';
    ctx.beginPath(); ctx.ellipse(p.x - dir * u * s * 1.6, p.y, s * (.4 + u * .25) * .55, s * (1 + u * .5), 0, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = k * .45;
  glow(ctx, p.x, p.y, s * 1.4, PINK_RGB);
  ctx.globalAlpha = k;
  hypnoDisc(ctx, p.x, p.y, s, p.age, dir);
  // Z's and little stars falling behind it.
  for (let i = 0; i < n(4, lite); i++) {
    const u = (p.age * 1.6 + i / 4) % 1;
    ctx.globalAlpha = k * (1 - u);
    if (i % 2) zee(ctx, p.x - dir * (s * .5 + u * 50), p.y - s * .7 - u * 34 + Math.sin(i * 3) * 8, 12 + u * 8, PALE);
    else { ctx.fillStyle = '#ffffff'; sparkle(ctx, p.x - dir * (s * .4 + u * 70), p.y + (hash(i, 4) - .5) * s * 1.4, 4 * (1 - u)); }
  }
  ctx.restore();
}
function drawOrb(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean): void {
  const dir = Math.sign(p.vx) || 1;
  const s = p.size * .3;
  const k = clamp(p.age / .08, 0, 1) * clamp(p.life / .15, 0, 1);
  ctx.save();
  // Black feathers shed behind it, and pink stars.
  for (let i = 0; i < n(6, lite); i++) {
    const u = (p.age * 2.2 + hash(i, 21)) % 1;
    ctx.globalAlpha = k * (1 - u);
    feather(ctx, p.x - dir * (s + u * 120), p.y + (hash(i, 22) - .5) * 26 + u * 30, 7 * (1 - u * .4), dir * (.8 + u * 2 + i));
  }
  ctx.fillStyle = PALE;
  for (let i = 0; i < n(6, lite); i++) {
    const u = (p.age * 3 + hash(i, 7)) % 1;
    ctx.globalAlpha = k * (1 - u) * .9;
    sparkle(ctx, p.x - dir * (s + u * 90), p.y + (hash(i, 9) - .5) * 30 * (1 + u), 5 * (1 - u * .6));
  }
  ctx.globalAlpha = k * .6;
  glow(ctx, p.x, p.y, s * 2.4, PINK_RGB);
  // Wings, flapping.
  const flap = .5 + .5 * Math.sin(p.age * 28);
  ctx.globalAlpha = k;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(dir, 1);
  wing(ctx, s, 1, flap);
  wing(ctx, s, -1, flap);
  ctx.restore();
  blitOrb(ctx, p.x, p.y, s);
  ctx.strokeStyle = HOT;
  ctx.lineWidth = 2;
  pentagram(ctx, p.x, p.y, s * .7, p.age * 4);
  ctx.beginPath(); ctx.arc(p.x, p.y, s * 1.06, 0, TAU); ctx.stroke();
  // Three tiny stars in orbit.
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 3; i++) {
    const a = p.age * 9 + i * TAU / 3;
    sparkle(ctx, p.x + Math.cos(a) * s * 1.5, p.y + Math.sin(a) * s * .55, 4);
  }
  ctx.restore();
}
function drawSpirit(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean): void {
  const k = clamp(p.age / .12, 0, 1) * clamp(p.life / .2, 0, 1);
  const ang = Math.atan2(p.vy, p.vx);
  const sp = Math.hypot(p.vx, p.vy) || 1;
  const s = p.size * .45;
  ctx.save();
  // A ghost-flame trail: fading copies back along the heading.
  for (let i = n(4, lite); i >= 1; i--) {
    ctx.globalAlpha = k * .16 * (5 - i) / 4;
    glow(ctx, p.x - p.vx / sp * i * s * .7, p.y - p.vy / sp * i * s * .7, s * (1 - i * .15), i % 2 ? PINK_RGB : VIOLET_RGB);
  }
  ctx.globalAlpha = k;
  spirit(ctx, p.x, p.y, s, ang, p.age + (p.wave ?? 0), (p.wave ?? 0) % 3 === 2);
  ctx.restore();
}
function drawSpiritBig(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean): void {
  const landed = p.returned ? p.age - (p.ticked ?? p.age) : 0;
  const k = clamp(p.life / .3, 0, 1);
  const s = p.size * .55 * (1 + landed * .5);
  ctx.save();
  ctx.globalAlpha = k * .55;
  glow(ctx, p.x, p.y, s * 1.7, INK_RGB);
  ctx.globalAlpha = k * .45;
  glow(ctx, p.x, p.y, s * 1.2, PINK_RGB);
  // Tattered wisps streaming up off it as it falls.
  ctx.fillStyle = '#a46cff';
  for (let i = 0; i < n(8, lite); i++) {
    const u = (p.age * 2 + hash(i, 31)) % 1;
    ctx.globalAlpha = k * (1 - u) * .7;
    dot(ctx, p.x + (hash(i, 32) - .5) * s * 1.6, p.y - s * .5 - u * 90, 4 * (1 - u) + 1);
  }
  ctx.globalAlpha = k;
  spirit(ctx, p.x, p.y, s, Math.PI / 2, p.age, true);
  ctx.restore();
}

export function drawAkoShot(ctx: CanvasRenderingContext2D, p: Projectile, lite = false, _images?: ImageCache): boolean {
  switch (p.fx) {
    case 'ako-hypno': drawHypno(ctx, p, lite); return true;
    case 'ako-chant': drawOrb(ctx, p, lite); return true;
    case 'ako-spirit': drawSpirit(ctx, p, lite); return true;
    case 'ako-spirit-big': drawSpiritBig(ctx, p, lite); return true;
  }
  return false;
}

/* ---- effects ---- */

/** The chant strip: a dark ribbon, the line typed on; stuck, it shakes under a hopping 「？」; prompted, it flashes. */
function scroll(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const { stuckFrom, stuckTo } = AKO_CHANT;
  const line = el < stuckFrom ? 0 : el < stuckTo ? 1 : 2;
  const text = AKO_LINES[line];
  const from = line === 0 ? 0 : line === 1 ? stuckFrom : stuckTo;
  const typed = line === 1 ? text.length : Math.min(text.length, Math.floor((el - from) / .025) + 1);
  const shake = line === 1 ? Math.sin(el * 70) * 2.2 : 0;
  const pop = line === 2 ? 1 + Math.max(0, .14 - (el - stuckTo)) * 2.5 : 1;
  const k = fadeIO(el, e.life, .1, .15);
  ctx.globalAlpha = k;
  ctx.save();
  ctx.translate(e.x + shake, e.y);
  ctx.scale(pop, pop);
  const w = 214, h = 32;
  ctx.fillStyle = line === 1 ? 'rgba(40,32,52,.9)' : 'rgba(28,15,46,.9)';
  ctx.strokeStyle = line === 2 ? HOT : line === 1 ? GREY : '#a070e0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 12, -h / 2); ctx.lineTo(w / 2 - 12, -h / 2); ctx.lineTo(w / 2, 0); ctx.lineTo(w / 2 - 12, h / 2);
  ctx.lineTo(-w / 2 + 12, h / 2); ctx.lineTo(-w / 2, 0); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Little pentagram studs at either end.
  ctx.lineWidth = 1.2;
  pentagram(ctx, -w / 2 + 14, 0, 6, el * 3);
  pentagram(ctx, w / 2 - 14, 0, 6, -el * 3);
  stampText(ctx, text.slice(0, typed), 0, 0, 14, line === 2 ? '#ffe3f6' : line === 1 ? '#c9b6ff' : '#ffffff', '', 800);
  ctx.restore();
  if (line === 1) {
    const hop = Math.abs(Math.sin((el - stuckFrom) * 12)) * 8;
    ctx.globalAlpha = k;
    stampText(ctx, '？', e.x + 96, e.y - 26 - hop, 22, '#ffffff', VIOLET, 900);
  } else if (line === 2) {
    const u = el - stuckTo;
    ctx.fillStyle = '#fff1b8';
    burst(u, 41, { n: n(10, lite), speed: [80, 200], life: .45, drag: .4 }, (x, y, q) => {
      ctx.globalAlpha = k * (1 - q);
      sparkle(ctx, x, y, 5 * (1 - q * .5));
    }, e.x, e.y);
  }
}
/** A violet vignette, made once for the screen size. */
let vignetteCanvas: HTMLCanvasElement | null | undefined;
function vignette(ctx: CanvasRenderingContext2D, k: number): void {
  if (vignetteCanvas === undefined) {
    vignetteCanvas = null;
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      if (g) {
        const gr = g.createRadialGradient(W / 2, H * .55, H * .25, W / 2, H * .55, W * .62);
        gr.addColorStop(0, 'rgba(30,8,60,0)');
        gr.addColorStop(.6, 'rgba(30,8,60,.35)');
        gr.addColorStop(1, 'rgba(14,2,32,.8)');
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
        vignetteCanvas = c;
      }
    }
  }
  if (!vignetteCanvas) return;
  ctx.globalAlpha = k;
  ctx.drawImage(vignetteCanvas, 0, 0);
}

export function drawAkoFx(ctx: CanvasRenderingContext2D, e: Effect, lite = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('ako-') || e.type.includes('@')) return false;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    /* -- U 宇田川催眠波 -- */
    case 'ako-eye': {
      // 龙之右眼: the eye opens in front of her face, pink motes are drawn into it, it stares, and at the throw it
      // flares wide and blinks shut.
      const t0 = e.t0 ?? .3;
      const open = el < t0 ? ease(el / .14) : clamp(1 - (el - t0 - .08) / .12, 0, 1);
      const wide = el >= t0 ? 1 + Math.max(0, .1 - (el - t0)) * 4 : 1;
      const w = 50 * wide, h = 24 * open * wide;
      ctx.globalAlpha = .5 * Math.min(1, open + .2);
      glow(ctx, e.x, e.y, 70 * wide, PINK_RGB);
      if (el < t0) {
        ctx.fillStyle = PALE;
        for (let i = 0; i < n(8, lite); i++) {
          const u = ((el / t0) * 1.6 + hash(i, 51)) % 1;
          const a = hash(i, 52) * TAU;
          ctx.globalAlpha = u * .9;
          dot(ctx, e.x + Math.cos(a) * (1 - u) * 80, e.y + Math.sin(a) * (1 - u) * 60, 2.5);
        }
      }
      if (h > .5) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.moveTo(e.x - w, e.y); ctx.quadraticCurveTo(e.x, e.y - h * 2, e.x + w, e.y); ctx.quadraticCurveTo(e.x, e.y + h * 2, e.x - w, e.y);
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = '#ffeefa';
        ctx.fillRect(e.x - w, e.y - h * 2, w * 2, h * 4);
        hypnoDisc(ctx, e.x + dir * 4, e.y, 20 * wide, el * 1.5, dir);
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.ellipse(e.x + dir * 4, e.y, 4, 9 * wide, 0, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = HOT;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(e.x - w - 8, e.y - 2); ctx.quadraticCurveTo(e.x, e.y - h * 2 - 8, e.x + w + 10, e.y - 6);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(e.x - w, e.y); ctx.quadraticCurveTo(e.x, e.y + h * 2, e.x + w, e.y); ctx.stroke();
      }
      if (el >= t0) {
        const u = (el - t0) / .25;
        if (u < 1) {
          ctx.globalAlpha = 1 - u;
          ctx.strokeStyle = PALE;
          ctx.lineWidth = 3 * (1 - u) + 1;
          ctx.beginPath(); ctx.ellipse(e.x + dir * u * 40, e.y, 20 + u * 30, 30 + u * 70, 0, 0, TAU); ctx.stroke();
          glint(ctx, e.x, e.y, 60 * (1 - u) + 10, 1 - u);
        }
      }
      break;
    }
    /* -- I 暗黑咏唱·提词版 -- */
    case 'ako-circle': {
      // Opens under her feet with violet flame licking up; grey and sputtering while she is stuck; pink once relit.
      const r = (e.radius ?? 70) * ease(el / .25);
      const stuck = el >= AKO_CHANT.stuckFrom && el < AKO_CHANT.stuckTo;
      const a = fadeIO(el, e.life, .15, .2) * (stuck ? .5 + .3 * Math.abs(Math.sin(el * 30)) : 1);
      spellCircle(ctx, e.x, e.y - 2, r, el * (stuck ? .2 : 1.6), .28, a, stuck ? GREY : HOT, stuck ? '150,140,170' : PINK_RGB, stuck ? Math.floor(el * 20) : -1);
      if (!stuck) wisps(ctx, e.x, e.y - 4, r * .8, el, n(6, lite), a);
      break;
    }
    case 'ako-sigil': {
      // The standing spell circle behind her: turns while she reads, stalls grey with gaps and a crack while she
      // is stuck, then flares pink and spins up when 燐子's note lands.
      const r = (e.radius ?? 90) * ease(el / .22);
      const { stuckFrom, stuckTo } = AKO_CHANT;
      const stuck = el >= stuckFrom && el < stuckTo;
      const relit = el >= stuckTo + .22;
      const flare = relit ? 1 + Math.max(0, .18 - (el - stuckTo - .22)) * 2.5 : 1;
      const a = fadeIO(el, e.life, .15, .2) * (stuck ? .45 + .25 * Math.abs(Math.sin(el * 25)) : relit ? 1 : .8);
      const rot = el < stuckFrom ? el * 1.2 : stuck ? stuckFrom * 1.2 + Math.sin(el * 40) * .03 : stuckFrom * 1.2 + (el - stuckTo) * 6;
      spellCircle(ctx, e.x, e.y, r * flare, rot, 1, a, stuck ? GREY : HOT, stuck ? '150,140,170' : PINK_RGB, stuck ? Math.floor(el * 14) : -1);
      if (stuck) {
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#e8e0ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(e.x + r * .2, e.y - r * .9); ctx.lineTo(e.x + r * .05, e.y - r * .45); ctx.lineTo(e.x + r * .22, e.y - r * .2); ctx.lineTo(e.x, e.y + r * .1);
        ctx.stroke();
      }
      if (relit) {
        ctx.globalAlpha = a * .8;
        ctx.strokeStyle = PALE;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, r * flare * 1.16, 0, TAU); ctx.stroke();
        runes(ctx, e.x, e.y, r * flare * 1.24, rot * -.7, 1, 24);
      }
      break;
    }
    case 'ako-scroll': scroll(ctx, e, el, lite); break;
    case 'ako-sweat': {
      ctx.globalAlpha = fadeIO(el, e.life, .06, .08);
      ctx.fillStyle = e.color;
      drop(ctx, e.x, e.y + el * 18, 6);
      drop(ctx, e.x - dir * 12, e.y + 6 + el * 12, 4);
      break;
    }
    case 'ako-rinko': {
      // 燐子 rises behind her in blue-violet in a soft column of light and hands a folded note forward; the note
      // flies up to the strip trailing sparkles.
      const h = e.radius ?? 174;
      const rise = ease(el / .18);
      const k = rise * Math.min(1, e.life / .2);
      ctx.globalAlpha = k * .5;
      pillar(ctx, e.x, e.y, 70, h * 1.3, k * .6, '130,140,255');
      ctx.save();
      ctx.translate(e.x, e.y + (1 - rise) * 30);
      ctx.scale(dir, 1);
      ctx.imageSmoothingEnabled = true;
      const im = image(images, RINKO);
      if (im) summon(ctx, keyed(im), 0, 0, im.naturalWidth, im.naturalHeight, h, '#7a7cff', k, .55);
      else stand(ctx, h, '#7a7cff', k);
      ctx.restore();
      ctx.globalAlpha = k * .45;
      ctx.fillStyle = '#9fa6ff';
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 36, 8, 0, 0, TAU); ctx.fill();
      const u = clamp((el - .06) / .18, 0, 1);
      if (u > 0 && u < 1) {
        const nx = e.x + dir * (30 + u * 70), ny = e.y - h * .55 - Math.sin(u * Math.PI) * 60 - u * h * .55;
        ctx.fillStyle = '#d6dbff';
        for (let i = 1; i <= 4; i++) {
          const v = Math.max(0, u - i * .06);
          ctx.globalAlpha = .7 * (1 - i / 5);
          sparkle(ctx, e.x + dir * (30 + v * 70), e.y - h * .55 - Math.sin(v * Math.PI) * 60 - v * h * .55, 4);
        }
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(nx, ny);
        ctx.rotate(u * 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-9, -6, 18, 12);
        ctx.strokeStyle = '#7a7cff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(6, -2); ctx.moveTo(-6, 2); ctx.lineTo(3, 2); ctx.stroke();
        ctx.restore();
      }
      if (el > .1 && el < .5) {
        ctx.globalAlpha = Math.min(1, (el - .1) / .05) * Math.min(1, (.5 - el) / .12);
        stampText(ctx, '提词！', e.x, e.y - h - 14, 16, '#ffffff', '#5b5fd6', 900);
      }
      break;
    }
    case 'ako-glint': {
      // 龙之右眼, awake: a four-point glint on her eye and a thin pink line drawn across the screen through it.
      const t0 = e.t0 ?? 0;
      const u = (el - t0) / (e.max - t0);
      if (u < 0) break;
      const k = u < .2 ? u / .2 : 1 - (u - .2) / .8;
      ctx.globalAlpha = k * .6;
      ctx.fillStyle = HOT;
      ctx.fillRect(e.x - 140 * k, e.y - 1, 280 * k, 2);
      glint(ctx, e.x, e.y, 26 + 30 * k, k);
      break;
    }
    case 'ako-relight': {
      const t0 = e.t0 ?? 0;
      const u = el - t0;
      if (u < 0) break;
      const k = clamp(1 - u / (e.max - t0), 0, 1);
      const r = (e.radius ?? 110) * ease(u / .3);
      ctx.globalAlpha = k;
      ctx.strokeStyle = HOT;
      ctx.lineWidth = 4 * k + 1;
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 2, r, r * .28, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = PALE;
      burst(u, 47, { n: n(12, lite), speed: [100, 260], life: .5, gravity: -120, angle: -Math.PI / 2, spread: 2.4, drag: .4 }, (x, y, q) => {
        ctx.globalAlpha = k * (1 - q);
        sparkle(ctx, x, y, 5 * (1 - q * .5));
      }, e.x, e.y - 6);
      break;
    }
    case 'ako-impact': {
      // The orb lands: a pentagram stamped on the floor, a column of dark light, black feathers bursting and
      // drifting down.
      const k = clamp(1 - el / e.max, 0, 1);
      const r = (e.radius ?? 120) * ease(el / .2);
      spellCircle(ctx, e.x, e.y - 2, r, el * 2, .28, k, HOT, PINK_RGB);
      pillar(ctx, e.x, e.y, 60 * k + 20, 260 * ease(el / .12), k, '150,70,240');
      burst(el, 57, { n: n(12, lite), speed: [120, 300], life: .8, gravity: 260, angle: -Math.PI / 2, spread: 2.6, drag: .35 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        feather(ctx, x, y, 8, i + q * 5);
      }, e.x, e.y - 60);
      break;
    }
    case 'ako-fizzle': {
      // The strip shatters into grey shards, a puff of smoke, and a small 「呜……」.
      const k = fadeIO(el, e.life, .05, .25);
      ctx.globalAlpha = k * .5;
      glow(ctx, e.x, e.y, 40 + el * 50, '150,140,170');
      ctx.fillStyle = GREY;
      burst(el, 61, { n: n(12, lite), speed: [80, 220], life: .55, gravity: 380, drag: .5 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.save(); ctx.translate(x, y); ctx.rotate(i + q * 6);
        ctx.fillRect(-6, -3, 12, 6);
        ctx.restore();
      }, e.x, e.y);
      ctx.globalAlpha = k;
      stampText(ctx, '呜……', e.x + dir * 10, e.y + 10 - el * 12, 18, '#ffffff', VIOLET, 900);
      break;
    }
    /* -- O 世界第二强 -- */
    case 'ako-jab': {
      // A drummer's two little hits: 「咚！」 then 「哒！」, a pentagram spark and a pink speed arc.
      const k = clamp(1 - el / e.max, 0, 1);
      const hit = e.hit !== false;
      ctx.globalAlpha = k;
      ctx.strokeStyle = HOT;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x - dir * 30, e.y, 34, dir > 0 ? -.9 : Math.PI - .9, dir > 0 ? .9 : Math.PI + .9); ctx.stroke();
      if (hit) {
        ctx.lineWidth = 2;
        pentagram(ctx, e.x, e.y, (e.radius ?? 30) * (.5 + el * 3), el * 8);
        ctx.fillStyle = PALE;
        burst(el, 71, { n: n(6, lite), speed: [80, 180], life: .25 }, (x, y, q) => {
          ctx.globalAlpha = 1 - q;
          sparkle(ctx, x, y, 5);
        }, e.x, e.y);
      }
      popWord(ctx, (e.n ?? 0) ? '哒！' : '咚！', e.x + dir * 6, e.y - 34 - el * 30, hit ? 24 : 18, el, e.life, '#ffffff', PINK);
      break;
    }
    case 'ako-tomoe': {
      // 巴 behind her: a festival-red 三つ巴 crest spinning up behind her chest, red flame licking round her
      // feet, her art under a red wash; she rises, then the punch row.
      const m = HIMARI_FRIENDS[1];
      const h = m?.height ?? 188;
      const row = el < .16 ? HIMARI_FRIEND_ROW.rise : el < .5 ? HIMARI_FRIEND_ROW.shout : HIMARI_FRIEND_ROW.after;
      const rise = ease(el / .14);
      const k = rise * Math.min(1, e.life / .2);
      const push = el > .16 ? Math.min(1, (el - .16) / .08) * 18 : 0;
      ctx.globalAlpha = k * .55;
      glow(ctx, e.x, e.y - h * .55, h * .55, TOMOE_RGB);
      ctx.globalAlpha = k * .9;
      mitsudomoe(ctx, e.x - dir * 10, e.y - h * .58, h * .3 * (.6 + rise * .4), el * 9 * dir);
      ctx.save();
      ctx.translate(e.x + dir * push, e.y + (1 - rise) * 30);
      ctx.scale(dir, 1);
      ctx.imageSmoothingEnabled = true;
      const im = image(images, HIMARI_FRIENDS_SRC);
      if (im) summon(ctx, keyed(im), CELL, row * CELL, CELL, CELL, h, TOMOE, k, .55);
      else stand(ctx, h, TOMOE, k);
      ctx.restore();
      for (let i = 0; i < n(7, lite); i++) {
        const u = (el * 2.2 + hash(i, 61)) % 1;
        const px = e.x + (hash(i, 62) - .5) * 70, py = e.y - u * 90;
        const s = (1 - u) * 9;
        ctx.globalAlpha = k * (1 - u);
        ctx.fillStyle = i % 2 ? '#ff7a3d' : TOMOE;
        ctx.beginPath();
        ctx.moveTo(px, py - s * 2.2); ctx.quadraticCurveTo(px + s, py - s * .2, px, py + s * .7); ctx.quadraticCurveTo(px - s, py - s * .2, px, py - s * 2.2);
        ctx.fill();
      }
      if (el > .1 && el < .5) {
        ctx.globalAlpha = Math.min(1, (el - .1) / .05) * Math.min(1, (.5 - el) / .1);
        stampText(ctx, '亚子，看好了！', e.x, e.y - h - 18, 16, '#ffffff', TOMOE, 900);
      }
      break;
    }
    case 'ako-sister-hit': {
      // 巴's punch: a drum skin's worth of 「咚！！」, the crest flung out spinning, a red ring and speed lines.
      const k = clamp(1 - el / e.max, 0, 1);
      const r = (e.radius ?? 60) * (.5 + ease(el / .15) * 1.1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k * .8;
      glow(ctx, e.x, e.y, r * 1.5, TOMOE_RGB);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4 * k + 1;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffd1d9';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (dir > 0 ? 0 : Math.PI) + (i / 7 - .5) * 1.8;
        const r0 = r * 1.1, r1 = r * (1.5 + hash(i, 63) * .6);
        ctx.moveTo(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0);
        ctx.lineTo(e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1);
      }
      ctx.stroke();
      ctx.globalAlpha = k * .9;
      mitsudomoe(ctx, e.x + dir * el * 140, e.y - el * 60, 22 * (1 - el * .6), el * 20);
      ctx.fillStyle = '#ffd1d9';
      burst(el, 81, { n: n(10, lite), speed: [160, 360], life: .35, angle: dir > 0 ? 0 : Math.PI, spread: 2.2, drag: .3 }, (x, y, q) => {
        ctx.globalAlpha = 1 - q;
        sparkle(ctx, x, y, 6 * (1 - q * .5));
      }, e.x, e.y);
      popWord(ctx, '咚！！', e.x + dir * 20, e.y - 70, e.hit === false ? 28 : 40, el, e.life, '#ffffff', TOMOE);
      break;
    }
    case 'ako-medals': {
      // No.1 to 巴 behind her (gold, a little confetti), No.2 to her (silver, wobbling) and a proud 「世界第二！」.
      const k = fadeIO(el, e.life, .12, .25);
      const pop = ease(el / .15);
      ctx.globalAlpha = k;
      medal(ctx, e.x - dir * 52, e.y - 30, 15 * pop, GOLD, '1', Math.sin(el * 6) * .1);
      medal(ctx, e.x + dir * 4, e.y, 13 * pop, '#d9dde6', '2', Math.sin(el * 11) * .22);
      burst(el, 83, { n: n(8, lite), speed: [60, 140], life: .7, gravity: 160, angle: -Math.PI / 2, spread: 2.4 }, (x, y, q, i) => {
        ctx.globalAlpha = k * (1 - q);
        ctx.fillStyle = i % 2 ? GOLD : HOT;
        ctx.fillRect(x - 2, y - 3, 4, 6);
      }, e.x - dir * 52, e.y - 30);
      if (el > .2) {
        ctx.globalAlpha = k * Math.min(1, (el - .2) / .1);
        stampText(ctx, '世界第二！', e.x + dir * 4, e.y - 30, 13, '#ffffff', PINK, 900);
      }
      break;
    }
    /* -- L 邪灵大法师·降临 -- */
    case 'ako-dim': {
      // The house goes violet at the edges, with pixel motes drifting up like a game's ambient.
      const k = fadeIO(el, e.life, .25, .35);
      vignette(ctx, k);
      ctx.fillStyle = '#c9a6ff';
      for (let i = 0; i < n(14, lite); i++) {
        const u = (el * .35 + hash(i, 71)) % 1;
        ctx.globalAlpha = k * Math.sin(u * Math.PI) * .7;
        const s = 2 + Math.floor(hash(i, 72) * 3);
        ctx.fillRect(Math.floor(hash(i, 73) * W), Math.floor(H * .85 - u * H * .7), s, s);
      }
      break;
    }
    case 'ako-gate': {
      // The summoning gate behind her: a standing ring of runes round a swirling dark mouth; it opens, churns,
      // and shuts.
      const open = ease(el / .3) * clamp(e.life / .3, 0, 1);
      const r = (e.radius ?? 78) * open;
      if (!(r > 1)) break;
      ctx.globalAlpha = open * .6;
      glow(ctx, e.x, e.y, r * 1.6, VIOLET_RGB);
      ctx.globalAlpha = open;
      blitGate(ctx, e.x, e.y, r);
      ctx.strokeStyle = HOT;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = open * (.8 - i * .2);
        ctx.beginPath();
        const a0 = el * (4 + i) * dir + i * 2;
        ctx.ellipse(e.x, e.y, r * .62 * (.75 - i * .2), r * (.75 - i * .2), 0, a0, a0 + 3.6);
        ctx.stroke();
      }
      ctx.globalAlpha = open;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, r * .62, r, 0, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = PALE;
      runes(ctx, e.x, e.y, r * 1.12, el * 1.5, 1, 20);
      break;
    }
    case 'ako-nfo': {
      // Let the one-second SUPER banner clear before the game UI enters.
      const el = e.max - e.life - 1.05;
      if (el < 0) break;
      // The game frame: corner brackets, her name plate and mana, 「STAGE 1」, a cast window, and a HIT counter.
      const k = fadeIO(el, e.life, .2, .35);
      const inset = 16, arm = 46;
      ctx.globalAlpha = k * .9;
      ctx.strokeStyle = HOT;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const [x, y, sx, sy] of [[inset, inset + 70, 1, 1], [W - inset, inset + 70, -1, 1], [inset, H - inset, 1, -1], [W - inset, H - inset, -1, -1]] as const) {
        ctx.moveTo(x, y + sy * arm); ctx.lineTo(x, y); ctx.lineTo(x + sx * arm, y);
      }
      ctx.stroke();
      const px = 30, py = H - 52;
      ctx.fillStyle = 'rgba(28,15,46,.85)';
      ctx.fillRect(px, py, 210, 30);
      ctx.strokeStyle = '#a070e0'; ctx.lineWidth = 1.5;
      ctx.strokeRect(px, py, 210, 30);
      stampText(ctx, '圣堕天使亚子姬', px + 74, py + 15, 14, '#ffe3f6', '', 900);
      stampText(ctx, 'Lv.1', px + 176, py + 15, 14, GOLD, '', 900);
      const mana = clamp(1 - (el - .4) / 1.6, 0, 1);
      ctx.fillStyle = '#2d1850';
      ctx.fillRect(px, py + 33, 210, 6);
      ctx.fillStyle = '#7f6bff';
      ctx.fillRect(px, py + 33, 210 * mana, 6);
      if (el < .8) {
        const b = fadeIO(el, .8 - el, .1, .2);
        ctx.globalAlpha = k * b;
        ctx.fillStyle = 'rgba(28,15,46,.7)';
        ctx.fillRect(0, H * .3 - 26, W, 52);
        ctx.fillStyle = HOT;
        ctx.fillRect(0, H * .3 - 27, W, 2);
        ctx.fillRect(0, H * .3 + 25, W, 2);
        stampText(ctx, 'STAGE 1', W / 2 + (1 - ease(el / .2)) * -160, H * .3, 36, '#ffffff', PINK, 900);
      }
      if (el > .6 && el < 1.9) {
        // Keep the RPG cast window below the health bars and timer.
        const b = fadeIO(el - .6, 1.9 - el, .1, .2);
        const line = '亚子姬使用了「冥府召唤·暗黑亡灵」！';
        const typed = Math.min(line.length, Math.floor((el - .6) / .03) + 1);
        const cy = H * .4;
        ctx.globalAlpha = k * b;
        ctx.fillStyle = 'rgba(12,6,28,.88)';
        ctx.fillRect(W / 2 - 230, cy - 20, 460, 40);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.strokeRect(W / 2 - 226, cy - 16, 452, 32);
        stampText(ctx, line.slice(0, typed), W / 2, cy, 16, '#ffffff', '', 800);
      }
      const hits = e.n ?? 0;
      if (hits > 0) {
        ctx.globalAlpha = k;
        stampText(ctx, hits + ' HIT', W - 96, H - 70, 30, GOLD, PINK, 900);
        stampText(ctx, 'COMBO', W - 96, H - 46, 13, '#ffffff', VIOLET, 900);
      }
      break;
    }
    case 'ako-nfo-circle': {
      const r = (e.radius ?? 96) * ease(el / .3);
      const a = fadeIO(el, e.life, .2, .3);
      spellCircle(ctx, e.x, e.y - 2, r, el * 1.2, .28, a, HOT, PINK_RGB);
      wisps(ctx, e.x, e.y - 4, r * .7, el, n(8, lite), a);
      break;
    }
    case 'ako-dmg': {
      // An RPG damage number hopping off the head.
      const hop = Math.sin(clamp(el / .35, 0, 1) * Math.PI) * 26;
      popWord(ctx, '-' + (e.n ?? 0), e.x, e.y - hop - el * 20, 20, el, e.life, '#ffffff', VIOLET);
      break;
    }
    case 'ako-crit': {
      const hop = Math.sin(clamp(el / .4, 0, 1) * Math.PI) * 36;
      popWord(ctx, 'CRITICAL!!', e.x, e.y - 40 - hop, 26, el, e.life, GOLD, PINK);
      popWord(ctx, '-' + (e.n ?? 0), e.x, e.y - hop, 38, el, e.life, '#ffffff', PINK);
      break;
    }
    case 'ako-warn': {
      // Where the big one will land: a danger column from the top and a spinning pentagram on the floor.
      const k = fadeIO(el, e.life, .08, .15);
      const r = e.radius ?? 100;
      const beat = .55 + .35 * Math.abs(Math.sin(el * 18));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k * .35 * beat;
      ctx.fillStyle = PINK;
      ctx.fillRect(e.x - r * .55, 0, r * 1.1, e.y);
      ctx.globalCompositeOperation = 'source-over';
      spellCircle(ctx, e.x, e.y - 2, r, el * 5, .26, k * beat, HOT, PINK_RGB);
      ctx.globalAlpha = k * beat;
      stampText(ctx, '！', e.x, e.y - 160, 34, '#ffffff', PINK, 900);
      break;
    }
    case 'ako-burst': {
      // The big one lands: a column of dark light, a wide ring, violet motes and black feathers.
      const k = clamp(1 - el / e.max, 0, 1);
      const r = (e.radius ?? 120) * ease(el / .25);
      pillar(ctx, e.x, e.y, 150 * k + 30, 400 * ease(el / .1), k, '150,70,240');
      ctx.globalAlpha = k;
      ctx.strokeStyle = HOT;
      ctx.lineWidth = 5 * k + 1;
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 2, r * 1.3, r * .34, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#d9b8ff';
      burst(el, 91, { n: n(14, lite), speed: [120, 320], life: .6, gravity: -80, angle: -Math.PI / 2, spread: 2.8, drag: .4 }, (x, y, q) => {
        ctx.globalAlpha = 1 - q;
        dot(ctx, x, y, 3 * (1 - q * .5));
      }, e.x, e.y - 10);
      burst(el, 93, { n: n(10, lite), speed: [160, 340], life: .6, gravity: 300, angle: -Math.PI / 2, spread: 2.6, drag: .4 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        feather(ctx, x, y, 9, i * 1.7 + q * 6);
      }, e.x, e.y - 40);
      break;
    }
    case 'ako-clear': {
      // 「STAGE 1 CLEAR!」 in gold over slow-turning rays, a ring of stars; the plate jumps to Lv.2 with LEVEL UP!.
      const k = fadeIO(el, e.life, .08, .35);
      const pop = 1 + Math.max(0, .18 - el) * 2.4;
      const cx = W / 2, cy = H * .3;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${GOLD_RGB},.18)`;
      ctx.globalAlpha = k;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = el * .6 + i * TAU / 10;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a - .1) * 420, cy + Math.sin(a - .1) * 420);
        ctx.lineTo(cx + Math.cos(a + .1) * 420, cy + Math.sin(a + .1) * 420);
        ctx.closePath();
      }
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pop, pop);
      stampText(ctx, 'STAGE 1 CLEAR!', 0, 0, 40, GOLD, PINK, 900);
      ctx.restore();
      ctx.fillStyle = '#fff1b8';
      burst(el, 101, { n: n(12, lite), speed: [120, 260], life: .9, drag: .35 }, (x, y, q) => {
        ctx.globalAlpha = k * (1 - q);
        sparkle(ctx, x, y, 7 * (1 - q * .4));
      }, cx, cy);
      const px = 30, py = H - 52;
      ctx.globalAlpha = k;
      ctx.fillStyle = 'rgba(28,15,46,.95)';
      ctx.fillRect(px + 150, py + 2, 56, 26);
      stampText(ctx, 'Lv.2', px + 176, py + 15, 15 * (1 + Math.max(0, .2 - el) * 2), GOLD, PINK, 900);
      if (el > .15 && el < .9) stampText(ctx, 'LEVEL UP!', px + 176, py - 14 - (el - .15) * 20, 13, '#ffffff', PINK, 900);
      break;
    }
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  return true;
}

/* ---- status look (statusMarks.ts) ---- */

/** 定身 'ako-hypno': asleep — a coin on a string swinging over the head, a violet haze, and Z's drifting off. */
export function auraHypno(ctx: CanvasRenderingContext2D, f: Fighter, bodyH: number, left: number, t: number): void {
  ctx.save();
  const fade = Math.min(1, left / .2);
  const hx = f.x, hy = f.y - bodyH;
  ctx.globalAlpha = fade * .3;
  glow(ctx, hx, hy + 14, 40, VIOLET_RGB);
  const px = hx - f.facing * 4, py = hy - 54;
  const swing = Math.sin(t * 4.2) * .6;
  const cx = px + Math.sin(swing) * 30, cy = py + Math.cos(swing) * 30;
  ctx.globalAlpha = fade;
  ctx.strokeStyle = '#e8e0ff';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(cx, cy); ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.strokeStyle = '#9a6a10';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  dot(ctx, cx - 2, cy - 2, 1.8);
  ctx.globalAlpha = fade * .5;
  ctx.fillStyle = HOT;
  dot(ctx, cx, cy, 2.2);
  for (let i = 0; i < 3; i++) {
    const u = (t * .7 + i / 3) % 1;
    ctx.globalAlpha = fade * (1 - u);
    zee(ctx, f.x - f.facing * (14 + u * 26), f.y - bodyH - 10 - u * 40, 11 + u * 9, PALE);
  }
  ctx.restore();
}
export function applyHypno(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  const k = clamp(1 - age / .45, 0, 1);
  ctx.globalAlpha = k * .5;
  glow(ctx, e.x, e.y - 150, 40 + age * 70, PINK_RGB);
  ctx.globalAlpha = k;
  hypnoDisc(ctx, e.x, e.y - 150, 22 * (1 - age), age, 1);
  ctx.strokeStyle = PALE;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(e.x, e.y - 150, 20 + age * 90, 0, TAU); ctx.stroke();
  ctx.restore();
}
