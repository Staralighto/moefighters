import type { Effect } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import type { Fighter } from '../game/fighter.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { CELL, PAREO_CHU_H, PAREO_CHU_SHEET, PAREO_COLOR, PAREO_GRAY, PAREO_WIGS } from './clips.ts';
import { TAU, burst, cycle, dot, easeOut, glow, hash, sparkle, span, streak } from './fxParticles.ts';

/* PAREO（鳰原令王那）. Her two colours are her own wig's: 彩粉 and 日菜蓝, and a heart for everything (the winged
   heart she wears, the dog that loves her master). The super is the one place the world loses colour: grey, then
   the colour comes back from CHU²'s hand as a paint wave in those two colours.
   Cheap by construction: hearts are one bezier path, glows are the shared baked stamp, the grey is one
   'saturation' fill with a growing hole, CHU² is her own sheet tinted once. Lite halves the counts. */

/** Screen space, over every body: the grey world and CHU² (in that order — CHU² keeps her colour). */
export const PAREO_SCREEN_FRONT: readonly string[] = ['pareo-gray', 'pareo-chu'];

const PINK = PAREO_COLOR;
const BLUE = '#66D9F0';
const TWO = [PINK, BLUE];
const CHU = '#00BBFF';

let lite = false;
const n = (full: number) => (lite ? Math.ceil(full / 2) : full);
const bump = (t: number) => Math.sin(Math.PI * clamp(t, 0, 1));
const rgbOf = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return `${v >> 16 & 255},${v >> 8 & 255},${v & 255}`;
};

/** A heart of half-width r, point down, centred on x, y. */
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0): void {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(0, r * .95);
  ctx.bezierCurveTo(-r * 1.25, r * .1, -r * .85, -r * 1.05, 0, -r * .35);
  ctx.bezierCurveTo(r * .85, -r * 1.05, r * 1.25, r * .1, 0, r * .95);
  ctx.fill();
  ctx.restore();
}
/** A heart with a white glint, for the ones that should read from across the stage. */
function shinyHeart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, rot = 0): void {
  ctx.fillStyle = color;
  heart(ctx, x, y, r, rot);
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  dot(ctx, x - r * .38, y - r * .3, r * .22);
}

/** 忠犬: a paw print of half-width r — one pad and four toes, a white rim under her pink. */
function paw(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  for (const [c, grow] of [['#ffffff', 3], [PINK, 0]] as const) {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(0, r * .28, r * .44 + grow, r * .36 + grow, 0, 0, TAU); ctx.fill();
    for (const [tx, ty] of [[-.58, -.22], [-.21, -.58], [.21, -.58], [.58, -.22]]) dot(ctx, tx * r, ty * r, r * .18 + grow);
  }
  ctx.restore();
}
/** A crescent swept from behind-low, over the top, to the front: the arc of a kick. k grows it along the sweep. */
function crescent(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, dir: number, k: number): void {
  if (k <= 0) return;
  // Thin at both tips, thickest over the top: the inner circle sits off-centre away from the middle of the sweep.
  const a0 = Math.PI - .15, a1 = a0 + 2.5 * k, am = a0 + 1.25;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(dir, 1);
  ctx.beginPath();
  ctx.arc(0, 0, R, a0, a1);
  ctx.arc(-Math.cos(am) * R * .16, -Math.sin(am) * R * .16, R * .9, a1, a0, true);
  ctx.fill();
  ctx.restore();
}

/* ---- 换表闪 (spriteView's SWAP_LOOKS) ----
   Her special cells are drawn long-legged and small-headed, her common ones chibi; the swap between them would pop.
   spriteView stretches her and flashes the new cell white; this rides on top in body space (feet at 0, forward +x):
   a soft band of her two colours running up her (the paint that redraws her) and three sparkles — a magical-girl
   ta-da, so the eye reads 'transform' and not 'other model'. Glow stamps and sparkles only. */
