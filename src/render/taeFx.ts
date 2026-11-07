import type { Effect, Projectile } from '../game/game.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { WARREN_HOLES, rabbitHop } from './clips.ts';
import { TAU, burst, dot, glow, hash, sparkle, streak } from './fxParticles.ts';

/* 花园多惠 — 兔子、兔子洞、警帽与警灯、兔王的小王冠. Two registers:
   - the rabbits and the earth: soft fur in six coats (小欧 white with odd eyes, 小紫, 团十郎, 可可亚, BB King,
     小白), brown holes with a rim of turned earth, beige dust;
   - her blue (#0077DD) and white for the impacts, red and blue for the police lights, gold for the crown.
   Rabbits are built from ellipses and most poses are cached as small stamps. One pose blends from a crouch
   to a full stretch, and the caller squashes, tilts and moves it. */

/** Painted under every body: the holes (one, or the super's whole warren), and the dust at their feet. */
export const TAE_BACK: readonly string[] = ['tae-hole', 'tae-warren', 'tae-dust'];
/** Screen space, behind every body: the super's night sky and full moon. */
export const TAE_SCREEN_BACK: readonly string[] = ['tae-moon'];

/** Her body height on stage (characters.ts view.height): the cap, the lights and the crown sit on her head. */
const TAE_H = 174;
const BLUE = '#0077DD';
const BLUE_RGB = '0,119,221';
const DIRT = '#7a5a3e';
const DIRT_TOP = '#9b7957';
const DIRT_DEEP = '#2a1d14';
const GOLD = '#ffd34d';

let lite = false;
const n = (full: number) => (lite ? Math.ceil(full / 2) : full);
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;

interface Coat { fur: string; shade: string; line: string; ear: string; eye: string; odd?: string }
/** 0 小欧 (the odd eyes), 1 小紫, 2 团十郎, 3 可可亚, 4 BB King, 5 小白. */
const COATS: readonly Coat[] = [
  { fur: '#fbfaf6', shade: '#dcd5ca', line: '#8f867a', ear: '#f4b6c4', eye: '#3a86ff', odd: '#ff5a46' },
  { fur: '#d2c5e8', shade: '#ab9bcc', line: '#6c5e8c', ear: '#f2c2d8', eye: '#2b2230' },
  { fur: '#8f664a', shade: '#6a4934', line: '#3e2a1e', ear: '#d9a08c', eye: '#1e1612' },
  { fur: '#cda172', shade: '#a77d55', line: '#6b4e33', ear: '#f0c0a8', eye: '#2a1d14' },
  { fur: '#48434e', shade: '#2e2b33', line: '#18161b', ear: '#a9787f', eye: '#f2e6c8' },
  { fur: '#f4efe7', shade: '#d4cabb', line: '#8c8274', ear: '#f4b6c4', eye: '#c8455a' },
];
const coatOf = (i: number | undefined) => COATS[((i ?? 1) % COATS.length + COATS.length) % COATS.length];

function ell(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  if (!(rx > 0) || !(ry > 0)) return;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}

/** One rabbit in local space: facing right, feet on y = 0, about 40 px long at scale 1. `k` blends the
 *  crouch (0: folded up, ears up) into the leap (1: long body, hind legs back, front paws reaching, ears swept
 *  back). `wob` sways the ears. `shine` lights the eyes (小欧 coming out of the big hole). */
