import type { Effect, Projectile } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { CELL, HIMARI_FRIEND_ROW, HIMARI_FRIENDS, HIMARI_FRIENDS_SRC, HIMARI_SHAKE_FIRST, HIMARI_SHAKE_GAP } from './clips.ts';
import { TAU, burst, dot, glow, hash, stampText } from './fxParticles.ts';

/* 上原绯玛丽 — 粉色、奶泡、乌鸦和夕阳. Four registers:
   - her pink (#FF9999) for the shouted words, the scale and the feathers (变轻);
   - coffee: cream foam and brown beans for 摇匀一杯摩卡;
   - the silence after 一呼零应: the house a shade darker, a black crow flapping across the top trailing「…」,
     a sweat drop on her;
   - sunset for 一呼百应: a warm grade over the whole backdrop (the fighters stay clear), a striped low sun, the rooftop railing, the four
     friends (friends.png) as glowing silhouettes on the skyline, and waves in each one's colour.
   All flat shapes that read from across the screen; the busiest moment, the sunset wave, is about 30 particles. */

export const HIMARI_BACK: readonly string[] = ['himari-friend', 'himari-wings', 'himari-shadow'];
export const HIMARI_SCREEN_BACK: readonly string[] = ['himari-sunset', 'himari-hush'];
export const HIMARI_SCREEN_FRONT: readonly string[] = ['himari-crow'];

const PINK = '#FF9999';
const PINK_DEEP = '#ff6f8a';
const INK = '#3a1622';
const CREAM = '#fff3df';
const FOAM = '#e9c39a';
const BEAN = '#6b3f25';
const SWEAT = '#bfe6ff';
const SUN_X = W * .5;
const CALL_COLORS = [PINK, ...HIMARI_FRIENDS.map(f => f.color)];
/** How much of each friend's art shows through her colour wash. */
const FRIEND_SHOW = .3;
/** A friend rises out of the skyline in this long, and fades over the last FRIEND_FADE of her life. */
const FRIEND_RISE = .2;
const FRIEND_FADE = .35;
/** Her 「O！」 and the shout cell hold this long after she appears. */
const SHOUT_END = 1.1;

const particleCount = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

/* ---- baked silhouettes (one per picture and colour) ---- */

const keyCache = new WeakMap<HTMLImageElement, CanvasImageSource>();
/** The picture with the chroma green and the placeholder sheet chrome (dark ground, magenta grid) cut out. */
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
/** One cell of a picture as a flat silhouette in one colour, baked once. */
function tinted(src: CanvasImageSource, col: number, row: number, color: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let per = tintCache.get(src);
  if (!per) { per = new Map(); tintCache.set(src, per); }
  const key = col + ',' + row + '|' + color;
  const hit = per.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = CELL; c.height = CELL;
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(src, col * CELL, row * CELL, CELL, CELL, 0, 0, CELL, CELL);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, CELL, CELL);
  // Four friends × three rows × (her colour + the white rim) is 24 bakes; keep them all.
  if (per.size >= 32) per.clear();
  per.set(key, c);
  return c;
}

/* ---- little shapes ---- */

