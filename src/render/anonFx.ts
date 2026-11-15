import type { Effect, Projectile } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import { clamp } from '../game/constants.ts';
import { TAU, burst, confetti, glow, hash, sparkle } from './fxParticles.ts';

/* 千早爱音 — 「想闪闪发光的伪阳角」。粉 #FF8899 + 白高光 + 一点香槟金；闪光灯、自拍滤镜闪粉、偶像光斑。
   No dark outlines and no floating text: glossy shapes come from cached stamps, glows from the shared glow
   stamp, particles are stateless bursts. Registers:
     J / K      anon-swing      a soft pink crescent and a pinch of glitter (more on a clean hit)
     U 羽丘跑女  anon-dust / anon-streak / anon-step / anon-skid / anon-pop   heart dust, hair streak, sparkly steps
     I C和弦     anon-strum / anon-note-pop + the 'chord' shot              strum rings, glossy notes on a ribbon
     O 多夸夸我嘛  anon-flash + the 'heart' shot + the 'anon-light' 定身 look   selfie flash, glossy heart, heart bubble
     L 不会再逃避了 anon-spot / anon-arc / anon-fling / anon-hitpop / anon-finale  spotlight, guitar arc, MyGO confetti
   Busiest moment: the finale, ~40 particles (half on lite). */

export const ANON_BACK: readonly string[] = ['anon-streak', 'anon-spot', 'anon-arc'];

const PINK = '#FF8899';
const HOT = '#ff5f96';
const BLUSH = '#ffc4d4';
const GOLD = '#ffe3a3';
const PINK_RGB = '255,136,153';
const BLUSH_RGB = '255,196,212';
const WHITE_RGB = '255,255,255';
/** MyGO!!!!! 五人代表色：灯、爱音、乐奈、爽世、立希。 */
const MYGO = ['#77BBDD', '#FF8899', '#77DD77', '#FFDD88', '#7777AA'] as const;
const GLITTER = ['#ffffff', BLUSH, GOLD, PINK] as const;

const n = (full: number, lite: boolean) => (lite ? Math.ceil(full / 2) : full);
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);

/* ---- cached glossy stamps ---- */

type Cv = HTMLCanvasElement;
const stamps = new Map<string, Cv | null>();
function stampOf(key: string, px: number, paint: (g: CanvasRenderingContext2D, s: number) => void): Cv | null {
  if (stamps.has(key)) return stamps.get(key) ?? null;
  let c: Cv | null = null;
  if (typeof document !== 'undefined') {
    c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    if (g) paint(g, px); else c = null;
  }
  stamps.set(key, c);
  return c;
}

/** Heart centred on x, y; about 2s wide, from y - .75s to y + .85s. */
function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * .85);
  ctx.bezierCurveTo(x - s * 1.25, y + s * .05, x - s * .95, y - s * .95, x, y - s * .42);
  ctx.bezierCurveTo(x + s * .95, y - s * .95, x + s * 1.25, y + s * .05, x, y + s * .85);
  ctx.closePath();
}
function tinyHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  if (!(s > .6)) return;
  heartPath(ctx, x, y, s);
  ctx.fill();
}

