import type { Effect, Projectile } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { MOMOKA_BEER_SRC, MOMOKA_BOX, MOMOKA_PAST } from './clips.ts';
import { TAU, burst, diamond, dot, glow, hash, soap, sparkle } from './fxParticles.ts';

/* 河原木桃香 — 第 1 话《空之箱》路演的蓝光、高中时代的残影、蛇和啤酒.
   One palette for all of it: her own cold blue (#85C9DC), the colour of the street live in episode 1 — the picture
   sunk into blue, one soft light source, and faint threads of blue light drawn in toward it. Kept hinted and gentle:
   nothing here should glare. The cans fizz clear bubbles; nothing pools on the floor.
   - U 又想逃了？: the girl she was stays behind (a frozen ghost of her, done in renderer.ts); here only the cold
     light round it, the drift of dust off it, and the diamond dust it breaks into.
   - I 快拿去扔掉！: a little green snake at her feet, a shriek, three cans tumbling, foam on the floor.
   - O 微醺醉拳: a gulp, rosy cheeks and bubbles; each sway leaves bent motion arcs; the hangover's little orbit.
   - L 空之箱: the blue night with the light source behind her and the threads of light, the box of light round the
     foe, rings of song bouncing inside it, and the box breaking into points of light that rise.
   Nothing written on screen. Light threads and the column are baked once and only stamped. */

/** Full screen, behind every body. */
export const MOMOKA_SCREEN_BACK: readonly string[] = ['momoka-night'];
/** Behind the bodies. */
export const MOMOKA_BACK: readonly string[] = ['momoka-column', 'momoka-past', 'momoka-foam'];

const BLUE_RGB = '133,201,220';
const ICE_RGB = '207,238,255';
const DEEP_RGB = '40,110,255';
const WHITE_RGB = '240,250,255';
const ICE = '#e6f7ff';
const BOX_EDGE = `rgba(${BLUE_RGB},.45)`;
const AMBER = '#e8a531';
const FIZZ_RGB = '235,248,255';

const count = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  return g ? [c, g] : null;
}
function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

/* ---- baked textures ---- */

let threadTex: HTMLCanvasElement | null | undefined;
/** One thread of light along +x: a long spindle, brightest a third of the way in, a white core inside a blue body,
 *  soft top and bottom. Stamped stretched and rotated. */
function thread(): HTMLCanvasElement | null {
  if (threadTex !== undefined) return threadTex;
  const made = canvas(256, 32);
  if (!made) return threadTex = null;
  const [c, g] = made;
  const along = g.createLinearGradient(0, 0, 256, 0);
  along.addColorStop(0, 'rgba(255,255,255,0)');
  along.addColorStop(.3, 'rgba(255,255,255,1)');
  along.addColorStop(.75, 'rgba(255,255,255,.55)');
  along.addColorStop(1, 'rgba(255,255,255,0)');
  // Body: blue, soft across.
  for (const [half, rgb, a] of [[16, DEEP_RGB, .55], [9, BLUE_RGB, .8], [3, WHITE_RGB, 1]] as const) {
    const across = g.createLinearGradient(0, 16 - half, 0, 16 + half);
    across.addColorStop(0, `rgba(${rgb},0)`);
    across.addColorStop(.5, `rgba(${rgb},${a})`);
    across.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = across;
    g.fillRect(0, 16 - half, 256, half * 2);
  }
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = along;
  g.fillRect(0, 0, 256, 32);
  return threadTex = c;
}

let columnTex: HTMLCanvasElement | null | undefined;
/** The light source: a tall soft white-blue column, hottest in the middle and near the floor. */
function column(): HTMLCanvasElement | null {
  if (columnTex !== undefined) return columnTex;
  const made = canvas(64, 256);
  if (!made) return columnTex = null;
  const [c, g] = made;
  const across = g.createLinearGradient(0, 0, 64, 0);
  across.addColorStop(0, 'rgba(120,190,255,0)');
  across.addColorStop(.3, 'rgba(170,215,255,.55)');
  across.addColorStop(.5, 'rgba(255,255,255,1)');
  across.addColorStop(.7, 'rgba(170,215,255,.55)');
  across.addColorStop(1, 'rgba(120,190,255,0)');
  g.fillStyle = across;
  g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = 'destination-in';
  const up = g.createLinearGradient(0, 0, 0, 256);
  up.addColorStop(0, 'rgba(255,255,255,0)');
  up.addColorStop(.35, 'rgba(255,255,255,.7)');
  up.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = up;
  g.fillRect(0, 0, 64, 256);
  return columnTex = c;
}

