import type { Effect } from '../game/game.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { SUBARU_FILM } from './clips.ts';
import { TAU, confetti, dot, glow, hash, petal, sparkle, streak } from './fxParticles.ts';

/* 安和昴 — 笑面缠斗型. One green (#76BD53) and three looks:
   - green impact stars: small, hard four-point stars with a white core on every stamp, elbow, chop and lock;
   - the business smile (I only): little sparkles and blossoms round her head, sunny, while the blow lands below;
   - 脸色发青: the one she got turns pale — a blue wash down from the hairline, a few blue lines and a cold drop.
   L alone has the old film (her grandmother's 《すばる。》: sepia, letterbox, grain and scratches over everything) that
   the colour burns away from her feet, the torn script, and the seven stars of 昴 (the Pleiades).
   Nothing written on screen. */

/** In front of every body, in screen space: the old film is laid over the whole picture. */
export const SUBARU_SCREEN_FRONT: readonly string[] = ['subaru-film'];
/** Behind the bodies. */
export const SUBARU_BACK: readonly string[] = ['subaru-flood'];

const GREEN_RGB = '118,189,83';
const LEAF_RGB = '201,240,168';
const WHITE_RGB = '250,255,244';
const PALE_RGB = '70,112,220';
const GREEN = '#76BD53';
const LEAF = '#dff7c9';
const PAPER = '#f4efe2';
const BLOSSOM = '#ffd1e3';

const count = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  return g ? [c, g] : null;
}

/* ---- baked textures: drawn once, then only stamped (no per-frame gradients, paths or allocations) ---- */

const STAR_PX = 64;
/** Unit star outline: long arms on x, short on y. Shared by the bake and the fallback path. */
const STAR_PTS: readonly number[] = [1, 0, .2, .2, 0, .62, -.2, .2, -1, 0, -.2, -.2, 0, -.62, .2, -.2];
const STAR_LAYERS: readonly [number, string][] = [[1, GREEN], [.55, '#ffffff']];
let starTex: HTMLCanvasElement | null | undefined;
function starStamp(): HTMLCanvasElement | null {
  if (starTex !== undefined) return starTex;
  const made = canvas(STAR_PX, STAR_PX);
  if (!made) return starTex = null;
  const [c, g] = made;
  const m = STAR_PX / 2;
  for (const [k, col] of STAR_LAYERS) {
    const R = (m - 1) * k;
    g.fillStyle = col;
    g.beginPath();
    for (let i = 0; i < STAR_PTS.length; i += 2) {
      const X = m + STAR_PTS[i] * R, Y = m + STAR_PTS[i + 1] * R;
      if (i) g.lineTo(X, Y); else g.moveTo(X, Y);
    }
    g.closePath();
    g.fill();
  }
  return starTex = c;
}

let paleTex: HTMLCanvasElement | null | undefined;
/** 脸色发青: a soft oval of blue, strong at the top and gone by the bottom. Stamped stretched over the face. */
function paleStamp(): HTMLCanvasElement | null {
  if (paleTex !== undefined) return paleTex;
  const made = canvas(64, 64);
  if (!made) return paleTex = null;
  const [c, g] = made;
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, `rgba(${PALE_RGB},.75)`);
  gr.addColorStop(.6, `rgba(${PALE_RGB},.35)`);
  gr.addColorStop(1, `rgba(${PALE_RGB},0)`);
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(32, 32, 32, 32, 0, 0, TAU);
  g.fill();
  return paleTex = c;
}

const VIG_W = 256, VIG_H = 144;
let vignetteTex: HTMLCanvasElement | null | undefined;
/** The old film's dark edges, baked small and stretched over the screen. */
function vignetteStamp(): HTMLCanvasElement | null {
  if (vignetteTex !== undefined) return vignetteTex;
  const made = canvas(VIG_W, VIG_H);
  if (!made) return vignetteTex = null;
  const [c, g] = made;
  const v = g.createRadialGradient(VIG_W / 2, VIG_H / 2, VIG_H * .35, VIG_W / 2, VIG_H / 2, VIG_W * .7);
  v.addColorStop(0, 'rgba(30,18,6,0)');
  v.addColorStop(1, 'rgba(30,18,6,.55)');
  g.fillStyle = v;
  g.fillRect(0, 0, VIG_W, VIG_H);
  return vignetteTex = c;
}

