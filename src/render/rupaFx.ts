import type { Effect } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import { clamp, FLOOR, H, W } from '../game/constants.ts';
import { RUPA_BASS } from './clips.ts';
import { TAU, cycle, dot, easeOut, glow, hash, sparkle, streak, tri } from './fxParticles.ts';

/* 卢帕 — 稳重反差压制型 (baked offscreen stamps, zero per-frame allocs, shared path/scratch buffers):
   - U 特盛急送: warm golden serving tray glow, rising gyudon broth steam wisps, speed lines, and heal burst.
   - I 芳心快门: golden polaroid viewfinder reticle, shutter flash + angled polaroid snapshot card, and heart doodles for 跟班.
   - O 酒胆无忌: frothy golden beer mug, rising foam bubbles, amber shockwave ring, and warm fizzing bold aura.
   - L 因此才需要摇滚 (noSuperFx: owns the entire stage & hit presentation):
     * rupa-stage: livehouse dark vignette, sweeping volumetric spotlights, floor amp EQ spectrum bars,
       and 4 fretboard-marked bass strings across the arena vibrating on every slap & finale.
     * rupa-bass-aura: high-contrast rotating fret-lotus floor seal with golden-crimson cymatic ribs.
     * rupa-tune: 4-string convergence snap & neck-slide star burst during the opening crouch.
     * rupa-slap / rupa-hit-ripple / rupa-finale: bespoke 3-tier bass-slap ribbons (down-thumb, up-pop, power-rake),
       guitar-pick impact ripples, nodal standing-wave strings, eighth-notes, and Bold-state amber flare. */

export const RUPA_SCREEN_BACK: readonly string[] = ['rupa-stage'];
export const RUPA_BACK: readonly string[] = ['rupa-bass-aura'];

const GOLD = '#EEDA01';
const GOLD_SOFT = '#fff49c';
const GOLD_RGB = '238,218,1';
const AMBER = '#ff9f2e';
const AMBER_RGB = '255,159,46';
const CRIMSON = '#d9283c';
const CRIMSON_RGB = '217,40,60';
const FOAM = '#fff9e6';
const HEART = '#ff72a6';
const MIN_ALPHA = .02;
const STAGE_STRING_YS = [196, 240, 284, 328] as const;
const STAGE_FRET_XS = [135, 290, 460, 650, 825] as const;

const count = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  return g ? [c, g] : null;
}

const STAGE_W = 256, STAGE_H = 144;
let stageTex: HTMLCanvasElement | null | undefined;
function stageStamp(): HTMLCanvasElement | null {
  if (stageTex !== undefined) return stageTex;
  const made = canvas(STAGE_W, STAGE_H);
  if (!made) return stageTex = null;
  const [c, g] = made;
  g.fillStyle = 'rgba(12,6,9,.85)';
  g.fillRect(0, 0, STAGE_W, STAGE_H);
  const v = g.createRadialGradient(STAGE_W * .5, STAGE_H * .56, STAGE_H * .08, STAGE_W * .5, STAGE_H * .5, STAGE_W * .66);
  v.addColorStop(0, 'rgba(52,24,14,.12)');
  v.addColorStop(.55, 'rgba(18,8,11,.58)');
  v.addColorStop(1, 'rgba(4,2,4,.94)');
  g.fillStyle = v;
  g.fillRect(0, 0, STAGE_W, STAGE_H);
  return stageTex = c;
}

const CONE_W = 160, CONE_H = 256;
const coneTex: (HTMLCanvasElement | null | undefined)[] = [];
/** Soft volumetric stage beam cone, baked once per colour (0: citrine gold, 1: cherry crimson, 2: bold amber). */
function coneStamp(idx: 0 | 1 | 2): HTMLCanvasElement | null {
  if (coneTex[idx] !== undefined) return coneTex[idx]!;
  const made = canvas(CONE_W, CONE_H);
  if (!made) return coneTex[idx] = null;
  const [c, g] = made;
  const rgb = idx === 0 ? GOLD_RGB : idx === 1 ? CRIMSON_RGB : AMBER_RGB;
  const vert = g.createLinearGradient(0, 0, 0, CONE_H);
  vert.addColorStop(0, `rgba(${rgb},.48)`);
  vert.addColorStop(.65, `rgba(${rgb},.18)`);
  vert.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = vert;
  for (let k = 0; k < 6; k++) {
    const spread = .36 + k * .11;
    g.globalAlpha = .2;
    g.beginPath();
    g.moveTo(CONE_W * .5 - 10 * spread, 0);
    g.lineTo(CONE_W * .5 + 10 * spread, 0);
    g.lineTo(CONE_W * .5 + CONE_W * .48 * spread, CONE_H);
    g.lineTo(CONE_W * .5 - CONE_W * .48 * spread, CONE_H);
    g.closePath();
    g.fill();
  }
  return coneTex[idx] = c;
}

