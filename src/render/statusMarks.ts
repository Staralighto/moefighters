/* 异常的样子: one drawer per mark. The kernel (src/game/status.ts) decides what a status does by its kind;
   this table decides what it looks like by its mark. A new look for an existing status is one entry here
   and a `mark` on the move — no kernel change. The four defaults are neutral, so any character can lay
   them without wearing someone else's colours.
   Texture comes from many small shapes (fxParticles.ts) rather than one outlined icon: licking flames, sparks
   and ash for 烧焦, snowflakes and cold mist for 冻僵, an ice sculpture for 冻住 (the body itself, see BodyLook), a little orbit of stars for 混乱. They sit on
   a body for seconds, so each stays small, soft and slow; the bursts when they land are where they get loud.
   One-shot graphics arrive as effects named `<mark>@apply` / `<mark>@expire`. */

import type { Effect } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import { TAU, burst, cycle, dot, flame, glow, glyph, hash, snowflake, sparkle, streak, tri } from './fxParticles.ts';
import { isLiteFx } from './fx.ts';

/** A status that changes the body itself, painted by the renderer with the view's own outline and tint:
 *  the outline replaces the team rim, each wash is the sprite's silhouette in one colour laid over it, and the
 *  shine is a slanted band of a colour that sweeps across the body (clipped to the sprite) every `every` s. */
export interface BodyLook {
  outline?: string;
  washes: { tint: string; alpha: number; mode?: GlobalCompositeOperation }[];
  shine?: { tint: string; alpha: number; every: number; width: number };
}

export interface MarkDrawer {
  /** Every frame while the status holds, in world space. `left` is its seconds left, `t` the match clock. */
  aura(ctx: CanvasRenderingContext2D, f: Fighter, left: number, t: number): void;
  /** Optional: the status also changes how the body itself is painted (冻住: an ice sculpture). */
  body?: BodyLook;
  /** The moment it lands. `age` is seconds since; `e.x, e.y` are the feet. */
  apply?(ctx: CanvasRenderingContext2D, e: Effect, age: number): void;
  /** The moment it ends (冻住's ice breaking). */
  expire?(ctx: CanvasRenderingContext2D, e: Effect, age: number): void;
}

/** Where the head and the chest sit on this body. Sprite heights differ; the geometry dummies are 181. */
function bodyH(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.height : 181;
}
const n = (full: number) => (isLiteFx() ? Math.ceil(full / 2) : full);

const DIZZY = ['#e6dcff', '#ffd6f2', '#fff2a8', '#bdf0ff'] as const;