const HEART_PX = 128;
/** The glossy heart: blush-to-hot gradient body, soft white rim, one highlight. No dark line anywhere. */
function heartStamp(): Cv | null {
  return stampOf('heart', HEART_PX, (g, px) => {
    const m = px / 2, s = 44;
    const gr = g.createLinearGradient(0, m - s, 0, m + s);
    gr.addColorStop(0, '#ffc0d4');
    gr.addColorStop(.45, '#ff7aa8');
    gr.addColorStop(1, '#ec4a86');
    heartPath(g, m, m, s);
    g.fillStyle = gr;
    g.fill();
    g.lineJoin = 'round';
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(255,255,255,.9)';
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.88)';
    g.beginPath(); g.ellipse(m - s * .48, m - s * .36, s * .24, s * .13, -.65, 0, TAU); g.fill();
    g.beginPath(); g.arc(m - s * .16, m - s * .5, s * .06, 0, TAU); g.fill();
  });
}
const NOTE_PX = 128;
/** The glossy eighth note, same palette as the heart. */
function noteStamp(): Cv | null {
  return stampOf('note', NOTE_PX, (g, px) => {
    g.translate(px / 2, px / 2);
    const gr = g.createLinearGradient(0, -46, 0, 40);
    gr.addColorStop(0, '#ffc0d4');
    gr.addColorStop(1, '#ec4a86');
    g.beginPath();
    g.ellipse(-8, 26, 21, 14, -.45, 0, TAU);
    g.moveTo(6, 26);
    g.rect(5, -44, 9, 70);
    g.moveTo(14, -44);
    g.bezierCurveTo(26, -40, 40, -26, 32, -4);
    g.bezierCurveTo(30, -18, 22, -24, 14, -24);
    g.closePath();
    g.fillStyle = gr;
    g.fill();
    g.lineJoin = 'round';
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,.85)';
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.beginPath(); g.ellipse(-15, 21, 7, 4, -.5, 0, TAU); g.fill();
  });
}
const STAR_PX = 96;
/** A soft five-point star, white core to champagne edge. */
function starStamp(): Cv | null {
  return stampOf('star', STAR_PX, (g, px) => {
    const m = px / 2, R = m - 4, r = R * .46;
    const gr = g.createRadialGradient(m, m, 0, m, m, R);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(.55, '#fff3d6');
    gr.addColorStop(1, '#ffc48a');
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R;
      const x = m + Math.cos(a) * rr, y = m + Math.sin(a) * rr;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
    g.fillStyle = gr;
    g.fill();
  });
}
function drawStamp(ctx: CanvasRenderingContext2D, c: Cv, x: number, y: number, size: number, rot = 0): void {
  if (!rot) { ctx.drawImage(c, x - size / 2, y - size / 2, size, size); return; }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.drawImage(c, -size / 2, -size / 2, size, size);
  ctx.restore();
}
/** Glossy heart about `s` half-wide. */
function glossyHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot = 0): boolean {
  const c = heartStamp();
  if (!c) return false;
  drawStamp(ctx, c, x, y, s * 2.9, rot);
  return true;
}
function glossyNote(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot = 0): boolean {
  const c = noteStamp();
  if (!c) return false;
  drawStamp(ctx, c, x, y, size, rot);
  return true;
}
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0): void {
  const c = starStamp();
  if (c) drawStamp(ctx, c, x, y, r * 2.2, rot);
}

/** A pinch of glitter: sparkles and dots in the four glitter colours. */
function glitter(ctx: CanvasRenderingContext2D, t: number, seed: number, count: number, x: number, y: number,
  speed: [number, number], life: number, angle?: number, spread?: number, gravity = 120, size = 6): void {
  burst(t, seed, { n: count, speed, life, gravity, drag: .3, angle, spread }, (px, py, k, i) => {
    ctx.globalAlpha = (1 - k) * (.75 + .25 * Math.sin(t * 40 + i));
    ctx.fillStyle = GLITTER[i % GLITTER.length];
    const r = size * (1 - k * .5) * (.6 + hash(i, seed + 7) * .6);
    if (i % 3 === 2) { ctx.beginPath(); ctx.arc(px, py, r * .35, 0, TAU); ctx.fill(); }
    else sparkle(ctx, px, py, r);
  }, x, y);
}

/* ---- shots ---- */

/** I C和弦 and O 多夸夸我嘛's flights. True when drawn here. */
export function drawAnonShot(ctx: CanvasRenderingContext2D, p: Projectile, lite = false): boolean {
  if (p.fx === 'chord') return drawChord(ctx, p, lite);
  if (p.fx === 'heart') return drawHeartShot(ctx, p, lite);
  return false;
}