const GRAIN_W = 320, GRAIN_H = 180, GRAIN_FRAMES = 4;
let grainTex: (HTMLCanvasElement | null)[] | undefined;
/** Four frames of film grain at low resolution (one drawImage per frame instead of dozens of dots). */
function grainStamp(frame: number): HTMLCanvasElement | null {
  if (!grainTex) {
    grainTex = [];
    for (let f = 0; f < GRAIN_FRAMES; f++) {
      const made = canvas(GRAIN_W, GRAIN_H);
      if (!made) { grainTex.push(null); continue; }
      const [c, g] = made;
      g.fillStyle = '#fff6e0';
      for (let i = 0; i < 90; i++) {
        g.globalAlpha = .2 + hash(i + f * 97, 22) * .35;
        const r = .5 + hash(i + f * 97, 25) * .7;
        g.fillRect(hash(i + f * 97, 23) * GRAIN_W, hash(i + f * 97, 24) * GRAIN_H, r, r);
      }
      grainTex.push(c);
    }
  }
  return grainTex[frame % GRAIN_FRAMES];
}

/** A hard four-point impact star: green body, white core. Long arms along `rot`, short across. */
function impact(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, alpha: number): void {
  if (!(r > 0) || !(alpha > .01)) return;
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * alpha;
  const tex = starStamp();
  const cs = Math.cos(rot), sn = Math.sin(rot);
  if (tex) {
    // One rotated stamp: the green star and its white core were baked together.
    const d = r * STAR_PX / (STAR_PX / 2 - 1);
    ctx.save();
    ctx.transform(cs, sn, -sn, cs, x, y);
    ctx.drawImage(tex, -d / 2, -d / 2, d, d);
    ctx.restore();
  } else {
    for (const [k, col] of STAR_LAYERS) {
      const R = r * k;
      ctx.fillStyle = col;
      ctx.beginPath();
      for (let i = 0; i < STAR_PTS.length; i += 2) {
        const px = STAR_PTS[i] * R, py = STAR_PTS[i + 1] * R;
        const X = x + px * cs - py * sn, Y = y + px * sn + py * cs;
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = a0;
}
/** A few short hard lines thrown out of a hit, in the current strokeStyle. */
function spokes(ctx: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, n: number, seed: number, width: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hash(i, seed) * .6;
    streak(ctx, x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, width);
  }
}
/** The seven sisters, Alcyone at the origin; unit ≈ one cluster radius. */
const PLEIADES: readonly [number, number, number][] = [
  [0, 0, 1], [.95, .12, .8], [1.05, -.14, .55], [-.98, .3, .85], [-.5, .56, .7], [-.6, -.36, .75], [-.78, -.74, .6],
];

/* ---- U 别想走 ---- */

/** The crane stance: a green glint at the raised hand and a short gathering of lines toward her. */
function drawCrane(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const dir = e.dir ?? 1, h = e.radius ?? 181;
  const k = ease(el / .12) * Math.min(1, e.life / .08);
  const hx = e.x + dir * 10, hy = e.y - h * .98;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = k * .5;
  glow(ctx, hx, hy, 26, GREEN_RGB);
  ctx.globalCompositeOperation = 'source-over';
  impact(ctx, hx, hy, 9 + 5 * Math.sin(el * 30), el * 2, k);
  // Lines drawn in toward her front, the pounce about to go.
  ctx.strokeStyle = `rgba(${LEAF_RGB},1)`;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const u = (el * 4 + hash(i, 1)) % 1;
    const y = e.y - h * (.25 + hash(i, 2) * .55);
    const x0 = e.x + dir * (120 - u * 70), x1 = x0 - dir * 26;
    ctx.globalAlpha = k * .5 * Math.sin(u * Math.PI);
    streak(ctx, x0, y, x1, y, 2);
  }
}
/** The pounce leaving: a green smear behind her, longer when she goes after someone walking out. */
function drawPounce(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const dir = e.dir ?? 1, h = e.radius ?? 181;
  const k = Math.min(1, e.life / .25);
  const len = (e.n ? 150 : 110) * ease(el / .15);
  ctx.strokeStyle = `rgba(${GREEN_RGB},1)`;
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const y = e.y - h * (.2 + i * .15);
    ctx.globalAlpha = k * (.25 + hash(i, 3) * .3);
    streak(ctx, e.x - dir * 10, y, e.x - dir * (10 + len * (.6 + hash(i, 4) * .4)), y, 3 - i * .3);
  }
  ctx.fillStyle = `rgba(${LEAF_RGB},1)`;
  for (let i = 0; i < 6; i++) {
    const u = ease(el / .4);
    ctx.globalAlpha = k * .5;
    dot(ctx, e.x - dir * (20 + hash(i, 5) * 60) * u, FLOOR - 4 - hash(i, 6) * 16 * u, 2 + hash(i, 7) * 2);
  }
}
/** The arm lock: a crisp white-green star where the hands close, a ring snapping in. */
function drawLock(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const k = Math.min(1, e.life / .2);
  const u = ease(el / .18);
  impact(ctx, e.x, e.y, 22 * (1.2 - u * .4), .3, k);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = k * (1 - u) * .8;
  ctx.beginPath();
  ctx.arc(e.x, e.y, Math.max(0, 34 - u * 22), 0, TAU);
  ctx.stroke();
}
function drawSprawl(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const k = Math.min(1, e.life / .3);
  const u = ease(el / .45);
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    ctx.globalAlpha = k * .35;
    glow(ctx, e.x + side * (10 + u * (30 + hash(i, 8) * 40)), e.y - 6 - u * hash(i, 9) * 14, 10 + u * 10, '232,226,214');
  }
}
/** The throw: one big star where they hit the floor, a wide ring and hard spokes. */
function drawThrow(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const k = Math.min(1, e.life / .3);
  const u = ease(el / .3);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = k * .4;
  glow(ctx, e.x, e.y, 70, GREEN_RGB);
  ctx.globalCompositeOperation = 'source-over';
  impact(ctx, e.x, e.y, 40 * (1.1 - u * .3), (e.dir ?? 1) * .5, k);
  ctx.strokeStyle = `rgba(${WHITE_RGB},1)`;
  ctx.lineCap = 'round';
  ctx.globalAlpha = k * .85;
  spokes(ctx, e.x, e.y, 30 + u * 20, 50 + u * 50, 8, 10, 3);
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 3;
  ctx.globalAlpha = k * (1 - u);
  ctx.beginPath();
  ctx.arc(e.x, e.y, 20 + u * 70, 0, TAU);
  ctx.stroke();
}

