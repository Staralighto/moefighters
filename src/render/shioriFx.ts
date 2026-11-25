import type { Effect, Projectile } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import type { Fighter } from '../game/fighter.ts';
import { FLOOR, H, clamp } from '../game/constants.ts';
import { CELL, SHIORI_ACOLYTE, SHIORI_CHARTER } from './clips.ts';
import { hoverDescent, hoverFull } from './hover.ts';
import { TAU, burst, cycle, dot, glow, hash, petal, sparkle } from './fxParticles.ts';

/* 香农栞 — 司书、圣女. One register, kept restrained so it reads from across the stage:
   - warm temple light: cream white with a gold core, her orange (#D97757) only as an accent; additive, never neon.
   - her motif is the radiant flower of her hair ornament: eight soft tapered rays from a point. It is the floor sigil
     of 封缄之印, the seal over a silenced head, the halo behind her in 三重祷言 and 圣典裁决, and the emblem on the book.
   - paper: cream pages with a thin gold edge (恕难从命's barrier, 颂诗's blades, the pages that fly off the 巨典).
   No rings stacked on rings and no filigree: one soft ellipse marks the sigil's reach, everything else is glow, rays,
   pages and a few motes. Nothing written on screen. The busiest frame (the verdict) is about 40 particles; lite halves. */

export const SHIORI_BACK: readonly string[] = ['shiori-charter', 'shiori-verdict', 'shiori-hover-land'];
export const SHIORI_FRONT_SOFT: readonly string[] = ['shiori-verdict-front'];

const GOLD_RGB = '255,214,128';
const WARM_RGB = '255,236,200';
const WHITE_RGB = '255,251,242';
const CREAM = '#fff4dc';
const GOLD = '#f2c46a';
const GOLD_DEEP = '#c9923f';
const MOTES: readonly string[] = ['#fffaf0', '#ffe2a6', '#ffc98a', '#f4a27f'];

const count = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const SHIORI_COMMON = '/sprites/shiori/common.png';

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

/** The radiant flower: `n` soft tapered rays of length r from x, y, turned by rot; squash flattens it onto the floor.
 *  Fills with the current style. */
function flower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, n = 8, squash = 1, width = .2): void {
  if (!(r > 0)) return;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + i * TAU / n;
    const len = r * (i % 2 ? .72 : 1);
    const ca = Math.cos(a), sa = Math.sin(a);
    const cw = Math.cos(a + Math.PI / 2), sw = Math.sin(a + Math.PI / 2);
    const w = len * width;
    const bx = x + ca * len * .28, by = y + sa * len * .28 * squash;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(bx + cw * w, by + sw * w * squash, x + ca * len, y + sa * len * squash);
    ctx.quadraticCurveTo(bx - cw * w, by - sw * w * squash, x, y);
  }
  ctx.fill();
}

/** A page: cream with a thin gold edge and three faint lines of text, baked once (it is drawn dozens of times a
 *  frame in 颂诗 and the barrier) and stamped at w × h, turned by rot, at `alpha`. Leaves globalAlpha at `alpha`. */
const PAGE_W = 36, PAGE_H = 48;
let pageCache: HTMLCanvasElement | null | undefined;
function pageSprite(): HTMLCanvasElement | null {
  if (pageCache !== undefined) return pageCache;
  if (typeof document === 'undefined') return (pageCache = null);
  const c = document.createElement('canvas');
  c.width = PAGE_W; c.height = PAGE_H;
  const g = c.getContext('2d');
  if (!g) return (pageCache = null);
  g.fillStyle = CREAM;
  g.fillRect(1, 1, PAGE_W - 2, PAGE_H - 2);
  g.strokeStyle = GOLD;
  g.lineWidth = 2.4;
  g.strokeRect(2, 2, PAGE_W - 4, PAGE_H - 4);
  g.globalAlpha = .35;
  g.fillStyle = GOLD_DEEP;
  for (let i = 0; i < 3; i++) g.fillRect(PAGE_W * .18, PAGE_H * .25 + i * PAGE_H * .22, PAGE_W * (i === 2 ? .4 : .64), 2);
  return (pageCache = c);
}
function page(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rot: number, alpha: number): void {
  if (!(w > 0) || !(h > 0) || alpha <= .01) return;
  ctx.globalAlpha = alpha;
  const sprite = pageSprite();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (sprite) ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
  else { ctx.fillStyle = CREAM; ctx.fillRect(-w / 2, -h / 2, w, h); }
  ctx.rotate(-rot);
  ctx.translate(-x, -y);
}

/** 巨典 (and the book over her in a full prayer): a thick old tome, cover to the viewer, baked once at 2× and stamped.
 *  Orange-brown leather with a soft top-left sheen, the spine with three raised gold bands on the left, a double gold
 *  border, gold corner plates, the radiant flower in a gold medallion round an orange gem, the gilt page block showing
 *  along the right and bottom edges, and a ribbon bookmark (her 栞) hanging out of it. */
