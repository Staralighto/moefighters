import type { Effect, Projectile } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, clamp } from '../game/constants.ts';
import { CELL, TENSORA_EGG, TENSORA_WAIL } from './clips.ts';
import { TAU, dot, glow, hash, sparkle } from './fxParticles.ts';

/* 天素罗 — 奶黄的毛绒、橙色的小脚、浅蓝的眼泪。治愈搞笑，不画任何会让人心疼的东西：挨打只飞绒毛和面衣碎屑。
   Four registers, one per move, so each reads at a glance:
   - 最神速的脚脚: the feet become two spinning orange smears (bigger and hotter on chip fuel), speed lines and
     little 火车头 steam puffs off her back, a dust skid at the stop;
   - 欧耶！: sweat drops and pressure ticks while she strains, a pop of sparkles and notes, the 天素球 (egg.png, or a
     drawn egg until it arrives) and the chick that hatches — her own walk cells, small;
   - 薯片挑战: one ridged golden chip at her mouth, then the crunch: a cone of flakes falling under gravity;
   - 坏人类！: blush and pressure while she puffs up, two cartoon tear fountains, and the ripples — flat ellipses of
     water rolling out along the floor with a bright wet front and droplets thrown off it.
   Flat shapes and the cached glow / sparkle stamps only; no shadowBlur. The busiest moment (the cry with a full
   choir) stays under ~60 shapes. */

export const TENSORA_BACK: readonly string[] = ['tensora-fat', 'tensora-stomp', 'tensora-skid', 'tensora-lay'];

const SHEET = '/sprites/tensora/common.png';
const EGG = '/sprites/tensora/egg.png';
const YELLOW = '#FFD84A';
const ORANGE = '#FF9A3C';
const CRUMB = '#f2c14e';
const CRUMB_DARK = '#c98a2a';
const TEAR = '#8fd3ff';
const TEAR_DEEP = '#4fa8e6';
const BLUSH = '#ff8aa8';

const TEAR_DASH = [12, 10];
const NO_DASH: number[] = [];
const STAR_16 = Array.from({ length: 16 }, (_, i) => {
  const a = i * TAU / 16, r = i % 2 ? .45 : 1;
  return [Math.cos(a) * r, Math.sin(a) * r] as const;
});

const n = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const fadeIO = (el: number, life: number, a: number, b: number) => clamp(Math.min(el / a, life / b), 0, 1);
const frac = (x: number) => x - Math.floor(x);

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth > 0 && im.naturalHeight > 0 ? im : undefined;
}

/* ---- small shapes ---- */

function puff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.arc(x + r * .8, y + r * .15, r * .72, 0, TAU);
  ctx.arc(x - r * .75, y + r * .2, r * .62, 0, TAU);
  ctx.fill();
}
function drop(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.7);
  ctx.bezierCurveTo(r * .9, -r * .5, r, r * .2, 0, r);
  ctx.bezierCurveTo(-r, r * .2, -r * .9, -r * .5, 0, -r * 1.7);
  ctx.fill();
  ctx.restore();
}
function note(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath(); ctx.ellipse(x, y, r, r * .72, -.4, 0, TAU); ctx.fill();
  ctx.fillRect(x + r * .72, y - r * 3, r * .3, r * 3);
  ctx.beginPath(); ctx.moveTo(x + r * 1.02, y - r * 3); ctx.quadraticCurveTo(x + r * 2.2, y - r * 2.4, x + r * 1.7, y - r * 1.5); ctx.lineTo(x + r * 1.02, y - r * 2.3); ctx.fill();
}
function chip(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = CRUMB;
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * .74, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = CRUMB_DARK;
  ctx.lineWidth = Math.max(1, r * .1);
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.moveTo(-r * .7, i * r * .32); ctx.quadraticCurveTo(0, i * r * .32 - r * .18, r * .7, i * r * .32); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.ellipse(-r * .35, -r * .3, r * .22, r * .12, -.4, 0, TAU); ctx.fill();
  ctx.restore();
}
/** A drawn 天素球 until egg.png arrives: translucent orange, a sleeping chick curled inside. */
function eggShape(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, wob: number): void {
  const w = h * .78;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(wob);
  const gr = ctx.createRadialGradient(-w * .15, -h * .62, h * .05, 0, -h * .45, h * .62);
  gr.addColorStop(0, 'rgba(255,236,170,.95)');
  gr.addColorStop(.7, 'rgba(255,170,70,.85)');
  gr.addColorStop(1, 'rgba(230,120,40,.9)');
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.bezierCurveTo(w * .62, -h, w * .55, 0, 0, 0);
  ctx.bezierCurveTo(-w * .55, 0, -w * .62, -h, 0, -h);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,224,110,.9)';
  ctx.beginPath(); ctx.ellipse(0, -h * .38, w * .26, h * .2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(150,100,60,.7)';
  ctx.fillRect(-w * .12, -h * .42, w * .08, 1.5);
  ctx.fillRect(w * .05, -h * .42, w * .08, 1.5);
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.beginPath(); ctx.ellipse(-w * .2, -h * .72, w * .08, h * .12, -.3, 0, TAU); ctx.fill();
  ctx.restore();
}