const NOTE_PX = 48;
const noteTex = new Map<string, HTMLCanvasElement | null>();
/** Baked eighth-note glyph per colour: one drawImage instead of nested save/restore + bezier paths. */
function noteStamp(color: string): HTMLCanvasElement | null {
  let c = noteTex.get(color);
  if (c !== undefined) return c;
  const made = canvas(NOTE_PX, NOTE_PX);
  if (!made) { noteTex.set(color, null); return null; }
  const [cv, g] = made;
  const m = NOTE_PX / 2, sz = 16;
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(m - sz * .25, m + sz * .35, sz * .38, sz * .26, -.35, 0, TAU);
  g.fill();
  g.fillRect(m, m - sz * .7, sz * .16, sz * 1.05);
  g.beginPath();
  g.moveTo(m, m - sz * .7);
  g.quadraticCurveTo(m + sz * .58, m - sz * .55, m + sz * .48, m - sz * .12);
  g.lineTo(m, m - sz * .38);
  g.closePath();
  g.fill();
  noteTex.set(color, cv);
  return cv;
}

/** Pre-allocated scratch buffers for crescentArc so forward & return edges share one trig pass. */
const ARC_CAP = 24;
const ARC_CS = new Float64Array(ARC_CAP + 1);
const ARC_SN = new Float64Array(ARC_CAP + 1);
const ARC_HW = new Float64Array(ARC_CAP + 1);

/** Tapered crescent arc ribbon centered at (cx, cy), sweeping from a0 to a1. Zero allocations. */
function crescentArc(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  rx: number, ry: number,
  a0: number, a1: number,
  thick: number,
  steps = 16,
): void {
  const n = Math.min(ARC_CAP, Math.max(4, steps));
  const da = a1 - a0;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = a0 + da * u;
    const cs = Math.cos(a), sn = Math.sin(a);
    const w = Math.sin(u * Math.PI) * thick * .5;
    ARC_CS[i] = cs; ARC_SN[i] = sn; ARC_HW[i] = w;
    const px = cx + cs * (rx + w);
    const py = cy + sn * (ry + w);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  for (let i = n; i >= 0; i--) {
    const w = ARC_HW[i];
    ctx.lineTo(cx + ARC_CS[i] * Math.max(1, rx - w), cy + ARC_SN[i] * Math.max(1, ry - w));
  }
  ctx.closePath();
  ctx.fill();
}

/** Polar cymatic harmonic wave ring: acoustic standing wave around (cx, cy). */
function cymaticRing(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  rx: number, ry: number,
  lobes: number, amp: number, phase: number,
  steps = 96,
): void {
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * TAU;
    const mod = 1 + amp * Math.cos(lobes * a + phase);
    const px = cx + Math.cos(a) * Math.max(1, rx * mod);
    const py = cy + Math.sin(a) * Math.max(1, ry * mod);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
}

/** Guitar-pick rounded triangle path centered at (x, y) pointing along `rot`. No save/restore overhead. */
function pickPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  const c = Math.cos(rot), s = Math.sin(rot);
  const wx = (lx: number, ly: number) => x + lx * c - ly * s;
  const wy = (lx: number, ly: number) => y + lx * s + ly * c;
  ctx.beginPath();
  ctx.moveTo(wx(r * 1.15, 0), wy(r * 1.15, 0));
  ctx.quadraticCurveTo(wx(r * .2, -r * 1.05), wy(r * .2, -r * 1.05), wx(-r * .85, -r * .65), wy(-r * .85, -r * .65));
  ctx.quadraticCurveTo(wx(-r * 1.1, 0), wy(-r * 1.1, 0), wx(-r * .85, r * .65), wy(-r * .85, r * .65));
  ctx.quadraticCurveTo(wx(r * .2, r * 1.05), wy(r * .2, r * 1.05), wx(r * 1.15, 0), wy(r * 1.15, 0));
  ctx.closePath();
}
function pickGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  pickPath(ctx, x, y, r, rot);
  ctx.fill();
}