const TOME_W = 300, TOME_H = 250;
let tomeCache: HTMLCanvasElement | null | undefined;
function tomeSprite(): HTMLCanvasElement | null {
  if (tomeCache !== undefined) return tomeCache;
  if (typeof document === 'undefined') return (tomeCache = null);
  const k = 2;
  const c = document.createElement('canvas');
  c.width = TOME_W * k; c.height = TOME_H * k;
  const g = c.getContext('2d');
  if (!g) return (tomeCache = null);
  g.scale(k, k);
  g.lineJoin = 'round';
  const x0 = 18, y0 = 14, cw = 250, ch = 196, depth = 14;
  const round = (x: number, y: number, w: number, h: number, r: number) => {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  };
  // Back board, then the page block between the boards (right and bottom), gilt and lined.
  round(x0 + depth, y0 + depth, cw, ch, 10);
  g.fillStyle = '#4e2216'; g.fill();
  g.fillStyle = '#efe0bf';
  g.beginPath();
  g.moveTo(x0 + cw - 4, y0 + 8); g.lineTo(x0 + cw + depth - 6, y0 + depth + 4);
  g.lineTo(x0 + cw + depth - 6, y0 + ch + depth - 6); g.lineTo(x0 + 10, y0 + ch + depth - 6);
  g.lineTo(x0 + 4, y0 + ch - 4); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(176,132,64,.55)'; g.lineWidth = .8;
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    g.beginPath(); g.moveTo(x0 + cw - 4 + (depth - 2) * t, y0 + 8 + (depth - 4) * t); g.lineTo(x0 + cw - 4 + (depth - 2) * t, y0 + ch - 4 + (depth - 2) * t); g.stroke();
    g.beginPath(); g.moveTo(x0 + 4 + (depth - 2) * t, y0 + ch - 4 + (depth - 2) * t); g.lineTo(x0 + cw - 4 + (depth - 2) * t, y0 + ch - 4 + (depth - 2) * t); g.stroke();
  }
  // The ribbon bookmark out of the bottom of the block.
  g.fillStyle = '#e0683f';
  g.beginPath();
  g.moveTo(x0 + 168, y0 + ch + 6); g.lineTo(x0 + 182, y0 + ch + 6); g.lineTo(x0 + 184, y0 + ch + 34);
  g.lineTo(x0 + 176, y0 + ch + 27); g.lineTo(x0 + 168, y0 + ch + 35); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x0 + 170, y0 + ch + 6, 3, 26);
  // Front cover: leather, darker towards the edges.
  round(x0, y0, cw, ch, 10);
  const leather = g.createLinearGradient(0, y0, 0, y0 + ch);
  leather.addColorStop(0, '#b05c3c'); leather.addColorStop(.55, '#8e4429'); leather.addColorStop(1, '#6a2e1c');
  g.fillStyle = leather; g.fill();
  const edge = g.createRadialGradient(x0 + cw * .45, y0 + ch * .42, ch * .25, x0 + cw * .45, y0 + ch * .42, cw * .72);
  edge.addColorStop(0, 'rgba(40,14,8,0)'); edge.addColorStop(1, 'rgba(40,14,8,.45)');
  g.fillStyle = edge; g.fill();
  g.strokeStyle = '#3a170e'; g.lineWidth = 2.5; g.stroke();
  // Spine with three raised bands.
  g.fillStyle = 'rgba(30,10,6,.35)'; g.fillRect(x0 + 4, y0 + 4, 20, ch - 8);
  g.strokeStyle = '#3a170e'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x0 + 24, y0 + 6); g.lineTo(x0 + 24, y0 + ch - 6); g.stroke();
  for (const t of [.22, .5, .78]) {
    const gy = y0 + ch * t;
    const band = g.createLinearGradient(0, gy - 4, 0, gy + 4);
    band.addColorStop(0, '#fff0b8'); band.addColorStop(.5, '#e0a94e'); band.addColorStop(1, '#94621f');
    g.fillStyle = band; g.fillRect(x0 + 5, gy - 4, 18, 8);
  }
  // Double gold border.
  const gold = g.createLinearGradient(x0, y0, x0 + cw, y0 + ch);
  gold.addColorStop(0, '#ffe7a3'); gold.addColorStop(.5, '#e2ad55'); gold.addColorStop(1, '#a86f27');
  g.strokeStyle = gold;
  g.lineWidth = 3; round(x0 + 36, y0 + 14, cw - 50, ch - 28, 6); g.stroke();
  g.lineWidth = 1.2; round(x0 + 43, y0 + 21, cw - 64, ch - 42, 4); g.stroke();
  // Corner plates.
  g.fillStyle = gold;
  for (const [cx, cy, sx, sy] of [[x0 + cw, y0, -1, 1], [x0 + cw, y0 + ch, -1, -1], [x0 + 26, y0, 1, 1], [x0 + 26, y0 + ch, 1, -1]] as const) {
    g.beginPath();
    g.moveTo(cx, cy); g.lineTo(cx + sx * 30, cy); g.quadraticCurveTo(cx + sx * 14, cy + sy * 6, cx + sx * 8, cy + sy * 14);
    g.quadraticCurveTo(cx + sx * 6, cy + sy * 20, cx, cy + sy * 30); g.closePath(); g.fill();
  }
  // The medallion: one gold ring, the flower in it, an orange gem at the heart.
  const mx = x0 + 26 + (cw - 26) / 2, my = y0 + ch / 2;
  g.fillStyle = 'rgba(40,14,8,.35)';
  g.beginPath(); g.arc(mx, my + 2, 52, 0, TAU); g.fill();
  g.strokeStyle = gold; g.lineWidth = 3;
  g.beginPath(); g.arc(mx, my, 50, 0, TAU); g.stroke();
  g.fillStyle = gold;
  flower(g, mx, my, 44, -Math.PI / 2, 8, 1, .2);
  const gem = g.createRadialGradient(mx - 3, my - 3, 1, mx, my, 11);
  gem.addColorStop(0, '#ffe2c4'); gem.addColorStop(.35, '#f08a55'); gem.addColorStop(1, '#a33c1c');
  g.fillStyle = gem;
  g.beginPath(); g.arc(mx, my, 10, 0, TAU); g.fill();
  g.strokeStyle = '#ffe7a3'; g.lineWidth = 1.5; g.stroke();
  // A soft sheen across the top-left of the leather.
  round(x0, y0, cw, ch, 10);
  g.save(); g.clip();
  const sheen = g.createLinearGradient(x0, y0, x0 + cw * .6, y0 + ch * .6);
  sheen.addColorStop(0, 'rgba(255,236,210,.28)'); sheen.addColorStop(.5, 'rgba(255,236,210,0)');
  g.fillStyle = sheen; g.fillRect(x0, y0, cw, ch);
  g.restore();
  return (tomeCache = c);
}
/** The tome centred on x, y, `w` px wide, turned by rot, at the current alpha. Falls back to a plain block. */
function tome(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, rot: number): void {
  if (!(w > 0)) return;
  const h = w * TOME_H / TOME_W;
  const sprite = tomeSprite();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (sprite) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
  } else {
    ctx.fillStyle = '#8a4430';
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }
  ctx.restore();
}

/** One soft light beam: narrow at the top, widening to `foot` half-width at the floor, brightest on its axis and
 *  fading to nothing at both edges; baked once, stretched to any height. */
/** The beam sprite's half-width at its top, as a share of its half-width at the bottom. */
const BEAM_TOP = .18;
let beamCache: HTMLCanvasElement | null | undefined;
function beamSprite(): HTMLCanvasElement | null {
  if (beamCache !== undefined) return beamCache;
  if (typeof document === 'undefined') return (beamCache = null);
  const w = 128, h = 256, top = BEAM_TOP;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (!g) return (beamCache = null);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    const hw = (top + (1 - top) * v) * (w / 2);
    const a = .55 + .45 * v * v;
    const gr = g.createLinearGradient(w / 2 - hw, 0, w / 2 + hw, 0);
    gr.addColorStop(0, `rgba(${GOLD_RGB},0)`);
    gr.addColorStop(.25, `rgba(${GOLD_RGB},${(a * .35).toFixed(3)})`);
    gr.addColorStop(.42, `rgba(${WARM_RGB},${(a * .75).toFixed(3)})`);
    gr.addColorStop(.5, `rgba(${WHITE_RGB},${a.toFixed(3)})`);
    gr.addColorStop(.58, `rgba(${WARM_RGB},${(a * .75).toFixed(3)})`);
    gr.addColorStop(.75, `rgba(${GOLD_RGB},${(a * .35).toFixed(3)})`);
    gr.addColorStop(1, `rgba(${GOLD_RGB},0)`);
    g.fillStyle = gr;
    g.fillRect(0, y, w, 1);
  }
  return (beamCache = c);
}
/** How far below the screen's bottom edge a beam keeps going, so a zoomed camera never shows where it ends. */
const BEAM_PAST = H - FLOOR + 90;
/** The beam from `top` down past the floor at x: half-width `foot` where it crosses the floor line, still widening
 *  below it, so it falls through the stage floor to the front edge instead of stopping on a hard line at the feet. */