/* ---- I 笑容满面 ---- */

/** The business smile: sparkles and little blossoms round her head, bright and harmless-looking. */
function drawBeam(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const k = ease(el / .1) * Math.min(1, e.life / .2);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = k * .35;
  glow(ctx, e.x, e.y, 46, '255,246,214');
  ctx.globalCompositeOperation = 'source-over';
  const n = count(7, lite);
  for (let i = 0; i < n; i++) {
    const a = hash(i, 11) * TAU + el * (1 + hash(i, 12));
    const r = 34 + hash(i, 13) * 20 + Math.sin(el * 5 + i) * 3;
    const x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r * .7;
    const tw = .5 + .5 * Math.sin(el * 14 + i * 2);
    ctx.globalAlpha = k * (.55 + tw * .45);
    if (i % 3 === 0) petal(ctx, x, y, 6, a + el * 3, BLOSSOM);
    else {
      ctx.fillStyle = i % 3 === 1 ? '#fffbe6' : LEAF;
      sparkle(ctx, x, y, 4 + tw * 4);
    }
  }
}
/** The stamp under the table: a short sharp star at ankle height and a flat dust ring. */
function drawStomp(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const k = Math.min(1, e.life / .2);
  const u = ease(el / .2);
  impact(ctx, e.x, e.y - 12, 20 * (1.15 - u * .35), 0, k);
  ctx.save();
  ctx.translate(e.x, e.y - 2);
  ctx.scale(1, .22);
  ctx.strokeStyle = `rgba(${LEAF_RGB},1)`;
  ctx.lineWidth = 6;
  ctx.globalAlpha = k * (1 - u) * .8;
  ctx.beginPath();
  ctx.arc(0, 0, 12 + u * 52, 0, TAU);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.globalAlpha = k * .8;
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i - 1.5) * .45;
    streak(ctx, e.x + Math.cos(a) * 14, e.y - 12 + Math.sin(a) * 14, e.x + Math.cos(a) * (24 + u * 16), e.y - 12 + Math.sin(a) * (24 + u * 16), 2.5);
  }
}
/** 脸色发青: blue washes down from the hairline over the face, a few vertical blue lines, one cold drop. */
function drawPale(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const h = e.radius ?? 181, dir = e.dir ?? 1;
  const k = ease(el / .15) * Math.min(1, e.life / .2);
  const top = e.y - h * .97, face = h * .17;
  const cx = e.x + dir * h * .02;
  const tex = paleStamp();
  if (tex) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = k;
    ctx.drawImage(tex, cx - h * .1, top - face * .15, h * .2, face * 1.2);
    ctx.globalCompositeOperation = 'source-over';
  }
  // The gloom lines, hanging from the brow.
  ctx.strokeStyle = `rgba(${PALE_RGB},1)`;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const x = cx + dir * (i - 1.5) * h * .035;
    const len = face * (.35 + hash(i, 14) * .3) * ease(el / .25);
    ctx.globalAlpha = k * .7;
    streak(ctx, x, top + face * .1, x, top + face * .1 + len, 1.6);
  }
  // One cold drop sliding down the temple.
  const dy = (el * 22) % (face * .6);
  const sx = cx - dir * h * .09, sy = top + face * .3 + dy;
  ctx.globalAlpha = k * .9;
  ctx.fillStyle = '#bfe2ff';
  ctx.beginPath();
  ctx.moveTo(sx, sy - 7);
  ctx.quadraticCurveTo(sx + 4, sy, sx, sy + 3);
  ctx.quadraticCurveTo(sx - 4, sy, sx, sy - 7);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  dot(ctx, sx - 1, sy - 1, 1.2);
}
/** The elbow: a star and a short burst of spokes; n = 1 is a swing at nobody (just the swish). */
function drawElbow(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const dir = e.dir ?? 1;
  const k = Math.min(1, e.life / .2);
  const u = ease(el / .22);
  if (e.n === 1) {
    ctx.strokeStyle = `rgba(${LEAF_RGB},1)`;
    ctx.lineWidth = 3;
    ctx.globalAlpha = k * .6;
    ctx.beginPath();
    ctx.arc(e.x - dir * 30, e.y, 34, dir > 0 ? -.6 : Math.PI - .2, dir > 0 ? .2 : Math.PI + .6);
    ctx.stroke();
    return;
  }
  impact(ctx, e.x, e.y, 28 * (1.15 - u * .3), dir * .25, k);
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.globalAlpha = k * .85;
  spokes(ctx, e.x, e.y, 22 + u * 10, 36 + u * 30, 6, 15, 2.5);
}

