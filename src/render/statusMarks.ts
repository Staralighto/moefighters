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
import type { ImageCache } from '../assets/loader.ts';
import { TAU, burst, cycle, dot, flame, glow, glyph, hash, snowflake, soap, sparkle, stampText, streak, tri } from './fxParticles.ts';
import { isLiteFx } from './fxQuality.ts';
import { drawDoodleDizzy, drawDoodleLand } from './chisatoFx.ts';
import { applyMaze, applyZap, auraMaze, auraZap } from './kanonFx.ts';
import { applyHypno, auraHypno } from './akoFx.ts';

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
  aura(ctx: CanvasRenderingContext2D, f: Fighter, left: number, t: number, images?: ImageCache): void;
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

/* ---------- 跟班: a pink pennant on a little pole over their head with their 部下 number, dust puffs at their
   heels as they trot, and now and then a small 「是，老大！」 — no outline, nothing over the face ---------- */
const FOLLOW_PINK = '#FF55AA';
const FOLLOW_LINES = ['是，老大！', '千樱梨好厉害！'] as const;
/** Bubble widths for the two lines at 13 px (full-width glyphs are one em each). */
const FOLLOW_TEXT_W: Record<string, number> = { '是，老大！': 65, '千樱梨好厉害！': 91 };
function followHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  if (!(s > 0)) return;
  ctx.beginPath();
  ctx.moveTo(x, y + s * .9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * .1, x - s * .6, y - s * 1.2, x, y - s * .35);
  ctx.bezierCurveTo(x + s * .6, y - s * 1.2, x + s * 1.4, y - s * .1, x, y + s * .9);
  ctx.fill();
}
function pennant(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, num: number, scale = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#3a2433';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -40); ctx.stroke();
  const wave = Math.sin(t * 9) * 3;
  ctx.fillStyle = FOLLOW_PINK;
  ctx.beginPath(); ctx.moveTo(1, -40); ctx.quadraticCurveTo(16, -36 + wave, 30, -31 + wave); ctx.quadraticCurveTo(16, -26 - wave * .5, 1, -22); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffffff';
  sparkle(ctx, 11, -31 + wave * .5, 5);
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath(); ctx.arc(0, -42, 3, 0, TAU); ctx.fill();
  if (num > 0) {
    stampText(ctx, 'No.' + num, 18, -14, 11, '#ffffff', '#2a0f22');
  }
  ctx.restore();
}
function auraFollow(ctx: CanvasRenderingContext2D, f: Fighter, _left: number, t: number): void {
  const h = bodyH(f);
  const num = f.mods.find(m => m.kind === 'follow' && m.left > 0)?.v ?? 0;
  ctx.save();
  // A soft pink glow round them and little hearts drifting up off their shoulders: they are hers now.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = .16 + .05 * Math.sin(t * 6);
  glow(ctx, f.x, f.y - h * .5, h * .45, '255,110,185');
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0, m = n(5); i < m; i++) {
    const k = cycle(t, .9, i, 11);
    ctx.globalAlpha = Math.sin(k * Math.PI) * .85;
    ctx.fillStyle = i % 2 ? FOLLOW_PINK : '#ffc2e0';
    followHeart(ctx, f.x + (hash(i, 12) - .5) * 44 + Math.sin(t * 3 + i) * 5, f.y - h * (.45 + .4 * hash(i, 13)) - k * 40, 4 + hash(i, 14) * 3);
  }
  ctx.globalAlpha = 1;
  pennant(ctx, f.x - f.facing * 6, f.y - h - 6, t, num);
  // Dust at the heels while they trot.
  if (f.walk > 0) {
    for (let i = 0, m = n(4); i < m; i++) {
      const k = cycle(t, 3, i, 6);
      ctx.globalAlpha = (1 - k) * .45;
      glow(ctx, f.x - f.facing * (8 + k * 22) + (hash(i, 7) - .5) * 10, f.y - 4 - k * 8, 6 + k * 8, '214,200,226');
    }
  }
  // A small bubble now and then.
  const phase = (t * .9) % 2;
  const fr = phase % 1;
  if (fr < .6) {
    const text = FOLLOW_LINES[Math.floor(phase)];
    ctx.globalAlpha = Math.min(1, fr / .08, (.6 - fr) / .1);
    // The words are a cached stamp; their width (known once laid out) sizes the bubble.
    const tw = FOLLOW_TEXT_W[text];
    const w = tw + 14;
    const bx = f.x + f.facing * 52, by = f.y - h - 66;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(bx - w / 2, by - 11, w, 22, 11); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bx - f.facing * 8, by + 9); ctx.lineTo(bx - f.facing * 16, by + 18); ctx.lineTo(bx - f.facing * 2, by + 10); ctx.fill();
    stampText(ctx, text, bx, by + 1, 13, FOLLOW_PINK, '', 800);
  }
  ctx.restore();
}
function applyFollow(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // The flag is planted: it drops in from above and bounces, with a pink spark.
  const k = Math.min(1, age / .25);
  const drop = (1 - k) * (1 - k) * 60;
  const bounce = 1 + Math.sin(k * Math.PI) * .25;
  ctx.save();
  ctx.globalAlpha = 1 - Math.max(0, (age - .35) / .25);
  pennant(ctx, e.x, e.y - 186 - drop, age, 0, bounce);
  burst(age, 41, { n: n(12), speed: [70, 180], life: .55, gravity: 220 }, (x, y, kk, i) => {
    ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? FOLLOW_PINK : '#ffc2e0';
    if (i % 3 === 0) sparkle(ctx, x, y, 6 * (1 - kk)); else followHeart(ctx, x, y, 5 * (1 - kk * .5));
  }, e.x, e.y - 186);
  ctx.restore();
}
function expireFollow(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // Time's up: the flag pops into pink sparks.
  ctx.save();
  ctx.fillStyle = FOLLOW_PINK;
  ctx.globalAlpha = 1 - Math.min(1, age / .5);
  burst(age, 43, { n: n(10), speed: [40, 120], life: .5, gravity: -40 }, (x, y, k) => sparkle(ctx, x, y, 6 * (1 - k)), e.x, e.y - 206);
  ctx.restore();
}
/* ---------- 部下 badge: a small pink pin with 「部」 on the chest; hidden while the flag is up ---------- */
function auraBadge(ctx: CanvasRenderingContext2D, f: Fighter, left: number, t: number): void {
  if (f.mods.some(m => m.kind === 'follow' && m.left > 0)) return;
  const h = bodyH(f);
  ctx.save();
  ctx.globalAlpha = Math.min(1, left / .4) * (.85 + .15 * Math.sin(t * 4));
  const x = f.x + f.facing * 6, y = f.y - h * .62;
  ctx.fillStyle = '#2a0f22';
  ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
  ctx.fillStyle = FOLLOW_PINK;
  ctx.beginPath(); ctx.arc(x, y, 7.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  glyph(ctx, '部', x, y, 10);
  ctx.restore();
}

/* ---------- 混乱 · 害羞 (MASKING 可爱鉴定): cheeks gone pink, a slow puff of pink motes, two small gold hearts
   drifting round the head — the same 混乱, worn as a blush instead of stars and question marks ---------- */
const BLUSH = ['#ff9ec4', '#ffc2da', '#ffffff'] as const;
function auraBlush(ctx: CanvasRenderingContext2D, f: Fighter, left: number, t: number): void {
  const h = bodyH(f);
  const fade = Math.min(1, left / .3);
  ctx.save();
  // The cheeks: two soft pink glows on the face, breathing.
  ctx.globalAlpha = fade * (.42 + .1 * Math.sin(t * 6));
  const fy = f.y - h * .845;
  glow(ctx, f.x + f.facing * 9, fy, 9, '255,128,170');
  glow(ctx, f.x - f.facing * 3, fy + 1, 7, '255,128,170');
  // Pink motes rising off the head, slow.
  for (let i = 0, m = n(8); i < m; i++) {
    const k = cycle(t, .7, i, 21);
    ctx.globalAlpha = fade * (1 - k) * .8;
    ctx.fillStyle = BLUSH[i % 3];
    const x = f.x + (hash(i, 22) - .5) * 40 + Math.sin(t * 2 + i) * 5;
    const y = f.y - h * (.78 + .2 * hash(i, 23)) - k * 40;
    if (i % 3 === 2) sparkle(ctx, x, y, 4.5 * (1 - k * .5)); else dot(ctx, x, y, 2.2);
  }
  // Two gold hearts drifting round the head.
  for (let i = 0; i < 2; i++) {
    const a = t * 1.8 + i * Math.PI;
    const depth = Math.sin(a);
    ctx.globalAlpha = fade * (.6 + depth * .3);
    ctx.fillStyle = '#EEBB44';
    followHeart(ctx, f.x + Math.cos(a) * 26, f.y - h - 6 + depth * 6, 5.5 + depth);
  }
  ctx.restore();
}
function applyBlush(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // The moment it lands: a puff of pink and gold hearts off the head.
  ctx.save();
  burst(age, 27, { n: n(14), speed: [60, 170], life: .55, gravity: -60, drag: .3 }, (x, y, k, i) => {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = i % 3 === 0 ? '#EEBB44' : BLUSH[i % 2];
    if (i % 3 === 0) followHeart(ctx, x, y, 6 * (1 - k * .4)); else dot(ctx, x, y, 2.4);
  }, e.x, e.y - 178);
  ctx.restore();
}

/* ---------- 定身 · 手铐 (花园多惠 花园警察，出动！): a pair of silver cuffs with little rabbit ears on the wrists,
   and the red and blue of the police lights taking turns over the head — the same 定身, worn as an arrest ---------- */
function cuffRing(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.lineWidth = 4.4;
  ctx.strokeStyle = '#3a3f4c';
  ctx.beginPath(); ctx.ellipse(x, y, 6.2, 7.2, 0, 0, TAU); ctx.stroke();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#e4e8f0';
  ctx.beginPath(); ctx.ellipse(x, y, 6.2, 7.2, 0, 0, TAU); ctx.stroke();
  // Two rabbit ears on top of each cuff.
  ctx.fillStyle = '#e4e8f0';
  for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + k * 2.6, y - 10.5, 1.7, 3.8, k * .25, 0, TAU); ctx.fill(); }
}
function auraCuffs(ctx: CanvasRenderingContext2D, f: Fighter, left: number, t: number): void {
  const h = bodyH(f);
  const fade = Math.min(1, left / .25);
  ctx.save();
  ctx.globalAlpha = fade;
  const y = f.y - h * .47, x = f.x + f.facing * 8;
  // The chain, then the two cuffs.
  ctx.fillStyle = '#c9ced8';
  for (let i = 1; i < 4; i++) dot(ctx, x + f.facing * (3 + i * 3.2), y + 1 + Math.sin(i * 1.3 + t * 3) * .6, 1.3);
  cuffRing(ctx, x, y);
  cuffRing(ctx, x + f.facing * 16, y + 1.5);
  ctx.fillStyle = '#ffffff';
  if (Math.floor(t * 2) % 2 === 0) sparkle(ctx, x + f.facing * 20, y - 6, 3);
  // The lights over the head.
  const red = Math.floor(t * 6) % 2 === 0;
  const hy = f.y - h - 10;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = fade * .7;
  glow(ctx, f.x - 8, hy, red ? 13 : 6, '255,58,74');
  glow(ctx, f.x + 8, hy, red ? 6 : 13, '58,120,255');
  ctx.restore();
}
function applyCuffs(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // Click: a red and blue flash at the wrists and a burst of glints.
  const y = e.y - 190 * .47;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const k = Math.min(1, age / .5);
  ctx.globalAlpha = (1 - k) * .8;
  glow(ctx, e.x - 10, y, 22 + k * 30, '255,58,74');
  glow(ctx, e.x + 10, y, 22 + k * 30, '58,120,255');
  ctx.globalCompositeOperation = 'source-over';
  burst(age, 61, { n: n(10), speed: [60, 180], life: .45, drag: .3 }, (x, yy, q, i) => {
    ctx.globalAlpha = 1 - q;
    ctx.fillStyle = i % 2 ? '#ffffff' : '#c9ced8';
    if (i % 3 === 0) sparkle(ctx, x, yy, 5 * (1 - q)); else dot(ctx, x, yy, 2);
  }, e.x, y);
  ctx.restore();
}
function expireCuffs(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // Released: the two cuffs spring apart and fade.
  const y = e.y - 190 * .47;
  const k = Math.min(1, age / .5);
  ctx.save();
  ctx.globalAlpha = 1 - k;
  cuffRing(ctx, e.x - k * 30, y - k * 18 + k * k * 40);
  cuffRing(ctx, e.x + k * 30, y - k * 14 + k * k * 40);
  ctx.restore();
}

