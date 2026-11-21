import type { Effect, Projectile } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import {
  RUI_BOX_BURST, RUI_BOX_FALL, RUI_COLOR, RUI_COLOR_STEP, RUI_FINAL, RUI_STRINGS, RUI_STRING_HIGH, RUI_STRING_LOW, TOKO_FIVE,
} from './clips.ts';
import { TAU, burst, confetti, cycle, dot, glow, hash, sparkle } from './fxParticles.ts';

/* 八潮瑠唯 — 一根线、一张封条、一场巧克力雨、五根弦. Three registers:
   - her green (#669988) with cold white: the foil line and its glass crack, the strings while they are a machine;
   - the student council: cream tape with a small crescent-and-leaf crest (no words on it);
   - Valentine's: pink and dark chocolate heart boxes with one white ribbon.
   For 无意义的旋律 the house loses its colour under the bodies, five even strings lie across the stage, and the colour
   comes back through them — Morfonica's five, one after another — before the resonance. Lines and flat fills only.
   A heart box is painted once (the clip and the ribbon live in the stamp). Each string is one path, stroked twice. */

/** Under every body: the house going grey. */
export const RUI_BACK: readonly string[] = ['rui-grey', 'rui-shadow'];

const GREEN = '#669988';
const GREEN_RGB = '102,153,136';
const MINT_RGB = '196,232,220';
const COLD = '#eaf3f1';
const CREAM = '#f4ecd8';
const CREAM_EDGE = '#d9ccad';
const PINK = '#f27ea8';
const PINK_DEEP = '#d4517f';
const CHOC = '#6b3b2c';
const CHOC_HI = '#8d5440';

const count = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const rgbOf = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return `${v >> 16 & 255},${v >> 8 & 255},${v & 255}`;
};
const FIVE_RGB = TOKO_FIVE.map(rgbOf);
const FIVE_COL = FIVE_RGB.map(rgb => `rgb(${rgb})`);
const MINT_COL = `rgb(${MINT_RGB})`;

const stamps = new Map<string, HTMLCanvasElement | null>();
function stamp(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
  const hit = stamps.get(key);
  if (hit !== undefined) return hit;
  let c: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined') {
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (g) paint(g); else c = null;
  }
  stamps.set(key, c);
  return c;
}

/** The council crest: a crescent moon cupping a small leaf. Centred on x, y, radius r. */
function crest(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.arc(x + r * .38, y - r * .2, r * .78, 0, TAU, true);
  ctx.fill('evenodd');
  ctx.beginPath();
  ctx.ellipse(x + r * .25, y + r * .1, r * .42, r * .2, -.7, 0, TAU);
  ctx.fill();
}

/** A strip of council tape, w long, centred, turned by rot; the crest in the middle. */
function tape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rot: number, wave: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  // Slightly torn ends, a soft flutter along the length.
  ctx.moveTo(-w / 2, -h / 2 + wave);
  ctx.quadraticCurveTo(0, -h / 2 - wave, w / 2, -h / 2 + wave * .6);
  ctx.lineTo(w / 2 - 3, 0);
  ctx.lineTo(w / 2, h / 2 + wave * .6);
  ctx.quadraticCurveTo(0, h / 2 - wave, -w / 2, h / 2 + wave);
  ctx.lineTo(-w / 2 + 3, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = CREAM_EDGE;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // Two thin green rules along the tape, the crest between them.
  ctx.strokeStyle = 'rgba(102,153,136,.6)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-w * .42, -h * .3); ctx.lineTo(w * .42, -h * .3);
  ctx.moveTo(-w * .42, h * .3); ctx.lineTo(w * .42, h * .3);
  ctx.stroke();
  crest(ctx, 0, 0, h * .3);
  ctx.restore();
}

/** A heart box of chocolate: the lid, one white ribbon across and down, a bow, a highlight.
 *  Painted at radius BOX_R; a frame only scales and turns the stamp. The ribbon is a clip in the stamp, not per box. */
