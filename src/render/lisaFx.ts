import type { Effect, Projectile } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, clamp } from '../game/constants.ts';
import { TAU, burst, dot, glow, hash, sparkle, streak } from './fxParticles.ts';

/* 今井莉莎 — 辣妹的星星、银灰色的猫、一根暖橙色的线、心形曲奇和芥末的绿. Three registers:
   - her red (#DD2200) and a warm gold for the gal side: little five-point stars, the hair flick, the wink;
   - the silver cat (友希那的颜色: silver-grey fur, gold eyes) and its white claw marks and grey fur tufts;
   - the cookie: biscuit brown with a red jam heart, then wasabi green — the face, the steam, the ring — and
     the tears, pale blue, straight out sideways.
   Everything is a few flat shapes that read from across the screen; the cat is cat.png when it has loaded
   (shapes until then). The busiest moment, the mustard going off, is about 30 particles. */

const RED = '#DD2200';
const GOLD = '#ffd56a';
const HAIR = '#9a5a36';
const SILVER = '#c9c6d6';
const SILVER_DARK = '#8d89a0';
const CAT_EYE = '#f2c64a';
const BISCUIT = '#e2a868';
const BISCUIT_DARK = '#a8693a';
const JAM = '#d8233a';
const WASABI_RGB = '143,209,79';
const TEAR = '#bfe6ff';
const THREAD_RGB = '255,179,107';
const CAT_SRC = '/sprites/lisa/cat.png';
const BAND = [GOLD, '#ff8c5a', RED] as const;

let lite = false;
const n = (full: number) => (lite ? Math.ceil(full / 2) : full);
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0): void {
  if (!(r > 0)) return;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  if (!(s > 0)) return;
  ctx.beginPath();
  ctx.moveTo(x, y + s * .9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * .1, x - s * .6, y - s * 1.2, x, y - s * .35);
  ctx.bezierCurveTo(x + s * .6, y - s * 1.2, x + s * 1.4, y - s * .1, x, y + s * .9);
  ctx.fill();
}

/** The cat in shapes, facing right, feet on y = 0, about 64 px long: for the moment cat.png is still loading. */
function catShapes(ctx: CanvasRenderingContext2D, run: number): void {
  const leg = Math.sin(run * TAU) * 6;
  ctx.fillStyle = SILVER_DARK;
  ctx.beginPath(); ctx.ellipse(-12 + leg, -6, 4, 7, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(14 - leg, -6, 4, 7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = SILVER;
  ctx.beginPath(); ctx.ellipse(0, -18, 24, 11, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(24, -26, 11, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(17, -33); ctx.lineTo(19, -46); ctx.lineTo(26, -36); ctx.fill();
  ctx.beginPath(); ctx.moveTo(27, -35); ctx.lineTo(33, -46); ctx.lineTo(34, -32); ctx.fill();
  ctx.strokeStyle = SILVER;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-22, -22); ctx.quadraticCurveTo(-36, -30 - leg, -34, -44); ctx.stroke();
  ctx.fillStyle = CAT_EYE;
  dot(ctx, 28, -28, 2.6);
}
/** One cat at (x, y) = its feet, `s` scale (1 is 64 px long), facing dir, tilted rot. */
function cat(ctx: CanvasRenderingContext2D, images: ImageCache | undefined, x: number, y: number, s: number, dir: number, rot: number, run: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot * dir);
  ctx.scale(dir * s, s);
  const im = image(images, CAT_SRC);
  if (im) ctx.drawImage(im, -40, -72, 80, 80);
  else catShapes(ctx, run);
  ctx.restore();
}
/** The heart-shaped cookie: biscuit, a darker rim, a jam heart. */
function cookie(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = BISCUIT_DARK;
  heart(ctx, 0, 0, s * 1.12);
  ctx.fillStyle = BISCUIT;
  heart(ctx, 0, -s * .04, s);
  ctx.fillStyle = JAM;
  heart(ctx, 0, -s * .02, s * .42);
  ctx.fillStyle = 'rgba(255,240,220,.7)';
  dot(ctx, -s * .5, -s * .4, s * .1);
  ctx.restore();
}
/** A pale green puff. */
function steam(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
  ctx.globalAlpha = a;
  glow(ctx, x, y, r, WASABI_RGB);
  ctx.globalAlpha = a * .7;
  glow(ctx, x, y, r * .55, '226,255,200');
}

/** A wasabi tube, nozzle down at (x, y), `sq` 0..1 squeezed flat. No label text: green body, white band, white cap. */
function tube(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, sq: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s * (1 + sq * .25), s * (1 - sq * .35));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-6, -10, 12, 12);
  ctx.fillStyle = '#5daa2e';
  ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(12, -10); ctx.lineTo(16, -58); ctx.lineTo(-16, -58); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8fd14f';
  ctx.fillRect(-9, -52, 5, 38);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-14, -40, 28, 9);
  ctx.fillStyle = '#d6d6d6';
  ctx.fillRect(-17, -62, 34, 5);
  ctx.restore();
}

