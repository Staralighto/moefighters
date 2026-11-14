import type { Effect } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { TOMOE_HYOTTOKO_SRC, TOMOE_MIKOSHI_SRC } from './clips.ts';
import { TAU, burst, confetti, dot, flame, glow, hash, petal, soap, sparkle, streak } from './fxParticles.ts';

/* 宇田川巴 — 节庆红、巴纹、提灯和烟花. Registers:
   - festival red (#BB0033 deepening to #7a0020, lit to #ff3355) with gold (#ffd36a) for rims and paper;
   - 火男面具·潜入: the hyottoko mask (hyottoko.png) on her face; comic smoke puffs where it goes on and where she pops
     up behind them; a dotted trail of puffs while she creeps; a comic impact star for the punch from behind;
   - 这句话要听多少遍: a shoujo-manga panel opens behind the pair — a soft pink oval, focus lines, bubbles, two roses —
     a crack star on the "wall" where her hand lands, the skipping heart over them ('tomoe-heart');
   - 爱之深，责之切: a true 三つ巴 crest rising behind her with flames round the rim, a cone of shock arcs and air streaks
     out in front, then the sweat drop and cherry petals of the bow; the scolded wear a small rain cloud;
   - 嘿哟！神轿出巡: a night grade under the bodies, a string of lanterns with warm light pools, the shrine (mikoshi.png)
     glinting on her shoulder, a gold impact star and paper on every ram, a rising crescent for the uppercut, and a
     三つ巴 firework with drooping trails and two small follow-up bursts.
   Flat fills and cached stamps only, no shadowBlur; the heaviest moment (the firework) is about 70 small marks. */

export const TOMOE_BACK: readonly string[] = ['tomoe-crest', 'tomoe-manga'];
export const TOMOE_SCREEN_BACK: readonly string[] = ['tomoe-night', 'tomoe-lanterns'];
export const TOMOE_SCREEN_FRONT: readonly string[] = [];

const RED = '#BB0033';
const RED_DEEP = '#7a0020';
const RED_HOT = '#ff3355';
const GOLD = '#ffd36a';
const GOLD_DEEP = '#e8a23a';
const CREAM = '#f6e3c8';
const INK = '#2a0a14';
const PINK = '#ffb3c6';
const SAKURA = '#ffc6d6';

const particleCount = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

/* ---- shapes ---- */

/** 三つ巴: three commas chasing round. Each head sits on the rim side, its tail runs ahead round the outer circle and
 *  thins to a point at the next head. `spin` turns it; `rim` rings it. */
