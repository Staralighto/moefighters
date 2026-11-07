import type { Effect } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import { H, W, clamp } from '../game/constants.ts';
import { BIKE_FOOT, BIKE_SEAT_X, BIKE_W, LOCK_CM, MASKING_CM } from './clips.ts';
import { TAU, burst, dot, glow, hash, sparkle, streak } from './fxParticles.ts';

/* MASKING（佐藤益木）— 凶脸、金发、红黑摩托、心里是可爱控. Two registers:
   - the bike and the road: red-black, a red tail light, beige dust, grey exhaust, a warm headlight;
   - the gold of her colour (#EEBB44): drum-head rings on the jabs, the crash on the floor, the falling-star
     kick and the starburst it ends in, and small gold hearts whenever the soft side shows.
   Every shape is one flat subject that reads from across the screen. The bike rides on her as an effect a
   move refreshes every tick (combat.ts keepBike), so it is drawn from `n` (the pose) and `dir` only. */

/** Painted under every body: the bike, LOCK on the back seat, the road marks. */
export const MASKING_BACK: readonly string[] = ['masking-bike', 'masking-lock', 'masking-wreck', 'masking-skid', 'masking-dust', 'masking-tail', 'masking-crash'];
/** Screen space, behind every body: the house lights going down for the super. */
export const MASKING_SCREEN_BACK: readonly string[] = ['masking-dim'];

// Both props are prepared with alpha before entering the image cache.
const BIKE_SRC = '/sprites/masking/bike.png';
const LOCK_SRC = '/sprites/masking/lock.png';
/** Where the seat and the two axles sit across bike.png (fractions of its width, facing right). */
const SEAT_U = 330 / 768;
const REAR_U = 172 / 768;
const FRONT_U = 604 / 768;
/** Axle height over the floor, as a fraction of the drawn width. */
const AXLE_V = 111 / 768;
/** Body height on stage (characters.ts view.height); LOCK is drawn to her real height next to it. */
const MASKING_H = 180;
const LOCK_H = MASKING_H * LOCK_CM / MASKING_CM;

/** 银河流星踢: the kicking toe on the dive cell (special L row 2), from her feet in world px (180 tall, lift 2),
 *  the line of the leg, and where the tail streams back to (up the dive). */
const KICK_TOE = { x: 80, y: -53 };
const KICK_ANG = .55;
const TAIL_ANG = -2.05;

/** The wreck's flying parts: both wheels (kind 0) and four red panels (kind 1), launch velocity in px/s
 *  (x is mirrored by facing), falling under DEBRIS_G and resting on the floor. */
const DEBRIS: readonly { vx: number; vy: number; kind: 0 | 1 }[] = [
  { vx: -260, vy: -520, kind: 0 }, { vx: 300, vy: -460, kind: 0 },
  { vx: -170, vy: -640, kind: 1 }, { vx: 120, vy: -700, kind: 1 }, { vx: 360, vy: -300, kind: 1 }, { vx: -380, vy: -260, kind: 1 },
];
const DEBRIS_G = 900;

const GOLD = '#EEBB44';
const PALE = '#ffd56a';
const RED = '#e0232f';
const INK = '#16131c';

let lite = false;
const n = (full: number) => (lite ? Math.ceil(full / 2) : full);
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

