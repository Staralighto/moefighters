import type { Effect, Projectile } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import type { Fighter } from '../game/fighter.ts';
import { FLOOR, clamp } from '../game/constants.ts';
import {
  CELL, NANAMI_BUSH_SRC, NANAMI_CLAW_FALL, NANAMI_CLAW_SRC, NANAMI_COLOR, NANAMI_FOUR, NANAMI_PAINT_FINAL, NANAMI_PAINT_STROKES,
} from './clips.ts';
import { TAU, burst, cycle, dot, glow, hash, petal, soap, sparkle, span } from './fxParticles.ts';

/* 广町七深 — 「装普通」和「不装了」. Two registers:
   - the pretend-ordinary one: soft greens of a bush, a plain grey crane game, pastel bubbles, a little white tap on J / K;
   - the real her: thick paint. Four strokes in the others' colours (真白 / 透子 / 筑紫 / 瑠唯), her own orange to finish,
     and a butterfly painted out of all five. Paint reads as paint through a bristle edge, a wet highlight and drips.
   Flat shapes that read from across the screen; the heaviest moment, the butterfly, is two bezier wings and a few drops. */

/** Under every body: the canvas she paints on stands behind her. */
export const NANAMI_BACK: readonly string[] = ['nanami-canvas', 'nanami-mark'];

const ORANGE = NANAMI_COLOR;
const PINK = '#ffb0c8';
const LEAF = ['#6fae4f', '#8fca62', '#4e8a3a'];
const ALL = [...NANAMI_FOUR, ORANGE];

const count = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const rgbOf = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return `${v >> 16 & 255},${v >> 8 & 255},${v & 255}`;
};

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

/* ---- shared shapes ---- */

/** A cat paw print: a pad and three toes. Current fillStyle. */
function paw(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  if (!(r > .6)) return;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath(); ctx.ellipse(0, r * .35, r * .62, r * .5, 0, 0, TAU); ctx.fill();
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * r * .55, -r * .45 - (i ? 0 : r * .12), r * .26, 0, TAU); ctx.fill(); }
  ctx.restore();
}

/** A blob of wet paint: a lumpy round body, a darker rim and one white highlight. */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, seed: number): void {
  if (!(r > .8)) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = i / 8 * TAU;
    const k = r * (.82 + hash(i % 8, seed) * .36);
    const px = x + Math.cos(a) * k, py = y + Math.sin(a) * k;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * .7;
  ctx.fillStyle = '#ffffff';
  dot(ctx, x - r * .32, y - r * .34, r * .2);
  ctx.globalAlpha = a0;
}

/** The cat hairpin: a black cat face with white ears' insides — her 猫かぶり. Centred, size s. */
function hairpin(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = '#1c1820';
  ctx.beginPath();
  ctx.moveTo(-s, -s * .1);
  ctx.lineTo(-s * .85, -s * 1.05); ctx.lineTo(-s * .3, -s * .55);
  ctx.lineTo(s * .3, -s * .55); ctx.lineTo(s * .85, -s * 1.05);
  ctx.lineTo(s, -s * .1);
  ctx.quadraticCurveTo(s, s * .8, 0, s * .8);
  ctx.quadraticCurveTo(-s, s * .8, -s, -s * .1);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(-s * .72, -s * .25); ctx.lineTo(-s * .66, -s * .78); ctx.lineTo(-s * .4, -s * .45); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * .72, -s * .25); ctx.lineTo(s * .66, -s * .78); ctx.lineTo(s * .4, -s * .45); ctx.fill();
  dot(ctx, -s * .35, s * .05, s * .13);
  dot(ctx, s * .35, s * .05, s * .13);
  ctx.restore();
}

/** One wing of the butterfly: an upper and a lower lobe off the body at 0,0, opening to the +x side. */
function wing(ctx: CanvasRenderingContext2D, s: number, open: number): void {
  const w = s * open;
  ctx.beginPath();
  ctx.moveTo(0, -s * .05);
  ctx.bezierCurveTo(w * .35, -s * 1.05, w * 1.2, -s * 1.0, w * 1.02, -s * .28);
  ctx.bezierCurveTo(w * .95, -s * .05, w * .4, s * .02, 0, s * .04);
  ctx.bezierCurveTo(w * .55, s * .1, w * .95, s * .4, w * .7, s * .78);
  ctx.bezierCurveTo(w * .45, s * 1.0, w * .1, s * .6, 0, s * .12);
  ctx.closePath();
}

/* ---- the projectile: 我说了什么奇怪的话吗？ ---- */