/* ---------- 今井莉莎's two looks ----------
   'lisa-cat' (混乱 from 银猫扑脸): the cat itself is an effect on the head (render/lisaFx.ts lisa-cling); this is
   the mess it makes — silver fur tufts drifting off the head and two little gold stars wheeling round it.
   'lisa-wasabi' (烧焦 from 特制曲奇·隐藏风味): the body washed pale green, curls of green steam off the head and
   a cold tear now and then — mustard, not fire. */
const FUR = ['#c9c6d6', '#ece9f4', '#a8a4ba'] as const;
function auraCatMess(ctx: CanvasRenderingContext2D, f: Fighter, left: number, t: number): void {
  const h = bodyH(f);
  const fade = Math.min(1, left / .2);
  ctx.save();
  for (let i = 0, m = n(7); i < m; i++) {
    const k = cycle(t, .9, i, 31);
    ctx.globalAlpha = fade * (1 - k) * .85;
    ctx.fillStyle = FUR[i % 3];
    const x = f.x + (hash(i, 32) - .5) * 50 + Math.sin(t * 3 + i) * 8;
    const y = f.y - h * (.8 + .15 * hash(i, 33)) + k * 30;
    dot(ctx, x, y, 2.6 * (1 - k * .4));
  }
  for (let i = 0; i < 2; i++) {
    const a = t * 3.2 + i * Math.PI;
    ctx.globalAlpha = fade * (.55 + Math.sin(a) * .3);
    ctx.fillStyle = '#ffd56a';
    sparkle(ctx, f.x + Math.cos(a) * 30, f.y - h * .9 + Math.sin(a) * 6, 5);
  }
  ctx.restore();
}
function applyCatMess(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // The pounce: a puff of fur off the head.
  ctx.save();
  burst(age, 35, { n: n(10), speed: [60, 180], life: .5, gravity: 160, drag: .3 }, (x, y, q, i) => {
    ctx.globalAlpha = 1 - q;
    ctx.fillStyle = FUR[i % 3];
    dot(ctx, x, y, 3.2 * (1 - q * .5));
  }, e.x, e.y - 165);
  ctx.restore();
}
const WASABI_BODY: BodyLook = { washes: [{ tint: '#9fdc5a', alpha: .3 }] };
function auraWasabi(ctx: CanvasRenderingContext2D, f: Fighter, left: number, t: number): void {
  const h = bodyH(f);
  const fade = Math.min(1, left / .3);
  ctx.save();
  // Steam curling up off the head and out of the ears.
  for (let i = 0, m = n(8); i < m; i++) {
    const k = cycle(t, 1.1, i, 41);
    const side = i % 2 ? 1 : -1;
    ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .45;
    glow(ctx, f.x + side * (10 + k * 22) + Math.sin(t * 4 + i) * 4, f.y - h * .86 - k * 46, 7 + k * 12, '143,209,79');
  }
  // Now and then a tear.
  const k = cycle(t, .8, 0, 43);
  ctx.globalAlpha = fade * (1 - k) * .9;
  ctx.fillStyle = '#bfe6ff';
  dot(ctx, f.x + f.facing * 10 + f.facing * k * 16, f.y - h * .83 + k * 10, 2.6);
  ctx.restore();
}
function applyWasabi(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // The green rush: one quick puff over the whole body.
  ctx.save();
  const k = Math.min(1, age / .5);
  ctx.globalAlpha = (1 - k) * .5;
  glow(ctx, e.x, e.y - 100, 60 + k * 50, '143,209,79');
  ctx.restore();
}