function rabbit(ctx: CanvasRenderingContext2D, coatIx: number | undefined, k: number, wob: number, shine = 0, mono = ''): void {
  const c = mono ? { fur: mono, shade: mono, line: mono, ear: mono, eye: mono } as Coat : coatOf(coatIx);
  k = clamp(k, 0, 1);
  const bx = 2 * k, by = -13 - 3 * k, brx = 15 + 7 * k, bry = 11.5 - 2.5 * k;
  const hx = -8 - 4 * k, hy = -11 - k, hr = 9.5 - 1.5 * k;
  const qx = 14 + 7 * k, qy = -24 + 4 * k, qr = 8.5;
  const footX = -5 - 15 * k, footY = -2.5 - 3.5 * k, footRx = 9 + 3 * k, footRot = -.38 * k;
  const pawX = 9 + 15 * k, pawY = -2.6 - 6 * k, pawRx = 4.5 + 2 * k, pawRot = .5 * k;
  const tx = -19 - 6 * k, ty = -17 + k;
  const earBaseX = qx - 2.5, earBaseY = qy - 5.5;
  const nearA = .3 + .8 * k + wob, farA = .5 + .8 * k + wob * .7;
  const earLen = 17, earW = 3.8;
  const ear = (x: number, y: number, a: number, len: number, w: number) => {
    // An ear leans back by `a` from straight up, from its base at (x, y).
    ell(ctx, x - Math.sin(a) * len * .5, y - Math.cos(a) * len * .5, w, len * .5, -a);
  };
  // Pass 1: the outline, every shape stroked fat, so the whole rabbit gets one soft silhouette line.
  // A silhouette (mono) skips it and every detail: one flat shape.
  if (!mono) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 2.6;
    ear(earBaseX - 3, earBaseY + 1, farA, earLen * .95, earW * .9); ctx.stroke();
    ell(ctx, footX, footY, footRx, 3.2, footRot); ctx.stroke();
    ell(ctx, hx, hy, hr, hr); ctx.stroke();
    ell(ctx, bx, by, brx, bry, -.12 * k); ctx.stroke();
    ell(ctx, pawX, pawY, pawRx, 2.6, pawRot); ctx.stroke();
    ell(ctx, qx, qy, qr, qr * .92); ctx.stroke();
    ear(earBaseX, earBaseY, nearA, earLen, earW); ctx.stroke();
    ell(ctx, tx, ty, 4.6, 4.6); ctx.stroke();
  }
  // Pass 2: the fills, far side in the shade colour.
  ctx.fillStyle = c.shade;
  ear(earBaseX - 3, earBaseY + 1, farA, earLen * .95, earW * .9); ctx.fill();
  ell(ctx, footX, footY, footRx, 3.2, footRot); ctx.fill();
  ctx.fillStyle = c.fur;
  ell(ctx, hx, hy, hr, hr); ctx.fill();
  ell(ctx, bx, by, brx, bry, -.12 * k); ctx.fill();
  ell(ctx, pawX, pawY, pawRx, 2.6, pawRot); ctx.fill();
  ell(ctx, qx, qy, qr, qr * .92); ctx.fill();
  ear(earBaseX, earBaseY, nearA, earLen, earW); ctx.fill();
  ctx.fillStyle = c.ear;
  ear(earBaseX, earBaseY, nearA, earLen * .78, earW * .45); ctx.fill();
  ctx.fillStyle = mono || '#ffffff';
  ell(ctx, tx, ty, 4.6, 4.6); ctx.fill();
  if (mono) return;
  // A soft light along the back.
  ctx.globalAlpha *= .45;
  ell(ctx, bx - 3, by - bry * .45, brx * .6, bry * .32, -.12 * k); ctx.fill();
  ctx.globalAlpha /= .45;
  // Face: the eye (小欧 shows the far one too, peeking round the front of the head), the nose.
  const ex = qx + 3.2, ey = qy - 1.5;
  if (c.odd) {
    ctx.fillStyle = c.odd;
    dot(ctx, qx + 6.8, qy - 3.6, 1.5);
  }
  ctx.fillStyle = c.eye;
  ell(ctx, ex, ey, 1.9, 2.2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  dot(ctx, ex + .6, ey - .8, .6);
  ctx.fillStyle = '#f08aa0';
  dot(ctx, qx + qr - .6, qy + 1.6, 1.3);
  if (shine > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= shine;
    glow(ctx, ex, ey, 7, '58,134,255');
    glow(ctx, qx + 6.8, qy - 3.6, 6, '255,90,70');
    ctx.restore();
  }
}

/* Rabbits are stamped: each coat × pose step is painted once into a small canvas (at STAMP_RES× the base size)
   and every later rabbit at that pose is one drawImage, instead of ~16 path fills and strokes. A rabbit drawn
   bigger than the stamp's resolution (小欧 out of the big hole), a lit one, and any rabbit with no DOM (the
   headless check) are drawn live. The ears' sway is dropped from stamps; a stamp sways with its body. */
const STAMP_RES = 2;
const STAMP_STEPS = 6;
/** Local bounds of any rabbit pose at scale 1 (feet on y = 0, facing right), outline included. */
const STAMP_X = -35, STAMP_Y = -52, STAMP_W = 72, STAMP_H = 58;
const rabbitStamps = new Map<string, HTMLCanvasElement | null>();
function rabbitStamp(coat: number | undefined, k: number, mono: string, res: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const step = Math.round(clamp(k, 0, 1) * (STAMP_STEPS - 1));
  const key = (mono || String(((coat ?? 1) % COATS.length + COATS.length) % COATS.length)) + '|' + step;
  let c = rabbitStamps.get(key);
  if (c !== undefined) return c;
  c = document.createElement('canvas');
  c.width = STAMP_W * res;
  c.height = STAMP_H * res;
  const g = c.getContext('2d');
  if (g) {
    g.scale(res, res);
    g.translate(-STAMP_X, -STAMP_Y);
    rabbit(g, coat, step / (STAMP_STEPS - 1), 0, 0, mono);
  } else c = null;
  rabbitStamps.set(key, c);
  return c;
}