/** A slow string of pastel bubbles that never quite keeps formation, a paw print in the biggest. */
export function drawNanamiShot(ctx: CanvasRenderingContext2D, p: Projectile, liteFx: boolean): boolean {
  if (p.fx !== 'nanami-weird') return false;
  const t = p.age;
  const dir = p.vx >= 0 ? 1 : -1;
  const r = (p.size ?? 66) * .5;
  const grow = ease(t / .25);
  ctx.save();
  // A dreamy pastel haze the string drifts in, so it reads from across the stage.
  ctx.globalAlpha = .38 * grow;
  glow(ctx, p.x - dir * r * .9, p.y, r * 2.1, '255,200,220');
  const n = count(6, liteFx);
  for (let i = 0; i < n; i++) {
    const lag = i * .14;
    const bx = p.x - dir * i * r * .55 + Math.sin(t * 3 + i * 1.7) * 5;
    const by = p.y + Math.sin(t * 2.2 + i * 2.3) * r * .38 - (hash(i, 7) - .5) * r * .4;
    const br = r * (i === 0 ? .62 : .42 - i * .045) * grow * (1 + Math.sin(t * 4 + i) * .06);
    if (t < lag) continue;
    ctx.globalAlpha = .85;
    ctx.fillStyle = i % 2 ? 'rgba(255,214,228,.32)' : 'rgba(255,196,168,.32)';
    dot(ctx, bx, by, br);
    soap(ctx, bx, by, br, .95, i % 2);
    if (i === 0) {
      ctx.globalAlpha = .75;
      ctx.fillStyle = ORANGE;
      paw(ctx, bx, by + br * .08, br * .42, Math.sin(t * 2) * .3);
    }
    // Now and then a bubble catches the light.
    const glint = Math.sin(t * 5 + i * 2.6);
    if (glint > .82) {
      ctx.globalAlpha = (glint - .82) / .18;
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, bx + br * .45, by - br * .5, 4 + br * .12);
    }
  }
  // A few tiny bubbles trailing off the back.
  for (let i = 0, m = count(5, liteFx); i < m; i++) {
    const k = cycle(t, 1.1, i, 11);
    ctx.globalAlpha = (1 - k) * .8;
    soap(ctx, p.x - dir * (r * 2.4 + k * 50), p.y - k * 26 + (hash(i, 12) - .5) * 30, 3 + hash(i, 13) * 4, 1, i % 2);
  }
  ctx.restore();
  return true;
}

/* ---- status looks (registered in statusMarks.ts) ---- */

/** 混乱 ('nanami-weird'): three paw prints padding in a slow circle over the head, and bubbles rising out of it. */
export function auraNanamiWeird(ctx: CanvasRenderingContext2D, f: Fighter, bodyH: number, left: number, t: number, lite: boolean): void {
  const fade = Math.min(1, left / .3);
  const cx = f.x, cy = f.y - bodyH - 16;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const a = t * 1.6 + i * TAU / 3;
    const depth = (Math.sin(a) + 1) / 2;
    ctx.globalAlpha = fade * (.55 + depth * .4);
    ctx.fillStyle = i === 1 ? PINK : ORANGE;
    paw(ctx, cx + Math.cos(a) * 26, cy + Math.sin(a) * 7, 5 + depth * 2, a + Math.PI / 2);
  }
  for (let i = 0, m = count(4, lite); i < m; i++) {
    const k = cycle(t, .55, i, 21);
    ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .9;
    soap(ctx, cx + (hash(i, 22) - .5) * 40 + Math.sin(t * 2 + i) * 4, cy - 6 - k * 40, 4 + hash(i, 23) * 4, 1, i % 2);
  }
  ctx.restore();
}
export function applyNanamiWeird(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  burst(age, 24, { n: 9, speed: [40, 120], life: .55, gravity: -60, drag: .35 }, (x, y, q, i) => {
    ctx.globalAlpha = 1 - q;
    soap(ctx, x, y, 4 + hash(i, 25) * 5, 1, i % 2);
  }, e.x, e.y - 170);
  ctx.restore();
}

/** 定身 ('nanami-fright'): scared stiff — cold sweat dropping off the head and two leaves still stuck on. */
export function auraNanamiFright(ctx: CanvasRenderingContext2D, f: Fighter, bodyH: number, left: number, t: number, lite: boolean): void {
  const fade = Math.min(1, left / .25);
  const top = f.y - bodyH;
  ctx.save();
  for (let i = 0, m = count(4, lite); i < m; i++) {
    const k = cycle(t, 1.4, i, 31);
    const side = i % 2 ? 1 : -1;
    const x = f.x + side * (16 + hash(i, 32) * 14) + side * k * 10;
    const y = top + 10 + k * 34;
    ctx.globalAlpha = fade * (1 - k) * .9;
    ctx.fillStyle = '#bfe6ff';
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.quadraticCurveTo(x + 4.5, y, x, y + 4); ctx.quadraticCurveTo(x - 4.5, y, x, y - 7);
    ctx.fill();
  }
  ctx.globalAlpha = fade;
  petal(ctx, f.x - 12, top + 6, 7, -.6 + Math.sin(t * 9) * .15, LEAF[0]);
  petal(ctx, f.x + 18, top + bodyH * .4, 6, .9, LEAF[1]);
  ctx.restore();
}
export function applyNanamiFright(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // The jump: a white pop over the head, short and round.
  ctx.save();
  const k = span(age, 0, .3);
  ctx.globalAlpha = (1 - k) * .8;
  glow(ctx, e.x, e.y - 175, 30 + k * 30, '255,255,255');
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * .45;
    sparkle(ctx, e.x + Math.cos(a) * (34 + k * 26), e.y - 175 + Math.sin(a) * (24 + k * 20), 6 * (1 - k));
  }
  ctx.restore();
}

/** 全是 GOOD ('nanami-genius', a 'look' on her): the paint she is not hiding any more, a few drops climbing off her. */
export function auraNanamiGenius(ctx: CanvasRenderingContext2D, f: Fighter, bodyH: number, left: number, t: number, lite: boolean): void {
  const fade = Math.min(1, left / .4);
  ctx.save();
  for (let i = 0, m = count(6, lite); i < m; i++) {
    const k = cycle(t, .6, i, 41);
    ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .85;
    ctx.fillStyle = ALL[i % ALL.length];
    dot(ctx, f.x + (hash(i, 42) - .5) * 60 + Math.sin(t * 2 + i) * 6, f.y - bodyH * (.1 + k * .9), 3.2 - k);
  }
  ctx.restore();
}