const SWAP_SPOTS = [[-.16, .9], [.26, .62], [-.22, .3]] as const;
export function drawPareoSwap(ctx: CanvasRenderingContext2D, h: number, p: number, toSpecial: boolean): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2; i++) {
    const u = clamp(p * 1.3 - i * .22, 0, 1);
    if (u <= 0 || u >= 1) continue;
    ctx.save();
    ctx.translate(0, -h * (.08 + easeOut(u) * .74));
    ctx.scale(2.2, .55);
    ctx.globalAlpha = bump(u) * (1 - u * .5) * .75;
    glow(ctx, 0, 0, h * .2, rgbOf(TWO[i]));
    ctx.restore();
  }
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 3; i++) {
    const u = clamp(p * 1.4 - i * .12, 0, 1);
    ctx.globalAlpha = bump(u);
    sparkle(ctx, SWAP_SPOTS[i][0] * h, -SWAP_SPOTS[i][1] * h, (6 + 7 * bump(u)) * (toSpecial ? 1.2 : .85));
  }
  if (toSpecial) {
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 2; i++) {
      ctx.globalAlpha = 1 - p;
      shinyHeart(ctx, (i ? 1 : -1) * h * (.16 + .2 * easeOut(p)), -h * (.6 + .16 * p), 5.5 * (1 - p * .3), TWO[i], (i ? .3 : -.3));
    }
  }
  ctx.restore();
}

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}
const tinted = new Map<string, HTMLCanvasElement>();
/** CHU²'s whole sheet washed in one colour, baked once per colour. */
function tintSheet(im: HTMLImageElement, color: string): HTMLCanvasElement | undefined {
  if (typeof document === 'undefined') return undefined;
  const key = im.src + '|' + color;
  let c = tinted.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
  if (!g) return undefined;
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  tinted.set(key, c);
  return c;
}

/** Where CHU²'s reaching hand is, for a CHU² standing at cx facing dir. */
export function chuHand(cx: number, dir: number): { x: number; y: number } {
  return { x: cx + dir * PAREO_CHU_H * .36, y: FLOOR - 5 - PAREO_CHU_H * .62 };
}

/* ---- status looks ---- */

/** 百变假发 ('pareo-wig', a 'look' on her): a few soft dots in the member's colour drifting up off the new hair. */
export function auraPareoWig(ctx: CanvasRenderingContext2D, f: Fighter, bodyH: number, left: number, t: number, liteFx: boolean): void {
  lite = liteFx;
  const m = f.mods.find(x => x.kind === 'look' && x.mark === 'pareo-wig' && x.left > 0);
  const w = PAREO_WIGS[m?.v ?? 0] ?? PAREO_WIGS[0];
  const fade = Math.min(1, left / .4);
  ctx.save();
  for (let i = 0, k = n(6); i < k; i++) {
    const u = cycle(t, .55, i, 61);
    const side = hash(i, 62) < .5 ? -1 : 1;
    const x = f.x + side * (16 + hash(i, 63) * 22) + Math.sin(t * 2.4 + i) * 5;
    const y = f.y - bodyH * (.62 + u * .45);
    ctx.globalAlpha = fade * bump(u) * .8;
    ctx.fillStyle = i % 3 === 2 ? '#ffffff' : i % 2 ? w.tip : w.hair;
    if (i % 3 === 2) sparkle(ctx, x, y, 4.5 * (1 - u * .5));
    else dot(ctx, x, y, 3 - u * 1.4);
  }
  ctx.restore();
}
/** 来不及换 ('pareo-wig-fail'): one sweat drop sliding down by the half-done wig. */
export function auraPareoWigFail(ctx: CanvasRenderingContext2D, f: Fighter, bodyH: number, left: number, t: number): void {
  const fade = Math.min(1, left / .4);
  const u = (t * .8) % 1;
  ctx.save();
  ctx.globalAlpha = fade * (1 - u) * .85;
  ctx.fillStyle = '#bfe9ff';
  const x = f.x + f.facing * 20, y = f.y - bodyH * .93 + u * 16;
  ctx.beginPath();
  ctx.moveTo(x, y - 7);
  ctx.quadraticCurveTo(x + 5, y + 1, x, y + 4);
  ctx.quadraticCurveTo(x - 5, y + 1, x, y - 7);
  ctx.fill();
  ctx.restore();
}

