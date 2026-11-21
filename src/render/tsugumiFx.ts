import type { Effect, Projectile } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import {
  CELL, TSUGUMI_EFFORT_MAX, TSUGUMI_HINA_SRC, TSUGUMI_SAYO_SRC, TSUGUMI_SISTER_GAP, TSUGUMI_SQUEEZE_BEATS, TSUGUMI_SQUEEZE_IN,
  TSUGUMI_STAR, TSUGUMI_TRAY_SRC, guestCell,
} from './clips.ts';
import { TAU, dot, glow, hash, petal, sparkle } from './fxParticles.ts';

/* 羽泽鸫 — 暖黄的星星、银托盘、琴键和冰川双子. Four registers:
   - her warm yellow (#FFEE88) for every star: the 努力 stars over her half of the stage, the spark that flies up
     each time one is earned, the gathering and the meteor of 平凡之星;
   - silver for the café tray (tray.png, or a drawn plate until it comes in): a flat spinning ellipse with one glint;
   - white and ink for 琴键重锤: light keys rising out of the floor one after another, each pressed down;
   - teal (纱夜) and cyan (日菜) for 冰川夹心: the sisters on their own standing cells under a colour wash, mint
     petals off 纱夜 and small stars off 日菜.
   Nothing written on screen. Shapes stay big and soft so they read from across the room; the busiest moment, the
   meteor landing, is about 30 particles. */

export const TSUGUMI_BACK: readonly string[] = ['tsugumi-sky', 'tsugumi-sister', 'tsugumi-key', 'tsugumi-gather', 'tsugumi-lose'];
export const TSUGUMI_SCREEN_BACK: readonly string[] = ['tsugumi-night'];

const YELLOW = '#FFEE88';
const GOLD = '255,226,120';
const WARM = '255,244,200';
const TEAL = '#00AABB';
const CYAN = '#55DDEE';
const MINT = '#9fe8dc';
const INK = '#2a2440';
/** Below the HUD (health and energy bars, names, timer) at any usual screen size, still well above the heads. */
const SKY_Y = 150;

const count = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

const tintCache = new WeakMap<CanvasImageSource, Map<string, HTMLCanvasElement>>();
/** One cell of a picture as a flat silhouette in one colour, baked once. */
function tinted(src: CanvasImageSource, sx: number, sy: number, color: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let per = tintCache.get(src);
  if (!per) { per = new Map(); tintCache.set(src, per); }
  const key = sx + ',' + sy + '|' + color;
  const hit = per.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = CELL; c.height = CELL;
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(src, sx, sy, CELL, CELL, 0, 0, CELL, CELL);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, CELL, CELL);
  if (per.size >= 24) per.clear();
  per.set(key, c);
  return c;
}

/** Where a sister is in her part of 冰川夹心, `el` seconds after the catch: which of her own cells, how far she has
 *  come in (0 at twice the gap, 1 at the gap), how hard she leans into the squeeze, how much of her colour washes her. */
function sisterPose(el: number, life: number): { cell: string; phase: number; come: number; push: number; wash: number; moving: boolean } {
  const last = TSUGUMI_SQUEEZE_BEATS[TSUGUMI_SQUEEZE_BEATS.length - 1];
  if (el < TSUGUMI_SQUEEZE_IN) {
    // The run in, on her own run cycle; her colour still thick on her, as if she had just stepped out of the light.
    const run = ['run0', 'run1', 'run2', 'run3'][Math.floor(el * 16) % 4];
    return { cell: run, phase: 0, come: ease(el / TSUGUMI_SQUEEZE_IN), push: 0, wash: .5 - .3 * (el / TSUGUMI_SQUEEZE_IN), moving: true };
  }
  for (const b of TSUGUMI_SQUEEZE_BEATS) {
    // Each squeeze: her own light-hit cell (arms driven in), a quick lunge, then settling back.
    if (el >= b - .06 && el < b + .14) {
      const k = el < b ? (el - b + .06) / .06 : 1 - (el - b) / .14;
      return { cell: 'light', phase: 1, come: 1, push: clamp(k, 0, 1), wash: .2, moving: false };
    }
  }
  if (el < last + .14) return { cell: 'block', phase: 0, come: 1, push: .25, wash: .2, moving: false };
  // Done: she hops back out on her dodge cell and dissolves into her colour.
  const out = clamp(1 - life / .22, 0, 1);
  return { cell: 'dodge', phase: 0, come: 1 - out * .5, push: 0, wash: .2 + out * .6, moving: true };
}