function beam(ctx: CanvasRenderingContext2D, x: number, top: number, foot: number, alpha: number): void {
  if (alpha <= .01 || !(foot > 0) || !(FLOOR > top)) return;
  const sprite = beamSprite();
  const bottom = FLOOR + BEAM_PAST;
  const h = bottom - top;
  // The sprite widens linearly from BEAM_TOP of its width to all of it, so its half-width at the floor is `foot`
  // when the bottom half-width is scaled by where the floor sits along it.
  const v = (FLOOR - top) / h;
  const half = foot / (BEAM_TOP + (1 - BEAM_TOP) * v);
  ctx.globalAlpha = alpha;
  if (sprite) ctx.drawImage(sprite, x - half, top, half * 2, h);
  else { ctx.fillStyle = `rgba(${WARM_RGB},.5)`; ctx.fillRect(x - foot * .4, top, foot * .8, h); }
}

/* ---- the acolytes: her own art under a gold wash, baked once ---- */

const washCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
function goldWash(src: HTMLImageElement): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const hit = washCache.get(src);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = src.naturalWidth;
  c.height = src.naturalHeight;
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = '#ffd48a';
  g.fillRect(0, 0, c.width, c.height);
  washCache.set(src, c);
  return c;
}
const ACOLYTE_H = 189;
/** Her sprite box lift (characters.ts view.lift). */
const ACOLYTE_BASE = 5;
/** 悬浮: her acolytes float at her own rest height (characters.ts view.hover.lift, held equal by selfcheck). */
export const SHIORI_HOVER_LIFT = 16;
/** One acolyte at feet x, facing dir, at opacity a: art faintly through the wash, a soft rim of light behind. */
function acolyte(ctx: CanvasRenderingContext2D, im: HTMLImageElement | undefined, x: number, dir: number, a: number): void {
  if (a <= .01) return;
  const H = ACOLYTE_H;
  ctx.save();
  ctx.translate(x, FLOOR - SHIORI_HOVER_LIFT - ACOLYTE_BASE);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a * .4;
  glow(ctx, 0, -H * .5, H * .5, GOLD_RGB);
  ctx.globalCompositeOperation = 'source-over';
  ctx.scale(dir, 1);
  const sx = SHIORI_ACOLYTE.col * CELL, sy = SHIORI_ACOLYTE.row * CELL;
  const y0 = -H + 12 * H / CELL;
  if (im) {
    const wash = goldWash(im);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = a * .45;
    ctx.drawImage(im, sx, sy, CELL, CELL, -H / 2, y0, H, H);
    if (wash) {
      ctx.globalAlpha = a * .6;
      ctx.drawImage(wash, sx, sy, CELL, CELL, -H / 2, y0, H, H);
    }
  } else {
    ctx.globalAlpha = a * .55;
    ctx.fillStyle = '#ffd48a';
    ctx.beginPath(); ctx.ellipse(0, -H * .42, 22, H * .4, 0, 0, TAU); ctx.fill();
    dot(ctx, 0, -H * .88, 16);
  }
  ctx.restore();
}

/* ---- 悬浮 (view.hover, render/hover.ts) ---- */

/** Under her floating feet, every frame (renderer, behind the bodies):
 *  - a soft warm pool of light on the floor that breathes with the bob (brighter as she dips), a faint glow at her
 *    toes, and three tiny radiant flowers — her hair-ornament motif — drifting up from the pool past her toes;
 *    gliding, they stream behind her. All of it fades with `level` as she drops, and is gone on the floor.
 *  - 满气威压: with her meter full the pool becomes her sigil, eight rays turning slowly on the floor.
 *  - the opening descent: the same sigil opens wide under her as she settles, then closes into the pool.
 *  - rising (a jump, her L, the victory ascent): her body does not move, the space does — thin threads of light
 *    stream down past her and one fading thread still ties her toes to the pool.
 *  Two stamps, one flower and a handful of strokes a frame; lite keeps two motes and three threads. */
export function drawShioriHover(ctx: CanvasRenderingContext2D, f: Fighter, lift: number, level: number, age: number, lite: boolean): void {
  if (level <= .02) return;
  const toe = f.y - lift;
  const rise = Math.max(0, FLOOR - f.y) + Math.max(0, lift - SHIORI_HOVER_LIFT - 12);
  const near = clamp(1 - rise / 240, 0, 1);
  const breathe = clamp(1.15 - (lift - SHIORI_HOVER_LIFT) / 14, .7, 1.3);
  const full = hoverFull(f), descent = f.attack ? 0 : hoverDescent(f);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (near > .02) {
    ctx.save();
    ctx.translate(f.x, FLOOR - 6);
    ctx.scale(1, .2);
    ctx.globalAlpha = level * near * .34 * breathe * (1 + full * .35);
    glow(ctx, 0, 0, 50 + full * 14, GOLD_RGB);
    ctx.globalAlpha = level * near * .3 * breathe;
    glow(ctx, 0, 0, 24, WHITE_RGB);
    // 满气威压 / the descent: her sigil on the floor. The descent opens it wide and closes it as she lands.
    const open = descent > 0 ? Math.sin(Math.PI * clamp(1 - descent, 0, 1)) : 0;
    const sigil = Math.max(full * .55, open * .8) * near;
    if (sigil > .02) {
      ctx.globalAlpha = sigil;
      ctx.fillStyle = CREAM;
      flower(ctx, 0, 0, 44 + full * 8 + open * 34, age * .35, 8, 1, .14);
      ctx.globalAlpha = sigil * .5;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(0, 0, 50 + full * 8 + open * 38, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalAlpha = level * .3 * (1 + full * .4);
  glow(ctx, f.x, toe + 2, 15, WARM_RGB);
  // Rising: the space streams down past her; a thread of light still reaches the pool.
  const flow = clamp(rise / 40, 0, 1) * level;
  if (flow > .02) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = CREAM;
    if (near > .02) {
      const g = ctx.createLinearGradient(0, toe, 0, FLOOR - 6);
      g.addColorStop(0, `rgba(${WARM_RGB},${(.4 * flow).toFixed(3)})`);
      g.addColorStop(1, `rgba(${WARM_RGB},0)`);
      ctx.globalAlpha = near;
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(f.x, toe + 4); ctx.lineTo(f.x, FLOOR - 6); ctx.stroke();
      ctx.strokeStyle = CREAM;
    }
    const n = lite ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const u = cycle(age, 1.5, i, 7);
      const x = f.x + (hash(i, 8) - .5) * 96;
      const y = toe - 175 + u * 210;
      const a = Math.sin(Math.PI * u) * flow * .4;
      if (a <= .01) continue;
      ctx.globalAlpha = a;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 18 + 14 * hash(i, 9)); ctx.stroke();
    }
  }
  const gliding = (f.walk ?? 0) > 0 ? 1 : 0;
  const n = lite ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const u = cycle(age, .42, i, 3);
    const y = FLOOR - 4 + (toe - 18 - (FLOOR - 4)) * u;
    const x = f.x + (hash(i, 1) - .5) * 34 + Math.sin(age * 1.7 + i * 2.1) * 4 - f.facing * gliding * u * 26;
    const a = Math.sin(Math.PI * u) * level;
    if (a <= .02) continue;
    if (!lite) { ctx.globalAlpha = a * .35; glow(ctx, x, y, 7, GOLD_RGB); }
    ctx.globalAlpha = a * .9;
    ctx.fillStyle = MOTES[i % MOTES.length];
    flower(ctx, x, y, 3.6 * (1 - .3 * u), age * 1.1 + i * 1.3, 6, 1, .3);
  }
  ctx.restore();
}

