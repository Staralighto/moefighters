import type { Effect, Projectile } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { CELL, HAGUMI_CROQUETTE_SRC, HAGUMI_MICHELLE_H, HAGUMI_MICHELLE_LIFT, HAGUMI_MICHELLE_SRC } from './clips.ts';
import { TAU, burst, confetti, dot, glow, hash, sparkle, streak } from './fxParticles.ts';

/* 北泽育美 — 元气橙、金黄的可乐饼、商店街. Registers:
   - orange (#FF9922, deep #d9650b, lit #ffc26a) for her own marks; croquette gold (#f0b24a) with a toasted crust
     (#b8661c) and pale breadcrumbs for everything that is food; 米歇尔 pink (#ff8fd4) only around the bear;
   - 绕商店街跑十圈: a starting-block kick of dust, orange speed lines and two stretched afterimage strokes riding
     with her, little dust puffs on her heels, a skid spray at each turn, a crow flapping along overhead that she
     outruns, and an orange impact star on each body she runs through;
   - 刚出锅的快速球: a windmill swoosh at the release; the croquette itself (croquette.png, or a drawn one) spinning
     with a crumb trail and two steam curls; on the floor it sits steaming in a soft warm glow (it can be eaten);
     a burst of crumbs on a hit, and crumbs plus a sparkle when she eats one;
   - 挂上米歇尔！: two pink hearts as she calls, 米歇尔 itself (its own walk cells from misaki/michelle.png) running,
     a puff where she jumps on, the bear's big sweat drop at the end (奥泽小姐你辛苦了);
   - 可乐饼盛情难却: 北泽精肉店's orange-and-white striped awning drops in at the top of the screen over a warm grade;
     croquettes rain onto the patch and settle into a small heap; a crumb bonk on each head they hit; a giant
     croquette whose shadow grows on the floor before it lands, a dust ring, and the pile they are buried under.
   Flat fills and cached stamps only, no shadowBlur; the rain is about 24 croquettes at once (12 on lite). */

export const HAGUMI_BACK: readonly string[] = ['hagumi-michelle'];
export const HAGUMI_SCREEN_BACK: readonly string[] = ['hagumi-shop'];

const ORANGE = '#FF9922';
const ORANGE_DEEP = '#d9650b';
const ORANGE_LIT = '#ffc26a';
const CRUST = '#b8661c';
const GOLDEN = '#f0b24a';
const CRUMB = '#ffe3a3';
const CREAM = '#fff4dd';
const PINK = '#ff8fd4';
const INK = '#3a1d08';

const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

/* ---- shapes ---- */

/** A croquette `w` wide, centred, turned by rot: croquette.png when it has loaded, else a drawn oval with a crust
 *  rim, a lighter top and a few crumbs. */
export function croquette(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, rot: number, im?: HTMLImageElement): void {
  if (!(w > 0)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (im) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(im, -w * .56, -w * .56, w * 1.12, w * 1.12);
  } else {
    const h = w * .62;
    ctx.fillStyle = CRUST;
    ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = GOLDEN;
    ctx.beginPath(); ctx.ellipse(-w * .03, -h * .06, w * .43, h * .38, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = CRUMB;
    for (let i = 0; i < 6; i++) dot(ctx, (hash(i, 7) - .5) * w * .7, (hash(i, 8) - .55) * h * .6, Math.max(1, w * .035));
    ctx.globalAlpha *= .55;
    ctx.fillStyle = '#fff6da';
    ctx.beginPath(); ctx.ellipse(-w * .12, -h * .22, w * .16, h * .08, -.2, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/** Two rising steam curls above (x, y): soft white S-strokes drifting up and fading. */
function steam(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, clock: number, a = 1): void {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const u = (clock * .9 + i * .5) % 1;
    ctx.globalAlpha = a * .55 * Math.sin(Math.PI * u);
    ctx.lineWidth = size * .09 * (1 - u * .5);
    const sx = x + (i ? size * .2 : -size * .18);
    const sy = y - size * .2 - u * size * .9;
    ctx.beginPath();
    ctx.moveTo(sx, sy + size * .3);
    ctx.bezierCurveTo(sx + size * .22, sy + size * .15, sx - size * .22, sy - size * .05, sx + size * .04, sy - size * .25);
    ctx.stroke();
  }
  ctx.restore();
}

/** A comic impact star: `points` spikes between r and r*.5, filled. */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, points: number, rot: number): void {
  if (!(r > 0)) return;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + i * Math.PI / points;
    const d = i % 2 ? r * .5 : r;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fill();
}

function puff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (!(r > 0)) return;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

/** A small heart, centred, size s. */
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  if (!(s > 0)) return;
  ctx.beginPath();
  ctx.moveTo(x, y + s * .55);
  ctx.bezierCurveTo(x - s * 1.1, y - s * .2, x - s * .5, y - s * .95, x, y - s * .35);
  ctx.bezierCurveTo(x + s * .5, y - s * .95, x + s * 1.1, y - s * .2, x, y + s * .55);
  ctx.fill();
}

/** A crow seen from the side, wings at `flap` (−1 up … 1 down), beak toward +x. Current fillStyle. */
function crow(ctx: CanvasRenderingContext2D, s: number, flap: number): void {
  ctx.beginPath(); ctx.ellipse(0, 0, s, s * .38, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(s * .85, -s * .18, s * .3, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 1.1, -s * .22); ctx.lineTo(s * 1.45, -s * .1); ctx.lineTo(s * 1.1, -s * .04); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-s * .9, 0); ctx.lineTo(-s * 1.5, -s * .3); ctx.lineTo(-s * 1.5, s * .25); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * .3, -s * .1);
  ctx.quadraticCurveTo(-s * .1, -s * 1.3 * -flap, s * .5, -s * 1.1 * -flap - s * .2 * (1 - Math.abs(flap)));
  ctx.lineTo(s * .35, -s * .1);
  ctx.fill();
}