let veilTex: HTMLCanvasElement | null | undefined;
/** The blue night: deep blue everywhere, lifted a little round a hole where the light is (drawn centred on it). */
function veil(): HTMLCanvasElement | null {
  if (veilTex !== undefined) return veilTex;
  const made = canvas(256, 128);
  if (!made) return veilTex = null;
  const [c, g] = made;
  const r = g.createRadialGradient(128, 80, 4, 128, 80, 150);
  r.addColorStop(0, 'rgba(40,110,220,.1)');
  r.addColorStop(.18, 'rgba(12,40,120,.45)');
  r.addColorStop(.5, 'rgba(6,22,80,.66)');
  r.addColorStop(1, 'rgba(3,10,40,.76)');
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 128);
  return veilTex = c;
}

/** A thread of light from (x0, y0) to (x1, y1), `w` thick, at the current alpha (additive). */
function threadAt(ctx: CanvasRenderingContext2D, tex: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number, w: number): void {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  const a = Math.atan2(dy, dx);
  // Placed and undone by hand (no save / restore): the canvas may carry the camera's own transform.
  ctx.translate(x0, y0);
  ctx.rotate(a);
  ctx.drawImage(tex, 0, -w / 2, len, w);
  ctx.rotate(-a);
  ctx.translate(-x0, -y0);
}

/* ---- the can ---- */

function can(ctx: CanvasRenderingContext2D, images: ImageCache | undefined, x: number, y: number, size: number, rot: number): void {
  const im = image(images, MOMOKA_BEER_SRC);
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (im) {
    const h = size, w = h * im.naturalWidth / im.naturalHeight;
    ctx.drawImage(im, -w / 2, -h / 2, w, h);
  } else {
    // Placeholder can: silver body, amber band, a darker lid.
    const w = size * .52, h = size;
    ctx.fillStyle = '#cfd6de';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = AMBER;
    ctx.fillRect(-w / 2, -h * .18, w, h * .36);
    ctx.fillStyle = '#8f99a6';
    ctx.fillRect(-w / 2, -h / 2, w, h * .08);
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.fillRect(-w * .32, -h * .44, w * .12, h * .88);
  }
  ctx.rotate(-rot);
  ctx.translate(-x, -y);
}

export function drawMomokaShot(ctx: CanvasRenderingContext2D, p: Projectile, liteFx: boolean, images?: ImageCache): boolean {
  if (p.fx === 'momoka-past') return true;
  if (p.fx !== 'momoka-snake') return false;
  // A settled can is a puddle: the momoka-foam effect paints it.
  if (p.settled) return true;
  const dir = Math.sign(p.vx) || 1;
  ctx.save();
  // A few drops of beer flung off the open can as it tumbles.
  if (!liteFx) {
    ctx.fillStyle = `rgba(${FIZZ_RGB},.8)`;
    for (let j = 0; j < 4; j++) {
      const back = (j + 1) * 9;
      ctx.globalAlpha = .55 - j * .12;
      dot(ctx, p.x - dir * back + Math.sin(p.age * 20 + j) * 3, p.y - p.vy * .012 * (j + 1), 2.6 - j * .4);
    }
  }
  ctx.globalAlpha = 1;
  can(ctx, images, p.x, p.y, p.size, p.age * 14 * dir + (p.wave ?? 0));
  ctx.restore();
  return true;
}

/* ---- status marks (registered in statusMarks.ts) ---- */

/** 'momoka-dust' (冻僵 from 又想逃了？): diamond dust still settling on the body, glinting as it falls. */
export function auraMomokaDust(ctx: CanvasRenderingContext2D, f: Fighter, bodyH: number, left: number, t: number): void {
  const fade = Math.min(1, left / .3);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = fade * .22;
  glow(ctx, f.x, FLOOR - 4, 40, BLUE_RGB);
  for (let i = 0; i < 9; i++) {
    const u = (t * .45 + hash(i, 61)) % 1;
    const x = f.x + (hash(i, 62) - .5) * 64 + Math.sin(t * 2 + i) * 5;
    const y = f.y - bodyH * (1 - u) * .95;
    const tw = .5 + .5 * Math.sin(t * 9 + i * 2.1);
    ctx.globalAlpha = fade * (u < .85 ? 1 : (1 - u) / .15) * (.35 + .65 * tw);
    ctx.fillStyle = ICE;
    sparkle(ctx, x, y, 2.5 + tw * 3.5);
  }
  ctx.restore();
}
export function applyMomokaDust(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = ICE;
  burst(age, 63, { n: 12, speed: [60, 170], life: .5, gravity: 120, drag: .3 }, (x, y, k) => {
    ctx.globalAlpha = 1 - k;
    sparkle(ctx, x, y, 5 * (1 - k * .5));
  }, e.x, e.y - 90);
  ctx.restore();
}
/** 'beer-foam' (冻僵 from 快拿去扔掉！): ankles in cream foam, bubbles climbing and popping. */
export function auraBeerFoam(ctx: CanvasRenderingContext2D, f: Fighter, _bodyH: number, left: number, t: number): void {
  const fade = Math.min(1, left / .3);
  ctx.save();
  for (let i = 0; i < 7; i++) {
    const x = f.x + (i - 3) * 8, r = 5 + hash(i, 64) * 4 + Math.sin(t * 5 + i) * 1;
    soap(ctx, x, FLOOR - r - hash(i, 65) * 5, r, fade * .85, hash(i, 66), i % 2 === 0);
  }
  for (let i = 0; i < 5; i++) {
    const u = (t * .8 + hash(i, 66)) % 1;
    soap(ctx, f.x + (hash(i, 67) - .5) * 44, FLOOR - 10 - u * 60, 3 + hash(i, 68) * 4, fade * (1 - u) * .9, hash(i, 69));
  }
  ctx.restore();
}
export function applyBeerFoam(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  burst(age, 69, { n: 10, speed: [80, 200], life: .45, gravity: 600, drag: .5, angle: -Math.PI / 2, spread: 2.4 }, (x, y, k) => {
    soap(ctx, x, y, 4 + 3 * (1 - k), 1 - k, hash(k * 10 | 0, 70));
  }, e.x, FLOOR - 20);
  ctx.restore();
}