/* ---- U 最神速的脚脚 ---- */

function drawStamp(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const dir = e.dir ?? 1, r = e.radius ?? 130;
  const a = fadeIO(el, e.life, .05, .1);
  for (let i = 0; i < 4; i++) {
    const k = frac(el * 5 + i * .25);
    ctx.globalAlpha = a * (1 - k) * .55;
    glow(ctx, e.x + (i % 2 ? .12 : -.12) * r - dir * k * 18, FLOOR - 6 - k * 10, 10 + k * 14, '217,199,160');
  }
  ctx.globalAlpha = a * .8;
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1, y = FLOOR - 14 - Math.abs(Math.sin(el * 30 + i * 1.6)) * 10;
    ctx.beginPath(); ctx.arc(e.x + s * r * .14, y, 9, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  }
}
function drawFeet(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const dir = e.dir ?? 1, r = e.radius ?? 130, hot = e.n === 1;
  const a = fadeIO(el, e.life, .03, .08);
  // Speed lines behind her: thin wedges, sharp at the tail, so they read as motion and not as bars.
  ctx.fillStyle = hot ? '#ffe2a8' : '#fff3c4';
  const lines = n(hot ? 8 : 6, lite);
  for (let i = 0; i < lines; i++) {
    const y = FLOOR - 14 - hash(i, 3) * r * .7;
    const len = (46 + hash(i, 4) * 64) * (hot ? 1.45 : 1);
    const off = frac(el * 5 + hash(i, 5));
    const x0 = e.x - dir * (r * .3 + off * 26), x1 = x0 - dir * len, w = 1.2 + hash(i, 6) * 1.4;
    ctx.globalAlpha = a * (1 - off) * .7;
    ctx.beginPath(); ctx.moveTo(x0, y - w); ctx.lineTo(x0, y + w); ctx.lineTo(x1, y); ctx.closePath(); ctx.fill();
  }
  // The two feet pump so fast they leave a fan of fading copies behind them.
  for (let i = 0; i < 2; i++) {
    const ph = el * 34 + i * Math.PI;
    const fx = e.x + dir * (i ? 9 : -12) + Math.cos(ph) * dir * 9, fy = FLOOR - 8 - Math.max(0, Math.sin(ph)) * 7;
    if (!lite) {
      ctx.globalAlpha = a * (hot ? .45 : .3);
      glow(ctx, fx - dir * 6, fy, hot ? 24 : 18, hot ? '255,140,40' : '255,175,90');
    }
    ctx.fillStyle = ORANGE;
    for (let k = 3; k >= 1; k--) {
      ctx.globalAlpha = a * (.42 - k * .12);
      ctx.beginPath(); ctx.ellipse(fx - dir * k * 9, fy + k, 10 + k * 2, 6, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.ellipse(fx, fy, 10, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd2a0';
    ctx.beginPath(); ctx.ellipse(fx + dir * 2.5, fy - 2.2, 4, 1.8, 0, 0, TAU); ctx.fill();
  }
  // Dust kicked up off the heels.
  for (let i = 0; i < n(3, lite); i++) {
    const k = frac(el * 3.5 + i / 3);
    ctx.globalAlpha = a * (1 - k) * .45;
    glow(ctx, e.x - dir * (18 + k * 50), FLOOR - 4 - k * 10, 7 + k * 12, '217,199,160');
  }
  if (hot && !lite) {
    // Chip fuel burning: a few hot sparks thrown off the heels.
    ctx.fillStyle = '#ffcf5a';
    for (let i = 0; i < 6; i++) {
      const k = frac(el * 4 + hash(i, 7));
      ctx.globalAlpha = a * (1 - k);
      dot(ctx, e.x - dir * (20 + k * 60), FLOOR - 6 - k * 26 * hash(i, 8), 2.2);
    }
  }
}
function drawKick(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const dir = e.dir ?? 1, k = ease(el / e.max), r = e.radius ?? 80;
  ctx.globalAlpha = (1 - k) * .6;
  for (let i = 0; i < 4; i++) glow(ctx, e.x - dir * (k * r * (.5 + i * .25)), FLOOR - 8 - i * 6 * k, 14 + k * 16, '217,199,160');
}
function drawSteam(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  // 火车头: a two-tone puff (a cool shade under a white top) that swells and drifts back off her.
  const dir = e.dir ?? 1, k = el / e.max, r = (e.radius ?? 14) * (1 + k * 1.4);
  const x = e.x - dir * k * 40, y = e.y - k * 34;
  ctx.globalAlpha = (1 - k) * .55;
  ctx.fillStyle = '#c9d3e6';
  puff(ctx, x + dir * r * .12, y + r * .22, r);
  ctx.globalAlpha = (1 - k) * .85;
  ctx.fillStyle = '#ffffff';
  puff(ctx, x, y, r * .86);
}
function drawBonk(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const k = el / e.max, a = 1 - k;
  if (a <= .02) return;
  const r = e.radius ?? 40;
  // A thin ring first, then the soft comic star.
  ctx.globalAlpha = a * .8;
  ctx.strokeStyle = '#fff3c4';
  ctx.lineWidth = 3 * a + .5;
  ctx.beginPath(); ctx.arc(e.x, e.y, r * (.4 + ease(k) * .9), 0, TAU); ctx.stroke();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#fff6d0';
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(k * .6);
  const s = r * (.5 + ease(k * 2) * .6);
  ctx.beginPath();
  for (let i = 0; i < 16; i++) ctx.lineTo(STAR_16[i][0] * s, STAR_16[i][1] * s);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = YELLOW;
  ctx.globalAlpha = a * .9;
  ctx.beginPath(); ctx.arc(0, 0, s * .3, 0, TAU); ctx.fill();
  ctx.restore();
  // Fluff: a few tufts of yellow plush, never anything sharper.
  ctx.fillStyle = YELLOW;
  ctx.globalAlpha = a * .9;
  for (let i = 0; i < n(6, lite); i++) {
    const ang = hash(i, 1) * TAU, d = ease(k) * r * (1.1 + hash(i, 2));
    dot(ctx, e.x + Math.cos(ang) * d, e.y + Math.sin(ang) * d + k * k * 30, 3 + hash(i, 3) * 2.5);
  }
}
function drawSkid(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const dir = e.dir ?? 1, k = el / e.max;
  ctx.globalAlpha = (1 - k) * .5;
  for (let i = 0; i < 3; i++) glow(ctx, e.x - dir * (8 + i * 14 + k * 20), FLOOR - 4 - i * 3, 12 + i * 4 + k * 10, '217,199,160');
}

/* ---- I 欧耶！ ---- */

function drawStrain(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const r = e.radius ?? 65, a = fadeIO(el, e.life, .06, .05);
  const p = clamp(el / e.max, 0, 1);
  // Pressure ticks on both sides, closing in.
  ctx.globalAlpha = a * .85;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    for (const s of [-1, 1]) {
      const ang = (-.5 + i * .5) * .5, d = r * (1.35 - p * .2) + Math.sin(el * 40 + i) * 2;
      const cx = e.x + s * Math.cos(ang) * d, cy = e.y + Math.sin(ang) * d;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + s * 10, cy + Math.sin(ang) * 6); ctx.stroke();
    }
  }
  // Sweat drops off the top.
  ctx.fillStyle = TEAR;
  for (let i = 0; i < 2; i++) {
    const k = frac(el * 2.2 + i * .5);
    ctx.globalAlpha = a * (1 - k);
    drop(ctx, e.x + (i ? 1 : -1) * r * (.6 + k * .3), e.y - r * .9 + k * 18, 4.5, (i ? .5 : -.5));
  }
}
function drawPop(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const k = el / e.max, r = e.radius ?? 80;
  ctx.globalAlpha = 1 - k;
  for (let i = 0; i < n(8, lite); i++) {
    const ang = -Math.PI / 2 + (hash(i, 1) - .5) * 2.4, d = ease(k * 1.4) * r * (.7 + hash(i, 2) * .6);
    ctx.fillStyle = i % 3 ? YELLOW : '#ffffff';
    sparkle(ctx, e.x + Math.cos(ang) * d, e.y + Math.sin(ang) * d, 6 + hash(i, 3) * 6);
  }
  ctx.fillStyle = ORANGE;
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    ctx.globalAlpha = (1 - k) * .95;
    note(ctx, e.x + s * (r * .45 + k * 20), e.y - k * 46 - i * 8, 5.5);
  }
}
function drawLay(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const k = ease(el / e.max), r = e.radius ?? 34;
  ctx.globalAlpha = (1 - k) * .8;
  ctx.strokeStyle = '#fff3c4';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(e.x, FLOOR - 2, r * (.6 + k), r * (.2 + k * .25), 0, 0, TAU); ctx.stroke();
}
function drawPoof(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const k = el / e.max, r = (e.radius ?? 30) * (.7 + k * .6);
  ctx.globalAlpha = (1 - k) * .7;
  ctx.fillStyle = e.color;
  puff(ctx, e.x, e.y - k * 14, r * .6);
}
function drawHatch(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const k = el / e.max, a = 1 - k;
  if (a <= .02) return;
  ctx.globalAlpha = a;
  for (let i = 0; i < n(7, lite); i++) {
    const ang = -Math.PI / 2 + (hash(i, 1) - .5) * 2.6, v = 120 + hash(i, 2) * 120;
    const x = e.x + Math.cos(ang) * v * el, y = Math.min(e.y + Math.sin(ang) * v * el + 420 * el * el, FLOOR - 3);
    const spin = el * 9 * (hash(i, 3) - .5), c = Math.cos(spin), s = Math.sin(spin);
    ctx.fillStyle = i % 2 ? '#ffb45a' : '#ffe2a8';
    ctx.beginPath();
    ctx.moveTo(x - 6 * c, y - 6 * s);
    ctx.lineTo(x + 7 * s, y - 7 * c);
    ctx.lineTo(x + 6 * c - 2 * s, y + 6 * s + 2 * c);
    ctx.lineTo(x + c - 4 * s, y + s + 4 * c);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  sparkle(ctx, e.x, e.y - 34 - k * 20, 10 * a);
}
function drawFizzle(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  // 耶不出来: a little grey cloud that sags, and one drop of sweat sliding off it.
  const k = el / e.max;
  ctx.globalAlpha = Math.min(1, el / .1) * (1 - k) * .85;
  ctx.fillStyle = '#c9c3d6';
  puff(ctx, e.x, e.y + k * 10, 13 * (1 - k * .3));
  ctx.fillStyle = TEAR;
  drop(ctx, e.x + 16, e.y + 8 + ease(k) * 26, 4);
  ctx.strokeStyle = '#8f88a2';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(e.x - 30, e.y - 14 + k * 8); ctx.quadraticCurveTo(e.x - 22, e.y - 4, e.x - 28, e.y + 6 + k * 8); ctx.stroke();
}

/* ---- O 薯片挑战 ---- */

function drawChip(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const dir = e.dir ?? 1;
  ctx.globalAlpha = fadeIO(el, e.life, .05, .04);
  chip(ctx, e.x + dir * 6, e.y + Math.sin(el * 14) * 2, 15, dir * (.25 + Math.sin(el * 9) * .12));
}
function drawCrumbs(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const dir = e.dir ?? 1, reach = e.radius ?? 150, k = el / e.max, a = 1 - k * .8;
  if (a > .02) {
    ctx.globalAlpha = a;
    for (let i = 0; i < n(16, lite); i++) {
      const ang = (hash(i, 1) - .5) * .9 - .15, v = reach * (1.6 + hash(i, 2) * 1.6);
      const x = e.x + dir * Math.cos(ang) * v * el;
      let y = e.y + Math.sin(ang) * v * el + 520 * el * el, spin = el * 12 * (hash(i, 3) - .5);
      // A flake that reaches the floor lies there and fades with the rest.
      if (y > FLOOR - 2) { y = FLOOR - 2; spin = hash(i, 3) * 3; }
      const c = Math.cos(spin), s = Math.sin(spin);
      // Shards, not squares: an uneven three-cornered flake with a lighter edge.
      const sz = 2.5 + hash(i, 4) * 4;
      ctx.fillStyle = i % 3 ? CRUMB : CRUMB_DARK;
      ctx.beginPath();
      ctx.moveTo(x - sz * c - sz * .5 * s, y - sz * s + sz * .5 * c);
      ctx.lineTo(x + sz * .2 * c + sz * .8 * s, y + sz * .2 * s - sz * .8 * c);
      ctx.lineTo(x + sz * c - sz * .6 * s, y + sz * s + sz * .6 * c);
      ctx.closePath(); ctx.fill();
      if (sz > 4 && i % 3) {
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.moveTo(x - sz * .4 * c + sz * .1 * s, y - sz * .4 * s - sz * .1 * c);
        ctx.lineTo(x + sz * .3 * c + sz * .1 * s, y + sz * .3 * s - sz * .1 * c);
        ctx.lineTo(x + sz * .3 * c - sz * .12 * s, y + sz * .3 * s + sz * .12 * c);
        ctx.lineTo(x - sz * .4 * c - sz * .12 * s, y - sz * .4 * s + sz * .12 * c);
        ctx.closePath(); ctx.fill();
      }
    }
  }
  // One crunch flash at the mouth.
  if (el < .14) {
    ctx.globalAlpha = 1 - el / .14;
    ctx.fillStyle = '#fff6d0';
    sparkle(ctx, e.x + dir * 8, e.y, 16);
  }
}
/** The face is on the front of the ball: both cheeks sit on that side, the far one a little further round. */
function cheeks(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, r: number, w: number, h: number): void {
  ctx.beginPath(); ctx.ellipse(x + dir * r * .22, y + r * .14, w, h, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + dir * r * .6, y + r * .1, w * .6, h * .9, 0, 0, TAU); ctx.fill();
}
function drawMunch(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const r = e.radius ?? 65, k = el / e.max, b = 1 + Math.abs(Math.sin(el * 18)) * .15;
  ctx.globalAlpha = (1 - k) * .55;
  ctx.fillStyle = BLUSH;
  cheeks(ctx, e.x, e.y, e.dir ?? 1, r, 8 * b, 5 * b);
}

/* ---- L 坏人类！ ---- */

function drawPuff(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const r = e.radius ?? 70, p = clamp(el / e.max, 0, 1), a = fadeIO(el, e.life, .06, .04);
  ctx.globalAlpha = a * (.35 + p * .45);
  ctx.fillStyle = BLUSH;
  cheeks(ctx, e.x, e.y, e.dir ?? 1, r, 9 + p * 4, 5.5 + p * 2);
  // Fuming: little puffs off the top, quicker as she fills up.
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 2; i++) {
    const k = frac(el * (1.6 + p * 2.4) + i * .5);
    ctx.globalAlpha = a * (1 - k) * .8;
    puff(ctx, e.x + (i ? 1 : -1) * r * (.32 + k * .25), e.y - r * 1.05 - k * 24, 6 + k * 5);
  }
  // Shaking: tremble arcs either side.
  ctx.globalAlpha = a * p * .8;
  ctx.strokeStyle = BLUSH;
  ctx.lineWidth = 2.5;
  for (const s of [-1, 1]) {
    const j = Math.sin(el * 46) * 2;
    ctx.beginPath(); ctx.arc(e.x + j, e.y, r * 1.18, s > 0 ? -.4 : Math.PI - .4, s > 0 ? .4 : Math.PI + .4); ctx.stroke();
  }
}
function drawTears(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  // Two cartoon fountains out of her eyes: a gushing arc each side (a wide pale band, a bright core that flows),
  // splashing where it lands, and a few loose drops thrown off the arc.
  const r = e.radius ?? 130, big = e.n === 1 ? 1.3 : 1;
  const a = fadeIO(el, e.life, .06, .25);
  if (a <= .02) return;
  const gush = 1 + Math.sin(el * 26) * .12;
  ctx.lineCap = 'round';
  ctx.globalAlpha = a * .4;
  ctx.strokeStyle = TEAR;
  ctx.lineWidth = 9 * big;
  for (const s of [-1, 1]) {
    const x0 = e.x + s * r * .18, y0 = e.y;
    const x2 = e.x + s * r * 1.15 * big * gush, y2 = FLOOR - 3;
    const cx = e.x + s * r * .62 * big, cy = e.y - r * .62 * big * gush;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
  }
  ctx.globalAlpha = a * .85;
  ctx.strokeStyle = '#e6f7ff';
  ctx.lineWidth = 3;
  ctx.setLineDash(TEAR_DASH);
  ctx.lineDashOffset = -el * 160;
  for (const s of [-1, 1]) {
    const x0 = e.x + s * r * .18, y0 = e.y;
    const x2 = e.x + s * r * 1.15 * big * gush, y2 = FLOOR - 3;
    const cx = e.x + s * r * .62 * big, cy = e.y - r * .62 * big * gush;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
  }
  ctx.setLineDash(NO_DASH);
  for (const s of [-1, 1]) {
    const x0 = e.x + s * r * .18, y0 = e.y;
    const x2 = e.x + s * r * 1.15 * big * gush, y2 = FLOOR - 3;
    const cx = e.x + s * r * .62 * big, cy = e.y - r * .62 * big * gush;
    // Landing splash.
    ctx.fillStyle = '#d6f1ff';
    for (let i = 0; i < n(3, lite); i++) {
      const k = frac(el * 3 + i / 3);
      ctx.globalAlpha = a * (1 - k);
      dot(ctx, x2 + s * (k * 18 + i * 4), y2 - Math.sin(k * Math.PI) * (10 + i * 5), 2.4);
    }
    // Loose drops thrown off the arc.
    ctx.fillStyle = TEAR;
    ctx.globalAlpha = a * .9;
    for (let i = 0; i < n(4, lite); i++) {
      const t = frac(el * 1.8 + hash(i, s > 0 ? 3 : 4));
      const u = 1 - t, px = u * u * x0 + 2 * u * t * cx + t * t * x2, py = u * u * y0 + 2 * u * t * cy + t * t * y2;
      drop(ctx, px + s * 8 * hash(i, 5), py - 6 - hash(i, 6) * 8, 3.2, s * (1.2 - t * 2.4));
    }
  }
}
function drawStomp(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  // Each stamp of the feet: a small splash ring on the floor, alternating left and right.
  const r = e.radius ?? 70, a = fadeIO(el, e.life, .04, .2);
  const beat = .16;
  for (let i = 0; i < 2; i++) {
    const k = frac((el + i * beat) / (beat * 2));
    const s = (Math.floor((el + i * beat) / (beat * 2)) + i) % 2 ? 1 : -1;
    ctx.globalAlpha = a * (1 - k) * .7;
    ctx.strokeStyle = TEAR;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(e.x + s * r * .22, FLOOR - 2, 8 + k * 22, 2 + k * 5, 0, 0, TAU); ctx.stroke();
  }
}
function drawSob(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const k = el / e.max;
  ctx.fillStyle = TEAR;
  for (const s of [-1, 1]) {
    ctx.globalAlpha = 1 - k;
    drop(ctx, e.x + s * (8 + k * 14), e.y - 6 + k * 18, 3.5, s * .6);
  }
}
function drawSplash(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const k = el / e.max, r = e.radius ?? 40;
  for (let i = 0; i < n(8, lite); i++) {
    const ang = -Math.PI / 2 + (hash(i, 1) - .5) * 2.2, v = r * (3 + hash(i, 2) * 3);
    const x = e.x + Math.cos(ang) * v * el, y = e.y - 6 + Math.sin(ang) * v * el + 600 * el * el;
    if (y > FLOOR) continue;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = i % 2 ? TEAR : '#e2f5ff';
    dot(ctx, x, y, 2.5 + hash(i, 3) * 2.5);
  }
}