export function mitsudomoe(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number, fill: string, rim?: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  if (rim) {
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(2, r * .1);
    ctx.beginPath(); ctx.arc(0, 0, r * 1.06, 0, TAU); ctx.stroke();
  }
  ctx.fillStyle = fill;
  const R = r * .96, head = r * .3, sweep = 2.05, steps = 14;
  for (let n = 0; n < 3; n++) {
    const a0 = n * TAU / 3;
    // Head: a round blob against the rim.
    ctx.beginPath();
    ctx.arc(Math.cos(a0) * (R - head), Math.sin(a0) * (R - head), head, 0, TAU);
    ctx.fill();
    // Tail: the outer circle from the head forward, back along an inner edge that closes to the rim.
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = a0 + sweep * i / steps;
      ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
    }
    for (let i = steps; i >= 0; i--) {
      const k = i / steps, a = a0 + sweep * k, w = head * 2 * (1 - k) ** 1.35;
      ctx.lineTo(Math.cos(a) * (R - w), Math.sin(a) * (R - w));
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** A soft radial pool of light in one colour, fading to clear at r. */
function pool(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number, sx = 1, sy = 1): void {
  if (!(r > 0) || a <= .01) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(.45, `rgba(${rgb},${a * .5})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.restore();
}

/** A comic smoke puff: a cluster of round lobes with a lit top and a soft outline. */
function puff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, body = '#f4f1ee', shade = '#cfc8c6'): void {
  if (!(r > 1)) return;
  const lobes = 5;
  ctx.fillStyle = shade;
  for (let i = 0; i < lobes; i++) {
    const a = i * TAU / lobes + hash(seed, i) * .6;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * .55, y + Math.sin(a) * r * .4 + r * .08, r * (.5 + hash(seed, i + 7) * .2), 0, TAU); ctx.fill();
  }
  ctx.fillStyle = body;
  for (let i = 0; i < lobes; i++) {
    const a = i * TAU / lobes + hash(seed, i) * .6;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * .5, y + Math.sin(a) * r * .36 - r * .04, r * (.44 + hash(seed, i + 7) * .18), 0, TAU); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(x, y - r * .05, r * .55, 0, TAU); ctx.fill();
}

/** A comic impact star: spikes of uneven length, `fill` inside `edge`. */
function impact(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spikes: number, rot: number, seed: number, fill: string, edge: string): void {
  const path = (k: number) => {
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = rot + i * Math.PI / spikes;
      const rr = (i % 2 ? r * .45 : r * (.75 + hash(seed, i) * .35)) * k;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  };
  ctx.fillStyle = edge; path(1); ctx.fill();
  ctx.fillStyle = fill; path(.72); ctx.fill();
}

/** Tapered speed line: thick at (x0, y0), a point at (x1, y1). */
function taper(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number): void {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2;
  ctx.beginPath(); ctx.moveTo(x0 + nx, y0 + ny); ctx.lineTo(x1, y1); ctx.lineTo(x0 - nx, y0 - ny); ctx.closePath(); ctx.fill();
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * .38);
  ctx.bezierCurveTo(x - s * 1.15, y - s * .3, x - s * .5, y - s * 1.1, x, y - s * .42);
  ctx.bezierCurveTo(x + s * .5, y - s * 1.1, x + s * 1.15, y - s * .3, x, y + s * .38);
  ctx.closePath();
}

/** A rose seen from above: five outer petals, a swirl of inner ones, a deeper heart. */
function rose(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number, outer: string, inner: string): void {
  ctx.fillStyle = outer;
  for (let i = 0; i < 5; i++) {
    const a = spin + i * TAU / 5;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * .55, y + Math.sin(a) * r * .55, r * .5, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = inner;
  ctx.beginPath(); ctx.arc(x, y, r * .62, 0, TAU); ctx.fill();
  ctx.strokeStyle = outer;
  ctx.lineWidth = Math.max(1.2, r * .12);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 18; i++) {
    const a = spin * 1.5 + i * .55, rr = r * .52 * (1 - i / 20);
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.stroke();
}

/** The hyottoko mask about its centre, `w` wide, facing `dir`. Without the picture: a cream face, pursed mouth. */
function drawMask(ctx: CanvasRenderingContext2D, im: HTMLImageElement | undefined, w: number, dir: number): void {
  ctx.scale(dir, 1);
  if (im) {
    const h = w * im.naturalHeight / im.naturalWidth;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(im, -w / 2, -h / 2, w, h);
    return;
  }
  ctx.fillStyle = CREAM;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, w * .42, w * .5, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.ellipse(-w * .16, -w * .1, w * .05, w * .025, .2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(w * .12, -w * .14, w * .06, w * .06, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(w * .2, w * .2, w * .1, w * .07, -.4, 0, TAU); ctx.fill();
}

/** The shrine with its poles on the origin (her shoulder). Without the picture: poles, red body, gold roof. */
const MIKOSHI_W = 265;
/** Where on the picture the poles sit (fraction of its height), and how far left of her the picture starts. */
const MIKOSHI_POLE = .8;
const MIKOSHI_LEFT = .45;
function drawMikoshi(ctx: CanvasRenderingContext2D, im: HTMLImageElement | undefined, dir: number): void {
  ctx.scale(dir, 1);
  if (im) {
    const h = MIKOSHI_W * im.naturalHeight / im.naturalWidth;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(im, -MIKOSHI_W * MIKOSHI_LEFT, -h * MIKOSHI_POLE, MIKOSHI_W, h);
    return;
  }
  ctx.fillStyle = '#5a3418';
  ctx.fillRect(-MIKOSHI_W * MIKOSHI_LEFT, -6, MIKOSHI_W, 10);
  ctx.fillStyle = RED;
  ctx.fillRect(-36, -78, 92, 70);
  ctx.fillStyle = GOLD;
  ctx.beginPath(); ctx.moveTo(-58, -78); ctx.lineTo(10, -122); ctx.lineTo(78, -78); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(10, -128, 8, 0, TAU); ctx.fill();
}

/** A paper lantern hanging from (x, y − r − 10): red or white body with ribs, black caps, a warm inner light. */
function lantern(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number, white: boolean, flicker: number): void {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#2a1a14';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y - r * 1.5); ctx.lineTo(x, y - r * 1.05); ctx.stroke();
  ctx.fillStyle = white ? '#efe6d6' : '#d81e3c';
  ctx.beginPath(); ctx.ellipse(x, y, r * .8, r, 0, 0, TAU); ctx.fill();
  // The lit core: a warmer, brighter oval inside.
  ctx.globalAlpha = alpha * (.75 + flicker * .25);
  ctx.fillStyle = white ? '#fff8e6' : '#ff5a5a';
  ctx.beginPath(); ctx.ellipse(x - r * .08, y - r * .05, r * .5, r * .72, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = white ? 'rgba(170,40,50,.55)' : 'rgba(120,10,30,.5)';
  ctx.lineWidth = 1.4;
  for (const k of [-.55, -.2, .2, .55]) {
    ctx.beginPath(); ctx.ellipse(x, y + k * r, r * .8 * Math.sqrt(1 - k * k), r * .1, 0, 0, Math.PI); ctx.stroke();
  }
  ctx.fillStyle = '#1a1014';
  ctx.fillRect(x - r * .42, y - r * 1.1, r * .84, r * .22);
  ctx.fillRect(x - r * .42, y + r * .88, r * .84, r * .22);
  // A short red tassel.
  ctx.strokeStyle = '#d81e3c';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y + r * 1.1); ctx.lineTo(x, y + r * 1.45); ctx.stroke();
}

/* ---- status looks ---- */

/** 'tomoe-heart' (定身 from 这句话要听多少遍): a glossy red heart over the head that skips — a hard double beat once a
 *  second, with two little throb arcs either side on the beat — and two small hearts drifting up off it. */
export function auraTomoeHeart(ctx: CanvasRenderingContext2D, f: Fighter, h: number, _left: number, t: number): void {
  ctx.save();
  const ph = (t * 1.1) % 1;
  const beat = Math.max(Math.exp(-(((ph - .08) / .05) ** 2)), .7 * Math.exp(-(((ph - .26) / .05) ** 2)));
  const x = f.x, y = f.y - h - 30;
  const s = 16 * (1 + beat * .28);
  pool(ctx, x, y, 44 + beat * 14, '255,70,110', .35 + beat * .2);
  ctx.fillStyle = '#ffffff';
  heart(ctx, x, y, s + 3); ctx.fill();
  ctx.fillStyle = '#ff2f62';
  heart(ctx, x, y, s); ctx.fill();
  ctx.fillStyle = '#ff7a9c';
  heart(ctx, x + s * .1, y + s * .05, s * .62); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath(); ctx.ellipse(x - s * .42, y - s * .38, s * .2, s * .12, -.6, 0, TAU); ctx.fill();
  if (beat > .2) {
    ctx.strokeStyle = `rgba(255,90,130,${beat})`;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.arc(x + side * (s * 1.5), y - 2, 8, side > 0 ? -.9 : Math.PI - .9 + 1.8 - 1.8, side > 0 ? .9 : Math.PI + .9); ctx.stroke();
    }
  }
  for (let i = 0; i < 2; i++) {
    const k = (t * .7 + i * .5) % 1;
    ctx.globalAlpha = (1 - k) * .85;
    ctx.fillStyle = '#ff8fa8';
    heart(ctx, x + (i ? 22 : -24) + Math.sin(k * 6 + i) * 4, y - 10 - k * 34, 6 * (1 - k * .3)); ctx.fill();
  }
  ctx.restore();
}
export function applyTomoeHeart(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  const k = ease(age / .3);
  ctx.globalAlpha = (1 - span(age, .1, .5)) * .8;
  ctx.strokeStyle = '#ff8fa8';
  ctx.lineWidth = 4 * (1 - k) + 1;
  ctx.beginPath(); ctx.arc(e.x, e.y - 200, 20 + 50 * k, 0, TAU); ctx.stroke();
  burst(age, 41, { n: 10, speed: [110, 230], life: .6, gravity: -40, drag: .35 }, (x, y, q, i) => {
    ctx.globalAlpha = 1 - q;
    ctx.fillStyle = i % 2 ? '#ff8fa8' : '#ffd0dc';
    heart(ctx, x, y, 6 * (1 - q * .4)); ctx.fill();
  }, e.x, e.y - 200);
  ctx.restore();
}

/* ---- effects ---- */

export function drawTomoeFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('tomoe-')) return false;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    /* ---- U 火男面具·潜入 ---- */
    case 'tomoe-mask': {
      // On her face through the mask-on and the sneak, bobbing with the tiptoe.
      const clock = e.age ?? el;
      ctx.translate(e.x + dir * 12, e.y + Math.sin(clock * 22) * 1.5);
      ctx.rotate(dir * Math.sin(clock * 11) * .06);
      ctx.globalAlpha = Math.min(1, e.life / .1);
      drawMask(ctx, image(images, TOMOE_HYOTTOKO_SRC), 58, dir);
      break;
    }
    case 'tomoe-mask-on':
    case 'tomoe-pop': {
      // ポン！ A comic smoke puff: lobes bloom out, drift up and shrink away; a ring of little puffs and a twinkle.
      const big = e.type === 'tomoe-pop' ? 1.5 : .6;
      const k = ease(el / .16);
      const fade = 1 - span(el, .2, e.max);
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5 + .4;
        const d = (16 + 22 * k) * big;
        ctx.globalAlpha = fade;
        puff(ctx, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * .7 - el * 30, (14 + 8 * k) * big * (1 - span(el, .2, e.max) * .6), i + 3);
      }
      ctx.globalAlpha = fade;
      puff(ctx, e.x, e.y - el * 26, 22 * big * k * (1 - span(el, .25, e.max) * .5), 1);
      ctx.globalAlpha = (1 - span(el, 0, .3)) * .9;
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x + 30 * big, e.y - 30 * big, 14 * big * k);
      break;
    }
    case 'tomoe-sneak': {
      // Creeping: three bobbing "sneak" arcs over her back and a soft shadow smudge under her.
      const clock = e.age ?? el;
      const fade = Math.min(1, e.life / .1);
      ctx.globalAlpha = .35 * fade;
      ctx.fillStyle = '#1a1020';
      ctx.beginPath(); ctx.ellipse(e.x, FLOOR - 2, 50, 7, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const y = e.y - 120 - i * 26 + Math.sin(clock * 16 + i * 1.3) * 4;
        const x = e.x - dir * (52 + i * 8);
        ctx.globalAlpha = (.85 - i * .15) * fade;
        ctx.beginPath(); ctx.arc(x, y, 11, dir > 0 ? 2.2 : -.9, dir > 0 ? 4 : .9); ctx.stroke();
      }
      break;
    }
    case 'tomoe-step': {
      // A little dust puff left behind each tiptoe.
      ctx.globalAlpha = (1 - t) * .7;
      puff(ctx, e.x + ((e.n ?? 0) % 2 ? 8 : -8), FLOOR - 8 - t * 10, 9 * (1 + t * .6), (e.n ?? 0) + 11, '#efe8e0', '#c9bfb3');
      break;
    }
    case 'tomoe-mask-fly': {
      // Off the face and spun away up behind her, a short arc of motion behind it.
      const k = ease(el / .7);
      const px = (u: number) => e.x + dir * 130 * u, py = (u: number) => e.y - 110 * u + 170 * u * u;
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const u = Math.max(0, k - .25 + i * .04); ctx.lineTo(px(u), py(u)); }
      ctx.stroke();
      ctx.translate(px(k), py(k));
      ctx.rotate(dir * el * 14);
      ctx.globalAlpha = 1 - t * t;
      drawMask(ctx, image(images, TOMOE_HYOTTOKO_SRC), 58, -dir);
      break;
    }
    case 'tomoe-arc': {
      // The punch from behind: a comic impact star at the fist, speed lines raking back along the arm, shards.
      const k = ease(el / .1);
      const fade = 1 - span(el, .12, e.max);
      ctx.globalAlpha = fade;
      pool(ctx, e.x, e.y, 90, '255,60,90', .5);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) {
        const y = e.y - 40 + i * 16 + (hash(i, 2) - .5) * 6;
        const l = 70 + hash(i, 3) * 60;
        taper(ctx, e.x - dir * 20, y, e.x - dir * (20 + l * k), y, 7 - Math.abs(i - 2.5) * 1.2);
      }
      impact(ctx, e.x, e.y, (e.hit ? 58 : 40) * (.5 + .5 * k), 9, el * 2, 5, '#ffffff', e.hit ? RED_HOT : RED);
      burst(el, 17, { n: particleCount(8, liteFx), speed: [220, 420], life: .3, angle: dir > 0 ? 0 : Math.PI, spread: 1.6, drag: .2 }, (x, y, q) => {
        ctx.globalAlpha = fade * (1 - q);
        ctx.fillStyle = q < .4 ? '#ffffff' : RED_HOT;
        dot(ctx, x, y, 3.5 * (1 - q));
      }, e.x, e.y);
      break;
    }

    /* ---- I 这句话要听多少遍 ---- */
    case 'tomoe-manga': {
      // A shoujo-manga panel behind the pair: a soft pink oval, focus lines raking in, bubbles, two roses.
      const k = ease(el / .22);
      const fade = Math.min(1, e.life / .35);
      const rx = 230 * (.75 + .25 * k), ry = 150 * (.75 + .25 * k);
      pool(ctx, e.x, e.y, rx, '255,190,210', .55 * fade, 1, ry / rx);
      pool(ctx, e.x, e.y, rx * .55, '255,240,245', .55 * fade, 1, ry / rx);
      // Focus lines from outside the oval inwards, thick at the outside.
      ctx.fillStyle = `rgba(255,255,255,${.75 * fade})`;
      const lines = particleCount(18, liteFx);
      for (let i = 0; i < lines; i++) {
        const a = i * TAU / lines + hash(i, 4) * .2;
        // None raking up out of the floor.
        if (Math.sin(a) > .45) continue;
        const r0 = 1.05 + hash(i, 5) * .25, r1 = .62 + hash(i, 6) * .12;
        taper(ctx, e.x + Math.cos(a) * rx * r0, e.y + Math.sin(a) * ry * r0, e.x + Math.cos(a) * rx * r1 * k, e.y + Math.sin(a) * ry * r1 * k, 6 + hash(i, 7) * 6);
      }
      // Bubbles rising slowly.
      for (let i = 0; i < particleCount(9, liteFx); i++) {
        const x = e.x + (hash(i, 8) - .5) * rx * 1.6;
        const y = e.y + ry * .6 - ((el * 40 + hash(i, 9) * ry * 1.4) % (ry * 1.4));
        soap(ctx, x, y, 6 + hash(i, 10) * 9, fade * .9, hash(i, 11));
      }
      // Two roses at opposite corners, turning slowly, a twinkle by each.
      for (const [sx, sy, r] of [[-.82, -.55, 26], [.86, .5, 22]] as const) {
        const x = e.x + sx * rx * dir, y = e.y + sy * ry;
        ctx.globalAlpha = fade * k;
        rose(ctx, x, y, r, el * .6 + sx, '#ff8fab', '#e8476f');
        ctx.fillStyle = '#ffffff';
        sparkle(ctx, x + r * .9, y - r * .9, 9 * (.6 + .4 * Math.sin(el * 7 + sx * 3)));
      }
      break;
    }
    case 'tomoe-wall': {
      // 壁咚: where her hand lands on the "wall" behind them — a white crack star, a flat ring spreading along the
      // wall, a few chips falling.
      const h = e.radius ?? 180;
      const hy = e.y - h * .82;
      const k = ease(el / .12);
      const fade = 1 - span(el, .15, e.max);
      ctx.globalAlpha = fade * (1 - k * .6);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5 * (1 - k) + 1.5;
      ctx.beginPath(); ctx.ellipse(e.x, hy, 10 + 26 * k, 34 + 90 * k, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 7; i++) {
        const a = i * TAU / 7 + .25;
        const r = (20 + hash(i, 3) * 24) * (.4 + .6 * k);
        taper(ctx, e.x + Math.cos(a) * 4, hy + Math.sin(a) * 6, e.x + Math.cos(a) * r * .55, hy + Math.sin(a) * r, 5);
      }
      impact(ctx, e.x, hy, 18 * (.5 + .5 * k), 6, .3, 9, '#ffffff', RED_HOT);
      burst(el, 23, { n: particleCount(6, liteFx), speed: [60, 140], life: .7, gravity: 600, angle: -dir * Math.PI / 2 + (dir > 0 ? Math.PI : 0), spread: 1.4 }, (x, y, q, i) => {
        ctx.globalAlpha = fade * (1 - q);
        ctx.fillStyle = i % 2 ? '#ffffff' : PINK;
        dot(ctx, x, y, 3);
      }, e.x, hy);
      break;
    }
    case 'tomoe-shine': {
      // A glint off her sideburn as she tilts her head: a four-point star sliding down the hair, a fine streak.
      const k = ease(el / .3);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.lineCap = 'round';
      streak(ctx, e.x, e.y, e.x + dir * 4, e.y + 40 * k, 3);
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x + dir * 4, e.y + 40 * k, 16 * (1 - t * .4));
      sparkle(ctx, e.x + dir * 22, e.y + 10, 7 * (1 - t));
      break;
    }
    case 'tomoe-heart@apply':
      applyTomoeHeart(ctx, e, el);
      break;

    /* ---- O 爱之深，责之切 ---- */
    case 'tomoe-crest': {
      // 爱之深: the 三つ巴 rises up behind her and burns — a dark red halo, flame tongues licking off the rim,
      // the crest in festival red on a gold ring, turning slowly.
      const grow = ease(el / .2);
      const r = (e.radius ?? 95) * (.55 + .45 * grow);
      const fade = Math.min(1, e.life / .25);
      pool(ctx, e.x, e.y, r * 2.1, '170,0,40', .55 * fade);
      ctx.globalAlpha = fade;
      const tongues = particleCount(14, liteFx);
      for (let i = 0; i < tongues; i++) {
        const a = i * TAU / tongues + el * .9;
        const lick = .65 + .35 * Math.sin(el * 17 + i * 1.9);
        const fx = e.x + Math.cos(a) * r * 1.08, fy = e.y + Math.sin(a) * r * 1.08;
        // Flames always lick upward, so the ring burns like a wheel on fire.
        flame(ctx, fx, fy - 6, r * .26 * lick * (.8 + .4 * hash(i, 2)), i % 3 ? 'warm' : 'hot');
      }
      // The disc is see-through so her body stays readable over it; the crest itself is the solid part.
      ctx.globalAlpha = fade * .5;
      ctx.fillStyle = RED_DEEP;
      ctx.beginPath(); ctx.arc(e.x, e.y, r * 1.06, 0, TAU); ctx.fill();
      ctx.globalAlpha = fade * .92;
      mitsudomoe(ctx, e.x, e.y, r, -dir * el * 2.4, RED_HOT, GOLD);
      ctx.globalAlpha = fade;
      // A thin bright inner ring for crispness.
      ctx.strokeStyle = 'rgba(255,230,170,.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, r * .92, 0, TAU); ctx.stroke();
      break;
    }
    case 'tomoe-roar': {
      // The roar: three thick shock arcs fanning out in front, air streaks pushed ahead, dust kicked at the floor.
      const reach = (e.radius ?? 300);
      const cone = ease(el / .2) * (1 - span(el, .15, e.max));
      ctx.beginPath(); ctx.rect(0, 0, W, FLOOR); ctx.clip();
      if (cone > 0) {
        const g = ctx.createRadialGradient(e.x, e.y, 10, e.x, e.y, reach * .9);
        g.addColorStop(0, `rgba(255,90,120,${.42 * cone})`);
        g.addColorStop(1, 'rgba(255,90,120,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.arc(e.x, e.y, reach * .9 * (.4 + .6 * cone), dir > 0 ? -.55 : Math.PI - .55, dir > 0 ? .55 : Math.PI + .55);
        ctx.closePath();
        ctx.fill();
      }
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const k = ease((el - i * .07) / .32);
        if (k <= 0) continue;
        const cx = e.x + dir * reach * .5 * k;
        ctx.globalAlpha = (1 - k) * (.95 - i * .2);
        ctx.strokeStyle = i === 1 ? '#ffffff' : RED_HOT;
        ctx.lineWidth = 16 - i * 4;
        ctx.beginPath();
        ctx.ellipse(cx, e.y, 20 + reach * .12 * k, 46 + 70 * k, 0, dir > 0 ? -1.15 : Math.PI - 1.15, dir > 0 ? 1.15 : Math.PI + 1.15);
        ctx.stroke();
      }
      const fade = 1 - span(el, .1, e.max);
      ctx.fillStyle = `rgba(255,235,240,${.8 * fade})`;
      for (let i = 0; i < 6; i++) {
        const k = ease((el - hash(i, 1) * .08) / .3);
        const y = e.y - 60 + i * 24 + (hash(i, 2) - .5) * 10;
        const x0 = e.x + dir * (30 + reach * .55 * k), l = 50 + hash(i, 3) * 50;
        taper(ctx, x0, y, x0 - dir * l, y, 5);
      }
      burst(el, 31, { n: particleCount(8, liteFx), speed: [160, 320], life: .5, gravity: 300, angle: dir > 0 ? -.3 : Math.PI + .3, spread: .7, drag: .3 }, (x, y, q, i) => {
        ctx.globalAlpha = fade * (1 - q) * .8;
        puff(ctx, x, y, 6 + q * 10, i + 40, '#efe2d4', '#c8b8a6');
      }, e.x + dir * 20, FLOOR - 6);
      break;
    }
    case 'tomoe-bow': {
      // Sorry: a big glossy sweat drop by her face, a few gloom lines over her head, cherry petals drifting down.
      const t0 = e.t0 ?? 0;
      if (el < t0) break;
      const u = el - t0;
      const h = e.radius ?? 190;
      const fade = Math.min(1, e.life / .2) * span(u, 0, .08);
      ctx.globalAlpha = fade;
      const sx = e.x + dir * 44, sy = e.y - h * .66 + Math.min(14, u * 40);
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath(); ctx.moveTo(sx, sy - 16); ctx.bezierCurveTo(sx + 11, sy - 2, sx + 9, sy + 9, sx, sy + 9); ctx.bezierCurveTo(sx - 9, sy + 9, sx - 11, sy - 2, sx, sy - 16); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.ellipse(sx - 3, sy, 2.2, 4, .3, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(110,130,190,.7)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const x = e.x + dir * (8 + i * 14), y = e.y - h * .72 - 6;
        ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x, y - 18 + 14 * span(u, i * .05, .2 + i * .05)); ctx.stroke();
      }
      const n = particleCount(8, liteFx);
      for (let i = 0; i < n; i++) {
        const x = e.x + (hash(i, 9) - .5) * 140 + Math.sin(u * 3 + i) * 12;
        const y = e.y - h * 1.1 + ((u * 55 + hash(i, 10) * 90) % 150);
        ctx.globalAlpha = fade * .9;
        petal(ctx, x, y, 7, u * 2 + i, SAKURA);
      }
      break;
    }
    case 'tomoe-scold-aura': {
      // Scolded (削弱): a little rain cloud over the head — lit top, darker belly — and a steady drizzle.
      const age = e.age ?? 0;
      const x = e.x + Math.sin(age * 1.6) * 3, y = e.y;
      ctx.globalAlpha = .9;
      puff(ctx, x, y, 22, 7, '#a9abb8', '#6f7182');
      ctx.fillStyle = '#c9cbd6';
      ctx.beginPath(); ctx.arc(x - 6, y - 8, 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(150,180,220,.85)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const k = (age * 1.8 + hash(i, 3)) % 1;
        const dx = -16 + i * 8;
        ctx.globalAlpha = (1 - k) * .9;
        ctx.beginPath(); ctx.moveTo(x + dx, y + 14 + k * 28); ctx.lineTo(x + dx - 2, y + 22 + k * 28); ctx.stroke();
      }
      break;
    }

    /* ---- L 嘿哟！神轿出巡 ---- */
    case 'tomoe-night': {
      // Festival night under the bodies: a deep indigo grade darker at the top, a warm glow low along the floor
      // (the stalls), and a few soft stars.
      const fade = Math.min(1, el / .35) * Math.min(1, e.life / .35);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgba(14,8,34,${.62 * fade})`);
      g.addColorStop(.6, `rgba(24,10,40,${.4 * fade})`);
      g.addColorStop(1, `rgba(60,16,24,${.22 * fade})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const warm = ctx.createLinearGradient(0, FLOOR - 140, 0, FLOOR);
      warm.addColorStop(0, 'rgba(255,120,60,0)');
      warm.addColorStop(1, `rgba(255,120,60,${.22 * fade})`);
      ctx.fillStyle = warm;
      ctx.fillRect(0, FLOOR - 140, W, 140);
      ctx.fillStyle = '#fff2d0';
      for (let i = 0; i < 16; i++) {
        ctx.globalAlpha = fade * (.25 + .45 * Math.abs(Math.sin(el * 1.3 + i * 2.1)));
        dot(ctx, hash(i, 11) * W, 120 + hash(i, 12) * 140, 1.4 + hash(i, 13));
      }
      break;
    }
    case 'tomoe-lanterns': {
      // A string of red-and-white lanterns drops in across the top and sways, each with a warm pool of light.
      const fade = Math.min(1, e.life / .35);
      const drop = ease(el / .5);
      const n = liteFx ? 7 : 10;
      const y0 = -60 + 120 * drop;
      const sagY = (u: number) => y0 + Math.sin(u * Math.PI) * 24;
      ctx.globalAlpha = fade;
      ctx.strokeStyle = '#2a1a14';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) ctx.lineTo(i / 24 * W, sagY(i / 24) - 30);
      ctx.stroke();
      for (let i = 0; i < n; i++) {
        const u = (i + .5) / n;
        const sway = Math.sin(el * 2.1 + i * .9) * 5;
        const x = u * W + sway, y = sagY(u);
        const flicker = .5 + .5 * Math.sin(el * 9 + i * 2.3);
        pool(ctx, x, y + 6, 60, '255,150,90', (.22 + .06 * flicker) * fade);
        lantern(ctx, x, y, 20, fade, i % 3 === 1, flicker);
      }
      break;
    }
    case 'tomoe-mikoshi': {
      // The shrine on her shoulder; a little bounce on every step of the carry (n = 1), and a gold glint running
      // over the roof now and then.
      const clock = e.age ?? el;
      const bob = (e.n ?? 0) === 1 ? -Math.abs(Math.sin(clock * 10.5)) * 7 : Math.sin(clock * 9) * 2;
      ctx.translate(e.x + dir * 18, e.y + bob + 10);
      ctx.globalAlpha = Math.min(1, e.life / .1);
      ctx.save();
      drawMikoshi(ctx, image(images, TOMOE_MIKOSHI_SRC), dir);
      ctx.restore();
      const g = (clock * .9) % 1;
      if (g < .35) {
        ctx.fillStyle = '#fffbe6';
        sparkle(ctx, dir * (-30 + g / .35 * 110), -100 + Math.abs(g / .35 - .5) * 40, 12 * Math.sin(g / .35 * Math.PI));
      }
      break;
    }
    case 'tomoe-dust': {
      ctx.globalAlpha = (1 - t) * .6;
      puff(ctx, e.x - dir * t * 34, FLOOR - 8 - t * 14, 10 * (1 + t * .8), 50, '#e8dccb', '#bcae9a');
      break;
    }
    case 'tomoe-ram': {
      // A ram: a gold-and-white impact star where the poles strike, a flat shock ring, the 三つ巴 flashing in it.
      const k = ease(el / .14);
      const fade = 1 - span(el, .12, e.max);
      ctx.globalAlpha = fade;
      pool(ctx, e.x, e.y, 90, '255,200,110', .5);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 30 + 50 * k, 40 + 70 * k, 0, 0, TAU); ctx.stroke();
      impact(ctx, e.x, e.y, (40 + (e.n ?? 0) * 8) * (.5 + .5 * k), 8, (e.n ?? 0) * .4, 60 + (e.n ?? 0), '#fff6d8', GOLD_DEEP);
      ctx.globalAlpha = fade * (1 - k * .5);
      mitsudomoe(ctx, e.x, e.y, 14 + (e.n ?? 0) * 3, el * 6, RED);
      break;
    }
    case 'tomoe-confetti': {
      // Gold and red paper thrown off the shrine roof, tumbling as it falls.
      burst(el, 70 + (e.n ?? 0) * 5, { n: particleCount(16, liteFx), speed: [140, 300], life: .9, gravity: 320, angle: -Math.PI / 2, spread: 2.3, drag: .3 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q * q;
        ctx.fillStyle = i % 3 === 0 ? RED_HOT : i % 3 === 1 ? GOLD : '#fff3d6';
        confetti(ctx, x, y, 5, 3, q * 7 + i, q * 14 + i);
      }, e.x, e.y - 90);
      break;
    }
    case 'tomoe-upper': {
      // The uppercut: a broad crescent sweeping up from the floor past the chin, white leading edge on red, with
      // streaks rising behind it.
      const k = ease(el / .14);
      const fade = 1 - span(el, .14, e.max);
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.globalAlpha = fade;
      pool(ctx, 10, -20, 130, '255,60,90', .4);
      // Centre behind the fist; the sweep runs from below (π/2 + .3) round the front to above (−π/2 − .1).
      const cx = -50, R = 120, from = Math.PI / 2 + .3, to = from - (Math.PI + .4) * k;
      ctx.fillStyle = e.hit ? RED_HOT : RED;
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) {
        const a = from + (to - from) * i / 20, w = 34 * Math.sin(Math.PI * i / 20) + 4;
        ctx.lineTo(cx + Math.cos(a) * R, Math.sin(a) * R);
        if (i === 20) for (let j = 20; j >= 0; j--) {
          const b = from + (to - from) * j / 20, wj = 34 * Math.sin(Math.PI * j / 20) + 4;
          ctx.lineTo(cx + Math.cos(b) * (R - wj), Math.sin(b) * (R - wj));
        }
        void w;
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, 0, R, from, to, true); ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,240,.85)';
      for (let i = 0; i < 5; i++) {
        const x = 20 + i * 18, y = 60 - 200 * k - hash(i, 3) * 50;
        taper(ctx, x, y, x, y + 70 + hash(i, 4) * 40, 6);
      }
      break;
    }
    case 'tomoe-firework': {
      // 嘿哟 over the wall: a rising trail; the burst — sparks flung out on drooping trails, a 三つ巴 of red light
      // turning inside a gold ring — then two smaller pops either side and a slow fall of glitter.
      const t0 = e.t0 ?? .2;
      if (el < t0) {
        const k = el / t0;
        ctx.fillStyle = GOLD;
        for (let i = 0; i < 6; i++) { ctx.globalAlpha = 1 - i * .15; dot(ctx, e.x, e.y + 280 * (1 - k) + i * 12, 3.5 - i * .45); }
        break;
      }
      const u = el - t0;
      const fade = Math.min(1, e.life / .5);
      const k = ease(u / .35);
      const R = 140;
      pool(ctx, e.x, e.y, R * 2.4 * (.5 + .5 * k), '255,70,90', .45 * fade * (1 - span(u, .3, 1.2)));
      // Main sparks on trails: each spark draws a short tail behind it; gravity bends the late ones down.
      ctx.lineCap = 'round';
      const rays = particleCount(28, liteFx);
      for (let i = 0; i < rays; i++) {
        const a = i * TAU / rays + hash(i, 1) * .1;
        const v = R * (.85 + hash(i, 2) * .3);
        const at = (s: number) => {
          const d = v * ease(s / .45) ;
          return [e.x + Math.cos(a) * d, e.y + Math.sin(a) * d + 60 * s * s];
        };
        const [x1, y1] = at(u), [x0, y0] = at(Math.max(0, u - .12));
        ctx.globalAlpha = fade * (1 - span(u, .5, 1.3));
        ctx.strokeStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? GOLD : '#ff8a9a';
        streak(ctx, x0, y0, x1, y1, 3.2);
        ctx.fillStyle = '#ffffff';
        dot(ctx, x1, y1, 2.6);
      }
      // The crest in light at the heart of it.
      ctx.globalAlpha = fade * (1 - span(u, .7, 1.3));
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(e.x, e.y, R * .5 * k, 0, TAU); ctx.stroke();
      mitsudomoe(ctx, e.x, e.y, R * .42 * k, u * 1.8, RED_HOT);
      ctx.fillStyle = '#fff2f2';
      dot(ctx, e.x, e.y, 6 * k);
      // Two smaller pops either side, a beat later.
      for (const [ox, oy, d, col] of [[-170, 50, .25, GOLD], [160, 80, .4, '#ff9ab0']] as const) {
        const v2 = u - d;
        if (v2 < 0 || v2 > .9) continue;
        const k2 = ease(v2 / .3);
        for (let i = 0; i < particleCount(12, liteFx); i++) {
          const a = i * TAU / 12;
          ctx.globalAlpha = fade * (1 - span(v2, .3, .9));
          ctx.fillStyle = col;
          dot(ctx, e.x + ox + Math.cos(a) * 44 * k2, e.y + oy + Math.sin(a) * 44 * k2 + 30 * v2 * v2, 2.6);
        }
      }
      // Glitter drifting down after.
      burst(u, 90, { n: particleCount(14, liteFx), speed: [40, 130], life: 1.4, gravity: 70, drag: .5 }, (x, y, q) => {
        ctx.globalAlpha = fade * (1 - q) * (.5 + .5 * Math.sin(q * 30));
        ctx.fillStyle = GOLD;
        sparkle(ctx, x, y + 20, 5);
      }, e.x, e.y);
      break;
    }
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  return true;
}