/* 上原绯玛丽 (game/himari.ts):
   'himari-shake' (混乱 from 摇匀一杯摩卡): a latte-art swirl turning over the head, two coffee beans orbiting it.
   'himari-awkward' (定身 from 一呼零应): 尴尬到石化 — the body goes grey stone with cracks across it, a sweat drop by the
     face; when it lifts the stone breaks off in chips and dust. (The empty reply bubble is an effect, himariFx.ts.)
   'himari-calorie' (减速 from 热量全部送给你): heavy — a dust ring pressed into the floor at the feet, little chevrons
     and pink-brown hearts sinking down the body. */
function auraShake(ctx: CanvasRenderingContext2D, f: Fighter, left: number, t: number): void {
  const h = bodyH(f);
  const fade = Math.min(1, left / .2);
  const cx = f.x, cy = f.y - h - 14;
  ctx.save();
  ctx.globalAlpha = fade * .95;
  ctx.fillStyle = '#8a5a3a';
  ctx.beginPath(); ctx.ellipse(cx, cy, 20, 7, 0, 0, TAU); ctx.fill();
  // The swirl: a cream spiral drawn as short arcs, turning.
  ctx.strokeStyle = '#fff3df';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 18; i++) {
    const a = t * 5 + i * .55, r = 2 + i * .9;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * .34;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.stroke();
  for (let i = 0; i < 2; i++) {
    const a = -t * 3 + i * Math.PI;
    ctx.fillStyle = '#6b3f25';
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 28, cy - 2 + Math.sin(a) * 6, 4, 2.8, a, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function applyShake(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  burst(age, 81, { n: n(10), speed: [60, 170], life: .5, gravity: 200, drag: .3 }, (x, y, q, i) => {
    ctx.globalAlpha = 1 - q;
    ctx.fillStyle = i % 3 ? '#fff3df' : '#e9c39a';
    dot(ctx, x, y, 3.4 * (1 - q * .5));
  }, e.x, e.y - 170);
  ctx.restore();
}
const STONE_BODY: BodyLook = {
  outline: '#ece8f2',
  washes: [
    { tint: '#aaa5b2', alpha: .66 },
    { tint: '#ffffff', alpha: .08, mode: 'lighter' },
  ],
};
/** Crack lines across the stone, fixed per body (so they do not crawl), drawn over the torso and the face. */
const CRACKS: readonly (readonly [number, number])[][] = [
  [[-.02, .9], [.05, .84], [-.01, .78], [.06, .72]],
  [[-.1, .6], [-.03, .55], [-.08, .48], [0, .42], [-.04, .36]],
  [[.08, .64], [.13, .58], [.09, .52]],
];
function auraAwkward(ctx: CanvasRenderingContext2D, f: Fighter, left: number, t: number): void {
  const h = bodyH(f);
  const fade = Math.min(1, left / .15);
  ctx.save();
  ctx.strokeStyle = '#4b4652';
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = fade * .85;
  for (const line of CRACKS) {
    ctx.beginPath();
    line.forEach(([x, y], i) => {
      const px = f.x + x * h * f.facing, py = f.y - y * h;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    });
    ctx.stroke();
  }
  // The sweat drop slides a little and starts again.
  const k = (t * .8) % 1;
  ctx.globalAlpha = fade * (1 - k * .5) * .95;
  ctx.fillStyle = '#bfe6ff';
  const x = f.x - f.facing * 22, y = f.y - h * .86 + k * 10;
  ctx.beginPath();
  ctx.moveTo(x, y - 10); ctx.quadraticCurveTo(x + 7, y - 1, x, y + 6); ctx.quadraticCurveTo(x - 7, y - 1, x, y - 10);
  ctx.fill();
  ctx.restore();
}
function applyAwkward(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // Turning to stone: a grey flash down the body.
  ctx.save();
  const k = Math.min(1, age / .3);
  ctx.globalAlpha = (1 - k) * .45;
  glow(ctx, e.x, e.y - 100 + k * 40, 70, '200,196,208');
  ctx.restore();
}
function expireAwkward(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // The stone breaks off: grey chips knocked off and a puff of dust.
  ctx.save();
  burst(age, 83, { n: n(12), speed: [80, 230], life: .55, gravity: 1000, angle: -Math.PI / 2, spread: Math.PI * 1.5 }, (x, y, k, i) => {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = i % 2 ? '#c9c4d0' : '#8c8696';
    tri(ctx, x, y, 3 + hash(i, 84) * 4, i + k * 8);
  }, e.x, e.y - 100);
  burst(age, 86, { n: n(8), speed: [40, 120], life: .6, drag: .2 }, (x, y, k) => {
    ctx.globalAlpha = (1 - k) * .5;
    glow(ctx, x, y, 10 + k * 14, '210,206,216');
  }, e.x, e.y - 40);
  ctx.restore();
}
const CALORIE = ['#FF9999', '#c98a6a', '#e6a27e'] as const;
function calorieHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * .9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * .1, x - s * .6, y - s * 1.2, x, y - s * .35);
  ctx.bezierCurveTo(x + s * .6, y - s * 1.2, x + s * 1.4, y - s * .1, x, y + s * .9);
  ctx.fill();
}
function auraCalorie(ctx: CanvasRenderingContext2D, f: Fighter, left: number, t: number): void {
  const h = bodyH(f);
  const fade = Math.min(1, left / .25);
  ctx.save();
  // Pressed into the floor: a flat dust ring that thumps on every step of the clock.
  const thump = 1 + Math.abs(Math.sin(t * 4)) * .12;
  ctx.globalAlpha = fade * .45;
  ctx.strokeStyle = '#b08a6a';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(f.x, f.y - 2, 34 * thump, 7 * thump, 0, 0, TAU); ctx.stroke();
  for (let i = 0, m = n(5); i < m; i++) {
    const k = cycle(t, .55, i, 87);
    ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .8;
    ctx.fillStyle = CALORIE[i % 3];
    calorieHeart(ctx, f.x + (hash(i, 88) - .5) * 46, f.y - h * (.85 - k * .75), 4 + hash(i, 89) * 2);
  }
  // Two little chevrons sinking at the hips: heavier.
  ctx.strokeStyle = '#c98a6a';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const k = cycle(t, .9, i, 90);
    const x = f.x + (i ? 30 : -30), y = f.y - h * .55 + k * 40;
    ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .85;
    ctx.beginPath(); ctx.moveTo(x - 6, y - 4); ctx.lineTo(x, y + 2); ctx.lineTo(x + 6, y - 4); ctx.stroke();
  }
  ctx.restore();
}
function applyCalorie(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  burst(age, 91, { n: n(8), speed: [50, 140], life: .55, gravity: 380, angle: -Math.PI / 2, spread: 2 }, (x, y, q, i) => {
    ctx.globalAlpha = 1 - q;
    ctx.fillStyle = CALORIE[i % 3];
    calorieHeart(ctx, x, y, 5);
  }, e.x, e.y - 150);
  ctx.restore();
}