/** 米歇尔's walk cell: running (cols 1–4) or standing (col 0), feet at the origin, facing +x. */
function michelle(ctx: CanvasRenderingContext2D, im: HTMLImageElement | undefined, col: number): void {
  const h = HAGUMI_MICHELLE_H;
  if (im) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(im, col * CELL, 0, CELL, CELL, -h / 2, -h - HAGUMI_MICHELLE_LIFT, h, h);
    return;
  }
  // No picture yet: a round pink bear shape.
  ctx.fillStyle = PINK;
  ctx.beginPath(); ctx.ellipse(0, -h * .34, h * .2, h * .3, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(h * .04, -h * .78, h * .16, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(-h * .08, -h * .93, h * .05, 0, TAU); ctx.arc(h * .15, -h * .93, h * .05, 0, TAU); ctx.fill();
}

/* ---- effects ---- */

export function drawHagumiFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('hagumi-')) return false;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  const n = (full: number) => liteFx ? Math.ceil(full / 2) : full;
  ctx.save();
  switch (e.type) {
    /* ---- U 绕商店街跑十圈 ---- */
    case 'hagumi-kick': {
      // Off the blocks: a fan of dust kicked back from her heel.
      ctx.fillStyle = '#e9d8bd';
      burst(el, 31, { n: n(12), speed: [120, 380], life: .5, gravity: 420, drag: .2, angle: dir > 0 ? Math.PI + .5 : -.5, spread: 1.1 }, (x, y, k) => {
        ctx.globalAlpha = (1 - k) * .8;
        puff(ctx, x, y, 7 * (1 - k * .4) + 2);
      }, e.x, e.y - 6);
      break;
    }
    case 'hagumi-speed': {
      // Riding with her: two stretched orange afterimage strokes and white speed lines streaming off the back.
      const clock = e.age ?? el;
      ctx.globalAlpha = Math.min(1, e.life / .12);
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.lineCap = 'round';
      const on = Math.min(1, e.life / .12);
      // Two comet wedges riding at chest and hip height: fat at her back, a point far behind, a hot pale core.
      for (let i = 0; i < 2; i++) {
        const yy = -70 - i * 50 + Math.sin(clock * 30 + i) * 2;
        const hw = 15 - i * 4, len = 170 + i * 40;
        ctx.globalAlpha = on * (.42 - i * .14);
        ctx.fillStyle = ORANGE;
        ctx.beginPath();
        ctx.moveTo(-10, yy - hw); ctx.quadraticCurveTo(-len * .4, yy - hw * .7, -len, yy); ctx.quadraticCurveTo(-len * .4, yy + hw * .7, -10, yy + hw);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = on * (.55 - i * .2);
        ctx.fillStyle = ORANGE_LIT;
        ctx.beginPath();
        ctx.moveTo(-14, yy - hw * .35); ctx.quadraticCurveTo(-len * .3, yy - hw * .2, -len * .6, yy); ctx.quadraticCurveTo(-len * .3, yy + hw * .2, -14, yy + hw * .35);
        ctx.closePath(); ctx.fill();
      }
      // Sparks of 体力 BUG flicked off behind her.
      ctx.fillStyle = '#fff2c0';
      for (let i = 0, m = n(4); i < m; i++) {
        const u = (clock * 2.6 + hash(i, 44)) % 1;
        ctx.globalAlpha = on * (1 - u);
        sparkle(ctx, -30 - u * 140, -40 - hash(i, 45) * 120 + u * 20, 5 * (1 - u) + 1);
      }
      ctx.strokeStyle = CREAM;
      for (let i = 0, m = n(7); i < m; i++) {
        const y = -16 - hash(i, 41) * 150;
        const len = 40 + hash(i, 42) * 80;
        const x0 = -40 - ((clock * 1400 + hash(i, 43) * 220) % 200);
        ctx.globalAlpha = Math.min(1, e.life / .12) * .6;
        streak(ctx, x0, y, x0 - len, y, 2.2);
      }
      break;
    }
    case 'hagumi-dust': {
      ctx.fillStyle = e.color;
      const k = ease(t);
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = (1 - t) * .55;
        puff(ctx, e.x - dir * (k * 30 + i * 9), e.y - 6 - k * 14 - i * 3, (5 + i * 2) * (.6 + k * .7));
      }
      break;
    }
    case 'hagumi-skid': {
      // The skid and turn: dust thrown forward off the planted foot, and two little skid streaks on the floor.
      ctx.fillStyle = e.color;
      burst(el, 37, { n: n(14), speed: [160, 420], life: .45, gravity: 600, drag: .15, angle: dir > 0 ? -.4 : Math.PI + .4, spread: 1.2 }, (x, y, k) => {
        ctx.globalAlpha = (1 - k) * .75;
        puff(ctx, x, y, 6 * (1 - k * .5) + 1.5);
      }, e.x, e.y - 4);
      ctx.strokeStyle = '#b9a58a';
      ctx.lineCap = 'round';
      ctx.globalAlpha = (1 - t) * .7;
      streak(ctx, e.x - dir * 50, e.y - 1, e.x, e.y - 1, 3);
      streak(ctx, e.x - dir * 34, e.y + 3, e.x + dir * 6, e.y + 3, 2);
      break;
    }
    case 'hagumi-crow': {
      // 几乎能追上全速飞行的乌鸦: a crow sets off with her at 520 px/s; she runs at 980 and leaves it behind.
      const x = e.x + dir * 520 * el;
      const y = e.y + Math.sin(el * 5) * 8;
      if (x < -60 || x > W + 60) break;
      const a0 = Math.min(1, el / .15, e.life / .3);
      // Overtaken in a flash: the wind of her passing knocks a few feathers loose — they drift down behind it.
      ctx.fillStyle = e.color;
      for (let i = 0, m = n(3); i < m; i++) {
        const born = .12 + i * .07;
        const u = el - born;
        if (u < 0 || u > 1.1) continue;
        ctx.globalAlpha = a0 * (1 - u / 1.1);
        const fx = e.x + dir * 520 * born - dir * u * 30 + Math.sin(u * 7 + i) * 12;
        const fy = e.y + u * 70;
        ctx.save();
        ctx.translate(fx, fy); ctx.rotate(Math.sin(u * 7 + i) * .8);
        ctx.beginPath(); ctx.ellipse(0, 0, 7, 2.4, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = a0;
      ctx.translate(x, y);
      ctx.scale(dir, 1);
      ctx.fillStyle = e.color;
      // A startled flinch right as she shoots past, then flapping harder to keep up.
      const shock = 1 - span(el, .1, .35);
      ctx.rotate(-shock * .25);
      crow(ctx, 15, Math.sin(el * (26 + (1 - shock) * 14)));
      if (el > .1 && el < .9) {
        ctx.globalAlpha = a0 * (1 - span(el, .6, .9));
        ctx.fillStyle = '#bfe6ff';
        const sy = -22 + span(el, .1, .6) * 8;
        ctx.beginPath();
        ctx.moveTo(4, sy - 9); ctx.quadraticCurveTo(10, sy, 4, sy + 4); ctx.quadraticCurveTo(-2, sy, 4, sy - 9);
        ctx.fill();
      }
      break;
    }
    case 'hagumi-bump': {
      // Run through: an orange comic star with a white core and a spray of tiny dots; the way back is bigger.
      const big = (e.n ?? 0) >= 1 ? 1.35 : 1;
      const k = ease(el / .1);
      ctx.globalAlpha = 1 - span(el, .12, e.max);
      ctx.fillStyle = e.color;
      star(ctx, e.x, e.y, 30 * k * big, 8, el * 4);
      ctx.fillStyle = '#fff8e6';
      star(ctx, e.x, e.y, 15 * k * big, 8, el * 4 + .2);
      ctx.fillStyle = ORANGE_LIT;
      burst(el, 53, { n: n(8), speed: [160, 320], life: .35, drag: .2, angle: dir > 0 ? 0 : Math.PI, spread: 2.4 }, (x, y, kk) => {
        ctx.globalAlpha = 1 - kk;
        dot(ctx, x, y, 3 * (1 - kk) + 1);
      }, e.x, e.y);
      break;
    }

    /* ---- I 刚出锅的快速球 ---- */
    case 'hagumi-pitch': {
      // The windmill: a bright arc swept up and over the shoulder and down to the release point.
      const k = ease(el / .14);
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.lineCap = 'round';
      ctx.globalAlpha = 1 - span(el, .1, e.max);
      // The windmill as a crescent that thickens toward the release (the arm's speed), white-hot at the leading edge.
      const a0 = Math.PI * .1, a1 = Math.PI * (.1 + 1.5 * k);
      ctx.fillStyle = ORANGE_LIT;
      ctx.beginPath();
      const N = 12;
      for (let i = 0; i <= N; i++) {
        const a = a0 + (a1 - a0) * i / N;
        const r = 48 + (i / N) ** 2 * 11;
        if (i) ctx.lineTo(-30 + Math.cos(a) * r, -40 + Math.sin(a) * r); else ctx.moveTo(-30 + Math.cos(a) * r, -40 + Math.sin(a) * r);
      }
      for (let i = N; i >= 0; i--) {
        const a = a0 + (a1 - a0) * i / N;
        const r = 48 - (i / N) ** 2 * 6;
        ctx.lineTo(-30 + Math.cos(a) * r, -40 + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(-30, -40, 52, Math.PI * (.1 + .9 * k), a1, false); ctx.stroke();
      // 投球！: a pop of rays at the release point.
      const rk = span(el, .1, .26);
      if (rk > 0 && rk < 1) {
        const rx = -30 + Math.cos(a1) * 50, ry = -40 + Math.sin(a1) * 50;
        ctx.globalAlpha = 1 - rk;
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU + .3;
          streak(ctx, rx + Math.cos(a) * (8 + rk * 14), ry + Math.sin(a) * (8 + rk * 14), rx + Math.cos(a) * (16 + rk * 24), ry + Math.sin(a) * (16 + rk * 24), 2.5);
        }
      }
      break;
    }
    case 'hagumi-crumbs': {
      // A hit: a comic impact star, the croquette bursting into crumbs, and a puff of steam.
      const sk = ease(el / .07);
      ctx.globalAlpha = 1 - span(el, .08, .26);
      ctx.fillStyle = ORANGE;
      star(ctx, e.x, e.y, 30 * sk, 7, el * 3);
      ctx.fillStyle = '#fff8e6';
      star(ctx, e.x, e.y, 15 * sk, 7, el * 3 + .25);
      ctx.fillStyle = GOLDEN;
      burst(el, 61, { n: n(16), speed: [140, 380], life: .55, gravity: 700, drag: .3 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = i % 3 ? GOLDEN : CRUMB;
        dot(ctx, x, y, 3.2 * (1 - k * .5) + .8);
      }, e.x, e.y);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = (1 - t) * .4;
      puff(ctx, e.x, e.y - ease(t) * 20, 16 + ease(t) * 14);
      break;
    }
    case 'hagumi-plop': {
      ctx.fillStyle = CRUMB;
      burst(el, 67, { n: n(6), speed: [60, 160], life: .35, gravity: 600, angle: -Math.PI / 2, spread: 2.2 }, (x, y, k) => {
        ctx.globalAlpha = 1 - k;
        dot(ctx, x, y, 2.4);
      }, e.x, e.y - 8);
      break;
    }
    case 'hagumi-munch': {
      // Eaten: crumbs off her mouth, a warm sparkle and a small orange heart floating up.
      ctx.fillStyle = CRUMB;
      burst(el, 71, { n: n(8), speed: [50, 140], life: .45, gravity: 500, angle: Math.PI / 2, spread: 2.6 }, (x, y, k) => {
        ctx.globalAlpha = 1 - k;
        dot(ctx, x, y, 2.2);
      }, e.x, e.y);
      ctx.globalAlpha = 1 - span(t, .5, 1);
      ctx.fillStyle = '#fff2c0';
      sparkle(ctx, e.x + dir * 14, e.y - 14 - ease(t) * 10, 8 * Math.sin(Math.PI * Math.min(1, t * 1.6)));
      ctx.fillStyle = ORANGE;
      heart(ctx, e.x - dir * 6, e.y - 26 - ease(t) * 34, 7);
      break;
    }

    /* ---- O 挂上米歇尔！ ---- */
    case 'hagumi-call': {
      // 米歇尔～！ Two pink hearts popping up over her head.
      ctx.fillStyle = PINK;
      for (let i = 0; i < 2; i++) {
        const u = span(el, i * .08, .45);
        if (u <= 0) continue;
        ctx.globalAlpha = 1 - span(u, .6, 1);
        heart(ctx, e.x + (i ? 16 : -14) * dir, e.y - ease(u) * 26 - i * 6, 7 + 3 * Math.sin(Math.PI * u));
      }
      break;
    }
    case 'hagumi-michelle': {
      // 米歇尔 itself: running in, carrying her (with its own speed lines), then stopping with a little wobble.
      const clock = e.age ?? el;
      const mode = e.n ?? 0;
      const im = image(images, HAGUMI_MICHELLE_SRC);
      ctx.globalAlpha = mode === 2 ? Math.min(1, e.life / .3) : Math.min(1, el / .08, e.life / .12);
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      if (mode < 2) {
        ctx.strokeStyle = '#ffe1f3';
        ctx.lineCap = 'round';
        for (let i = 0, m = n(mode ? 5 : 3); i < m; i++) {
          const y = -30 - hash(i, 81) * 140;
          const len = 30 + hash(i, 82) * 60;
          const x0 = -70 - ((clock * 1000 + hash(i, 83) * 180) % 140);
          streak(ctx, x0, y, x0 - len, y, 2);
        }
        ctx.save();
        ctx.translate(0, -Math.abs(Math.sin(clock * 20)) * 4);
        michelle(ctx, im, 1 + Math.floor(clock * 12) % 4);
        ctx.restore();
        if (mode === 1) {
          const h = HAGUMI_MICHELLE_H;
          const a0 = ctx.globalAlpha;
          // 呼…呼…: the one inside is out of breath — puffs huffed out of the bear's head, blown back by the run.
          ctx.fillStyle = '#ffffff';
          for (let i = 0; i < 3; i++) {
            const u = (clock * 2.4 + i / 3) % 1;
            ctx.globalAlpha = a0 * (1 - u) * .75;
            puff(ctx, h * .2 - u * 70, -h * .74 - u * 12 + Math.sin(u * 9 + i) * 3, 5 + u * 9);
          }
          // …while she's having the time of her life: pink and orange hearts tumbling off behind.
          for (let i = 0, m = n(4); i < m; i++) {
            const u = (clock * 1.7 + hash(i, 84)) % 1;
            ctx.globalAlpha = a0 * Math.sin(Math.PI * u);
            ctx.fillStyle = i % 2 ? ORANGE : PINK;
            heart(ctx, -50 - u * 110, -h * (.95 + hash(i, 85) * .35) - u * 26, 6 + hash(i, 86) * 3);
          }
          ctx.globalAlpha = a0;
        }
      } else {
        ctx.rotate(Math.sin(clock * 30) * .03);
        michelle(ctx, im, 0);
      }
      break;
    }
    case 'hagumi-hop': {
      ctx.fillStyle = e.color;
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5 + .3;
        const d = 14 + ease(t) * 26;
        ctx.globalAlpha = (1 - t) * .7;
        puff(ctx, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * .6, 10 * (1 - t * .5));
      }
      break;
    }
    case 'hagumi-sweat': {
      // 奥泽小姐你辛苦了: one big drop sliding down beside the bear's head, and three short worry lines.
      const k = ease(el / .25);
      ctx.globalAlpha = 1 - span(t, .7, 1);
      const x = e.x - dir * 52, y = e.y + k * 22;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.moveTo(x, y - 18);
      ctx.bezierCurveTo(x + 13, y - 2, x + 11, y + 12, x, y + 12);
      ctx.bezierCurveTo(x - 11, y + 12, x - 13, y - 2, x, y - 18);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha *= .8;
      ctx.beginPath(); ctx.ellipse(x - 3.5, y + 2, 2.4, 4.5, -.3, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#7fa6c9';
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * .45;
        streak(ctx, e.x + dir * 30 + Math.cos(a) * 12, e.y - 8 + Math.sin(a) * 12, e.x + dir * 30 + Math.cos(a) * 24, e.y - 8 + Math.sin(a) * 24, 2.5);
      }
      break;
    }
    case 'hagumi-michelle-off': {
      // A soft puff at its feet as it stops.
      ctx.fillStyle = '#f1e6d6';
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = (1 - t) * .6;
        puff(ctx, e.x + (i - 1.5) * 22 * (.6 + ease(t)), e.y - 8 - ease(t) * 10, 9 + ease(t) * 6);
      }
      break;
    }

    /* ---- L 可乐饼盛情难却 ---- */
    case 'hagumi-shop': {
      // 北泽精肉店: a warm grade over the stage and a scalloped orange-and-white awning dropping in at the top.
      const clock = e.age ?? el;
      const on = clamp(Math.min(clock / .3, e.life / .45), 0, 1);
      ctx.globalAlpha = on * .28;
      const grade = ctx.createLinearGradient(0, 0, 0, H);
      grade.addColorStop(0, 'rgba(255,170,80,1)');
      grade.addColorStop(1, 'rgba(120,50,10,1)');
      ctx.fillStyle = grade;
      ctx.fillRect(0, 0, W, H);
      const drop = ease(clock / .35);
      const depth = 54;
      const y0 = -depth + (depth + 4) * drop - (1 - on) * 30;
      const stripe = 48;
      ctx.globalAlpha = on;
      for (let i = 0, x = 0; x < W; i++, x += stripe) {
        ctx.fillStyle = i % 2 ? '#fff4e2' : ORANGE;
        ctx.fillRect(x, 0, stripe, Math.max(0, y0));
        // The scallop hanging under each stripe.
        ctx.beginPath(); ctx.arc(x + stripe / 2, y0, stripe / 2, 0, Math.PI); ctx.fill();
      }
      ctx.fillStyle = ORANGE_DEEP;
      ctx.fillRect(0, Math.max(0, y0 - 6), W, 4);
      // A few warm lights twinkling along the edge.
      ctx.fillStyle = '#fff2c0';
      for (let i = 0; i < 10; i++) {
        ctx.globalAlpha = on * (.5 + .5 * Math.sin(clock * 6 + i * 1.7));
        dot(ctx, (i + .5) * W / 10, y0 + 30, 2.6);
      }
      // Two round paper lanterns hung off the awning, swaying on their cords.
      for (const lx of [W * .16, W * .84]) {
        const sw = Math.sin(clock * 2.2 + lx) * .12;
        const cord = 26;
        ctx.save();
        ctx.translate(lx, y0 + 18);
        ctx.rotate(sw);
        ctx.globalAlpha = on;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, cord); ctx.stroke();
        ctx.globalAlpha = on * .35;
        glow(ctx, 0, cord + 20, 46, '255,190,100');
        ctx.globalAlpha = on;
        ctx.fillStyle = '#ff7a2a';
        ctx.beginPath(); ctx.ellipse(0, cord + 20, 17, 20, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffb35c';
        ctx.beginPath(); ctx.ellipse(0, cord + 20, 9, 20, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = INK;
        ctx.fillRect(-8, cord - 1, 16, 4);
        ctx.fillRect(-8, cord + 38, 16, 4);
        ctx.restore();
      }
      break;
    }
    case 'hagumi-rain': {
      // Croquettes raining onto the patch: each falls from above the screen in .45 s, tumbling, and lands with a
      // crumb pop; the ones that landed stay in a small heap until the rain ends.
      const clock = e.age ?? el;
      const half = e.radius ?? 160;
      const im = image(images, HAGUMI_CROQUETTE_SRC);
      const fade = Math.min(1, e.life / .4);
      const rate = liteFx ? 22 : 40;
      const fallT = .45;
      const total = Math.floor(clock * rate);
      // A soft warm pool on the patch so it reads as the place to leave.
      ctx.globalAlpha = .35 * fade;
      glow(ctx, e.x, e.y - 6, half * 1.05, '255,190,90');
      const heap = Math.min(total, liteFx ? 6 : 10);
      for (let i = 0; i < heap; i++) {
        ctx.globalAlpha = fade;
        const hx = e.x + (hash(i, 91) - .5) * half * 1.6;
        croquette(ctx, hx, e.y - 9 - (i > 5 ? 10 : 0), 30, (hash(i, 92) - .5) * .9, im);
      }
      const first = Math.max(0, Math.floor((clock - fallT) * rate));
      for (let i = first; i <= total; i++) {
        const born = i / rate;
        const u = (clock - born) / fallT;
        if (u < 0 || u > 1) continue;
        const x = e.x + (hash(i, 93) - .5) * half * 2;
        const y = -40 + (e.y - 14 + 40) * u * u;
        ctx.globalAlpha = fade * .3 * u;
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.ellipse(x, e.y - 2, 6 + u * 12, 2 + u * 2.5, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = fade;
        croquette(ctx, x, y, 30 + hash(i, 94) * 10, born * 7 + u * (hash(i, 95) * 8 - 4), im);
      }
      // Crumb pops where the latest ones landed.
      ctx.fillStyle = CRUMB;
      for (let j = 0; j < 3; j++) {
        const i = first - 1 - j;
        if (i < 0) break;
        const since = clock - (i / rate + fallT);
        if (since < 0 || since > .25) continue;
        const x = e.x + (hash(i, 93) - .5) * half * 2;
        for (let c = 0; c < 4; c++) {
          ctx.globalAlpha = fade * (1 - since / .25);
          dot(ctx, x + (c - 1.5) * 9 * (1 + since * 6), e.y - 12 - since * 60 * (1 - c % 2 * .4) + since * since * 500, 2);
        }
      }
      break;
    }
    case 'hagumi-bonk': {
      // A croquette bonks a head: a small gold star and a few crumbs.
      const k = ease(el / .08);
      ctx.globalAlpha = 1 - span(el, .1, e.max);
      ctx.fillStyle = GOLDEN;
      star(ctx, e.x, e.y, 16 * k, 6, (e.n ?? 0) * .7);
      ctx.fillStyle = CRUMB;
      burst(el, 101 + (e.n ?? 0), { n: n(6), speed: [80, 200], life: .35, gravity: 600, angle: -Math.PI / 2, spread: 2.4 }, (x, y, kk) => {
        ctx.globalAlpha = 1 - kk;
        dot(ctx, x, y, 2.2);
      }, e.x, e.y);
      break;
    }
    case 'hagumi-giant': {
      // The giant one: its shadow spreads on the floor, then it drops out of the sky, spinning slowly, and stays a
      // moment as it squashes down on landing.
      const fall = e.t0 ?? .4;
      const w = (e.radius ?? 160) * 1.5;
      const u = clamp(el / fall, 0, 1);
      ctx.globalAlpha = .35 * u * Math.min(1, e.life / .2);
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 2, w * .5 * (.4 + .6 * u), 10 * (.4 + .6 * u), 0, 0, TAU); ctx.fill();
      const landed = el >= fall;
      const y = landed ? e.y - w * .26 : -w + (e.y - w * .26 + w) * u * u;
      const squash = landed ? 1 - .14 * Math.sin(Math.PI * clamp((el - fall) / .2, 0, 1)) : 1;
      ctx.globalAlpha = Math.min(1, e.life / .2);
      ctx.save();
      ctx.translate(e.x, y + w * .3 * (1 - squash));
      ctx.scale(1 + (1 - squash) * .6, squash);
      croquette(ctx, 0, 0, w, landed ? .05 : u * .6 - .3, image(images, HAGUMI_CROQUETTE_SRC));
      ctx.restore();
      if (!landed) {
        // A golden glint sweeping across the crust as it turns in the light.
        const gx = e.x + (u * 2 - 1) * w * .45;
        ctx.globalAlpha = .7 * Math.sin(Math.PI * u);
        ctx.fillStyle = '#fff6da';
        sparkle(ctx, gx, y - w * .12, w * .09);
        ctx.strokeStyle = CREAM;
        ctx.lineCap = 'round';
        ctx.globalAlpha = .5;
        for (let i = 0; i < 4; i++) {
          const x = e.x + (i - 1.5) * w * .22;
          streak(ctx, x, y - w * .4, x, y - w * .4 - 60, 2.5);
        }
      } else steam(ctx, e.x, e.y - w * .5, w * .5, el, Math.min(1, e.life / .2));
      break;
    }
    case 'hagumi-thud': {
      // The landing: a ring of dust out along the floor, crumbs and a flash of warm light.
      const r = e.radius ?? 160;
      const k = ease(t);
      ctx.globalAlpha = (1 - t) * .5;
      glow(ctx, e.x, e.y - 30, r * (.6 + k * .6), '255,200,110');
      ctx.fillStyle = '#efe0c6';
      for (let i = 0, m = n(10); i < m; i++) {
        const side = i % 2 ? 1 : -1;
        const d = r * (.35 + k * (.7 + hash(i, 111) * .5));
        ctx.globalAlpha = (1 - t) * .7;
        puff(ctx, e.x + side * d, e.y - 8 - hash(i, 112) * 14 * (1 - k), 12 * (1 - k * .4));
      }
      ctx.fillStyle = GOLDEN;
      burst(el, 113, { n: n(18), speed: [200, 520], life: .6, gravity: 900, drag: .3, angle: -Math.PI / 2, spread: 2.6 }, (x, y, kk, i) => {
        ctx.globalAlpha = 1 - kk;
        ctx.fillStyle = i % 3 ? GOLDEN : CRUMB;
        dot(ctx, x, y, 3.4 * (1 - kk * .5));
      }, e.x, e.y - 30);
      // 滋啦: hot-oil spatter — bright glints leaping off the crust in short arcs.
      ctx.fillStyle = '#fffbe6';
      burst(el, 117, { n: n(10), speed: [260, 480], life: .4, gravity: 1100, angle: -Math.PI / 2, spread: 2 }, (x, y, kk) => {
        ctx.globalAlpha = 1 - kk;
        sparkle(ctx, x, y, 6 * (1 - kk) + 1.5);
      }, e.x, e.y - r * .45);
      break;
    }
    case 'hagumi-pile': {
      // Buried: a mound of croquettes over the knocked-down body, a little confetti, steam; it settles and fades.
      const im = image(images, HAGUMI_CROQUETTE_SRC);
      const fade = Math.min(1, e.life / .3);
      const k = ease(el / .2);
      const rows = [[-44, 0], [-15, 0], [14, 0], [43, 0], [-30, -20], [0, -22], [29, -20], [-14, -40], [15, -40], [0, -58]];
      for (let i = 0; i < rows.length; i++) {
        const [x, y] = rows[i];
        const drop = (1 - span(el, i * .02, .15 + i * .02)) * 40;
        ctx.globalAlpha = fade;
        croquette(ctx, e.x + x, e.y - 12 + y * k - drop, 34, (hash(i, 121) - .5) * 1.2, im);
      }
      // The finishing touch: a little kids'-meal flag stuck in the top croquette, in the shop's stripes, fluttering.
      const fk = ease(span(el, .25, .4));
      if (fk > 0) {
        const fx = e.x + 2, fy = e.y - 12 - 58 * k - 6;
        const pole = 34 * fk;
        ctx.globalAlpha = fade;
        ctx.strokeStyle = '#e9d6b4';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - pole); ctx.stroke();
        const wv = Math.sin(el * 12) * 3;
        for (let j = 0; j < 2; j++) {
          ctx.fillStyle = j ? '#fff4e2' : ORANGE;
          const y0 = fy - pole + j * 7 * fk;
          ctx.beginPath();
          ctx.moveTo(fx, y0); ctx.quadraticCurveTo(fx + 11 * fk, y0 + wv * .5, fx + 22 * fk, y0 + wv);
          ctx.lineTo(fx + 22 * fk, y0 + wv + 7 * fk); ctx.quadraticCurveTo(fx + 11 * fk, y0 + 7 * fk + wv * .5, fx, y0 + 7 * fk);
          ctx.fill();
        }
      }
      steam(ctx, e.x, e.y - 70, 40, el, fade);
      for (let i = 0, m = n(8); i < m; i++) {
        const u = span(el, 0, .9);
        ctx.globalAlpha = fade * (1 - u);
        ctx.fillStyle = i % 2 ? ORANGE : '#fff4e2';
        confetti(ctx, e.x + (hash(i, 122) - .5) * 160, e.y - 120 + u * 100 + hash(i, 123) * 30, 5, 3, el * 5 + i, el * 9 + i);
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

/* ---- shots ---- */

/** 刚出锅的快速球: in flight it spins with a short crumb trail and steam; on the floor it sits steaming in a soft warm
 *  glow, gently breathing, and blinks out its last half second. */
export function drawHagumiShot(ctx: CanvasRenderingContext2D, p: Projectile, liteFx = false, images?: ImageCache): boolean {
  if (p.fx !== 'hagumi-croquette') return false;
  const im = image(images, HAGUMI_CROQUETTE_SRC);
  const w = p.size;
  ctx.save();
  if (p.settled) {
    const blink = p.life < .6 ? (Math.floor(p.life * 12) % 2 ? .35 : 1) : 1;
    ctx.globalAlpha = .5 * blink;
    glow(ctx, p.x, p.y - 4, w * .9, '255,200,110');
    ctx.globalAlpha = blink;
    const breathe = 1 + Math.sin(p.age * 5) * .03;
    croquette(ctx, p.x, p.y - w * .1, w * breathe, (p.face ?? 1) * .08, im);
    if (!liteFx) steam(ctx, p.x, p.y - w * .3, w * .8, p.age, blink);
  } else {
    const dir = Math.sign(p.vx) || 1;
    ctx.fillStyle = CRUMB;
    for (let i = 0; i < p.trail.length; i++) {
      const q = p.trail[i];
      const k = i / Math.max(1, p.trail.length);
      ctx.globalAlpha = k * .6;
      dot(ctx, q.x - dir * 6, q.y + (hash(i, 131) - .5) * 10, 1.2 + k * 2);
    }
    ctx.globalAlpha = .45;
    ctx.strokeStyle = ORANGE_LIT;
    ctx.lineCap = 'round';
    streak(ctx, p.x - dir * w * .4, p.y, p.x - dir * w * 1.6, p.y - 2, 5);
    if (!liteFx) {
      // 刚出锅: heat shimmer — two wavy lines rippling off the back — and the odd glint of frying oil.
      ctx.strokeStyle = 'rgba(255,214,150,.7)';
      ctx.lineWidth = 2;
      for (let j = 0; j < 2; j++) {
        const oy = (j ? 1 : -1) * w * .32;
        ctx.globalAlpha = .55;
        ctx.beginPath();
        for (let s = 0; s <= 6; s++) {
          const xx = p.x - dir * (w * .5 + s * w * .22);
          const yy = p.y + oy + Math.sin(p.age * 30 + s * 1.3 + j * 2) * 3;
          if (s) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
        }
        ctx.stroke();
      }
      const gl = Math.sin(p.age * 22);
      if (gl > .6) {
        ctx.globalAlpha = (gl - .6) / .4;
        ctx.fillStyle = '#ffffff';
        sparkle(ctx, p.x + w * .2, p.y - w * .3, 5);
      }
    }
    ctx.globalAlpha = 1;
    croquette(ctx, p.x, p.y, w, p.age * dir * 14, im);
    if (!liteFx) steam(ctx, p.x - dir * 10, p.y - w * .2, w * .6, p.age * 1.5);
  }
  ctx.restore();
  return true;
}