function drawChord(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean): boolean {
  if (!noteStamp()) return false;
  const pts = p.trail;
  const fade = clamp(p.life / .25, 0, 1);
  ctx.save();
  ctx.lineCap = 'round';
  // A tapered ribbon, pink at the tail to blush-white at the note.
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1], b = i < pts.length ? pts[i] : p;
    const k = i / pts.length;
    ctx.globalAlpha = fade * k * .45;
    ctx.strokeStyle = k > .6 ? BLUSH : PINK;
    ctx.lineWidth = 2 + k * 9;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // Glitter shed along the way.
  if (!lite) {
    for (let i = 0; i < 3 && pts.length > 3; i++) {
      const j = Math.floor(hash(i, Math.floor(p.age * 10)) * (pts.length - 1));
      const q = pts[j];
      ctx.globalAlpha = fade * (.4 + .6 * (j / pts.length)) * (.5 + .5 * Math.sin(p.age * 30 + i * 2));
      ctx.fillStyle = GLITTER[i];
      sparkle(ctx, q.x + Math.sin(i * 5 + p.age * 7) * 6, q.y + Math.cos(i * 3 + p.age * 6) * 6, 4.5);
    }
  }
  const size = p.size * 1.3;
  ctx.globalAlpha = fade * .45;
  glow(ctx, p.x, p.y, size * .55, PINK_RGB);
  ctx.globalAlpha = fade;
  glossyNote(ctx, p.x, p.y, size, Math.sin(p.age * 9 + p.x * .01) * .22);
  ctx.restore();
  return true;
}

function drawHeartShot(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean): boolean {
  if (!heartStamp()) return false;
  const fade = clamp(p.life / .25, 0, 1) * clamp(p.age / .06, 0, 1);
  const s = p.size * .44;
  ctx.save();
  // Little hearts left behind, shrinking.
  ctx.fillStyle = BLUSH;
  const step = lite ? 3 : 2;
  for (let i = 0; i < p.trail.length; i += step) {
    const q = p.trail[i], k = (i + 1) / p.trail.length;
    ctx.globalAlpha = fade * k * .5;
    tinyHeart(ctx, q.x, q.y + Math.sin(i * 1.7 + p.age * 6) * 4, s * .28 * k);
  }
  // A heartbeat: a quick double pulse each half second.
  const ph = (p.age * 2) % 1;
  const beat = Math.max(Math.exp(-(((ph - .1) / .06) ** 2)), .6 * Math.exp(-(((ph - .3) / .06) ** 2)));
  const bob = Math.sin(p.age * 7) * 3;
  ctx.globalAlpha = fade * (.35 + beat * .2);
  glow(ctx, p.x, p.y + bob, s * (2.1 + beat * .4), PINK_RGB);
  ctx.globalAlpha = fade;
  glossyHeart(ctx, p.x, p.y + bob, s * (1 + beat * .12), Math.sin(p.age * 3) * .14);
  // Three motes circling it.
  for (let i = 0; i < 3; i++) {
    const a = p.age * 4.5 + i * TAU / 3;
    const x = p.x + Math.cos(a) * s * 1.55, y = p.y + bob + Math.sin(a) * s * .8;
    ctx.globalAlpha = fade * (Math.sin(a) > -.2 ? 1 : .45);
    ctx.fillStyle = i ? '#ffffff' : GOLD;
    sparkle(ctx, x, y, 5 + Math.sin(p.age * 12 + i) * 1.5);
  }
  ctx.restore();
  return true;
}

/* ---- the 定身 look: 'anon-light' (多夸夸我嘛) ---- */