function bean(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = BEAN;
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * .7, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#2f1a0e';
  ctx.lineWidth = Math.max(1, r * .22);
  ctx.beginPath(); ctx.moveTo(-r * .7, 0); ctx.quadraticCurveTo(0, r * .3, r * .7, 0); ctx.stroke();
  ctx.restore();
}
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  if (!(s > 0)) return;
  ctx.beginPath();
  ctx.moveTo(x, y + s * .9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * .1, x - s * .6, y - s * 1.2, x, y - s * .35);
  ctx.bezierCurveTo(x + s * .6, y - s * 1.2, x + s * 1.4, y - s * .1, x, y + s * .9);
  ctx.fill();
}
function drop(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.4);
  ctx.quadraticCurveTo(x + s, y - s * .1, x, y + s * .8);
  ctx.quadraticCurveTo(x - s, y - s * .1, x, y - s * 1.4);
  ctx.fill();
}
function feather(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * .5, 0, 0, s);
  ctx.quadraticCurveTo(-s * .5, 0, 0, -s);
  ctx.fill();
  ctx.restore();
}
/** A rounded rectangle path (no ctx.roundRect: older webviews lack it). */
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/** The bathroom scale, side on, feet at y = 0: a pink slab with a little dial window. `read` is what it shows. */
function scale(ctx: CanvasRenderingContext2D, x: number, y: number, read: string, needle: number, glowK = 0): void {
  ctx.save();
  ctx.translate(x, y);
  if (glowK > 0) { ctx.globalAlpha *= glowK; glow(ctx, 0, -12, 46, '255,153,153'); ctx.globalAlpha /= glowK; }
  ctx.fillStyle = INK;
  rrect(ctx, -31, -20, 62, 20, 7); ctx.fill();
  ctx.fillStyle = PINK;
  rrect(ctx, -29, -18, 58, 16, 6); ctx.fill();
  ctx.fillStyle = '#ffd1dc';
  ctx.fillRect(-25, -17, 50, 3);
  // The dial: a small raised window on top with a needle and the digits under it.
  ctx.fillStyle = INK;
  rrect(ctx, -15, -34, 30, 16, 5); ctx.fill();
  ctx.fillStyle = '#fdf7f2';
  rrect(ctx, -13, -32, 26, 12, 4); ctx.fill();
  ctx.strokeStyle = '#d8233a';
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(0, -21); ctx.lineTo(Math.sin(needle) * 8, -21 - Math.cos(needle) * 8); ctx.stroke();
  ctx.restore();
  if (read) stampText(ctx, read, x, y - 46, 13, '#ffffff', INK, 900);
}

/* ---- 一呼百应's rooftop railing ---- */

const RAIL_LIFT = 15;
const RAIL_TOP = FLOOR - 74 - RAIL_LIFT;
const RAIL_POSTS = 26;
/** The near ends of the railing sit lower, taller and wider. */
function railDepth(x: number): number {
  const u = (x - SUN_X) / SUN_X;
  return u * u;
}
type RailPath = Pick<Path2D, 'moveTo' | 'lineTo' | 'rect'>;
type RailLayer = (ctx: CanvasRenderingContext2D, fade: number) => void;

function buildRailing(): RailLayer[] {
  const base = (x: number) => FLOOR - 10 - RAIL_LIFT + railDepth(x) * 24;
  const top = (x: number) => RAIL_TOP + railDepth(x) * 14;
  const xs: number[] = [];
  for (let i = 0; i <= RAIL_POSTS; i++) xs.push(-12 + i * (W + 24) / RAIL_POSTS);
  const layers: RailLayer[] = [];
  const layer = (color: string, alpha: number, trace: (path: RailPath) => void, lineWidth?: number) => {
    const path = typeof Path2D === 'undefined' ? undefined : new Path2D();
    if (path) trace(path);
    layers.push((ctx, fade) => {
      if (!path) {
        ctx.beginPath();
        trace(ctx);
      }
      ctx.globalAlpha = fade * alpha;
      if (lineWidth == null) {
        ctx.fillStyle = color;
        if (path) ctx.fill(path);
        else ctx.fill();
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        if (path) ctx.stroke(path);
        else ctx.stroke();
      }
    });
  };
  // Post shadows: long thin strips from each foot down across the floor, away from the sun.
  layer('#2a1426', .2, path => {
    for (const x of xs) {
      const d = (x - SUN_X) / SUN_X;
      const y0 = base(x);
      path.moveTo(x - 2, y0); path.lineTo(x + 3, y0);
      path.lineTo(x + 3 + d * 70 + 8, H); path.lineTo(x - 2 + d * 70, H);
    }
  });
  // The ledge: lit top face, then the dark front face under it.
  layer('#7a4440', .75, path => {
    path.moveTo(0, base(0) - 6);
    for (let x = 0; x <= W; x += 48) path.lineTo(x, base(x) - 6 - railDepth(x) * 4);
    for (let x = W; x >= 0; x -= 48) path.lineTo(x, base(x));
  });
  layer('#24111f', .75, path => {
    path.moveTo(0, base(0));
    for (let x = 0; x <= W; x += 48) path.lineTo(x, base(x));
    for (let x = W; x >= 0; x -= 48) path.lineTo(x, base(x) + 12 + railDepth(x) * 6);
  });

  layer('#2a1426', .75, path => {
    for (const x of xs) {
      const w = 4 + railDepth(x) * 5;
      path.rect(x - w / 2, top(x), w, base(x) - 6 - top(x));
    }
  });
  layer('#ffb36b', .85, path => {
    for (const x of xs) {
      const w = 4 + railDepth(x) * 5;
      path.rect(x < SUN_X ? x + w / 2 - 1.5 : x - w / 2, top(x), 1.5, base(x) - 6 - top(x));
    }
  });
  // Handrails: a dark body with a sunlit rim on top, the lower one thinner.
  for (const [dy, thick] of [[0, 8], [32, 5]] as const) {
    const y = (x: number) => top(x) + dy * (1 + railDepth(x) * .25);
    const th = (x: number) => thick * (1 + railDepth(x) * .6) / 2;
    layer('#2a1426', .8, path => {
      path.moveTo(0, y(0) - th(0));
      for (let x = 0; x <= W; x += 32) path.lineTo(x, y(x) - th(x));
      for (let x = W; x >= 0; x -= 32) path.lineTo(x, y(x) + th(x));
    });
    layer('#ffc27a', .9, path => {
      path.moveTo(0, y(0) - th(0) + 1);
      for (let x = 0; x <= W; x += 32) path.lineTo(x, y(x) - th(x) + 1);
    }, thick > 6 ? 2 : 1.4);
  }
  return layers;
}