/* 桐谷透子 (game/toko.ts): 'toko-mud' (减速 from 师父示范一下's own note): the muddy sound stuck to their feet — a grey-brown
   puddle that wobbles, and a few slow drips coming off the legs. */
const MUD_TONES = ['#8a7a6a', '#5d5148', '#b3a596'];
function auraMud(ctx: CanvasRenderingContext2D, f: Fighter, left: number, t: number): void {
  const h = bodyH(f);
  const fade = Math.min(1, left / .25);
  ctx.save();
  ctx.globalAlpha = fade * .7;
  ctx.fillStyle = MUD_TONES[1];
  ctx.beginPath(); ctx.ellipse(f.x, f.y - 2, 38 + Math.sin(t * 5) * 4, 7 + Math.sin(t * 7) * 1.2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = MUD_TONES[0];
  ctx.beginPath(); ctx.ellipse(f.x - 4, f.y - 3, 24 + Math.sin(t * 6 + 1) * 3, 4.5, 0, 0, TAU); ctx.fill();
  for (let i = 0, m = n(5); i < m; i++) {
    const k = cycle(t, .8, i, 95);
    ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .85;
    ctx.fillStyle = MUD_TONES[i % 3];
    dot(ctx, f.x + (hash(i, 96) - .5) * 44, f.y - h * .32 * (1 - k) - 4, 3.5 - k * 1.5);
  }
  ctx.restore();
}

/* 'chisato-doodle' (混乱 from 这明明是狗): crayon question marks over the head and a tiny 珍妮弗 trotting round them
   (「！？」 on 丸山彩). Drawn in chisatoFx.ts with the rest of the crayon. */
function auraDoodle(ctx: CanvasRenderingContext2D, f: Fighter, _left: number, t: number, images?: ImageCache): void {
  drawDoodleDizzy(ctx, f.x, f.y - bodyH(f) - 14, t, f.data.id === 'aya', images);
}
function applyDoodle(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  drawDoodleLand(ctx, e.x, e.y - 175, age);
}


/* ---------- 沉默 (neutral): the sound taken out of them — a few small rests (休止符) drifting down past the face
   and fading, soft grey motes, and a faint hush glow over the mouth. Thin strokes, never an outlined icon ---------- */
const HUSH = ['#eef2f8', '#c9d2e0', '#a9b4c6'] as const;
/** One quarter rest, about `s` tall, drawn as a thin zigzag with a hooked foot. */
function rest(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x - s * .12, y - s * .5);
  ctx.lineTo(x + s * .18, y - s * .2);
  ctx.lineTo(x - s * .14, y + s * .05);
  ctx.lineTo(x + s * .16, y + s * .3);
  ctx.quadraticCurveTo(x - s * .22, y + s * .22, x - s * .02, y + s * .52);
  ctx.stroke();
}
function auraHush(ctx: CanvasRenderingContext2D, f: Fighter, left: number, t: number): void {
  const h = bodyH(f);
  const fade = Math.min(1, left / .3);
  ctx.save();
  // The hush over the mouth: a cool, low glow that breathes slowly.
  ctx.globalAlpha = fade * (.22 + .06 * Math.sin(t * 3));
  glow(ctx, f.x + f.facing * 8, f.y - h * .82, 16, '200,212,232');
  // Rests sinking past the face, slow, each one fading as it falls.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.8;
  for (let i = 0, m = n(4); i < m; i++) {
    const k = cycle(t, 1.6, i, 41);
    ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .85;
    ctx.strokeStyle = HUSH[i % 3];
    const x = f.x + (hash(i, 42) - .5) * 50;
    rest(ctx, x, f.y - h * (1.02 - .3 * k), 9 + hash(i, 43) * 4);
  }
  // Grey motes, falling rather than rising: the opposite of a shout.
  for (let i = 0, m = n(6); i < m; i++) {
    const k = cycle(t, 1.1, i, 44);
    ctx.globalAlpha = fade * (1 - k) * .6;
    ctx.fillStyle = HUSH[(i + 1) % 3];
    dot(ctx, f.x + (hash(i, 45) - .5) * 44, f.y - h * (.95 - .35 * k), 1.8);
  }
  ctx.restore();
}
function applyHush(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // The moment it lands: two rings close in on the mouth (the sound sucked away), and a puff of grey motes.
  ctx.save();
  const y = e.y - 150;
  ctx.strokeStyle = '#e6ecf5';
  for (let i = 0; i < 2; i++) {
    const k = Math.min(1, Math.max(0, (age - i * .08) / .3));
    if (k <= 0 || k >= 1) continue;
    ctx.globalAlpha = (1 - k) * .75;
    ctx.lineWidth = 2.2 * (1 - k) + .6;
    ctx.beginPath(); ctx.arc(e.x, y, 54 * (1 - k) + 6, 0, TAU); ctx.stroke();
  }
  burst(age, 46, { n: n(12), speed: [40, 120], life: .55, gravity: 70, drag: .4 }, (x, yy, k, i) => {
    ctx.globalAlpha = (1 - k) * .8;
    ctx.fillStyle = HUSH[i % 3];
    dot(ctx, x, yy, 2.2);
  }, e.x, y);
  ctx.restore();
}