/* ---- effects ---- */

/** The whole screen goes the blue of episode 1. Light source at the column; threads of light pulled in toward it. */
function drawNight(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const dir = e.dir ?? 1;
  const inK = ease(el / .35);
  const out = Math.min(1, e.life / .35);
  const k = inK * out;
  // The light source sits behind her (her column), up at chest height.
  const sx = e.x - dir * 46, sy = FLOOR - 120;
  const v = veil();
  if (v) {
    ctx.globalAlpha = k;
    // The veil's bright hole (its 128, 80) sits on the source; it is drawn big enough to cover the screen.
    const sc = Math.max(W, H) * 2.4 / 256;
    ctx.drawImage(v, sx - 128 * sc, sy - 80 * sc, 256 * sc, 128 * sc);
  }
  const tex = thread();
  if (!tex) return;
  ctx.globalCompositeOperation = 'lighter';
  const n = count(24, lite);
  for (let i = 0; i < n; i++) {
    // Each thread starts out at the edge of the screen (mostly on the far side from her back, as in the episode) and
    // is pulled toward the source, nearly level; it slides inward and is renewed, like light in a long exposure.
    const side = hash(i, 70) < .62 ? -dir : dir;
    const edgeX = side < 0 ? -40 : W + 40;
    const edgeY = sy + (hash(i, 71) - .5) * H * .95;
    const u = (el * (.35 + hash(i, 72) * .5) + hash(i, 73)) % 1;
    // From the edge, a piece of the line between the edge and the source.
    const a0 = u * .55, a1 = Math.min(1, a0 + .25 + hash(i, 74) * .45);
    const x0 = edgeX + (sx - edgeX) * a0, y0 = edgeY + (sy - edgeY) * a0;
    const x1 = edgeX + (sx - edgeX) * a1, y1 = edgeY + (sy - edgeY) * a1;
    const near = 1 - a0;
    const w = (2 + hash(i, 75) ** 2 * 10) * (.5 + near * .6);
    // Hinted, not blazing: soft and slow to breathe.
    const flick = .85 + .15 * Math.sin(el * (2 + hash(i, 76) * 3) + i);
    ctx.globalAlpha = k * (.1 + hash(i, 77) * .22) * flick * Math.sin(u * Math.PI);
    threadAt(ctx, tex, x0, y0, x1, y1, w);
  }
  // A soft halo where the light comes from.
  ctx.globalAlpha = k * .25;
  glow(ctx, sx, sy, 240, DEEP_RGB);
  ctx.globalAlpha = k * .16;
  glow(ctx, sx, sy, 80, ICE_RGB);
  ctx.globalCompositeOperation = 'source-over';
}
/** The light source itself, standing behind her: a pillar of white-blue light, a few threads leaving it. */
function drawColumn(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const k = ease(el / .3) * Math.min(1, e.life / .3);
  const tex = column();
  const h = (e.radius ?? 181) * 1.9;
  ctx.globalCompositeOperation = 'lighter';
  if (tex) {
    const breathe = 1 + Math.sin(el * 3) * .06;
    // A broad wash like the lit wall in the episode, then the hot core.
    ctx.globalAlpha = k * .22;
    ctx.drawImage(tex, e.x - 90 * breathe, e.y - h * 1.3, 180 * breathe, h * 1.3);
    ctx.globalAlpha = k * .32;
    ctx.drawImage(tex, e.x - 36 * breathe, e.y - h, 72 * breathe, h);
  }
  // Light pooling on the floor round the column's foot.
  ctx.globalAlpha = k * .22;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(1, .18);
  glow(ctx, 0, 0, 160, BLUE_RGB);
  ctx.restore();
  // Motes drifting up through it.
  ctx.fillStyle = ICE;
  for (let i = 0; i < count(10, lite); i++) {
    const u = (el * .35 + hash(i, 78)) % 1;
    ctx.globalAlpha = k * Math.sin(u * Math.PI) * .45;
    sparkle(ctx, e.x + (hash(i, 79) - .5) * 70, e.y - u * h, 2 + hash(i, 80) * 3);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** The eight corners of the box, back face up and to one side (a three-quarter look) so it reads as a box. */
const CORNERS = new Float32Array(16);
function corners(cx: number, floor: number, s: number, dir: number, grow: number): void {
  const half = s / 2 * grow, top = floor - s * grow;
  const bx = -dir * s * .22 * grow, by = -s * .16 * grow;
  CORNERS[0] = cx - half; CORNERS[1] = floor;
  CORNERS[2] = cx + half; CORNERS[3] = floor;
  CORNERS[4] = cx + half; CORNERS[5] = top;
  CORNERS[6] = cx - half; CORNERS[7] = top;
  CORNERS[8] = CORNERS[0] + bx; CORNERS[9] = floor + by;
  CORNERS[10] = CORNERS[2] + bx; CORNERS[11] = floor + by;
  CORNERS[12] = CORNERS[4] + bx; CORNERS[13] = top + by;
  CORNERS[14] = CORNERS[6] + bx; CORNERS[15] = top + by;
}
/** The glass tint. The box sits for more than a second after it finishes growing, so the gradient is kept per context. */
const paneCache = new WeakMap<CanvasRenderingContext2D, { y0: number; y1: number; g: CanvasGradient }>();
function boxPane(ctx: CanvasRenderingContext2D, y0: number, y1: number): CanvasGradient {
  const hit = paneCache.get(ctx);
  if (hit && hit.y0 === y0 && hit.y1 === y1) return hit.g;
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(170,225,255,.05)');
  g.addColorStop(1, 'rgba(133,201,220,.14)');
  paneCache.set(ctx, { y0, y1, g });
  return g;
}
const EDGES = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
function face(ctx: CanvasRenderingContext2D, a: number, b: number, c: number, d: number): void {
  ctx.beginPath();
  ctx.moveTo(CORNERS[a * 2], CORNERS[a * 2 + 1]);
  ctx.lineTo(CORNERS[b * 2], CORNERS[b * 2 + 1]);
  ctx.lineTo(CORNERS[c * 2], CORNERS[c * 2 + 1]);
  ctx.lineTo(CORNERS[d * 2], CORNERS[d * 2 + 1]);
  ctx.closePath();
  ctx.fill();
}
/** The empty box: glass panes of pale blue, edges of light drawn in one after another, a glint running round them. */
function drawBox(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const s = e.radius ?? MOMOKA_BOX.size, dir = e.dir ?? 1;
  const grow = .86 + .14 * ease(el / .25);
  const out = Math.min(1, e.life / .12);
  corners(e.x, e.y, s, dir, grow);
  // Panes: back and side first, faint; the front pane fainter still so the foe shows through.
  ctx.fillStyle = boxPane(ctx, e.y - s, e.y);
  ctx.globalAlpha = out * ease(el / .3);
  face(ctx, 4, 5, 6, 7);
  face(ctx, 3, 2, 6, 7);
  ctx.globalAlpha *= .6;
  face(ctx, 0, 1, 2, 3);
  // Edges: each of the twelve drawn in, then a glint travelling round.
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const tex = thread();
  for (let j = 0; j < 12; j++) {
    const a = EDGES[j * 2], b = EDGES[j * 2 + 1];
    const kk = clamp((el - j * .018) / .16, 0, 1);
    if (kk <= 0) continue;
    const x0 = CORNERS[a * 2], y0 = CORNERS[a * 2 + 1];
    const x1 = x0 + (CORNERS[b * 2] - x0) * kk, y1 = y0 + (CORNERS[b * 2 + 1] - y0) * kk;
    const back = a >= 4 && b >= 4;
    ctx.globalAlpha = out * (back ? .25 : .5);
    ctx.strokeStyle = BOX_EDGE;
    ctx.lineWidth = back ? 4 : 6;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = '#dff3ff';
    ctx.lineWidth = back ? 1 : 1.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  if (tex && !lite) {
    const j = Math.floor(el * 5) % 12, u = (el * 5) % 1;
    const a = EDGES[j * 2], b = EDGES[j * 2 + 1];
    const x = CORNERS[a * 2] + (CORNERS[b * 2] - CORNERS[a * 2]) * u, y = CORNERS[a * 2 + 1] + (CORNERS[b * 2 + 1] - CORNERS[a * 2 + 1]) * u;
    ctx.globalAlpha = out * .35;
    glow(ctx, x, y, 12, ICE_RGB);
  }
  // Corner stars.
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 8; i++) {
    ctx.globalAlpha = out * (i < 4 ? .45 : .25) * (.7 + .3 * Math.sin(el * 3 + i));
    sparkle(ctx, CORNERS[i * 2], CORNERS[i * 2 + 1], i < 4 ? 4 : 3);
  }
  ctx.globalCompositeOperation = 'source-over';
}
/** One song inside the box: a ring of sound leaving the middle, flattening against the panes, the panes lighting. */
function drawSong(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const s = e.radius ?? MOMOKA_BOX.size, n = e.n ?? 0;
  const k = el / e.max;
  ctx.globalCompositeOperation = 'lighter';
  for (let j = 0; j < 3; j++) {
    const u = clamp(k * 1.4 - j * .14, 0, 1);
    if (u <= 0 || u >= 1) continue;
    // Out from the middle, squaring off as it reaches the walls (a rounded rect whose corner radius shrinks).
    const half = s * .5 * ease(u);
    const r = half * (1 - u * .8);
    ctx.globalAlpha = (1 - u) * (.38 + n * .06);
    ctx.strokeStyle = j ? `rgba(${BLUE_RGB},1)` : '#dff3ff';
    ctx.lineWidth = (j ? 2.2 : 1.5) * (1 + n * .2);
    ctx.beginPath();
    ctx.roundRect(e.x - half, e.y - half, half * 2, half * 2, r);
    ctx.stroke();
  }
  // The walls take it: a flash across the inside.
  const hit = clamp(1 - Math.abs(k - .55) / .2, 0, 1);
  ctx.globalAlpha = hit * .14;
  glow(ctx, e.x, e.y, s * .7, BLUE_RGB);
  ctx.globalCompositeOperation = 'source-over';
}
/** Her voice leaving her: three thin arcs ahead of her mouth. */
function drawVoice(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const dir = e.dir ?? 1, k = el / e.max;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let j = 0; j < 3; j++) {
    const u = clamp(k * 1.5 - j * .2, 0, 1);
    if (u <= 0 || u >= 1) continue;
    const r = 14 + u * 60;
    ctx.globalAlpha = (1 - u) * .45;
    ctx.strokeStyle = j % 2 ? `rgba(${BLUE_RGB},1)` : '#dff3ff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    const a0 = dir > 0 ? -.55 : Math.PI - .55;
    ctx.arc(e.x, e.y, r, a0, a0 + 1.1);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}
/** The box breaks: the panes fly apart as shards and everything left turns into points of light rising into the sky. */
function drawBurst(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const s = e.radius ?? MOMOKA_BOX.size;
  ctx.globalCompositeOperation = 'lighter';
  // The flash.
  const fl = clamp(1 - el / .25, 0, 1);
  ctx.globalAlpha = fl * .25;
  glow(ctx, e.x, e.y, s * 1.1, BLUE_RGB);
  // Shards of glass, tumbling out.
  ctx.fillStyle = `rgba(${ICE_RGB},1)`;
  burst(el, 81, { n: count(16, lite), speed: [220, 520], life: .7, gravity: 380, drag: .25 }, (x, y, k, i) => {
    ctx.globalAlpha = (1 - k) * .4;
    diamond(ctx, x, y, 5 + hash(i, 82) * 9, 12 + hash(i, 83) * 14, el * (4 + i) + i);
  }, e.x, e.y);
  // Points of light: up and away, slowing as they rise, twinkling.
  ctx.fillStyle = '#ffffff';
  const n = count(30, lite);
  for (let i = 0; i < n; i++) {
    const start = hash(i, 84) * .2;
    const t = el - start;
    if (t <= 0) continue;
    const u = clamp(t / (e.max - start), 0, 1);
    const x = e.x + (hash(i, 85) - .5) * s * 1.1 + Math.sin(t * 2 + i) * 10 * u;
    const y = e.y + (hash(i, 86) - .5) * s * .9 - (1 - (1 - u) ** 2) * (240 + hash(i, 87) * 260);
    const tw = .55 + .45 * Math.sin(t * 11 + i * 1.7);
    ctx.globalAlpha = (1 - u) * tw * .6;
    if (i % 3 === 0) glow(ctx, x, y, 8, BLUE_RGB);
    sparkle(ctx, x, y, 1.5 + hash(i, 88) * 3);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* U */
/** Round the girl she left behind: cold light at her feet, a thin rim of light, dust drifting off her. */
function drawPast(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const h = e.radius ?? 181;
  const k = ease(el / .2);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = k * .35;
  glow(ctx, e.x, e.y - h * .5, h * .55, BLUE_RGB);
  ctx.save();
  ctx.translate(e.x, FLOOR);
  ctx.scale(1, .2);
  ctx.globalAlpha = k * .55;
  glow(ctx, 0, 0, 70, ICE_RGB);
  ctx.restore();
  ctx.fillStyle = ICE;
  for (let i = 0; i < count(14, lite); i++) {
    const u = (el * (.25 + hash(i, 89) * .2) + hash(i, 90)) % 1;
    const x = e.x + (hash(i, 91) - .5) * h * .45 + Math.sin(el * 1.5 + i) * 6;
    const y = e.y - h * (.1 + hash(i, 92) * .8) - u * 40;
    ctx.globalAlpha = k * Math.sin(u * Math.PI) * (.5 + .5 * Math.sin(el * 8 + i));
    sparkle(ctx, x, y, 2 + hash(i, 93) * 3);
  }
  ctx.globalCompositeOperation = 'source-over';
}
/** The way out: long cold streaks along the floor line, trailing the run. */
function drawFlee(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const dir = e.dir ?? 1, h = e.radius ?? 181;
  const tex = thread();
  if (!tex) return;
  const k = 1 - el / e.max;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const y = e.y - h * (.15 + hash(i, 94) * .75);
    const len = 90 + hash(i, 95) * 160;
    const x0 = e.x - dir * 20 + dir * el * 300 * (.5 + hash(i, 96));
    ctx.globalAlpha = k * (.35 + hash(i, 97) * .45);
    threadAt(ctx, tex, x0 + dir * len, y, x0, y, 3 + hash(i, 98) * 6);
  }
  ctx.globalCompositeOperation = 'source-over';
}
/** The past breaks into diamond dust: a white crack of light, shards of ice flung out, then a slow glittering fall. */
function drawDust(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const r = e.radius ?? MOMOKA_PAST.blast, h = e.n ?? 181;
  const cy = e.y - h * .5;
  ctx.globalCompositeOperation = 'lighter';
  const fl = clamp(1 - el / .2, 0, 1);
  ctx.globalAlpha = fl * .7;
  glow(ctx, e.x, cy, h * .6, WHITE_RGB);
  // Frost ring along the floor.
  const ring = ease(el / .35);
  ctx.globalAlpha = (1 - el / e.max) * .6;
  ctx.strokeStyle = `rgba(${ICE_RGB},1)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(e.x, FLOOR, r * ring, r * ring * .16, 0, 0, TAU);
  ctx.stroke();
  // Shards.
  ctx.fillStyle = ICE;
  burst(el, 99, { n: count(26, lite), speed: [160, 460], life: .55, gravity: 200, drag: .2 }, (x, y, k, i) => {
    ctx.globalAlpha = (1 - k) * .9;
    diamond(ctx, x, y, 2.5 + hash(i, 100) * 4, 6 + hash(i, 101) * 9, i + el * 6);
  }, e.x, cy);
  // Diamond dust: fine glints hanging in the air and drifting down.
  for (let i = 0; i < count(34, lite); i++) {
    const x = e.x + (hash(i, 102) - .5) * r * 2;
    const y = cy + (hash(i, 103) - .5) * h * .9 + el * (30 + hash(i, 104) * 40);
    const tw = .5 + .5 * Math.sin(el * 14 + i * 2.3);
    ctx.globalAlpha = (1 - el / e.max) * tw * Math.min(1, el / .1);
    sparkle(ctx, x, y, 1.5 + hash(i, 105) * 3.5);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* I */
const SNAKE_PTS = new Float32Array(26);
/** 少主: a little green snake popping up at her feet, swaying its head and flicking its tongue, then away. */
function drawSnake(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const dir = e.dir ?? 1;
  const up = ease(el / .22);
  const away = clamp((el - .7) / .5, 0, 1);
  const fade = Math.min(1, e.life / .15);
  const x0 = e.x + dir * away * away * 220;
  const n = 12, seg = 6;
  ctx.globalAlpha = fade;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Body along the floor, a sine wave travelling down it; the front rises into the head.
  const pts = SNAKE_PTS;
  for (let j = 0; j <= n; j++) {
    const along = j / n;
    const x = x0 - dir * (n - j) * seg;
    const rise = along > .7 ? (along - .7) / .3 : 0;
    const y = FLOOR - 4 - Math.sin(el * 12 - j * .9) * 3 * (1 - rise) - rise * rise * 26 * up;
    pts[j * 2] = x; pts[j * 2 + 1] = y;
  }
  for (const [w, col] of [[9, '#2f6b3a'], [6, '#5fae63']] as const) {
    ctx.strokeStyle = col;
    ctx.lineWidth = w * up;
    ctx.beginPath();
    for (let j = 0; j <= n; j++) {
      if (j) ctx.lineTo(pts[j * 2], pts[j * 2 + 1]); else ctx.moveTo(pts[0], pts[1]);
    }
    ctx.stroke();
  }
  const hx = pts[n * 2] + dir * 4, hy = pts[n * 2 + 1] + Math.sin(el * 6) * 2;
  ctx.fillStyle = '#3e8a49';
  ctx.beginPath(); ctx.ellipse(hx, hy, 8 * up, 5.5 * up, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#10180f';
  dot(ctx, hx + dir * 3, hy - 2, 1.4);
  if (Math.sin(el * 14) > .2) {
    ctx.strokeStyle = '#e2404a';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(hx + dir * 7, hy + 1);
    ctx.lineTo(hx + dir * 13, hy + 1);
    ctx.lineTo(hx + dir * 16, hy - 1);
    ctx.moveTo(hx + dir * 13, hy + 1);
    ctx.lineTo(hx + dir * 16, hy + 3);
    ctx.stroke();
  }
}
/** The shriek: short white shock lines bursting round her head, twice. */
function drawShriek(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const k = el / e.max;
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  for (let j = 0; j < 7; j++) {
    const a = -Math.PI / 2 + (j - 3) * .42;
    const pop = (k * 2) % 1;
    const r0 = 26 + pop * 10, r1 = r0 + 12 + hash(j, 106) * 8;
    ctx.globalAlpha = (1 - k) * .95;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0);
    ctx.lineTo(e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1);
    ctx.stroke();
  }
}
/** A can bursts on someone: a spray of foam. */
function drawCanHit(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const dir = e.dir ?? 1;
  burst(el, 107, { n: 12, speed: [90, 260], life: .4, gravity: 700, drag: .4, angle: dir > 0 ? 0 : Math.PI, spread: 2.6 }, (x, y, k, i) => {
    soap(ctx, x, y, 3 + hash(i, 108) * 5 * (1 - k), 1 - k, hash(i, 109));
  }, e.x, e.y);
  ctx.globalAlpha = clamp(1 - el / .15, 0, 1) * .8;
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, e.x, e.y, 30, FIZZ_RGB);
  ctx.globalCompositeOperation = 'source-over';
}
/** Where a can lands: it lies on its side, still rolling a little, and fizzes — a fountain of clear soda-like bubbles
 *  out of its mouth and a low carpet of foam bubbles over the spot (no liquid on the floor). The carpet is the area. */
function drawFoam(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean, images?: ImageCache): void {
  const r = e.radius ?? 58, dir = e.dir ?? 1;
  const spread = ease(el / .2);
  const fade = Math.min(1, e.life / .3);
  // The carpet: clear bubbles sitting on the floor across the spot, gently bobbing, thinning as it goes.
  const thin = 1 - .5 * clamp(el / e.max, 0, 1);
  for (let i = 0; i < count(16, lite); i++) {
    const x = e.x + (hash(i, 122) - .5) * 2 * r * spread;
    const rr = (3 + hash(i, 123) * 5) * thin;
    soap(ctx, x, e.y - rr - 1 - Math.abs(Math.sin(el * 3 + i)) * 2, rr, fade * .85, hash(i, 124), i % 3 === 0);
  }
  // The fizz: bubbles leaving the can's mouth in an arc and drifting up, fewer as it runs out.
  const mx = e.x + dir * (r * .3 + 12), my = e.y - 8;
  const left = 1 - clamp(el / e.max, 0, 1);
  for (let i = 0; i < count(12, lite); i++) {
    const u = (el * (1.1 + hash(i, 125) * .6) + hash(i, 126)) % 1;
    if (hash(i, 127) > left + .25) continue;
    const x = mx + dir * u * (20 + hash(i, 128) * 26) + Math.sin(u * 9 + i) * 3;
    const y = my - u * (40 + hash(i, 129) * 40) + u * u * 14;
    soap(ctx, x, y, 2 + hash(i, 130) * 3.5, fade * (1 - u) * .9, hash(i, 131));
  }
  // The burst on landing: a pop of bubbles.
  if (el < .35) {
    burst(el, 110, { n: 12, speed: [100, 240], life: .35, gravity: 500, drag: .5, angle: -Math.PI / 2, spread: 2.2 }, (x, y, k, i) => {
      soap(ctx, x, y, 3 + hash(i, 111) * 4, 1 - k, hash(i, 132));
    }, e.x, e.y - 6);
  }
  ctx.globalAlpha = fade;
  // Lying on its side, the open end toward the fizz, rocking to a stop.
  const rock = Math.sin(el * 10) * .12 * Math.max(0, 1 - el / .8);
  can(ctx, images, e.x + dir * r * .3, e.y - 9, 30, dir * Math.PI / 2 + rock);
}

/* O */
function drawGulp(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  burst(el, 115, { n: 8, speed: [40, 120], life: .5, gravity: -60, drag: .5, angle: -Math.PI / 2, spread: 1.6 }, (x, y, k, i) => {
    soap(ctx, x, y, 2 + hash(i, 116) * 3, 1 - k, 0);
  }, e.x, e.y);
}
/** Drunk: rosy cheeks and a slow rise of bubbles off her, a lazy swirl above her head. */
function drawDrunk(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const h = e.radius ?? 181;
  const fade = Math.min(1, el / .3, e.life / .4);
  ctx.globalAlpha = fade * .5;
  glow(ctx, e.x, e.y - h * .82, 20, '255,120,150');
  for (let i = 0; i < count(7, lite); i++) {
    const u = (el * .45 + hash(i, 117)) % 1;
    const x = e.x + (hash(i, 118) - .5) * 50 + Math.sin(el * 2 + i) * 8;
    const y = e.y - h * (.7 + u * .5);
    soap(ctx, x, y, 2.5 + hash(i, 119) * 4, fade * Math.sin(u * Math.PI) * .9, 0);
  }
  // The swirl: three bubbles orbiting lazily above her head.
  for (let j = 0; j < 3; j++) {
    const a = el * 2.2 + j * TAU / 3;
    soap(ctx, e.x + Math.cos(a) * 18, e.y - h - 10 + Math.sin(a) * 5, 3.5, fade * .8, 0);
  }
}
/** A fresh sway ready: a soft ring through her. */
function drawBeat(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const k = el / e.max;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (1 - k) * .55;
  ctx.strokeStyle = `rgba(${BLUE_RGB},1)`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(e.x, e.y, 30 + k * 30, 70 + k * 30, 0, 0, TAU); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}
/** A hit slides off: bent arcs where she leaned out of the way, and a puff of bubbles. */
function drawSway(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const h = e.radius ?? 181, dir = e.dir ?? 1;
  const k = el / e.max;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let j = 0; j < 3; j++) {
    const y = e.y - h * (.45 + j * .17);
    const r = 40 + j * 10;
    ctx.globalAlpha = (1 - k) * (.75 - j * .15);
    ctx.strokeStyle = j ? `rgba(${BLUE_RGB},1)` : '#f4fbff';
    ctx.lineWidth = 3 - j * .6;
    ctx.beginPath();
    const c = e.x + dir * (8 + k * 20);
    if (dir > 0) ctx.arc(c - r, y, r, -.7, .4); else ctx.arc(c + r, y, r, Math.PI - .4, Math.PI + .7);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  burst(el, 120, { n: 8, speed: [50, 140], life: .45, gravity: -80, drag: .4, angle: -Math.PI / 2, spread: 2.4 }, (x, y, kk, i) => {
    soap(ctx, x, y, 2 + hash(i, 121) * 3, 1 - kk, 0);
  }, e.x, e.y - h * .6);
}
/** 记不得了: a little orbit of bubbles and stars round her head, no words. */
function drawHangover(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  const fade = Math.min(1, el / .1, e.life / .2);
  ctx.fillStyle = '#fff2a8';
  for (let j = 0; j < 4; j++) {
    const a = el * 6 + j * TAU / 4;
    const x = e.x + Math.cos(a) * 22, y = e.y + Math.sin(a) * 6;
    ctx.globalAlpha = fade * (Math.sin(a) > 0 ? 1 : .55);
    if (j % 2) sparkle(ctx, x, y, 5); else soap(ctx, x, y, 4, fade, 0);
  }
}

export function drawMomokaFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('momoka-')) return false;
  const el = e.max - e.life;
  ctx.save();
  switch (e.type) {
    case 'momoka-night': drawNight(ctx, e, el, liteFx); break;
    case 'momoka-column': drawColumn(ctx, e, el, liteFx); break;
    case 'momoka-box': drawBox(ctx, e, el, liteFx); break;
    case 'momoka-song': drawSong(ctx, e, el); break;
    case 'momoka-voice': drawVoice(ctx, e, el); break;
    case 'momoka-burst': drawBurst(ctx, e, el, liteFx); break;
    case 'momoka-past': drawPast(ctx, e, el, liteFx); break;
    case 'momoka-flee': drawFlee(ctx, e, el); break;
    case 'momoka-dust': drawDust(ctx, e, el, liteFx); break;
    case 'momoka-snake': drawSnake(ctx, e, el); break;
    case 'momoka-shriek': drawShriek(ctx, e, el); break;
    case 'momoka-can-hit': drawCanHit(ctx, e, el); break;
    case 'momoka-foam': drawFoam(ctx, e, el, liteFx, images); break;
    case 'momoka-gulp': drawGulp(ctx, e, el); break;
    case 'momoka-drunk': drawDrunk(ctx, e, el, liteFx); break;
    case 'momoka-beat': drawBeat(ctx, e, el); break;
    case 'momoka-sway': drawSway(ctx, e, el); break;
    case 'momoka-hangover': drawHangover(ctx, e, el); break;
  }
  ctx.restore();
  return true;
}