/** Small eighth-note stamped from offscreen cache (or vector fallback when headless). */
function noteGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, sz: number, rot: number, color = '#ffffff'): void {
  if (!(sz > 0) || ctx.globalAlpha <= MIN_ALPHA) return;
  const tex = noteStamp(color);
  if (tex) {
    const d = sz * (NOTE_PX / 16);
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(tex, -d / 2, -d / 2, d, d);
    ctx.rotate(-rot);
    ctx.translate(-x, -y);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(-sz * .25, sz * .35, sz * .38, sz * .26, -.35, 0, TAU);
  ctx.fill();
  ctx.fillRect(0, -sz * .7, sz * .16, sz * 1.05);
  ctx.beginPath();
  ctx.moveTo(0, -sz * .7);
  ctx.quadraticCurveTo(sz * .58, -sz * .55, sz * .48, -sz * .12);
  ctx.lineTo(0, -sz * .38);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Trace a vibrating bass string path from (x0, y) to (x1, y); caller strokes once or multiple times. */
function traceVibratedString(
  ctx: CanvasRenderingContext2D,
  x0: number, x1: number, y: number,
  amp: number, phase: number, harmonics: number,
  segs = 20,
): void {
  ctx.beginPath();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const px = x0 + (x1 - x0) * u;
    const env = Math.sin(u * Math.PI);
    const py = y + env * amp * Math.sin(u * Math.PI * harmonics + phase);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
}

/* ---- status marks: 芳心快门 (跟班) & 酒胆无忌 (大胆) ---- */

export function auraRupaFan(ctx: CanvasRenderingContext2D, f: Fighter, bodyH: number, _left: number, t: number, lite: boolean): void {
  if (!(bodyH > 0)) return;
  ctx.save();
  const ang = t * 2.6;
  const px = f.x + Math.cos(ang) * 32;
  const py = f.y - bodyH * .68 + Math.sin(ang * 2) * 5;
  const rot = Math.sin(t * 3) * .16;
  ctx.translate(px, py);
  ctx.rotate(rot);
  ctx.globalAlpha = .92;
  ctx.fillStyle = '#fffdf7';
  ctx.strokeStyle = '#33291e';
  ctx.lineWidth = 1.4;
  ctx.fillRect(-9, -11, 18, 22);
  ctx.strokeRect(-9, -11, 18, 22);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-7, -9, 14, 13);
  ctx.fillStyle = HEART;
  dot(ctx, 0, -2.5, 2.6);
  ctx.rotate(-rot);
  ctx.translate(-px, -py);
  for (let i = 0, m = count(3, lite); i < m; i++) {
    const k = cycle(t, 1.1, i, 2);
    const hx = f.x + (hash(i, 1) - .5) * 34;
    const hy = f.y - bodyH * .6 - k * 34;
    ctx.globalAlpha = (1 - k) * .85;
    ctx.fillStyle = i % 2 ? HEART : GOLD_SOFT;
    dot(ctx, hx - 2.2, hy, 2.3);
    dot(ctx, hx + 2.2, hy, 2.3);
    tri(ctx, hx, hy + 4.5, 3.2, Math.PI / 2);
  }
  ctx.restore();
}

export function applyRupaFan(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  const k = Math.max(0, 1 - age / .45);
  if (k <= MIN_ALPHA) return;
  const s = easeOut(age / .45);
  ctx.save();
  ctx.translate(e.x, e.y - 110 - s * 18);
  ctx.rotate(-.14 + s * .08);
  ctx.globalAlpha = k * .95;
  ctx.fillStyle = '#fffdf7';
  ctx.strokeStyle = '#2d2318';
  ctx.lineWidth = 2;
  ctx.fillRect(-16, -20, 32, 40);
  ctx.strokeRect(-16, -20, 32, 40);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-12, -16, 24, 24);
  ctx.fillStyle = HEART;
  sparkle(ctx, 0, -4, 7);
  ctx.restore();
}

export function auraRupaBold(ctx: CanvasRenderingContext2D, f: Fighter, bodyH: number, _left: number, t: number, lite: boolean): void {
  if (!(bodyH > 0)) return;
  ctx.save();
  ctx.globalAlpha = .2 + .06 * Math.sin(t * 8);
  glow(ctx, f.x, f.y - bodyH * .48, bodyH * .46, AMBER_RGB);
  for (let i = 0, m = count(8, lite); i < m; i++) {
    const k = cycle(t, 1.35, i, 3);
    const bx = f.x + (hash(i, 4) - .5) * 44 + Math.sin(t * 5 + i) * 3;
    const by = f.y - bodyH * .14 - k * (bodyH * .78);
    ctx.globalAlpha = Math.sin(Math.min(1, k * 1.4) * Math.PI) * .82;
    ctx.fillStyle = i % 3 === 0 ? FOAM : i % 3 === 1 ? GOLD : AMBER;
    dot(ctx, bx, by, 2.2 + hash(i, 5) * 2.4);
  }
  ctx.restore();
}

/* ---- world & screen effects ---- */