/* ---- O 手刀架挡 ---- */

/** The guard: a faint green X in front of her face, the edge of each hand catching light. */
function drawGuard(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const dir = e.dir ?? 1, h = e.radius ?? 181;
  const k = ease(el / .08) * Math.min(1, e.life / .08);
  const x = e.x + dir * 34, y = e.y - h * .72;
  ctx.strokeStyle = `rgba(${LEAF_RGB},1)`;
  ctx.lineCap = 'round';
  const pulse = .7 + .3 * Math.sin(el * 24);
  for (const s of [-1, 1]) {
    ctx.globalAlpha = k * .55 * pulse;
    streak(ctx, x - 20, y + s * 20, x + 20, y - s * 20, 3);
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = k * .3 * pulse;
  glow(ctx, x, y, 30, GREEN_RGB);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = k * pulse;
  sparkle(ctx, x + Math.cos(el * 9) * 18, y - 18, 4);
}
const CLASH_LAYERS: readonly [number, string, number][] = [[9, GREEN, .7], [3.5, '#ffffff', 1]];
/** Chop meets chop: a white-green cross of light, flaring and closing. */
function drawClash(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const k = Math.min(1, e.life / .25);
  const u = ease(el / .15);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = k * .55;
  glow(ctx, e.x, e.y, 50 + u * 20, GREEN_RGB);
  ctx.globalCompositeOperation = 'source-over';
  const L = 26 + u * 34;
  ctx.lineCap = 'round';
  for (const [w, col, a] of CLASH_LAYERS) {
    ctx.strokeStyle = col;
    ctx.globalAlpha = k * a;
    streak(ctx, e.x - L, e.y - L * .8, e.x + L, e.y + L * .8, w);
    streak(ctx, e.x - L, e.y + L * .8, e.x + L, e.y - L * .8, w);
  }
  impact(ctx, e.x, e.y, 14, 0, k);
}
/** A chop: a short bright arc and a star; n = 1 the last one down on the head; n = 2 a chop at nobody. */
function drawChop(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const dir = e.dir ?? 1;
  const k = Math.min(1, e.life / .18);
  const u = ease(el / .14);
  ctx.lineCap = 'round';
  if (e.n === 1) {
    // Straight down onto the crown.
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = k * .9;
    streak(ctx, e.x, e.y - 60 + u * 40, e.x, e.y - 8, 4);
    impact(ctx, e.x, e.y - 4, 26 * (1.2 - u * .4), Math.PI / 4, k);
    ctx.strokeStyle = `rgba(${LEAF_RGB},1)`;
    ctx.globalAlpha = k * .8;
    spokes(ctx, e.x, e.y - 4, 22, 34 + u * 22, 7, 17, 2.5);
    return;
  }
  ctx.strokeStyle = e.n === 2 ? `rgba(${LEAF_RGB},1)` : '#ffffff';
  ctx.lineWidth = e.n === 2 ? 2.5 : 4;
  ctx.globalAlpha = k * (e.n === 2 ? .5 : .9);
  const a0 = dir > 0 ? -2.2 : -.94, sweep = 1.25 * dir;
  ctx.beginPath();
  ctx.arc(e.x - dir * 24, e.y + 10, 36, Math.min(a0, a0 + sweep * u), Math.max(a0, a0 + sweep * u));
  ctx.stroke();
  if (e.n !== 2) impact(ctx, e.x, e.y, 17 * (1.2 - u * .3), .6 * dir, k);
}

/* ---- L 找到想做的事了 ---- */

/** The old film over everything: sepia, black bars, grain, scratches, a flicker. From `flood` on, a disc of colour
 *  grows out from her feet with a green edge until the whole picture has its colour back. */
function drawFilm(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const S = SUBARU_FILM;
  const inK = ease(el / .3);
  const out = Math.min(1, e.life / .3);
  const film = inK * out;
  if (film <= .01) return;
  const cx = e.x, cy = FLOOR - 90;
  const far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 40;
  const fu = clamp((el - S.flood) / S.flow, 0, 1);
  const hole = fu <= 0 ? 0 : ease(fu) * far;
  const sepia = film * (1 - clamp((el - S.flood - S.flow) / .2, 0, 1));
  if (sepia > .01) {
    ctx.save();
    if (hole > 0) {
      // Everything outside the coloured disc stays old.
      ctx.beginPath();
      ctx.rect(-20, -20, W + 40, H + 40);
      ctx.arc(cx, cy, hole, 0, TAU, true);
      ctx.clip();
    }
    // One full-screen blend: 'color' keeps the picture's lightness and takes the sepia's hue and saturation, so it
    // greys and tints in a single pass (no separate desaturate).
    ctx.globalAlpha = sepia * .9;
    ctx.globalCompositeOperation = 'color';
    ctx.fillStyle = '#a07a4a';
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.globalCompositeOperation = 'source-over';
    // Vignette, baked; the projector's flicker rides on its strength instead of another full-screen fill.
    const frame = Math.floor(el * 24);
    const vig = vignetteStamp();
    if (vig) {
      ctx.globalAlpha = sepia * (1 + .25 * hash(Math.floor(el * 18), 21)) * (lite ? .8 : 1);
      ctx.drawImage(vig, -20, -20, W + 40, H + 40);
    }
    if (!lite) {
      // Grain: one of four baked frames, stretched over the screen.
      const grain = grainStamp(frame);
      if (grain) {
        ctx.globalAlpha = sepia;
        ctx.drawImage(grain, 0, 0, W, H);
      }
      // Scratches: a couple of thin vertical lines that jump between frames, all in one stroke.
      ctx.strokeStyle = '#f6ead0';
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = sepia * .35;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        if (hash(frame, 26 + i) < .45) continue;
        const x = hash(frame, 29 + i) * W;
        ctx.moveTo(x, -10);
        ctx.lineTo(x + (hash(frame, 32 + i) - .5) * 8, H + 10);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  // The green edge of the colour coming back.
  if (hole > 0 && fu < 1) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${GREEN_RGB},1)`;
    ctx.globalAlpha = film * (1 - fu) * .7;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(cx, cy, hole, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${WHITE_RGB},1)`;
    ctx.lineWidth = 3;
    ctx.globalAlpha = film * (1 - fu);
    ctx.beginPath();
    ctx.arc(cx, cy, hole, 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  // Letterbox: the bars hold through the film and slide away once the colour is back.
  const bars = film * (1 - ease((el - S.flood - S.flow) / .35));
  if (bars > .01) {
    const bh = H * .1 * bars;
    const jit = (hash(Math.floor(el * 12), 38) - .5) * 2 * sepia;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0b0805';
    ctx.fillRect(-20, -20 + jit, W + 40, bh + 20);
    ctx.fillRect(-20, H - bh + jit, W + 40, bh + 20);
  }
}
/** The script in her hands before it is torn: a few stacked pages, held up. */
function drawScript(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const dir = e.dir ?? 1;
  const k = ease(el / .15) * Math.min(1, e.life / .05);
  ctx.globalAlpha = k;
  for (let i = 2; i >= 0; i--) {
    ctx.fillStyle = i ? '#ddd5c2' : PAPER;
    confetti(ctx, e.x + dir * i * 2, e.y - i * 2, 12, 16, dir * -.15, 0);
  }
  ctx.strokeStyle = '#9b8d72';
  ctx.globalAlpha = k * .7;
  for (let j = 0; j < 4; j++) streak(ctx, e.x - 7, e.y - 9 + j * 5, e.x + 6, e.y - 9 + j * 5, 1);
}
/** The script torn in two and flung: pages and scraps tumble up and float down. */
function drawTear(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const dir = e.dir ?? 1;
  const k = Math.min(1, e.life / .4);
  const n = count(16, lite);
  for (let i = 0; i < n; i++) {
    const vx = (hash(i, 40) - .3) * 260 * dir, vy = -260 - hash(i, 41) * 240;
    const t = el;
    const x = e.x + vx * t + Math.sin(t * 4 + i) * 12;
    const y = e.y + vy * t + 380 * t * t;
    const big = i < 3;
    ctx.globalAlpha = k * (big ? 1 : .9);
    ctx.fillStyle = i % 4 === 0 ? '#e6dcc4' : PAPER;
    confetti(ctx, x, y, big ? 10 : 4 + hash(i, 42) * 4, big ? 14 : 3 + hash(i, 43) * 4, t * (3 + hash(i, 44) * 6), t * (5 + hash(i, 45) * 8));
  }
}
/** The frame catching them: four white corner brackets snapping in round the body, a shutter flash. */
function drawFrame(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const k = Math.min(1, e.life / .2);
  const u = ease(el / .14);
  const hw = 80 - u * 18, top = e.y - 200 + u * 10, bot = e.y + 6;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.lineCap = 'square';
  ctx.globalAlpha = k;
  const L = 22;
  // All four brackets in one path, one stroke.
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const sx = i % 2 ? -1 : 1, sy = i < 2 ? 1 : -1;
    const x = e.x - sx * hw, y = i < 2 ? top : bot;
    ctx.moveTo(x, y + sy * L);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * L, y);
  }
  ctx.stroke();
  ctx.globalAlpha = k * (1 - ease(el / .12)) * .5;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(e.x - hw, top, hw * 2, bot - top);
}
/** Behind the bodies while the colour floods out: green motes lifting off the floor around her. */
function drawFlood(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const k = ease(el / .2) * Math.min(1, e.life / .3);
  ctx.save();
  ctx.translate(e.x, FLOOR);
  ctx.scale(1, .2);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = k * .35;
  glow(ctx, 0, 0, 120 + ease(el / .4) * 160, GREEN_RGB);
  ctx.restore();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = LEAF;
  for (let i = 0; i < count(14, lite); i++) {
    const u = (el * (.5 + hash(i, 46) * .4) + hash(i, 47)) % 1;
    ctx.globalAlpha = k * Math.sin(u * Math.PI) * .7;
    sparkle(ctx, e.x + (hash(i, 48) - .5) * 320, FLOOR - u * 180, 2 + hash(i, 49) * 3);
  }
  ctx.globalCompositeOperation = 'source-over';
}
/** One beat: a green ring off the strike and a star, alternating high and low like two hands on a kit. */
function drawBeat(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const k = Math.min(1, e.life / .25);
  const u = ease(el / .3);
  const i = e.n ?? 0;
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 4 - u * 2.5;
  ctx.globalAlpha = k * (1 - u);
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, 14 + u * 52, (14 + u * 52) * .8, 0, 0, TAU);
  ctx.stroke();
  impact(ctx, e.x, e.y, (16 + i * 2) * (1.2 - u * .4), (i % 2 ? .6 : -.6) * (e.dir ?? 1), k);
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.globalAlpha = k * .7;
  spokes(ctx, e.x, e.y, 18, 26 + u * 18, 5, 50 + i, 2);
}
/** The seven stars of 昴 lighting one by one over them. */
function drawStars(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const k = Math.min(1, e.life / .2);
  const R = 46;
  const S = SUBARU_FILM;
  const span = S.burst - S.stars;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < PLEIADES.length; i++) {
    const [px, py, m] = PLEIADES[i];
    const on = ease((el - i * span / 7) / .08);
    if (on <= 0) continue;
    const x = e.x + px * R * (e.dir ?? 1), y = e.y + py * R;
    const tw = .85 + .15 * Math.sin(el * 30 + i);
    ctx.globalAlpha = k * on * .45;
    glow(ctx, x, y, 22 * m, GREEN_RGB);
    ctx.globalAlpha = k * on * tw;
    ctx.fillStyle = '#ffffff';
    sparkle(ctx, x, y, (8 + 6 * m) * (1 + (1 - on) * .6));
  }
  ctx.globalCompositeOperation = 'source-over';
}
/** The burst: the seven stars fly apart, a broad green ring, sparkles raining off. */
function drawBurst(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const k = Math.min(1, e.life / .5);
  const u = ease(el / .45);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = k * .5 * (1 - u * .5);
  glow(ctx, e.x, e.y, 90 + u * 60, GREEN_RGB);
  ctx.strokeStyle = `rgba(${LEAF_RGB},1)`;
  ctx.lineWidth = 6 * (1 - u) + 1;
  ctx.globalAlpha = k * (1 - u);
  ctx.beginPath();
  ctx.arc(e.x, e.y, 30 + u * 150, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < PLEIADES.length; i++) {
    const [px, py, m] = PLEIADES[i];
    const a = Math.atan2(py, px || .3);
    const r = 46 * Math.hypot(px, py) + u * (120 + hash(i, 60) * 60);
    ctx.globalAlpha = k;
    sparkle(ctx, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, (10 + 6 * m) * (1 - u * .5));
  }
  ctx.fillStyle = LEAF;
  for (let i = 0; i < count(18, lite); i++) {
    const a = hash(i, 61) * TAU, sp = 80 + hash(i, 62) * 180;
    ctx.globalAlpha = k * (1 - u) * .8;
    sparkle(ctx, e.x + Math.cos(a) * sp * u, e.y + Math.sin(a) * sp * u + el * el * 120, 2 + hash(i, 63) * 3);
  }
  ctx.globalCompositeOperation = 'source-over';
  impact(ctx, e.x, e.y, 44 * (1 - u * .5), .4, k * (1 - u));
}