/* ---------- 山吹沙绫's two looks ----------
   'sleepy' (定身 from 乖，摸摸头): patted off to sleep — two or three loose hand-drawn z's drifting up off the head,
   a few pale bubbles, and a faint warm glow on the body; when it lifts, the bubbles pop.
   'saaya-toast' (烧焦 from 唐突喷火, and the look on the way out of the oven): the body toasted a warm brown under a
   gold rim, bread crumbs dropping off it and a wisp of steam off the head — bread, not a house fire. */
/** One loose z: three strokes with a little wobble, as if written by hand. */
function sleepyZ(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, tilt: number): void {
  ctx.beginPath();
  ctx.moveTo(x - s * .5, y - s * .45 + tilt);
  ctx.quadraticCurveTo(x, y - s * .58, x + s * .5, y - s * .5);
  ctx.lineTo(x - s * .45, y + s * .42);
  ctx.quadraticCurveTo(x + s * .05, y + s * .55 - tilt, x + s * .52, y + s * .46);
  ctx.stroke();
}
function auraSleepy(ctx: CanvasRenderingContext2D, f: Fighter, left: number, t: number): void {
  const h = bodyH(f);
  const fade = Math.min(1, left / .25);
  ctx.save();
  // A faint warm glow on the body, breathing slowly (asleep).
  ctx.globalAlpha = fade * (.13 + .05 * Math.sin(t * 2.4));
  glow(ctx, f.x, f.y - h * .5, h * .4, '255,214,120');
  // The z's: a big Z then two small ones, each popping in, swaying side to side as it floats up and tilts.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    // Evenly spaced, so one is always on its way up.
    const k = ((t * .5 + i / 3) % 1 + 1) % 1;
    const big = i === 0 ? 1.4 : 1;
    const pop = Math.min(1, k / .12);
    const s = (8 + k * 8) * big * (pop < 1 ? .6 + .6 * pop - .2 * pop * pop : 1);
    const x = f.x + f.facing * (14 + k * 30) + Math.sin(k * 9 + i * 2) * 8 * k;
    const y = f.y - h - 4 - k * 52;
    const a = fade * Math.min(1, k / .12) * (1 - k) ** .6;
    ctx.globalAlpha = a * .55;
    glow(ctx, x, y, s * 1.7, '150,140,235');
    ctx.globalAlpha = a * .95;
    ctx.strokeStyle = i === 0 ? '#f6f2ff' : '#e2dcff';
    ctx.lineWidth = 2.2 + s * .12;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 2.2 + i) * .3 - .15 * f.facing);
    sleepyZ(ctx, 0, 0, s, Math.sin(t * 3 + i) * 1.2);
    ctx.restore();
  }
  // The nose bubble: swells and shrinks with each breath, and every few breaths it pops and starts again.
  const breath = cycle(t, .42, 0, 53);
  const bx = f.x + f.facing * 17, by = f.y - h * .83;
  if (breath < .86) {
    const r = 3 + 9 * Math.sin(breath / .86 * Math.PI * 1.5) ** 2 * (.5 + breath * .6);
    soap(ctx, bx + f.facing * r * .7, by + r * .2, r, fade * .9);
  } else {
    const z = (breath - .86) / .14;
    ctx.globalAlpha = fade * (1 - z);
    ctx.fillStyle = '#ffffff';
    for (let j = 0; j < 4; j++) dot(ctx, bx + f.facing * 6 + Math.cos(j * 1.6) * (4 + z * 9), by + Math.sin(j * 1.6) * (4 + z * 9), 1.6);
  }
  // Two little drifting bubbles.
  for (let i = 1, m = n(3); i < m; i++) {
    const k = cycle(t, .6, i, 54);
    soap(ctx, bx + f.facing * (6 + Math.sin(t * 1.7 + i) * 5), by - 10 - k * 34, 2 + k * 3, fade * (1 - k) * .7);
  }
  ctx.restore();
}
function applySleepy(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // Nodding off: a soft warm puff over the head and a few bubbles.
  const y = e.y - 175;
  ctx.save();
  const k = Math.min(1, age / .55);
  ctx.globalAlpha = (1 - k) * .45;
  glow(ctx, e.x, y, 30 + k * 30, '255,222,140');
  burst(age, 57, { n: n(6), speed: [30, 80], life: .55, gravity: -60, drag: .4 }, (x, yy, q) => {
    soap(ctx, x, yy, 4 * (1 - q * .4), (1 - q) * .8);
  }, e.x, y);
  ctx.restore();
}
function expireSleepy(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // Awake: the bubbles pop into little white dots.
  const y = e.y - 170;
  ctx.save();
  burst(age, 59, { n: n(8), speed: [60, 150], life: .4, drag: .3 }, (x, yy, q) => {
    ctx.globalAlpha = 1 - q;
    ctx.fillStyle = '#ffffff';
    dot(ctx, x, yy, 2.2 * (1 - q * .5));
  }, e.x, y);
  ctx.restore();
}
const CRUMB = ['#c98a3e', '#e8b35a', '#a8662e'] as const;
const TOAST_BODY: BodyLook = { outline: '#ffd25a', washes: [{ tint: '#b06a2c', alpha: .3 }] };
function auraToast(ctx: CanvasRenderingContext2D, f: Fighter, left: number, t: number): void {
  const h = bodyH(f);
  const fade = Math.min(1, left / .3);
  ctx.save();
  // A warm haze, low.
  ctx.globalAlpha = fade * (.14 + .04 * Math.sin(t * 6));
  glow(ctx, f.x, f.y - h * .45, h * .38, '255,170,80');
  // Crumbs dropping off the body.
  for (let i = 0, m = n(8); i < m; i++) {
    const k = cycle(t, 1.1, i, 61);
    ctx.globalAlpha = fade * (1 - k * k) * .95;
    ctx.fillStyle = CRUMB[i % 3];
    const x = f.x + (hash(i, 62) - .5) * 44 + Math.sin(t * 5 + i) * 2;
    const y = f.y - h * (.25 + .6 * hash(i, 63)) + k * h * .3;
    dot(ctx, x, y, 2 + hash(i, 64) * 1.6);
  }
  // A glint running round the golden crust now and then.
  {
    const k = cycle(t, .7, 0, 66);
    if (k < .3) {
      ctx.globalAlpha = fade * Math.sin(k / .3 * Math.PI);
      ctx.fillStyle = '#fff2b0';
      sparkle(ctx, f.x + (hash(Math.floor(t * .7), 67) - .5) * 40, f.y - h * (.3 + .5 * hash(Math.floor(t * .7), 68)), 5);
    }
  }
  // A wisp of steam off the head.
  for (let i = 0; i < 2; i++) {
    const k = cycle(t, .8, i, 65);
    ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .35;
    glow(ctx, f.x + Math.sin(t * 3 + i * 2) * 6 + (i - .5) * 10, f.y - h - 4 - k * 38, 8 + k * 10, '250,246,238');
  }
  ctx.restore();
}
function applyToast(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  // Toasted: a warm flash over the body and a spray of crumbs.
  ctx.save();
  const k = Math.min(1, age / .5);
  ctx.globalAlpha = (1 - k) * .5;
  glow(ctx, e.x, e.y - 100, 55 + k * 40, '255,190,90');
  burst(age, 67, { n: n(12), speed: [70, 200], life: .55, gravity: 380, drag: .5 }, (x, y, q, i) => {
    ctx.globalAlpha = 1 - q;
    ctx.fillStyle = CRUMB[i % 3];
    dot(ctx, x, y, 2.6 * (1 - q * .4));
  }, e.x, e.y - 110);
  ctx.restore();
}