const BOX_R = 40, BOX_PX = 120;
function paintHeartBox(ctx: CanvasRenderingContext2D, r: number, dark: boolean): void {
  const heart = () => {
    ctx.beginPath();
    ctx.moveTo(0, r * .9);
    ctx.bezierCurveTo(-r * 1.25, r * .05, -r * .9, -r * 1.05, 0, -r * .42);
    ctx.bezierCurveTo(r * .9, -r * 1.05, r * 1.25, r * .05, 0, r * .9);
    ctx.closePath();
  };
  // The box side peeks under the lid.
  ctx.fillStyle = dark ? '#4a281e' : PINK_DEEP;
  ctx.save(); ctx.translate(0, r * .14); heart(); ctx.fill(); ctx.restore();
  ctx.fillStyle = dark ? CHOC : PINK;
  heart(); ctx.fill();
  ctx.save();
  heart(); ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-r * .1, -r * 1.2, r * .2, r * 2.4);
  ctx.fillRect(-r * 1.3, -r * .2, r * 2.6, r * .2);
  ctx.fillStyle = dark ? 'rgba(255,220,200,.22)' : 'rgba(255,255,255,.35)';
  ctx.beginPath();
  ctx.ellipse(-r * .45, -r * .38, r * .22, r * .12, -.6, 0, TAU);
  ctx.fill();
  ctx.restore();
  // The bow: two loops.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-r * .2, -r * .18, r * .2, r * .11, .5, 0, TAU);
  ctx.ellipse(r * .2, -r * .18, r * .2, r * .11, -.5, 0, TAU);
  ctx.fill();
  dot(ctx, 0, -r * .14, r * .08);
}
function boxStamp(dark: boolean): HTMLCanvasElement | null {
  return stamp(dark ? 'boxD' : 'boxP', BOX_PX, BOX_PX, g => {
    g.translate(BOX_PX / 2, BOX_PX / 2);
    paintHeartBox(g, BOX_R, dark);
  });
}
function heartBox(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, dark: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const c = boxStamp(dark);
  if (c) {
    ctx.scale(r / BOX_R, r / BOX_R);
    ctx.drawImage(c, -BOX_PX / 2, -BOX_PX / 2);
  } else paintHeartBox(ctx, r, dark);
  ctx.restore();
}

/** A string across the stage from x0 to x1 at height y: one standing wave pinned at both ends. Caller strokes it. */
function layString(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, draw: number, ring: number, age: number, lite: boolean): void {
  const n = lite ? 6 : 10;
  const end = x0 + (x1 - x0) * draw;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const x = x0 + (end - x0) * k;
    const off = Math.sin(k * Math.PI) * Math.sin(age * 70 + k * 3) * ring;
    if (i) ctx.lineTo(x, y + off); else ctx.moveTo(x, y + off);
  }
}

export function drawRuiShot(ctx: CanvasRenderingContext2D, p: Projectile, liteFx: boolean): boolean {
  // 情人节收不完: the shots only keep the clock; the falling boxes are effects.
  if (p.fx === 'rui-choco') return true;
  if (p.fx !== 'rui-seal') return false;
  ctx.save();
  const dir = Math.sign(p.vx) || 1;
  ctx.globalAlpha = Math.min(1, p.life / .12, p.age / .05);
  // A few paper flecks shaken off behind it.
  for (let i = 0, nn = count(4, liteFx); i < nn; i++) {
    const k = cycle(p.age, 3, i, 61);
    ctx.globalAlpha = (1 - k) * .7;
    ctx.fillStyle = i % 2 ? CREAM : CREAM_EDGE;
    confetti(ctx, p.x - dir * (16 + k * 46), p.y + (hash(i, 62) - .5) * 20 + k * 10, 3.5, 2, k * 6 + i, p.age * 14 + i);
  }
  ctx.globalAlpha = Math.min(1, p.life / .12, p.age / .05);
  // The strip spins flat like a card thrown.
  const spin = p.age * 16 * dir;
  const w = Math.max(48, p.size * 1.15);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1, .55 + Math.abs(Math.cos(p.age * 9)) * .45);
  tape(ctx, 0, 0, w, 16, spin, Math.sin(p.age * 20) * 1.5);
  ctx.restore();
  ctx.restore();
  return true;
}