/** One colour in the shape of the art, baked once per colour. */
const washCache = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();
function washed(src: HTMLImageElement, color: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let per = washCache.get(src);
  if (!per) { per = new Map(); washCache.set(src, per); }
  const hit = per.get(color);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = src.naturalWidth;
  c.height = src.naturalHeight;
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  per.set(color, c);
  return c;
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  if (!(s > 0)) return;
  ctx.beginPath();
  ctx.moveTo(x, y + s * .9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * .1, x - s * .6, y - s * 1.2, x, y - s * .35);
  ctx.bezierCurveTo(x + s * .6, y - s * 1.2, x + s * 1.4, y - s * .1, x, y + s * .9);
  ctx.fill();
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

/** The bike as plain shapes, for the moment bike.png is still loading. Facing right, origin on the floor
 *  under the seat. */
function bikeShapes(ctx: CanvasRenderingContext2D, w: number): void {
  const rear = (REAR_U - SEAT_U) * w, front = (FRONT_U - SEAT_U) * w, ay = -AXLE_V * w, wr = AXLE_V * w;
  ctx.fillStyle = INK;
  for (const x of [rear, front]) { ctx.beginPath(); ctx.arc(x, ay, wr, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#8a8794';
  for (const x of [rear, front]) { ctx.beginPath(); ctx.arc(x, ay, wr * .45, 0, TAU); ctx.fill(); }
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(rear + wr * .4, ay - wr * .6); ctx.lineTo(-w * .02, -w * .27); ctx.lineTo(front - wr * .6, -w * .3);
  ctx.lineTo(front - wr * .2, ay - wr * .4); ctx.lineTo(rear + wr * 1.6, ay); ctx.closePath(); ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillRect(-w * .14, -w * .3, w * .2, w * .04);
}
/** bike.png (or the shapes) with the seat at the origin and the tyres on the floor; facing applied by the caller. */
function drawBike(ctx: CanvasRenderingContext2D, im: HTMLImageElement | undefined): void {
  if (im) {
    const h = BIKE_W * im.naturalHeight / im.naturalWidth;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(im, -SEAT_U * BIKE_W, -h * BIKE_FOOT, BIKE_W, h);
  } else {
    bikeShapes(ctx, BIKE_W);
  }
}
/** Two dark arcs turning on each wheel: the spin reads even on a still picture. */
function wheelSpin(ctx: CanvasRenderingContext2D, el: number, speed: number): void {
  const wr = AXLE_V * BIKE_W, ay = -wr;
  ctx.strokeStyle = 'rgba(240,236,228,.55)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const u of [REAR_U, FRONT_U]) {
    const x = (u - SEAT_U) * BIKE_W;
    for (let k = 0; k < 2; k++) {
      const a = el * speed + k * Math.PI;
      ctx.beginPath(); ctx.arc(x, ay, wr * .78, a, a + .9); ctx.stroke();
    }
  }
}

/** LOCK on the back seat: her own shape from lock.png (one square picture, any size, laid out like a 256
 *  cell: feet on the pegs near the bottom), washed in her green with the art faintly through, a white rim,
 *  sized to her real height next to MASKING. */
/** How much of LOCK's own art shows through her green: mostly her, a light tint, so she still reads as LOCK. */
const LOCK_SHOW = .8;
function drawLock(ctx: CanvasRenderingContext2D, im: HTMLImageElement | undefined, alpha: number, color: string): void {
  const h = LOCK_H;
  if (!im) {
    ctx.globalAlpha = alpha * .8;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, -h * .6, h * .1, h * .2, .2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -h * .86, h * .08, 0, TAU); ctx.fill();
    return;
  }
  const sil = washed(im, color);
  const rim = washed(im, '#ffffff');
  if (!sil || !rim) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const big = h * 1.07;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha * .22;
  ctx.drawImage(rim, -big / 2, -big + h * .03, big, big);
  ctx.restore();
  ctx.globalAlpha = alpha;
  ctx.drawImage(im, -h / 2, -h, h, h);
  ctx.globalAlpha = alpha * (1 - LOCK_SHOW);
  ctx.drawImage(sil, -h / 2, -h, h, h);
}

export function drawMaskingFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('masking-')) return false;
  lite = liteFx;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  const r = e.radius ?? 50;
  ctx.save();
  switch (e.type) {
    case 'masking-bike': {
      // 死亡银河号 under her. 0 riding: a little bob and the wheels spinning; 1 skidding: the back end
      // swung out round the front wheel; 2 revving on the spot: the front lifts and shivers.
      const pose = e.n ?? 0;
      // The move's own clock (masking.ts keepOn stamps it): the wheels turn with the move and hold in hitstop.
      const clock = e.age ?? el;
      ctx.translate(e.x + dir * BIKE_SEAT_X, e.y);
      ctx.scale(dir, 1);
      if (pose === 0) ctx.translate(0, Math.sin(clock * 38) * 1.2);
      if (pose === 1) {
        const fx = (FRONT_U - SEAT_U) * BIKE_W;
        ctx.translate(fx, 0); ctx.rotate(-.1); ctx.translate(-fx, 0);
      }
      if (pose === 2) {
        const rx = (REAR_U - SEAT_U) * BIKE_W;
        ctx.translate(rx, 0); ctx.rotate(-.05 + Math.sin(clock * 60) * .012); ctx.translate(-rx, 0);
      }
      drawBike(ctx, image(images, BIKE_SRC));
      if (pose !== 2) wheelSpin(ctx, clock, 30);
      break;
    }
    case 'masking-lock': {
      // LOCK holds on behind her on the seat (B 站「护六」; 第三季第 10、11 话两人一辆车).
      ctx.translate(e.x - dir * 34, e.y - 4);
      ctx.scale(dir, 1);
      drawLock(ctx, image(images, LOCK_SRC), .92, e.color);
      break;
    }
    case 'masking-lock-off': {
      // LOCK hops clear as the bike rears: a puff of her green and a few motes going up.
      ctx.globalCompositeOperation = 'lighter';
      const x0 = e.x - dir * 34, y0 = e.y - 110;
      ctx.globalAlpha = (1 - t) * .5;
      glow(ctx, x0, y0, 50 + t * 40, '170,238,34');
      burst(el, 71, { n: n(16), speed: [40, 160], life: .7, gravity: -90, drag: .3 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = i % 3 ? e.color : '#ffffff';
        if (i % 2) sparkle(ctx, x, y, 6 * (1 - k)); else dot(ctx, x, y, 2.4);
      }, x0, y0);
      break;
    }
    case 'masking-tail': {
      // The red tail light, smeared into a short streak behind the bike.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - t) * .85;
      ctx.strokeStyle = e.color;
      ctx.lineCap = 'round';
      streak(ctx, e.x, e.y, e.x - dir * (26 + t * 34), e.y, 5 * (1 - t) + 1.5);
      ctx.globalAlpha = (1 - t) * .9;
      ctx.strokeStyle = '#ffd0d0';
      streak(ctx, e.x, e.y, e.x - dir * 10, e.y, 1.6);
      break;
    }
    case 'masking-dust': {
      // Road dust kicked up behind the back wheel.
      ctx.globalAlpha = (1 - t) * .45;
      glow(ctx, e.x - dir * t * 30, e.y - 6 - t * 18, r * (.6 + t), '217,203,180');
      break;
    }
    case 'masking-exhaust': {
      // The kick start: grey puffs rolling out of the exhaust and spreading.
      for (let i = 0, m = n(7); i < m; i++) {
        const k = ease(t * (1 + hash(i, 3) * .4));
        const x = e.x - dir * (k * r * (1 + hash(i, 1))), y = e.y - k * 20 * hash(i, 2) + (hash(i, 4) - .5) * 14;
        ctx.globalAlpha = (1 - t) * .5;
        glow(ctx, x, y, 10 + k * r * .5, '214,208,200');
      }
      break;
    }
    case 'masking-clip': {
      // A body clipped by the bike going through: a gold slash and a white snap.
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = PALE;
      ctx.lineCap = 'round';
      streak(ctx, -r * (1 + t), 0, r * (.6 + t), -r * .3, 6 * (1 - t) + 1);
      if (t < .3) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1 - t / .3; ctx.beginPath(); ctx.arc(0, 0, 16 + t * 60, 0, TAU); ctx.fill(); }
      break;
    }
    case 'masking-skid': {
      // The skid: a black tyre mark curving on the floor and a fan of dust thrown up round the back wheel.
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.globalAlpha = Math.min(1, e.life / .25) * .55;
      ctx.strokeStyle = '#2a2530'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-r * .9, 2); ctx.quadraticCurveTo(-r * .4, 6, 0, 2); ctx.stroke();
      for (let i = 0, m = n(12); i < m; i++) {
        const a = Math.PI + (i / (m - 1)) * Math.PI * .7;
        const k = ease(t * 1.3);
        ctx.globalAlpha = (1 - t) * .5;
        glow(ctx, -40 + Math.cos(a) * r * k, -20 + Math.sin(a) * r * .6 * k, 12 + k * 14, '230,216,194');
      }
      break;
    }
    case 'masking-glare': {
      // The scary face, squinting (she is only short-sighted): two short gold lines narrowing over the eyes.
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.globalAlpha = Math.min(1, el / .06) * (1 - t);
      ctx.strokeStyle = e.color; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      const sq = 1 - ease(t * 2) * .6;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(-14, s * 7 * sq - 2); ctx.lineTo(10, s * 3 * sq - 2); ctx.stroke();
      }
      break;
    }
    case 'masking-pinch': {
      // A squeeze of the cheeks: little gold hearts pop out and float up, more on each squeeze.
      const count = 2 + (e.n ?? 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - t) * .5;
      glow(ctx, e.x, e.y, 22 + t * 18, '255,200,120');
      burst(el, 31 + (e.n ?? 0), { n: count, speed: [50, 110], life: .5, gravity: -120, spread: 1.8, angle: -Math.PI / 2 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = i % 2 ? e.color : '#ffb0c8';
        heart(ctx, x, y, 7 * (.6 + .6 * Math.min(1, k * 4)));
      }, e.x, e.y);
      break;
    }
    case 'masking-pat': {
      // The pat on the head: a soft ring, three gold hearts in a little arc and a sparkle.
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = e.color; ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath(); ctx.ellipse(0, 0, 26 + t * 30, 10 + t * 10, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = e.color;
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * .7;
        const k = ease(t * 1.6);
        heart(ctx, Math.cos(a) * 30 * k, -10 + Math.sin(a) * 26 * k - t * 16, 7 + (i === 1 ? 3 : 0));
      }
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, dir * 18, -20 - t * 20, 8 * (1 - t));
      break;
    }
    case 'masking-fill': {
      // One stroke of the fill: a drum head of gold rings booming out where the fist lands, tilted a
      // little differently every time, with a white core when it connects.
      const i = e.n ?? 0;
      ctx.translate(e.x, e.y);
      ctx.rotate((hash(i, 9) - .5) * .7);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = e.color; ctx.lineWidth = 4 * (1 - t) + 1;
      const q = ease(t);
      ctx.beginPath(); ctx.ellipse(0, 0, 12 + q * 30, 22 + q * 26, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = (1 - t) * .7;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, 6 + q * 46, 12 + q * 40, 0, 0, TAU); ctx.stroke();
      if (e.hit && t < .35) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - t / .35;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, 0, 10 + t * 30, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'masking-crash': {
      // The crash: a flat gold cymbal disc slammed onto the floor — it spreads, shimmers and rings out.
      ctx.translate(e.x, e.y);
      const q = ease(t * 1.4);
      ctx.globalAlpha = (1 - t) * .55;
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.ellipse(0, 0, r * (.3 + q * .9), r * (.08 + q * .18), 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = PALE; ctx.lineWidth = 3 * (1 - t) + 1;
      for (let k = 0; k < 2; k++) {
        const qq = ease(Math.max(0, t * 1.4 - k * .22));
        ctx.beginPath(); ctx.ellipse(0, 0, r * (.3 + qq * 1.1), r * (.08 + qq * .24), 0, 0, TAU); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#fff4d0'; ctx.lineCap = 'round';
      for (let i = 0, m = n(10); i < m; i++) {
        const a = -Math.PI * (.08 + .84 * i / (m - 1));
        const r0 = r * (.3 + q * .5), r1 = r0 + 26 + hash(i, 5) * 30;
        ctx.globalAlpha = (1 - t) * .9;
        streak(ctx, Math.cos(a) * r0, Math.sin(a) * r0 * .5, Math.cos(a) * r1, Math.sin(a) * r1 * .5, 2.4);
      }
      break;
    }
    case 'masking-dim': {
      // 银河流星踢: the house lights go down while she revs; up again as she goes.
      const a = Math.min(1, el / .12, e.life / .3);
      ctx.globalAlpha = a * .45;
      ctx.fillStyle = e.color;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'masking-headlight': {
      // The headlight finds them: a warm cone out of the nose, swinging down onto the floor ahead.
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.rotate(.12 - ease(Math.min(1, el / .3)) * .1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, el / .08, e.life / .15) * .55;
      const g = ctx.createLinearGradient(0, 0, 420, 0);
      g.addColorStop(0, 'rgba(255,244,200,.95)');
      g.addColorStop(1, 'rgba(255,244,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(420, -70); ctx.lineTo(420, 80); ctx.lineTo(0, 6); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = Math.min(1, el / .08, e.life / .15);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
      break;
    }
    case 'masking-ram': {
      // The bike's nose meets a body: a white-gold impact star and a ring.
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = e.color;
      star(ctx, 0, 0, r * (.3 + ease(t) * .25), t * .6);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.beginPath(); ctx.arc(0, 0, r * (.3 + ease(t) * .7), 0, TAU); ctx.stroke();
      break;
    }
    case 'masking-bump': {
      // Bumped along on the nose: a small gold spark each time.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = PALE;
      sparkle(ctx, e.x, e.y, 10 * (1 - t * .5));
      break;
    }
    case 'masking-meteor': {
      // The kick from the seat (B 站「假面骑士 MASKING」, only in spirit): from the top of the leap her toe
      // lights up. A white-hot point on the toe with a gold glow, a drill cone of gold rings spinning forward
      // off it, a sharp spike of light ahead, and a falling-star tail streaming back up the dive.
      const local = el - (e.t0 ?? 0);
      if (local < -.1) break;
      const dive = Math.max(.05, e.max - (e.t0 ?? 0));
      const k = clamp(local / dive, 0, 1);
      const on = clamp((local + .1) / .12, 0, 1);
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.globalCompositeOperation = 'lighter';
      const tx = KICK_TOE.x, ty = KICK_TOE.y;
      // The tail, back up the way she came.
      if (local >= 0) {
        const len = 70 + k * 230;
        const bx = tx + Math.cos(TAIL_ANG) * len, by = ty + Math.sin(TAIL_ANG) * len;
        const g = ctx.createLinearGradient(tx, ty, bx, by);
        g.addColorStop(0, 'rgba(255,244,210,.95)');
        g.addColorStop(.35, 'rgba(238,187,68,.7)');
        g.addColorStop(1, 'rgba(238,187,68,0)');
        ctx.strokeStyle = g; ctx.lineCap = 'round';
        ctx.globalAlpha = 1;
        ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx, by); ctx.stroke();
        ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + (bx - tx) * .45, ty + (by - ty) * .45); ctx.stroke();
        // Speed lines alongside the tail.
        ctx.strokeStyle = '#fff4d0';
        for (let i = 0, m = n(6); i < m; i++) {
          const off = (hash(i, 41) - .5) * 70;
          const u = (local * 3 + hash(i, 42)) % 1;
          const px = -Math.sin(TAIL_ANG) * off, py = Math.cos(TAIL_ANG) * off;
          const d0 = 40 + u * 160, d1 = d0 + 40;
          ctx.globalAlpha = (1 - u) * .7;
          streak(ctx, tx + px + Math.cos(TAIL_ANG) * d0, ty + py + Math.sin(TAIL_ANG) * d0, tx + px + Math.cos(TAIL_ANG) * d1, ty + py + Math.sin(TAIL_ANG) * d1, 2);
        }
      }
      // The glow round the foot, breathing fast.
      const pulse = 1 + Math.sin(el * 40) * .12;
      ctx.globalAlpha = on * .85;
      glow(ctx, tx, ty, 46 * pulse, '238,187,68');
      ctx.globalAlpha = on;
      glow(ctx, tx, ty, 22 * pulse, '255,250,225');
      // The spike: a narrow lens of light pointing where the kick goes.
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(KICK_ANG);
      const spike = 50 + on * 40;
      const sg = ctx.createLinearGradient(0, 0, spike, 0);
      sg.addColorStop(0, 'rgba(255,255,255,1)');
      sg.addColorStop(1, 'rgba(255,214,106,0)');
      ctx.globalAlpha = on;
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(spike * .3, -11, spike, 0); ctx.quadraticCurveTo(spike * .3, 11, -6, 0); ctx.fill();
      // The drill: gold rings round the foot, wide at the foot and narrowing ahead, flowing forward.
      ctx.lineWidth = 3;
      for (let i = 0, m = n(4); i < m; i++) {
        const u = ((el * 4.5) + i / m) % 1;
        const x = -18 + u * 64;
        const rr = 30 * (1 - u * .78);
        ctx.globalAlpha = on * Math.sin(u * Math.PI) * .95;
        ctx.strokeStyle = i % 2 ? PALE : '#ffffff';
        ctx.beginPath(); ctx.ellipse(x, 0, rr * .32, rr, 0, 0, TAU); ctx.stroke();
      }
      // Two thin flares crossing on the toe, turning.
      ctx.rotate(el * 6);
      ctx.globalAlpha = on * .9;
      ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
      streak(ctx, -26 * pulse, 0, 26 * pulse, 0, 2.2);
      streak(ctx, 0, -26 * pulse, 0, 26 * pulse, 2.2);
      ctx.restore();
      ctx.globalAlpha = on;
      ctx.fillStyle = '#ffffff';
      star(ctx, tx, ty, 9 * pulse, el * 8);
      // Sparks shed off the toe, streaming back.
      for (let i = 0, m = n(8); i < m; i++) {
        const u = (el * 2.6 + hash(i, 51)) % 1;
        const a = TAIL_ANG + (hash(i, 52) - .5) * 1.1;
        const d = 10 + u * 90;
        ctx.globalAlpha = on * (1 - u);
        ctx.fillStyle = i % 2 ? PALE : '#ffffff';
        sparkle(ctx, tx + Math.cos(a) * d, ty + Math.sin(a) * d, 5 * (1 - u * .6));
      }
      break;
    }
    case 'masking-wreck': {
      // The bike she left: it rears up on the back wheel and tips over, and a beat after the kick lands it goes
      // up — a white flash, a gold fireball, a ring along the floor, both wheels and the red panels flung out
      // tumbling, a spiral of little gold stars (the 银河), then smoke. No words, just the light.
      const t0 = e.t0 ?? .5;
      const im = image(images, BIKE_SRC);
      if (el < t0 + .06) {
        const k = ease(el / t0);
        ctx.save();
        ctx.translate(e.x + Math.sin(el * 90) * 2 * k, e.y);
        ctx.scale(dir, 1);
        const rx = (REAR_U - SEAT_U) * BIKE_W;
        ctx.translate(rx, 0); ctx.rotate(-.6 * k); ctx.translate(-rx, 0);
        ctx.globalAlpha = el > t0 ? 1 - (el - t0) / .06 : 1;
        drawBike(ctx, im);
        // Just before it goes: the engine glows through the panels.
        if (k > .75) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (k - .75) * 3;
          glow(ctx, 0, -BIKE_W * .2, 40 + (k - .75) * 120, '255,190,90');
        }
        ctx.restore();
      }
      const local = el - t0;
      if (local < 0) break;
      const p = Math.min(1, local / (e.max - t0));
      const cx = e.x, cy = e.y - 64, floor = e.y;
      // Smoke first, under the fire: dark puffs that roll up and spread once the flash is gone.
      for (let i = 0, m = n(6); i < m; i++) {
        const k = clamp((local - .18 - i * .04) / .8, 0, 1);
        if (k <= 0) continue;
        ctx.globalAlpha = Math.sin(k * Math.PI) * .32;
        glow(ctx, cx + (hash(i, 61) - .5) * 90 + Math.sin(local * 2 + i) * 8, cy - 20 - k * (90 + hash(i, 62) * 60), 26 + k * 40, '58,52,66');
      }
      ctx.globalCompositeOperation = 'lighter';
      // The fireball: an orange body, a gold glow, a white core that shrinks fast.
      const fire = Math.max(0, 1 - local / .6);
      ctx.globalAlpha = fire * .7;
      glow(ctx, cx, cy - local * 40, 80 + local * 160, '255,120,50');
      ctx.globalAlpha = fire * .9;
      glow(ctx, cx, cy - local * 30, 60 + local * 110, '238,187,68');
      ctx.globalAlpha = Math.max(0, 1 - local / .25);
      glow(ctx, cx, cy, Math.max(4, 34 * (1 - local * 2)), '255,255,240');
      if (local < .1) {
        ctx.globalAlpha = 1 - local / .1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(cx, cy, 50 + local * 900, 0, TAU); ctx.fill();
      }
      // The ring along the floor and a quick ring in the air.
      if (local < .5) {
        ctx.globalAlpha = 1 - local / .5;
        ctx.strokeStyle = PALE; ctx.lineWidth = 5 * (1 - local / .5) + 1;
        const fr = 30 + ease(local / .5) * 250;
        ctx.beginPath(); ctx.ellipse(cx, floor, fr, fr * .16, 0, 0, TAU); ctx.stroke();
      }
      if (local < .28) {
        ctx.globalAlpha = 1 - local / .28;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, 30 + ease(local / .28) * 150, 0, TAU); ctx.stroke();
      }
      // Rays.
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = PALE; ctx.lineCap = 'round';
      for (let i = 0, m = n(14); i < m; i++) {
        const a = i * TAU / m + hash(i, 3) * .3;
        const r0 = 30 + ease(p) * 90, r1 = r0 + 34 + hash(i, 4) * 70;
        streak(ctx, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, 3.4 * (1 - p) + 1);
      }
      // 银河: a spiral of little gold stars turning outward.
      if (local < .9) {
        for (let i = 0, m = n(12); i < m; i++) {
          const a = i * TAU / m + local * 5;
          const rr = 26 + ease(local / .9) * (150 + (i % 3) * 30);
          ctx.globalAlpha = (1 - local / .9) * (i % 2 ? .9 : .6);
          ctx.fillStyle = i % 3 ? GOLD : '#ffffff';
          star(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .6, 6 + (i % 3) * 2, a);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      // Debris: both wheels and four red panels flung out, spinning, falling back to the floor.
      const tt = Math.min(local, 1.05);
      const debrisAlpha = 1 - Math.max(0, local - .75) / .35;
      if (debrisAlpha > 0) DEBRIS.forEach((q, i) => {
        if (lite && i % 2) return;
        const x = cx + q.vx * dir * tt;
        const y = Math.min(floor - (q.kind ? 6 : 16), cy + q.vy * tt + .5 * DEBRIS_G * tt * tt);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tt * (q.kind ? 14 : 9) * (i % 2 ? 1 : -1));
        ctx.globalAlpha = debrisAlpha;
        if (q.kind === 0) {
          ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill();
          ctx.fillStyle = '#8a8794'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
        } else {
          ctx.fillStyle = i % 2 ? RED : '#9a1420';
          ctx.beginPath(); ctx.moveTo(-11, -6); ctx.lineTo(12, -3); ctx.lineTo(3, 8); ctx.closePath(); ctx.fill();
        }
        // A little fire trailing each piece.
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha *= .6;
        glow(ctx, 0, 0, 14, '255,170,70');
        ctx.restore();
      });
      ctx.globalCompositeOperation = 'lighter';
      burst(local, 57, { n: n(18), speed: [140, 360], life: .9, gravity: 300, drag: .35 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = i % 3 ? GOLD : '#ffffff';
        star(ctx, x, y, 7 * (1 - k * .5), i + k * 5);
      }, cx, cy);
      break;
    }
    case 'masking-impact': {
      // The kick lands like a falling star: a column of light drops onto the point, it bursts white, a big gold
      // star with a turning outline, a long lens flare, rays, a ring of little stars spinning out (the 银河), a
      // floor ring with dust thrown both ways, and a shower of gold stars coming down. Smaller on a miss.
      const big = e.hit ? 1 : .7;
      const floor = 70;
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      // The falling star's column, from the top of the screen down to the point.
      if (el < .16) {
        const k = el / .16;
        const w = (1 - k) * 46 * big;
        const g = ctx.createLinearGradient(0, -e.y, 0, 0);
        g.addColorStop(0, 'rgba(238,187,68,0)');
        g.addColorStop(.7, 'rgba(255,230,160,.7)');
        g.addColorStop(1, 'rgba(255,255,255,1)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.fillRect(-w / 2, -e.y, w, e.y + floor);
      }
      if (el < .1) {
        ctx.globalAlpha = 1 - el / .1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, 0, 50 + el * 1000 * big, 0, TAU); ctx.fill();
      }
      // Lens flare: one long thin line across, one short up and down.
      const flare = Math.max(0, 1 - el / .4);
      if (flare > 0) {
        ctx.globalAlpha = flare;
        ctx.strokeStyle = '#fff4d0'; ctx.lineCap = 'round';
        streak(ctx, -320 * big * (1.2 - flare * .2), 0, 320 * big * (1.2 - flare * .2), 0, 4 * flare + 1);
        streak(ctx, 0, -120 * big, 0, 120 * big, 3 * flare + 1);
        ctx.globalAlpha = flare * .6;
        glow(ctx, 0, 0, 90 * big, '255,214,106');
      }
      // The star: a solid gold star and a bigger outline turning the other way.
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = e.color;
      star(ctx, 0, 0, r * big * (.45 + ease(t * 2) * .35), t * .8);
      ctx.fillStyle = '#ffffff';
      star(ctx, 0, 0, r * big * (.18 + ease(t * 2) * .1), t * .8);
      ctx.strokeStyle = PALE; ctx.lineWidth = 3 * (1 - t) + 1; ctx.lineJoin = 'round';
      ctx.save();
      ctx.rotate(-t * 1.4);
      const so = r * big * (.6 + ease(t) * .6);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? so * .45 : so;
        if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.stroke();
      ctx.restore();
      // Rays.
      ctx.strokeStyle = '#fff4d0'; ctx.lineCap = 'round';
      for (let i = 0, m = n(16); i < m; i++) {
        const a = i * TAU / m;
        const r0 = r * big * (.4 + ease(t) * .6), r1 = r0 + 40 + hash(i, 8) * 60;
        ctx.globalAlpha = 1 - t;
        streak(ctx, Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1, 3.2 * (1 - t) + 1);
      }
      // 银河: little stars on a ring that spins outward.
      if (el < .7) {
        ctx.globalAlpha = 1 - el / .7;
        const rr = r * big * (.3 + ease(el / .7) * 1.2);
        for (let i = 0, m = n(12); i < m; i++) {
          const a = i * TAU / m + el * 4;
          ctx.fillStyle = i % 2 ? GOLD : '#ffffff';
          star(ctx, Math.cos(a) * rr, Math.sin(a) * rr * .55, 6 + (i % 2) * 3, a);
        }
      }
      // The floor: a ring and dust thrown both ways.
      ctx.globalAlpha = (1 - t) * .8;
      ctx.strokeStyle = e.color; ctx.lineWidth = 5 * (1 - t) + 1;
      ctx.beginPath(); ctx.ellipse(0, floor, r * big * (.4 + ease(t) * 1.5), r * big * (.1 + ease(t) * .3), 0, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0, m = n(8); i < m; i++) {
        const side = i % 2 ? 1 : -1;
        const k = ease(Math.min(1, el / .6));
        ctx.globalAlpha = (1 - t) * .45;
        glow(ctx, side * (30 + k * (120 + hash(i, 31) * 90)), floor - 8 - k * hash(i, 32) * 30, 14 + k * 18, '230,214,190');
      }
      ctx.globalCompositeOperation = 'lighter';
      // The shower: gold stars thrown up and coming back down.
      burst(el, 83, { n: n(16), speed: [220, 460], life: 1, gravity: 900, spread: 2.2, angle: -Math.PI / 2 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = i % 3 ? GOLD : '#ffffff';
        star(ctx, x, Math.min(floor, y), 6 * (1 - k * .4), i + k * 6);
      }, 0, 0);
      break;
    }
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  return true;
}
