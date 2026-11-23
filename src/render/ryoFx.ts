import type { Effect } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { RYO_BORROW, RYO_BROKE } from './clips.ts';
import type { BodyLook } from './statusMarks.ts';
import { TAU, burst, cycle, dot, glow, hash, sparkle } from './fxParticles.ts';

/* 山田凉 — 穷富循环. Three registers:
   - weeds: fresh green blades and leaves, a little soil, the bitter green puff after the swallow; a sickly yellow-green
     for the meal that was one too many. Soft, small, never a cartoon icon.
   - money: gold coins (a disc with a rim and one glint, turning by squashing the width), a cream IOU slip with a red
     seal and no writing on it; grey moth-dust for an empty pocket.
   - the bass: her deep blue (#3D5DAF) and indigo, low and wide — waves that hug the floor, the floor itself shaking,
     the stage dimmed to indigo behind the bodies.
   Nothing written on screen. The busiest frame (coins going up during the super) is about 36 shapes; lite halves it. */

export const RYO_SCREEN_BACK: readonly string[] = ['ryo-sub'];
export const RYO_BACK: readonly string[] = ['ryo-heal', 'ryo-aloof'];

const BLUE_RGB = '61,93,175';
const DEEP_RGB = '34,44,108';
const PALE_RGB = '170,196,255';
const LEAF_RGB = '124,196,106';
const SICK_RGB = '176,200,84';
const GOLD_RGB = '255,214,110';
const PINK_RGB = '255,157,181';
const LEAVES: readonly string[] = ['#6dbb5a', '#8fd16a', '#4f9a45', '#b5e08a'];

const count = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;

/** A leaf: a pointed oval along angle `a`, length `l`. */
function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, l: number, a: number): void {
  if (!(l > 0)) return;
  const c = Math.cos(a), s = Math.sin(a);
  const w = l * .36;
  ctx.beginPath();
  ctx.moveTo(x - c * l * .5, y - s * l * .5);
  ctx.quadraticCurveTo(x - s * w, y + c * w, x + c * l * .5, y + s * l * .5);
  ctx.quadraticCurveTo(x + s * w, y - c * w, x - c * l * .5, y - s * l * .5);
  ctx.fill();
}
/** One blade of grass rising from x, y: a thin curved spike leaning `lean`. */
function blade(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, lean: number): void {
  if (!(h > 0)) return;
  ctx.beginPath();
  ctx.moveTo(x - 2.4, y);
  ctx.quadraticCurveTo(x + lean * .3, y - h * .6, x + lean, y - h);
  ctx.quadraticCurveTo(x + lean * .3 + 1.2, y - h * .55, x + 2.4, y);
  ctx.fill();
}
/** One flat coin face (rim, face, glint) painted once; a turning coin is this stamp squashed on x. */
const COIN_PX = 48;
let coinStamp: HTMLCanvasElement | null | undefined;
function coinSprite(): HTMLCanvasElement | null {
  if (coinStamp !== undefined) return coinStamp;
  coinStamp = null;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = COIN_PX;
  const g = c.getContext('2d');
  if (!g) return null;
  const m = COIN_PX / 2, r = m - 2;
  g.fillStyle = '#b8832a';
  g.beginPath(); g.arc(m, m, r + 1.5, 0, TAU); g.fill();
  g.fillStyle = '#f2c94c';
  g.beginPath(); g.arc(m, m, r * .82, 0, TAU); g.fill();
  g.fillStyle = '#fff3c4';
  g.beginPath(); g.arc(m - r * .3, m - r * .3, r * .22, 0, TAU); g.fill();
  return coinStamp = c;
}
/** A gold coin of radius r turning about its upright axis (`spin` is the phase): rim, face, one glint. One drawImage
 *  from the cached face; the path version only runs where there is no DOM (the headless checks). */