/* ---------- 烧焦: small flames licking up the body, a warm haze, sparks flicking off, ash drifting off the head ---------- */
function auraBurn(ctx: CanvasRenderingContext2D, f: Fighter, _left: number, t: number): void {
  const h = bodyH(f);
  ctx.save();
  // A faint warm haze over the body, breathing.
  ctx.globalAlpha = .18 + .06 * Math.sin(t * 7);
  glow(ctx, f.x, f.y - h * .45, h * .42, '255,140,60');
  // Flames: each one is born somewhere on the body, licks up and shrinks; hot ones first, warm ones as they die.
  for (let i = 0, m = n(10); i < m; i++) {
    const k = cycle(t, 1.3, i);
    const x = f.x + (hash(i, 1) - .5) * 40 + Math.sin(t * 9 + i * 2) * 2;
    const y = f.y - h * (.12 + .74 * hash(i, 2)) - k * 26;
    ctx.globalAlpha = Math.sin(Math.min(1, k * 1.4) * Math.PI) * .95;
    flame(ctx, x, y, (7 + hash(i, 3) * 6) * (1 - k * .55), k < .45 ? 'hot' : 'warm');
  }
  // Sparks: short bright streaks flicking up and out.
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0, m = n(7); i < m; i++) {
    const k = cycle(t, 1.6, i, 4);
    const a = -Math.PI / 2 + (hash(i, 5) - .5) * 1.6;
    const r0 = 10 + k * 40;
    const ox = f.x + (hash(i, 6) - .5) * 30, oy = f.y - h * (.3 + .5 * hash(i, 7));
    ctx.globalAlpha = (1 - k) * .9;
    ctx.strokeStyle = i % 2 ? '#ffd56a' : '#fff1c0';
    streak(ctx, ox + Math.cos(a) * r0, oy + Math.sin(a) * r0, ox + Math.cos(a) * (r0 + 7), oy + Math.sin(a) * (r0 + 7), 1.6);
  }
  ctx.globalCompositeOperation = 'source-over';
  // Ash: little grey flakes curling up off the head.
  for (let i = 0, m = n(6); i < m; i++) {
    const k = cycle(t, .5, i, 8);
    ctx.globalAlpha = (1 - k) * .5;
    glow(ctx, f.x + (hash(i, 9) - .5) * 30 + Math.sin(t * 2 + i) * 9, f.y - h - 2 - k * 50, 5 + k * 9, '140,132,150');
  }
  ctx.restore();
}
function applyBurn(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // Catching fire: a puff of flame and a fan of sparks off the chest.
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - age / .3) * .55;
  glow(ctx, e.x, e.y - 100, 50 + age * 80, '255,150,60');
  burst(age, 3, { n: n(10), speed: [40, 140], life: .5, gravity: -220, drag: .2 }, (x, y, k) => {
    ctx.globalAlpha = 1 - k;
    flame(ctx, x, y, 10 * (1 - k * .5), k < .4 ? 'hot' : 'warm');
  }, e.x, e.y - 100);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  burst(age, 4, { n: n(16), speed: [180, 380], life: .4, gravity: 300, drag: .3 }, (x, y, k, i) => {
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = i % 2 ? '#ffd56a' : '#fff1c0';
    const dx = x - e.x, dy = y - (e.y - 100), d = Math.hypot(dx, dy) || 1;
    streak(ctx, x - dx / d * 8, y - dy / d * 8, x, y, 1.8);
  }, e.x, e.y - 100);
  ctx.restore();
}

/* ---------- 冻僵: snowflakes drifting round the body, a cold mist hanging on it, a pool of frost at the feet ---------- */
function auraFrost(ctx: CanvasRenderingContext2D, f: Fighter, _left: number, t: number): void {
  const h = bodyH(f);
  ctx.save();
  // The frost pool: a flat, soft, pale glow on the floor round the feet — it reads as rime, not as a ring.
  ctx.save();
  ctx.translate(f.x, f.y - 2);
  ctx.scale(1, .22);
  ctx.globalAlpha = .45 + .08 * Math.sin(t * 2);
  glow(ctx, 0, 0, 58, '214,240,255');
  ctx.restore();
  // Cold mist clinging to the body.
  for (let i = 0, m = n(5); i < m; i++) {
    const k = cycle(t, .35, i, 3);
    ctx.globalAlpha = Math.sin(k * Math.PI) * .22;
    glow(ctx, f.x + (hash(i, 4) - .5) * 50, f.y - h * (.2 + .6 * hash(i, 5)) - k * 20, 18 + k * 10, '226,244,255');
  }
  // Snowflakes: a loose orbit round the body, each one turning slowly, the far side dimmer.
  for (let i = 0, m = n(9); i < m; i++) {
    const a = t * (i % 2 ? .8 : -.6) + i * TAU / m;
    const depth = Math.sin(a);
    const y = f.y - h * (.15 + .7 * hash(i, 6)) + depth * 8 + Math.sin(t * 1.5 + i) * 4;
    ctx.globalAlpha = .62 + depth * .33;
    snowflake(ctx, f.x + Math.cos(a) * (30 + hash(i, 7) * 14), y, 5 + hash(i, 8) * 3, t * .6 + i, depth > 0 ? '#f4fcff' : '#bfe6ff');
  }
  // Fine snow falling past.
  ctx.fillStyle = '#ffffff';
  for (let i = 0, m = n(8); i < m; i++) {
    const k = cycle(t, .45, i, 9);
    ctx.globalAlpha = Math.sin(k * Math.PI) * .85;
    dot(ctx, f.x + (hash(i, 10) - .5) * 76 + Math.sin(t * 2 + i) * 4, f.y - h - 10 + k * (h + 6), 1.6);
  }
  ctx.restore();
}
function applyFrost(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // The cold hits: a white puff, snowflakes thrown out, and frost spreading across the floor.
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - age / .35) * .5;
  glow(ctx, e.x, e.y - 100, 40 + age * 90, '230,246,255');
  burst(age, 11, { n: n(12), speed: [100, 260], life: .55, gravity: 160, drag: .2 }, (x, y, k, i) => {
    ctx.globalAlpha = 1 - k;
    snowflake(ctx, x, y, 6 * (1 - k * .4), k * 5 + i, i % 2 ? '#ffffff' : '#bfe6ff');
  }, e.x, e.y - 100);
  ctx.save();
  ctx.translate(e.x, e.y - 2);
  ctx.scale(1, .22);
  ctx.globalAlpha = Math.max(0, 1 - age / .55) * .7;
  glow(ctx, 0, 0, 30 + Math.min(1, age / .3) * 50, '222,244,255');
  ctx.restore();
  ctx.restore();
}