/* ---- 胖宝宝 ---- */

function drawFat(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  // 大胖: a soft warm pool under her and a few satisfied sparkles drifting up. It thins as the clock runs out.
  const r = e.radius ?? 80, a = fadeIO(el, e.life, .3, .5);
  ctx.globalAlpha = a * .35;
  glow(ctx, e.x, FLOOR - 4, r * 1.3, '255,200,90');
  ctx.fillStyle = '#fff3c4';
  for (let i = 0; i < n(4, lite); i++) {
    const k = frac(el * .6 + hash(i, 1));
    ctx.globalAlpha = a * Math.sin(k * Math.PI) * .9;
    sparkle(ctx, e.x + (hash(i, 2) - .5) * r * 2, e.y + r * .8 - k * r * 2, 4 + hash(i, 3) * 3);
  }
}
function drawFatOn(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const k = ease(el / e.max), r = e.radius ?? 90;
  ctx.globalAlpha = (1 - k) * .9;
  ctx.strokeStyle = YELLOW;
  ctx.lineWidth = 5 * (1 - k) + 1;
  ctx.beginPath(); ctx.arc(e.x, e.y, r * (.6 + k * .9), 0, TAU); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) {
    const ang = i * TAU / 6 + .3;
    sparkle(ctx, e.x + Math.cos(ang) * r * (.7 + k), e.y + Math.sin(ang) * r * (.7 + k), 7 * (1 - k));
  }
}