export const STATUS_MARKS: Record<string, MarkDrawer> = {
  'follow-flag': { aura: auraFollow, apply: applyFollow, expire: expireFollow },
  'recruit-badge': { aura: auraBadge },
  burn: { aura: auraBurn, apply: applyBurn },
  frost: { aura: auraFrost, apply: applyFrost },
  'ice-block': { aura: auraIce, apply: applyIce, expire: expireIce, body: ICE_BODY },
  'dizzy-q': { aura: auraDizzy, apply: applyDizzy },
  hush: { aura: auraHush, apply: applyHush },
  blush: { aura: auraBlush, apply: applyBlush },
  cuffs: { aura: auraCuffs, apply: applyCuffs, expire: expireCuffs },
  'lisa-cat': { aura: auraCatMess, apply: applyCatMess },
  'lisa-wasabi': { aura: auraWasabi, apply: applyWasabi, body: WASABI_BODY },
  'himari-shake': { aura: auraShake, apply: applyShake },
  'himari-awkward': { aura: auraAwkward, apply: applyAwkward, expire: expireAwkward, body: STONE_BODY },
  'himari-calorie': { aura: auraCalorie, apply: applyCalorie },
  'toko-mud': { aura: auraMud },
  'chisato-doodle': { aura: auraDoodle, apply: applyDoodle },
  sleepy: { aura: auraSleepy, apply: applySleepy, expire: expireSleepy },
  'saaya-toast': { aura: auraToast, apply: applyToast, body: TOAST_BODY },
  // 松原花音: lost on her footprints (混乱), stung by her jellyfish (定身). Drawn in kanonFx.ts.
  'kanon-maze': { aura: (ctx, f, left, t) => auraMaze(ctx, f, bodyH(f), left, t), apply: applyMaze },
  'kanon-zap': { aura: (ctx, f, left, t) => auraZap(ctx, f, bodyH(f), left, t), apply: applyZap },
  // 宇田川亚子: put to sleep by her 催眠波 (定身). Drawn in akoFx.ts.
  'ako-hypno': { aura: (ctx, f, left, t) => auraHypno(ctx, f, bodyH(f), left, t), apply: applyHypno },
};

/** Live marks this body wears that the table knows. Older looks (摩卡's bubble, the petals) are not in the
 *  table and keep their own drawing in renderer.ts. */
export function statusMarkOf(mark: string | undefined): MarkDrawer | undefined {
  return mark ? STATUS_MARKS[mark] : undefined;
}

const STATUS_MOD_KINDS = new Set(['burn', 'slow', 'confuse', 'follow', 'recruit', 'silence', 'look']);

/** Every status aura on this body, and whether the slow and the root were drawn here (so the old
 *  petal / heart drawings stay off for them). */
export function drawStatusAuras(ctx: CanvasRenderingContext2D, f: Fighter, t: number, images?: ImageCache): { slow: boolean; root: boolean } {
  let slow = false, root = false;
  for (const m of f.mods) {
    if (m.left <= 0 || !STATUS_MOD_KINDS.has(m.kind)) continue;
    const d = statusMarkOf(m.mark);
    if (!d) continue;
    d.aura(ctx, f, m.left, t, images);
    if (m.kind === 'slow') slow = true;
  }
  if (f.root > 0) {
    const d = statusMarkOf(f.rootMark);
    if (d) { d.aura(ctx, f, f.root, t, images); root = true; }
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