export function drawSubaruFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false): boolean {
  if (!e.type.startsWith('subaru-')) return false;
  const el = e.max - e.life;
  ctx.save();
  switch (e.type) {
    case 'subaru-crane': drawCrane(ctx, e, el); break;
    case 'subaru-pounce': drawPounce(ctx, e, el); break;
    case 'subaru-lock': drawLock(ctx, e, el); break;
    case 'subaru-sprawl': drawSprawl(ctx, e, el); break;
    case 'subaru-throw': drawThrow(ctx, e, el); break;
    case 'subaru-beam': drawBeam(ctx, e, el, liteFx); break;
    case 'subaru-stomp': drawStomp(ctx, e, el); break;
    case 'subaru-pale': drawPale(ctx, e, el); break;
    case 'subaru-elbow': drawElbow(ctx, e, el); break;
    case 'subaru-guard': drawGuard(ctx, e, el); break;
    case 'subaru-clash': drawClash(ctx, e, el); break;
    case 'subaru-chop': drawChop(ctx, e, el); break;
    case 'subaru-film': drawFilm(ctx, e, el, liteFx); break;
    case 'subaru-script': drawScript(ctx, e, el); break;
    case 'subaru-tear': drawTear(ctx, e, el, liteFx); break;
    case 'subaru-frame': drawFrame(ctx, e, el); break;
    case 'subaru-flood': drawFlood(ctx, e, el, liteFx); break;
    case 'subaru-beat': drawBeat(ctx, e, el); break;
    case 'subaru-stars': drawStars(ctx, e, el); break;
    case 'subaru-burst': drawBurst(ctx, e, el, liteFx); break;
  }
  ctx.restore();
  return true;
}