/* ---------- 冻住: they become an ice sculpture — the body itself goes pale blue with a white rim and a cold
   white sheen, a light band sweeps across it (BodyLook, painted by the renderer from the sprite), and soft white
   balls of cold air roll off it. No particles beyond the cold air: the sculpture is the effect. ---------- */
const ICE_BODY: BodyLook = {
  outline: '#f4fbff',
  washes: [
    { tint: '#8fcaf2', alpha: .58 },
    { tint: '#1f3550', alpha: .16, mode: 'lighter' },
    { tint: '#ffffff', alpha: .14, mode: 'lighter' },
  ],
  shine: { tint: '#ffffff', alpha: .42, every: 1.1, width: 12 },
};
/** Soft white balls of cold air: rising off the shoulders and sinking off the feet, slowly. */
function coldAir(ctx: CanvasRenderingContext2D, x0: number, foot: number, h: number, t: number, count: number, strength: number): void {
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < count; i++) {
    const k = cycle(t, .5, i, 20);
    const up = i % 3 !== 0;
    const x = x0 + (hash(i, 21) - .5) * 70 + Math.sin(t * 1.5 + i) * 6 * k;
    const y = up ? foot - h * (.35 + .55 * hash(i, 22)) - k * 26 : foot - 6 + k * 4;
    ctx.globalAlpha = strength * Math.sin(k * Math.PI) * (up ? .55 : .7);
    glow(ctx, up ? x : x0 + (hash(i, 23) - .5) * 100 * (.5 + k), y, (up ? 6 : 9) + k * (up ? 8 : 12), '255,255,255');
  }
}
function auraIce(ctx: CanvasRenderingContext2D, f: Fighter, _left: number, t: number): void {
  ctx.save();
  coldAir(ctx, f.x, f.y, bodyH(f), t, n(12), 1);
  ctx.restore();
}
function applyIce(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // The cold takes them: a puff of white balls thrown out round the body, settling on the floor.
  ctx.save();
  ctx.fillStyle = '#ffffff';
  burst(age, 24, { n: n(18), speed: [60, 180], life: .55, drag: .15, gravity: 60 }, (x, y, k, i) => {
    ctx.globalAlpha = (1 - k) * .75;
    glow(ctx, x, y, 8 + k * 14 + (i % 3) * 3, '255,255,255');
  }, e.x, e.y - 90);
  ctx.restore();
}
function expireIce(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // The sculpture lets go: a few pale chips knocked off it, and the cold air breaks up in a puff.
  ctx.save();
  burst(age, 19, { n: n(10), speed: [90, 240], life: .5, gravity: 1000, angle: -Math.PI / 2, spread: Math.PI * 1.4 }, (x, y, k, i) => {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = i % 2 ? '#e6f6ff' : '#b8e2fb';
    tri(ctx, x, y, 3 + hash(i, 20) * 4, i + k * 8);
  }, e.x, e.y - 95);
  ctx.fillStyle = '#ffffff';
  burst(age, 25, { n: n(14), speed: [70, 200], life: .6, drag: .15 }, (x, y, k) => {
    ctx.globalAlpha = (1 - k) * .7;
    glow(ctx, x, y, 9 + k * 16, '255,255,255');
  }, e.x, e.y - 90);
  ctx.restore();
}

