import type { Effect, Projectile } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, W, clamp } from '../game/constants.ts';
import { BAKE_DING, BAKE_OVEN_SLIDE, BAKE_ROAST_AT, DOUGH_RISE, DOUGH_TOSS, FIRE_MOUTH, FIRE_REACH, OVEN_W, plumeAt } from './clips.ts';
import { TAU, burst, cycle, dot, glow, hash, sparkle } from './fxParticles.ts';

/* 山吹沙绫 — 面包、面粉、烤炉火, drawn like a gag manga. Two registers:
   - the bakery: soft dough that slumps onto the floor and breathes as it rises, flour as fluffy cel clouds, crumbs in
     three bread browns, a golden glossy crust when it bakes, a brick oven (oven.png, or plain shapes while it loads)
     and a little hanging shop sign;
   - the fire: a cel-shaded plume (a thread at her lips blooming into a billow, a big #FFD820 core inside a thick
     #E8501E skin with scalloped tongues that flow toward the tip, licks breaking off), crust-coloured embers, a
     chibi「>3<」face over her head as she breathes in, cartoon black smoke when she runs out.
   Flat fills without outlines read from across the screen. Every shape is one path (the plume has three layers, ~70 points
   each); gradients live only in cached stamps (the dough domes, fxParticles glow). Particle counts are bounded and
   halve in lite mode. */

/** Painted under every body: the shop sign behind her, the flour where the dough lands. */
export const SAAYA_BACK: readonly string[] = ['saaya-sign', 'saaya-splat'];
/** Screen space, behind every body: the bakery's warm light during the super. */
export const SAAYA_SCREEN_BACK: readonly string[] = ['saaya-warm'];

const OVEN_SRC = '/sprites/saaya/oven.png';
/** Where the oven's mouth sits on oven.png (facing right): fraction of its width across, and up from the floor. */
const MOUTH_U = .63;
const MOUTH_V = .18;
/** Once she stops, the plume shrinks back into her mouth over this long (game/saaya.ts FIRE_FADE). */
const FIRE_FADE = .2;
/** A baked dough swells golden this long before it pops (game/saaya.ts DOUGH_BAKE_POP). */
const BAKE_SWELL = .18;

const CORE = '#FFD820';
const SKIN = '#E8501E';
const HOT = '#FFF6C2';
const CRUMB = ['#c98a3e', '#e8b35a', '#a8662e'] as const;
const EMBER = ['#ffd27a', '#e8a24a', '#c98a3e'] as const;
const FLOUR = '#fbf6ea';
const FLOUR_RGB = '250,246,236';
const INK = '#5a2e1e';

let lite = false;
const n = (full: number) => (lite ? Math.ceil(full / 2) : full);
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
/** Overshoot ease: past 1 and back, for things that pop in. */
const pop = (t: number) => { const k = clamp(t, 0, 1); return 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2; };

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}
function canvas(w: number, h: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c.getContext('2d');
}
/** A flat star (the cartoon impact flash): `points` spikes, inner radius `inner` × r. */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, points: number, inner: number, rot: number): void {
  if (!(r > 0)) return;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + i * Math.PI / points, rr = i % 2 ? r * inner : r;
    if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}
/** A fluffy cel cloud: three or four overlapping circles in one path, one fill (current fillStyle). */
function fluff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number): void {
  if (!(r > .5)) return;
  ctx.beginPath();
  for (let j = 0; j < 4; j++) {
    const cx = x + (hash(seed, j) - .5) * r * 1.3, cy = y + (hash(seed, j + 4) - .5) * r * .7 - (j === 3 ? r * .35 : 0);
    const rr = r * (.5 + .3 * hash(seed, j + 8));
    ctx.moveTo(cx + rr, cy);
    ctx.arc(cx, cy, rr, 0, TAU);
  }
  ctx.fill();
}
/** A flame lick: a teardrop pointing up, flat. */
function lick(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, lean: number): void {
  if (!(r > .5)) return;
  ctx.beginPath();
  ctx.moveTo(x + lean * r, y - r * 2.2);
  ctx.bezierCurveTo(x + r * .9, y - r * .9, x + r * 1.05, y + r * .2, x, y + r);
  ctx.bezierCurveTo(x - r * 1.05, y + r * .2, x - r * .9, y - r * .9, x + lean * r, y - r * 2.2);
  ctx.fill();
}

/* ---- the fire: a cel plume ---- */

/** Points per edge of the plume, and round the billow at its tip. */
const EDGE_N = 30;
const CAP_N = 9;
// Drawing is synchronous; reuse the path workspace for all three flame layers.
const plumePoints = new Float64Array((EDGE_N * 2 + CAP_N - 1) * 2);
/** One edge point of the plume: `side` -1 is the top, 1 the bottom; `k` the layer's share of the half-height;
 *  `tongue` how far the scalloped tongues stick out (0 for the smooth core). Tongues flow toward the tip with time
 *  and stand taller on the top edge (fire rises). The whole body drifts up a little more toward the tip. */