/* ---- J / K and the guard (aura.swing / aura.guard) ---- */

/** J 如您所言 (a palm push, at the palm): her radiant flower opens in the palm and one ring of light — a disc seen
 *  edge-on — is pushed forward off it, a fainter one behind. K 所言极是 (a hanging-foot sweep): a cream arc with a
 *  gold edge drawn along the foot's path from behind-low to front, shedding a few small flowers. A hit adds a
 *  white glint. Air versions are the same. */
function swing(ctx: CanvasRenderingContext2D, e: Effect, el: number, dir: number, lite: boolean): void {
  const p = clamp(el / e.max, 0, 1), k = 1 - p;
  const r = e.radius ?? 50;
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(e.x, e.y);
  ctx.scale(dir, 1);
  if (!e.heavy) {
    ctx.globalAlpha = k * .7;
    glow(ctx, 0, 0, 16 + 18 * k, GOLD_RGB);
    ctx.globalAlpha = k * .9;
    ctx.fillStyle = CREAM;
    flower(ctx, 0, 0, 10 + 16 * ease(p * 1.8), p * 1.2, 8, 1, .2);
    for (const [lag, a] of [[0, .8], [.18, .35]] as const) {
      const q = clamp((p - lag) / (1 - lag), 0, 1);
      if (q <= 0) continue;
      const x = 8 + r * 1.1 * ease(q), ry = 20 + 24 * ease(q);
      ctx.globalAlpha = (1 - q) * a;
      ctx.strokeStyle = CREAM;
      ctx.lineWidth = .8 + 2.6 * (1 - q);
      ctx.beginPath(); ctx.ellipse(x, 0, 4 + 5 * q, ry, 0, 0, TAU); ctx.stroke();
    }
    if (e.hit) { ctx.globalAlpha = k; ctx.fillStyle = '#ffffff'; sparkle(ctx, 10 + r * .9 * ease(p), 0, 9 * k + 2); }
    return;
  }
  // The sweep: a circle hung from the hip; the foot runs from behind-low (140°) through the bottom to front (20°).
  const cx = -r * .15, cy = -r * .75, R = r * 1.05;
  const a0 = Math.PI * .78, a1 = Math.PI * .11;
  const head = ease(p * 2.4), tail = ease((p - .22) / .78);
  const from = a0 + (a1 - a0) * Math.max(0, tail), to = a0 + (a1 - a0) * head;
  ctx.lineCap = 'round';
  if (to < from - .01) {
    ctx.globalAlpha = k * .35;
    ctx.strokeStyle = `rgb(${GOLD_RGB})`;
    ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(cx, cy, R, from, to, true); ctx.stroke();
    ctx.globalAlpha = k * .95;
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.arc(cx, cy, R, from, to, true); ctx.stroke();
  }
  const hx = cx + Math.cos(to) * R, hy = cy + Math.sin(to) * R;
  ctx.globalAlpha = k * .6;
  glow(ctx, hx, hy, 14, WARM_RGB);
  const n = lite ? 3 : 5;
  for (let i = 0; i < n; i++) {
    const ang = a0 + (a1 - a0) * ((i + .5) / n);
    if ((a1 - a0) * ((i + .5) / n) < (to - a0) - .01) continue;
    const out = 4 + 22 * ease(p) * (.6 + .6 * hash(i, 31));
    const x = cx + Math.cos(ang) * (R + out), y = cy + Math.sin(ang) * (R + out) + 10 * p * p;
    ctx.globalAlpha = k * .85;
    ctx.fillStyle = MOTES[i % MOTES.length];
    flower(ctx, x, y, 3.4 * k + 1, p * 3 + i, 6, 1, .3);
  }
  if (e.hit) { ctx.globalAlpha = k; ctx.fillStyle = '#ffffff'; sparkle(ctx, hx, hy, 12 * k + 2); }
}

/** Holding guard (renderer, every frame while she blocks): the same edge-on sigil disc, quieter and steady,
 *  its rays turning slowly and its glow breathing. No flash, no flakes — those belong to a blocked hit. */
function guardHeld(ctx: CanvasRenderingContext2D, e: Effect, dir: number): void {
  const t = e.age ?? 0;
  const ry = 46, breathe = .85 + .15 * Math.sin(t * 4);
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(e.x, e.y);
  ctx.save();
  ctx.scale(.26, 1);
  ctx.globalAlpha = .3 * breathe;
  glow(ctx, 0, 0, ry * 1.1, GOLD_RGB);
  ctx.globalAlpha = .45 * breathe;
  ctx.fillStyle = CREAM;
  flower(ctx, 0, 0, ry * .78, t * .9 * dir, 8, 1, .16);
  ctx.restore();
  ctx.globalAlpha = .6;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, ry * .26, ry, 0, 0, TAU); ctx.stroke();
}

/** The guard: a disc of her sigil seen edge-on stands between her and the hit — eight rays in a gold rim —
 *  a white flash where the blow lands, and three page-light flakes flicked back toward the attacker (e.dir).
 *  It snaps open, holds, and fades. */