/** Where star i of a row of n sits: a shallow arc over her half of the stage. */
export function starSlot(cx: number, i: number, n: number): { x: number; y: number } {
  const span = Math.min(n, TSUGUMI_EFFORT_MAX) - 1;
  const u = span > 0 ? i / span - .5 : 0;
  return { x: cx + u * 34 * span, y: SKY_Y + (u * u) * 46 + (hash(i, 7) - .5) * 10 };
}

/** One warm star: a soft halo, the four-point body, a white core. `tw` twinkles it (0..1). */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tw: number, alpha = 1): void {
  ctx.globalAlpha = alpha * (.35 + .2 * tw);
  glow(ctx, x, y, r * 3.2, GOLD);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = YELLOW;
  sparkle(ctx, x, y, r * (1.6 + .25 * tw));
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = alpha * (.8 + .2 * tw);
  dot(ctx, x, y, r * .45);
}

/** The café tray, side-on as it spins: an ellipse that flattens and opens with the turn. */
function tray(ctx: CanvasRenderingContext2D, x: number, y: number, spin: number, images?: ImageCache): void {
  const open = .28 + .72 * Math.abs(Math.cos(spin));
  const im = image(images, TSUGUMI_TRAY_SRC);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(spin * .5) * .12);
  if (im) {
    ctx.imageSmoothingEnabled = true;
    ctx.scale(1, open);
    ctx.drawImage(im, -36, -36, 72, 72);
  } else {
    ctx.scale(1, open);
    ctx.fillStyle = '#8f98ad';
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8ecf6';
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#c3cadb';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.stroke();
  }
  ctx.restore();
  // One glint that runs round the rim with the spin.
  const ga = spin * 1.3;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = .55 + .45 * Math.abs(Math.sin(spin));
  sparkle(ctx, x + Math.cos(ga) * 26, y + Math.sin(ga) * 26 * open, 7);
  ctx.globalAlpha = 1;
}