export function drawRuiFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false): boolean {
  if (!e.type.startsWith('rui-') && e.type !== 'unfazed') return false;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    case 'rui-thrust': {
      // 一针见血: one straight line out of the bow tip, there in a blink; a cold core, a green halo, a fine point.
      const len = Math.max(20, e.radius ?? 220);
      const draw = ease(el / .05);
      const fade = clamp(e.life / .22, 0, 1);
      const x1 = e.x + dir * len * draw;
      ctx.lineCap = 'round';
      ctx.globalAlpha = fade * .35;
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 9 * (1 - t * .5);
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(x1, e.y); ctx.stroke();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = COLD;
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(x1, e.y); ctx.stroke();
      // The point: a short taper beyond the line's end.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x1 + dir * 14, e.y);
      ctx.lineTo(x1 - dir * 6, e.y - 3.5);
      ctx.lineTo(x1 - dir * 6, e.y + 3.5);
      ctx.closePath(); ctx.fill();
      // Two thin speed hairs behind her hand.
      ctx.globalAlpha = fade * .5;
      ctx.strokeStyle = COLD;
      ctx.lineWidth = 1;
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(e.x + dir * len * .2, e.y + k * 9);
        ctx.lineTo(e.x + dir * len * .2 + dir * len * .45 * draw, e.y + k * 9);
        ctx.stroke();
      }
      break;
    }
    case 'rui-pierce': {
      // The point that leaves no reply: glass cracking out from one spot. A guard (n 1) cracks wider and colder.
      const blocked = e.n === 1;
      const R = blocked ? 46 : 34;
      const grow = ease(el / .08);
      const fade = clamp(e.life / .25, 0, 1);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = blocked ? '#dcebff' : COLD;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU + hash(i, 71) * .5;
        const l = R * grow * (.6 + hash(i, 72) * .5);
        const kink = (hash(i, 73) - .5) * .5;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(a) * l * .5, e.y + Math.sin(a) * l * .5);
        ctx.lineTo(e.x + Math.cos(a + kink) * l, e.y + Math.sin(a + kink) * l);
        ctx.stroke();
      }
      ctx.globalAlpha = fade * (1 - t) * .8;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(e.x, e.y, R * .55 * grow + t * 18, 0, TAU); ctx.stroke();
      ctx.globalAlpha = fade * .9;
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x, e.y, 9 * (1 - t * .6));
      // A few shards falling off.
      burst(el, 74, { n: count(6, liteFx), speed: [60, 160], life: .45, gravity: 420, angle: dir > 0 ? 0 : Math.PI, spread: 2.2 }, (x, y, k) => {
        ctx.globalAlpha = (1 - k) * .85;
        ctx.fillStyle = blocked ? '#cfe3ff' : 'rgba(234,243,241,.9)';
        confetti(ctx, x, y, 3, 1.6, k * 8, k * 10);
      }, e.x, e.y);
      break;
    }
    case 'rui-shadow': {
      // 情人节收不完: a pink shadow on the floor where the chocolate will land; it darkens as the rain comes.
      const R = e.radius ?? 110;
      const a = Math.min(1, el / .15, e.life / .2);
      const pulse = 1 + Math.sin(el * 14) * .03;
      ctx.globalAlpha = a * .32;
      ctx.fillStyle = PINK_DEEP;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, R * pulse, R * .2 * pulse, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = a * .5;
      ctx.strokeStyle = PINK;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, R * .96, R * .19, 0, 0, TAU); ctx.stroke();
      break;
    }
    case 'rui-box': {
      // One box of chocolate. Read from the end: the last RUI_BOX_BURST[n] seconds are the landing, the RUI_BOX_FALL before
      // that the fall.
      const big = e.n === 1 ? 1 : 0;
      const tail = RUI_BOX_BURST[big];
      const r = big ? 40 : 20;
      const dark = big ? false : hash(Math.round(e.x), 75) > .5;
      if (e.life > tail) {
        const k = 1 - (e.life - tail) / RUI_BOX_FALL;
        if (k <= 0) break;
        // In from above, a little sideways, turning.
        const y = e.y - r - (1 - k * k) * (H * .9);
        const x = e.x - dir * (1 - k) * 60;
        ctx.globalAlpha = Math.min(1, k * 3);
        heartBox(ctx, x, y, r, dir * (1 - k) * 1.2 + dir * .15, dark);
        break;
      }
      const k = 1 - e.life / tail;
      // The bounce, then it breaks into pink glints and little hearts of cocoa dust.
      if (k < .45) {
        const b = k / .45;
        const hop = Math.sin(b * Math.PI) * r * .5;
        const squash = b < .15 ? 1 - (1 - b / .15) * .25 : 1;
        ctx.globalAlpha = 1 - b * .4;
        ctx.save();
        ctx.translate(e.x, e.y - r * .9 - hop);
        ctx.scale(1 / squash, squash);
        heartBox(ctx, 0, 0, r, dir * .15, dark);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      burst(el - (e.max - tail), 76 + big, { n: count(big ? 12 : 6, liteFx), speed: big ? [80, 260] : [50, 150], life: tail, gravity: 260, angle: -Math.PI / 2, spread: 2.6 }, (x, y, kk, i) => {
        ctx.globalAlpha = (1 - kk) * .9;
        ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? PINK : CHOC_HI;
        if (i % 3 === 0) sparkle(ctx, x, y, 4 + (1 - kk) * 3);
        else dot(ctx, x, y, 2.6 * (1 - kk * .5));
      }, e.x, e.y - r * .6);
      if (big && k < .5) {
        ctx.globalAlpha = (1 - k / .5) * .45;
        ctx.strokeStyle = PINK;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, 30 + k * 220, 8 + k * 40, 0, 0, TAU); ctx.stroke();
      }
      break;
    }
    case 'rui-grey': {
      // 无意义的旋律: the house loses its colour under the bodies, then gets it back from the strings. el is the attack clock.
      const into = clamp(el / .3, 0, 1);
      const back = clamp((el - RUI_COLOR) / (RUI_FINAL - RUI_COLOR + .2), 0, 1);
      const a = into * (1 - back);
      if (a <= .01) break;
      ctx.globalAlpha = a * .92;
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = '#808080';
      ctx.fillRect(-W, -H, W * 3, H * 3);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a * .14;
      ctx.fillStyle = '#18222a';
      ctx.fillRect(-W, -H, W * 3, H * 3);
      break;
    }
    case 'rui-strings': {
      // Five strings, evenly spaced and perfectly straight: a machine. From RUI_COLOR each takes a colour of Morfonica
      // and the light of it comes back; at RUI_FINAL they ring together and fade.
      const len = e.radius ?? 560;
      const x0 = e.x + dir * 30, x1 = e.x + dir * (len + 120);
      const out = clamp(e.life / .3, 0, 1);
      ctx.lineCap = 'round';
      RUI_STRINGS.forEach((at, i) => {
        const age = el - at;
        if (age < 0) return;
        const low = i % 2 === 0;
        const y = FLOOR - (low ? RUI_STRING_LOW + i * 9 : RUI_STRING_HIGH + i * 7);
        const draw = ease(age / .09);
        const colorAt = RUI_COLOR + i * RUI_COLOR_STEP;
        const hue = clamp((el - colorAt) / .18, 0, 1);
        const finalAge = el - RUI_FINAL;
        const ring = finalAge > 0 ? 7 * Math.exp(-finalAge * 4) : 5 * Math.exp(-age * 7) + (hue > 0 && hue < 1 ? 3 : 0);
        // The halo and the core share one path: cold at first, the member's colour once it turns.
        layString(ctx, x0, x1, y, draw, ring, el, liteFx);
        ctx.globalAlpha = out * (.22 + hue * .3);
        ctx.strokeStyle = hue > 0 ? FIVE_COL[i] : MINT_COL;
        ctx.lineWidth = 8 + hue * 6;
        ctx.stroke();
        ctx.globalAlpha = out;
        ctx.strokeStyle = hue >= 1 ? FIVE_COL[i] : COLD;
        ctx.lineWidth = 1.8 + hue * .8;
        ctx.stroke();
        if (hue > 0 && hue < 1) {
          // The colour runs down the string from her end.
          ctx.globalAlpha = out * (1 - hue);
          ctx.fillStyle = '#ffffff';
          sparkle(ctx, x0 + (x1 - x0) * hue, y, 8);
        }
        // Where the bow struck it: a small bright knot at her end while it is fresh.
        if (age < .25) {
          ctx.globalAlpha = (1 - age / .25) * out;
          glow(ctx, x0, y, 26, hue > 0 ? FIVE_RGB[i] : MINT_RGB);
        }
      });
      break;
    }
    case 'rui-wave': {
      // The resonance: one wide, soft green swell rolling forward, a white crest on it, two echoes behind.
      const R = e.radius ?? 560;
      const go = ease(el / .5);
      const fade = clamp(e.life / .35, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const k = clamp(go - i * .12, 0, 1);
        if (k <= 0) continue;
        const x = e.x + dir * R * k;
        const h = 150 + k * 90;
        ctx.globalAlpha = fade * (i ? .18 : .32) * (1 - k * .3);
        ctx.strokeStyle = `rgb(${i === 1 ? MINT_RGB : GREEN_RGB})`;
        ctx.lineWidth = i ? 10 : 24;
        ctx.beginPath();
        ctx.ellipse(x - dir * 40, e.y - h * .45, 52, h * .55, 0, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : Math.PI * 1.5);
        ctx.stroke();
        if (!i) {
          ctx.globalAlpha = fade * .8;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      // A handful of five-colour motes riding the crest.
      for (let i = 0, nn = count(10, liteFx); i < nn; i++) {
        const k = clamp(go - hash(i, 81) * .2, 0, 1);
        ctx.globalAlpha = fade * (1 - k * .5);
        ctx.fillStyle = TOKO_FIVE[i % 5];
        dot(ctx, e.x + dir * R * k - dir * 30, e.y - 30 - hash(i, 82) * 200, 2.5 + hash(i, 83) * 2);
      }
      break;
    }
    case 'unfazed': {
      // 绷住了: a status met nothing. One short level line at her brow and a cool glint — she did not move.
      const fade = clamp(e.life / .3, 0, 1) * Math.min(1, el / .06);
      const y = e.y - 196;
      ctx.globalAlpha = fade * .9;
      ctx.strokeStyle = COLD;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      const w = 14 + ease(el / .15) * 16;
      ctx.beginPath(); ctx.moveTo(e.x - w, y); ctx.lineTo(e.x + w, y); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x + w, y, 6 * (1 - t));
      break;
    }
  }
  ctx.restore();
  return true;
}

/* ---- 'rui-seal' (沉默 from 取消使用许可): two strips of council tape crossed on the chest, the crest where they meet ---- */

export function auraRuiSeal(ctx: CanvasRenderingContext2D, f: Fighter, bodyH: number, left: number, t: number): void {
  const fade = Math.min(1, left / .3);
  const y = f.y - bodyH * .56;
  ctx.save();
  ctx.globalAlpha = fade * .95;
  const flap = Math.sin(t * 6) * 1.4;
  tape(ctx, f.x, y, 66, 15, .62, flap);
  tape(ctx, f.x, y, 66, 15, -.62, -flap);
  ctx.fillStyle = CREAM;
  dot(ctx, f.x, y, 9);
  crest(ctx, f.x, y, 6);
  ctx.restore();
}
export function applyRuiSeal(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  burst(age, 91, { n: 10, speed: [60, 150], life: .55, gravity: 180, drag: .5 }, (x, y, k, i) => {
    ctx.globalAlpha = (1 - k) * .9;
    ctx.fillStyle = i % 3 ? CREAM : GREEN;
    confetti(ctx, x, y, 4, 2.4, k * 7 + i, age * 12 + i);
  }, e.x, e.y - 105);
  ctx.restore();
}