function guard(ctx: CanvasRenderingContext2D, e: Effect, el: number, dir: number, lite: boolean): void {
  if (e.n === 1) { guardHeld(ctx, e, dir); return; }
  const p = clamp(el / e.max, 0, 1);
  const open = ease(el / .07), fade = 1 - clamp((p - .35) / .65, 0, 1);
  const ry = 50 * (.6 + .4 * open);
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(e.x, e.y);
  ctx.save();
  ctx.scale(.26, 1);
  ctx.globalAlpha = fade * .45;
  glow(ctx, 0, 0, ry * 1.15, GOLD_RGB);
  ctx.globalAlpha = fade * .7;
  ctx.fillStyle = CREAM;
  flower(ctx, 0, 0, ry * .8, el * .8, 8, 1, .16);
  ctx.restore();
  ctx.globalAlpha = fade * .85;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.ellipse(0, 0, ry * .26, ry, 0, 0, TAU); ctx.stroke();
  const flash = 1 - clamp(el / .12, 0, 1);
  if (flash > 0) { ctx.globalAlpha = flash; ctx.fillStyle = '#ffffff'; sparkle(ctx, dir * 4, -6, 16 * flash + 3); }
  ctx.globalCompositeOperation = 'source-over';
  const n = lite ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const q = ease(p * 1.4);
    const x = dir * (10 + (40 + 26 * hash(i, 41)) * q);
    const y = (hash(i, 42) - .55) * 60 - 18 * q + 30 * p * p;
    ctx.globalAlpha = fade * .9;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(dir * (.4 + p * 3 * (hash(i, 43) + .3)));
    ctx.fillStyle = CREAM;
    ctx.fillRect(-5, -7, 10, 14);
    ctx.strokeStyle = GOLD_DEEP; ctx.lineWidth = 1;
    ctx.strokeRect(-5, -7, 10, 14);
    ctx.restore();
  }
}

/* ---- status looks (statusMarks.ts / renderer) ---- */

/** 'shiori-seal' (沉默 from 封缄之印 and 圣典裁决): a small gold flower seal over the head, turning slowly, and two motes
 *  circling it. Fades out over its last 0.3 s. */
export function auraShioriSeal(ctx: CanvasRenderingContext2D, f: Fighter, h: number, left: number, t: number, lite: boolean): void {
  const fade = Math.min(1, left / .3);
  const x = f.x, y = f.y - h - 26;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = fade * .5;
  glow(ctx, x, y, 24, GOLD_RGB);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = fade * .95;
  ctx.fillStyle = GOLD;
  flower(ctx, x, y, 13, t * .8);
  ctx.fillStyle = CREAM;
  dot(ctx, x, y, 3.4);
  if (!lite) {
    for (let i = 0; i < 2; i++) {
      const a = t * 2.4 + i * Math.PI;
      ctx.globalAlpha = fade * .8;
      ctx.fillStyle = MOTES[i];
      dot(ctx, x + Math.cos(a) * 20, y + Math.sin(a) * 7, 2);
    }
  }
  ctx.restore();
}
export function applyShioriSeal(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  burst(age, 141, { n: 10, speed: [50, 140], life: .6, gravity: -30, drag: .4 }, (x, y, k, i) => {
    ctx.globalAlpha = (1 - k) * .85;
    ctx.fillStyle = MOTES[i % MOTES.length];
    if (i % 3 === 0) sparkle(ctx, x, y, 6 * (1 - k * .5));
    else dot(ctx, x, y, 2.2);
  }, e.x, e.y - 175);
  ctx.restore();
}
/** 'shiori-weak' (削弱 from 恕难从命): two loose pages drifting down beside them, faint. Drawn as 'shiori-weak-aura'. */
function weakAura(ctx: CanvasRenderingContext2D, e: Effect, lite: boolean): void {
  const t = e.age ?? 0;
  const n = count(2, lite);
  for (let i = 0; i < n; i++) {
    const k = cycle(t, .55, i, 151);
    const side = i % 2 ? 1 : -1;
    const x = e.x + side * (30 + 10 * Math.sin(t * 2 + i)), y = e.y - 170 + k * 140;
    page(ctx, x, y, 12, 16, Math.sin(t * 3 + i * 2) * .5, Math.sin(k * Math.PI) * .55);
  }
}

/* ---- shots ---- */

export function drawShioriShot(ctx: CanvasRenderingContext2D, p: Projectile, liteFx: boolean): boolean {
  if (p.fx !== 'shiori-haiku' && p.fx !== 'shiori-page') return false;
  const dir = Math.sign(p.vx) || 1;
  ctx.save();
  if (p.fx === 'shiori-haiku') {
    // 俳句: a glowing petal of the flower, the middle (seven) one a size up, a few glints behind it.
    const s = p.skill.damage > 18 ? 1.25 : 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .5;
    glow(ctx, p.x, p.y, 30 * s, GOLD_RGB);
    for (let i = 1, n = count(3, liteFx); i <= n; i++) {
      const k = cycle(p.age, 3, i, 161);
      ctx.globalAlpha = (1 - k) * .8;
      ctx.fillStyle = MOTES[i % MOTES.length];
      sparkle(ctx, p.x - dir * (14 + k * 46), p.y + (hash(i, 162) - .5) * 16, 4.5 * (1 - k * .5));
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    petal(ctx, p.x, p.y, 13 * s, dir > 0 ? Math.PI / 2 : -Math.PI / 2, '#ffe9b8');
    ctx.fillStyle = '#ffffff';
    dot(ctx, p.x + dir * 3, p.y, 2.4 * s);
  } else {
    // 颂诗 / the page sent back: a page edge-on to its flight, turning a little, a soft streak of light behind.
    const ang = Math.atan2(p.vy, p.vx);
    const big = p.size >= 44;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .45;
    glow(ctx, p.x - Math.cos(ang) * 10, p.y - Math.sin(ang) * 10, big ? 30 : 20, WARM_RGB);
    ctx.strokeStyle = `rgba(${GOLD_RGB},.5)`;
    ctx.lineWidth = big ? 4 : 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - Math.cos(ang) * (big ? 52 : 36), p.y - Math.sin(ang) * (big ? 52 : 36));
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    page(ctx, p.x, p.y, big ? 20 : 14, big ? 26 : 18, ang + Math.PI / 2 + Math.sin(p.age * 14) * .25, 1);
  }
  ctx.restore();
  return true;
}

/* ---- effects ---- */