/* ---------- 混乱: a small orbit of stars, dots and tiny question marks over the head ---------- */
function auraDizzy(ctx: CanvasRenderingContext2D, f: Fighter, _left: number, t: number): void {
  const top = f.y - bodyH(f) - 12;
  ctx.save();
  const m = n(12);
  for (let i = 0; i < m; i++) {
    const a = t * 3.2 + i * TAU / m;
    const depth = Math.sin(a);
    const x = f.x + Math.cos(a) * 34, y = top + depth * 9;
    ctx.globalAlpha = .55 + depth * .4;
    ctx.fillStyle = DIZZY[i % 4];
    const s = 1 + depth * .25;
    if (i % 3 === 0) glyph(ctx, '?', x, y, 15 * s);
    else if (i % 3 === 1) sparkle(ctx, x, y, 6.5 * s);
    else dot(ctx, x, y, 2.6 * s);
  }
  // A thin inner spiral of dots, turning the other way.
  for (let i = 0, m2 = n(8); i < m2; i++) {
    const a = -t * 5 + i * .7;
    const r = 6 + i * 2;
    ctx.globalAlpha = .7 - i * .07;
    ctx.fillStyle = '#ffffff';
    dot(ctx, f.x + Math.cos(a) * r, top - 4 + Math.sin(a) * r * .3, 1.4);
  }
  ctx.restore();
}
function applyDizzy(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const top = e.y - 190;
  burst(age, 23, { n: n(20), speed: [90, 220], life: .5, gravity: 200, drag: .25 }, (x, y, k, i) => {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = DIZZY[i % 4];
    if (i % 2) sparkle(ctx, x, y, 6 * (1 - k * .5)); else dot(ctx, x, y, 2.4);
  }, e.x, top);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - age / .45);
  ctx.fillStyle = '#efe8ff';
  glyph(ctx, '?', e.x + 16, top - 22 - age * 50, 22);
  ctx.restore();
}

export const STATUS_MARKS: Record<string, MarkDrawer> = {
  burn: { aura: auraBurn, apply: applyBurn },
  frost: { aura: auraFrost, apply: applyFrost },
  'ice-block': { aura: auraIce, apply: applyIce, expire: expireIce, body: ICE_BODY },
  'dizzy-q': { aura: auraDizzy, apply: applyDizzy },
};

/** Live marks this body wears that the table knows. Older looks (摩卡's bubble, the petals) are not in the
 *  table and keep their own drawing in renderer.ts. */
export function statusMarkOf(mark: string | undefined): MarkDrawer | undefined {
  return mark ? STATUS_MARKS[mark] : undefined;
}

const STATUS_MOD_KINDS = new Set(['burn', 'slow', 'confuse']);

/** Every status aura on this body, and whether the slow and the root were drawn here (so the old
 *  petal / heart drawings stay off for them). */
export function drawStatusAuras(ctx: CanvasRenderingContext2D, f: Fighter, t: number): { slow: boolean; root: boolean } {
  let slow = false, root = false;
  for (const m of f.mods) {
    if (m.left <= 0 || !STATUS_MOD_KINDS.has(m.kind)) continue;
    const d = statusMarkOf(m.mark);
    if (!d) continue;
    d.aura(ctx, f, m.left, t);
    if (m.kind === 'slow') slow = true;
  }
  if (f.root > 0) {
    const d = statusMarkOf(f.rootMark);
    if (d) { d.aura(ctx, f, f.root, t); root = true; }
  }
  return { slow, root };
}

/** The body look this fighter wears right now, if any of its live statuses has one. The root's mark wins. */
export function statusBodyOf(f: Fighter): BodyLook | undefined {
  if (f.root > 0) {
    const d = statusMarkOf(f.rootMark);
    if (d?.body) return d.body;
  }
  for (const m of f.mods) {
    if (m.left <= 0 || !STATUS_MOD_KINDS.has(m.kind)) continue;
    const d = statusMarkOf(m.mark);
    if (d?.body) return d.body;
  }
  return undefined;
}

/** `<mark>@apply` and `<mark>@expire`. False when the effect is not a status one-shot. */
export function drawStatusEffect(ctx: CanvasRenderingContext2D, e: Effect): boolean {
  const at = e.type.indexOf('@');
  if (at < 0) return false;
  const d = STATUS_MARKS[e.type.slice(0, at)];
  if (!d) return true;
  const age = e.max - e.life;
  if (e.type.endsWith('@apply')) d.apply?.(ctx, e, age);
  else if (e.type.endsWith('@expire')) d.expire?.(ctx, e, age);
  return true;
}