/** A rabbit with its feet at (x, y) in the world, scale s, facing dir, squash sx/sy about the feet, turned rot. */
function placeRabbit(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dir: number, coat: number | undefined, k: number, rot: number, sx = 1, sy = 1, wob = 0, shine = 0, mono = ''): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * s * sx, s * sy);
  if (rot) {
    // Turn about the middle of the body, not the feet.
    ctx.translate(0, -14);
    ctx.rotate(rot);
    ctx.translate(0, 14);
  }
  const res = mono ? 3 : STAMP_RES;
  // Keep the moon rabbit's overlapping fills during the fade.
  const stamp = !shine && (!mono || ctx.globalAlpha === 1) && s * Math.max(sx, sy) <= res * 1.05
    ? rabbitStamp(coat, k, mono, res) : null;
  if (stamp) ctx.drawImage(stamp, STAMP_X, STAMP_Y, STAMP_W, STAMP_H);
  else rabbit(ctx, coat, k, wob, shine, mono);
  ctx.restore();
}

/** A floor shadow under something `lift` px up. */
function shadow(ctx: CanvasRenderingContext2D, x: number, w: number, lift: number): void {
  const k = clamp(1 - lift / 160, .35, 1);
  ctx.save();
  ctx.globalAlpha *= .2 * k;
  ctx.fillStyle = '#000000';
  ell(ctx, x, FLOOR + 1, w * k, 4 * k);
  ctx.fill();
  ctx.restore();
}

/** Only what is above the floor line (a rabbit coming up out of, or going down into, a hole). */
function aboveFloor(ctx: CanvasRenderingContext2D, x: number, half: number): void {
  ctx.beginPath();
  ctx.rect(x - half, 0, half * 2, FLOOR + 1);
  ctx.clip();
}

/** A hole in the floor, `open` 0 → 1: a rim of turned earth round a dark mouth. */
function hole(ctx: CanvasRenderingContext2D, x: number, r: number, open: number, seed: number): void {
  if (!(open > .01)) return;
  ctx.fillStyle = DIRT;
  ell(ctx, x, FLOOR, r * 1.32 * open, r * .34 * open + 1);
  ctx.fill();
  ctx.fillStyle = DIRT_TOP;
  ell(ctx, x, FLOOR - r * .07 * open, r * 1.12 * open, r * .24 * open + .5);
  ctx.fill();
  ctx.fillStyle = DIRT_DEEP;
  ell(ctx, x, FLOOR + r * .02, r * .86 * open, r * .17 * open + .5);
  ctx.fill();
  // A few crumbs thrown out on the rim.
  ctx.fillStyle = DIRT;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = hash(i, seed) * Math.PI;
    const px = x + Math.cos(a) * r * (1.45 + hash(i, seed + 1) * .3) * open * (i % 2 ? 1 : -1);
    const py = FLOOR - Math.sin(a) * r * .18 * open;
    const size = 1.6 + hash(i, seed + 2) * 1.4;
    if (size < 2.5) ctx.rect(px - size, py - size, size * 2, size * 2);
    else { ctx.moveTo(px + size, py); ctx.arc(px, py, size, 0, TAU); }
  }
  ctx.fill();
}

function drawWarren(ctx: CanvasRenderingContext2D, x: number, open: number): void {
  for (let i = 0; i < WARREN_HOLES.length; i++) hole(ctx, x + WARREN_HOLES[i], 28, open, 37 + i * 5);
  hole(ctx, x, 46, open, 61);
}

// Bounds include the loose crumbs outside the rim. Only the fully open warren is static.
const WARREN_HALF_W = 160, WARREN_HALF_H = 20;
let openWarren: HTMLCanvasElement | null | undefined;
function warrenStamp(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (openWarren !== undefined) return openWarren;
  const c = document.createElement('canvas');
  c.width = 2 * WARREN_HALF_W * STAMP_RES;
  c.height = 2 * WARREN_HALF_H * STAMP_RES;
  const g = c.getContext('2d');
  if (g) {
    g.scale(STAMP_RES, STAMP_RES);
    g.translate(WARREN_HALF_W, WARREN_HALF_H - FLOOR);
    drawWarren(g, 0, 1);
  }
  openWarren = g ? c : null;
  return openWarren;
}

