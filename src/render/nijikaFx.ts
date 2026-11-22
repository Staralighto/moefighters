import type { Effect, Projectile } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import type { FighterView } from './view.ts';
import { H, W, clamp } from '../game/constants.ts';
import { NIJIKA_ROLL, nijikaRollBeat } from './clips.ts';
import { TAU, dot, glow, hash, sparkle, streak } from './fxParticles.ts';

/* 伊地知虹夏 — 金色、彩虹和星空. Four registers:
   - her gold (#F9D648) for the triangle ahoge (a corn chip, spinning) and the warm sound waves of 最大音量;
   - the rainbow of the 超高速打鼓 scene for 虹色神速滚奏: yellow at the head, orange at the waist, green at the
     feet, on a rim around her own sprite and on the extra arms (tinted copies of her own cell, never new art);
     gold cymbals ring on every stroke;
   - STARRY for 繁星的起拍: the house dims behind the bodies, the ceiling fills with stars, stars fall on the beat;
   - the red of the ribbon 星歌 tied for her (a candy-box ribbon), once, at the very end of the ult.
   Nothing written on screen. Shapes stay big and soft; the busiest frame (the big star) is about 30 particles. */

export const NIJIKA_SCREEN_BACK: readonly string[] = ['nijika-starry'];

const GOLD = '#F9D648';
const GOLD_RGB = '249,214,72';
const WARM_RGB = '255,236,176';
const CHIP = '#f2b636';
const CHIP_EDGE = '#b9741c';
const RIBBON = '#e8455a';
const RIBBON_LIGHT = '#ffb3bd';
/** The 超高速打鼓 rainbow, head to feet, and the order the strokes cycle through. */
const RAINBOW: readonly string[] = ['#ffe14a', '#ffa53c', '#7fe36a'];
const SPARK: readonly string[] = ['#ffe14a', '#ff8a3c', '#7fe36a', '#6fd3ff', '#ff7fb6'];

const count = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
/** 虹色神速滚奏's cymbals: forward offset, height as a share of the body, radius. */
const CYMBALS: readonly (readonly [number, number, number])[] = [[52, .66, 30], [92, .5, 24], [40, .36, 22]];
/** The house-dark gradient never changes, so each canvas builds it once. */
const darkCache = new WeakMap<CanvasRenderingContext2D, CanvasGradient>();
function houseDark(ctx: CanvasRenderingContext2D): CanvasGradient {
  let g = darkCache.get(ctx);
  if (!g) {
    g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(10,9,30,.9)');
    g.addColorStop(.6, 'rgba(22,18,48,.72)');
    g.addColorStop(1, 'rgba(40,30,40,.55)');
    darkCache.set(ctx, g);
  }
  return g;
}
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;

/** The ahoge as a corn chip: a fat triangle with rounded corners, a darker rim and a few seasoning flecks. */
function chip(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, flat = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(1, flat);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + i * TAU / 3;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * .42;
  ctx.strokeStyle = CHIP_EDGE;
  ctx.stroke();
  ctx.lineWidth = r * .26;
  ctx.strokeStyle = CHIP;
  ctx.stroke();
  ctx.fillStyle = CHIP;
  ctx.fill();
  ctx.fillStyle = '#ffd97a';
  ctx.beginPath();
  ctx.moveTo(0, -r * .62); ctx.lineTo(-r * .36, r * .06); ctx.lineTo(r * .1, -r * .05); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c8561e';
  for (let i = 0; i < 4; i++) dot(ctx, (hash(i, 3) - .5) * r * .8, (hash(i, 5) - .2) * r * .5, r * .07);
  ctx.restore();
}

