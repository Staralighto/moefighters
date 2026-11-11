import type { Effect, Projectile } from '../game/game.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { crescent, floorRing, gladiolus, moonSparkle as sparkle, simpleSeal } from './sakikoFx.ts';

/* 丰川瑞穗 — 祥子's mother. She is drawn with her daughter's own shapes (sakikoFx.ts: the crescent, the bold
   floor ring, the octagram seal, the gladiolus petal, the four-point glint) in her daughter's night blue and
   moon silver — but where 祥子 is cold and absolute, she is the warm end of the same palette: candle gold and a
   pale rose, soft light instead of pressure, a strip of starry sky instead of a blood moon. One bold subject per
   beat. Flat fills everywhere except her moonlight, which uses a handful of cached unit gradients; no shadowBlur. */

/** Painted under every body. */
export const MIZUHO_BACK: readonly string[] = ['mizuho-halo', 'mizuho-pray', 'mizuho-wish'];
/** Screen space, behind every body. */
export const MIZUHO_SCREEN_BACK: readonly string[] = ['mizuho-night'];

const TAU = Math.PI * 2;
const MOON = '#e8eefc';
const ICE = '#bcd4ff';
const BLUE = '#7799CC';
const GOLD = '#e8c873';
const WARM = '#ffe9c4';
const ROSE = '#ffc9d8';
const NIGHT = '#0b1230';

const frac = (x: number) => x - Math.floor(x);
const hash = (i: number, k = 0) => frac(Math.sin(i * 12.9898 + k * 78.233 + 4.1) * 43758.5453);
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const bump = (t: number) => Math.sin(Math.PI * clamp(t, 0, 1));

/** The doll is its own picture so it can be swapped: public/sprites/mizuho/doll.png, 256×256, centred. */
const DOLL_SRC = '/sprites/mizuho/doll.png';
/** Looks a keyed picture up by path; null while it loads. Handed in by fx.ts, which owns the image cache. */
export type MizuhoArt = (src: string) => CanvasImageSource | null;

/* Moonlight is the one place she uses gradients: 化作星星 answers 血月的奏鸣, and where the blood moon is hard
   red light and a clock ring, hers has no line in it at all. Each gradient is built once per context at unit
   size and placed with scale; fades ride on globalAlpha, so a frame allocates none. */
type GradKey = 'halo' | 'pool' | 'disc' | 'top' | 'beam' | 'hers' | 'col' | 'wish';
/** `at` is createRadialGradient's six numbers or createLinearGradient's four. Specs are data, so asking for a
 *  gradient allocates nothing once it is built. */
const GRADS: Record<GradKey, { at: readonly number[]; stops: readonly (readonly [number, string])[] }> = {
  halo: { at: [0, 0, .26, 0, 0, 1], stops: [[0, 'rgba(214,228,255,.42)'], [1, 'rgba(214,228,255,0)']] },
  pool: { at: [0, 0, 0, 0, 0, 1], stops: [[0, 'rgba(236,242,255,.62)'], [.5, 'rgba(226,236,255,.26)'], [1, 'rgba(226,236,255,0)']] },
  disc: { at: [0, 0, 0, 0, 0, 1], stops: [[0, '#ffffff'], [.8, '#e6edff'], [.93, 'rgba(226,235,255,.95)'], [1, 'rgba(226,235,255,0)']] },
  top: { at: [0, 0, 0, 1], stops: [[0, 'rgba(5,9,32,.62)'], [1, 'rgba(5,9,32,0)']] },
  beam: { at: [0, 0, 1, 0], stops: [[0, 'rgba(206,224,255,0)'], [.14, 'rgba(206,224,255,.15)'], [1, 'rgba(206,224,255,0)']] },
  hers: { at: [0, 0, 1, 0], stops: [[0, 'rgba(228,238,255,0)'], [.08, 'rgba(228,238,255,.17)'], [.62, 'rgba(228,238,255,.13)'], [.8, 'rgba(228,238,255,.05)'], [1, 'rgba(228,238,255,0)']] },
  col: { at: [-1, 0, 1, 0], stops: [[0, 'rgba(232,240,255,0)'], [.5, 'rgba(232,240,255,.3)'], [1, 'rgba(232,240,255,0)']] },
  wish: { at: [0, 0, 0, 0, 0, 1], stops: [[0, 'rgba(255,233,196,.55)'], [.65, 'rgba(255,233,196,.28)'], [1, 'rgba(255,233,196,0)']] },
};
const paints = new WeakMap<CanvasRenderingContext2D, Partial<Record<GradKey, CanvasGradient>>>();
function grad(ctx: CanvasRenderingContext2D, key: GradKey): CanvasGradient {
  let m = paints.get(ctx);
  if (!m) paints.set(ctx, m = {});
  let g = m[key];
  if (!g) {
    const { at, stops } = GRADS[key];
    g = at.length === 6 ? ctx.createRadialGradient(at[0], at[1], at[2], at[3], at[4], at[5]) : ctx.createLinearGradient(at[0], at[1], at[2], at[3]);
    for (const [o, c] of stops) g.addColorStop(o, c);
    m[key] = g;
  }
  return g;
}
const halo = (ctx: CanvasRenderingContext2D) => grad(ctx, 'halo');
const pool = (ctx: CanvasRenderingContext2D) => grad(ctx, 'pool');