/** Earth crumbs thrown up and falling back. */
function crumbs(ctx: CanvasRenderingContext2D, el: number, seed: number, x: number, count: number, speed: number, spread = 1.7): void {
  burst(el, seed, { n: n(count), speed: [speed * .4, speed], life: .55, gravity: 900, angle: -Math.PI / 2, spread }, (px, py, k, i) => {
    if (py > FLOOR + 2) return;
    ctx.globalAlpha = 1 - k * k;
    ctx.fillStyle = i % 3 ? DIRT : DIRT_TOP;
    dot(ctx, px, py, 2.6 - k);
  }, x, FLOOR - 4);
  ctx.globalAlpha = 1;
}

/** The hop on the floor, shared by the shot and the effects: 0 crouch on the floor, 1 stretched mid-air, a
 *  squash at take-off and landing, the nose up rising and down falling. */
function hopPose(u: number): { k: number; sx: number; sy: number; rot: number } {
  const air = Math.sin(Math.PI * u);
  const edge = Math.min(u, 1 - u);
  const squash = edge < .1 ? 1 - edge / .1 : 0;
  return { k: Math.min(1, air * 1.7), sx: 1 + .14 * squash - .04 * air, sy: 1 - .16 * squash + .05 * air, rot: -.34 * Math.cos(Math.PI * u) * air };
}

/** The super's dusk: one gradient per canvas, built once (it depends only on the floor line). */
const skies = new WeakMap<CanvasRenderingContext2D, CanvasGradient>();
function skyOf(ctx: CanvasRenderingContext2D): CanvasGradient {
  let sky = skies.get(ctx);
  if (!sky) {
    sky = ctx.createLinearGradient(0, 0, 0, FLOOR * .82);
    sky.addColorStop(0, 'rgba(14,22,58,.55)');
    sky.addColorStop(.55, 'rgba(26,40,92,.26)');
    sky.addColorStop(1, 'rgba(26,40,92,0)');
    skies.set(ctx, sky);
  }
  return sky;
}

export function drawTaeShot(ctx: CanvasRenderingContext2D, p: Projectile, liteFx: boolean): boolean {
  if (p.fx !== 'tae-rabbit') return false;
  lite = liteFx;
  const coat = p.wave ?? 1;
  const dir = Math.sign(p.vx) || 1;
  const { lift, u } = rabbitHop(p.age, coat);
  const pose = hopPose(u);
  const s = (p.radius >= 22 ? 1.55 : 1.3);
  ctx.save();
  shadow(ctx, p.x, 15 * s, lift);
  placeRabbit(ctx, p.x, FLOOR - lift, s, dir, coat, pose.k, pose.rot, pose.sx, pose.sy, Math.sin(p.age * 18 + coat) * .08);
  ctx.restore();
  return true;
}