/** 藏不住了: n drops of real paint (her colour first, then the others') hanging by her shoulder, bobbing a little
 *  out of step. Small and slow on purpose — the act is only slipping. Full layers get a soft ring under them. */
export function auraNanamiTell(ctx: CanvasRenderingContext2D, f: Fighter, bodyH: number, n: number, t: number, lite: boolean): void {
  const cx = f.x - f.facing * 26, cy = f.y - bodyH * .78;
  ctx.save();
  if (n >= 3 && !lite) {
    ctx.globalAlpha = .28 + Math.sin(t * 4) * .08;
    glow(ctx, cx, cy, 30, rgbOf(ORANGE));
  }
  for (let i = 0; i < n; i++) {
    const a = t * 1.3 + i * TAU / 3;
    const x = cx + Math.cos(a) * 15, y = cy + Math.sin(a) * 7 + Math.sin(t * 3 + i * 2) * 2;
    const col = i === 0 ? ORANGE : NANAMI_FOUR[(i * 2 - 1) % 4];
    ctx.globalAlpha = .95;
    ctx.fillStyle = col;
    // A paint drop: round bottom, pulled-up tip.
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.quadraticCurveTo(x + 5, y - 1, x, y + 4);
    ctx.quadraticCurveTo(x - 5, y - 1, x, y - 7);
    ctx.fill();
    ctx.globalAlpha = .7;
    ctx.fillStyle = '#ffffff';
    dot(ctx, x - 1.4, y - 1, 1.2);
  }
  ctx.restore();
}

/* ---- effects ---- */