let railingLayers: RailLayer[] | undefined;
function drawRailing(ctx: CanvasRenderingContext2D, fade: number): void {
  // Only the opacity changes as the scene fades.
  for (const drawLayer of (railingLayers ??= buildRailing())) drawLayer(ctx, fade);
}

/* ---- projectiles ---- */

export function drawHimariShot(ctx: CanvasRenderingContext2D, p: Projectile, _liteFx: boolean): boolean {
  if (p.fx !== 'himari-scale') return false;
  const dir = Math.sign(p.vx) || 1;
  ctx.save();
  // Speed lines behind and a puff of dust off the floor: it is sliding, not flying.
  ctx.strokeStyle = 'rgba(255,209,220,.7)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const y = FLOOR - 6 - i * 9;
    ctx.globalAlpha = .55 - i * .12;
    ctx.beginPath(); ctx.moveTo(p.x - dir * (36 + i * 4), y); ctx.lineTo(p.x - dir * (62 + i * 10 + Math.sin(p.age * 30 + i) * 4), y); ctx.stroke();
  }
  ctx.globalAlpha = .35;
  glow(ctx, p.x - dir * 34, FLOOR - 3, 10 + (p.age * 7 % 1) * 6, '233,220,203');
  ctx.globalAlpha = 1;
  // The digits never settle while it slides.
  const digits = String(10 + Math.floor(hash(Math.floor(p.age * 14), 3) * 89)) + '.' + Math.floor(hash(Math.floor(p.age * 14), 4) * 10);
  scale(ctx, p.x, FLOOR, digits, p.age * 18);
  ctx.restore();
  return true;
}

/* ---- effects ---- */