export function drawTensoraFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false): boolean {
  if (!e.type.startsWith('tensora-')) return false;
  if (e.life <= 0 || !(e.max > 0)) return true;
  const el = Math.max(0, e.max - e.life);
  ctx.save();
  switch (e.type) {
    case 'tensora-stamp': drawStamp(ctx, e, el); break;
    case 'tensora-feet': drawFeet(ctx, e, el, liteFx); break;
    case 'tensora-kick': drawKick(ctx, e, el); break;
    case 'tensora-steam': drawSteam(ctx, e, el); break;
    case 'tensora-bonk': drawBonk(ctx, e, el, liteFx); break;
    case 'tensora-skid': drawSkid(ctx, e, el); break;
    case 'tensora-strain': drawStrain(ctx, e, el); break;
    case 'tensora-pop': drawPop(ctx, e, el, liteFx); break;
    case 'tensora-lay': drawLay(ctx, e, el); break;
    case 'tensora-poof': drawPoof(ctx, e, el); break;
    case 'tensora-hatch': drawHatch(ctx, e, el, liteFx); break;
    case 'tensora-fizzle': drawFizzle(ctx, e, el); break;
    case 'tensora-chip': drawChip(ctx, e, el); break;
    case 'tensora-crumbs': drawCrumbs(ctx, e, el, liteFx); break;
    case 'tensora-munch': drawMunch(ctx, e, el); break;
    case 'tensora-puff': drawPuff(ctx, e, el); break;
    case 'tensora-tears': drawTears(ctx, e, el, liteFx); break;
    case 'tensora-stomp': drawStomp(ctx, e, el); break;
    case 'tensora-sob': drawSob(ctx, e, el); break;
    case 'tensora-splash': drawSplash(ctx, e, el, liteFx); break;
    case 'tensora-fat': drawFat(ctx, e, el, liteFx); break;
    case 'tensora-fat-on': drawFatOn(ctx, e, el); break;
  }
  ctx.restore();
  return true;
}