export function drawTsugumiShot(ctx: CanvasRenderingContext2D, p: Projectile, liteFx: boolean, images?: ImageCache): boolean {
  if (p.fx !== 'tsugumi-tray') return false;
  const dir = Math.sign(p.vx) || 1;
  const spin = p.age * 22;
  ctx.save();
  // A pale-gold arc of afterimages behind it: it is spinning, not just flying.
  const n = count(4, liteFx);
  for (let i = n; i >= 1; i--) {
    const back = i * 15;
    ctx.globalAlpha = .16 * (1 - i / (n + 1));
    ctx.fillStyle = '#fff1c4';
    ctx.beginPath();
    ctx.ellipse(p.x - dir * back, p.y, 30, 30 * (.3 + .7 * Math.abs(Math.cos(spin - i * .5))), 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = .45;
  glow(ctx, p.x, p.y, 46, WARM);
  ctx.globalAlpha = 1;
  tray(ctx, p.x, p.y, spin, images);
  ctx.restore();
  return true;
}

export function drawTsugumiFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('tsugumi-')) return false;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    case 'tsugumi-sky': {
      // 努力家: her stars over her half of the stage, each twinkling on its own beat.
      const n = e.n ?? 0;
      // Kept alive a step at a time by game/tsugumi.ts, which also runs e.age as its clock.
      const age = e.age ?? 0;
      const fade = Math.min(1, age / .25, e.life / .25);
      for (let i = 0; i < n; i++) {
        const s = starSlot(e.x, i, n);
        const tw = .5 + .5 * Math.sin(age * 2.6 + i * 1.7);
        star(ctx, s.x, s.y, 5 + (i === n - 1 ? 1 : 0), tw, fade);
      }
      break;
    }
    case 'tsugumi-earn': {
      // One more star: a spark rises from the hit in a curve and pops into its place over the stage.
      const cx = e.x + (e.tx ?? 0);
      const n = (e.n ?? 0) + 1;
      const end = starSlot(cx, n - 1, n);
      const k = ease(el / .55);
      const x = e.x + (end.x - e.x) * k;
      const y = e.y + (end.y - e.y) * k - Math.sin(k * Math.PI) * 60;
      if (k < 1) {
        ctx.globalAlpha = .5 * (1 - k);
        glow(ctx, e.x + (end.x - e.x) * k * .85, e.y + (end.y - e.y) * k * .85, 16, GOLD);
        star(ctx, x, y, 4, 1, 1);
      } else {
        const pop = (el - .55) / .15;
        ctx.strokeStyle = YELLOW;
        ctx.lineWidth = 2;
        ctx.globalAlpha = Math.max(0, 1 - pop);
        ctx.beginPath(); ctx.arc(end.x, end.y, 6 + pop * 14, 0, TAU); ctx.stroke();
      }
      break;
    }
    case 'tsugumi-lose': {
      // A knockdown: the last star loosens and drops, dimming as it goes.
      const n = (e.n ?? 0) + 1;
      const s = starSlot(e.x, n - 1, n);
      const k = el / e.max;
      star(ctx, s.x + k * 20, s.y + k * k * 90, 4 * (1 - k * .6), 0, 1 - k);
      break;
    }
    case 'tsugumi-fever': {
      // 过劳: two pink cheeks and three wisps of steam off the top of her head; she sways a little.
      const h = e.radius ?? 181;
      const fade = Math.min(1, el / .1, e.life / .2);
      ctx.globalAlpha = fade * .7;
      glow(ctx, e.x + 10, e.y - h * .8, 12, '255,130,150');
      glow(ctx, e.x - 10, e.y - h * .8, 10, '255,130,150');
      for (let i = 0; i < count(3, liteFx); i++) {
        const k = (el * 1.6 + i / 3) % 1;
        ctx.globalAlpha = fade * (1 - k) * .55;
        glow(ctx, e.x - 12 + i * 12 + Math.sin(k * 6 + i) * 6, e.y - h - 4 - k * 46, 9 + k * 10, '255,255,255');
      }
      break;
    }
    case 'tsugumi-sister': {
      // 冰川夹心: a sister runs in from twice the gap on her own run cycle, drives in on her own light-hit cell with each
      // squeeze and holds on her guard cell between, then hops back on her dodge cell and dissolves. She wears a wash
      // of her colour (thick as she arrives, thin once she is there), a white rim, afterimages while she moves and a
      // shadow on the floor, so she reads as a summoned guest in the scene rather than a picture on top of it.
      // n 0 is 纱夜, 1 is 日菜; dir faces the body in the middle.
      const sayo = (e.n ?? 0) === 0;
      const gap = e.tx ?? TSUGUMI_SISTER_GAP;
      const p = sisterPose(el, e.life);
      const x = e.x + gap * (2 - p.come) - Math.sign(gap) * p.push * 10;
      const fade = Math.min(1, el / .06, e.life / .22);
      const h = 181;
      const im = image(images, sayo ? TSUGUMI_SAYO_SRC : TSUGUMI_HINA_SRC);
      const col = sayo ? TEAL : CYAN;
      const rgb = sayo ? '0,170,187' : '85,221,238';
      // Contact shadow and a puff of dust where she plants her feet.
      ctx.globalAlpha = fade * .32;
      ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.ellipse(x, e.y + 2, 34 + p.push * 6, 7, 0, 0, TAU); ctx.fill();
      if (el > TSUGUMI_SQUEEZE_IN && el < TSUGUMI_SQUEEZE_IN + .3) {
        const k = (el - TSUGUMI_SQUEEZE_IN) / .3;
        ctx.globalAlpha = fade * (1 - k) * .5;
        glow(ctx, x - Math.sign(gap) * 16, e.y - 6, 14 + k * 16, '236,240,248');
      }
      ctx.save();
      ctx.translate(x, e.y);
      ctx.scale(dir, 1);
      // Squash and stretch about the feet with the push: wider and lower as she drives in.
      ctx.scale(1 + p.push * .06, 1 - p.push * .04);
      if (im) {
        const c = guestCell(p.cell, p.phase);
        const sil = tinted(im, c.sx, c.sy, col);
        const rim = tinted(im, c.sx, c.sy, '#ffffff');
        ctx.imageSmoothingEnabled = true;
        if (sil && p.moving) {
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 1; i <= count(3, liteFx); i++) {
            ctx.globalAlpha = fade * .16 / i;
            ctx.drawImage(sil, -h / 2 - i * 14, -h, h, h);
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        if (rim) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = fade * .28;
          const big = 1.04;
          ctx.drawImage(rim, -h * big / 2, -h * big, h * big, h * big);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = fade;
        ctx.drawImage(im, c.sx, c.sy, CELL, CELL, -h / 2, -h, h, h);
        if (sil) {
          ctx.globalAlpha = fade * p.wash;
          ctx.drawImage(sil, -h / 2, -h, h, h);
        }
      } else {
        ctx.globalAlpha = fade;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.roundRect(-22, -h * .8, 44, h * .8, 14); ctx.fill();
        dot(ctx, 0, -h * .88, 18);
      }
      ctx.restore();
      // A soft light of her colour behind her waist, stronger on each push.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * (.12 + p.push * .18);
      glow(ctx, x, e.y - h * .45, h * .42, rgb);
      ctx.globalCompositeOperation = 'source-over';
      // 纱夜 sheds mint petals, 日菜 small bright stars (るん♪).
      const n = count(5, liteFx);
      for (let i = 0; i < n; i++) {
        const c = (el * .9 + hash(i, sayo ? 3 : 4)) % 1;
        const px = x + (hash(i, 5) - .5) * 70, py = e.y - h * .25 - c * h * .8;
        ctx.globalAlpha = fade * Math.sin(c * Math.PI) * .9;
        if (sayo) petal(ctx, px, py, 6, c * 5 + i, MINT);
        else { ctx.fillStyle = '#e8fbff'; sparkle(ctx, px, py, 6); }
      }
      break;
    }
    case 'tsugumi-press': {
      // One squeeze: two bright brackets close in from both sides and a puff of white at the waist.
      const h = e.radius ?? 181;
      const k = ease(el / .14);
      const w = 60 - k * 28;
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      ctx.lineWidth = e.hit ? 6 : 4;
      ctx.globalAlpha = life;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(e.x + s * w, e.y, h * .35, s > 0 ? Math.PI * .72 : -Math.PI * .28, s > 0 ? Math.PI * 1.28 : Math.PI * .28);
        ctx.stroke();
      }
      ctx.globalAlpha = life * .6;
      glow(ctx, e.x, e.y, 30 + k * 20, WARM);
      break;
    }
    case 'tsugumi-clang': {
      // The tray hits: a flat silver ring and a short white glint.
      const k = ease(el / e.max);
      ctx.strokeStyle = '#e8ecf6';
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 14 + k * 30, 30 + k * 40, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x - dir * 6, e.y - 10, 16 * (1 - k * .5));
      break;
    }
    case 'tsugumi-slam': {
      // Both fists down: a shallow ripple on the floor and a dust lip either side.
      const k = ease(el / e.max);
      ctx.strokeStyle = '#fff6d8';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 18 + k * 60, 4 + k * 10, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = (1 - k) * .5;
      glow(ctx, e.x, e.y - 6, 26 + k * 20, WARM);
      break;
    }
    case 'tsugumi-tear': {
      // 指节好痛: a small tear at the eye, and two little shake lines off her front hand.
      const h = e.radius ?? 181;
      const fade = Math.min(1, el / .1, e.life / .2);
      const drop = Math.min(1, Math.max(0, el - .2) / .5);
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#bfe6ff';
      const tx = e.x + dir * 14, ty = e.y - h * .82 + drop * 18;
      ctx.beginPath();
      ctx.moveTo(tx, ty - 7);
      ctx.quadraticCurveTo(tx + 5, ty, tx, ty + 4);
      ctx.quadraticCurveTo(tx - 5, ty, tx, ty - 7);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      const shake = Math.sin(el * 40) * 3;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.moveTo(e.x + dir * (40 + i * 8), e.y - h * .5 - 12 + i * 10 + shake);
        ctx.lineTo(e.x + dir * (50 + i * 8), e.y - h * .5 - 16 + i * 10 + shake);
        ctx.stroke();
      }
      break;
    }
    case 'tsugumi-key': {
      // A light key rises out of the floor, is pressed down hard, and sinks back. Every other one carries a black
      // key on its shoulder, so the row reads as a keyboard. The last one stands tallest.
      const i = e.n ?? 0;
      const tall = e.hit ? 1.45 : 1 + i * .05;
      const up = ease(el / .1);
      const press = el > .1 ? ease((el - .1) / .12) : 0;
      const sink = el > .3 ? ease((el - .3) / .25) : 0;
      const hgt = 62 * tall * (up - press * .35 - sink * .65);
      if (hgt <= 0) break;
      const w = 38;
      const x = e.x - w / 2;
      const fade = 1 - sink;
      ctx.globalAlpha = fade * .45;
      glow(ctx, e.x, FLOOR - hgt * .4, 36 * tall, GOLD);
      ctx.globalAlpha = fade * .92;
      const g = ctx.createLinearGradient(0, FLOOR - hgt, 0, FLOOR);
      g.addColorStop(0, 'rgba(255,255,255,.95)');
      g.addColorStop(1, 'rgba(255,246,210,.35)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(x, FLOOR - hgt, w, hgt, [6, 6, 0, 0]); ctx.fill();
      ctx.strokeStyle = 'rgba(255,226,120,.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (i % 2 === 0) {
        ctx.fillStyle = INK;
        ctx.globalAlpha = fade * .8;
        ctx.beginPath(); ctx.roundRect(e.x + dir * (w / 2) - 9, FLOOR - hgt - 2, 18, hgt * .6, [4, 4, 2, 2]); ctx.fill();
      }
      // The press: a quick ring at the top of the key.
      if (press > 0 && press < 1) {
        ctx.globalAlpha = 1 - press;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(e.x, FLOOR - hgt, 14 + press * 18, 4 + press * 5, 0, 0, TAU); ctx.stroke();
      }
      break;
    }
    case 'tsugumi-chord': {
      // A key catches someone: three thin light rays fan upward from their feet.
      const k = ease(el / e.max);
      ctx.strokeStyle = '#fff6d8';
      ctx.lineCap = 'round';
      ctx.globalAlpha = 1 - k;
      for (let i = -1; i <= 1; i++) {
        const a = -Math.PI / 2 + i * .32 + dir * .1;
        ctx.lineWidth = 4 - Math.abs(i);
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20);
        ctx.lineTo(e.x + Math.cos(a) * (40 + k * 90), e.y + Math.sin(a) * (40 + k * 90));
        ctx.stroke();
      }
      break;
    }
    case 'tsugumi-night': {
      // 平凡之星: the top of the stage turns to night in three soft bands; the fighters stay clear below.
      const fade = Math.min(1, el / .3, e.life / .35);
      const g = ctx.createLinearGradient(0, 0, 0, H * .62);
      g.addColorStop(0, 'rgba(12,20,58,.88)');
      g.addColorStop(.45, 'rgba(26,38,92,.55)');
      g.addColorStop(1, 'rgba(40,52,110,0)');
      ctx.globalAlpha = fade;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H * .62);
      // A dusting of tiny far stars.
      ctx.fillStyle = '#dfe6ff';
      for (let i = 0; i < count(26, liteFx); i++) {
        const tw = .5 + .5 * Math.sin(el * 3 + i * 2.1);
        ctx.globalAlpha = fade * (.25 + .45 * tw) * (1 - hash(i, 2) * .4);
        dot(ctx, hash(i, 0) * W, hash(i, 1) * H * .42, 1 + hash(i, 3) * 1.2);
      }
      break;
    }
    case 'tsugumi-gather': {
      // Her stars come up over her half, then drift together into one; the one grows, takes a long cross glint,
      // and leaves when the meteor starts (TSUGUMI_STAR.fall).
      const S = TSUGUMI_STAR;
      if (el >= S.fall) break;
      const n = Math.max(1, e.n ?? 3);
      const cx = e.x;
      const meet = { x: cx, y: SKY_Y - 4 };
      const k = el < S.point ? 0 : ease((el - S.point) / (S.fall - S.point - .12));
      const show = Math.min(1, el / .25);
      for (let i = 0; i < n; i++) {
        const s = starSlot(cx, i, n);
        const x = s.x + (meet.x - s.x) * k, y = s.y + (meet.y - s.y) * k;
        star(ctx, x, y, 5, .5 + .5 * Math.sin(el * 5 + i), show * (1 - k * .7));
      }
      if (k > 0) {
        const r = 6 + k * (8 + n * 1.5);
        ctx.globalAlpha = k * .6;
        glow(ctx, meet.x, meet.y, r * 4, GOLD);
        ctx.globalAlpha = k;
        ctx.strokeStyle = 'rgba(255,250,225,.9)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        const L = r * 4.2;
        ctx.beginPath(); ctx.moveTo(meet.x - L, meet.y); ctx.lineTo(meet.x + L, meet.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(meet.x, meet.y - L * .7); ctx.lineTo(meet.x, meet.y + L * .7); ctx.stroke();
        star(ctx, meet.x, meet.y, r, 1, k);
      }
      break;
    }
    case 'tsugumi-meteor': {
      // The brightest star comes down from over her half to where they stood: a long soft tail, the head white-hot.
      const fall = e.t0 ?? .3;
      const sx = e.x + (e.tx ?? 0), sy = SKY_Y - 4;
      if (el < fall) {
        const k = (el / fall) ** 1.6;
        const x = sx + (e.x - sx) * k, y = sy + (FLOOR - 30 - sy) * k;
        const ang = Math.atan2(FLOOR - 30 - sy, e.x - sx);
        const tail = 160 + k * 120;
        const g = ctx.createLinearGradient(x, y, x - Math.cos(ang) * tail, y - Math.sin(ang) * tail);
        g.addColorStop(0, 'rgba(255,250,225,.95)');
        g.addColorStop(.3, 'rgba(255,226,120,.55)');
        g.addColorStop(1, 'rgba(255,226,120,0)');
        ctx.strokeStyle = g;
        ctx.lineCap = 'round';
        ctx.lineWidth = 16;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang) * tail, y - Math.sin(ang) * tail); ctx.stroke();
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang) * tail * .45, y - Math.sin(ang) * tail * .45); ctx.stroke();
        ctx.globalAlpha = .8;
        glow(ctx, x, y, 44, GOLD);
        star(ctx, x, y, 11, 1, 1);
      } else {
        // Landed: a warm afterglow pooling on the floor while the small stars come down.
        const k = (el - fall) / (e.max - fall);
        ctx.globalAlpha = (1 - k) * .55;
        glow(ctx, e.x, FLOOR - 16, 90, GOLD);
      }
      break;
    }
    case 'tsugumi-spark': {
      // A small star lands: a bright point, a short four-point flare and a few motes kicked up.
      const k = ease(el / e.max);
      const x = e.x, y = FLOOR - 26;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = YELLOW;
      sparkle(ctx, x, y, 22 * (1 - k * .5));
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < count(4, liteFx); i++) {
        const a = -Math.PI / 2 + (hash(i, (e.n ?? 0) + 9) - .5) * 2;
        dot(ctx, x + Math.cos(a) * k * 50, y + Math.sin(a) * k * 50 + k * k * 30, 2.2);
      }
      break;
    }
    case 'tsugumi-impact': {
      // The big star: a warm ring along the floor, a column of light, star dust falling back.
      const k = ease(el / .5);
      const R = e.radius ?? 150;
      ctx.globalAlpha = Math.max(0, 1 - el / .6);
      ctx.strokeStyle = 'rgba(255,240,180,1)';
      ctx.lineWidth = 6 * (1 - k) + 2;
      ctx.beginPath(); ctx.ellipse(e.x, FLOOR, R * k, R * .22 * k, 0, 0, TAU); ctx.stroke();
      const col = ctx.createLinearGradient(0, 0, 0, FLOOR);
      col.addColorStop(0, 'rgba(255,240,180,0)');
      col.addColorStop(1, 'rgba(255,240,180,.7)');
      ctx.fillStyle = col;
      ctx.globalAlpha = Math.max(0, 1 - el / .45);
      ctx.fillRect(e.x - 34 * (1 - k * .5), 0, 68 * (1 - k * .5), FLOOR);
      const n = count(22, liteFx);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * (.1 + hash(i, 1) * .8);
        const sp = 120 + hash(i, 2) * 260;
        const x = e.x + Math.cos(a) * sp * el, y = FLOOR - 20 + Math.sin(a) * sp * el + 380 * el * el;
        ctx.globalAlpha = Math.max(0, 1 - el / e.max) * .95;
        ctx.fillStyle = i % 3 ? YELLOW : '#ffffff';
        if (i % 4 === 0) sparkle(ctx, x, y, 7); else dot(ctx, x, y, 2.4);
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