export function drawHimariFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('himari-')) return false;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    case 'himari-foam': {
      // 摇匀一杯摩卡, one shake: a curl of cream foam whipped round the head, flecks thrown off the way she shook.
      const k = ease(el / .18);
      const big = e.hit ? 1.35 : 1;
      const side = (e.n ?? 0) % 2 ? -1 : 1;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = (1 - t) * (.9 - i * .2);
        ctx.strokeStyle = i === 1 ? FOAM : CREAM;
        ctx.lineWidth = (7 - i * 2) * big;
        const r = (24 + i * 9) * big * (.6 + .4 * k);
        const a0 = side * .4 + i * .7 + el * 9 * side;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, a0, a0 + 2.4 * k); ctx.stroke();
      }
      burst(el, 11 + (e.n ?? 0), { n: particleCount(e.hit ? 9 : 6, liteFx), speed: [120, 260], life: .45, gravity: 420, angle: side > 0 ? 0 : Math.PI, spread: 1.6, drag: .25 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i % 3 === 0 ? FOAM : CREAM;
        dot(ctx, x, y, 3.4 * (1 - q * .4) * big);
      }, e.x, e.y);
      break;
    }
    case 'himari-beans': {
      // The let-go: a handful of coffee beans and a puff of foam.
      burst(el, 21, { n: particleCount(10, liteFx), speed: [140, 300], life: .7, gravity: 700, angle: -Math.PI / 2, spread: 2.4, drag: .4 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q * q;
        if (i % 3 === 0) { ctx.fillStyle = CREAM; dot(ctx, x, y, 4 * (1 - q * .5)); } else bean(ctx, x, y, 5.5, q * 9 + i);
      }, e.x, e.y);
      break;
    }
    case 'himari-word': {
      // 「A！」「A！」「O！」: pops up big, settles, a little bob; in the super the 「O」 is drawn out long.
      const word = (e.n ?? 0) < 2 ? 'A！' : e.hit ? 'O——！' : 'O！';
      const pop = el < .12 ? 1 + (1 - el / .12) * .6 : 1 + Math.sin(el * 10) * .03;
      const size = ((e.n ?? 0) === 2 ? 40 : 32) * (e.hit ? 1.2 : 1) * pop;
      ctx.globalAlpha = Math.min(1, e.life / .2);
      stampText(ctx, word, e.x, e.y - Math.min(el, .2) * 30, size, '#ffffff', PINK_DEEP, 900);
      break;
    }
    case 'himari-hush': {
      // 一呼零应: the house a shade darker while nobody answers.
      const a = Math.min(1, el / .12, e.life / .25) * .2;
      ctx.globalAlpha = a;
      ctx.fillStyle = e.color;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'himari-crow': {
      // 一呼零应: a crow flaps across the top of the screen, right to left, trailing three dots. Two flaps.
      const x = e.x + dir * (W + 160) * t;
      const y = e.y + Math.sin(t * TAU) * 8;
      const flap = Math.sin(t * TAU * 2.2);
      ctx.globalAlpha = Math.min(1, el / .1, e.life / .15);
      ctx.fillStyle = '#9b93a6';
      for (let i = 0; i < 3; i++) {
        const blink = (Math.floor(el * 5) + i) % 3 === 0 ? .4 : 1;
        ctx.globalAlpha = Math.min(1, el / .1, e.life / .15) * blink;
        dot(ctx, x - dir * (44 + i * 16), y + 6, 3.4);
      }
      ctx.globalAlpha = Math.min(1, el / .1, e.life / .15);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(dir, 1);
      ctx.fillStyle = e.color;
      // Wings (one up, one behind), body, head, beak, tail.
      ctx.beginPath(); ctx.moveTo(-4, -2); ctx.quadraticCurveTo(-14, -24 * flap - 4, -30, -20 * flap - 2); ctx.lineTo(-10, 4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 0, 16, 8, -.1, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(14, -5, 6.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(19, -6); ctx.lineTo(28, -3); ctx.lineTo(19, -1); ctx.closePath(); ctx.fillStyle = '#e8b04a'; ctx.fill();
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.moveTo(-14, -1); ctx.lineTo(-26, 4); ctx.lineTo(-14, 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      dot(ctx, 16, -7, 1.4);
      ctx.restore();
      break;
    }
    case 'himari-sweat': {
      // On her: one big sweat drop by the head, sliding down a little; the fist comes down under it.
      const h = e.radius ?? 178;
      ctx.globalAlpha = Math.min(1, el / .15, e.life / .2) * .95;
      ctx.fillStyle = SWEAT;
      drop(ctx, e.x - dir * 26, e.y - h * .88 + Math.min(el, .8) * 10, 7);
      ctx.fillStyle = '#ffffff';
      dot(ctx, e.x - dir * 28, e.y - h * .9 + Math.min(el, .8) * 10, 1.6);
      break;
    }
    case 'himari-scale-read': {
      // Under their feet: the needle spins and the digits run; over their head a big read-out runs too and stops
      // on a red 「??.?」 that blinks twice, with a ping. No real number: the joke is the scale, not them.
      const h = e.radius ?? 178;
      const settled = el >= .45;
      const spin = settled ? 18 + (el - .45) * 2 : el * 40;
      const running = String(10 + Math.floor(hash(Math.floor(el * 20), 5) * 89)) + '.' + Math.floor(hash(Math.floor(el * 20), 6) * 10);
      const blink = settled && el < .85 && Math.floor((el - .45) * 10) % 2 === 1;
      const fade = Math.min(1, e.life / .25);
      ctx.globalAlpha = fade;
      scale(ctx, e.x, e.y, '', spin, settled ? Math.max(0, 1 - (el - .45) / .3) : 0);
      // The read-out panel, popping up over the head.
      const pop = ease(el / .14);
      const px = e.x, py = e.y - h - 40 - pop * 6;
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(.6 + pop * .4, .6 + pop * .4);
      ctx.fillStyle = INK;
      rrect(ctx, -46, -22, 92, 40, 9); ctx.fill();
      ctx.fillStyle = settled ? '#2a0e14' : '#1d2a22';
      rrect(ctx, -40, -16, 80, 28, 6); ctx.fill();
      ctx.restore();
      if (pop > .5) stampText(ctx, settled ? '??.?' : running, px, py - 2, 22, settled ? (blink ? '#ffffff' : '#ff5a6e') : '#9dffb8', '', 900);
      if (settled) stampText(ctx, 'kg', px + 54, py + 4, 12, PINK, INK, 900);
      // Pink-brown hearts dropping off them: the calories arriving.
      burst(el, 41, { n: particleCount(7, liteFx), speed: [40, 110], life: .8, gravity: 260, angle: -Math.PI / 2, spread: 2.2 }, (x, y, q, i) => {
        ctx.globalAlpha = (1 - q) * .9 * fade;
        ctx.fillStyle = i % 2 ? '#c98a6a' : PINK;
        heart(ctx, x, y, 5 * (1 - q * .3));
      }, e.x, e.y - h * .7);
      break;
    }
    case 'himari-scale-stop': {
      // Missed: it slides to a stop and reads 0.0, then fades.
      ctx.globalAlpha = Math.min(1, e.life / .3);
      scale(ctx, e.x, e.y, el > .2 ? '0.0' : '', el * 8);
      break;
    }
    case 'himari-wings': {
      // 变轻: a small pair of pink outline wings behind her shoulders, beating gently; a feather now and then.
      const h = e.radius ?? 178;
      const fade = Math.min(1, el / .2, e.life / .4);
      const flap = Math.sin(el * 7) * .22;
      const sy = e.y - h * .66;
      ctx.lineJoin = 'round';
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(e.x + side * 6, sy);
        ctx.scale(side, 1);
        ctx.rotate(-.25 - flap);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(26, -34, 52, -26);
        ctx.quadraticCurveTo(46, -12, 50, -6);
        ctx.quadraticCurveTo(38, -2, 42, 8);
        ctx.quadraticCurveTo(28, 6, 28, 16);
        ctx.quadraticCurveTo(12, 10, 0, 0);
        ctx.globalAlpha = fade * .35;
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.globalAlpha = fade * .95;
        ctx.strokeStyle = PINK_DEEP;
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#ffd1dc';
      for (let i = 0, m = particleCount(2, liteFx); i < m; i++) {
        const k = (el * .6 + hash(i, 51)) % 1;
        ctx.globalAlpha = fade * (1 - k) * .8;
        feather(ctx, e.x + (hash(i, 52) - .5) * 70 + Math.sin(el * 3 + i * 2) * 10, sy + 20 - k * 80, 5, Math.sin(el * 4 + i) * .8);
      }
      break;
    }
    case 'himari-sunset': {
      // 一呼百应: the whole stage goes to sunset. A warm soft-light grade over the backdrop (drawn under the bodies, so
      // the fighters stay clear), a low striped sun sinking on the skyline, and the rooftop
      // railing of the place the five of them always watch it from.
      const a = Math.min(1, el / .35, e.life / .35);
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = a * .75;
      ctx.fillStyle = '#ff6a2a';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a * .22;
      ctx.fillStyle = '#ff8a4a';
      ctx.fillRect(0, 0, W, H);
      // The sun: a half disc on the skyline, its lower half cut by bands that widen toward the horizon; it sinks a
      // little while she calls.
      const R = 150, cx = SUN_X, cy = FLOOR - 70 + Math.min(el, 3) * 6;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - R, cy - R, R * 2, R * .5);
      let y = cy - R * .5;
      for (let i = 0; y < cy; i++) {
        const band = Math.max(6, 22 - i * 4), gap = 4 + i * 2;
        ctx.rect(cx - R, y, R * 2, band);
        y += band + gap;
      }
      ctx.clip();
      ctx.globalAlpha = a * .9;
      ctx.fillStyle = '#ffc45a';
      ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 0); ctx.fill();
      ctx.globalAlpha = a * .55;
      ctx.fillStyle = '#ff8a3a';
      ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 0); ctx.arc(cx, cy, R * .72, 0, Math.PI, true); ctx.fill();
      ctx.restore();
      drawRailing(ctx, a);
      break;
    }
    case 'himari-shadow': {
      // Long shadows: the sun is low behind the scene, so every body lays one forward across the floor toward the
      // camera, leaning away from the sun.
      const a = Math.min(1, el / .35, e.life / .35);
      const d = clamp((e.x - SUN_X) / SUN_X, -1, 1);
      const reach = H - e.y + 6;
      ctx.globalAlpha = a * .55;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.moveTo(e.x - 20, e.y);
      ctx.lineTo(e.x + 20, e.y);
      ctx.lineTo(e.x + d * 90 + 30, e.y + reach);
      ctx.lineTo(e.x + d * 90 - 30, e.y + reach);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'himari-wave': {
      // A shout rolling out: three arcs in the shouter's colour, travelling forward and widening.
      const reach = e.tx != null ? Math.abs(e.tx) + 240 : 300;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const k = clamp(t * 1.15 - i * .12, 0, 1);
        if (k <= 0 || k >= 1) continue;
        const x = e.x + dir * reach * ease(k);
        const r = 26 + 70 * k;
        ctx.globalAlpha = (1 - k) * .85;
        ctx.strokeStyle = i === 1 ? '#ffffff' : e.color;
        ctx.lineWidth = 7 - i * 2;
        ctx.beginPath(); ctx.arc(x - dir * r, e.y, r, dir > 0 ? -.75 : Math.PI - .75, dir > 0 ? .75 : Math.PI + .75); ctx.stroke();
      }
      break;
    }
    case 'himari-friend': {
      // One of the four on the skyline behind her, rising with a fist up: her art under a wash of her colour, a
      // white rim, and her 「O！」 over her head; at the end she lifts away as motes of her own light.
      const col = e.n ?? 0;
      const m = HIMARI_FRIENDS[col];
      if (!m) break;
      // Rising, then the shout while her 「O！」 is up, then the hand coming down.
      const row = el < FRIEND_RISE ? HIMARI_FRIEND_ROW.rise : el < SHOUT_END ? HIMARI_FRIEND_ROW.shout : HIMARI_FRIEND_ROW.after;
      const rise = ease(el / FRIEND_RISE);
      const fade = Math.min(1, e.life / FRIEND_FADE);
      const h = m.height;
      const y = e.y + (1 - rise) * 40;
      const im = image(images, HIMARI_FRIENDS_SRC);
      ctx.save();
      ctx.translate(e.x, y);
      ctx.scale(dir, 1);
      ctx.imageSmoothingEnabled = true;
      if (im) {
        const src = keyed(im);
        const sil = tinted(src, col, row, m.color);
        const rim = tinted(src, col, row, '#ffffff');
        if (sil && rim) {
          const big = h * 1.06;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = rise * fade * .4;
          ctx.drawImage(rim, -big / 2, -big + h * .03, big, big);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = rise * fade;
          ctx.drawImage(src, col * CELL, row * CELL, CELL, CELL, -h / 2, -h, h, h);
          ctx.globalAlpha = rise * fade * (1 - FRIEND_SHOW);
          ctx.drawImage(sil, -h / 2, -h, h, h);
        }
      } else {
        ctx.globalAlpha = rise * fade;
        ctx.fillStyle = m.color;
        ctx.fillRect(-10, -h * .66, 20, h * .4);
        ctx.fillRect(-9, -h * .28, 7, h * .28);
        ctx.fillRect(2, -h * .28, 7, h * .28);
        ctx.beginPath(); ctx.arc(0, -h * .76, h * .09, 0, TAU); ctx.fill();
      }
      ctx.restore();
      // The glow on the skyline under her.
      ctx.globalAlpha = rise * fade * .45;
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 34, 8, 0, 0, TAU); ctx.fill();
      // Her answer.
      if (el > .05 && el < SHOUT_END) {
        const pop = el < .17 ? 1 + (1 - (el - .05) / .12) * .5 : 1;
        ctx.globalAlpha = fade * Math.min(1, (el - .05) / .06) * Math.min(1, (SHOUT_END - el) / .2);
        stampText(ctx, 'O！', e.x, y - h - 24, 26 * pop, '#ffffff', m.color, 900);
      }
      if (fade < 1) {
        ctx.fillStyle = m.color;
        for (let i = 0, k = particleCount(10, liteFx); i < k; i++) {
          const u = 1 - fade;
          ctx.globalAlpha = fade * .9;
          dot(ctx, e.x + (hash(i, 61) - .5) * 44, y - h * (.15 + .75 * hash(i, 62)) - u * (60 + hash(i, 63) * 50), 2.6);
        }
      }
      break;
    }
    case 'himari-final': {
      // Everyone answered: a sunrise on the floor ahead of her — a half disc of rays opening along the ground, its rim
      // in all five colours — then motes thrown off its front.
      const R = e.radius ?? 150;
      const k = ease(el / .4);
      const fade = Math.min(1, e.life / .3);
      const r = R * (.3 + k * 1.1);
      // Rays: alternating wedges, turning a little as it opens.
      for (let i = 0; i < 10; i++) {
        const w0 = Math.PI + (i / 10) * Math.PI + el * .6, w1 = w0 + Math.PI / 10;
        if (i % 2) continue;
        ctx.globalAlpha = fade * .45;
        ctx.fillStyle = i % 4 ? '#ffd27a' : '#ff9a55';
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.arc(e.x, e.y, r * 1.15, w0, w1); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = fade * .7;
      ctx.fillStyle = '#ffe2a0';
      ctx.beginPath(); ctx.arc(e.x, e.y, r * .45, Math.PI, 0); ctx.fill();
      ctx.lineCap = 'round';
      for (let i = 0; i < CALL_COLORS.length; i++) {
        const rr = r - i * 8;
        if (rr <= 0) continue;
        ctx.globalAlpha = fade * .9;
        ctx.strokeStyle = CALL_COLORS[i];
        ctx.lineWidth = 7;
        ctx.beginPath(); ctx.arc(e.x, e.y, rr, Math.PI, 0); ctx.stroke();
      }
      burst(el, 71, { n: particleCount(14 + (e.n ?? 0) * 4, liteFx), speed: [220, 520], life: .7, gravity: 120, angle: dir > 0 ? -.35 : Math.PI + .35, spread: 1.6, drag: .3 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = CALL_COLORS[i % CALL_COLORS.length];
        dot(ctx, x, y, 4 * (1 - q * .5));
      }, e.x, e.y - 40);
      break;
    }
    case 'himari-jiggle': {
      // 摇匀: manga shake lines either side of the body, flashing on the beat.
      const h = e.radius ?? 178;
      const on = Math.floor(el * 22) % 2;
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      ctx.globalAlpha = Math.min(1, e.life / .1) * (on ? .95 : .45);
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        const x = e.x + side * (34 + i * 9 + on * 3), y = e.y - h * (.42 + i * .08);
        ctx.beginPath(); ctx.arc(x - side * 20, y, 20, side > 0 ? -.5 : Math.PI - .5, side > 0 ? .5 : Math.PI + .5); ctx.stroke();
      }
      break;
    }
    case 'himari-latte': {
      // Over their head: a latte cup that fills with foam on every shake; on the last one a heart of latte art pops
      // out of the top and the cup bursts into foam.
      const beats = 4;
      const lastAt = HIMARI_SHAKE_FIRST + (beats - 1) * HIMARI_SHAKE_GAP;
      const fill = clamp(Math.floor((el - HIMARI_SHAKE_FIRST) / HIMARI_SHAKE_GAP) + 1, 0, beats) / beats;
      const wob = Math.sin(el * 70) * (el < lastAt ? 3 : 0);
      const popped = el - lastAt;
      if (popped < .05) {
        ctx.save();
        ctx.translate(e.x + wob, e.y);
        ctx.globalAlpha = Math.min(1, el / .08);
        // Cup: a white tapered body with a handle, brown coffee, cream rising.
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.moveTo(-17, -24); ctx.lineTo(17, -24); ctx.lineTo(12, 4); ctx.lineTo(-12, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(-15, -22); ctx.lineTo(15, -22); ctx.lineTo(10.5, 2); ctx.lineTo(-10.5, 2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(17, -12, 6, -1.2, 1.2); ctx.stroke();
        const top = -22 + 3, depth = 20 * (1 - fill * .35);
        ctx.fillStyle = '#8a5a3a';
        ctx.fillRect(-13, top + (20 - depth), 26, depth - 2);
        ctx.fillStyle = CREAM;
        ctx.fillRect(-14, top - fill * 6, 28, 3 + fill * 7);
        ctx.restore();
      } else {
        // The pop: the heart rises, the cup goes to foam.
        const k = clamp(popped / .5, 0, 1);
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#c98a5a';
        heart(ctx, e.x, e.y - 20 - k * 30, 11 + k * 5);
        ctx.fillStyle = CREAM;
        heart(ctx, e.x, e.y - 20 - k * 30, 6 + k * 3);
        burst(popped, 31, { n: particleCount(10, liteFx), speed: [80, 200], life: .5, gravity: 300 }, (x, y, q) => {
          ctx.globalAlpha = 1 - q;
          ctx.fillStyle = CREAM;
          dot(ctx, x, y, 3.5 * (1 - q * .4));
        }, e.x, e.y - 10);
      }
      break;
    }
    case 'himari-reply': {
      // 一呼零应, made literal: over their head an empty reply bubble — 「……」 — pointing at them. Nobody answered.
      const pop = el < .14 ? .5 + ease(el / .14) * .5 : 1;
      const fade = Math.min(1, e.life / .2);
      const bx = e.x + 26, by = e.y - 40;
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(pop, pop);
      ctx.globalAlpha = fade;
      ctx.fillStyle = INK;
      rrect(ctx, -36, -22, 72, 40, 16); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-18, 14); ctx.lineTo(-30, 34); ctx.lineTo(-4, 16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      rrect(ctx, -33, -19, 66, 34, 13); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-17, 12); ctx.lineTo(-26, 28); ctx.lineTo(-7, 13); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9b93a6';
      for (let i = 0; i < 6; i++) dot(ctx, -17 + i * 6.8, -2, 2.4);
      ctx.restore();
      break;
    }
    case 'himari-wind': {
      // The silence: three cold streaks blow across the floor, and a tumbleweed rolls through, bouncing.
      const fade = Math.min(1, el / .1, e.life / .25);
      ctx.strokeStyle = '#dfe8f2';
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const k = clamp(t * 1.3 - i * .12, 0, 1);
        if (k <= 0 || k >= 1) continue;
        const x0 = e.x - dir * 260 + dir * 520 * k, y = e.y - 30 - i * 26;
        ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .7;
        ctx.lineWidth = 3 - i * .6;
        ctx.beginPath(); ctx.moveTo(x0 - dir * 90, y); ctx.quadraticCurveTo(x0 - dir * 40, y - 8, x0, y); ctx.stroke();
      }
      const tx = e.x - dir * 300 + dir * 600 * t;
      const ty = e.y - 14 - Math.abs(Math.sin(t * Math.PI * 3)) * 26;
      ctx.globalAlpha = fade;
      ctx.strokeStyle = '#9c7a4e';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = el * 9 * dir + i * .8;
        ctx.beginPath(); ctx.ellipse(tx, ty, 13, 10, a, 0, TAU); ctx.stroke();
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