export function drawShioriFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('shiori-')) return false;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    case 'shiori-weak-aura': weakAura(ctx, e, liteFx); break;
    case 'shiori-swing': swing(ctx, e, el, dir, liteFx); break;
    case 'shiori-guard': guard(ctx, e, el, dir, liteFx); break;
    // 悬浮: she settles out of a jump in light — one soft ring opening on the floor, no dust.
    case 'shiori-hover-land': {
      const k = ease(el / e.max);
      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.translate(e.x, e.y - 6);
      ctx.scale(1, .2);
      ctx.globalAlpha = (1 - k) * .5;
      glow(ctx, 0, 0, 40 + 20 * k, GOLD_RGB);
      ctx.restore();
      ctx.globalAlpha = (1 - k) * .6;
      ctx.strokeStyle = CREAM;
      ctx.lineWidth = .6 + 2 * (1 - k);
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 6, 14 + 42 * k, (14 + 42 * k) * .2, 0, 0, TAU); ctx.stroke();
      break;
    }
    case 'shiori-cast-glow': {
      // U's raised hand: a small gold point that swells while the sigil reads.
      const k = Math.min(1, el / Math.max(.05, e.max));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = .35 + .4 * k;
      glow(ctx, e.x, e.y, 14 + 18 * k, GOLD_RGB);
      ctx.fillStyle = '#fffaf0';
      ctx.globalAlpha = .9;
      sparkle(ctx, e.x, e.y, 5 + 6 * k);
      break;
    }
    case 'shiori-sigil': {
      // The 审视 sigil on the floor: the flower in perspective, turning and brightening as it reads, one faint ellipse
      // for its reach, a column of warm light rising off it.
      const R = e.radius ?? 74;
      const read = Math.min(1, el / Math.max(.05, e.max - .12));
      const fade = Math.min(1, el / .08, e.life / .12);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * (.25 + .35 * read);
      glow(ctx, e.x, e.y - 4, R * 1.25, GOLD_RGB);
      ctx.save();
      ctx.translate(e.x, e.y - 2);
      ctx.scale(1, .3);
      ctx.globalAlpha = fade * (.3 + .3 * read);
      glow(ctx, 0, 0, R * .9, WARM_RGB);
      ctx.restore();
      ctx.globalAlpha = fade * (.5 + .45 * read);
      ctx.fillStyle = `rgb(${GOLD_RGB})`;
      flower(ctx, e.x, e.y - 2, R * (.7 + .3 * ease(read)), el * 1.6 * dir, 8, .3, .16);
      ctx.strokeStyle = `rgba(${GOLD_RGB},${(fade * .5).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y - 2, R, R * .3, 0, 0, TAU);
      ctx.stroke();
      // Motes lifting off the sigil, more as it closes.
      for (let i = 0, n = count(6, liteFx); i < n; i++) {
        const k = cycle(el, 1.6, i, 171);
        ctx.globalAlpha = fade * Math.sin(k * Math.PI) * (.4 + .5 * read);
        ctx.fillStyle = MOTES[i % MOTES.length];
        dot(ctx, e.x + (hash(i, 172) - .5) * R * 1.6, e.y - 6 - k * 120, 2);
      }
      break;
    }
    case 'shiori-seal-slam': {
      // The seal closes: a short shaft of light down onto the sigil, a white bloom, motes thrown up. Breaking the rule
      // (n 1) makes it a size bigger.
      const R = (e.radius ?? 74) * (e.n ? 1.2 : 1);
      const k = ease(Math.min(1, el / .16));
      const fade = 1 - ease(Math.max(0, (el - .1) / Math.max(.05, e.max - .1)));
      ctx.globalCompositeOperation = 'lighter';
      beam(ctx, e.x, e.y - 360, R * .7, fade * .7);
      ctx.globalAlpha = fade * .8;
      glow(ctx, e.x, e.y - 30, R * (.6 + .6 * k), WHITE_RGB);
      ctx.save();
      ctx.translate(e.x, e.y - 2);
      ctx.scale(1, .3);
      ctx.globalAlpha = fade * .7;
      glow(ctx, 0, 0, R * (1 + .4 * k), GOLD_RGB);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      burst(el, 173, { n: count(e.hit ? 16 : 8, liteFx), speed: [90, 260], life: .5, gravity: 160, angle: -Math.PI / 2, spread: Math.PI * .9 }, (x, y, q, i) => {
        ctx.globalAlpha = (1 - q) * .9;
        ctx.fillStyle = MOTES[i % MOTES.length];
        if (i % 4 === 0) sparkle(ctx, x, y, 6 * (1 - q * .5));
        else dot(ctx, x, y, 2.2);
      }, e.x, e.y - 20);
      break;
    }
    case 'shiori-bind': {
      // Two gold seal bands cross over the body and tighten, then let go into motes.
      const h = e.radius ?? 181;
      const k = ease(Math.min(1, el / .18));
      const fade = Math.min(1, e.life / .25);
      const cy = e.y - h * .52;
      ctx.globalCompositeOperation = 'lighter';
      for (let s = -1; s <= 1; s += 2) {
        ctx.save();
        ctx.translate(e.x, cy);
        ctx.rotate(s * .5);
        ctx.scale(1, .32);
        const w = (70 - 22 * k) * (e.n ? 1.1 : 1);
        ctx.strokeStyle = `rgba(${GOLD_RGB},${(fade * .8).toFixed(3)})`;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.ellipse(0, 0, w, w, 0, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = `rgba(${WHITE_RGB},${(fade * .7).toFixed(3)})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = fade * .6;
      ctx.fillStyle = GOLD;
      flower(ctx, e.x, cy, 16 * k, el * 2);
      break;
    }
    case 'shiori-pages': {
      // 恕难从命: seven pages in an arc in front of her, fluttering, a warm glow behind them. They fan out from the book
      // and settle back at the end.
      const h = e.radius ?? 181;
      const open = ease(Math.min(1, el / .16));
      const fade = Math.min(1, e.life / .18);
      const cx = e.x + dir * 54, cy = e.y - h * .55;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * .32;
      glow(ctx, cx, cy, h * .42, WARM_RGB);
      ctx.globalCompositeOperation = 'source-over';
      const n = count(7, liteFx);
      for (let i = 0; i < n; i++) {
        const u = n > 1 ? i / (n - 1) - .5 : 0;
        const a = u * 2.1 * open;
        const r = 46 + 10 * open;
        const x = cx - dir * 30 + dir * Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 1.35;
        const flutter = Math.sin(el * 9 + i * 1.7) * .12;
        page(ctx, x, y, 18, 26, dir * (a * .6) + flutter, fade * (.55 + .3 * open));
      }
      break;
    }
    case 'shiori-refuse-flash': {
      // The refusal: the pages flash white and a soft wall of light pushes out.
      const h = e.radius ?? 181;
      const k = ease(Math.min(1, el / .12));
      const fade = 1 - ease(Math.max(0, (el - .08) / .37));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * .75;
      glow(ctx, e.x, e.y, 40 + 50 * k, WHITE_RGB);
      ctx.save();
      ctx.translate(e.x + dir * 20 * k, e.y);
      ctx.scale(.35, 1);
      ctx.globalAlpha = fade * .6;
      glow(ctx, 0, 0, h * .5, GOLD_RGB);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      burst(el, 181, { n: count(6, liteFx), speed: [120, 260], life: .45, drag: .1, angle: dir > 0 ? 0 : Math.PI, spread: 1.6 }, (x, y, q, i) => {
        page(ctx, x, y, 10, 14, q * 6 + i, (1 - q) * .85);
      }, e.x, e.y);
      break;
    }
    case 'shiori-refuse-push': {
      const k = ease(Math.min(1, el / .2));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - k) * .7;
      glow(ctx, e.x, e.y, 30 + 40 * k, WARM_RGB);
      ctx.fillStyle = '#fffaf0';
      ctx.globalAlpha = (1 - k);
      sparkle(ctx, e.x, e.y, 10 + 10 * k);
      break;
    }
    case 'shiori-pray': {
      // 三重祷言: light gathering into her joined hands, more with every stage; from the second stage the halo opens
      // behind her head; at the third a faint book shows above her. n is the stage (0..2), t0 how long she has prayed.
      const h = e.radius ?? 181;
      const stage = e.n ?? 0;
      const held = e.t0 ?? 0;
      const fade = Math.min(1, e.life / .1);
      const hx = e.x + dir * 22, hy = e.y - h * .6;
      const pulse = 1 + Math.sin(held * 10) * .06;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * (.35 + .15 * stage);
      glow(ctx, hx, hy, (22 + 12 * stage) * pulse, GOLD_RGB);
      // Motes drawn in towards the hands.
      for (let i = 0, n = count(6 + stage * 3, liteFx); i < n; i++) {
        const k = cycle(held, 1.4 + stage * .3, i, 191);
        const a = hash(i, 192) * TAU;
        const r = (1 - k) * (60 + 20 * stage);
        ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .85;
        ctx.fillStyle = MOTES[i % MOTES.length];
        dot(ctx, hx + Math.cos(a) * r, hy + Math.sin(a) * r * .8, 1.8 + stage * .3);
      }
      if (stage >= 1) {
        const hy2 = e.y - h * .86;
        ctx.globalAlpha = fade * (stage >= 2 ? .45 : .28);
        glow(ctx, e.x - dir * 6, hy2, h * (stage >= 2 ? .42 : .32), WARM_RGB);
        ctx.globalAlpha = fade * (stage >= 2 ? .4 : .25);
        ctx.fillStyle = `rgb(${GOLD_RGB})`;
        flower(ctx, e.x - dir * 6, hy2, h * (stage >= 2 ? .34 : .26), held * .5, 8, 1, .12);
      }
      if (stage >= 2) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = fade * .35;
        tome(ctx, e.x + dir * 30, e.y - h * 1.25 + Math.sin(held * 3) * 4, 64, -.08 * dir);
      }
      break;
    }
    case 'shiori-pray-up': {
      // A stage reached: one soft bloom and a ring of glints.
      const k = ease(Math.min(1, el / .3));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - k) * .7;
      glow(ctx, e.x, e.y, 30 + 40 * k, WHITE_RGB);
      ctx.fillStyle = '#fffaf0';
      for (let i = 0, n = count(6, liteFx); i < n; i++) {
        const a = i * TAU / n + (e.n ?? 0);
        ctx.globalAlpha = (1 - k) * .9;
        sparkle(ctx, e.x + Math.cos(a) * (20 + 50 * k), e.y + Math.sin(a) * (14 + 34 * k), 5 * (1 - k * .5));
      }
      break;
    }
    case 'shiori-tome': {
      // 巨典: the book falls out of a column of light onto its mark, its shadow growing under it; it lands with a
      // bloom, a gust of dust and pages flying off, then fades where it fell.
      const R = e.radius ?? 96;
      const fall = e.t0 ?? .32;
      const W = 170;
      if (el < fall) {
        const k = el / fall;
        const rest = FLOOR - W * TOME_H / TOME_W * .5 + 6;
        const y = rest - 490 * (1 - k * k);
        ctx.globalCompositeOperation = 'lighter';
        beam(ctx, e.x, y - 260, R * .55, .35 + .25 * k);
        ctx.save();
        ctx.translate(e.x, FLOOR - 2);
        ctx.scale(1, .28);
        ctx.globalAlpha = .25 + .5 * k;
        glow(ctx, 0, 0, R * (.5 + .6 * k), GOLD_RGB);
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = .3 + .3 * k;
        ctx.fillStyle = '#2a1a14';
        ctx.beginPath(); ctx.ellipse(e.x, FLOOR - 2, R * (.3 + .5 * k), R * .12 * (.3 + .7 * k), 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        // It tips a little as it falls and squares up just before it lands.
        tome(ctx, e.x, y, W, .14 * (1 - k));
      } else {
        const u = el - fall;
        const k = ease(Math.min(1, u / .2));
        const fade = Math.min(1, e.life / .35);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - k) * .8;
        glow(ctx, e.x, FLOOR - 40, R * (.8 + .7 * k), WHITE_RGB);
        ctx.save();
        ctx.translate(e.x, FLOOR - 2);
        ctx.scale(1, .26);
        ctx.strokeStyle = `rgba(${GOLD_RGB},${((1 - k) * .7).toFixed(3)})`;
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(0, 0, R * (.6 + 1.1 * k), 0, TAU); ctx.stroke();
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = fade;
        // A small bounce on impact, then it settles on the floor.
        const bounce = Math.sin(Math.min(1, u / .22) * Math.PI) * 10;
        tome(ctx, e.x, FLOOR - W * TOME_H / TOME_W * .5 + 6 - bounce, W, 0);
        burst(u, 201, { n: count(10, liteFx), speed: [140, 340], life: .7, gravity: 260, drag: .2, angle: -Math.PI / 2, spread: Math.PI * 1.1 }, (x, y, q, i) => {
          if (i % 2) page(ctx, x, y, 11, 15, q * 8 + i, (1 - q) * .9);
          else { ctx.globalAlpha = (1 - q) * .55; ctx.fillStyle = '#d8c4a8'; dot(ctx, x, y + 20, 3 + 3 * q); }
        }, e.x, FLOOR - 40);
      }
      break;
    }
    case 'shiori-charter': {
      // 圣典裁决, behind her: the halo of her flower opening behind her head, the charter raised open over her hands,
      // warm light falling from it, motes drifting up. It closes and fades at the end.
      const h = e.radius ?? 181;
      const S = SHIORI_CHARTER;
      const open = ease(Math.min(1, el / S.raise));
      const shut = ease(Math.max(0, (el - S.close) / .3));
      const fade = Math.min(1, e.life / .3);
      const hx = e.x - dir * 4, hy = e.y - h * .86;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * .45 * open;
      glow(ctx, hx, hy, h * .7, WARM_RGB);
      ctx.globalAlpha = fade * .3 * open;
      ctx.fillStyle = `rgb(${GOLD_RGB})`;
      flower(ctx, hx, hy, h * .55 * open, el * .3, 8, 1, .1);
      ctx.globalAlpha = fade * .5 * open;
      ctx.fillStyle = `rgb(${WHITE_RGB})`;
      flower(ctx, hx, hy, h * .3 * open, -el * .45, 8, 1, .12);
      // The charter: an open book over her raised hands, light spilling down from its pages.
      const bx = e.x + dir * 10, by = e.y - h * 1.12 - 8 * open;
      const spread = (1 - shut) * open;
      beam(ctx, bx, by, 60, fade * .22 * spread);
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.translate(bx, by);
      ctx.globalAlpha = fade * open;
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.scale(s, 1);
        ctx.fillStyle = '#8a4430';
        ctx.beginPath();
        ctx.moveTo(0, 4); ctx.lineTo(44 * spread + 4, -6 * spread + 2); ctx.lineTo(44 * spread + 4, 28); ctx.lineTo(0, 34);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = CREAM;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.quadraticCurveTo(20 * spread, -10 * spread, 42 * spread, -8 * spread);
        ctx.lineTo(42 * spread, 26); ctx.quadraticCurveTo(20 * spread, 22, 0, 30);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0, n = count(8, liteFx); i < n; i++) {
        const k = cycle(el, .7, i, 211);
        ctx.globalAlpha = fade * open * Math.sin(k * Math.PI) * .8;
        ctx.fillStyle = MOTES[i % MOTES.length];
        if (i % 3 === 0) sparkle(ctx, e.x + (hash(i, 212) - .5) * 150, e.y - k * h * 1.3, 4);
        else dot(ctx, e.x + (hash(i, 213) - .5) * 150, e.y - k * h * 1.3, 1.8);
      }
      break;
    }
    case 'shiori-acolyte': {
      // One acolyte: shows up out of a soft light at `x`, crosses `radius` px through the foe with three afterimages,
      // then fades out where she stops.
      const appear = e.t0 ?? .22;
      const cross = SHIORI_CHARTER.cross;
      const travel = e.radius ?? 0;
      const face = travel >= 0 ? 1 : -1;
      const im = image(images, SHIORI_COMMON);
      if (el < appear) {
        const k = el / appear;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k * .5;
        glow(ctx, e.x, FLOOR - 90, 60 * k + 10, WARM_RGB);
        ctx.globalCompositeOperation = 'source-over';
        acolyte(ctx, im, e.x, face, ease(k) * .85);
      } else {
        const u = Math.min(1, (el - appear) / cross);
        const x = e.x + travel * ease(u);
        if (u < 1) {
          for (let g = 3; g >= 1; g--) acolyte(ctx, im, e.x + travel * ease(Math.max(0, u - g * .18)), face, .22 / g);
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(${GOLD_RGB},.45)`;
          ctx.lineWidth = 3;
          for (let i = 0; i < 3; i++) {
            const y = FLOOR - 50 - i * 40;
            ctx.beginPath(); ctx.moveTo(x - travel * .35, y); ctx.lineTo(x, y); ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        const out = Math.min(1, e.life / .3);
        acolyte(ctx, im, x, face, .85 * out);
      }
      break;
    }
    case 'shiori-acolyte-hit': {
      const k = ease(Math.min(1, el / .2));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - k) * .8;
      glow(ctx, e.x, e.y, 26 + 34 * k, WHITE_RGB);
      ctx.fillStyle = `rgb(${GOLD_RGB})`;
      ctx.globalAlpha = (1 - k) * .8;
      flower(ctx, e.x, e.y, 18 + 26 * k, (e.n ?? 0) * .4 + k, 8, 1, .14);
      break;
    }
    case 'shiori-gather': {
      // The four acolytes' light rises off the foe and gathers into one point above them.
      const h = e.radius ?? 181;
      const k = ease(Math.min(1, el / Math.max(.05, e.max - .1)));
      const top = e.y - h - 140;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const a = i * TAU / 4 + el * 3;
        const r = (1 - k) * 110;
        const x = e.x + Math.cos(a) * r, y = top + (1 - k) * (h * .6) + Math.sin(a) * r * .3;
        ctx.globalAlpha = .7;
        glow(ctx, x, y, 16, GOLD_RGB);
        ctx.fillStyle = '#fffaf0';
        sparkle(ctx, x, y, 7);
      }
      ctx.globalAlpha = .3 + .5 * k;
      glow(ctx, e.x, top, 20 + 30 * k, WHITE_RGB);
      break;
    }
    case 'shiori-verdict': {
      // The verdict, behind the body: a soft beam from far above, narrow at the top and widening to the floor, a pool
      // of light where it lands and motes rising in it. It thins in during the aim, flares at the strike, then fades.
      const R = e.radius ?? 150;
      const strike = e.t0 ?? .3;
      const pre = Math.min(1, el / strike);
      const post = el >= strike ? el - strike : -1;
      const flare = post >= 0 ? 1 - ease(Math.min(1, post / .5)) : 0;
      const fade = Math.min(1, e.life / .5);
      const foot = R * (.35 + .4 * pre + .25 * flare);
      ctx.globalCompositeOperation = 'lighter';
      beam(ctx, e.x, -480, foot, fade * (.35 + .35 * pre + .3 * flare));
      ctx.save();
      ctx.translate(e.x, FLOOR - 2);
      ctx.scale(1, .26);
      ctx.globalAlpha = fade * (.4 + .3 * pre + .3 * flare);
      glow(ctx, 0, 0, R * (1 + .5 * flare), GOLD_RGB);
      ctx.restore();
      for (let i = 0, n = count(10, liteFx); i < n; i++) {
        const k = cycle(el, .8, i, 221);
        ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .8;
        ctx.fillStyle = MOTES[i % MOTES.length];
        dot(ctx, e.x + (hash(i, 222) - .5) * foot * 1.2, FLOOR - k * 320, 2);
      }
      if (post >= 0) {
        ctx.globalCompositeOperation = 'source-over';
        burst(post, 223, { n: count(20, liteFx), speed: [160, 420], life: .8, gravity: 120, drag: .15, angle: -Math.PI / 2, spread: Math.PI * 1.2 }, (x, y, q, i) => {
          ctx.globalAlpha = (1 - q) * .9;
          ctx.fillStyle = MOTES[i % MOTES.length];
          if (i % 4 === 0) sparkle(ctx, x, y, 8 * (1 - q * .5));
          else if (i % 4 === 1) page(ctx, x, y, 10, 14, q * 7 + i, 1 - q);
          else dot(ctx, x, y, 2.4);
        }, e.x, FLOOR - 60);
      }
      break;
    }
    case 'shiori-verdict-front': {
      // The same light again, faint, over the body: they stand in it, not behind it.
      const R = e.radius ?? 150;
      const strike = e.t0 ?? .3;
      const pre = Math.min(1, el / strike);
      const flare = el >= strike ? 1 - ease(Math.min(1, (el - strike) / .5)) : 0;
      const fade = Math.min(1, e.life / .5);
      ctx.globalCompositeOperation = 'lighter';
      beam(ctx, e.x, -480, R * (.3 + .3 * pre), fade * (.1 + .08 * pre + .25 * flare));
      if (flare > 0) {
        ctx.globalAlpha = flare * .6;
        glow(ctx, e.x, FLOOR - 95, 90 + 60 * (1 - flare), WHITE_RGB);
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