/* ---- the grey world (灰色重染) ---- */

function drawGray(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const G = PAREO_GRAY;
  const dir = e.dir ?? 1;
  const hand = chuHand(e.x, dir);
  const fadeIn = span(el, 0, .28);
  const back = span(el, G.color, G.color + .55);
  const R = easeOut(back) * Math.hypot(W, H) * 1.15;
  const end = e.life < .25 ? e.life / .25 : 1;
  if (back >= 1 && R > Math.hypot(W, H)) return;
  ctx.save();
  // Everything outside the hole loses its colour, and a touch of gloom.
  ctx.beginPath();
  ctx.rect(-W, -H, W * 3, H * 3);
  if (R > 0) { ctx.moveTo(hand.x + R, hand.y); ctx.arc(hand.x, hand.y, R, 0, TAU, true); }
  ctx.globalAlpha = fadeIn * end;
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = '#808080';
  ctx.fill('evenodd');
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = fadeIn * end * .2;
  ctx.fillStyle = '#16141f';
  ctx.fill('evenodd');
  if (R > 0) {
    // The edge of the colour: a white ring and paint blobs in her two colours riding it.
    const fade = 1 - back;
    ctx.globalAlpha = fade * .55;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3 + 6 * fade;
    ctx.beginPath(); ctx.arc(hand.x, hand.y, R, 0, TAU); ctx.stroke();
    for (let i = 0, k = n(30); i < k; i++) {
      const a = (i / k) * TAU + hash(i, 71) * .2;
      const rr = R + (hash(i, 72) - .5) * 26;
      ctx.globalAlpha = fade * .9;
      ctx.fillStyle = TWO[i % 2];
      const s = (9 + hash(i, 73) * 14) * (.6 + fade * .6);
      dot(ctx, hand.x + Math.cos(a) * rr, hand.y + Math.sin(a) * rr, s);
      if (i % 3 === 0) dot(ctx, hand.x + Math.cos(a) * (rr - s * 1.6), hand.y + Math.sin(a) * (rr - s * 1.6), s * .45);
    }
  }
  ctx.restore();
}

function drawChu(ctx: CanvasRenderingContext2D, e: Effect, el: number, images?: ImageCache): void {
  const G = PAREO_GRAY;
  const T = el + (e.t0 ?? 0);
  const dir = e.dir ?? 1;
  const inA = span(T, G.chu, G.chu + .35);
  const out = e.life < .35 ? e.life / .35 : 1;
  const alpha = inA * out;
  if (alpha <= 0) return;
  const h = PAREO_CHU_H;
  const hand = chuHand(e.x, dir);
  // Behind her, a soft blue halo — the one thing in the grey that still has colour.
  ctx.save();
  ctx.globalAlpha = alpha * .55;
  glow(ctx, e.x, FLOOR - h * .55, h * .75, rgbOf(CHU));
  ctx.restore();
  const im = image(images, PAREO_CHU_SHEET);
  const pose = T < G.kick ? { c: 0, r: 1 } : { c: 0, r: 0 };
  ctx.save();
  ctx.translate(e.x, FLOOR - 5);
  ctx.scale(dir, 1);
  if (im) {
    const rim = tintSheet(im, '#ffffff');
    const wash = tintSheet(im, CHU);
    ctx.imageSmoothingEnabled = true;
    if (rim) {
      const big = h * 1.07;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * .45;
      ctx.drawImage(rim, pose.c * CELL, pose.r * CELL, CELL, CELL, -big / 2, -big + h * .03, big, big);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, pose.c * CELL, pose.r * CELL, CELL, CELL, -h / 2, -h, h, h);
    if (wash) {
      ctx.globalAlpha = alpha * .55;
      ctx.drawImage(wash, pose.c * CELL, pose.r * CELL, CELL, CELL, -h / 2, -h, h, h);
    }
  } else {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = CHU;
    ctx.fillRect(-9, -h * .66, 18, h * .4);
    ctx.beginPath(); ctx.arc(0, -h * .78, h * .1, 0, TAU); ctx.fill();
    ctx.fillRect(0, -h * .64, h * .36, 6);
  }
  ctx.restore();
  // The line from her hand to PAREO's chest: a headphone cord of light, drawn out, then it carries the colour.
  const lineIn = span(T, G.line, G.line + .25);
  const lineOut = 1 - span(T, G.color + .1, G.color + .45);
  if (lineIn > 0 && lineOut > 0 && e.tx != null) {
    const px = e.x + e.tx, py = FLOOR + (e.ty ?? -100);
    const ex = hand.x + (px - hand.x) * lineIn, ey = hand.y + (py - hand.y) * lineIn;
    const sag = 22 * (1 - span(T, G.line + .2, G.color));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (const [w, a, c] of [[9, .25, CHU], [4, .7, '#bff3ff'], [1.6, 1, '#ffffff']] as const) {
      ctx.globalAlpha = alpha * lineOut * a;
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(hand.x, hand.y);
      ctx.quadraticCurveTo((hand.x + ex) / 2, (hand.y + ey) / 2 + sag, ex, ey);
      ctx.stroke();
    }
    // A bead of light running along it.
    const u = (T * 1.8) % 1;
    ctx.globalAlpha = alpha * lineOut;
    glow(ctx, hand.x + (ex - hand.x) * u, hand.y + (ey - hand.y) * u + sag * .5 * Math.sin(Math.PI * u), 12, '255,255,255');
    if (lineIn >= 1) {
      // Where it reaches her: a small heart lighting up on her chest (the winged pendant).
      const k = span(T, G.line + .25, G.color);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha * lineOut;
      glow(ctx, px, py, 18 + k * 18, rgbOf(PINK));
      shinyHeart(ctx, px, py, 7 + k * 4, PINK);
    }
    ctx.restore();
  }
}