export function drawRupaFx(ctx: CanvasRenderingContext2D, e: Effect, lite: boolean): boolean {
  if (!(e.max > 0) || !(e.life > 0)) {
    return e.type.startsWith('rupa-');
  }
  const el = Math.max(0, e.max - e.life);

  if (e.type === 'rupa-tray') {
    const dir = e.dir || 1;
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    const tx = e.x + dir * 24;
    const ty = e.y - (e.radius || 181) * .56;
    ctx.save();
    ctx.globalAlpha = k * .92;
    ctx.fillStyle = '#3b2416';
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(tx, ty + 6, 20, 5.5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d96f24';
    ctx.beginPath();
    ctx.arc(tx, ty + 1, 10, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = FOAM;
    ctx.beginPath();
    ctx.ellipse(tx, ty + 1, 10, 3.2, 0, 0, TAU);
    ctx.fill();
    for (let i = 0, m = count(4, lite); i < m; i++) {
      const w = cycle(el, 1.4, i, 1);
      ctx.globalAlpha = k * (1 - w) * .65;
      ctx.fillStyle = FOAM;
      dot(ctx, tx + (hash(i, 2) - .5) * 14 + Math.sin(el * 6 + i) * 3, ty - 6 - w * 26, 2.4 + w * 2);
    }
    ctx.restore();
    return true;
  }

  if (e.type === 'rupa-dash-wind') {
    const dir = e.dir || 1;
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    const p = easeOut(el / e.max);
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0, m = count(6, lite); i < m; i++) {
      const y = e.y - 24 - i * 20;
      const len = (24 + hash(i, 3) * 36) * (1 - p * .35);
      const sx = e.x - dir * (p * 34 + hash(i, 4) * 18);
      ctx.globalAlpha = k * .8;
      ctx.strokeStyle = i % 2 ? GOLD_SOFT : GOLD;
      streak(ctx, sx, y, sx - dir * len, y, 2.4 - (i % 2) * .7);
    }
    ctx.restore();
    return true;
  }

  if (e.type === 'rupa-serve') {
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    const r = 12 + easeOut(el / e.max) * 42;
    ctx.save();
    if (!lite) {
      ctx.globalAlpha = k * .45;
      glow(ctx, e.x, e.y, r, GOLD_RGB);
    }
    for (let i = 0, m = count(10, lite); i < m; i++) {
      const a = -Math.PI * (.15 + hash(i, 6) * .7);
      const d = (10 + hash(i, 7) * 38) * easeOut(el / e.max);
      ctx.globalAlpha = k * .95;
      ctx.fillStyle = i % 3 === 0 ? '#9cff7a' : i % 3 === 1 ? GOLD : FOAM;
      sparkle(ctx, e.x + Math.cos(a) * d * (i % 2 ? 1 : -1), e.y + Math.sin(a) * d, 4.5 * k + 1.5);
    }
    ctx.restore();
    return true;
  }

  if (e.type === 'rupa-finder') {
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    const s = 18 + Math.sin(el * 14) * 2;
    ctx.save();
    ctx.globalAlpha = k * .92;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2.4;
    const b = 7;
    ctx.beginPath();
    ctx.moveTo(e.x - s, e.y - s + b); ctx.lineTo(e.x - s, e.y - s); ctx.lineTo(e.x - s + b, e.y - s);
    ctx.moveTo(e.x + s - b, e.y - s); ctx.lineTo(e.x + s, e.y - s); ctx.lineTo(e.x + s, e.y - s + b);
    ctx.moveTo(e.x - s, e.y + s - b); ctx.lineTo(e.x - s, e.y + s); ctx.lineTo(e.x - s + b, e.y + s);
    ctx.moveTo(e.x + s - b, e.y + s); ctx.lineTo(e.x + s, e.y + s); ctx.lineTo(e.x + s, e.y + s - b);
    ctx.stroke();
    ctx.fillStyle = HEART;
    dot(ctx, e.x, e.y, 2.5);
    ctx.restore();
    return true;
  }

  if (e.type === 'rupa-shutter') {
    const dir = e.dir || 1;
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    const p = easeOut(el / e.max);
    const r = Math.max(2, (e.radius || 74) * (.35 + p * .85));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * .75;
    glow(ctx, e.x, e.y, r, GOLD_RGB);
    ctx.globalAlpha = k * .95;
    ctx.fillStyle = '#ffffff';
    sparkle(ctx, e.x, e.y, r * .52);
    ctx.globalCompositeOperation = 'source-over';
    const px = e.x + dir * 16, rot = dir * .12 * (1 - p);
    ctx.translate(px, e.y);
    ctx.rotate(rot);
    ctx.globalAlpha = k * .9;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(-22, -26, 44, 52);
    ctx.restore();
    return true;
  }

  if (e.type === 'rupa-drink') {
    const dir = e.dir || 1;
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(-dir * .42);
    ctx.globalAlpha = k * .95;
    ctx.fillStyle = AMBER;
    ctx.strokeStyle = '#fff5cf';
    ctx.lineWidth = 2;
    ctx.fillRect(-9, -12, 18, 22);
    ctx.strokeRect(-9, -12, 18, 22);
    ctx.beginPath();
    ctx.arc(dir * 11, -1, 5.5, -Math.PI * .5, Math.PI * .5);
    ctx.stroke();
    ctx.fillStyle = FOAM;
    ctx.beginPath();
    ctx.ellipse(0, -13, 10.5, 4.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    return true;
  }

  if (e.type === 'rupa-bold-wave') {
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    const p = easeOut(el / e.max);
    const r = Math.max(4, (e.radius || 175) * (.25 + p * .78));
    ctx.save();
    ctx.globalAlpha = k * .32;
    glow(ctx, e.x, e.y, r, AMBER_RGB);
    ctx.globalAlpha = k * .9;
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 4.5 * k + 1.5;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = FOAM;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, Math.max(1, r * .72), 0, TAU);
    ctx.stroke();
    for (let i = 0, m = count(10, lite); i < m; i++) {
      const a = (i / m) * TAU + el * 1.8;
      ctx.fillStyle = i % 2 ? FOAM : GOLD;
      dot(ctx, e.x + Math.cos(a) * r * .88, e.y + Math.sin(a) * r * .88, 3.6 * k + 1.2);
    }
    ctx.restore();
    return true;
  }

  /* ---- L 因此才需要摇滚: livehouse backdrop, 4 resonant fretboard strings, tuning & slap waveforms ---- */

  if (e.type === 'rupa-stage') {
    const into = easeOut(el / .18);
    const out = Math.min(1, e.life / .28);
    const k = into * out;
    if (k <= MIN_ALPHA) return true;
    const bold = (e.n ?? 0) > 0;
    const tex = stageStamp();
    ctx.save();
    ctx.globalAlpha = k * .94;
    if (tex) ctx.drawImage(tex, 0, 0, W, H);
    else {
      ctx.fillStyle = 'rgba(12,6,9,.85)';
      ctx.fillRect(0, 0, W, H);
    }

    ctx.globalCompositeOperation = 'lighter';
    const primaryCone = coneStamp(bold ? 2 : 0);
    const redCone = coneStamp(1);
    const sx = clamp(e.x, 90, W - 90);
    const sway = Math.sin(el * 2.8) * .045;
    if (primaryCone) {
      const aL = -.18 + sway;
      ctx.translate(sx - 82, -24);
      ctx.rotate(aL);
      ctx.globalAlpha = k * (bold ? .64 : .48);
      ctx.drawImage(primaryCone, -125, 0, 250, H + 40);
      ctx.rotate(-aL);
      ctx.translate(-(sx - 82), 24);
    }
    if (redCone) {
      const aR = .2 - sway;
      ctx.translate(sx + 86, -24);
      ctx.rotate(aR);
      ctx.globalAlpha = k * (bold ? .58 : .44);
      ctx.drawImage(redCone, -125, 0, 250, H + 40);
      ctx.rotate(-aR);
      ctx.translate(-(sx + 86), 24);
    }

    ctx.globalAlpha = k * .36;
    glow(ctx, sx, FLOOR + 2, 220, bold ? AMBER_RGB : GOLD_RGB);

    const B = RUPA_BASS;
    let ringBeat = -1;
    let ringAge = 9;
    if (el >= B.finale) { ringBeat = 3; ringAge = el - B.finale; }
    else {
      for (let b = B.beats.length - 1; b >= 0; b--) {
        if (el >= B.beats[b]) { ringBeat = b; ringAge = el - B.beats[b]; break; }
      }
    }
    const pulseKick = ringBeat >= 0 ? Math.max(0, 1 - ringAge / .24) : 0;

    if (!lite) {
      for (let i = -8; i <= 8; i++) {
        const bx = sx + i * 24 - 4;
        if (bx < 20 || bx > W - 28) continue;
        const dist = 1 - Math.abs(i) / 10;
        const bh = (6 + Math.abs(Math.sin(el * 12 + i * .7)) * 16 + pulseKick * 28) * dist;
        ctx.globalAlpha = k * (.18 + pulseKick * .22) * dist;
        ctx.fillStyle = i % 2 ? CRIMSON : (bold ? AMBER : GOLD);
        ctx.fillRect(bx, FLOOR - bh, 8, bh);
      }
    }

    // 4 bass strings across the lower-mid horizon: trace vibrating curve once, stroke twice (bloom + core).
    if (!lite) {
      ctx.globalAlpha = k * .14;
      ctx.strokeStyle = GOLD_SOFT;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const fx of STAGE_FRET_XS) { ctx.moveTo(fx, STAGE_STRING_YS[0] - 10); ctx.lineTo(fx, STAGE_STRING_YS[3] + 10); }
      ctx.stroke();
    }
    const segs = lite ? 14 : 26;
    for (let s = 0; s < 4; s++) {
      const active = ringBeat === 3 || ringBeat === s;
      const vib = active ? Math.max(0, 1 - ringAge / .38) * (ringBeat === 3 ? 15 : 11) : (el < B.dashStart ? Math.sin(el * 42 + s) * 2.2 : 0);
      const y = STAGE_STRING_YS[s];
      const thickness = (4 - s) * .55 + .6;
      const bloomW = thickness + (active ? 3.5 : 1.4);
      const coreW = Math.max(.8, thickness * .55);
      if (vib > .2) {
        traceVibratedString(ctx, 0, W, y, vib, el * 54 + s * 1.4, 5 + s, segs);
        ctx.globalAlpha = k * (active ? .48 : .2);
        ctx.strokeStyle = s % 2 ? CRIMSON : (bold ? AMBER : GOLD);
        ctx.lineWidth = bloomW;
        ctx.stroke();
        ctx.globalAlpha = k * (active ? .88 : .32);
        ctx.strokeStyle = active ? '#ffffff' : GOLD_SOFT;
        ctx.lineWidth = coreW;
        ctx.stroke();
      } else {
        ctx.globalAlpha = k * (active ? .48 : .2);
        ctx.strokeStyle = s % 2 ? CRIMSON : (bold ? AMBER : GOLD);
        streak(ctx, 0, y, W, y, bloomW);
        ctx.globalAlpha = k * (active ? .88 : .32);
        ctx.strokeStyle = active ? '#ffffff' : GOLD_SOFT;
        streak(ctx, 0, y, W, y, coreW);
      }
    }

    if (!lite) {
      const dustN = bold ? 16 : 11;
      for (let i = 0; i < dustN; i++) {
        const u = cycle(el, bold ? .5 : .36, i, 21);
        const mx = sx + (hash(i, 22) - .5) * 320 + Math.sin(el * 2.4 + i) * 12;
        const my = FLOOR - u * 380;
        ctx.globalAlpha = k * Math.sin(u * Math.PI) * (bold ? .62 : .44);
        ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? GOLD_SOFT : AMBER;
        dot(ctx, mx, my, (bold ? 2.2 : 1.4) + hash(i, 23) * 2);
      }
    }
    ctx.restore();
    return true;
  }

  if (e.type === 'rupa-tune') {
    const dir = e.dir || 1;
    const p = clamp(el / e.max, 0, 1);
    const k = Math.sin(p * Math.PI);
    if (k <= MIN_ALPHA) return true;
    const inv = 1 - easeOut(p);
    const r = Math.max(4, 96 * (.22 + inv * .85));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * .62;
    glow(ctx, e.x, e.y, r * 1.15, GOLD_RGB);

    for (let s = 0; s < 4; s++) {
      const sy = e.y + (s - 1.5) * (8 + inv * 24);
      const sx0 = e.x - dir * (40 + inv * 70);
      const sx1 = e.x + dir * (44 + inv * 70);
      ctx.globalAlpha = k * .88;
      ctx.strokeStyle = s % 2 ? CRIMSON : GOLD_SOFT;
      ctx.lineWidth = 2.2 - s * .25;
      traceVibratedString(ctx, sx0, sx1, sy, inv * 9, el * 60 + s, 3, 12);
      ctx.stroke();
    }

    ctx.globalAlpha = k * .95;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2.6;
    cymaticRing(ctx, e.x, e.y, r * .72, r * .72, 4, .14, el * 10, 40);
    ctx.fillStyle = '#ffffff';
    sparkle(ctx, e.x, e.y, 14 * k + 4);
    ctx.restore();
    return true;
  }

  if (e.type === 'rupa-bass-aura') {
    const into = easeOut(el / .14);
    const out = Math.min(1, e.life / .24);
    const k = into * out;
    if (k <= MIN_ALPHA) return true;
    const bold = (e.n ?? 0) > 0;
    const pulse = 1 + .1 * Math.sin(el * 16);
    const rx = Math.max(12, (e.radius || 118) * pulse);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * .48;
    glow(ctx, e.x, FLOOR - 6, rx * .85, bold ? AMBER_RGB : GOLD_RGB);

    ctx.translate(e.x, FLOOR - 3);
    ctx.scale(1, .28);
    ctx.rotate(el * (bold ? 1.4 : .95));
    ctx.globalAlpha = k * .88;
    ctx.strokeStyle = bold ? AMBER : GOLD;
    ctx.lineWidth = 3.6;
    cymaticRing(ctx, 0, 0, rx, rx, 8, .13, el * 2.5, lite ? 48 : 88);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    cymaticRing(ctx, 0, 0, rx * .92, rx * .92, 8, .08, el * 2.5, lite ? 40 : 72);
    ctx.rotate(-el * 2);
    ctx.strokeStyle = CRIMSON;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, rx * .7, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = GOLD_SOFT;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      pickGlyph(ctx, Math.cos(a) * rx * .84, Math.sin(a) * rx * .84, 7.5, a);
    }
    ctx.restore();
    return true;
  }

  if (e.type === 'rupa-slap') {
    const dir = e.dir || 1;
    const rawN = e.n ?? 0;
    const bold = rawN >= 10;
    const tier = rawN % 10;
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    const p = easeOut(el / e.max);
    const r = Math.max(8, (e.radius || 96) * (.34 + p * .78));
    const tilt = tier === 0 ? .48 : tier === 1 ? -.44 : 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * .48;
    glow(ctx, e.x, e.y, r * 1.12, bold ? AMBER_RGB : (tier % 2 ? CRIMSON_RGB : GOLD_RGB));

    const rot = dir * tilt;
    ctx.translate(e.x, e.y);
    ctx.rotate(rot);
    const a0 = dir > 0 ? -1.16 : Math.PI - 1.16;
    const a1 = dir > 0 ? 1.16 : Math.PI + 1.16;
    ctx.globalAlpha = k * .94;
    ctx.fillStyle = tier % 2 ? CRIMSON : (bold ? AMBER : GOLD);
    crescentArc(ctx, 0, 0, r * .76, r * .92, a0, a1, 20 * k + 4);
    ctx.fillStyle = '#ffffff';
    crescentArc(ctx, dir * 4, 0, r * .72, r * .86, a0 * .78 + (dir < 0 ? Math.PI * .22 : 0), a1 * .78 + (dir < 0 ? Math.PI * .22 : 0), 8 * k + 1.5);

    const vib = (1 - p) * 14;
    ctx.globalAlpha = k * .92;
    ctx.strokeStyle = GOLD_SOFT;
    ctx.lineWidth = 2.4;
    traceVibratedString(ctx, -r * .45, r * .88, 0, vib, el * 58, 3 + tier, 18);
    ctx.stroke();
    if (bold) {
      ctx.globalAlpha = k * .78;
      ctx.fillStyle = FOAM;
      crescentArc(ctx, -dir * 8, 0, r * .92, r * 1.04, a0 * .9 + (dir < 0 ? Math.PI * .1 : 0), a1 * .9 + (dir < 0 ? Math.PI * .1 : 0), 9 * k + 2);
    }
    ctx.rotate(-rot);
    ctx.translate(-e.x, -e.y);

    ctx.globalAlpha = k * .76;
    ctx.strokeStyle = tier % 2 ? GOLD : CRIMSON;
    ctx.lineWidth = 2.5 * k + 1;
    cymaticRing(ctx, e.x + dir * 10, e.y, r * .6, r * .82, 4 + tier * 2, .14, el * 8, lite ? 48 : 84);

    for (let i = 0, m = count(bold ? 6 : 4, lite); i < m; i++) {
      const a = (dir > 0 ? 0 : Math.PI) + (hash(i + tier * 5, 31) - .5) * 1.5;
      const d = r * (.42 + p * (.68 + hash(i, 32) * .32));
      const nx = e.x + Math.cos(a) * d;
      const ny = e.y + Math.sin(a) * d;
      ctx.globalAlpha = k * .92;
      const col = i % 2 ? GOLD_SOFT : '#ffffff';
      if (i === 0) noteGlyph(ctx, nx, ny, 9.5 * k + 4, a * .25, col);
      else if (i === 1) { ctx.fillStyle = col; pickGlyph(ctx, nx, ny, 5 * k + 2, a); }
      else { ctx.fillStyle = col; sparkle(ctx, nx, ny, 4.5 * k + 1.5); }
    }
    ctx.restore();
    return true;
  }

  if (e.type === 'rupa-hit-ripple') {
    const dir = e.dir || 1;
    const rawN = e.n ?? 0;
    const bold = rawN >= 10;
    const tier = rawN % 10;
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    const p = easeOut(el / e.max);
    const r = Math.max(4, (e.radius || 76) * (.26 + p * .82));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * .42;
    glow(ctx, e.x, e.y, r, bold ? AMBER_RGB : (tier === 3 ? CRIMSON_RGB : GOLD_RGB));

    const rot = dir * .18;
    ctx.translate(e.x, e.y);
    ctx.rotate(rot);
    ctx.globalAlpha = k * .95;
    ctx.strokeStyle = tier % 2 ? CRIMSON : (bold ? AMBER : GOLD);
    ctx.lineWidth = 2.6 * k + 1;
    cymaticRing(ctx, 0, 0, r * .76, r * .56, 6 + tier * 2, .14, el * 10, lite ? 40 : 72);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    cymaticRing(ctx, dir * 10 * p, 0, r * .46, r * .34, 4, .1, -el * 12, lite ? 32 : 56);
    pickPath(ctx, 0, 0, 14 * k + 4, dir > 0 ? 0 : Math.PI);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2 * k + .8;
    ctx.stroke();
    ctx.rotate(-rot);
    ctx.translate(-e.x, -e.y);

    for (let i = 0, m = count(5, lite); i < m; i++) {
      const a = (dir > 0 ? 0 : Math.PI) + (hash(i + tier * 3, 41) - .5) * 1.4;
      const d = r * (.35 + p * .72);
      ctx.globalAlpha = k * .9;
      ctx.strokeStyle = i % 2 ? GOLD_SOFT : '#ffffff';
      streak(ctx, e.x + Math.cos(a) * d * .4, e.y + Math.sin(a) * d * .4, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 2 * k + .8);
    }
    ctx.restore();
    return true;
  }

  if (e.type === 'rupa-finale') {
    const dir = e.dir || 1;
    const bold = (e.n ?? 0) > 0;
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    const p = easeOut(el / e.max);
    const cx = clamp(e.x, 125, W - 125);
    const cy = Math.min(e.y, FLOOR - 115);
    const r = Math.max(8, (e.radius || 142) * (.32 + p * .86));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * .56;
    glow(ctx, cx, cy, r * 1.15, bold ? AMBER_RGB : CRIMSON_RGB);

    const a0 = dir > 0 ? -1.42 : Math.PI - 1.42;
    const a1 = dir > 0 ? 1.42 : Math.PI + 1.42;
    ctx.globalAlpha = k * .94;
    ctx.fillStyle = CRIMSON;
    crescentArc(ctx, cx - dir * 8, cy, r * .88, r * 1.0, a0, a1, 26 * k + 5, 22);
    ctx.fillStyle = bold ? AMBER : GOLD;
    crescentArc(ctx, cx, cy, r * .8, r * .92, a0 * .82 + (dir < 0 ? Math.PI * .18 : 0), a1 * .82 + (dir < 0 ? Math.PI * .18 : 0), 14 * k + 3, 20);
    ctx.fillStyle = '#ffffff';
    crescentArc(ctx, cx + dir * 5, cy, r * .74, r * .84, a0 * .6 + (dir < 0 ? Math.PI * .4 : 0), a1 * .6 + (dir < 0 ? Math.PI * .4 : 0), 6 * k + 1.5, 16);
    if (bold) {
      ctx.globalAlpha = k * .82;
      ctx.fillStyle = FOAM;
      crescentArc(ctx, cx + dir * 10, cy, r * .98, r * 1.08, a0 * .92 + (dir < 0 ? Math.PI * .08 : 0), a1 * .92 + (dir < 0 ? Math.PI * .08 : 0), 10 * k + 2, 20);
    }

    ctx.globalAlpha = k * .88;
    ctx.strokeStyle = bold ? AMBER : GOLD;
    ctx.lineWidth = 3 * k + 1.2;
    cymaticRing(ctx, cx, cy, r * .86, r * .86, 8, .13, el * 7, lite ? 52 : 96);
    ctx.strokeStyle = CRIMSON;
    ctx.lineWidth = 2.4 * k + 1;
    cymaticRing(ctx, cx, cy, r * .64, r * .64, 12, .11, -el * 9, lite ? 56 : 108);

    const vib = (1 - p) * 15;
    const strSegs = lite ? 16 : 26;
    for (let s = 0; s < 4; s++) {
      const sy = cy + (s - 1.5) * 18;
      ctx.globalAlpha = k * .86;
      ctx.strokeStyle = s % 2 ? GOLD_SOFT : '#ffffff';
      ctx.lineWidth = 2.8 - s * .35;
      traceVibratedString(ctx, cx - r * .78, cx + r * .92, sy, vib, el * 65 + s, 4 + s, strSegs);
      ctx.stroke();
    }

    ctx.globalAlpha = k * .95;
    pickPath(ctx, cx, cy, 20 * k + 6, dir > 0 ? 0 : Math.PI);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.2 * k + 1;
    ctx.stroke();
    pickPath(ctx, cx, cy, 11 * k + 3, dir > 0 ? 0 : Math.PI);
    ctx.fillStyle = bold ? AMBER : CRIMSON;
    ctx.fill();

    for (let i = 0, m = count(bold ? 14 : 10, lite); i < m; i++) {
      const a = (i / m) * TAU + (dir > 0 ? 0 : Math.PI * .2);
      const d1 = r * .44, d2 = r * (.96 + hash(i, 10) * .22);
      ctx.globalAlpha = k * .92;
      ctx.strokeStyle = i % 2 ? (bold ? AMBER : GOLD) : '#ffffff';
      streak(ctx, cx + Math.cos(a) * d1, cy + Math.sin(a) * d1, cx + Math.cos(a) * d2, cy + Math.sin(a) * d2, 2.2 * k + .8);
      if (i % 3 === 0) {
        noteGlyph(ctx, cx + Math.cos(a) * d2, cy + Math.sin(a) * d2, 9.5 * k + 4, Math.sin(a) * .35, i % 2 ? GOLD_SOFT : '#ffffff');
      } else if (bold && i % 3 === 1) {
        ctx.fillStyle = FOAM;
        dot(ctx, cx + Math.cos(a) * (d2 * .85), cy + Math.sin(a) * (d2 * .85), 3 * k + 1.2);
      }
    }
    ctx.restore();
    return true;
  }

  return false;
}