function edge(u: number, len: number, age: number, side: number, k: number, tongue: number, offset: number): void {
  const { dy, half } = plumeAt(u, len);
  const boil = 1 + .09 * Math.sin(u * 13 - age * 17 + side) + .05 * Math.sin(u * 27 + age * 31 + side * 2);
  const wave = Math.max(0, Math.sin(TAU * (u * 5.5 - age * 2.6) + (side > 0 ? 1.7 : 0)));
  const spike = tongue * wave ** 3 * Math.min(1, u * 4) * (side < 0 ? 1.25 : .8);
  const r = half * k * boil * (1 + spike);
  // A tongue also sweeps back toward her, like flame streaming off a moving body.
  plumePoints[offset] = u * len - spike * half * .35;
  plumePoints[offset + 1] = dy - half * .12 * u + side * r;
}
function plumePath(ctx: CanvasRenderingContext2D, len: number, age: number, k: number, tongue: number, end: number): void {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  let count = 0;
  for (let i = 1; i <= EDGE_N; i++, count += 2) edge(end * i / EDGE_N, len, age, -1, k, tongue, count);
  // Round the billow: a half circle at the tip, bumpy where the tongues are.
  const tip = plumeAt(end, len);
  const cx = end * len, cy = tip.dy - tip.half * .12 * end;
  for (let j = 1; j < CAP_N; j++) {
    const a = -Math.PI / 2 + Math.PI * j / CAP_N;
    const bump = 1 + .1 * Math.sin(age * 23 + j * 2.1) + (tongue ? .18 * Math.max(0, Math.sin(age * 9 + j * 1.9)) ** 2 : 0);
    const r = tip.half * k * bump;
    plumePoints[count++] = cx + Math.cos(a) * r * .75;
    plumePoints[count++] = cy + Math.sin(a) * r;
  }
  for (let i = EDGE_N; i >= 1; i--, count += 2) edge(end * i / EDGE_N, len, age, 1, k, tongue, count);
  // Smooth through the midpoints: each point is the control of a curve between its neighbours' midpoints.
  for (let i = 0; i < count; i += 2) {
    const x = plumePoints[i], y = plumePoints[i + 1];
    const nx = i + 2 < count ? plumePoints[i + 2] : 0, ny = i + 2 < count ? plumePoints[i + 3] : 0;
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  ctx.closePath();
}
/** The plume from the lips at the origin along +x (facing applied by the caller), `len` long. `age` boils it. */
function drawPlume(ctx: CanvasRenderingContext2D, len: number, age: number): void {
  if (!(len > 2)) return;
  // The light it throws: one warm glow over the billow.
  const tip = plumeAt(1, len);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= .22;
  glow(ctx, len * .78, tip.dy * .8, tip.half * 1.6, '255,170,60');
  ctx.restore();
  ctx.fillStyle = SKIN;
  plumePath(ctx, len, age, 1, .42, 1);
  ctx.fill();
  ctx.fillStyle = CORE;
  plumePath(ctx, len, age, .66, 0, .93);
  ctx.fill();
  // The white-hot throat at her lips.
  ctx.fillStyle = HOT;
  plumePath(ctx, len, age, .3, 0, .35);
  ctx.fill();
  // Licks breaking off the outer edge, drifting up and out and shrinking.
  const a0 = ctx.globalAlpha;
  for (let i = 0, m = n(6); i < m; i++) {
    const q = cycle(age, 1.5, i, 71);
    const u = .45 + .5 * hash(i, 72);
    const side = i % 3 === 2 ? 1 : -1;
    edge(u, len, age - q * .3, side, 1.05, .2, 0);
    const ex = plumePoints[0], ey = plumePoints[1];
    const { half } = plumeAt(u, len);
    ctx.fillStyle = i % 2 ? SKIN : CORE;
    ctx.globalAlpha = a0 * (1 - q * q);
    lick(ctx, ex - q * 14, ey + side * q * 16 - q * 28, (4 + half * .16) * (1 - q * .7), Math.sin(age * 7 + i) * .3);
  }
  // Crust-coloured embers floating up off it.
  for (let i = 0, m = n(9); i < m; i++) {
    const q = cycle(age, 1.1, i, 73);
    const u = .2 + .8 * hash(i, 74);
    const { dy, half } = plumeAt(u, len);
    ctx.globalAlpha = a0 * (1 - q) * .95;
    ctx.fillStyle = EMBER[i % 3];
    dot(ctx, u * len + Math.sin(age * 5 + i) * 6 - q * 10, dy - half * .8 - q * 46, 2 + hash(i, 75) * 1.6);
  }
  ctx.globalAlpha = a0;
}

/* ---- the dough: a slumped dome, baked once per kind ---- */

/** The stamp is drawn for a dome DOME_RX half-wide and DOME_RY tall, with a skirt flaring to DOME_SKIRT. */
const DOME_RX = 56, DOME_RY = 60, DOME_SKIRT = 76, DOME_RES = 2;
const STAMP_W = DOME_SKIRT * 2 + 4, STAMP_H = DOME_RY + 4;
const domes: (HTMLCanvasElement | null)[] = [];
function domePath(g: CanvasRenderingContext2D): void {
  g.beginPath();
  g.moveTo(-DOME_SKIRT, 0);
  // The skirt: thin at the floor, slumping up into the side.
  g.bezierCurveTo(-60, -1, -57, -8, -55, -20);
  g.bezierCurveTo(-51, -47, -25, -DOME_RY, 0, -DOME_RY);
  g.bezierCurveTo(25, -DOME_RY, 51, -47, 55, -20);
  g.bezierCurveTo(57, -8, 60, -1, DOME_SKIRT, 0);
  g.closePath();
}
/** The dough dome (0 raw: pale cream, flour specks; 1 baked: golden crust, a glossy highlight). Floor at the bottom. */
function dome(baked: boolean): HTMLCanvasElement | null {
  const i = baked ? 1 : 0;
  if (domes[i] !== undefined) return domes[i];
  const g = canvas(STAMP_W * DOME_RES, STAMP_H * DOME_RES);
  if (!g) return (domes[i] = null);
  g.scale(DOME_RES, DOME_RES);
  g.translate(STAMP_W / 2, STAMP_H - 1);
  domePath(g);
  const body = g.createLinearGradient(0, -DOME_RY, 0, 0);
  if (baked) { body.addColorStop(0, '#f2b14c'); body.addColorStop(.55, '#d98a34'); body.addColorStop(1, '#a95f25'); }
  else { body.addColorStop(0, '#fffaf0'); body.addColorStop(.6, '#f8ead0'); body.addColorStop(1, '#ead6b0'); }
  g.fillStyle = body;
  g.fill();
  g.save();
  g.clip();
  // Light from the top left.
  const hi = g.createRadialGradient(-20, -46, 2, -14, -38, 40);
  hi.addColorStop(0, baked ? 'rgba(255,240,190,.9)' : 'rgba(255,255,255,.95)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi;
  g.fillRect(-DOME_SKIRT, -DOME_RY, DOME_SKIRT * 2, DOME_RY);
  // Where it meets the floor it goes into shadow (ambient occlusion), so it sits on the ground.
  const ao = g.createLinearGradient(0, 0, 0, -16);
  ao.addColorStop(0, baked ? 'rgba(90,45,15,.45)' : 'rgba(150,115,70,.38)');
  ao.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = ao;
  g.fillRect(-DOME_SKIRT, -16, DOME_SKIRT * 2, 16);
  if (baked) {
    // A glossy egg-wash streak.
    g.fillStyle = 'rgba(255,250,225,.75)';
    g.beginPath();
    g.ellipse(-22, -44, 13, 4.5, -.45, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(-8, -52, 4, 2, -.2, 0, TAU);
    g.fill();
  } else {
    g.fillStyle = 'rgba(255,255,255,.95)';
    for (let k = 0; k < 14; k++) g.fillRect(-40 + hash(k, 76) * 80, -DOME_RY * (.25 + .65 * hash(k, 77)), 2, 2);
  }
  g.restore();
  return (domes[i] = g.canvas);
}
function drawDough(ctx: CanvasRenderingContext2D, p: Projectile): void {
  const r0 = p.size / 2;
  if (!p.settled) {
    // In the air: a soft ball tumbling, a little flour trailing off it.
    ctx.fillStyle = '#fbefd6';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 13, 11, p.age * 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    dot(ctx, p.x - 4, p.y - 4, 3);
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = .6 - i * .18;
      dot(ctx, p.x - Math.sign(p.vx || 1) * (10 + i * 9), p.y + i * 2, 2);
    }
    return;
  }
  const at = p.age - DOUGH_TOSS;
  const k = clamp(at / DOUGH_RISE, 0, 1);
  // Baking: golden fades in and it swells fast just before it goes.
  const bakeK = p.wave === 1 ? clamp((p.age - (p.ticked ?? p.age)) / BAKE_SWELL, 0, 1) : 0;
  const land = clamp(at / .14, 0, 1);
  // Landing splat (wide and flat, then settling), breathing while it rises, a quiver just before it pops.
  const splat = 1 - land;
  const breathe = Math.sin(at * 6.5) * .07;
  const late = clamp((k - .8) / .2, 0, 1) + bakeK;
  const quiver = late > 0 ? Math.sin(p.age * 70) * 1.8 * late : 0;
  const rx = r0 * (.55 + .45 * ease(k * 1.15)) * (1 + .5 * splat - breathe * .5 + .12 * late) * (1 + .15 * bakeK);
  const ry = r0 * (.34 + .78 * k ** 1.2) * (1 - .55 * splat + breathe + .1 * late) * (1 + .25 * bakeK);
  // Contact shadow, then a dusting of flour round it.
  ctx.save();
  ctx.translate(p.x, FLOOR);
  ctx.scale(1, .2);
  ctx.globalAlpha = .45;
  glow(ctx, 0, 0, rx * 1.55, '70,45,25');
  ctx.globalAlpha = .4;
  glow(ctx, 0, 0, rx * 2, FLOUR_RGB);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  for (let i = 0, m = n(12); i < m; i++) {
    const a = hash(i, 78) * TAU, d = rx * (1.25 + .5 * hash(i, 79));
    ctx.globalAlpha = .75;
    dot(ctx, p.x + Math.cos(a) * d, FLOOR - 1 + Math.sin(a) * d * .14, 1.6);
  }
  ctx.globalAlpha = 1;
  const sx = rx / DOME_RX, sy = ry / DOME_RY;
  const raw = dome(false), golden = dome(true);
  const blit = (st: HTMLCanvasElement | null) => {
    if (st) ctx.drawImage(st, p.x - STAMP_W / 2 * sx + quiver, FLOOR + 1 - (STAMP_H - 1) * sy, STAMP_W * sx, STAMP_H * sy);
  };
  if (bakeK < 1) blit(raw);
  if (bakeK > 0) { ctx.globalAlpha = bakeK; blit(golden); ctx.globalAlpha = 1; }
  // The score on top opens as it rises (a lens of paler crumb inside).
  const open = (2 + 6 * k) * sy;
  const top = FLOOR - ry;
  ctx.fillStyle = bakeK > .5 ? '#ffe7a8' : '#e7c48a';
  ctx.beginPath();
  ctx.moveTo(p.x - rx * .36 + quiver, top + ry * .2);
  ctx.quadraticCurveTo(p.x + quiver, top + ry * .08 - open, p.x + rx * .36 + quiver, top + ry * .2);
  ctx.quadraticCurveTo(p.x + quiver, top + ry * .12 + open * .5, p.x - rx * .36 + quiver, top + ry * .2);
  ctx.fill();
  // Air pockets: little bubbles swell on the surface and pop.
  if (bakeK === 0) {
    for (let i = 0, m = n(3); i < m; i++) {
      const q = cycle(p.age, .7 + i * .15, i, 80);
      const a = (hash(i, 81) - .5) * 2.2;
      const bx = p.x + Math.sin(a) * rx * .78 + quiver, by = FLOOR - Math.cos(a) * ry * .84;
      if (q < .8) {
        const br = 1.5 + 4 * (q / .8);
        ctx.fillStyle = '#e2c99c';
        ctx.beginPath(); ctx.arc(bx + .8, by + 1, br, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill();
      } else {
        const z = (q - .8) / .2;
        ctx.globalAlpha = 1 - z;
        ctx.fillStyle = '#ffffff';
        for (let j = 0; j < 4; j++) dot(ctx, bx + Math.cos(j * 1.6 - 1) * (3 + z * 8), by + Math.sin(j * 1.6 - 1) * (3 + z * 8) - z * 3, 1.8);
        ctx.globalAlpha = 1;
      }
    }
  }
}

/* ---- the oven ---- */

/** The oven as plain shapes (facing right, origin on the floor at its middle) while oven.png loads. */
function ovenShapes(ctx: CanvasRenderingContext2D, w: number): void {
  const h = w * .62;
  ctx.fillStyle = '#9c4b34';
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(-w / 2, -h * .45);
  ctx.ellipse(0, -h * .45, w / 2, h * .55, 0, Math.PI, TAU);
  ctx.lineTo(w / 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#7d3a28';
  ctx.fillRect(-w / 2, -h * .12, w, h * .12);
  const mx = (MOUTH_U - .5) * w, my = -MOUTH_V * w;
  ctx.fillStyle = '#1e1310';
  ctx.beginPath();
  ctx.ellipse(mx, my + 10, w * .12, w * .14, 0, Math.PI, TAU);
  ctx.lineTo(mx + w * .12, my + 24);
  ctx.lineTo(mx - w * .12, my + 24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#3c3d44';
  ctx.fillRect(mx + w * .13, my - w * .1, w * .05, w * .2);
}
function drawOven(ctx: CanvasRenderingContext2D, e: Effect, images: ImageCache | undefined): void {
  const dir = e.dir ?? 1;
  const age = e.age ?? 0;
  const fade = clamp(e.life / .35, 0, 1);
  const roast = e.tx ?? -1;
  const dingAt = BAKE_DING - BAKE_ROAST_AT;
  // Slides in from behind the foe (the side away from her) and lands with a thump.
  const k = ease(age / BAKE_OVEN_SLIDE);
  let x = e.x - dir * (1 - k) * 320;
  let sx = 1, sy = 1;
  const thump = (age - BAKE_OVEN_SLIDE * .8) / .16;
  if (thump > 0 && thump < 1) { const b = Math.sin(thump * Math.PI) * .06; sx += b; sy -= b; }
  // The toaster gag: the last moments before 叮 it rattles harder and harder, then bulges.
  const rattle = clamp((roast - (dingAt - .32)) / .32, 0, 1);
  if (roast >= 0 && roast < dingAt && rattle > 0) {
    x += Math.sin(roast * 95) * 2.6 * rattle;
    sx += .05 * rattle * rattle;
    sy += .07 * rattle * rattle;
  }
  if (roast >= dingAt) { const b = Math.max(0, 1 - (roast - dingAt) / .18); sx += .06 * b; sy -= .08 * b; }
  const im = image(images, OVEN_SRC);
  const mx = (MOUTH_U - .5) * OVEN_W, my = -MOUTH_V * OVEN_W;
  const lit = roast >= 0 && roast < dingAt + .1;
  const heat = roast >= 0 ? ease(roast / .15) * clamp(1 - (roast - dingAt) / .3, 0, 1) : 0;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(x, FLOOR);
  ctx.scale(dir, 1);
  // The fire's light spilling onto the floor out of the mouth.
  if (heat > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(mx + 40, -2);
    ctx.scale(1, .22);
    ctx.globalAlpha = fade * heat * (.55 + .12 * Math.sin(roast * 23));
    glow(ctx, 0, 0, 120, '255,150,50');
    ctx.restore();
  }
  ctx.scale(sx, sy);
  if (im) {
    const h = OVEN_W * im.naturalHeight / im.naturalWidth;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, -OVEN_W / 2, -h, OVEN_W, h);
  } else {
    ovenShapes(ctx, OVEN_W);
  }
  if (lit) {
    // Fire roaring in the mouth: the same plume, small, rising out of it.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = fade * heat * .8;
    glow(ctx, mx, my + 6, 56, '255,160,60');
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = fade * heat;
    ctx.translate(mx - 30, my + 22);
    ctx.rotate(-.9);
    drawPlume(ctx, 92 + 10 * Math.sin(roast * 9), roast);
    ctx.restore();
    // Steam out of the chimney.
    for (let i = 0; i < 3; i++) {
      const q = cycle(roast, 1.2, i, 82);
      ctx.globalAlpha = fade * Math.sin(q * Math.PI) * .7;
      ctx.fillStyle = FLOUR;
      fluff(ctx, -OVEN_W * .24 + Math.sin(roast * 3 + i) * 5, -OVEN_W * .62 - q * 50, 6 + q * 10, 83 + i);
    }
  }
  ctx.restore();
}

/* ---- the shop sign ---- */

/** A small hanging shop sign: a post, an arm, a board with a loaf on it. Facing applied by the caller. */
function sign(ctx: CanvasRenderingContext2D, rise: number, age: number): void {
  ctx.fillStyle = '#7a4e2c';
  ctx.fillRect(-3, -150 * Math.min(1, rise), 6, 150 * Math.min(1, rise));
  ctx.fillRect(-3, -150 * Math.min(1, rise), 52, 5);
  if (rise < .7) return;
  ctx.save();
  ctx.translate(30, -146);
  ctx.rotate(Math.sin(age * 4.5) * .05 * Math.exp(-age * 1.5) + Math.sin(age * 2) * .015);
  ctx.scale(pop(age / .35), pop(age / .35));
  ctx.fillStyle = '#7a4e2c';
  ctx.fillRect(-20, 0, 2, 12);
  ctx.fillRect(18, 0, 2, 12);
  ctx.fillStyle = '#8a5a32';
  ctx.beginPath();
  ctx.roundRect(-30, 10, 60, 40, 8);
  ctx.fill();
  ctx.fillStyle = '#f6dfaa';
  ctx.beginPath();
  ctx.roundRect(-25, 15, 50, 30, 6);
  ctx.fill();
  // The loaf: a golden oval, three scored lines.
  ctx.fillStyle = '#e3a145';
  ctx.beginPath();
  ctx.ellipse(0, 31, 15, 9, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff1c8';
  for (const dx of [-7, 0, 7]) { ctx.beginPath(); ctx.ellipse(dx, 30, 1.6, 5, .5, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#FFCC11';
  sparkle(ctx, -19, 20, 3 + Math.sin(age * 5) * .8);
  sparkle(ctx, 19, 42, 2.6 + Math.sin(age * 5 + 2) * .8);
  ctx.restore();
}

export function drawSaayaShot(ctx: CanvasRenderingContext2D, p: Projectile, liteFx: boolean): boolean {
  if (p.fx !== 'saaya-dough') return false;
  lite = liteFx;
  ctx.save();
  drawDough(ctx, p);
  ctx.restore();
  return true;
}

const warmFills = new WeakMap<CanvasRenderingContext2D, CanvasGradient>();
function warmOf(ctx: CanvasRenderingContext2D): CanvasGradient {
  let gr = warmFills.get(ctx);
  if (!gr) {
    gr = ctx.createLinearGradient(0, 0, 0, FLOOR);
    gr.addColorStop(0, 'rgba(255,214,120,.07)');
    gr.addColorStop(1, 'rgba(255,176,70,.16)');
    warmFills.set(ctx, gr);
  }
  return gr;
}

/** The chibi face over her head while she breathes in: cheeks puffed, eyes squeezed「><」, the「3」mouth. */
function gagFace(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, puff: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha *= .9;
  glow(ctx, 0, 0, 30, '255,236,170');
  ctx.globalAlpha /= .9;
  // Puffed cheeks bulging out past the face.
  ctx.fillStyle = '#ffb3a3';
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * (12 + 3 * puff), 5, 7 + 3 * puff, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#fff3e2';
  ctx.beginPath();
  ctx.ellipse(0, 1, 16 + 2 * puff, 15 + puff, 0, 0, TAU);
  ctx.fill();
  // The fringe: her brown hair over the top of the face.
  ctx.fillStyle = '#8a5236';
  ctx.beginPath();
  ctx.ellipse(0, -9, 17.5 + 2 * puff, 9, 0, Math.PI, TAU);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  // >  <
  ctx.moveTo(-10, -2); ctx.lineTo(-5, 1); ctx.lineTo(-10, 4);
  ctx.moveTo(10, -2); ctx.lineTo(5, 1); ctx.lineTo(10, 4);
  ctx.stroke();
  // The「3」mouth, pushed out.
  ctx.beginPath();
  ctx.arc(0, 6.5, 2.4, -Math.PI / 2, Math.PI / 2);
  ctx.arc(0, 11.3, 2.4, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  // Blush lines.
  ctx.strokeStyle = '#ff7f6e';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const side of [-1, 1]) for (let j = 0; j < 3; j++) { ctx.moveTo(side * (9 + j * 2.6), 7); ctx.lineTo(side * (8 + j * 2.6), 10); }
  ctx.stroke();
  ctx.restore();
}

export function drawSaayaFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('saaya-') || e.type.includes('@')) return false;
  lite = liteFx;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  const r = e.radius ?? 30;
  const sc = (e.radius ?? 181) / 181;
  ctx.save();
  switch (e.type) {
    case 'saaya-pat': {
      // A warm dot pressed onto the head (squashed on the pat), sparkles flicking out; a heart on the third.
      const k = clamp(el / .08, 0, 1);
      const x = e.x + dir * ((e.n ?? 0) - 1) * 6;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - t) * .7;
      glow(ctx, x, e.y, 12 + 14 * k, '255,214,90');
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1 - t * t;
      ctx.fillStyle = '#ffe48a';
      ctx.beginPath();
      ctx.ellipse(x, e.y - 2 * (1 - k), 5 * (1 + .4 * Math.sin(k * Math.PI)), 5 * (1 - .4 * Math.sin(k * Math.PI)), 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fffbe0';
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * .9;
        const d = 10 + ease(el / .3) * 16;
        sparkle(ctx, x + Math.cos(a) * d, e.y + Math.sin(a) * d, (4 - i % 2) * (1 - t));
      }
      if ((e.n ?? 0) === 2) {
        const q = ease(el / .42);
        ctx.fillStyle = '#ff9ec4';
        const hx = x + dir * 14, hy = e.y - 14 - q * 22, hs = 5 * pop(el / .2);
        ctx.beginPath();
        ctx.moveTo(hx, hy + hs);
        ctx.bezierCurveTo(hx - hs * 1.6, hy - hs * .2, hx - hs * .6, hy - hs * 1.4, hx, hy - hs * .5);
        ctx.bezierCurveTo(hx + hs * .6, hy - hs * 1.4, hx + hs * 1.6, hy - hs * .2, hx, hy + hs);
        ctx.fill();
      }
      break;
    }
    case 'saaya-splat': {
      // The dough lands: flour puffs squeezed out on both sides and specks.
      ctx.fillStyle = FLOUR;
      for (let i = 0; i < 4; i++) {
        const side = i % 2 ? 1 : -1;
        ctx.globalAlpha = (1 - t) * .85;
        fluff(ctx, e.x + side * r * (.7 + .6 * ease(el / .4)) * (i < 2 ? 1 : 1.35), FLOOR - 6 - t * 8 - (i >> 1) * 4, r * (.22 + .12 * ease(el / .4)) * (i < 2 ? 1 : .7), 84 + i);
      }
      burst(el, 81, { n: n(8), speed: [40, 130], life: .45, gravity: 260, angle: -Math.PI / 2, spread: 2.6, drag: .4 }, (x, y, q) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = '#ffffff';
        dot(ctx, x, Math.min(FLOOR, y), 2);
      }, e.x, FLOOR - 8);
      break;
    }
    case 'saaya-pop': {
      // 噗: a white star flash, a fluffy flour cloud, dough chunks flying; baked, a golden flash, crust shards,
      // steam and a heavier spray of crumbs.
      const baked = !!e.hit;
      if (el < .16) {
        ctx.globalAlpha = 1 - el / .16;
        ctx.fillStyle = baked ? '#fff0a0' : '#ffffff';
        star(ctx, e.x, FLOOR - r * .55, r * (.7 + el * 5), 8, .45, el * 2);
        if (baked) {
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, e.x, FLOOR - r * .5, r * 2, '255,200,90');
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      ctx.fillStyle = FLOUR;
      for (let i = 0, m = n(baked ? 4 : 7); i < m; i++) {
        const a = -Math.PI / 2 + (hash(i, 82) - .5) * 2.8;
        const d = r * (.3 + 1.2 * ease(el / .5)) * (.6 + .4 * hash(i, 83));
        ctx.globalAlpha = (1 - t) ** 1.3 * .92;
        fluff(ctx, e.x + Math.cos(a) * d, FLOOR - 12 + Math.sin(a) * d * .75 - t * 10, r * (.2 + .22 * ease(el / .5)), 85 + i);
      }
      if (baked) {
        // Steam rolling up off the burst bread.
        for (let i = 0; i < 3; i++) {
          const q = clamp((el - .05 - i * .07) / .7, 0, 1);
          if (q <= 0) continue;
          ctx.globalAlpha = Math.sin(q * Math.PI) * .6;
          fluff(ctx, e.x + (i - 1) * r * .45 + Math.sin(el * 4 + i) * 6, FLOOR - r * .6 - q * 90, 8 + q * 16, 88 + i);
        }
        burst(el, 86, { n: n(8), speed: [220, 460], life: .7, gravity: 1100, angle: -Math.PI / 2, spread: 2.4, drag: .7 }, (x, y, q, i) => {
          // Crust shards: little two-tone wedges, spinning.
          const yy = Math.min(FLOOR - 3, y), rot = i * 1.3 + q * 9 * (i % 2 ? 1 : -1), s = 5 + (i % 3) * 2;
          ctx.globalAlpha = 1 - q * q;
          ctx.save();
          ctx.translate(x, yy);
          ctx.rotate(rot);
          ctx.fillStyle = '#b8682a';
          ctx.beginPath(); ctx.moveTo(-s, -s * .5); ctx.lineTo(s, -s * .7); ctx.lineTo(s * .6, s * .6); ctx.lineTo(-s * .8, s * .4); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#f2b450';
          ctx.beginPath(); ctx.moveTo(-s * .8, -s * .5); ctx.lineTo(s * .9, -s * .65); ctx.lineTo(s * .5, -s * .1); ctx.lineTo(-s * .6, 0); ctx.closePath(); ctx.fill();
          ctx.restore();
        }, e.x, FLOOR - 20);
      } else {
        burst(el, 87, { n: n(5), speed: [200, 380], life: .65, gravity: 1000, angle: -Math.PI / 2, spread: 2.2, drag: .7 }, (x, y, q, i) => {
          // Fluffy dough chunks, squashing a little as they fly.
          ctx.globalAlpha = 1 - q * q;
          ctx.fillStyle = '#fbefd6';
          ctx.beginPath();
          ctx.ellipse(x, Math.min(FLOOR - 4, y), 7 + (i % 2) * 2, 5.5, q * 6 + i, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          dot(ctx, x - 2, Math.min(FLOOR - 4, y) - 2, 2);
        }, e.x, FLOOR - 18);
      }
      burst(el, baked ? 85 : 84, { n: n(baked ? 14 : 8), speed: [160, 420], life: .6, gravity: 900, angle: -Math.PI / 2, spread: 2.2, drag: .6 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q * q;
        ctx.fillStyle = CRUMB[i % 3];
        dot(ctx, x, Math.min(FLOOR - 1, y), 2.2 + (i % 3) * .7);
      }, e.x, FLOOR - 16);
      break;
    }
    case 'saaya-puff': {
      // The deep breath: the chibi「>3<」face pops up over her head, a puffed cheek on her own face, air streaming in.
      const age = e.age ?? el;
      const k = ease(age / .25);
      const fade = clamp(e.life / .1, 0, 1);
      const cx = e.x + dir * (FIRE_MOUTH.x - 8) * sc, cy = e.y - (FIRE_MOUTH.y + 6) * sc;
      ctx.globalAlpha = fade * .8;
      ctx.fillStyle = '#ffb9a8';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 6 + 5 * k, 5 + 4 * k, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      dot(ctx, cx - dir * 3, cy - 3, 2.2);
      for (let i = 0; i < 4; i++) {
        const q = cycle(age, 2.6, i, 86);
        ctx.globalAlpha = fade * q * .7;
        ctx.fillStyle = '#ffffff';
        dot(ctx, cx + dir * (14 + (1 - q) * 46), cy + (hash(i, 87) - .5) * 30 * (1 - q), 2);
      }
      ctx.globalAlpha = fade;
      const bob = Math.sin(age * 18) * 1.5;
      gagFace(ctx, e.x + dir * 6, e.y - 181 * sc - 34 + bob, pop(age / .2), k);
      // A sweat drop beside it.
      const hy = e.y - 181 * sc - 44;
      ctx.fillStyle = '#bfe6ff';
      ctx.beginPath();
      ctx.moveTo(e.x - dir * 22, hy - 9);
      ctx.quadraticCurveTo(e.x - dir * 16, hy + 1, e.x - dir * 22, hy + 3);
      ctx.quadraticCurveTo(e.x - dir * 28, hy + 1, e.x - dir * 22, hy - 9);
      ctx.fill();
      break;
    }
    case 'saaya-fire': {
      // The plume grows out of her mouth, boils while she holds it, and shrinks back in once she lets go.
      const age = e.age ?? el;
      const shrink = clamp(e.life / FIRE_FADE, 0, 1);
      const len = FIRE_REACH * sc * ease(age / .16) * shrink;
      const mx = e.x + dir * FIRE_MOUTH.x * sc, my = e.y - FIRE_MOUTH.y * sc + 15;
      ctx.globalAlpha = .75 + .25 * shrink;
      ctx.translate(mx, my);
      ctx.scale(dir, 1);
      // Heat shimmer over it: pale soft blobs rising off the top.
      for (let i = 0; i < 3; i++) {
        const q = cycle(age, .9, i, 88);
        const u = .4 + .25 * i;
        const { dy, half } = plumeAt(u, len);
        ctx.globalAlpha = Math.sin(q * Math.PI) * .22 * shrink;
        glow(ctx, u * len + Math.sin(age * 6 + i) * 8, dy - half - 18 - q * 40, 14 + half * .3, '255,250,235');
      }
      ctx.globalAlpha = .75 + .25 * shrink;
      drawPlume(ctx, len, age);
      break;
    }
    case 'saaya-pyro': {
      // Stage pyro at her feet: a flash star, a short cel jet of flame, a fountain of gold sparks.
      if (el < .14) {
        ctx.globalAlpha = 1 - el / .14;
        ctx.fillStyle = '#fff6c2';
        star(ctx, e.x, FLOOR - 12, 22 + el * 200, 6, .4, .3);
      }
      if (el < .3) {
        const q = el / .3;
        const h = 96 * Math.sin(Math.min(1, q * 1.6) * Math.PI / 2) * (1 - q * q);
        ctx.globalAlpha = 1;
        ctx.fillStyle = SKIN;
        lick(ctx, e.x, FLOOR - h * .45, h * .3, dir * .15);
        ctx.fillStyle = CORE;
        lick(ctx, e.x, FLOOR - h * .32, h * .19, dir * .15);
      }
      burst(el, 88 + (e.n ?? 0), { n: n(16), speed: [380, 720], life: .55, gravity: 900, angle: -Math.PI / 2 + dir * .12, spread: .6, drag: .5 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i % 4 === 0 ? '#ffffff' : i % 2 ? '#ffe27a' : '#ffb33a';
        if (i % 4 === 0) sparkle(ctx, x, y, 5 * (1 - q)); else dot(ctx, x, y, 2.4);
      }, e.x, FLOOR - 4);
      break;
    }
    case 'saaya-smoke': {
      // Out of breath: a cartoon puff of black smoke at her mouth, then one smoke ring drifting off.
      const mx = e.x + dir * (e.tx ?? 30), my = e.y + (e.ty ?? -142);
      for (let i = 0; i < 3; i++) {
        const q = clamp(el / (.45 + i * .12), 0, 1);
        ctx.globalAlpha = (1 - q) ** 1.5 * .85;
        ctx.fillStyle = i ? '#3b3533' : '#57504c';
        fluff(ctx, mx + dir * (10 + i * 12 + q * 20), my - q * (28 + i * 12), 11 + q * (14 + i * 4), 90 + i);
      }
      const k = clamp((el - .15) / .7, 0, 1);
      if (k > 0) {
        ctx.globalAlpha = (1 - k) * .6;
        ctx.strokeStyle = '#4a4442';
        ctx.lineWidth = 3.4 * (1 - k * .5);
        ctx.beginPath();
        ctx.ellipse(mx + dir * (26 + k * 40), my - 14 - k * 48, 7 + k * 12, 4 + k * 6, 0, 0, TAU);
        ctx.stroke();
      }
      break;
    }
    case 'saaya-warm': {
      // The bakery's warm light over the whole stage: a translucent warm wash, never a dim.
      const age = e.age ?? el;
      ctx.globalAlpha = clamp(age / .25, 0, 1) * clamp(e.life / .35, 0, 1);
      ctx.fillStyle = warmOf(ctx);
      ctx.fillRect(0, 0, W, FLOOR);
      break;
    }
    case 'saaya-sign': {
      const age = e.age ?? el;
      const rise = ease(age / .3);
      ctx.globalAlpha = clamp(e.life / .3, 0, 1) * .94;
      ctx.translate(e.x, FLOOR);
      ctx.scale(dir, 1);
      sign(ctx, rise, age);
      break;
    }
    case 'saaya-oven':
      drawOven(ctx, e, images);
      break;
    case 'saaya-flour': {
      // Each press squeezes flour out of both sides in fluffy clouds; the last one (rolled flat) a bigger burst.
      const big = !!e.hit;
      ctx.fillStyle = FLOUR;
      for (let i = 0, m = n(big ? 6 : 4); i < m; i++) {
        const side = i % 2 ? 1 : -1;
        const d = r * (.45 + ease(el / .35) * (big ? 1.3 : .95)) * (.75 + .25 * hash(i, 89));
        ctx.globalAlpha = (1 - t) ** 1.2 * .9;
        fluff(ctx, e.x + side * d, e.y - 2 - t * 18 - (i >> 1) * 8, r * (.22 + .2 * ease(el / .35)) * (big ? 1.2 : 1), 92 + i + (e.n ?? 0) * 7);
      }
      if (el < .1) {
        ctx.globalAlpha = 1 - el / .1;
        ctx.fillStyle = '#ffffff';
        star(ctx, e.x, e.y - 30, 20 + el * 200, 6, .45, (e.n ?? 0));
      }
      burst(el, 90 + (e.n ?? 0), { n: n(big ? 12 : 8), speed: [80, 260], life: .5, gravity: 420, angle: -Math.PI / 2, spread: 2.8, drag: .4 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i % 4 ? '#ffffff' : '#f0e2c4';
        dot(ctx, x, Math.min(FLOOR - 1, y), 2.2);
      }, e.x, e.y);
      break;
    }
    case 'saaya-ding': {
      // 叮 — the toaster pops: a gold star flash out of the mouth, speed lines up over the body springing out,
      // crumbs spraying, and fluffy bread steam rolling up after.
      if (el < .2) {
        ctx.globalAlpha = 1 - el / .2;
        ctx.fillStyle = '#fff1a0';
        star(ctx, e.x, e.y, r * (.6 + el * 5), 8, .42, el * 3);
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, e.x, e.y, r * 2, '255,214,110');
        ctx.globalCompositeOperation = 'source-over';
      }
      if (el < .3) {
        ctx.globalAlpha = 1 - el / .3;
        ctx.strokeStyle = '#fffbe8';
        ctx.lineCap = 'round';
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const x = e.x + (i - 1.5) * 16, y0 = e.y - 40 - el * 260 - (i % 2) * 14;
          ctx.moveTo(x, y0);
          ctx.lineTo(x, y0 + 30);
        }
        ctx.stroke();
      }
      burst(el, 92, { n: n(8), speed: [140, 300], life: .45, drag: .3, angle: dir > 0 ? 0 : Math.PI, spread: 2.4 }, (x, y, q) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = '#ffe48a';
        sparkle(ctx, x, y, 5.5 * (1 - q * .5));
      }, e.x, e.y);
      burst(el, 93, { n: n(14), speed: [150, 380], life: .75, gravity: 820, angle: -Math.PI / 2 + dir * .5, spread: 2, drag: .6 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q * q;
        ctx.fillStyle = CRUMB[i % 3];
        dot(ctx, x, Math.min(FLOOR - 1, y), 2.4 + (i % 3) * .6);
      }, e.x, e.y);
      ctx.fillStyle = FLOUR;
      for (let i = 0; i < 4; i++) {
        const q = clamp((el - .1 - i * .08) / .8, 0, 1);
        if (q <= 0) continue;
        ctx.globalAlpha = Math.sin(q * Math.PI) * .75;
        fluff(ctx, e.x + (i - 1.5) * 18 + Math.sin(el * 4 + i) * 6, e.y - 30 - q * 90, 9 + q * 14, 96 + i);
      }
      break;
    }
  }
  ctx.restore();
  return true;
}