/* ---- effects ---- */

export function drawPareoFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('pareo-')) return false;
  lite = liteFx;
  const t = e.max > 0 ? 1 - clamp(e.life / e.max, 0, 1) : 1;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    case 'pareo-jk': {
      // Two-tone tap: a pink ring, a blue ring a beat behind, and little hearts flicked along the swing.
      const r = (e.heavy ? 22 : 15) + easeOut(t) * (e.heavy ? 18 : 12);
      ctx.lineWidth = e.heavy ? 3.5 : 2.5;
      ctx.globalAlpha = (1 - t) * .85;
      ctx.strokeStyle = PINK;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = (1 - t) * .6;
      ctx.strokeStyle = BLUE;
      ctx.beginPath(); ctx.arc(e.x + dir * 4, e.y, r * .7, 0, TAU); ctx.stroke();
      burst(el, e.heavy ? 81 : 82, { n: n(e.heavy ? 5 : 3), speed: [70, 150], life: .32, gravity: -60, angle: dir > 0 ? -.4 : Math.PI + .4, spread: 1.4 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = TWO[i % 2];
        heart(ctx, x, y, 4.5 * (1 - k * .5));
      }, e.x, e.y);
      break;
    }
    case 'pareo-stomp': {
      // The platform shoe comes down: a flat dust ring and two puffs either side of the sole.
      ctx.globalAlpha = (1 - t) * .5;
      ctx.strokeStyle = '#f2e6ef';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 2, 18 + easeOut(t) * 34, 4 + easeOut(t) * 5, 0, 0, TAU); ctx.stroke();
      for (const s of [-1, 1]) {
        ctx.globalAlpha = (1 - t) * .45;
        glow(ctx, e.x + s * (14 + easeOut(t) * 26), e.y - 6 - t * 8, 10 + t * 10, '240,226,236');
      }
      break;
    }
    case 'pareo-ears': {
      // 忠犬: a pair of floppy dog ears on her head (pink and blue), bouncing with the run, and a wagging tail of light.
      const h = e.radius ?? 178;
      const hx = e.x, hy = e.y - h * .97;
      const pop = easeOut(span(el, 0, .14));
      const flap = Math.sin(el * 30) * .28;
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(hx + s * h * .07, hy + h * .02);
        ctx.rotate(s * (.55 + flap * (s > 0 ? 1 : -1)));
        ctx.scale(pop, pop);
        ctx.fillStyle = '#2a2433';
        ctx.beginPath(); ctx.ellipse(0, -h * .06, h * .045, h * .085, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = s < 0 ? PINK : BLUE;
        ctx.beginPath(); ctx.ellipse(0, -h * .06, h * .03, h * .068, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      // Two speed ribbons of her colours streaming off her back like a wagging tail: one tapered path each.
      const fade = (e.life < .15 ? e.life / .15 : 1) * pop;
      ctx.globalCompositeOperation = 'lighter';
      for (let r = 0; r < 2; r++) {
        const y0 = e.y - h * (r ? .36 : .56), len = h * (r ? .42 : .4), w0 = h * (r ? .04 : .055);
        const seg = 7;
        ctx.globalAlpha = .5 * fade;
        ctx.fillStyle = TWO[r];
        ctx.beginPath();
        for (let j = 0; j <= seg * 2 + 1; j++) {
          const jj = j <= seg ? j : seg * 2 + 1 - j;
          const k = jj / seg;
          const side = j <= seg ? -1 : 1;
          const wave = Math.sin(el * 24 - k * 3.2 + r * 1.7) * 9 * k;
          const x = e.x - dir * (10 + k * len);
          const y = y0 + wave + side * w0 * (1 - k) - k * h * .04;
          if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.fill();
      }
      break;
    }
    case 'pareo-dust': {
      ctx.globalAlpha = (1 - t) * .45;
      glow(ctx, e.x - dir * t * 16, e.y - 6 - t * 10, (e.radius ?? 10) * (1 + t), '238,228,236');
      break;
    }
    case 'pareo-tackle': {
      // The dive lands: a star of white streaks and a spray of hearts.
      const r = e.radius ?? 60;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      for (let i = 0, k = n(8); i < k; i++) {
        const a = (i / k) * TAU + .2;
        const r0 = r * (.2 + easeOut(t) * .4), r1 = r * (.5 + easeOut(t) * .6);
        ctx.globalAlpha = (1 - t) * .8;
        streak(ctx, e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0, e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1, 3);
      }
      ctx.globalCompositeOperation = 'source-over';
      burst(el, 84, { n: n(8), speed: [120, 260], life: .5, gravity: 220, drag: .3, angle: -Math.PI / 2, spread: 2.6 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        shinyHeart(ctx, x, y, 6 * (1 - k * .4), TWO[i % 2], (hash(i, 85) - .5));
      }, e.x, e.y);
      // 忠犬 got you: a paw print stamped over the hit, popping big then easing off.
      ctx.globalAlpha = (1 - span(t, .45, 1)) * .95;
      paw(ctx, e.x + dir * 6, e.y - 4, r * .42 * (.55 + .45 * easeOut(span(t, 0, .2))) * (1 + .15 * bump(span(t, 0, .3))), dir * .3);
      break;
    }
    case 'pareo-wig-pop': {
      // The old wig flies off in her two colours; the new colour lights up round her head.
      const h = e.radius ?? 178;
      const w = PAREO_WIGS[e.n ?? 0] ?? PAREO_WIGS[0];
      const hy = e.y - h * .8;
      const rgb = rgbOf(w.hair);
      // Ta-da: an idol spotlight in the new colour drops on her from above (one gradient trapezoid).
      const top = e.y - h * 1.45, beam = (1 - span(t, .35, 1)) * easeOut(span(t, 0, .15));
      if (beam > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createLinearGradient(0, top, 0, e.y);
        gr.addColorStop(0, `rgba(${rgb},0)`);
        gr.addColorStop(.35, `rgba(${rgb},.32)`);
        gr.addColorStop(1, `rgba(${rgb},.1)`);
        ctx.globalAlpha = beam;
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(e.x - 14, top); ctx.lineTo(e.x + 14, top);
        ctx.lineTo(e.x + h * .34, e.y); ctx.lineTo(e.x - h * .34, e.y);
        ctx.fill();
        // The dye running down the twin tails: a soft band of the new colour from the crown to the knees.
        const u = span(t, 0, .5);
        if (u > 0 && u < 1) {
          ctx.save();
          ctx.translate(e.x, e.y - h * (.95 - easeOut(u) * .65));
          ctx.scale(2.2, .5);
          ctx.globalAlpha = bump(u) * .75;
          glow(ctx, 0, 0, h * .2, rgb);
          ctx.restore();
        }
        ctx.restore();
      }
      ctx.globalAlpha = (1 - t) * .6;
      glow(ctx, e.x, hy, 34 + easeOut(t) * 30, rgb);
      // The old wig flies off as curls of hair in her two colours, the new colour's curls after them.
      ctx.lineCap = 'round';
      ctx.lineWidth = 2.6;
      burst(el, 86, { n: n(14), speed: [140, 300], life: .7, gravity: 380, drag: .5, angle: -Math.PI / 2, spread: 2.8 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = i < 7 ? TWO[i % 2] : (i % 2 ? w.hair : w.tip);
        const a = k * 9 + i;
        ctx.beginPath(); ctx.arc(x, y, 5 + (i % 3) * 1.5, a, a + 2.3); ctx.stroke();
      }, e.x, hy);
      // One big idol star by the crown.
      const st = span(t, .04, .55);
      if (st > 0 && st < 1) {
        ctx.globalAlpha = bump(st);
        ctx.fillStyle = '#ffffff';
        sparkle(ctx, e.x + dir * h * .14, hy - h * .14, 8 + 14 * bump(st));
      }
      for (let i = 0, k = n(5); i < k; i++) {
        const a = (i / k) * TAU + el * 3;
        ctx.globalAlpha = bump(t) * .9;
        ctx.fillStyle = '#ffffff';
        sparkle(ctx, e.x + Math.cos(a) * 46, hy + Math.sin(a) * 22, 6);
      }
      break;
    }
    case 'pareo-open': {
      // Arms open, waiting to be kicked: a soft pink glow and slow hearts rising behind her, beating faster as she waits.
      const h = e.radius ?? 178;
      ctx.globalAlpha = .4 * Math.min(1, el / .15);
      glow(ctx, e.x, e.y - h * .55, h * .5 * (1 + .06 * Math.sin(el * (8 + t * 10))), rgbOf(PINK));
      // Her heart, beating faster the longer she waits: a big translucent heart over her chest, added as light.
      const beat = Math.pow(Math.abs(Math.sin(el * (4.5 + t * 7))), 8);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (.26 + .3 * beat) * Math.min(1, el / .15);
      ctx.fillStyle = PINK;
      heart(ctx, e.x, e.y - h * .6, h * .16 * (1 + .14 * beat));
      ctx.restore();
      for (let i = 0, k = n(5); i < k; i++) {
        const u = cycle(el, .9, i, 87);
        ctx.globalAlpha = bump(u) * .85;
        shinyHeart(ctx, e.x + (hash(i, 88) - .5) * h * .5, e.y - h * (.45 + u * .6), 5 + hash(i, 89) * 3, TWO[i % 2]);
      }
      break;
    }
    case 'pareo-sulk': {
      // Nobody came: a small grey cloud of sulk over her head, two drops falling off it.
      ctx.globalAlpha = bump(t) * .7;
      ctx.fillStyle = '#9a96a8';
      for (const [dx, dy, r] of [[-10, 0, 9], [2, -4, 11], [13, 1, 8]] as const) dot(ctx, e.x + dx, e.y + dy, r);
      ctx.fillStyle = '#bfe9ff';
      for (let i = 0; i < 2; i++) {
        const u = (t * 1.6 + i * .5) % 1;
        ctx.globalAlpha = (1 - u) * .8;
        dot(ctx, e.x - 6 + i * 12, e.y + 10 + u * 22, 2.4);
      }
      break;
    }
    case 'pareo-hearts': {
      // 「要踢就踢PAREO吧！」: kicked, and so happy about it. A heart bursts, smaller hearts spray out.
      const r = e.radius ?? 70;
      const big = (e.n ?? 1) > 1;
      ctx.globalAlpha = (1 - t) * .9;
      shinyHeart(ctx, e.x, e.y - easeOut(t) * 20, (16 + easeOut(t) * 10) * (big ? 1.4 : 1), PINK);
      ctx.globalAlpha = (1 - t) * .5;
      glow(ctx, e.x, e.y, r * (.6 + t * .6), rgbOf(PINK));
      burst(el, 90, { n: n(big ? 16 : 9), speed: [110, 240], life: .7, gravity: -40, drag: .4 }, (x, y, k, i) => {
        ctx.globalAlpha = 1 - k;
        shinyHeart(ctx, x, y, 5 * (1 - k * .4), TWO[i % 2], (hash(i, 91) - .5) * .8);
      }, e.x, e.y);
      break;
    }
    case 'pareo-keys': {
      // Reo's flying kick: a row of keys flashes along the kick and scatters (the keyboard she kicked broken).
      const r = e.radius ?? 90;
      const heavy = !!e.heavy;
      const keys = heavy ? 9 : 6;
      const kw = 13, kh = heavy ? 54 : 42;
      // The kick's arc first: a crescent of her two colours swept up through the hit.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const sw = easeOut(span(t, 0, .3)), fa = 1 - span(t, .2, .8);
      for (let i = 0; i < 2; i++) {
        ctx.globalAlpha = fa * (i ? .4 : .65);
        ctx.fillStyle = TWO[i];
        crescent(ctx, e.x - dir * r * .12, e.y + r * .3, r * (heavy ? .85 : .72) * (1 + i * .12), dir, sw);
      }
      ctx.restore();
      for (let i = 0; i < keys; i++) {
        const fly = easeOut(span(t, .15, 1));
        const off = (i - keys / 2) * kw;
        const x = e.x - dir * (r * .3) + dir * off + dir * fly * (20 + hash(i, 92) * 60);
        const y = e.y - fly * (hash(i, 93) * 50 - 10) + fly * fly * 40;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(fly * (hash(i, 94) - .5) * 2.4);
        ctx.globalAlpha = (1 - t) * .95;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-kw / 2 + 1, -kh / 2, kw - 2, kh);
        ctx.fillStyle = TWO[i % 2];
        ctx.fillRect(-kw / 2 + 1, kh / 2 - 5, kw - 2, 5);
        if (i % 7 !== 2 && i % 7 !== 6) { ctx.fillStyle = '#231f2e'; ctx.fillRect(kw / 2 - 4, -kh / 2, 7, kh * .58); }
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - t) * .8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = heavy ? 5 : 3.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, 18 + easeOut(t) * r * .5, 0, TAU); ctx.stroke();
      ctx.globalAlpha = (1 - t) * .5;
      glow(ctx, e.x, e.y, r * (.5 + t * .5), rgbOf(PINK));
      break;
    }
    case 'pareo-wave': {
      // The grey opening: a sound wave rolling forward along the floor (white rings; the world is grey under it).
      const reach = e.radius ?? 520;
      for (let i = 0; i < 3; i++) {
        const u = span(t, i * .12, .7 + i * .12);
        if (u <= 0 || u >= 1) continue;
        const x = e.x + dir * u * reach;
        ctx.globalAlpha = (1 - u) * .85;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4 - i;
        ctx.beginPath();
        ctx.ellipse(x, e.y, 14 + u * 10, 62 + u * 26, 0, dir > 0 ? -1.2 : Math.PI - 1.2, dir > 0 ? 1.2 : Math.PI + 1.2);
        ctx.stroke();
      }
      break;
    }
    case 'pareo-heart-hit': {
      const c = TWO[(e.n ?? 0) % 2];
      ctx.globalAlpha = (1 - t);
      shinyHeart(ctx, e.x, e.y - t * 14, 9 + easeOut(t) * 8, c, dir * .2);
      ctx.globalAlpha = (1 - t) * .7;
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, 12 + easeOut(t) * 26, 0, TAU); ctx.stroke();
      break;
    }
    case 'pareo-gray': drawGray(ctx, e, el); break;
    case 'pareo-chu': drawChu(ctx, e, el, images); break;
    default: break;
  }
  ctx.restore();
  return true;
}