/* ---- shots: the egg and the chick, and the ripples ---- */

/** The chick is her own walk cells at a little under half her size. */
const CHICK = 62;
function drawEgg(ctx: CanvasRenderingContext2D, p: Projectile, images: ImageCache | undefined): void {
  const face = p.face ?? 1;
  const base = FLOOR;
  if (!p.settled) {
    // Rocking a little more as the hatch comes near.
    const near = clamp(p.age / TENSORA_EGG.hatch, 0, 1);
    const wob = Math.sin(p.age * (6 + near * 18)) * (.04 + near * near * .16);
    const pop = clamp(p.age / .18, 0, 1);
    const im = image(images, EGG);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(p.x, base - 1, 18, 4, 0, 0, TAU); ctx.fill();
    if (im) {
      const h = 58 * (.4 + .6 * ease(pop)), w = h * im.naturalWidth / im.naturalHeight;
      ctx.save(); ctx.translate(p.x, base); ctx.rotate(wob); ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore();
    } else {
      eggShape(ctx, p.x, base, 54 * (.4 + .6 * ease(pop)), wob);
    }
    return;
  }
  const im = image(images, SHEET);
  const step = Math.floor(p.age * 10) % 4;
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(p.x, base - 1, 20, 4, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(p.x, base + 2);
  ctx.scale(face, 1);
  ctx.rotate(Math.sin(p.age * 20) * .06);
  if (im) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(im, (1 + step) * CELL, 0, CELL, CELL, -CHICK / 2, -CHICK, CHICK, CHICK);
  } else {
    ctx.fillStyle = YELLOW;
    ctx.beginPath(); ctx.arc(0, -CHICK * .42, CHICK * .34, 0, TAU); ctx.fill();
    ctx.fillStyle = ORANGE;
    ctx.fillRect(-10, -6, 7, 6); ctx.fillRect(4, -6, 7, 6);
  }
  ctx.restore();
}
function ring(ctx: CanvasRenderingContext2D, x: number, rx: number, ry: number, back: number, front: number, width: number): void {
  if (rx <= 0 || ry <= 0) return;
  // The far half of the ring is dimmer and thinner than the near half, so it lies flat on the floor.
  ctx.globalAlpha = back;
  ctx.lineWidth = width * .6;
  ctx.beginPath(); ctx.ellipse(x, FLOOR - 2, rx, ry, 0, Math.PI, TAU); ctx.stroke();
  ctx.globalAlpha = front;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.ellipse(x, FLOOR - 2, rx, ry, 0, 0, Math.PI); ctx.stroke();
}
function drawRipple(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean): void {
  const r = p.radius, small = !!p.returned;
  if (r <= 1 || p.life <= 0) return;
  const fade = clamp(p.life / .25, 0, 1);
  if (fade <= .02) return;
  const flat = (rr: number) => rr * .12 + 3;
  // A thin sheen of water over the whole wet patch.
  ctx.globalAlpha = fade * (small ? .1 : .14);
  ctx.fillStyle = TEAR;
  ctx.beginPath(); ctx.ellipse(p.x, FLOOR - 2, r, flat(r), 0, 0, TAU); ctx.fill();
  // Trailing rings behind the front, thinning toward the centre.
  ctx.strokeStyle = TEAR;
  const rings = n(small ? 2 : 3, lite);
  for (let i = rings; i >= 1; i--) {
    const rr = r - i * (small ? 22 : 36);
    if (rr <= 4) continue;
    const k = i / (rings + 1);
    ring(ctx, p.x, rr, flat(rr), fade * (1 - k) * .25, fade * (1 - k) * .6, 2.4);
  }
  // The wet front: a deep blue band with a bright lip on the near side.
  ctx.strokeStyle = TEAR_DEEP;
  ring(ctx, p.x, r, flat(r), fade * .35, fade * .6, small ? 5 : 7);
  if (r > 2) {
    ctx.strokeStyle = '#eef9ff';
    ring(ctx, p.x, r - 2, flat(r - 2), fade * .3, fade * .95, small ? 1.6 : 2.2);
  }
  // Droplets thrown up off both ends.
  ctx.fillStyle = '#d6f1ff';
  const drops = n(small ? 3 : 5, lite);
  for (const s of [-1, 1]) {
    for (let i = 0; i < drops; i++) {
      const k = frac(p.age * 3 + hash(i, s > 0 ? 1 : 2));
      ctx.globalAlpha = fade * (1 - k) * .9;
      dot(ctx, p.x + s * (r - 6 + hash(i, 3) * 14), FLOOR - 6 - Math.sin(k * Math.PI) * (small ? 18 : 30) * (.6 + hash(i, 4) * .6), 2.2 + hash(i, 5) * 1.6);
    }
  }
}
export function drawTensoraShot(ctx: CanvasRenderingContext2D, p: Projectile, liteFx: boolean, images?: ImageCache): boolean {
  if (p.fx === 'tensora-egg') { ctx.save(); drawEgg(ctx, p, images); ctx.restore(); return true; }
  if (p.fx === 'tensora-ripple') { ctx.save(); drawRipple(ctx, p, liteFx); ctx.restore(); return true; }
  return false;
}