function bodyH(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
/** The heart bubble round the whole body. `crack` 0 whole, 1 cracked (one of the two shake-off hits taken). */
function bubble(ctx: CanvasRenderingContext2D, x: number, feet: number, h: number, t: number, alpha: number, crack: number, scale = 1): void {
  const S = h * .42 * scale * (1 + Math.sin(t * 3) * .015);
  ctx.save();
  ctx.translate(x, feet - h * .47);
  ctx.scale(1, 1.4);
  ctx.globalAlpha = alpha * .16;
  heartPath(ctx, 0, 0, S);
  ctx.fillStyle = '#ff9cc0';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha * .3;
  ctx.lineWidth = 7;
  ctx.strokeStyle = PINK;
  ctx.stroke();
  ctx.globalAlpha = alpha * .8;
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  // The glass highlight on the upper-left lobe.
  ctx.globalAlpha = alpha * .55;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(-S * .5, -S * .5, S * .2, S * .07, -.7, 0, TAU); ctx.fill();
  if (crack > 0) {
    // One white fracture running in from the right lobe, a second branch off it.
    ctx.globalAlpha = alpha * .9;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(S * .9, -S * .3); ctx.lineTo(S * .58, -S * .16); ctx.lineTo(S * .64, S * .02); ctx.lineTo(S * .34, S * .14);
    ctx.moveTo(S * .64, S * .02); ctx.lineTo(S * .8, S * .2);
    ctx.stroke();
  }
  ctx.restore();
}
export function auraAnonLight(ctx: CanvasRenderingContext2D, f: Fighter, _left: number, t: number, lite: boolean): void {
  const h = bodyH(f);
  ctx.save();
  bubble(ctx, f.x, f.y, h, t, 1, f.rootHits > 0 ? 1 : 0);
  // Glitter rising slowly inside.
  for (let i = 0, m = n(6, lite); i < m; i++) {
    const k = (t * .45 + hash(i, f.id)) % 1;
    ctx.globalAlpha = Math.sin(k * Math.PI) * .85;
    ctx.fillStyle = GLITTER[i % GLITTER.length];
    sparkle(ctx, f.x + (hash(i, 3) - .5) * h * .5 + Math.sin(k * 6 + i) * 5, f.y - h * (.12 + k * .7), 3.5 + hash(i, 4) * 2.5);
  }
  ctx.restore();
}
export function applyAnonLight(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  const h = e.radius ?? 181;
  ctx.save();
  const k = ease(age / .25);
  bubble(ctx, e.x, e.y, h, age, 1 - span(age, .3, .6), 0, 1.35 - .35 * k);
  ctx.globalAlpha = (1 - span(age, 0, .35)) * .6;
  glow(ctx, e.x, e.y - h * .5, h * .7, WHITE_RGB);
  burst(age, 61, { n: 10, speed: [120, 240], life: .6, gravity: -50, drag: .35 }, (x, y, q, i) => {
    ctx.globalAlpha = 1 - q;
    ctx.fillStyle = i % 2 ? PINK : '#ffffff';
    tinyHeart(ctx, x, y, 6 * (1 - q * .4));
  }, e.x, e.y - h * .5);
  ctx.restore();
}
export function expireAnonLight(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  const h = e.radius ?? 181;
  ctx.save();
  // The bubble pops: heart shards tumble out and fall, a ring and a breath of light.
  const k = ease(age / .2);
  ctx.globalAlpha = (1 - k) * .7;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(e.x, e.y - h * .5, h * (.35 + k * .35), h * (.5 + k * .3), 0, 0, TAU); ctx.stroke();
  burst(age, 67, { n: 12, speed: [160, 320], life: .7, gravity: 520, drag: .5 }, (x, y, q, i) => {
    ctx.globalAlpha = 1 - q;
    ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ff9cc0' : BLUSH;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(q * 6 * (i % 2 ? 1 : -1));
    // A half-heart shard.
    ctx.beginPath();
    ctx.moveTo(0, 6); ctx.bezierCurveTo(-8, 1, -6, -6, 0, -3); ctx.lineTo(1, 2); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, e.x, e.y - h * .5);
  glitter(ctx, age, 68, 8, e.x, e.y - h * .5, [80, 200], .5, undefined, undefined, 60, 6);
  ctx.restore();
}

/* ---- effects ---- */

export function drawAnonFx(ctx: CanvasRenderingContext2D, e: Effect, lite = false): boolean {
  if (!e.type.startsWith('anon-') || e.type.includes('@')) return false;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    /* -- J / K -- */
    case 'anon-swing': {
      const R = (e.radius ?? 48) * (e.heavy ? 1.45 : 1.3);
      const t = el / e.max;
      const reveal = ease(t / .35);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.rotate(e.heavy ? .25 : -.1);
      // The crescent sweeps open, then thins away.
      const a0 = -1.05, a1 = a0 + 2.1 * reveal;
      ctx.globalAlpha = (1 - span(t, .45, 1)) * .85;
      const gr = ctx.createLinearGradient(-R * .5, 0, R, 0);
      gr.addColorStop(0, 'rgba(255,136,153,0)');
      gr.addColorStop(.6, 'rgba(255,170,195,.75)');
      gr.addColorStop(1, 'rgba(255,255,255,.95)');
      ctx.fillStyle = gr;
      const thin = R * (.2 - .1 * t);
      ctx.beginPath();
      ctx.arc(-R * .35, 0, R, a0, a1);
      ctx.arc(-R * .35 - thin, 0, R - thin * .4, a1, a0, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // Glitter off the tip; a clean hit throws twice as much and two little hearts.
      const tipX = e.x + dir * R * .6, tipY = e.y;
      const count = n((e.hit ? 12 : 6) + (e.heavy ? 3 : 0), lite);
      glitter(ctx, el, e.heavy ? 23 : 21, count, tipX, tipY, [90, e.hit ? 260 : 170], e.max * 1.1,
        dir > 0 ? 0 : Math.PI, 2.4, 90, e.heavy ? 7 : 5.5);
      if (e.hit) {
        burst(el, 29, { n: 2, speed: [80, 140], life: e.max * 1.2, gravity: -80, angle: -Math.PI / 2, spread: 1.6 }, (x, y, q) => {
          ctx.globalAlpha = 1 - q;
          ctx.fillStyle = q < .5 ? '#ffffff' : BLUSH;
          tinyHeart(ctx, x, y, 5);
        }, tipX, tipY);
      }
      break;
    }

    /* -- U 羽丘跑女 -- */
    case 'anon-dust': {
      // The kick-off: a puff of pink-white dust and a spray of little hearts behind her heels.
      const k = el / e.max;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = (1 - k) * .5;
        glow(ctx, e.x - dir * (10 + i * 22 + k * 40), e.y - 10 - i * 6, 22 + k * 36 - i * 4, i ? BLUSH_RGB : WHITE_RGB);
      }
      burst(el, 31, { n: n(8, lite), speed: [140, 280], life: e.max, gravity: 300, drag: .3, angle: dir > 0 ? Math.PI + .5 : -.5, spread: 1.4 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i % 2 ? '#ffffff' : PINK;
        tinyHeart(ctx, x, y, 5.5 * (1 - q * .4));
      }, e.x - dir * 14, e.y - 12);
      break;
    }
    case 'anon-streak': {
      // Her hair streaming out behind: a tapered band from where she set off to where she is.
      const x0 = e.x, x1 = e.x + (e.tx ?? 0);
      if (Math.abs(x1 - x0) < 4) break;
      const fade = clamp(e.life / e.max, 0, 1);
      const y = e.y;
      const gr = ctx.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, 'rgba(255,136,153,0)');
      gr.addColorStop(.7, 'rgba(255,150,180,.45)');
      gr.addColorStop(1, 'rgba(255,230,238,.75)');
      ctx.globalAlpha = fade;
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.quadraticCurveTo((x0 + x1) / 2, y - 22, x1, y - 18);
      ctx.lineTo(x1, y + 18);
      ctx.quadraticCurveTo((x0 + x1) / 2, y + 14, x0, y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = fade * .7;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0 + (x1 - x0) * .4, y - 2);
      ctx.quadraticCurveTo(x0 + (x1 - x0) * .75, y - 8, x1, y - 4);
      ctx.stroke();
      for (let i = 0, m = n(8, lite); i < m; i++) {
        const u = .25 + hash(i, 5) * .75;
        ctx.globalAlpha = fade * (.5 + .5 * Math.sin(el * 25 + i * 2)) * u;
        ctx.fillStyle = GLITTER[i % GLITTER.length];
        sparkle(ctx, x0 + (x1 - x0) * u, y + (hash(i, 6) - .5) * 30 - el * 12, 3 + hash(i, 7) * 3);
      }
      break;
    }
    case 'anon-step': {
      // A Mary Jane hits the floor: a few stars hop up behind it.
      glitter(ctx, el, 37 + (e.n ?? 0), n(4, lite), e.x, e.y - 4, [70, 150], e.max,
        dir > 0 ? -Math.PI * .75 : -Math.PI * .25, 1, 260, 5);
      break;
    }
    case 'anon-skid': {
      // The stop: a bright scuff along the floor and a fan of sparkle forward.
      const k = el / e.max;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(1, .22);
      ctx.globalAlpha = (1 - k) * .55;
      glow(ctx, -dir * 30, 0, 70 + k * 30, BLUSH_RGB);
      ctx.restore();
      glitter(ctx, el, 41, n(10, lite), e.x, e.y - 6, [120, 260], e.max, dir > 0 ? -.35 : Math.PI + .35, 1.1, 380, 6);
      break;
    }
    case 'anon-pop': {
      // A camera-flash pop on contact and a handful of hearts.
      const k = el / e.max;
      ctx.globalAlpha = (1 - k) ** 2 * .9;
      glow(ctx, e.x, e.y, 30 + k * 40, WHITE_RGB);
      ctx.globalAlpha = (1 - k) * .7;
      ctx.strokeStyle = BLUSH;
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(e.x, e.y, 14 + ease(k) * 46, 0, TAU); ctx.stroke();
      burst(el, 43, { n: n(8, lite), speed: [130, 260], life: e.max, gravity: 160, drag: .3 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i % 3 ? PINK : '#ffffff';
        tinyHeart(ctx, x, y, 6 * (1 - q * .4));
      }, e.x, e.y);
      break;
    }

    /* -- I C和弦 -- */
    case 'anon-strum': {
      // Each strum breathes out a soft ring from the guitar body; every fourth one sparkles.
      const big = (e.n ?? 0) > 0;
      const k = el / e.max;
      ctx.globalAlpha = (1 - k) * (big ? .5 : .32);
      glow(ctx, e.x, e.y, (big ? 46 : 30) * (.6 + k * .6), PINK_RGB);
      ctx.globalAlpha = (1 - k) * (big ? .8 : .5);
      ctx.strokeStyle = big ? '#ffffff' : BLUSH;
      ctx.lineWidth = (big ? 5 : 3.5) * (1 - k) + .8;
      ctx.beginPath(); ctx.ellipse(e.x + dir * k * 10, e.y, 14 + ease(k) * (big ? 70 : 40), 10 + ease(k) * (big ? 52 : 30), 0, 0, TAU); ctx.stroke();
      if (big) {
        ctx.globalAlpha = 1 - span(k, .3, 1);
        star(ctx, e.x + dir * 8, e.y - 6, 16 * (1 - k * .3) * (.6 + ease(k / .25) * .4), k * 2);
        glitter(ctx, el, 47 + (e.n ?? 0), n(6, lite), e.x, e.y, [100, 200], e.max, undefined, undefined, 40, 5);
      }
      break;
    }
    case 'anon-note-pop': {
      // A note lands and bursts into three hearts and a sparkle.
      const k = el / e.max;
      ctx.globalAlpha = (1 - k) * .5;
      glow(ctx, e.x, e.y, 20 + k * 20, PINK_RGB);
      ctx.globalAlpha = 1 - span(k, 0, .5);
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x, e.y, 12 * (1 - k));
      burst(el, 53, { n: 3, speed: [90, 160], life: e.max, gravity: -60, angle: -Math.PI / 2, spread: 2.2, drag: .3 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i === 1 ? '#ffffff' : PINK;
        tinyHeart(ctx, x, y, 5 * (1 - q * .3));
      }, e.x, e.y);
      break;
    }

    /* -- O 多夸夸我嘛 -- */
    case 'anon-flash': {
      // 自拍: the phone flash goes off at her face, a lens flare streaks across, beauty-filter sparkles twinkle on her.
      const k = el / e.max;
      const h = e.radius ?? 181;
      const flash = Math.exp(-el * 9);
      ctx.globalAlpha = flash * .85;
      glow(ctx, e.x, e.y, 70 + k * 40, WHITE_RGB);
      // The streak: a thin horizontal bar with a pink fringe.
      ctx.globalAlpha = flash * .8;
      const w = 90 + ease(k / .4) * 170;
      const bar = ctx.createLinearGradient(e.x - w, 0, e.x + w, 0);
      bar.addColorStop(0, 'rgba(255,200,220,0)');
      bar.addColorStop(.5, 'rgba(255,255,255,1)');
      bar.addColorStop(1, 'rgba(255,200,220,0)');
      ctx.fillStyle = bar;
      ctx.fillRect(e.x - w, e.y - 2, w * 2, 4);
      // Flare ghosts strung along a diagonal, the classic lens look.
      const ghosts = ['255,170,210', '200,180,255', '160,230,255', '255,230,170'];
      for (let i = 0; i < ghosts.length; i++) {
        const u = (i + 1) * .32;
        ctx.globalAlpha = flash * .45;
        glow(ctx, e.x - dir * u * 90, e.y + u * 55, 8 + i * 4, ghosts[i]);
      }
      // Filter sparkles all over her body, popping in one after another.
      for (let i = 0, m = n(10, lite); i < m; i++) {
        const t0 = hash(i, 71) * .25;
        const life = span(el, t0, t0 + .08) * (1 - span(el, t0 + .25, e.max));
        if (life <= 0) continue;
        const x = e.x - dir * 8 + (hash(i, 72) - .5) * h * .6;
        const y = e.y - h * .12 + hash(i, 73) * h * .85;
        ctx.globalAlpha = life;
        ctx.fillStyle = GLITTER[i % GLITTER.length];
        sparkle(ctx, x, y, (4 + hash(i, 74) * 5) * (.8 + .2 * Math.sin(el * 30 + i)));
      }
      break;
    }

    /* -- L 不会再逃避了 -- */
    case 'anon-spot': {
      // A soft stage spotlight falls on her: a pink-white cone and a pool of light at her feet.
      const k = clamp(Math.min(el / .15, e.life / .25), 0, 1);
      const top = e.y - 560;
      const cone = ctx.createLinearGradient(0, top, 0, e.y);
      cone.addColorStop(0, 'rgba(255,220,232,0)');
      cone.addColorStop(.55, 'rgba(255,214,228,.16)');
      cone.addColorStop(1, 'rgba(255,236,242,.3)');
      ctx.globalAlpha = k;
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(e.x - 40, top); ctx.lineTo(e.x + 40, top);
      ctx.lineTo(e.x + 150, e.y); ctx.lineTo(e.x - 150, e.y);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(1, .2);
      ctx.globalAlpha = k * .55;
      glow(ctx, 0, 0, 190, BLUSH_RGB);
      ctx.restore();
      for (let i = 0, m = n(7, lite); i < m; i++) {
        const q = (el * .5 + hash(i, 81)) % 1;
        ctx.globalAlpha = k * Math.sin(q * Math.PI) * .8;
        ctx.fillStyle = i % 2 ? '#ffffff' : GOLD;
        sparkle(ctx, e.x + (hash(i, 82) - .5) * 60 * (1 + q * 2), top + 140 + q * (e.y - top - 160), 3 + hash(i, 83) * 2.5);
      }
      break;
    }
    case 'anon-arc': {
      // The guitar's sweep left as a luminous band behind its body (the spin guitar's pivot and length).
      const u = clamp((el - .28) / .7, 0, 1);
      const out = clamp(1 - (el - .98) / .2, 0, 1);
      if (u <= 0 || out <= 0) break;
      const ang = u * Math.PI * 4;
      const cx = e.x, cy = e.y - 96;
      const segs = lite ? 5 : 10;
      const tail = 1.6 * Math.min(1, u * 6);
      ctx.lineCap = 'butt';
      for (let j = 0; j < segs; j++) {
        const q0 = j / segs, q1 = (j + 1) / segs;
        ctx.globalAlpha = out * q1 * .42;
        ctx.strokeStyle = q1 > .7 ? BLUSH : PINK;
        ctx.lineWidth = 34 + q1 * 46;
        ctx.beginPath(); ctx.arc(cx, cy, 190, ang - tail * (1 - q0), ang - tail * (1 - q1) + .02); ctx.stroke();
      }
      ctx.globalAlpha = out * .75;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, 228, ang - tail * .45, ang); ctx.stroke();
      break;
    }
    case 'anon-fling': {
      // A note thrown off the spinning guitar along its tangent, tumbling and fading.
      const g = 260;
      const x = e.x + (e.vx ?? 0) * el;
      const y = e.y + (e.vy ?? 0) * el + .5 * g * el * el;
      const k = el / e.max;
      ctx.globalAlpha = 1 - span(k, .5, 1);
      if ((e.n ?? 0) % 3 === 2) {
        ctx.fillStyle = (e.n ?? 0) % 2 ? '#ffffff' : BLUSH;
        tinyHeart(ctx, x, y, 7);
      } else {
        glossyNote(ctx, x, y, 30 * (1 - k * .3), el * 7 * ((e.n ?? 0) % 2 ? 1 : -1));
      }
      break;
    }
    case 'anon-hitpop': {
      // Each spin hit: a star bursts on them with a pink shockwave, a little bigger every hit.
      const k = el / e.max;
      const grow = 1 + (e.n ?? 0) * .12;
      ctx.globalAlpha = (1 - k) * .6;
      glow(ctx, e.x, e.y, (34 + k * 30) * grow, PINK_RGB);
      ctx.globalAlpha = (1 - k) * .8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(e.x, e.y, (16 + ease(k) * 56) * grow, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1 - span(k, .35, 1);
      star(ctx, e.x, e.y, 20 * grow * (.5 + ease(k / .3) * .5), (e.n ?? 0) * .7 + k * 1.5);
      glitter(ctx, el, 91 + (e.n ?? 0), n(6, lite), e.x, e.y, [110, 230], e.max, undefined, undefined, 80, 6);
      break;
    }
    case 'anon-finale': {
      // The last hit: a white bloom, two shock rings, hearts and stars thrown out like petals,
      // then MyGO!!!!! five-colour confetti raining down.
      const k = el / e.max;
      ctx.globalAlpha = Math.exp(-el * 7) * .9;
      glow(ctx, e.x, e.y, 90 + ease(k / .3) * 90, WHITE_RGB);
      for (let r = 0; r < 2; r++) {
        const q = span(el, r * .08, .5 + r * .08);
        if (q <= 0 || q >= 1) continue;
        ctx.globalAlpha = (1 - q) * .8;
        ctx.strokeStyle = r ? PINK : '#ffffff';
        ctx.lineWidth = 7 * (1 - q) + 1;
        ctx.beginPath(); ctx.arc(e.x, e.y, 30 + ease(q) * (150 + r * 50), 0, TAU); ctx.stroke();
      }
      burst(el, 101, { n: n(12, lite), speed: [260, 520], life: .8, gravity: 220, drag: .22 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        if (i % 2) star(ctx, x, y, 11 * (1 - q * .4), q * 4 + i);
        else glossyHeart(ctx, x, y, 8 * (1 - q * .3), Math.sin(q * 5 + i) * .4);
      }, e.x, e.y);
      burst(el, 103, { n: n(26, lite), speed: [220, 460], life: e.max, gravity: 420, drag: .4, angle: -Math.PI / 2, spread: 2.6 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - span(q, .6, 1);
        ctx.fillStyle = MYGO[i % MYGO.length];
        confetti(ctx, x + Math.sin(q * 9 + i) * 8, y, 9, 5, q * 9 + i, Math.cos(q * 14 + i * 2));
      }, e.x, e.y - 20);
      glitter(ctx, el, 107, n(10, lite), e.x, e.y, [80, 260], .7, undefined, undefined, 60, 7);
      break;
    }
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  return true;
}