export function drawNanamiFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('nanami-')) return false;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    case 'nanami-jk': {
      if (!e.n) {
        // Plain on purpose: one small white tap, the kind nobody remembers.
        const r = (e.heavy ? 20 : 14) + ease(t) * 12;
        ctx.globalAlpha = (1 - t) * .75;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
        ctx.globalAlpha = (1 - t) * .5;
        ctx.fillStyle = '#ffe3d2';
        dot(ctx, e.x, e.y, 5 * (1 - t));
        // …except one drop of real paint slips out of the act every time and drips off. Nobody notices. Probably.
        const seed = Math.floor(e.x * .37 + e.y) & 63;
        const col = ALL[seed % 5];
        const dk = span(el, .03, e.max);
        const dx = e.x + dir * (8 + hash(seed, 56) * 10), dy = e.y - 4 + dk * dk * 34;
        ctx.globalAlpha = Math.min(1, e.life / .08);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(dx, dy - 5 - dk * 4);
        ctx.quadraticCurveTo(dx + 3.4, dy, dx, dy + 3);
        ctx.quadraticCurveTo(dx - 3.4, dy, dx, dy - 5 - dk * 4);
        ctx.fill();
        break;
      }
      // Not pretending: a real brush stroke swept along the swing — a tapered crescent of paint, bristle lines inside.
      {
        const big = e.heavy ? 1.3 : 1;
        const sweep = ease(el / .09);
        const R = (e.radius ?? 40) * big + 10;
        const a0 = -1.1, a1 = a0 + 2.1 * sweep;
        const col = ALL[(e.heavy ? 3 : 0) + (Math.floor(e.x) & 1)];
        ctx.save();
        ctx.translate(e.x - dir * R * .55, e.y + 6);
        ctx.scale(dir, 1);
        ctx.globalAlpha = Math.min(1, e.life / .16);
        ctx.fillStyle = col;
        ctx.beginPath();
        const N = 10;
        for (let i = 0; i <= N; i++) {
          const a = a0 + (a1 - a0) * i / N;
          const w = Math.sin(Math.PI * i / N) ** .7 * 13 * big;
          if (i) ctx.lineTo(Math.cos(a) * (R + w), Math.sin(a) * (R + w)); else ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R);
        }
        for (let i = N; i >= 0; i--) {
          const a = a0 + (a1 - a0) * i / N;
          const w = Math.sin(Math.PI * i / N) ** .7 * 4 * big;
          ctx.lineTo(Math.cos(a) * (R - w), Math.sin(a) * (R - w));
        }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.5)';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(0, 0, R + 5 * big, a0 + .25, Math.max(a0 + .26, a1 - .3)); ctx.stroke();
        ctx.restore();
      }
      // Not pretending: a splash of paint in all five colours flung along the swing, drops falling off it.
      const big = e.heavy ? 1.35 : 1;
      const pop = ease(el / .08);
      ctx.globalAlpha = Math.min(1, e.life / .2);
      for (let i = 0; i < (liteFx ? 3 : 5); i++) {
        const a = (hash(i, 51) - .5) * 1.6;
        const d = (8 + hash(i, 52) * 26) * big * pop;
        blob(ctx, e.x + dir * Math.cos(a) * d, e.y + Math.sin(a) * d, (5 + hash(i, 53) * 7) * big * pop, ALL[(i + (e.heavy ? 2 : 0)) % 5], 54 + i);
      }
      burst(el, 55, { n: count(10, liteFx), speed: [140, 300], life: .4, gravity: 900, angle: dir > 0 ? -.4 : Math.PI + .4, spread: 1.8 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = ALL[i % 5];
        dot(ctx, x, y, (3.2 - q * 1.6) * big);
      }, e.x, e.y);
      break;
    }
    case 'nanami-bush': {
      // 只是普通地路过: a round bush shuffling along, rustling as it goes. bush.png is the bush with her eyes peeking out.
      const h = e.radius ?? 174;
      const w = h * .78;
      // Shuffle, shuffle… freeze (just a bush, nothing to see) — then shuffle on. The freeze is a stiff little hold.
      const beat = el % .45;
      const still = beat > .33;
      const shuffle = still ? 0 : Math.sin(el * 14);
      const sq = 1 + shuffle * .04 + (still ? .025 : 0);
      const im = image(images, NANAMI_BUSH_SRC);
      const enter = ease(el / .12);
      // Its shadow, and leaves shed behind it as it goes.
      ctx.globalAlpha = .28 * enter;
      ctx.fillStyle = '#1e2a14';
      ctx.beginPath(); ctx.ellipse(e.x, FLOOR - 1, w * .48, 8, 0, 0, TAU); ctx.fill();
      for (let i = 0, m = count(5, liteFx); i < m; i++) {
        const k = cycle(el, 1.6, i, 64);
        ctx.globalAlpha = enter * (1 - k) * .9;
        const lx = e.x - dir * (w * .25 + k * 60 + hash(i, 65) * 30);
        const ly = e.y - w * (.25 + hash(i, 66) * .5) + k * k * w * .55;
        petal(ctx, lx + Math.sin(el * 6 + i * 2) * 6, Math.min(FLOOR - 4, ly), 5 + hash(i, 67) * 3, el * 5 * (i % 2 ? 1 : -1) + i, LEAF[i % 3]);
      }
      if (!still && !liteFx) {
        ctx.fillStyle = '#e8dcc4';
        for (let i = 0; i < 2; i++) {
          const k = cycle(el, 3, i, 68);
          ctx.globalAlpha = (1 - k) * .5;
          dot(ctx, e.x - dir * (w * .3 + k * 26), FLOOR - 5 - k * 10, 4 + k * 5);
        }
      }
      ctx.globalAlpha = 1;
      ctx.translate(e.x, e.y);
      ctx.scale(dir * sq * enter, (2 - sq) * enter);
      ctx.rotate(shuffle * .03);
      if (im) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(im, -w / 2, -w * .98, w, w);
      } else {
        // Placeholder until bush.png lands: three green lobes, two eyes and a cat mouth.
        ctx.fillStyle = LEAF[2];
        dot(ctx, -w * .22, -w * .32, w * .3); dot(ctx, w * .24, -w * .3, w * .3); dot(ctx, 0, -w * .5, w * .34);
        ctx.fillStyle = LEAF[0];
        dot(ctx, -w * .2, -w * .36, w * .25); dot(ctx, w * .22, -w * .34, w * .25); dot(ctx, 0, -w * .54, w * .28);
        ctx.fillStyle = '#2a2030';
        dot(ctx, -w * .1, -w * .5, w * .04); dot(ctx, w * .1, -w * .5, w * .04);
      }
      break;
    }
    case 'nanami-leaves': {
      // The jump-out: the bush bursts into leaves, and a soft green puff where it stood.
      const h = e.radius ?? 174;
      ctx.globalAlpha = (1 - span(el, 0, .3)) * .5;
      glow(ctx, e.x, e.y - h * .3, h * .45 * (1 + el), '160,220,120');
      // 哇！: manga shock lines bursting out round the jump — short white wedges, gone in a blink.
      const sk = span(el, 0, .22);
      if (sk < 1) {
        const cx = e.x, cy = e.y - h * .55;
        ctx.globalAlpha = 1 - sk;
        ctx.fillStyle = '#ffffff';
        for (let i = 0, m = count(12, liteFx); i < m; i++) {
          const a = i / m * TAU + hash(i, 69) * .3;
          const r0 = h * (.42 + sk * .25), r1 = r0 + h * (.18 + hash(i, 70) * .14) * (1 - sk * .5);
          const wd = .05;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a - wd) * r0, cy + Math.sin(a - wd) * r0 * .8);
          ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * .8);
          ctx.lineTo(cx + Math.cos(a + wd) * r0, cy + Math.sin(a + wd) * r0 * .8);
          ctx.fill();
        }
      }
      burst(el, 61, { n: count(16, liteFx), speed: [120, 320], life: .7, gravity: 380, angle: -Math.PI / 2, spread: 2.6, drag: .3 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q * q;
        petal(ctx, x, y, 6 + hash(i, 62) * 5, el * (6 + hash(i, 63) * 8) * (i % 2 ? 1 : -1), LEAF[i % 3]);
      }, e.x, e.y - h * .3);
      break;
    }
    case 'nanami-mark': {
      // The claw's aim: a shadow on the floor that darkens as the claw comes, and a faint aiming light from above.
      const r = e.radius ?? 54;
      const k = clamp(el / (e.max - .1), 0, 1);
      ctx.globalAlpha = Math.min(1, el / .1, e.life / .1);
      ctx.fillStyle = `rgba(20,14,30,${.22 + k * .3})`;
      ctx.beginPath(); ctx.ellipse(e.x, FLOOR - 1, r * (1.15 - k * .25), r * .22, 0, 0, TAU); ctx.fill();
      // Arcade marquee bulbs chasing round the spot, faster as the claw comes, all lit in the last instant.
      const bulbs = count(14, liteFx);
      const chase = el * (8 + k * 22);
      const allOn = k > .9;
      for (let i = 0; i < bulbs; i++) {
        const a = i / bulbs * TAU;
        const on = allOn || (Math.floor(chase) - i) % 3 === 0;
        const bx = e.x + Math.cos(a) * r * 1.2, by = FLOOR - 1 + Math.sin(a) * r * .26;
        ctx.fillStyle = on ? '#fff3c4' : 'rgba(255,170,140,.45)';
        dot(ctx, bx, by, on ? 3.2 : 2.2);
      }
      const grd = ctx.createLinearGradient(0, 0, 0, FLOOR);
      grd.addColorStop(0, 'rgba(255,170,140,0)');
      grd.addColorStop(1, `rgba(255,170,140,${.1 + k * .12})`);
      ctx.fillStyle = grd;
      ctx.fillRect(e.x - 3, 0, 6, FLOOR);
      break;
    }
    case 'nanami-claw': {
      // 一发命中: the crane claw on its cable. n 0 falling, 1 holding someone, 2 shut on air, 3 let go. claw.png: open | closed.
      const h = e.radius ?? 181;
      const t0 = e.t0 ?? 0;
      const tip = (y: number) => y - h * .6;
      const top = -60;
      let y: number, closed: number;
      const fallK = span(el, t0, t0 + NANAMI_CLAW_FALL);
      if (e.n === 0) {
        y = top + (tip(FLOOR) - top) * fallK * fallK;
        closed = 0;
      } else if (e.n === 1) {
        y = tip(e.y);
        closed = 1;
      } else if (e.n === 2) {
        const shut = el - t0 - NANAMI_CLAW_FALL;
        closed = clamp(shut / .1, 0, 1);
        y = tip(FLOOR) - Math.max(0, shut - .22) ** 2 * 900;
      } else {
        closed = 0;
        y = tip(e.y) - Math.max(0, el - t0 - .1) ** 2 * 900;
      }
      if (el < t0) { ctx.restore(); return true; }
      const fade = Math.min(1, e.life / .25);
      const sway = e.n === 1 ? Math.sin(el * 18) * .05 : 0;
      ctx.globalAlpha = fade;
      // The machine overhead: a grey gantry rail sliding in at the top of the screen and the trolley on it.
      const rail = ease((el - t0 + .15) / .2);
      ctx.fillStyle = '#8f8a9c';
      ctx.fillRect(e.x - 150 * rail, 2, 300 * rail, 7);
      ctx.fillStyle = '#c9c4d6';
      ctx.fillRect(e.x - 150 * rail, 2, 300 * rail, 2);
      ctx.fillStyle = '#b3aec2';
      ctx.fillRect(e.x - 16, 4, 32, 16);
      ctx.fillStyle = (Math.floor(el * 8) & 1) ? '#ffcf5a' : '#ff7a5a';
      dot(ctx, e.x, 12, 3);
      // The cable.
      ctx.strokeStyle = '#d9d4e2';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(e.x, 20); ctx.lineTo(e.x, y - 58); ctx.stroke();
      const s = 128;
      const im = image(images, NANAMI_CLAW_SRC);
      ctx.translate(e.x, y);
      ctx.rotate(sway);
      if (im) {
        ctx.imageSmoothingEnabled = true;
        const col = closed > .5 ? 1 : 0;
        ctx.drawImage(im, col * CELL, 0, CELL, CELL, -s / 2, -s * .62, s, s);
      } else {
        // Placeholder: a grey hub and three prongs that close.
        ctx.fillStyle = '#a7a2b4';
        ctx.fillRect(-20, -62, 40, 22);
        ctx.strokeStyle = '#a7a2b4';
        ctx.lineWidth = 7; ctx.lineCap = 'round';
        const spread = 1 - closed * .7;
        for (const sd of [-1, 0, 1]) {
          ctx.beginPath(); ctx.moveTo(sd * 12, -42);
          ctx.quadraticCurveTo(sd * 44 * spread, -10, sd * 26 * spread + (sd ? 0 : 0), 24);
          ctx.stroke();
        }
      }
      // The first touch: a small bright ping where the prongs meet.
      if (e.n !== 0 && el - t0 - NANAMI_CLAW_FALL < .2) {
        const k = span(el - t0 - NANAMI_CLAW_FALL, 0, .2);
        ctx.globalAlpha = fade * (1 - k);
        ctx.fillStyle = '#ffffff';
        sparkle(ctx, 0, 8, 12 + k * 14);
      }
      const since = el - t0 - NANAMI_CLAW_FALL;
      if (e.n === 1) {
        // 抓到了: prize sparkles circling the catch — the "you won" glitter of every crane game.
        ctx.rotate(-sway);
        for (let i = 0, m = count(6, liteFx); i < m; i++) {
          const a = since * 3.5 + i * TAU / m;
          const tw = .5 + .5 * Math.sin(since * 14 + i * 2);
          ctx.globalAlpha = fade * Math.min(1, since / .15) * tw;
          ctx.fillStyle = i % 2 ? '#fff3c4' : NANAMI_FOUR[i % 4];
          sparkle(ctx, Math.cos(a) * 52, 40 + Math.sin(a) * 20, 5 + tw * 3);
        }
      } else if (e.n === 2 && since < .45) {
        // 抓空: it shuts on nothing — a little puff of air squeezed out of the prongs.
        const k = span(since, 0, .45);
        ctx.fillStyle = '#ffffff';
        for (const sd of [-1, 1]) {
          ctx.globalAlpha = fade * (1 - k) * .6;
          dot(ctx, sd * (14 + k * 26), 26 - k * 8, 5 + k * 6);
        }
      }
      break;
    }
    case 'nanami-pin': {
      // 猫かぶり off: the cat hairpin spins out in an arc and comes apart into black and white specks.
      const k = span(el, 0, .5);
      const x = e.x + dir * k * 70, y = e.y - Math.sin(k * Math.PI) * 50 + k * 20;
      // The act drops: one clean ring snapping out from her head, a ripple of the five colours just behind it.
      const rk = span(el, 0, .32);
      if (rk < 1) {
        ctx.globalAlpha = (1 - rk) * .9;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3 * (1 - rk) + .5;
        ctx.beginPath(); ctx.arc(e.x, e.y, 14 + ease(rk) * 70, 0, TAU); ctx.stroke();
        ctx.lineWidth = 4;
        for (let i = 0; i < 5; i++) {
          ctx.globalAlpha = (1 - rk) * .7;
          ctx.strokeStyle = ALL[i];
          const a0 = i / 5 * TAU + el * 3;
          ctx.beginPath(); ctx.arc(e.x, e.y, 8 + ease(rk) * 56, a0, a0 + TAU / 5 - .25); ctx.stroke();
        }
      }
      if (el < .5) {
        ctx.globalAlpha = 1;
        hairpin(ctx, x, y, 11, el * 14 * dir);
      } else {
        burst(el - .5, 71, { n: count(14, liteFx), speed: [60, 180], life: .4, drag: .3 }, (bx, by, q, i) => {
          ctx.globalAlpha = 1 - q;
          ctx.fillStyle = i % 2 ? '#ffffff' : '#1c1820';
          dot(ctx, bx, by, 3 - q * 1.5);
        }, x, y);
        ctx.globalAlpha = (1 - span(el, .5, .75)) * .8;
        glow(ctx, x, y, 26, '255,255,255');
      }
      break;
    }
    case 'nanami-canvas': {
      // The canvas behind her: up on its easel, a swash of each colour as she paints it, the butterfly sketched on it
      // at the end, then it fades.
      const h = e.radius ?? 174;
      const at = (e.t0 ?? 0) + el;
      const up = ease(el / .3);
      const fade = Math.min(1, e.life / .4);
      const cw = h * 1.05, ch = h * .78;
      const cx = e.x - dir * 20, cy = FLOOR - h * .62 - (1 - up) * 40;
      ctx.globalAlpha = fade * up;
      // Easel legs.
      ctx.strokeStyle = '#8a6a4a';
      ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - cw * .3, FLOOR); ctx.lineTo(cx - cw * .05, cy - ch * .55);
      ctx.moveTo(cx + cw * .3, FLOOR); ctx.lineTo(cx + cw * .05, cy - ch * .55);
      ctx.stroke();
      // The canvas: off-white, a thin wooden frame, a faint cloth texture.
      ctx.fillStyle = '#fbf6ee';
      ctx.fillRect(cx - cw / 2, cy - ch / 2, cw, ch);
      ctx.strokeStyle = '#b48a5e';
      ctx.lineWidth = 4;
      ctx.strokeRect(cx - cw / 2, cy - ch / 2, cw, ch);
      ctx.save();
      ctx.beginPath(); ctx.rect(cx - cw / 2 + 3, cy - ch / 2 + 3, cw - 6, ch - 6); ctx.clip();
      for (let i = 0; i < NANAMI_PAINT_STROKES.length; i++) {
        const k = span(at, NANAMI_PAINT_STROKES[i] - .02, NANAMI_PAINT_STROKES[i] + .16);
        if (k <= 0) continue;
        const yy = cy - ch * .32 + i * ch * .21;
        ctx.strokeStyle = NANAMI_FOUR[i];
        ctx.lineWidth = ch * .17;
        ctx.globalAlpha = fade * .92;
        ctx.beginPath();
        const x0 = cx - dir * cw * .45, x1 = x0 + dir * cw * .9 * k;
        ctx.moveTo(x0, yy + Math.sin(i * 2) * 6);
        ctx.quadraticCurveTo((x0 + x1) / 2, yy - 10 + i * 4, x1, yy + Math.cos(i) * 6);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x0, yy - ch * .04 + Math.sin(i * 2) * 6);
        ctx.quadraticCurveTo((x0 + x1) / 2, yy - ch * .04 - 10 + i * 4, x1, yy - ch * .04 + Math.cos(i) * 6);
        ctx.stroke();
        // Wet paint runs: a few drips crawl down from the swash once it's on.
        const run = span(at, NANAMI_PAINT_STROKES[i] + .1, NANAMI_PAINT_STROKES[i] + .9);
        if (run > 0) {
          ctx.fillStyle = NANAMI_FOUR[i];
          for (let j = 0, m = liteFx ? 1 : 3; j < m; j++) {
            const u = .15 + hash(j + i * 3, 87) * .7;
            const dx = cx - dir * cw * .45 + dir * cw * .9 * u;
            const len = (8 + hash(j + i * 3, 88) * 22) * ease(run);
            const dy = yy + ch * .07;
            ctx.fillRect(dx - 2, dy, 4, len);
            dot(ctx, dx, dy + len, 3.2);
          }
        }
      }
      const fin = span(at, NANAMI_PAINT_FINAL - .12, NANAMI_PAINT_FINAL + .05);
      if (fin > 0) {
        ctx.globalAlpha = fade * fin;
        ctx.fillStyle = ORANGE;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, 1);
        for (const sd of [-1, 1]) { ctx.save(); ctx.scale(sd, 1); wing(ctx, ch * .4, 1); ctx.fill(); ctx.restore(); }
        ctx.restore();
      }
      ctx.restore();
      if (fin > 0) {
        ctx.globalAlpha = fade * (1 - span(at, NANAMI_PAINT_FINAL, NANAMI_PAINT_FINAL + .5)) * .7;
        glow(ctx, cx, cy, cw * .7, '255,214,170');
      }
      break;
    }
    case 'nanami-stroke': {
      // One stroke along the floor: a thick band of paint swept out from her, bristle streaks along it, a wet shine,
      // drops flicked off the front; then it dries and fades.
      const len = e.radius ?? 520;
      const k = ease(el / .22);
      const fade = Math.min(1, e.life / .3);
      const rgb = rgbOf(e.color);
      const bandH = 34;
      const x0 = e.x, x1 = e.x + dir * len * k;
      const base = FLOOR - 18;
      const wob = (x: number, i: number) => Math.sin(x * .03 + (e.n ?? 0) * 2 + i) * 4;
      ctx.globalAlpha = fade;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        const x = x0 + (x1 - x0) * i / steps;
        const taper = Math.min(1, i / 2, (steps - i) / 1.5 + .35);
        const y = base - bandH * .5 * taper + wob(x, 0);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      for (let i = steps; i >= 0; i--) {
        const x = x0 + (x1 - x0) * i / steps;
        const taper = Math.min(1, i / 2, (steps - i) / 1.5 + .35);
        ctx.lineTo(x, base + bandH * .5 * taper + wob(x, 3));
      }
      ctx.closePath(); ctx.fill();
      // Bristle streaks: lighter and darker hairlines along the band.
      ctx.lineCap = 'round';
      for (let j = 0; j < (liteFx ? 2 : 4); j++) {
        const oy = (hash(j, 81 + (e.n ?? 0)) - .5) * bandH * .7;
        ctx.strokeStyle = j % 2 ? `rgba(255,255,255,.35)` : `rgba(${rgb},.6)`;
        ctx.globalAlpha = fade;
        ctx.lineWidth = j % 2 ? 2 : 3;
        ctx.beginPath();
        ctx.moveTo(x0 + dir * 10, base + oy + wob(x0, j));
        ctx.lineTo(x1 - dir * 14, base + oy + wob(x1, j));
        ctx.stroke();
      }
      // Wet shine on the top edge, fading as it dries.
      ctx.globalAlpha = fade * (1 - t) * .7;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x0 + dir * 20, base - bandH * .32 + wob(x0, 0));
      ctx.lineTo(x1 - dir * 30, base - bandH * .32 + wob(x1, 0));
      ctx.stroke();
      // Drops flicked off the leading edge while it travels.
      if (el < .35) {
        burst(el, 85 + (e.n ?? 0), { n: count(8, liteFx), speed: [90, 220], life: .35, gravity: 900, angle: dir > 0 ? -.9 : Math.PI + .9, spread: 1.2 }, (x, y, q, i) => {
          ctx.globalAlpha = fade * (1 - q);
          ctx.fillStyle = i % 3 ? e.color : '#ffffff';
          dot(ctx, x, y, 3.4 - q * 1.6);
        }, x1, base - 6);
      }
      // The brush lifts off at the far end: a fat splat of the same colour with a couple of flecks.
      const sp = ease(span(el, .18, .3));
      if (sp > 0) {
        ctx.globalAlpha = fade;
        blob(ctx, x1 + dir * 6, base, 15 * sp, e.color, 120 + (e.n ?? 0));
        blob(ctx, x1 + dir * 26 * sp, base - 14 * sp, 5 * sp, e.color, 121);
        blob(ctx, x1 + dir * 20 * sp, base + 12 * sp, 4 * sp, e.color, 122);
      }
      break;
    }
    case 'nanami-butterfly': {
      // Her own stroke: a butterfly painted out of all five colours, flapping off along the stage on a ribbon of paint,
      // then bursting — and the splash lands as a mirrored blot, an ink-blot test: so what does "ordinary" look like?
      const range = e.radius ?? 520;
      const draw = ease(el / .25);
      const pos = (tt: number) => {
        const fl = span(tt, .2, .7);
        return [e.x + dir * range * .85 * ease(fl), e.y - Math.sin(fl * Math.PI) * 40] as const;
      };
      const fly = span(el, .2, .7);
      const pop = span(el, .7, 1.05);
      const s = 90 * (1 + fly * .25);
      const [x, y] = pos(el);
      const flap = .35 + Math.abs(Math.sin(el * 11)) * .65;
      const fade = 1 - pop;
      const end = Math.min(1, e.life / .35);
      if (fade > 0) {
        // The paint ribbon it leaves: its own path sampled back in time, five colours side by side, tapering off.
        if (fly > 0) {
          const N = liteFx ? 6 : 10;
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (let c = 0; c < (liteFx ? 3 : 5); c++) {
            ctx.strokeStyle = ALL[c];
            ctx.globalAlpha = fade * .85;
            ctx.beginPath();
            for (let j = 0; j <= N; j++) {
              const [px, py] = pos(el - j * .035);
              const wv = Math.sin((el - j * .035) * 11 + c) * 3;
              const off = (c - 2) * 5 * (1 - j / N);
              if (j) ctx.lineTo(px - dir * 10, py + off + wv); else ctx.moveTo(px - dir * 10, py + off + wv);
            }
            ctx.lineWidth = 5;
            ctx.stroke();
          }
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(dir * .12 + Math.sin(el * 11) * .05);
        // A warm glow behind it.
        ctx.globalAlpha = fade * .55;
        glow(ctx, 0, 0, s * 1.4, '255,200,150');
        for (const sd of [-1, 1]) {
          ctx.save();
          ctx.scale(sd * draw, draw);
          wing(ctx, s, flap);
          ctx.clip();
          // Each wing is painted in bands of the five colours, like a stroke per colour.
          for (let i = 0; i < ALL.length; i++) {
            ctx.globalAlpha = fade;
            ctx.fillStyle = ALL[(i + (sd > 0 ? 0 : 2)) % ALL.length];
            ctx.fillRect(-s * .1, -s * 1.1 + i * s * .44, s * 1.4, s * .46);
          }
          // Eyespots: a white ring with a dark pupil on each upper lobe, a small one on the lower.
          ctx.globalAlpha = fade;
          ctx.fillStyle = '#fff8ee';
          ctx.beginPath(); ctx.ellipse(s * .62 * flap, -s * .5, s * .17 * flap, s * .17, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#3a2440';
          ctx.beginPath(); ctx.ellipse(s * .62 * flap, -s * .5, s * .08 * flap, s * .08, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff8ee';
          ctx.beginPath(); ctx.ellipse(s * .5 * flap, s * .45, s * .07 * flap, s * .07, 0, 0, TAU); ctx.fill();
          ctx.globalAlpha = fade * .5;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.ellipse(s * .3 * flap, -s * .72, s * .14 * flap, s * .07, .4, 0, TAU); ctx.fill();
          ctx.restore();
          // A deep outline so it reads over any stage.
          ctx.save();
          ctx.scale(sd * draw, draw);
          wing(ctx, s, flap);
          ctx.globalAlpha = fade;
          ctx.strokeStyle = '#3a2440';
          ctx.lineWidth = 3.5;
          ctx.stroke();
          ctx.restore();
        }
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#3a2440';
        ctx.beginPath(); ctx.ellipse(0, 0, s * .06, s * .34, 0, 0, TAU); ctx.fill();
        // Antennae with paint-drop tips.
        ctx.strokeStyle = '#3a2440';
        ctx.lineWidth = 2.5;
        for (const sd of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(0, -s * .3); ctx.quadraticCurveTo(sd * s * .08, -s * .55, sd * s * .2, -s * .62); ctx.stroke();
          ctx.fillStyle = sd > 0 ? ORANGE : PINK;
          dot(ctx, sd * s * .2, -s * .62, 4);
        }
        ctx.restore();
      }
      if (pop > 0) {
        // The blot: mirrored paint splats round where it burst — a Rorschach butterfly — lingering, then soaking away.
        const bk = ease(span(el, .7, .85));
        const blotFade = end * (1 - span(el, 1.15, e.max)) ;
        for (let i = 0, m = count(9, liteFx); i < m; i++) {
          const ox = (12 + hash(i, 96) * s * 1.1) * bk;
          const oy = (hash(i, 97) - .5) * s * 1.3 * bk;
          const r = (10 + hash(i, 98) * 18) * (1 - Math.abs(oy) / (s * 1.4)) * bk;
          ctx.globalAlpha = blotFade * .9;
          for (const sd of [-1, 1]) blob(ctx, x + sd * ox, y + oy, r, ALL[i % 5], 99 + i);
        }
        ctx.globalAlpha = blotFade;
        ctx.fillStyle = '#3a2440';
        ctx.beginPath(); ctx.ellipse(x, y, 4, s * .3 * bk, 0, 0, TAU); ctx.fill();
        // The burst itself: a flash and blobs of all five colours flung out.
        ctx.globalAlpha = (1 - pop) * .6;
        glow(ctx, x, y, s * (1.2 + pop), '255,226,196');
        burst(el - .7, 93, { n: count(18, liteFx), speed: [180, 460], life: .45, gravity: 700, drag: .4 }, (bx, by, q, i) => {
          ctx.globalAlpha = 1 - q;
          blob(ctx, bx, by, (7 - q * 4) * (.7 + hash(i, 94) * .6), ALL[i % 5], 95 + (i % 4));
        }, x, y);
        // And a few tiny butterflies flutter up out of it.
        for (let i = 0, m = count(4, liteFx); i < m; i++) {
          const u = span(el, .74 + i * .04, e.max);
          if (u <= 0) continue;
          const bx = x + (hash(i, 100) - .5) * 120 + Math.sin(el * 4 + i * 2) * 14;
          const by = y - u * (90 + hash(i, 101) * 70);
          const sz = 9 + hash(i, 102) * 5;
          ctx.globalAlpha = end * Math.min(1, u * 5) * (1 - u * .6);
          ctx.fillStyle = ALL[(i + 1) % 5];
          const fl = .3 + Math.abs(Math.sin(el * 16 + i)) * .7;
          for (const sd of [-1, 1]) {
            ctx.save(); ctx.translate(bx, by); ctx.scale(sd, 1); wing(ctx, sz, fl); ctx.fill(); ctx.restore();
          }
        }
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