/* Per-frame constants, hoisted so a frame builds no arrays. */
const SIDES = [-1, 1] as const;
const MARIA = [[-.3, -.1, .36], [.28, -.32, .24], [.12, .36, .28]] as const;
const HER_RAYS = [185, 120, 62] as const;
/** The night's small stars, rolled once: x, y, radius, in four twinkle groups so the sky is four fills. */
const SKY_GROUPS = 4, SKY_PER = 11;
const SKY = new Float32Array(SKY_GROUPS * SKY_PER * 3);
for (let i = 0; i < SKY_GROUPS * SKY_PER; i++) {
  const y = hash(i, 1) * H * .5;
  SKY[i * 3] = hash(i) * W;
  SKY[i * 3 + 1] = y;
  SKY[i * 3 + 2] = (.8 + hash(i, 3) * 1.5) * (1 - y / (H * .75));
}

/** A soft round patch of moonlight at the origin, `rx` wide and `ry` tall. */
function glowAt(ctx: CanvasRenderingContext2D, g: CanvasGradient, rx: number, ry = rx): void {
  ctx.save();
  ctx.scale(rx, ry);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
  ctx.restore();
}
/** A ray from the origin along +x, `len` long and `half` wide at its far end, in a unit gradient. */
function ray(ctx: CanvasRenderingContext2D, g: CanvasGradient, ang: number, len: number, half: number): void {
  ctx.save();
  ctx.rotate(ang);
  ctx.scale(len, len);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1, -half / len); ctx.lineTo(1, half / len); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * .9);
  ctx.bezierCurveTo(x - s * 1.5, y - s * .2, x - s * .6, y - s * 1.2, x, y - s * .35);
  ctx.bezierCurveTo(x + s * .6, y - s * 1.2, x + s * 1.5, y - s * .2, x, y + s * .9);
  ctx.fill();
}