/** One gold cymbal, seen almost edge-on: a flat ellipse with a dark rim, a bell and one bright arc. */
function cymbal(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tilt: number, ring: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  if (ring > 0) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * ring * .7;
    glow(ctx, 0, 0, r * 1.7, GOLD_RGB);
    ctx.globalAlpha = a;
  }
  ctx.fillStyle = '#a8701c';
  ctx.beginPath(); ctx.ellipse(0, 1.5, r, r * .26, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e9b93a';
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * .24, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#c98f25';
  ctx.beginPath(); ctx.ellipse(0, -r * .04, r * .22, r * .09, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#fff3b0';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, r * .72, r * .15, 0, Math.PI * 1.1, Math.PI * 1.75); ctx.stroke();
  if (ring > .4) {
    ctx.fillStyle = '#ffffff';
    sparkle(ctx, r * .55, -r * .08, 5 + 6 * ring);
  }
  ctx.restore();
}

/** A falling star: a soft trail from where it came from, a sparkle head and its glow. */
function fallingStar(ctx: CanvasRenderingContext2D, x0: number, y0: number, x: number, y: number, r: number, core: string, rgb: string): void {
  const dx = x - x0, dy = y - y0, len = Math.hypot(dx, dy) || 1;
  const tail = Math.min(len, r * 11);
  const tx = x - dx / len * tail, ty = y - dy / len * tail;
  const g = ctx.createLinearGradient(tx, ty, x, y);
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(1, `rgba(${rgb},.85)`);
  ctx.strokeStyle = g;
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 1.1;
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
  ctx.lineWidth = r * .35;
  ctx.strokeStyle = 'rgba(255,255,255,.8)';
  ctx.beginPath(); ctx.moveTo((tx + x) / 2, (ty + y) / 2); ctx.lineTo(x, y); ctx.stroke();
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * .6;
  glow(ctx, x, y, r * 4, rgb);
  ctx.globalAlpha = a;
  ctx.fillStyle = core;
  sparkle(ctx, x, y, r * 2.1);
  ctx.fillStyle = '#ffffff';
  dot(ctx, x, y, r * .55);
}

/* ---- 虹色神速滚奏: the rainbow rim and the extra arms, drawn round her own body by renderer.ts ---- */

/** How strongly the roll is lit right now (0 outside it): up fast after the active frame, out after the crash. */
function rollLight(f: Fighter): number {
  const a = f.attack;
  if (!a || a.skill.fx !== 'nijika-roll') return 0;
  const s = a.skill;
  if (a.t < s.start - .06) return 0;
  return clamp((a.t - s.start + .06) / .1, 0, 1) * clamp((NIJIKA_ROLL.crash + .22 - a.t) / .2, 0, 1);
}

/** Behind her body: the rainbow halo (three bands of her own silhouette, a little larger) and the extra arms. */
export function drawNijikaRollBack(ctx: CanvasRenderingContext2D, f: Fighter, view: FighterView, footY: number, alpha: number, lite: boolean): void {
  const k = rollLight(f);
  if (k <= 0 || !f.attack) return;
  const spec = f.data.view;
  const h = spec.kind === 'sprite' ? spec.height * (spec.specialScale ?? 1) : 181;
  const beat = Math.max(0, nijikaRollBeat(f.attack));
  ctx.save();
  // A warm glow behind the chest.
  ctx.globalAlpha = alpha * k * .35;
  glow(ctx, f.x, footY - h * .55, h * .62, GOLD_RGB);
  // The halo: head yellow, waist orange, feet green, each band a slightly larger copy of her silhouette.
  const cy = footY - h * .5;
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(f.x - h, footY - h * 1.15 + i * h * .4, h * 2, h * .4 + 2);
    ctx.clip();
    ctx.translate(f.x, cy);
    ctx.scale(1.06, 1.035);
    ctx.translate(-f.x, -cy);
    view.draw(ctx, f, f.x, footY, alpha * k * .8, RAINBOW[i]);
    ctx.restore();
  }
  // The extra arms: the arm band of her own drumming cell, swung about the shoulder, one colour per copy.
  const shoulderY = footY - h * .66;
  const copies = lite ? 1 : 3;
  for (let i = 0; i < copies; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const swing = side * (.14 + .05 * i) + Math.sin(beat * Math.PI + i * 1.3) * .05;
    ctx.save();
    ctx.beginPath();
    ctx.rect(f.x - h * .7, footY - h * .74, h * 1.4, h * .36);
    ctx.clip();
    ctx.translate(f.x, shoulderY);
    ctx.rotate(swing * f.facing);
    ctx.translate(-f.x + side * 6, -shoulderY - i * 4);
    view.draw(ctx, f, f.x, footY, alpha * k * (.42 - i * .08), RAINBOW[(i + Math.floor(beat)) % 3]);
    ctx.restore();
  }
  ctx.restore();
}