function coin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number): void {
  if (!(r > 0)) return;
  const w = Math.max(.18, Math.abs(Math.cos(spin)));
  const sprite = coinSprite();
  if (sprite) {
    const k = (r + 1.5) / (COIN_PX / 2 - 2 + 1.5);
    const half = COIN_PX / 2 * k;
    ctx.drawImage(sprite, x - half * w, y - half, half * 2 * w, half * 2);
    return;
  }
  ctx.fillStyle = '#b8832a';
  ctx.beginPath(); ctx.ellipse(x, y, r * w + .8, r + .8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f2c94c';
  ctx.beginPath(); ctx.ellipse(x, y, r * w * .82, r * .82, 0, 0, TAU); ctx.fill();
  if (w > .45) {
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath(); ctx.ellipse(x - r * w * .3, y - r * .3, r * w * .22, r * .22, 0, 0, TAU); ctx.fill();
  }
}
/** The slip painted once per curl step (SLIP_STEPS of them) at SLIP_S, twice over for crisp downscaling. */
const SLIP_S = 16, SLIP_SCALE = 2, SLIP_STEPS = 4;
const slipStamps: (HTMLCanvasElement | null)[] = [];
function slipSprite(step: number): HTMLCanvasElement | null {
  if (slipStamps[step] !== undefined) return slipStamps[step];
  slipStamps[step] = null;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.ceil(SLIP_S * 1.5 * SLIP_SCALE) + 4;
  c.height = Math.ceil(SLIP_S * SLIP_SCALE) + 4;
  const g = c.getContext('2d');
  if (!g) return null;
  g.translate(c.width / 2, c.height / 2);
  g.scale(SLIP_SCALE, SLIP_SCALE);
  slipPath(g, SLIP_S, step / (SLIP_STEPS - 1));
  return slipStamps[step] = c;
}
/** The IOU: a cream slip with a folded corner and a red seal. No writing on it. From the cached slip when there is a
 *  DOM (the curl is stepped); the path version only runs headless. */
function slip(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, curl = 0): void {
  if (!(s > 0)) return;
  const sprite = slipSprite(Math.round(clamp(curl, 0, 1) * (SLIP_STEPS - 1)));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (sprite) {
    const k = s / (SLIP_S * SLIP_SCALE);
    ctx.drawImage(sprite, -sprite.width * k / 2, -sprite.height * k / 2, sprite.width * k, sprite.height * k);
  } else slipPath(ctx, s, curl);
  ctx.restore();
}
function slipPath(ctx: CanvasRenderingContext2D, s: number, curl: number): void {
  const w = s * 1.5, h = s;
  ctx.fillStyle = '#fbf3dc';
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2 - s * .32, -h / 2);
  ctx.lineTo(w / 2, -h / 2 + s * .32);
  ctx.lineTo(w / 2, h / 2 - curl * h * .5);
  ctx.quadraticCurveTo(w / 2 - curl * w * .2, h / 2, w / 2 - curl * w * .4, h / 2);
  ctx.lineTo(-w / 2, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e6d7ad';
  ctx.beginPath();
  ctx.moveTo(w / 2 - s * .32, -h / 2);
  ctx.lineTo(w / 2 - s * .32, -h / 2 + s * .32);
  ctx.lineTo(w / 2, -h / 2 + s * .32);
  ctx.closePath();
  ctx.fill();
  // Two faint ruled lines, then the seal.
  ctx.fillStyle = 'rgba(150,130,90,.35)';
  ctx.fillRect(-w * .38, -h * .12, w * .5, 1.4);
  ctx.fillRect(-w * .38, h * .14, w * .42, 1.4);
  ctx.fillStyle = '#d8423a';
  ctx.beginPath(); ctx.arc(w * .26, h * .12, s * .2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fbf3dc';
  ctx.beginPath(); ctx.arc(w * .26, h * .12, s * .11, 0, TAU); ctx.fill();
}
/** Coins flying along an arc from (x, y) to (x + tx, y + ty), staggered; k is the effect's progress 0..1. */
function coinArc(ctx: CanvasRenderingContext2D, x: number, y: number, tx: number, ty: number, k: number, n: number, seed: number): void {
  for (let i = 0; i < n; i++) {
    const u = clamp((k - i * .06) / .55, 0, 1);
    if (u <= 0 || u >= 1) continue;
    const e = ease(u);
    const lift = Math.sin(u * Math.PI) * (40 + hash(i, seed) * 30);
    const px = x + tx * e + (hash(i, seed + 1) - .5) * 14;
    const py = y + ty * e - lift;
    ctx.globalAlpha = Math.min(1, (1 - u) * 4);
    coin(ctx, px, py, 6.5, u * 9 + i);
  }
}
/** A gold sparkle where coins land. */
function landing(ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  if (k <= .45 || k >= .95) return;
  const v = (k - .45) / .5;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (1 - v) * .6;
  glow(ctx, x, y, 22 + 14 * v, GOLD_RGB);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1 - v;
  ctx.fillStyle = '#fff6d0';
  sparkle(ctx, x, y, 9 * (1 - v * .5));
}

/* ---- status looks ---- */

/** 'ryo-iou' (on whoever lent her money): the slip floats over their head, swaying; it curls as the time runs out. */
export function auraRyoIou(ctx: CanvasRenderingContext2D, f: Fighter, h: number, left: number, t: number): void {
  const fade = Math.min(1, left / .2);
  const curl = clamp(1 - left / RYO_BORROW.iou, 0, 1);
  ctx.save();
  ctx.globalAlpha = fade * .95;
  slip(ctx, f.x + Math.sin(t * 2.4) * 4, f.y - h - 22 + Math.sin(t * 3.1) * 2, 16, Math.sin(t * 2.4) * .12, curl);
  ctx.restore();
}
/** 'ryo-sick' (減速 on her, after the third meal): a sickly tint on the body and little green bubbles rising. */
export const RYO_SICK_BODY: BodyLook = { washes: [{ tint: '#a8d060', alpha: .28, mode: 'source-atop' }] };
export function auraRyoSick(ctx: CanvasRenderingContext2D, f: Fighter, h: number, left: number, t: number, lite: boolean): void {
  const fade = Math.min(1, left / .25);
  ctx.save();
  for (let i = 0, n = count(5, lite); i < n; i++) {
    const k = cycle(t, .8, i, 41);
    const x = f.x + (hash(i, 42) - .5) * 40 + Math.sin(t * 3 + i) * 4;
    const y = f.y - h * (.7 + k * .45);
    ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .75;
    ctx.strokeStyle = `rgb(${SICK_RGB})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, 3 + hash(i, 43) * 3, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

/* ---- effects ---- */

export function drawRyoFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false): boolean {
  if (!e.type.startsWith('ryo-')) return false;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    case 'ryo-pluck': {
      // The weed comes out of the ground: a few blades snapping up, soil flecks thrown, a puff of dust.
      ctx.fillStyle = '#8a6a48';
      burst(el, 11, { n: count(8, liteFx), speed: [60, 160], life: .45, angle: -Math.PI / 2, spread: 1.8, gravity: 520 }, (x, y, k) => {
        ctx.globalAlpha = (1 - k) * .9;
        dot(ctx, x, y, 2.4 * (1 - k * .4));
      }, e.x, e.y - 4);
      for (let i = 0, n = count(5, liteFx); i < n; i++) {
        ctx.globalAlpha = life * .9;
        ctx.fillStyle = LEAVES[i % LEAVES.length];
        blade(ctx, e.x + (i - 2) * 5, e.y - 2, (12 + hash(i, 12) * 10) * (1 - t * .6), (hash(i, 13) - .5) * 14 + dir * 4);
      }
      ctx.globalAlpha = life * .35;
      ctx.fillStyle = '#d8ccb8';
      dot(ctx, e.x, e.y - 6, 10 + t * 16);
      break;
    }
    case 'ryo-chew': {
      // Chewing: tiny bits of leaf dropping from her mouth, on a slow beat.
      const fade = Math.min(1, el / .08, e.life / .08);
      for (let i = 0, n = count(5, liteFx); i < n; i++) {
        const k = cycle(el, 1.6, i, 21);
        ctx.globalAlpha = fade * (1 - k) * .9;
        ctx.fillStyle = LEAVES[i % LEAVES.length];
        leaf(ctx, e.x + dir * (4 + hash(i, 22) * 10), e.y + k * 30, 5 * (1 - k * .5), k * 4 + i);
      }
      break;
    }
    case 'ryo-bitter': {
      // The swallow: a small bitter green puff off her mouth (a sicklier one for the meal that was one too many).
      const rgb = (e.n ?? 0) ? SICK_RGB : LEAF_RGB;
      for (let i = 0; i < 3; i++) {
        const u = clamp((el - i * .07) / .4, 0, 1);
        if (u <= 0 || u >= 1) continue;
        ctx.globalAlpha = (1 - u) * .55;
        glow(ctx, e.x + dir * (6 + u * 26 + i * 6), e.y - u * 18 - i * 4, 8 + u * 12, rgb);
      }
      break;
    }
    case 'ryo-heal': {
      // The meal goes down: leaves rising round her and a soft green warmth. Broke (hit), it lingers and pulses.
      const h = e.radius ?? 181;
      const lasting = !!e.hit;
      const fade = Math.min(1, el / .15, e.life / (lasting ? .5 : .35));
      const rgb = (e.n ?? 0) ? SICK_RGB : LEAF_RGB;
      const beat = lasting ? .75 + .25 * Math.sin(el * 6) : 1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * .3 * beat;
      glow(ctx, e.x, e.y - h * .5, h * .55, rgb);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(1, .18);
      ctx.globalAlpha = fade * .35;
      glow(ctx, 0, 0, h * .5, rgb);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0, n = count(lasting ? 9 : 7, liteFx); i < n; i++) {
        const k = cycle(el, lasting ? .7 : 1.1, i, 31);
        const side = (hash(i, 32) - .5) * 2;
        const x = e.x + side * 40 + Math.sin(el * 2.6 + i * 1.7) * 8;
        const y = e.y - 10 - k * h * .95;
        ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .9;
        ctx.fillStyle = LEAVES[i % LEAVES.length];
        leaf(ctx, x, y, 8 + hash(i, 33) * 5, el * 2 + i);
      }
      break;
    }
    case 'ryo-sick': {
      // The meal that was one too many: a swirl of sickly bubbles over her head.
      for (let i = 0, n = count(6, liteFx); i < n; i++) {
        const a = el * 4 + i * TAU / 6;
        const r = 14 + t * 10;
        ctx.globalAlpha = life * .8;
        ctx.strokeStyle = `rgb(${SICK_RGB})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * r * 1.4, e.y + Math.sin(a) * r * .5 - t * 10, 3 + (i % 3), 0, TAU); ctx.stroke();
      }
      break;
    }
    case 'ryo-ask': {
      // The palm out while the money comes: a soft gold warmth in her hand and a glint now and then.
      const fade = Math.min(1, el / .1, e.life / .12);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * .35;
      glow(ctx, e.x, e.y, 26, GOLD_RGB);
      ctx.globalCompositeOperation = 'source-over';
      const k = cycle(el, 2.2, 0, 51);
      ctx.globalAlpha = fade * Math.sin(k * Math.PI);
      ctx.fillStyle = '#fff6d0';
      sparkle(ctx, e.x + (hash(Math.floor(el * 2.2), 52) - .5) * 20, e.y - 8, 7);
      break;
    }
    case 'ryo-coins':
    case 'ryo-repay': {
      // Coins hop from one to the other: borrowed (lender → her hand) or collected (her → the lender).
      const n = clamp(e.n ?? 5, 1, liteFx ? 4 : 8);
      coinArc(ctx, e.x, e.y, e.tx ?? 0, e.ty ?? 0, t, n, e.type === 'ryo-coins' ? 61 : 63);
      landing(ctx, e.x + (e.tx ?? 0), e.y + (e.ty ?? 0), t);
      break;
    }
    case 'ryo-iou-stick': {
      // The slip slapped onto the lender: it drops in with a little bounce and a puff of gold.
      const u = ease(clamp(el / .22, 0, 1));
      ctx.globalAlpha = 1 - clamp((el - .3) / .2, 0, 1);
      slip(ctx, e.x, e.y - 24 * (1 - u), 16 * (1.3 - u * .3), (1 - u) * .5);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - t) * .4;
      glow(ctx, e.x, e.y, 18 + t * 20, GOLD_RGB);
      break;
    }
    case 'ryo-default': {
      // Nobody came for it: the slip tears in two and the halves flutter off, a few gold flecks.
      const u = ease(t);
      for (let j = 0; j < 2; j++) {
        const s = j ? 1 : -1;
        ctx.globalAlpha = life;
        ctx.save();
        ctx.beginPath();
        ctx.rect(s > 0 ? e.x + s * u * 18 : e.x - 40 + s * u * 18, e.y - 30 + u * 30, 40, 60);
        ctx.clip();
        slip(ctx, e.x + s * u * 18, e.y + u * 30, 16, s * u * .9);
        ctx.restore();
      }
      ctx.fillStyle = '#ffe08a';
      burst(el, 71, { n: count(6, liteFx), speed: [40, 110], life: .6, gravity: 140 }, (x, y, k) => {
        ctx.globalAlpha = (1 - k) * .9;
        sparkle(ctx, x, y, 4 * (1 - k * .5));
      }, e.x, e.y);
      break;
    }
    case 'ryo-pocket': {
      // ...and she pockets it: one gold glint shrinking into her.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = life * .5;
      glow(ctx, e.x, e.y, 24 * life + 4, GOLD_RGB);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = life;
      ctx.fillStyle = '#fff6d0';
      sparkle(ctx, e.x, e.y, 10 * life);
      break;
    }
    case 'ryo-empty': {
      // Their pockets are empty too: a grey puff and one little moth fluttering out.
      ctx.globalAlpha = life * .4;
      ctx.fillStyle = '#c8c8d0';
      dot(ctx, e.x, e.y, 8 + t * 18);
      const mx = e.x + dir * t * 40 + Math.sin(el * 14) * 4;
      const my = e.y - t * 46;
      const flap = Math.abs(Math.sin(el * 22));
      ctx.globalAlpha = life;
      ctx.fillStyle = '#b9b4c4';
      ctx.beginPath(); ctx.ellipse(mx - 4, my, 5, 3.5 * flap + .6, -.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(mx + 4, my, 5, 3.5 * flap + .6, .4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8f8a9c';
      dot(ctx, mx, my, 1.6);
      break;
    }
    case 'ryo-bocchi': {
      // 彩蛋: 一里 lent her money again. She shivers: pink tremble lines either side and one sweat drop.
      const h = e.radius ?? 181;
      ctx.strokeStyle = '#F5A9C0';
      ctx.lineCap = 'round';
      ctx.lineWidth = 2.4;
      for (let s = -1; s <= 1; s += 2) {
        for (let i = 0; i < 3; i++) {
          const jit = Math.sin(el * 60 + i * 2) * 2;
          const x = e.x + s * (h * .2 + i * 6) + jit;
          ctx.globalAlpha = life * (.85 - i * .2);
          ctx.beginPath(); ctx.moveTo(x, e.y - 14 + i * 4); ctx.lineTo(x + s * 4, e.y + 2 + i * 4); ctx.stroke();
        }
      }
      const y = e.y - h * .2 + Math.min(el, .4) * 24;
      ctx.globalAlpha = Math.min(1, e.life / .15);
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath();
      ctx.moveTo(e.x + 18, y - 9);
      ctx.quadraticCurveTo(e.x + 24, y + 1, e.x + 18, y + 6);
      ctx.quadraticCurveTo(e.x + 12, y + 1, e.x + 18, y - 9);
      ctx.fill();
      break;
    }
    case 'ryo-nijika': {
      // 彩蛋: 虹夏 collecting — a red anger mark pops over her head.
      const pop = 1 + Math.max(0, .35 - el) * 1.6;
      ctx.globalAlpha = Math.min(1, e.life / .15);
      ctx.strokeStyle = '#e24a3b';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      const s = 7 * pop;
      for (let q = 0; q < 4; q++) {
        const a = q * Math.PI / 2 + Math.PI / 4;
        const cx = e.x + 14 + Math.cos(a) * s, cy = e.y + Math.sin(a) * s;
        ctx.beginPath();
        ctx.arc(cx, cy, s * .7, a + Math.PI * .75, a + Math.PI * 1.25);
        ctx.stroke();
      }
      break;
    }
    case 'ryo-aloof': {
      // Arms folded, aloof: a cool blue haze behind her and a few slow pale motes drifting down.
      const h = e.radius ?? 181;
      const fade = Math.min(1, el / .12, e.life / .1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * .28;
      glow(ctx, e.x, e.y - h * .55, h * .55, BLUE_RGB);
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0, n = count(6, liteFx); i < n; i++) {
        const k = cycle(el, .9, i, 81);
        ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .8;
        ctx.fillStyle = `rgb(${PALE_RGB})`;
        dot(ctx, e.x + (hash(i, 82) - .5) * h * .55, e.y - h * (1 - k * .8), 1.6 + hash(i, 83));
      }
      break;
    }
    case 'ryo-blush': {
      // Called a weirdo, and she is pleased: blush on the cheek, a burst of pink sparkles, a soft pink flash.
      const h = e.radius ?? 181;
      const fx = e.x + dir * h * .05, fy = e.y - h * .86;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.max(0, 1 - el / .3) * .6;
      glow(ctx, fx, fy, 50 + el * 80, PINK_RGB);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(1, el / .08, e.life / .2) * .75;
      ctx.fillStyle = '#ff8fab';
      ctx.beginPath(); ctx.ellipse(fx + dir * 6, fy + 6, 6, 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      burst(el, 91, { n: count(9, liteFx), speed: [90, 190], life: .55, drag: .04 }, (x, y, k, i) => {
        ctx.globalAlpha = (1 - k);
        ctx.fillStyle = i % 3 ? '#ffffff' : '#ffc2d4';
        sparkle(ctx, x, y, 7 * (1 - k * .5));
      }, fx, fy);
      break;
    }
    case 'ryo-chop': {
      // The chop: one sharp blue arc and a pale edge.
      const u = ease(clamp(el / .16, 0, 1));
      const c = dir > 0 ? 0 : Math.PI;
      ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = life * (pass ? .95 : .3);
        ctx.strokeStyle = pass ? '#dfe8ff' : `rgb(${BLUE_RGB})`;
        ctx.lineWidth = pass ? 4 : 14;
        ctx.beginPath();
        ctx.arc(e.x - dir * 30, e.y, 56, c - 1.1, c - 1.1 + 2.2 * u);
        ctx.stroke();
      }
      if (e.hit && el < .2) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - el / .2) * .7;
        glow(ctx, e.x + dir * 20, e.y, 40, PALE_RGB);
      }
      break;
    }
    case 'ryo-pleased': {
      // The good mood after: two small pink glints orbiting her shoulders, a touch faster.
      const h = e.radius ?? 181;
      const fade = Math.min(1, el / .15, e.life / .3);
      for (let i = 0; i < 2; i++) {
        const a = el * 4.2 + i * Math.PI;
        ctx.globalAlpha = fade * (.6 + .4 * Math.sin(a));
        ctx.fillStyle = i ? '#ffc2d4' : '#ffffff';
        sparkle(ctx, e.x + Math.cos(a) * 30, e.y - h * .62 + Math.sin(a) * 8, 5);
      }
      break;
    }
    case 'ryo-sub': {
      // The low end takes the room: the stage dims to indigo behind the bodies, the floor glows blue and shivers on
      // every wave; the drop flares it.
      const fade = Math.min(1, el / .3, e.life / .3);
      const S = RYO_BROKE;
      let pulse = 0;
      for (const w of S.waves) if (el >= w) pulse = Math.max(pulse, 1 - (el - w) / .35);
      const drop = el >= S.finale ? Math.max(0, 1 - (el - S.finale) / .7) : 0;
      ctx.globalAlpha = fade * .66;
      ctx.fillStyle = 'rgb(12,14,34)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.translate(e.x, FLOOR);
      ctx.scale(1, .16);
      ctx.globalAlpha = fade * (.35 + pulse * .25 + drop * .4);
      glow(ctx, 0, 0, 380 + drop * 160, BLUE_RGB);
      ctx.globalAlpha = fade * (.2 + drop * .3);
      glow(ctx, 0, 0, 180, PALE_RGB);
      ctx.restore();
      // Three thin floor lines that quiver with the bass.
      ctx.strokeStyle = `rgb(${PALE_RGB})`;
      ctx.lineWidth = 1.4;
      for (let i = 0, n = liteFx ? 1 : 3; i < n; i++) {
        const y = FLOOR + 6 + i * 9;
        const amp = (2 + pulse * 5 + drop * 8) * (1 - i * .25);
        ctx.globalAlpha = fade * (.22 - i * .05);
        ctx.beginPath();
        for (let x = 0; x <= W + 40; x += 40) {
          const yy = y + Math.sin(x * .03 + el * 18 + i) * amp;
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      break;
    }
    case 'ryo-spend': {
      // Every coin she has goes up: a fountain of gold from her, the coins turning, then thinning into blue light.
      const h = e.radius ?? 181;
      const n = clamp(e.n ?? 10, 6, liteFx ? 10 : 20);
      const spec = { n, speed: [260, 520] as [number, number], life: 1.05, angle: -Math.PI / 2 + dir * .25, spread: 1.6, gravity: 760, drag: .5 };
      // Coins first, then their blue afterglow in one additive pass (no blend-mode switch per coin).
      burst(el, 101, spec, (x, y, k, i) => {
        const blue = clamp((k - .55) / .45, 0, 1);
        if (blue >= 1) return;
        ctx.globalAlpha = 1 - blue;
        coin(ctx, x, y, 6 + hash(i, 102) * 2, el * 12 + i);
      }, e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      if (el > spec.life * .6 * .55) burst(el, 101, spec, (x, y, k) => {
        const blue = clamp((k - .55) / .45, 0, 1);
        if (blue <= 0) return;
        ctx.globalAlpha = Math.sin(blue * Math.PI) * .6;
        glow(ctx, x, y, 14, PALE_RGB);
      }, e.x, e.y);
      ctx.globalAlpha = Math.max(0, 1 - el / .3) * .5;
      glow(ctx, e.x, e.y - h * .1, 60, GOLD_RGB);
      break;
    }
    case 'ryo-wave': {
      // One low wave: a wide, flat swell hugging the floor, rolling out to the reach; a pale crest on top.
      const R = e.radius ?? 360;
      const u = clamp(el / .55, 0, 1);
      const d = 20 + (R - 20) * ease(u);
      const fade = 1 - u;
      const cx = e.x + dir * d;
      const hgt = 34 + 10 * ((e.n ?? 0) % 2);
      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.translate(cx, e.y);
      ctx.scale(1, .3);
      ctx.globalAlpha = fade * .55;
      glow(ctx, 0, 0, 90, BLUE_RGB);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = fade * (pass ? .9 : .3);
        ctx.strokeStyle = pass ? `rgb(${PALE_RGB})` : `rgb(${BLUE_RGB})`;
        ctx.lineWidth = pass ? 3 : 12;
        ctx.beginPath();
        // A bump on the floor: rises behind the front, crests, falls in front.
        for (let k = 0; k <= 12; k++) {
          const s = k / 12;
          const x = cx - dir * (70 - s * 90);
          const y = e.y - Math.sin(s * Math.PI) ** 1.5 * hgt * (1 - u * .4);
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Dust kicked by the swell.
      ctx.fillStyle = `rgb(${PALE_RGB})`;
      for (let i = 0, n = count(4, liteFx); i < n; i++) {
        ctx.globalAlpha = fade * .6;
        dot(ctx, cx + dir * (10 + hash(i, 111) * 20), e.y - 4 - hash(i, 112) * 14 * u, 1.8);
      }
      break;
    }
    case 'ryo-drop': {
      // The drop: the floor heaves — three wide flat rings race out along it, a column of low blue light rises.
      const R = e.radius ?? 420;
      ctx.globalCompositeOperation = 'lighter';
      for (let j = 0; j < 3; j++) {
        const u = clamp((el - j * .08) / .6, 0, 1);
        if (u <= 0 || u >= 1) continue;
        ctx.save();
        ctx.translate(e.x + dir * R * .35 * u, e.y);
        ctx.scale(1, .14);
        ctx.globalAlpha = (1 - u) * (.8 - j * .2);
        ctx.strokeStyle = j ? `rgb(${BLUE_RGB})` : `rgb(${PALE_RGB})`;
        ctx.lineWidth = (10 - j * 3) / .14 * .3;
        ctx.beginPath(); ctx.arc(0, 0, 30 + R * .6 * ease(u), 0, TAU); ctx.stroke();
        ctx.restore();
      }
      const col = Math.max(0, 1 - el / .5);
      ctx.globalAlpha = col * .5;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(.45, 1.4);
      glow(ctx, 0, -60, 120, DEEP_RGB);
      glow(ctx, 0, -40, 70, BLUE_RGB);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#c9d6ff';
      burst(el, 121, { n: count(12, liteFx), speed: [160, 420], life: .6, angle: -Math.PI / 2, spread: 2.6, gravity: 600 }, (x, y, k) => {
        ctx.globalAlpha = (1 - k) * .85;
        dot(ctx, x, y, 2.4 * (1 - k * .5));
      }, e.x + dir * 30, e.y - 4);
      break;
    }
    case 'ryo-leaf': {
      // Broke: one leaf drifts down out of nowhere and settles on her head.
      const u = clamp(el / .7, 0, 1);
      const fall = ease(u);
      const rock = Math.sin(el * 7) * (1 - fall) * 14;
      ctx.globalAlpha = Math.min(1, e.life / .2);
      ctx.fillStyle = '#7cc46a';
      leaf(ctx, e.x + rock + dir * 6, e.y - 70 * (1 - fall) - 6, 14, .4 + rock * .04);
      ctx.fillStyle = '#4f9a45';
      ctx.fillRect(e.x + rock + dir * 6 - .6, e.y - 70 * (1 - fall) - 12, 1.2, 6);
      break;
    }
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  return true;
}