/** The doll she left 祥子: bonnet, navy dress with a gold hem, a ribbon in 祥子's blue. Origin at its waist. */
function doll(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#243361';
  ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, -6); ctx.lineTo(15, 20); ctx.lineTo(-15, 20); ctx.closePath(); ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.fillRect(-15, 17, 30, 3);
  ctx.fillStyle = '#f6f1ea';
  ctx.beginPath(); ctx.ellipse(0, -6, 8, 3.5, 0, 0, TAU); ctx.fill();
  ctx.fillRect(-10, 2, 4, 9); ctx.fillRect(6, 2, 4, 9);
  ctx.fillRect(-7, 20, 4, 6); ctx.fillRect(3, 20, 4, 6);
  ctx.fillStyle = '#e9d9a8';
  ctx.beginPath(); ctx.arc(0, -17, 11, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fbeee4';
  ctx.beginPath(); ctx.arc(0, -15, 8, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f6f1ea';
  ctx.beginPath(); ctx.arc(0, -19, 11, Math.PI, TAU); ctx.fill();
  ctx.fillStyle = BLUE;
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-7, -11); ctx.lineTo(-7, -3); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(7, -11); ctx.lineTo(7, -3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#243361';
  ctx.beginPath(); ctx.arc(-3, -14, 1.2, 0, TAU); ctx.arc(3, -14, 1.2, 0, TAU); ctx.fill();
}

/* ---------- shots ---------- */

/** `art` is sakiko/shiro.png already keyed, or null while it loads. */
export function drawMizuhoShot(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean, art: CanvasImageSource | null): boolean {
  if (p.fx === 'mizuho-shiro') {
    // 妈妈的小祥: the same 白祥 that 忘却之影 leaves behind, standing as she is drawn — on a crescent that carries
    // her along just above the floor (双月轮舞's moon, lying down like a little boat). She does not pretend to
    // run: the moon moves, she rides. Moonlight and a few petals trail behind.
    const dir = Math.sign(p.vx) || 1;
    const h = 165, R = 50;
    const fade = Math.min(1, p.age / .12, p.life / .15);
    const bob = Math.sin(p.age * 7) * 2.5;
    const deck = FLOOR - 36 + bob;
    ctx.save();
    ctx.translate(p.x, FLOOR);
    // Light on the floor under the moon, and its wake.
    ctx.globalAlpha = fade * .8;
    glowAt(ctx, pool(ctx), 70, 13);
    const wake = lite ? 2 : 4;
    for (let i = 1; i <= wake; i++) {
      ctx.save();
      ctx.translate(-dir * i * 30, deck - FLOOR + 10);
      ctx.globalAlpha = fade * .42 * (1 - i / (wake + 1));
      glowAt(ctx, pool(ctx), 46 - i * 3, 12 - i);
      ctx.restore();
    }
    const n = lite ? 3 : 7;
    for (let i = 0; i < n; i++) {
      const k = frac(p.age * 1.4 + hash(i));
      ctx.globalAlpha = (1 - k) * .7 * fade;
      ctx.fillStyle = i % 2 ? ROSE : MOON;
      gladiolus(ctx, -dir * (40 + k * 130), deck - FLOOR - 6 - hash(i, 1) * h * .5 + k * 22, 13, 4, hash(i, 2) * TAU + k * 3);
    }
    ctx.restore();
    // She stands on the deck, upright, a faint blue rim on her.
    ctx.save();
    ctx.translate(p.x, deck + 16);
    ctx.scale(dir, 1);
    ctx.rotate(.03 + Math.sin(p.age * 7 - .6) * .012);
    ctx.globalAlpha = .9 * fade;
    if (!lite) { ctx.save(); ctx.translate(0, -h * .5); ctx.globalAlpha = .5 * fade; glowAt(ctx, halo(ctx), h * .42, h * .62); ctx.restore(); }
    if (art) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(art, -h / 2, -h, h, h);
    } else {
      ctx.fillStyle = '#e8f0ff';
      ctx.beginPath(); ctx.ellipse(0, -h * .45, h * .16, h * .4, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -h * .86, h * .1, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // The moon-boat over her shoes: horns up, nose a little high.
    ctx.save();
    ctx.translate(p.x, deck);
    ctx.rotate(-dir * .07);
    ctx.globalAlpha = fade * .5;
    glowAt(ctx, halo(ctx), R * 1.9, R * .9);
    ctx.scale(1, .5);
    ctx.rotate(Math.PI / 2);
    ctx.globalAlpha = fade;
    ctx.fillStyle = MOON;
    crescent(ctx, R, .34); ctx.fill();
    ctx.globalAlpha = fade * .55;
    ctx.fillStyle = '#ffffff';
    crescent(ctx, R * .96, .62); ctx.fill();
    ctx.restore();
    // One glint riding the prow.
    ctx.save();
    ctx.translate(p.x + dir * (R + 2), deck - 4);
    ctx.globalAlpha = fade * (.6 + .4 * Math.sin(p.age * 12));
    ctx.fillStyle = GOLD;
    sparkle(ctx, 0, 0, 7);
    ctx.restore();
    return true;
  }
  if (p.fx === 'mizuho-star') {
    // 化作星星: a four-point star on a short gold thread; the last one is larger and wears a second glint.
    const big = p.size > 140;
    const pts = p.trail, n = pts.length;
    ctx.save();
    ctx.lineCap = 'round';
    if (n > 1) {
      // A soft thread of light: one wide faint stroke under one thin bright one (lite: the thin one only).
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.lineTo(p.x, p.y);
      if (!lite) {
        ctx.strokeStyle = MOON;
        ctx.lineWidth = big ? 12 : 8;
        ctx.globalAlpha = .16;
        ctx.stroke();
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = big ? 3 : 2;
      ctx.globalAlpha = .5;
      ctx.stroke();
    }
    ctx.translate(p.x, p.y);
    const r = big ? 24 : 15;
    const tw = 1 + Math.sin(p.age * 14 + (p.wave ?? 0)) * .12;
    ctx.globalAlpha = .9;
    glowAt(ctx, pool(ctx), r * 2.4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = big ? WARM : MOON;
    sparkle(ctx, 0, 0, r * tw);
    ctx.fillStyle = '#ffffff';
    ctx.rotate(Math.PI / 4);
    sparkle(ctx, 0, 0, r * .5 * tw);
    ctx.restore();
    return true;
  }
  return false;
}

/* ---------- effects ---------- */

export function drawMizuhoFx(ctx: CanvasRenderingContext2D, e: Effect, lite: boolean, art?: MizuhoArt): boolean {
  if (!e.type.startsWith('mizuho-')) return false;
  const p = 1 - e.life / e.max;
  const t = e.max - e.life;
  const r = e.radius ?? 100;
  const dir = e.dir ?? 1;
  ctx.save();
  ctx.translate(e.x, e.y);
  switch (e.type) {
    /* ---- U 再抱一会儿 ---- */
    case 'mizuho-arms': {
      // Her arms open: two thin silver moons part to either side of her, like 祥子's swing — but opening.
      const k = ease(p * 1.4);
      ctx.fillStyle = MOON;
      for (const side of SIDES) {
        ctx.save();
        ctx.translate(side * (14 + 30 * k), -r * .56);
        ctx.scale(side, 1);
        ctx.globalAlpha = .8 * bump(p * .9 + .1);
        crescent(ctx, r * .3, .14); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'mizuho-halo': {
      // The hug: 祥子's two moons close into one full moon behind them both, her daughter's seal turning faint
      // inside it, petals circling, a warm pool on the floor. Under the bodies.
      const a = Math.min(1, t / .2, e.life / .3);
      const R = r * .68;
      floorRing(ctx, r * .56, .22, WARM, 3, a * .75, lite);
      floorRing(ctx, r * .36 + Math.sin(t * 4) * 3, .22, GOLD, 1.6, a * .6, true);
      const beat = frac(t * 1.3);
      floorRing(ctx, r * (.56 + .5 * beat), .22, WARM, 2, a * (1 - beat) * .5, true);
      ctx.translate(0, -r * .52);
      ctx.fillStyle = WARM;
      ctx.globalAlpha = a * .1;
      ctx.beginPath(); ctx.arc(0, 0, R * 1.6, 0, TAU); ctx.fill();
      ctx.globalAlpha = a * .13;
      ctx.beginPath(); ctx.arc(0, 0, R * 1.25 * (1 + Math.sin(t * 3) * .03), 0, TAU); ctx.fill();
      ctx.fillStyle = MOON;
      ctx.globalAlpha = a * .22;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      if (t < .4) { const kb = ease(t / .4); floorRing(ctx, R * (.4 + 1.5 * kb), 1, WARM, 7 * (1 - kb) + 1, 1 - kb, lite); }
      floorRing(ctx, R, 1, MOON, 3, a * .75, lite);
      simpleSeal(ctx, R * .8, 1, -t * .35, GOLD, a * .24);
      const close = ease(t / .45);
      for (const side of [0, 1]) {
        ctx.save();
        ctx.rotate(side * Math.PI + t * .9);
        ctx.translate((1 - close) * r * .5, 0);
        ctx.globalAlpha = a * .9;
        ctx.fillStyle = side ? GOLD : MOON;
        crescent(ctx, R, .1); ctx.fill();
        ctx.restore();
      }
      const n = lite ? 6 : 12;
      for (let i = 0; i < n; i++) {
        const an = i / n * TAU + t * 1.4, rad = R * (1.1 + .08 * Math.sin(t * 3 + i));
        ctx.globalAlpha = a * .85;
        ctx.fillStyle = i % 2 ? ROSE : MOON;
        gladiolus(ctx, Math.cos(an) * rad, Math.sin(an) * rad, 17, 5, an + Math.PI / 2);
      }
      break;
    }
    case 'mizuho-warm': {
      // In front of them: glints rising through the hug, a few small hearts among them.
      const a = Math.min(1, t / .2, e.life / .3);
      const n = lite ? 6 : 14;
      for (let i = 0; i < n; i++) {
        const k = frac(t * .75 + hash(i));
        const x = (hash(i, 1) - .5) * r * 1.2 + Math.sin(k * 5 + i) * 6, y = -k * r * 1.25;
        ctx.globalAlpha = a * bump(k) * .95;
        if (i % 5 === 0) { ctx.fillStyle = ROSE; heart(ctx, x, y, 5 + hash(i, 2) * 3); }
        else { ctx.fillStyle = i % 2 ? WARM : '#ffffff'; sparkle(ctx, x, y, 3 + hash(i, 2) * 5); }
      }
      break;
    }
    case 'mizuho-heart': {
      // One beat: a ring breathes out, a heart and a glint rise.
      floorRing(ctx, 16 + 54 * ease(p), 1, ROSE, 2.5 * (1 - p) + .5, (1 - p) * .8, true);
      ctx.globalAlpha = bump(p * .8 + .2);
      ctx.fillStyle = ROSE;
      heart(ctx, ((e.n ?? 0) % 2 ? 12 : -12), -p * 52, 9 + 4 * ease(p * 3));
      ctx.fillStyle = WARM;
      sparkle(ctx, ((e.n ?? 0) % 2 ? -14 : 14), -10 - p * 34, 8 * (1 - p) + 2);
      break;
    }
    /* ---- I 留给你的人偶 ---- */
    case 'mizuho-doll': {
      // The doll floats in front of her on the Ave Mujica octagram, ringed in 祥子's blue.
      const a = Math.min(1, t / .1, e.life / .12);
      ctx.translate(0, Math.sin(t * 5) * 3);
      ctx.globalAlpha = a;
      simpleSeal(ctx, 34, 1, t * .7, GOLD, .4);
      floorRing(ctx, 40 + Math.sin(t * 6) * 2, 1, ICE, 2.5, .7, lite);
      const im = art?.(DOLL_SRC);
      if (im) {
        ctx.scale(dir, 1);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(im, -40, -46, 80, 80);
      } else {
        ctx.scale(dir * 1.15, 1.15);
        doll(ctx);
      }
      break;
    }
    case 'mizuho-doll-burst':
    case 'mizuho-bloom': {
      // The doll takes the hit (blue), or the hug lets go (warm): one thick ring, the seal flashing gold,
      // her daughter's petals — outward, soft.
      const warm = e.type === 'mizuho-bloom';
      const k = ease(p);
      floorRing(ctx, r * k, 1, warm ? WARM : ICE, 7 * (1 - p) + 1.5, 1 - p, lite);
      floorRing(ctx, r * k * .6, 1, warm ? GOLD : BLUE, 3, (1 - p) * .8, true);
      simpleSeal(ctx, r * .45 * ease(p * 1.6), 1, p * 1.2, GOLD, (1 - p) * .7);
      const n = lite ? 6 : 12;
      for (let i = 0; i < n; i++) {
        const an = i / n * TAU + hash(i) * .4, d = r * (.2 + k * (.7 + hash(i, 1) * .3));
        ctx.globalAlpha = (1 - p) * .9;
        ctx.fillStyle = i % 3 ? MOON : ROSE;
        gladiolus(ctx, Math.cos(an) * d, Math.sin(an) * d, 20, 6, an);
      }
      ctx.globalAlpha = (1 - p) ** 2;
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, 0, 0, 30 * (1 - p) + 8);
      break;
    }
    /* ---- O 妈妈的小祥 ---- */
    case 'mizuho-beckon': {
      // 「过来」: a small moon turns over her hand and three glints fall from it.
      ctx.scale(dir, 1);
      ctx.rotate(-.9 + ease(p) * 1.5);
      ctx.globalAlpha = bump(p) * .85;
      ctx.fillStyle = MOON;
      crescent(ctx, 26, .14); ctx.fill();
      ctx.fillStyle = GOLD;
      for (let i = 0; i < 3; i++) sparkle(ctx, 22 + i * 9, (i - 1) * 12 + p * 14, 5 - i);
      break;
    }
    case 'mizuho-petals': {
      // She reaches them and scatters: petals and one ring.
      floorRing(ctx, 20 + 50 * ease(p), 1, ICE, 3 * (1 - p) + 1, 1 - p, true);
      const n = lite ? 7 : 14;
      for (let i = 0; i < n; i++) {
        const an = hash(i) * TAU, sp = 60 + hash(i, 1) * 90;
        ctx.globalAlpha = (1 - p) * .9;
        ctx.fillStyle = i % 2 ? ROSE : MOON;
        gladiolus(ctx, Math.cos(an) * sp * ease(p) + dir * 20 * p, Math.sin(an) * sp * ease(p) + 70 * p * p, 16, 5, an + p * 4);
      }
      break;
    }

    /* ---- L 化作星星 ---- */
    case 'mizuho-night': {
      // 血月的奏鸣's other half. The house dims to a blue night and a silver moon rises exactly where the blood
      // moon does — but there is no clock ring and no hard light: a soft halo, wide slow rays, and one ray that
      // comes down to her (e.tx). Pale petals drift where the red ones fell. When the last star has landed a
      // small crescent — her daughter's moon — rises beside hers in a breath of light (ふたつの月), and they fade
      // together. Screen space; every gradient is cached at unit size.
      const a = Math.min(1, t / .3, e.life / .7);
      const k = ease((t - (e.t0 ?? e.max)) / .7);
      ctx.translate(-e.x, -e.y);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(8,13,40,.42)';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.scale(W, H * .8);
      ctx.fillStyle = grad(ctx, 'top');
      ctx.fillRect(0, 0, 1, 1);
      ctx.restore();
      ctx.fillStyle = MOON;
      for (let g = 0; g < SKY_GROUPS; g += lite ? 2 : 1) {
        ctx.globalAlpha = a * (.25 + .6 * Math.abs(Math.sin(t * (1.2 + g * .45) + g * 1.7)));
        ctx.beginPath();
        for (let i = g * SKY_PER, end = i + SKY_PER; i < end; i++) {
          const x = SKY[i * 3], y = SKY[i * 3 + 1], rr = SKY[i * 3 + 2];
          ctx.moveTo(x + rr, y);
          ctx.arc(x, y, rr, 0, TAU);
        }
        ctx.fill();
      }
      const R = 74, mx = W / 2;
      const rise = ease(t / .8);
      const my = H * .64 + (H * .25 - H * .64) * rise;
      ctx.save();
      ctx.translate(mx, my);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * rise;
      const beam = grad(ctx, 'beam');
      const rays = lite ? 3 : 5;
      for (let i = 0; i < rays; i++) {
        const u = (i + .5) / rays - .5;
        ray(ctx, beam, Math.PI / 2 + u * 1.8 + Math.sin(t * .5 + i * 1.3) * .04, 700, 50 + hash(i, 1) * 40);
      }
      if (e.tx != null) {
        // Her own moonbeam: three rays of the same light, narrower and narrower, so its edge is feathered.
        const dx = e.tx - mx, dy = FLOOR - my;
        // It runs on past her feet and dies out over the last third, so it has no end to see.
        const len = (Math.hypot(dx, dy)) * 1.42, ang = Math.atan2(dy, dx);
        const hers = grad(ctx, 'hers');
        for (const w of HER_RAYS) ray(ctx, hers, ang, len, w * (.94 + .06 * Math.sin(t * 2.2 + w)));
      }
      ctx.globalAlpha = a;
      glowAt(ctx, halo(ctx), R * 3.4);
      ctx.globalCompositeOperation = 'source-over';
      glowAt(ctx, grad(ctx, 'disc'), R * 1.07);
      ctx.fillStyle = BLUE;
      ctx.globalAlpha = a * .1;
      for (const [dx, dy, rr] of MARIA) {
        ctx.beginPath(); ctx.arc(dx * R, dy * R, rr * R, 0, TAU); ctx.fill();
      }
      if (k > 0) {
        const cr = R * .58;
        ctx.translate(-R * 2.05, R * .3 + (1 - k) * 70);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * k;
        glowAt(ctx, halo(ctx), cr * 3.4);
        if (k < 1) { ctx.globalAlpha = a * bump(k) * .7; glowAt(ctx, halo(ctx), cr * 7); }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a * k;
        ctx.rotate(-.45);
        ctx.scale(-1, 1);
        ctx.fillStyle = '#dfe9ff';
        crescent(ctx, cr, .42); ctx.fill();
      }
      ctx.restore();
      const petals = lite ? 5 : 11;
      for (let i = 0; i < petals; i++) {
        const q = frac(t * .13 + hash(i, 4));
        ctx.globalAlpha = a * bump(q) * .5;
        ctx.fillStyle = i % 2 ? ROSE : MOON;
        gladiolus(ctx, hash(i, 5) * W + Math.sin(q * 6 + i) * 30, q * H * .9, 14, 4.5, hash(i, 6) * TAU + q * 4);
      }
      break;
    }
    case 'mizuho-pray': {
      // Where the moonbeam lands: a soft pool of light on the floor and the light standing on her, brightest
      // at her feet and gone above her head; slow motes rise in it. No ring, no seal — nothing with an edge.
      const a = Math.min(1, t / .4, e.life / .5);
      const col = grad(ctx, 'col');
      const slices = 8, sh = r * 1.5 / slices;
      ctx.fillStyle = col;
      for (let j = 0; j < slices; j++) {
        ctx.save();
        ctx.translate(0, -(j + .5) * sh);
        ctx.scale(r * (.55 + .3 * j / slices), sh);
        ctx.globalAlpha = a * (1 - j / slices) * (.9 + .1 * Math.sin(t * 2.5));
        ctx.fillRect(-1, -.5, 2, 1.03);
        ctx.restore();
      }
      ctx.globalAlpha = a;
      glowAt(ctx, pool(ctx), r * (1.05 + .05 * Math.sin(t * 2.2)), r * .26);
      const n = lite ? 5 : 11;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < n; i++) {
        const q = frac(t * .3 + hash(i));
        ctx.globalAlpha = a * bump(q) * .7;
        ctx.beginPath(); ctx.arc((hash(i, 1) - .5) * r * .9 + Math.sin(q * 5 + i) * 6, -q * r * 1.4, 1.2 + hash(i, 2) * 1.8, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'mizuho-starfall': {
      // A star touches the floor: a patch of light spreads and fades, a few glints hop out of it.
      ctx.globalAlpha = (1 - p) * .9;
      glowAt(ctx, pool(ctx), 20 + r * .6 * ease(p), (20 + r * .6 * ease(p)) * .26);
      ctx.fillStyle = e.color;
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = (1 - p) * .9;
        sparkle(ctx, (hash(i, e.x) - .5) * r * .7 * ease(p), -p * (26 + hash(i, 1) * 30), 6 * (1 - p) + 1);
      }
      break;
    }
    case 'mizuho-starhit': {
      const big = r > 140;
      ctx.globalAlpha = (1 - p);
      glowAt(ctx, halo(ctx), (big ? 120 : 70) * (.5 + .5 * ease(p)));
      ctx.rotate(p * .8);
      ctx.globalAlpha = (1 - p) ** 1.5;
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, 0, 0, (big ? 46 : 28) * (1 - p * .5));
      break;
    }
    /* ---- 还想再看看你 ---- */
    case 'mizuho-wish': {
      // She is still here: the light comes up round her, two rings open on the floor, petals rise. Under the bodies.
      const a = Math.min(1, t / .15, e.life / .5);
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(0, -140);
      glowAt(ctx, grad(ctx, 'wish'), r * (.65 - .2 * ease(p * 2)), 200);
      ctx.restore();
      floorRing(ctx, 20 + 170 * ease(p * 1.3), .22, MOON, 4 * (1 - p) + 1, 1 - p, lite);
      floorRing(ctx, 10 + 110 * ease(p * 1.1), .22, GOLD, 2.5, (1 - p) * .9, true);
      const n = lite ? 7 : 14;
      for (let i = 0; i < n; i++) {
        const k = frac(t * .8 + hash(i));
        ctx.globalAlpha = a * bump(k);
        ctx.fillStyle = i % 2 ? ROSE : MOON;
        gladiolus(ctx, (hash(i, 1) - .5) * r * 1.1, -k * r * 1.5, 15, 5, hash(i, 2) * TAU + k * 2);
      }
      ctx.globalAlpha = a * (1 - p);
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, 0, -r * .6, 34 * (1 - p) + 6);
      break;
    }
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  return true;
}