export function drawTaeFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false): boolean {
  if (!e.type.startsWith('tae-')) return false;
  lite = liteFx;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  const r = e.radius ?? 30;
  ctx.save();
  switch (e.type) {
    case 'tae-hole': {
      // Opens fast, stays, and closes over its last 0.3 s.
      const open = ease(el / .14) * clamp(e.life / .3, 0, 1);
      hole(ctx, e.x, r, open, Math.round(e.x) % 97);
      break;
    }
    case 'tae-warren': {
      // 花园兔王's warren, kept by the move: four holes round the mark and the big one on it. They open fast and
      // close over the linger once the move lets go of them (landing, or the move cut short).
      const open = ease((e.age ?? el) / .14) * clamp(e.life / .3, 0, 1);
      const stamp = open === 1 && ctx.globalAlpha === 1 ? warrenStamp() : null;
      if (stamp) ctx.drawImage(stamp, e.x - WARREN_HALF_W, FLOOR - WARREN_HALF_H, 2 * WARREN_HALF_W, 2 * WARREN_HALF_H);
      else drawWarren(ctx, e.x, open);
      break;
    }
    case 'tae-dust': {
      // A little beige puff at the feet.
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = (1 - t) * .55;
        glow(ctx, e.x - dir * (i - 1) * r * .7 - dir * t * r * .6, FLOOR - 4 - t * 8 - i * 2, r * (.5 + t * .7), '214,196,166');
      }
      break;
    }
    case 'tae-dig': {
      // She goes down a hole: earth thrown up, a puff, and the hole shutting after her.
      const open = el < .12 ? ease(el / .12) : clamp(1 - (el - .12) / .4, 0, 1);
      hole(ctx, e.x, r, open, 11);
      ctx.globalAlpha = (1 - t) * .5;
      glow(ctx, e.x, FLOOR - 26 - t * 20, 40 + t * 26, '226,214,196');
      ctx.globalAlpha = 1;
      crumbs(ctx, el, 13, e.x, 16, 380);
      break;
    }
    case 'tae-dirt': {
      crumbs(ctx, el, 17 + (Math.round(e.x) % 7), e.x, 10 + Math.round(r / 12), 260 + r * 1.6, 1.2 + r / 160);
      break;
    }
    case 'tae-ears': {
      // The tell: two white ears poke up out of the far hole and twitch.
      aboveFloor(ctx, e.x, 40);
      const up = ease(el / .12) * clamp(e.life / .06, 0, 1);
      const c = COATS[0];
      for (let i = 0; i < 2; i++) {
        const a = (i ? .22 : -.08) + Math.sin(el * 26 + i * 2) * .1;
        const x = e.x + dir * (i ? -7 : 6), len = 36 * up;
        if (!(len > 1)) continue;
        ctx.save();
        ctx.translate(x, FLOOR + 6);
        ctx.rotate(a * dir);
        ctx.fillStyle = c.line;
        ell(ctx, 0, -len / 2, 8.4, len / 2 + 1.6); ctx.fill();
        ctx.fillStyle = i ? c.shade : c.fur;
        ell(ctx, 0, -len / 2, 6.8, len / 2); ctx.fill();
        if (!i) { ctx.fillStyle = c.ear; ell(ctx, 0, -len / 2 + 2, 3.1, len * .38); ctx.fill(); }
        ctx.restore();
      }
      break;
    }
    case 'tae-pop':
    case 'tae-pop-big': {
      // A rabbit out of the warren. Earth bursts up out of the hole and the rabbit comes after it, nose up, at
      // whoever is over the warren (tx, ty: where its feet meet them, t0 seconds in); there it whips over
      // backwards and drives both hind legs up into them — 兔子蹬 — a white arc tracing the kick; then it
      // drops back down its hole. The big one is 小欧: three times the size, eyes lit by the moon.
      const big = e.type === 'tae-pop-big';
      const s = big ? 3.2 : 1.35;
      const t0 = e.t0 ?? .1;
      const tx = e.tx ?? 0, ty = e.ty ?? -46;
      const deep = FLOOR + 30 * s;
      let x: number, feet: number;
      if (el < t0) {
        const k = ease(el / t0);
        x = e.x + tx * k;
        feet = deep + (FLOOR + ty - deep) * k;
      } else {
        const u = clamp((el - t0) / (e.max - t0), 0, 1);
        x = e.x + tx * (1 - u * u);
        const peak = FLOOR + ty - 22 * s * Math.sin(Math.PI * Math.min(1, u * 2.2));
        feet = peak + (deep + 10 * s - peak) * Math.max(0, (u - .3) / .7) ** 2;
      }
      // The kick: over backwards so the hind feet sweep up through the contact.
      const flip = ease((el - (t0 - .04)) / (big ? .2 : .14));
      const rot = -1.1 - Math.PI * flip - (el > t0 ? .45 * clamp((el - t0) / (e.max - t0), 0, 1) : 0);
      // Earth thrown up out of the hole ahead of it, and a ring of dust on the floor.
      if (el < .5) crumbs(ctx, el, big ? 23 : 19 + (e.n ?? 0), e.x, big ? 22 : 10, big ? 560 : 340, .7);
      if (el < .3) {
        ctx.save();
        ctx.globalAlpha = (1 - el / .3) * .5;
        glow(ctx, e.x, FLOOR - 8, (big ? 70 : 34) * (.6 + el * 2), '214,196,166');
        ctx.restore();
      }
      if (big && el < .3) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - el / .3) * .7;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ell(ctx, e.x, FLOOR - 4, 40 + el * 420, 10 + el * 60); ctx.stroke();
        ctx.restore();
      }
      // Speed lines under it while it climbs.
      if (el < t0 + .03) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineCap = 'round';
        const span = (deep - feet) * .9;
        for (let i = 0; i < 3; i++) {
          const ox = (i - 1) * 7 * s;
          ctx.globalAlpha = .55 * (1 - i * .2);
          streak(ctx, x + ox - tx * .15, feet + 8 * s + i * 4, x + ox - tx * .3, Math.min(FLOOR, feet + 8 * s + span), big ? 3 : 1.6);
        }
        ctx.restore();
      }
      // The kick's arc: a bright crescent swept by the feet round the body.
      if (flip > 0 && flip < 1 && el < t0 + .16) {
        const cx = x, cy = feet - 14 * s;
        const r = 26 * s;
        const d = e.dir ?? 1;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        const a1 = Math.PI / 2 - Math.PI * flip * .95, a0 = Math.PI / 2 + .2;
        ctx.globalAlpha = .9 * (1 - flip * .5);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = (big ? 7 : 3.2) * (1 - flip * .4);
        ctx.beginPath();
        if (d > 0) ctx.arc(cx, cy, r, a1, a0); else ctx.arc(cx, cy, r, Math.PI - a0, Math.PI - a1);
        ctx.stroke();
        ctx.globalAlpha = .45 * (1 - flip * .5);
        ctx.strokeStyle = `rgb(${BLUE_RGB})`;
        ctx.lineWidth = (big ? 14 : 7) * (1 - flip * .4);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      aboveFloor(ctx, x, 70 * s);
      placeRabbit(ctx, x, feet, s, e.dir ?? 1, e.n, flip > 0 && flip < 1 ? 1 : .75, rot, 1, 1, Math.sin(el * 20) * .12, big ? clamp(1.4 - t * 1.2, 0, 1) : 0);
      ctx.restore();
      break;
    }
    case 'tae-impact': {
      // Where a rabbit's kick lands: a hard white flash, a burst of short strokes fanning up and away (the
      // blow comes from below), two paw-print dents of light, and a puff of fur. A guarded one (hit false)
      // is a small pale-blue knock with no fur. heavy is 小欧's: bigger, with a ring across the floor.
      const k = el / e.max;
      const sc = e.heavy ? 1.9 : e.hit ? 1 : .6;
      const d = e.dir ?? 1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - k) * .7;
      glow(ctx, e.x, e.y, 26 * sc * (.7 + k * .5), e.hit ? '255,255,255' : '159,216,255');
      ctx.globalAlpha = (1 - k) * .3;
      glow(ctx, e.x, e.y, 40 * sc, BLUE_RGB);
      ctx.globalCompositeOperation = 'source-over';
      // A four-point star of light at the contact, quick.
      if (k < .45) {
        const q = 1 - k / .45;
        ctx.globalAlpha = q;
        ctx.fillStyle = '#ffffff';
        const r1 = 26 * sc * (.6 + .4 * q), r2 = 4 * sc;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r2 : r1 * (i % 4 === 0 ? 1 : .7);
          if (i) ctx.lineTo(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr); else ctx.moveTo(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      }
      // Strokes fanning upward and away from where the rabbit came from.
      ctx.lineCap = 'round';
      ctx.globalAlpha = 1 - k;
      if (ctx.globalAlpha > .02) {
        const count = n(e.heavy ? 12 : 7);
        const d0 = (14 + ease(k) * 46) * sc;
        for (let white = 0; white < 2; white++) {
          ctx.strokeStyle = white ? '#ffffff' : BLUE;
          ctx.lineWidth = (white ? 2.2 : 3.2) * Math.min(1.5, sc);
          ctx.beginPath();
          for (let i = white; i < count; i += white ? 1 : 3) {
            if (white && i % 3 === 0) continue;
            const a = -Math.PI / 2 + d * .35 + (hash(i, 71) - .5) * 1.9;
            const dx = Math.cos(a), dy = Math.sin(a);
            const d1 = d0 + (18 + 10 * hash(i, 72)) * sc * (1 - k);
            ctx.moveTo(e.x + dx * d0, e.y + dy * d0);
            ctx.lineTo(e.x + dx * d1, e.y + dy * d1);
          }
          ctx.stroke();
        }
      }
      if (e.hit) {
        burst(el, 73, { n: n(e.heavy ? 14 : 6), speed: [60, 220 * sc], life: e.max, gravity: 260, angle: -Math.PI / 2, spread: 2.4, drag: .3 }, (px, py, q, i) => {
          ctx.globalAlpha = 1 - q;
          ctx.fillStyle = i % 4 ? '#ffffff' : '#f4dbe2';
          dot(ctx, px, py, (2.4 + hash(i, 74)) * (1 - q * .4));
        }, e.x, e.y);
      }
      if (e.heavy) {
        ctx.globalAlpha = (1 - k) * .7;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ell(ctx, e.x, FLOOR - 2, 30 + ease(k) * 190, 6 + ease(k) * 26); ctx.stroke();
      }
      break;
    }
    case 'tae-dive': {
      // A rabbit that met nobody: one last hop and down a hole of its own.
      const s = 1.3;
      const x = e.x + dir * 34 * t;
      const sink = Math.max(0, t - .55) / .45;
      const feet = FLOOR - 28 * Math.sin(Math.PI * Math.min(1, t * 1.3)) + sink * 40 * s;
      hole(ctx, e.x + dir * 34, 16, clamp((t - .35) / .15, 0, 1) * clamp((1 - t) / .15, 0, 1), 29);
      ctx.save();
      aboveFloor(ctx, x, 40);
      placeRabbit(ctx, x, feet, s, dir, e.n, .8, -.4 + 1.5 * t);
      ctx.restore();
      break;
    }
    case 'tae-flip': {
      // A rabbit that bumped someone: a backflip away from them and straight down into the floor.
      const s = 1.3;
      const x = e.x - dir * 46 * t;
      const sink = Math.max(0, t - .72) / .28;
      const feet = FLOOR - 72 * Math.sin(Math.PI * Math.min(1, t / .8)) + sink * 44 * s;
      const at = e.x - dir * 46 * .8;
      hole(ctx, at, 16, clamp((t - .5) / .15, 0, 1) * clamp((1 - t) / .12, 0, 1), 31);
      ctx.save();
      aboveFloor(ctx, x, 40);
      placeRabbit(ctx, x, feet, s, dir, e.n, .7, -TAU * Math.min(1, t / .8));
      ctx.restore();
      break;
    }
    case 'tae-cap': {
      // The cap goes on: a navy flick at her head and two small glints.
      const hx = e.x + dir * 4, hy = e.y - TAE_H * .98;
      ctx.globalAlpha = (1 - t) * .55;
      glow(ctx, hx, hy, 26 + t * 18, '42,58,102');
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, hx + dir * 18, hy - 10 - t * 10, 7 * (1 - t));
      sparkle(ctx, hx - dir * 14, hy + 4 - t * 6, 4.5 * (1 - t));
      break;
    }
    case 'tae-siren': {
      // The police lights: red and blue taking turns at her temple. Small and steady — it marks the move,
      // it does not light the stage.
      const fade = Math.min(1, el / .08, e.life / .12);
      const red = Math.floor(el * 7) % 2 === 0;
      const x = e.x + dir * 2, y = e.y - TAE_H * 1.03;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * .75;
      glow(ctx, x - 9, y, red ? 15 : 7, '255,58,74');
      glow(ctx, x + 9, y, red ? 7 : 15, '58,120,255');
      ctx.globalAlpha = fade;
      ctx.fillStyle = red ? '#ff6a76' : '#7aa6ff';
      dot(ctx, red ? x - 9 : x + 9, y, 2.4);
      break;
    }
    case 'tae-crown': {
      // 兔王's little crown: a gold band whose two tall points are rabbit ears, a blue stone between them.
      // Kept by the move: it fades over the last 0.15 s after the move lets go (she dives, or is cut short).
      const fade = Math.min(1, el / .15, e.life / .15);
      const bob = Math.sin(el * 5) * 1.5;
      const x = e.x + dir * 2, y = e.y - TAE_H * 1.05 + bob;
      ctx.globalAlpha = fade;
      ctx.translate(x, y);
      ctx.fillStyle = '#9a6b16';
      ctx.beginPath(); ctx.roundRect(-13.5, -1.5, 27, 9, 3); ctx.fill();
      for (const sx of [-1, 1]) { ell(ctx, sx * 6, -9, 4.4, 10.5, sx * .18); ctx.fill(); }
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.roundRect(-12, 0, 24, 6.5, 2.5); ctx.fill();
      for (const sx of [-1, 1]) { ell(ctx, sx * 6, -9, 3.2, 9.2, sx * .18); ctx.fill(); }
      ctx.fillStyle = '#ffb3c4';
      for (const sx of [-1, 1]) { ell(ctx, sx * 6.2, -9, 1.3, 5.6, sx * .18); ctx.fill(); }
      ctx.fillStyle = BLUE;
      dot(ctx, 0, 3.2, 2.6);
      ctx.fillStyle = '#ffffff';
      if (Math.floor(el * 1.6) % 2 === 0) sparkle(ctx, 9, -16, 3.5);
      break;
    }
    case 'tae-moon': {
      // 花园兔王's night: the sky over the stage goes to dusk from the top down (the floor and the fighters keep
      // their light), and a full moon rises over the warren with its rabbit on it (月兔) — the one place the
      // rabbits keep leaping toward. A few stars blink in. All of it eases in over half a second and out over
      // the last 0.4 s. e.x is the warren, so the moon hangs above it.
      // Kept by the move (age is the warren's clock); it sets over 0.4 s once the move lets go.
      const age = e.age ?? el;
      const a = ease(age / .5) * clamp(e.life / .4, 0, 1);
      if (!(a > .01)) break;
      const sky = skyOf(ctx);
      ctx.globalAlpha = a;
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, FLOOR * .82);
      // Stars: small, fixed, blinking slowly.
      ctx.fillStyle = '#ffffff';
      for (let i = 0, m = n(16); i < m; i++) {
        const sx = hash(i, 81) * W, sy = 12 + hash(i, 82) * FLOOR * .38;
        ctx.globalAlpha = a * (.35 + .45 * Math.sin(age * (1.5 + hash(i, 83) * 2) + i * 2) ** 2);
        if (i % 5 === 0) sparkle(ctx, sx, sy, 4); else dot(ctx, sx, sy, 1.2);
      }
      // The moon: rises a little as it comes in.
      const mr = 64;
      const mx = clamp(e.x, mr + 30, W - mr - 30), my = 128 - 26 * ease(age / .8);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * .5;
      glow(ctx, mx, my, mr * 2.4, '255,244,214');
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a;
      ctx.fillStyle = e.color;
      ell(ctx, mx, my, mr, mr); ctx.fill();
      // Soft seas on its face, then the rabbit sitting on it, in the moon's own darker tone.
      ctx.save();
      ell(ctx, mx, my, mr, mr); ctx.clip();
      ctx.fillStyle = '#e4d9ba';
      ell(ctx, mx - mr * .45, my - mr * .35, mr * .32, mr * .26); ctx.fill();
      ell(ctx, mx + mr * .5, my + mr * .4, mr * .26, mr * .2); ctx.fill();
      placeRabbit(ctx, mx - 10, my + mr * .55, 2.3, -1, 0, 0, 0, 1, 1, 0, 0, '#cdbb8c');
      ctx.restore();
      break;
    }
    case 'tae-kick': {
      // The rabbit kick lands: a white ring, a fan of short blue streaks, a puff of fur.
      const big = e.hit ? 1 : .55;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - t) * .8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5 * (1 - t) + 1;
      ell(ctx, e.x, e.y, (24 + ease(t) * 64) * big, (18 + ease(t) * 46) * big, dir * .3); ctx.stroke();
      ctx.globalAlpha = (1 - t) * .5;
      glow(ctx, e.x, e.y, 60 * big, BLUE_RGB);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = BLUE;
      ctx.lineCap = 'round';
      for (let i = 0, m = n(8); i < m; i++) {
        const a = dir * (hash(i, 41) - .5) * 2.2 + (dir < 0 ? Math.PI : 0);
        const d0 = 26 + ease(t) * 40, d1 = d0 + 22 * (1 - t);
        ctx.globalAlpha = 1 - t;
        streak(ctx, e.x + Math.cos(a) * d0 * big, e.y + Math.sin(a) * d0 * big, e.x + Math.cos(a) * d1 * big, e.y + Math.sin(a) * d1 * big, 3);
      }
      burst(el, 43, { n: n(12), speed: [80, 260], life: .5, gravity: 120, drag: .25 }, (px, py, k) => {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#ffffff';
        dot(ctx, px, py, 2.8 * (1 - k * .5));
      }, e.x, e.y);
      break;
    }
    case 'tae-fur': {
      // The warren closes: a few white tufts of fur drift down where it was.
      for (let i = 0, m = n(10); i < m; i++) {
        const k = clamp((el - hash(i, 51) * .2) / (e.max * .9), 0, 1);
        if (k <= 0) continue;
        const x = e.x + (hash(i, 52) - .5) * r * 2 + Math.sin(el * 3 + i) * 10;
        const y = e.y - 20 * hash(i, 53) + k * 110;
        ctx.globalAlpha = (1 - k) * .9;
        ctx.fillStyle = i % 4 ? '#ffffff' : '#f4dbe2';
        dot(ctx, x, y, 2.6 + hash(i, 54) * 1.6);
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
  return true;
}