export function drawLisaShot(ctx: CanvasRenderingContext2D, p: Projectile, liteFx: boolean, images?: ImageCache): boolean {
  if (p.fx !== 'lisa-cat' && p.fx !== 'lisa-cookie') return false;
  lite = liteFx;
  ctx.save();
  if (p.fx === 'lisa-cat') {
    const dir = Math.sign(p.vx) || 1;
    // A low run: a little bob on every stride, dust off the back paws.
    const run = p.age * 4.5;
    cat(ctx, images, p.x, FLOOR - Math.abs(Math.sin(run * Math.PI)) * 5, 1, dir, 0, run);
    ctx.globalAlpha = .35;
    glow(ctx, p.x - dir * 30, FLOOR - 4, 12 + (run % 1) * 6, '214,206,226');
  } else {
    cookie(ctx, p.x, p.y, 13, p.age * 9);
    // A short crumb trail.
    ctx.fillStyle = BISCUIT;
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = .5 - i * .12;
      dot(ctx, p.x - p.vx * .02 * i, p.y - p.vy * .02 * i, 3 - i * .6);
    }
  }
  ctx.restore();
  return true;
}

export function drawLisaFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('lisa-')) return false;
  lite = liteFx;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  const r = e.radius ?? 30;
  ctx.save();
  switch (e.type) {
    case 'lisa-star': {
      // 元气辣妹☆: a little star dropped behind her, turning, shrinking, drifting up.
      // Two flat fills, no glow: a dash drops a dozen of these at once, and a composite switch each adds up.
      const x = e.x - dir * t * 18, y = e.y - t * 16, rr = 8 * (1 - t * .6);
      ctx.globalAlpha = (1 - t) * .95;
      ctx.fillStyle = (e.n ?? 0) % 3 === 1 ? '#ffffff' : GOLD;
      star(ctx, x, y, rr, t * 3 * dir);
      ctx.fillStyle = '#fffbe8';
      star(ctx, x, y, rr * .4, t * 3 * dir);
      break;
    }
    case 'lisa-flick-hair': {
      // The hit: the half-up ponytail whips across in two warm brown arcs with a red edge, a white impact pop,
      // and a ring of stars thrown off it.
      const k = ease(el / .12);
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = (1 - t) * (i === 2 ? .8 : .65);
        ctx.strokeStyle = i === 2 ? RED : HAIR;
        ctx.lineWidth = i === 2 ? 3 : 9 - i * 3;
        ctx.beginPath();
        ctx.arc(e.x - dir * 34, e.y + 10 + i * 9, 52 + i * 9, dir > 0 ? -1.3 : Math.PI + 1.3 - 2.1 * k, dir > 0 ? -1.3 + 2.1 * k : Math.PI + 1.3, false);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - t) * .8;
      glow(ctx, e.x + dir * 14, e.y + 6, 26 + t * 30, '255,226,170');
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = (1 - t) * .9;
      ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath(); ctx.arc(e.x + dir * 14, e.y + 6, 10 + ease(t) * 40, 0, TAU); ctx.stroke();
      burst(el, 113, { n: n(8), speed: [140, 300], life: .42, drag: .25 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? GOLD : '#ff8a5c';
        star(ctx, x, y, 7 * (1 - q * .5), q * 5 + i);
      }, e.x + dir * 14, e.y + 6);
      break;
    }
    case 'lisa-gal-ribbon': {
      // The slide: a ribbon in her colours from where she set off to where she is, thin at the start and thick
      // at her, with a few white speed lines over it. It fades once she has stopped.
      const tx = e.tx ?? 0;
      if (Math.abs(tx) < 4) break;
      const a = Math.min(1, e.life / .35);
      const x0 = e.x, x1 = e.x + tx, y = e.y - 96;
      // Three flat bands instead of a gradient (a gradient object is allocated every frame): pale gold at the
      // start, orange, her red at her end — each band a slice of the same tapered shape.
      const span = x1 - x0;
      for (let i = 0; i < 3; i++) {
        const u0 = i / 3, u1 = (i + 1) / 3;
        const w0 = 26 * u0 ** .7, w1 = 26 * u1 ** .7;
        ctx.globalAlpha = a * (.18 + i * .28);
        ctx.fillStyle = BAND[i];
        ctx.beginPath();
        ctx.moveTo(x0 + span * u0, y - w0);
        ctx.lineTo(x0 + span * u1, y - w1);
        ctx.lineTo(x0 + span * u1, y + w1);
        ctx.lineTo(x0 + span * u0, y + w0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const k = (el * 3 + hash(i, 5)) % 1;
        const yy = y - 60 + i * 38 + (hash(i, 6) - .5) * 14;
        const len = 40 + hash(i, 7) * 60;
        const xs = x1 - Math.sign(tx) * (20 + k * Math.abs(tx) * .8);
        ctx.globalAlpha = a * (1 - k) * .7;
        streak(ctx, xs, yy, xs - Math.sign(tx) * len, yy, 2);
      }
      break;
    }
    case 'lisa-skid': {
      // She brakes: two short skid marks and dust thrown up ahead of her feet.
      ctx.globalAlpha = (1 - t) * .6;
      ctx.strokeStyle = '#7a5a3e';
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) streak(ctx, e.x - dir * (10 + i * 12), FLOOR - 1 - i * 3, e.x - dir * (70 + i * 20), FLOOR - 1 - i * 3, 2.5);
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = (1 - t) * .5;
        glow(ctx, e.x + dir * (6 + i * 10) + dir * t * 26, FLOOR - 10 - t * (14 + i * 6), 12 + t * 18 + i * 3, '233,220,203');
      }
      break;
    }
    case 'lisa-gal-stop': {
      // The V sign: a big four-point glint by her face, a small heart, stars spilling round it.
      const k = Math.sin(clamp(el / .6, 0, 1) * Math.PI);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k;
      glow(ctx, e.x, e.y, 26, '255,213,106');
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x, e.y, 18 * k);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ff6f8f';
      ctx.globalAlpha = k;
      heart(ctx, e.x + dir * 22, e.y - 18 - el * 20, 6);
      burst(el, 127, { n: n(6), speed: [70, 160], life: .55, drag: .3, angle: -Math.PI / 2, spread: 3 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i % 2 ? '#ffffff' : GOLD;
        star(ctx, x, y, 6 * (1 - q * .4), q * 4);
      }, e.x, e.y);
      break;
    }
    case 'lisa-wink': {
      // 不用说我也懂: a star glints in her eye.
      const k = Math.sin(clamp(el / .5, 0, 1) * Math.PI);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k;
      glow(ctx, e.x, e.y, 16, '255,213,106');
      ctx.fillStyle = GOLD;
      sparkle(ctx, e.x, e.y, 9 * k);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffffff';
      star(ctx, e.x + dir * 16, e.y - 14 - el * 12, 5 * k, el * 3);
      break;
    }
    case 'lisa-thread': {
      // The thin warm thread from her to whoever she is reading, breathing like a heartbeat; it only pulls
      // taut when the read is sprung (lisa-snap). Fades in, and out over its last moment.
      const tx = e.tx ?? 0, ty = e.ty ?? 0;
      if (!tx && !ty) break;
      const beat = .55 + .45 * Math.max(0, Math.sin(el * 7.5)) ** 4;
      const a = Math.min(1, el / .25) * Math.min(1, e.life / .15);
      const x1 = e.x + tx, y1 = e.y + ty;
      // A soft sag, so it reads as thread and not a laser.
      const mx = (e.x + x1) / 2, my = (e.y + y1) / 2 + Math.min(40, Math.hypot(tx, ty) * .08);
      ctx.lineCap = 'round';
      ctx.globalAlpha = a * .22 * beat;
      ctx.strokeStyle = `rgb(${THREAD_RGB})`;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
      ctx.globalAlpha = a * .85 * beat;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
      ctx.fillStyle = `rgb(${THREAD_RGB})`;
      dot(ctx, e.x, e.y, 2.5);
      dot(ctx, x1, y1, 2.5 * beat);
      break;
    }
    case 'lisa-snap': {
      // The read sprung: the thread pulls straight and bright for a moment, from where she was to where she is.
      const x1 = e.x + (e.tx ?? 0), y1 = e.y + (e.ty ?? 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.globalAlpha = (1 - t) * .9;
      ctx.strokeStyle = '#ffe2bf';
      streak(ctx, e.x, e.y, x1, y1, 3 * (1 - t) + 1);
      ctx.globalAlpha = (1 - t) * .4;
      ctx.strokeStyle = `rgb(${THREAD_RGB})`;
      streak(ctx, e.x, e.y, x1, y1, 10 * (1 - t));
      break;
    }
    case 'lisa-flick': {
      // The forehead flick: a little ring, a pop of stars, three short "boing" lines.
      ctx.globalAlpha = (1 - t) * .9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath(); ctx.arc(e.x, e.y, 6 + ease(t) * 26, 0, TAU); ctx.stroke();
      ctx.lineCap = 'round';
      ctx.strokeStyle = GOLD;
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * .7 - dir * .4;
        const r0 = 14 + t * 18;
        streak(ctx, e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0, e.x + Math.cos(a) * (r0 + 9), e.y + Math.sin(a) * (r0 + 9), 2.5);
      }
      burst(el, 71, { n: n(6), speed: [80, 170], life: .5, gravity: 260, drag: .3, angle: -Math.PI / 2, spread: 2.4 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i % 2 ? '#ffffff' : GOLD;
        star(ctx, x, y, 5 * (1 - q * .5), q * 4);
      }, e.x, e.y);
      break;
    }
    case 'lisa-cling': {
      // 银猫扑脸: the cat across the top of the head, holding on, wriggling; it jumps up onto them first.
      const land = ease(el / .14);
      const wob = Math.sin(el * 26) * .12;
      const a = Math.min(1, e.life / .08);
      ctx.globalAlpha = a;
      cat(ctx, images, e.x - dir * 4, e.y + 14 - (1 - land) * 30, .85, -dir, wob, el * 3);
      break;
    }
    case 'lisa-scratch': {
      // One scratch: three white claw lines across the face, a couple of grey tufts.
      const k = ease(el / .08);
      const tilt = ((e.n ?? 0) % 2 ? 1 : -1) * .5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = (1 - t) * .95;
      for (let i = 0; i < 3; i++) {
        const ox = (i - 1) * 9;
        const x0 = e.x + ox - 14 * Math.cos(tilt), y0 = e.y - 14 * Math.sin(tilt) - 12;
        streak(ctx, x0, y0, x0 + (28 * Math.cos(tilt)) * k, y0 + (28 * Math.sin(tilt) + 20) * k, 2.4 - i * .3);
      }
      burst(el, 83 + (e.n ?? 0), { n: n(4), speed: [40, 110], life: .3, gravity: 120 }, (x, y, q, i) => {
        ctx.globalAlpha = (1 - q) * .8;
        ctx.fillStyle = i % 2 ? SILVER : '#ece9f4';
        dot(ctx, x, y, 3 * (1 - q * .5));
      }, e.x, e.y);
      break;
    }
    case 'lisa-cat-home': {
      // Back to her: the cat hops down and runs along the floor to her feet, and is gone at the end.
      const k = clamp(el / e.max, 0, 1);
      const x = e.x + (e.tx ?? 0) * k;
      const drop = e.ty ?? 0;
      const y = e.y + drop * Math.min(1, k * 2.4) - Math.abs(Math.sin(k * Math.PI * 3)) * 14;
      ctx.globalAlpha = Math.min(1, e.life / .12);
      cat(ctx, images, x, Math.min(FLOOR, y), .9, (e.tx ?? 0) >= 0 ? 1 : -1, 0, el * 4.5);
      break;
    }
    case 'lisa-yum': {
      // It is good: three small pink hearts float up.
      for (let i = 0; i < 3; i++) {
        const k = clamp((el - i * .12) / .7, 0, 1);
        if (k <= 0) continue;
        ctx.globalAlpha = Math.sin(k * Math.PI) * .95;
        ctx.fillStyle = i === 1 ? '#ffffff' : '#ff8fb1';
        heart(ctx, e.x + (i - 1) * 18 + Math.sin(el * 6 + i) * 3, e.y - 10 - k * 34, 7);
      }
      break;
    }
    case 'lisa-fuse': {
      // The mustard on its way. First she chews (crumbs off the mouth, hearts are lisa-yum); the green climbs the
      // face from the chin up; a cold sweat drop; then the reveal — a wasabi tube drops in over their head and is
      // squeezed, a green blob falling — and a tremble just before it goes off.
      const k = clamp(el / e.max, 0, 1);
      const shake = k > .78 ? Math.sin(el * 70) * 2.4 * (k - .78) * 4.5 : 0;
      const h = r * .17;
      if (el < .5) {
        ctx.fillStyle = BISCUIT;
        for (let i = 0; i < 3; i++) {
          const q = (el * 3 + i / 3) % 1;
          ctx.globalAlpha = 1 - q;
          dot(ctx, e.x + (i - 1) * 7 + Math.sin(i * 3) * 3, e.y + 10 + q * 22, 2.4);
        }
      }
      ctx.globalAlpha = .18 + .5 * k;
      glow(ctx, e.x + shake, e.y + h * .6 - h * k, h * (.9 + .7 * k), WASABI_RGB);
      if (k > .3) {
        const d = (k - .3) / .7;
        ctx.globalAlpha = .9;
        ctx.fillStyle = TEAR;
        dot(ctx, e.x + 14 + shake, e.y - 8 + d * 18, 2.8);
      }
      if (k > .5) {
        const drop = ease((k - .5) / .14);
        const sq = clamp((k - .8) / .12, 0, 1);
        ctx.globalAlpha = Math.min(1, (k - .5) / .06);
        tube(ctx, e.x + 4, e.y - 46 - (1 - drop) * 120, .9, sq, .15 * Math.sin(el * 5));
        if (sq > 0) {
          ctx.fillStyle = `rgb(${WASABI_RGB})`;
          ctx.globalAlpha = 1;
          const fall = ease(sq);
          ctx.beginPath(); ctx.ellipse(e.x + 4, e.y - 30 + fall * 22, 6 + sq * 3, 8, 0, 0, TAU); ctx.fill();
        }
      }
      break;
    }
    case 'lisa-blast': {
      // It goes off: a ring of green, two jets of steam out of the ears, two streams of tears straight out
      // sideways (友希那「潸然泪下」), and green crumbs.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - t) * .55;
      glow(ctx, e.x, e.y, 40 + ease(t) * 90, WASABI_RGB);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(${WASABI_RGB},1)`;
      ctx.globalAlpha = (1 - t) * .8;
      ctx.lineWidth = 6 * (1 - t) + 1;
      ctx.beginPath(); ctx.arc(e.x, e.y, 20 + ease(el / .35) * 110, 0, TAU); ctx.stroke();
      // Steam: puffs blown out of both ears.
      for (const side of [-1, 1]) {
        for (let i = 0, m = n(5); i < m; i++) {
          const k = clamp((el - i * .05) / .5, 0, 1);
          if (k <= 0 || k >= 1) continue;
          steam(ctx, e.x + side * (16 + k * 70 + i * 6), e.y - 6 - k * 30 - i * 4, 8 + k * 14, (1 - k) * .75);
        }
      }
      // Tears: two flat streams out to the sides, beading at the ends.
      const tl = Math.min(1, el / .18) * (1 - clamp((el - .55) / .35, 0, 1));
      ctx.globalAlpha = tl * .9;
      ctx.strokeStyle = TEAR;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        const x0 = e.x + side * 8, y0 = e.y + 2;
        const len = 30 + ease(el / .25) * 60;
        streak(ctx, x0, y0, x0 + side * len, y0 + 6, 5);
        ctx.fillStyle = TEAR;
        for (let i = 0; i < 3; i++) dot(ctx, x0 + side * (len + 6 + i * 9) , y0 + 6 + i * 3 + ((el * 60 + i) % 4), 3.2 - i * .6);
      }
      // 宽面条泪: two thick fountains of tears arcing out and down to the floor, splashing.
      const ft = Math.min(1, el / .25) * (1 - clamp((el - .6) / .3, 0, 1));
      if (ft > 0) {
        ctx.strokeStyle = TEAR;
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          const x0 = e.x + side * 10, y0 = e.y + 4;
          const reach = 90 + ease(el / .3) * 50;
          const fy = FLOOR - y0;
          ctx.globalAlpha = ft * .8;
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.quadraticCurveTo(x0 + side * reach * .8, y0 - 40, x0 + side * reach, y0 + Math.min(fy, 40 + el * 400));
          ctx.stroke();
          if (40 + el * 400 >= fy) {
            ctx.fillStyle = TEAR;
            for (let i = 0; i < 4; i++) {
              const q = (el * 4 + i / 4) % 1;
              ctx.globalAlpha = ft * (1 - q);
              dot(ctx, x0 + side * (reach + (i - 1.5) * 10 * q), FLOOR - 4 - Math.sin(q * Math.PI) * 18, 3);
            }
          }
        }
      }
      // A green breath forward out of the mouth.
      for (let i = 0, m = n(6); i < m; i++) {
        const k = clamp((el - i * .03) / .45, 0, 1);
        if (k <= 0 || k >= 1) continue;
        steam(ctx, e.x + dir * (14 + k * 110), e.y + 14 - k * 10 + (i % 2) * 6, 10 + k * 16, (1 - k) * .7);
      }
      // The empty tube spins off.
      if (el < .7) {
        ctx.globalAlpha = 1 - el / .7;
        tube(ctx, e.x - dir * (20 + el * 160), e.y - 60 - el * 120 + el * el * 400, .8, 1, el * 12 * -dir);
      }
      burst(el, 97, { n: n(10), speed: [120, 300], life: .6, gravity: 500, drag: .4 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i % 3 ? BISCUIT : `rgb(${WASABI_RGB})`;
        dot(ctx, x, y, 3.5 * (1 - q * .5));
      }, e.x, e.y);
      break;
    }
    case 'lisa-tea': {
      // A cup of herbal tea at her lips (row 2 of the L column): a white cup, a saucer, two wisps of steam.
      const a = Math.min(1, el / .12) * Math.min(1, e.life / .15);
      const x = e.x + dir * 22, y = e.y - 132;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#f4f1ea';
      ctx.beginPath(); ctx.ellipse(x, y + 12, 15, 4, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 10, y - 6); ctx.lineTo(x + 10, y - 6); ctx.lineTo(x + 7, y + 10); ctx.lineTo(x - 7, y + 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c9b46a';
      ctx.beginPath(); ctx.ellipse(x, y - 6, 10, 2.5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#f4f1ea';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x + dir * 12, y + 1, 4.5, -1.3, 1.3); ctx.stroke();
      for (let i = 0; i < 2; i++) {
        const k = (el * .9 + i * .5) % 1;
        ctx.globalAlpha = a * (1 - k) * .55;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 3 + i * 6, y - 10 - k * 22);
        ctx.quadraticCurveTo(x + 4 + i * 6 + Math.sin(el * 3 + i) * 4, y - 16 - k * 22, x - 1 + i * 6, y - 22 - k * 22);
        ctx.stroke();
      }
      break;
    }
    case 'lisa-crumb': {
      // Nobody ate it: crumbs on the floor and a little green puff.
      burst(el, 41, { n: n(9), speed: [60, 200], life: .5, gravity: 600, drag: .4, angle: -Math.PI / 2, spread: 2.6 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i % 3 ? BISCUIT : JAM;
        dot(ctx, x, Math.min(FLOOR, y), 3 * (1 - q * .4));
      }, e.x, FLOOR - 6);
      steam(ctx, e.x, FLOOR - 16 - t * 24, 14 + t * 18, (1 - t) * .55);
      break;
    }
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  return true;
}