export function drawNijikaShot(ctx: CanvasRenderingContext2D, p: Projectile, liteFx: boolean): boolean {
  if (p.fx !== 'nijika-ahoge') return false;
  const dir = Math.sign(p.vx) || 1;
  const spin = p.age * 20 * dir;
  ctx.save();
  // A short fan of fading chips behind it: it is spinning, not sliding.
  const n = count(3, liteFx);
  for (let i = n; i >= 1; i--) {
    ctx.globalAlpha = .22 * (1 - i / (n + 1));
    chip(ctx, p.x - dir * i * 16, p.y, 22, spin - i * .45 * dir);
  }
  ctx.globalAlpha = .5;
  glow(ctx, p.x, p.y, 44, GOLD_RGB);
  ctx.globalAlpha = 1;
  chip(ctx, p.x, p.y, 24, spin);
  // One white glint riding the edge.
  const ga = spin * 1.7;
  ctx.fillStyle = '#ffffff';
  sparkle(ctx, p.x + Math.cos(ga) * 15, p.y + Math.sin(ga) * 15, 5);
  ctx.restore();
  return true;
}

export function drawNijikaFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false): boolean {
  if (!e.type.startsWith('nijika-')) return false;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    case 'nijika-chip': {
      // The chip hits: a white snap and golden crumbs.
      ctx.globalAlpha = life;
      glow(ctx, e.x, e.y, 30 + 20 * t, WARM_RGB);
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x, e.y, 16 * (1 - t * .6));
      const n = count(6, liteFx);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * .9 + hash(i, 1) * Math.PI * .8;
        const d = 14 + 46 * ease(t) * (.6 + .4 * hash(i, 2));
        chip(ctx, e.x + Math.cos(a) * d * dir, e.y + Math.sin(a) * d + 30 * t * t, 5 + 3 * hash(i, 3), i + t * 9);
      }
      break;
    }
    case 'nijika-volume': {
      // 最大音量: a flash at the sticks, then three warm rings out along the floor and three arcs either side.
      const R = e.radius ?? 280;
      if (el < .14) {
        ctx.globalAlpha = 1 - el / .14;
        glow(ctx, e.x, e.y - 20, 120, WARM_RGB);
      }
      for (let i = 0; i < 3; i++) {
        const u = clamp((el - i * .09) / .42, 0, 1);
        if (u <= 0 || u >= 1) continue;
        const rx = R * ease(u);
        const fade = 1 - u;
        ctx.globalAlpha = fade * .9;
        ctx.strokeStyle = i === 0 ? '#fff4cf' : GOLD;
        ctx.lineWidth = 10 * fade + 2;
        ctx.beginPath(); ctx.ellipse(e.x, e.y - 2, rx, rx * .14, 0, 0, TAU); ctx.stroke();
        // The sound itself: arcs standing up on both sides, like the waves out of a speaker.
        ctx.lineWidth = 7 * fade + 2;
        ctx.lineCap = 'round';
        const ar = rx * .55 + 30;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          const c = side > 0 ? 0 : Math.PI;
          ctx.arc(e.x, e.y - 70, ar, c - .55, c + .55);
          ctx.stroke();
        }
      }
      // Dust and little note heads thrown up by the blast.
      const n = count(12, liteFx);
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        const u = clamp((el - .02) / .6, 0, 1);
        const d = 30 + (R * .75) * ease(u) * (.4 + .6 * hash(i, 4));
        const y = e.y - 12 - 120 * u * (1 - u) * (.6 + .8 * hash(i, 5));
        ctx.globalAlpha = (1 - u) * .9;
        if (i % 3 === 0) {
          ctx.fillStyle = '#fff0c0';
          dot(ctx, e.x + side * d, y, 5);
          ctx.fillRect(e.x + side * d + 3.5, y - 16, 2, 16);
        } else {
          glow(ctx, e.x + side * d, y, 9, WARM_RGB);
        }
      }
      break;
    }
    case 'nijika-boom': {
      ctx.globalAlpha = life;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = e.hit ? 6 : 4;
      ctx.beginPath(); ctx.arc(e.x, e.y, (e.hit ? 26 : 18) + 34 * ease(t), 0, TAU); ctx.stroke();
      glow(ctx, e.x, e.y, (e.hit ? 44 : 30) * (1 - t * .5), WARM_RGB);
      break;
    }
    case 'nijika-cymbals': {
      // 虹色神速滚奏: three cymbals around her front ring with the strokes; at the crash the big one is struck away.
      const crash = e.t0 ?? .73;
      const h = e.radius ?? 181;
      // game/nijika.ts keeps e.age on the attack clock; the effect clock is the fallback.
      const ac = e.age ?? el;
      const fade = Math.min(1, el / .1, e.life / .15);
      const beat = ac / NIJIKA_ROLL.gap;
      for (let i = 0; i < CYMBALS.length; i++) {
        const [ox, oy, r] = CYMBALS[i];
        const struck = ac < crash && Math.floor(beat) % 3 === i;
        const ring = struck ? 1 - (beat % 1) : 0;
        let x = e.x + dir * ox, y = e.y - h * oy;
        let tilt = dir * (-.18 + .1 * i) + Math.sin(ac * 55 + i * 2) * .05 * (ac < crash ? 1 : 0);
        let a = fade;
        if (i === 0 && ac >= crash) {
          // Struck away: up and forward, spinning, gone.
          const u = clamp((ac - crash) / .4, 0, 1);
          x += dir * 120 * u;
          y -= 90 * u - 60 * u * u;
          tilt += dir * u * 9;
          a *= 1 - u;
        }
        ctx.globalAlpha = a;
        cymbal(ctx, x, y, r, tilt, ring);
      }
      break;
    }
    case 'nijika-beat': {
      // One stroke: a few short rainbow streaks fanning forward from the stick, a white snap at the root.
      const big = !!e.hit;
      const n = count(big ? 5 : 3, liteFx);
      const i0 = e.n ?? 0;
      ctx.globalAlpha = life;
      ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const a = (-.9 + 1.8 * (i + .5) / n) * .7 + (hash(i0, i) - .5) * .3;
        const r0 = 8 + 10 * ease(t), r1 = r0 + (big ? 30 : 20) * (1 - t * .4);
        ctx.strokeStyle = SPARK[(i0 + i) % SPARK.length];
        ctx.lineWidth = big ? 5 : 4;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * r0 * dir, e.y + Math.sin(a) * r0);
        ctx.lineTo(e.x + Math.cos(a) * r1 * dir, e.y + Math.sin(a) * r1);
        ctx.stroke();
      }
      // The sound of the stroke: perfect circles spreading out of the stick, one inside the other.
      const rings = count(3, liteFx);
      for (let j = 0; j < rings; j++) {
        const u = clamp(t * 1.15 - j * .12, 0, 1);
        if (u <= 0 || u >= 1) continue;
        ctx.globalAlpha = (1 - u) * (big ? .9 : .7);
        ctx.strokeStyle = j === 0 ? '#ffffff' : RAINBOW[(i0 + j) % 3];
        ctx.lineWidth = (big ? 3.5 : 2.5) * (1 - u) + 1;
        ctx.beginPath(); ctx.arc(e.x, e.y, 8 + (big ? 58 : 44) * ease(u), 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = life;
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x, e.y, (big ? 13 : 8) * (1 - t * .5));
      break;
    }
    case 'nijika-crash': {
      // The last accent: three rainbow rings out of the hit, sparks in every colour, and a short flash.
      const R = (e.radius ?? 181) * .7;
      if (el < .12) {
        ctx.globalAlpha = 1 - el / .12;
        glow(ctx, e.x, e.y, 130, WARM_RGB);
      }
      for (let i = 0; i < 3; i++) {
        const u = clamp((el - i * .05) / .45, 0, 1);
        if (u <= 0 || u >= 1) continue;
        ctx.globalAlpha = (1 - u) * .9;
        ctx.strokeStyle = RAINBOW[i];
        ctx.lineWidth = 9 * (1 - u) + 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, 20 + R * ease(u), 0, TAU); ctx.stroke();
      }
      const n = count(12, liteFx);
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + hash(i, 7) * .4;
        const d = 24 + R * 1.1 * ease(t) * (.6 + .4 * hash(i, 8));
        ctx.globalAlpha = life;
        ctx.fillStyle = SPARK[i % SPARK.length];
        sparkle(ctx, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d + 20 * t * t, 6 * (1 - t * .5));
      }
      break;
    }
    case 'nijika-starry': {
      // 繁星的起拍: the house goes dark behind the bodies; the ceiling of STARRY fills with stars.
      const fade = Math.min(1, el / .3, e.life / .35);
      ctx.globalAlpha = fade;
      ctx.fillStyle = houseDark(ctx);
      ctx.fillRect(0, 0, W, H);
      // A warm wash on the stage floor, as if lit from the front.
      ctx.globalAlpha = fade * .35;
      glow(ctx, W / 2, H * .86, W * .45, GOLD_RGB);
      const n = count(46, liteFx);
      for (let i = 0; i < n; i++) {
        const x = hash(i, 11) * W;
        const y = 20 + hash(i, 12) * H * .5;
        // Stars come on one after another in the first half second, then twinkle.
        const on = clamp((el - hash(i, 13) * .6) / .25, 0, 1);
        if (on <= 0) continue;
        const tw = .55 + .45 * Math.sin(el * (2 + hash(i, 14) * 3) + i);
        ctx.globalAlpha = fade * on * tw;
        if (i % 7 === 0) {
          glow(ctx, x, y, 12, WARM_RGB);
          ctx.fillStyle = '#fff6d8';
          sparkle(ctx, x, y, 6);
        } else {
          // Tiny stars are squares: a fillRect costs far less than a path, and at 2-3 px nobody sees the corners.
          const r = 1.2 + hash(i, 15) * 1.6;
          ctx.fillStyle = i % 3 ? '#fff6d8' : '#ffe7a0';
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
      }
      break;
    }
    case 'nijika-click': {
      // One click of the count-in over her head: a ring and a snap; the fourth is the biggest and gold.
      const big = !!e.hit;
      const i = e.n ?? 0;
      ctx.globalAlpha = life;
      ctx.strokeStyle = big ? GOLD : '#fff6d8';
      ctx.lineWidth = (big ? 6 : 4) * (1 - t * .5);
      ctx.beginPath(); ctx.arc(e.x, e.y, 10 + (26 + i * 8) * ease(t), 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x, e.y, (big ? 18 : 11) * (1 - t * .6));
      if (big) {
        ctx.globalAlpha = life * .6;
        glow(ctx, e.x, e.y, 60, GOLD_RGB);
      }
      break;
    }
    case 'nijika-meteor':
    case 'nijika-bigstar': {
      const big = e.type === 'nijika-bigstar';
      const fall = e.t0 ?? .25;
      const i = e.n ?? 0;
      const side = i % 2 ? 1 : -1;
      const x0 = e.x + side * (big ? 60 : 120 + hash(i, 21) * 80), y0 = -20;
      const r = big ? 10 : 6;
      const rgb = big ? '255,248,220' : GOLD_RGB;
      if (el < fall) {
        const u = el / fall;
        const k = u * u;
        // The mark on the floor: where it will land, so it can be walked out of.
        ctx.globalAlpha = .25 + .5 * u;
        ctx.strokeStyle = big ? '#fff6d8' : GOLD;
        ctx.lineWidth = 2;
        const mr = (big ? 70 : 44) * (1.3 - .3 * u);
        ctx.beginPath(); ctx.ellipse(e.x, e.y - 2, mr, mr * .18, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
        fallingStar(ctx, x0, y0, x0 + (e.x - x0) * k, y0 + (e.y - 30 - y0) * k, r, big ? '#fffbe8' : GOLD, rgb);
        break;
      }
      // Landed: a flash, a ring on the floor, sparks thrown up.
      const u = clamp((el - fall) / Math.max(.1, e.max - fall), 0, 1);
      const R = big ? 150 : 70;
      if (u < .3) {
        ctx.globalAlpha = 1 - u / .3;
        glow(ctx, e.x, e.y - 30, R, rgb);
      }
      ctx.globalAlpha = 1 - u;
      ctx.strokeStyle = big ? '#fff6d8' : GOLD;
      ctx.lineWidth = (big ? 8 : 5) * (1 - u) + 1;
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 2, R * ease(u), R * .16 * ease(u), 0, 0, TAU); ctx.stroke();
      const n = count(big ? 16 : 6, liteFx);
      for (let j = 0; j < n; j++) {
        const a = -Math.PI / 2 + (hash(j, 22 + i) - .5) * 2.4;
        const d = (big ? 40 : 20) + (big ? 150 : 60) * ease(u) * (.5 + .5 * hash(j, 23));
        ctx.fillStyle = big ? (j % 3 ? '#fff6d8' : GOLD) : GOLD;
        sparkle(ctx, e.x + Math.cos(a) * d, e.y - 20 + Math.sin(a) * d + 60 * u * u, (big ? 7 : 5) * (1 - u * .6));
      }
      if (big && u < .5) {
        // Long rays for the big one.
        ctx.globalAlpha = (1 - u / .5) * .7;
        ctx.fillStyle = '#fff6d8';
        for (let j = 0; j < 6; j++) {
          const a = j / 6 * TAU + .3;
          streak(ctx, e.x, e.y - 40, e.x + Math.cos(a) * R * 1.4, e.y - 40 + Math.sin(a) * R * .9, 6 * (1 - u));
        }
      }
      break;
    }
    case 'nijika-ribbon': {
      // The ribbon 星歌 tied for her: two red bands curl up out of the big star's light and fade.
      const grow = ease(el / .55);
      const fade = Math.min(1, e.life / .4);
      const len = 230 * grow;
      const steps = liteFx ? 10 : 18;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Both strands in one path per layer (two strokes in all), the points computed straight into it.
      for (let layer = 0; layer < 2; layer++) {
        ctx.globalAlpha = fade * (layer ? .9 : .85);
        ctx.strokeStyle = layer ? RIBBON_LIGHT : RIBBON;
        ctx.lineWidth = (layer ? 5 : 16) * (1 - .4 * grow);
        ctx.beginPath();
        for (let side = -1; side <= 1; side += 2) {
          for (let j = 0; j <= steps; j++) {
            const s = j / steps;
            const y = e.y - 30 - s * len;
            const x = e.x + side * (18 + s * 70) + Math.sin(s * 5 + el * 4 + (side > 0 ? 1 : 0)) * 22 * s;
            if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
        }
        ctx.stroke();
      }
      const n = count(10, liteFx);
      for (let j = 0; j < n; j++) {
        const u = clamp((el - hash(j, 31) * .4) / .8, 0, 1);
        ctx.globalAlpha = fade * (1 - u);
        ctx.fillStyle = j % 2 ? GOLD : '#fff6d8';
        sparkle(ctx, e.x + (hash(j, 32) - .5) * 160, e.y - 40 - u * 200 * (.5 + hash(j, 33)), 5);
      }
      break;
    }
    case 'nijika-attack': {
      // 进攻姿态: a quiet gold lift around her — motes rising and a faint glow at the feet.
      const h = e.radius ?? 181;
      const fade = Math.min(1, el / .2, e.life / .4);
      ctx.globalAlpha = fade * .3;
      glow(ctx, e.x, e.y - 6, 60, GOLD_RGB);
      const n = count(8, liteFx);
      for (let j = 0; j < n; j++) {
        const u = (el * .9 + hash(j, 41)) % 1;
        ctx.globalAlpha = fade * Math.sin(u * Math.PI) * .9;
        ctx.fillStyle = j % 3 ? GOLD : '#fff6d8';
        const x = e.x + (hash(j, 42) - .5) * h * .5;
        const y = e.y - 10 - u * h * .9;
        if (j % 3) dot(ctx, x, y, 2.4); else sparkle(ctx, x, y, 5);
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
  return true;
}
