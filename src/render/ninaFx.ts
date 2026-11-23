import type { Effect, Projectile } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import type { ImageCache } from '../assets/loader.ts';
import type { FighterView } from './view.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { NINA_LAMP_SRC, NINA_SCREAM } from './clips.ts';
import { TAU, dot, glow, hash, sparkle, streak } from './fxParticles.ts';

/* 井芹仁菜 — 刺、吸顶灯、雨夜和第一次合奏的光.
   The thorns are not blades on her body: when it gets too much the anime scratches the picture itself. Three
   materials, one look — thin red light scratches, black scribbled hatching (a pen dragged back and forth), a dark
   grainy blot behind her. Each move uses them its own way:
   - U 吸顶灯乱舞: red scratches flung off the lamp's light along its swing; when the bad contact dips, the scratches
     and a wisp of hatching show behind it; the shade breaks into a spray of them.
   - I 正义之刺: the picture darkens behind her and the scratches erupt upward from her chest, a tuft of hatching
     up and back, her body splitting red / cyan for a beat. The hedgehog after: scratches rising off her like red rain
     falling the wrong way.
   - O 绝不低头: the hatching piles up behind her back while she stands it out, and the slap throws it all forward.
   - L 雨夜嘶吼: alone in the rain (a blue haze, a storm of black, white and red slashes round her), then the light
     of the five playing together for the first time: prism rays at the mic, bands of colour crossing the stage, a
     white tide; the storm thins with each scream and is gone after the tide.
   Nothing written on screen. Textures (hatching, blot, rays) are baked once per page and only stamped. */

export const NINA_SCREEN_BACK: readonly string[] = ['nina-rain'];
/** Behind the bodies: the dark and the hatching must never cover her (or them). */
export const NINA_BACK: readonly string[] = ['nina-spines', 'nina-spot', 'nina-burst', 'nina-glare', 'nina-unbowed'];

const RED = '#ee1634';
const DEEP = '#c40a26';
const INK = '#0d080c';
const LAMP_RGB = '255,244,214';
const LAMP = '#fff4d6';
/** The practice-room light: warm and cold together, like real stage light. */
const PRISM: readonly string[] = ['#ffd23c', '#7dff6a', '#ff4fc4', '#45e0ff', '#ff9a3c'];
const PRISM_RGB: readonly string[] = ['255,210,60', '125,255,106', '255,79,196', '69,224,255', '255,154,60'];

const count = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  return g ? [c, g] : null;
}

/* ---- baked textures ---- */

let hatchTex: HTMLCanvasElement | null | undefined;
/** The scribble: a bundle of jittery dark strokes running left to right, root at x = 0, thinning out to the tip,
 *  a few red threads in it. Drawn rotated so +x points where the thorns go. */
function hatch(): HTMLCanvasElement | null {
  if (hatchTex !== undefined) return hatchTex;
  const made = canvas(320, 120);
  if (!made) return hatchTex = null;
  const [c, g] = made;
  // A soft dark band underneath, so the bundle reads as a mass and not as loose lines.
  const band = g.createLinearGradient(0, 0, 0, 120);
  band.addColorStop(0, 'rgba(8,4,8,0)');
  band.addColorStop(.5, 'rgba(8,4,8,.55)');
  band.addColorStop(1, 'rgba(8,4,8,0)');
  g.fillStyle = band;
  g.fillRect(0, 20, 300, 80);
  g.lineCap = 'round';
  for (let i = 0; i < 170; i++) {
    const red = i % 17 === 8;
    g.strokeStyle = red ? DEEP : INK;
    g.globalAlpha = red ? .9 : .3 + hash(i, 1) * .6;
    g.lineWidth = red ? 1 : .6 + hash(i, 2) ** 2 * 3.4;
    // Thickest through the middle of the bundle.
    const y0 = 60 + (hash(i, 3) + hash(i, 13) - 1) * 34;
    const slope = (hash(i, 4) - .5) * .18;
    const len = 80 + hash(i, 5) * 230;
    g.beginPath();
    g.moveTo(hash(i, 6) * 40, y0);
    for (let x = 40; x < len; x += 7) g.lineTo(x, y0 + slope * x + (hash(i * 37 + x, 7) - .5) * 3.5);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createLinearGradient(0, 0, 320, 0);
  fade.addColorStop(0, 'rgba(0,0,0,.6)');
  fade.addColorStop(.15, 'rgba(0,0,0,1)');
  fade.addColorStop(.65, 'rgba(0,0,0,.85)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, 320, 120);
  return hatchTex = c;
}
let blotTex: HTMLCanvasElement | null | undefined;
/** The dark behind her: a soft near-black blot with grain in it. */
function blot(): HTMLCanvasElement | null {
  if (blotTex !== undefined) return blotTex;
  const made = canvas(128, 128);
  if (!made) return blotTex = null;
  const [c, g] = made;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(6,2,6,1)');
  r.addColorStop(.5, 'rgba(8,3,8,.9)');
  r.addColorStop(.8, 'rgba(10,4,10,.45)');
  r.addColorStop(1, 'rgba(10,4,10,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 520; i++) {
    const a = hash(i, 11) * TAU, d = Math.sqrt(hash(i, 12)) * 58;
    g.fillStyle = i % 3 ? 'rgba(0,0,0,.45)' : 'rgba(120,40,50,.35)';
    g.fillRect(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1.2, 1.2);
  }
  return blotTex = c;
}
let nightBaked: HTMLCanvasElement | null | undefined;
/** 正义之刺's night: a soft radial dark (inner 1/12 solid), baked once and stretched, instead of a gradient a frame. */
function nightTex(): HTMLCanvasElement | null {
  if (nightBaked !== undefined) return nightBaked;
  const made = canvas(128, 128);
  if (!made) return nightBaked = null;
  const [c, g] = made;
  const r = g.createRadialGradient(64, 64, 64 / 12, 64, 64, 64);
  r.addColorStop(0, 'rgba(4,1,4,.9)');
  r.addColorStop(.55, 'rgba(6,2,6,.72)');
  r.addColorStop(1, 'rgba(6,2,6,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return nightBaked = c;
}
const cometTex: (HTMLCanvasElement | null)[] = [];
/** The thrown lamp's tail, one per layer (0: the wide faint plume, 1: the bright core), pointing left from x = 0
 *  at the lamp... drawn mirrored by the flight direction. Unit box 256 × 64, centre line y = 32. */
function comet(layer: number): HTMLCanvasElement | null {
  if (cometTex[layer] !== undefined) return cometTex[layer];
  const made = canvas(256, 64);
  if (!made) return cometTex[layer] = null;
  const [c, g] = made;
  const tail = g.createLinearGradient(0, 0, 256, 0);
  tail.addColorStop(0, `rgba(${LAMP_RGB},${layer ? .8 : .4})`);
  tail.addColorStop(.6, `rgba(${LAMP_RGB},${layer ? .25 : .12})`);
  tail.addColorStop(1, `rgba(${LAMP_RGB},0)`);
  g.fillStyle = tail;
  // Same outline as before in unit space: half-height 32 at the lamp, the tip drooping 5/half below the line.
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(102, 0, 192, 25.6, 256, 32 + 5 / 1);
  g.bezierCurveTo(192, 32 + 32 * .6, 102, 64, 0, 64);
  g.closePath();
  g.fill();
  return cometTex[layer] = c;
}
const rayTex: (HTMLCanvasElement | null)[] = [];
/** A prism ray: a soft wedge from x = 0 widening to the right, its two edges two neighbouring colours (the light
 *  splitting), fading out along its length. Soft edges by stacking narrower copies (no canvas filter: phones). */
function ray(i: number): HTMLCanvasElement | null {
  if (rayTex[i] !== undefined) return rayTex[i];
  const made = canvas(320, 64);
  if (!made) return rayTex[i] = null;
  const [c, g] = made;
  const across = g.createLinearGradient(0, 4, 0, 60);
  across.addColorStop(0, `rgba(${PRISM_RGB[i]},1)`);
  across.addColorStop(1, `rgba(${PRISM_RGB[(i + 1) % PRISM_RGB.length]},1)`);
  g.fillStyle = across;
  for (let k = 0; k < 7; k++) {
    const w = 1 - k / 7.5;
    g.globalAlpha = .16;
    g.beginPath();
    g.moveTo(0, 32);
    g.lineTo(320, 32 - 28 * w);
    g.lineTo(320, 32 + 28 * w);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-in';
  const along = g.createLinearGradient(0, 0, 320, 0);
  along.addColorStop(0, 'rgba(0,0,0,1)');
  along.addColorStop(.3, 'rgba(0,0,0,.75)');
  along.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = along;
  g.fillRect(0, 0, 320, 64);
  return rayTex[i] = c;
}
const streakTex: (HTMLCanvasElement | null)[] = [];
/** A band of light seen at speed: a long soft spindle in one colour with a faint bright core, tapering at both ends. */
function band(i: number): HTMLCanvasElement | null {
  if (streakTex[i] !== undefined) return streakTex[i];
  const made = canvas(512, 32);
  if (!made) return streakTex[i] = null;
  const [c, g] = made;
  g.fillStyle = `rgb(${PRISM_RGB[i]})`;
  for (let k = 0; k < 6; k++) {
    g.globalAlpha = .17;
    g.beginPath();
    g.ellipse(256, 16, 252 * (1 - k * .07), 15 * (1 - k / 6.4), 0, 0, TAU);
    g.fill();
  }
  g.globalAlpha = .55;
  g.fillStyle = '#fffdf6';
  g.beginPath();
  g.ellipse(256, 16, 200, 1.6, 0, 0, TAU);
  g.fill();
  return streakTex[i] = c;
}

/** Stamp a baked texture with its root at (x, y), pointing along `a`, `len` long and `wide` across. */
function stampAlong(ctx: CanvasRenderingContext2D, tex: HTMLCanvasElement | null, x: number, y: number, a: number, len: number, wide: number): void {
  if (!tex || !(len > 1) || !(wide > 1)) return;
  // The exact inverse instead of save / restore: the full state copy costs more than two transforms.
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.drawImage(tex, 0, -wide / 2, len, wide);
  ctx.rotate(-a);
  ctx.translate(-x, -y);
}
/** A band texture from (x, y) along `a` (radians), `len` long and `wide` across — same no-save trick. */
function bandAt(ctx: CanvasRenderingContext2D, tex: HTMLCanvasElement, x: number, y: number, a: number, len: number, wide: number): void {
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.drawImage(tex, 0, -wide / 2, len, wide);
  ctx.rotate(-a);
  ctx.translate(-x, -y);
}

/** One segment's endpoints, reused by every scratches() call (no per-frame array). */
const SEG = [0, 0, 0, 0];
/** 吸顶灯乱舞's band outline, filled in place each frame (x, y, width share per step; 18 steps at most). */
const SWING_PTS = new Float64Array(3 * 19);
/** Red light scratches: one path, a thin bright stroke and (full quality) a soft wider glow over it. */
function scratches(ctx: CanvasRenderingContext2D, n: number, seg: (i: number, out: number[]) => boolean, width: number, lite: boolean, color = RED): void {
  const out = SEG;
  ctx.beginPath();
  let any = false;
  for (let i = 0; i < n; i++) {
    if (!seg(i, out)) continue;
    ctx.moveTo(out[0], out[1]);
    ctx.lineTo(out[2], out[3]);
    any = true;
  }
  if (!any) return;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  if (lite) return;
  const a = ctx.globalAlpha;
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a * .22;
  ctx.lineWidth = width * 3.4;
  ctx.stroke();
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = op;
}

/** The ceiling light: lamp.png (chroma green cut out) when it has loaded, else a lit frosted disc with a rim. */
const keyCache = new WeakMap<HTMLImageElement, CanvasImageSource>();
function keyed(im: HTMLImageElement): CanvasImageSource {
  const hit = keyCache.get(im);
  if (hit) return hit;
  const made = canvas(im.naturalWidth, im.naturalHeight);
  if (!made) return im;
  const [c, g] = made;
  g.drawImage(im, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) if (px[i + 1] > 240 && px[i] < 20 && px[i + 2] < 20) px[i + 3] = 0;
  g.putImageData(data, 0, 0);
  keyCache.set(im, c);
  return c;
}
function lamp(ctx: CanvasRenderingContext2D, images: ImageCache | undefined, x: number, y: number, size: number, rot: number, lit: number): void {
  ctx.save();
  ctx.translate(x, y);
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * (.3 + .5 * lit);
  glow(ctx, 0, 0, size * 1.25, LAMP_RGB);
  ctx.globalAlpha = a;
  ctx.rotate(rot);
  const im = image(images, NINA_LAMP_SRC);
  if (im) {
    ctx.drawImage(keyed(im), -size / 2, -size / 2, size, size);
  } else {
    const r = size * .46;
    ctx.scale(1, .62);
    ctx.fillStyle = '#c9c4bb';
    dot(ctx, 0, 0, r + 3);
    ctx.fillStyle = lit > .5 ? '#fffaf0' : '#d9d2c4';
    dot(ctx, 0, 0, r);
  }
  ctx.restore();
}
/** A bad contact: mostly on, now and then a quick dip. */
const flicker = (t: number, k = 0) => hash(Math.floor(t * 26), 7 + k) < .24 ? .2 : 1;

const hazeCache = new WeakMap<CanvasRenderingContext2D, CanvasGradient>();
/** The stage at night in the rain: a blue haze, lighter at the top where the light comes from. */
function haze(ctx: CanvasRenderingContext2D): CanvasGradient {
  let g = hazeCache.get(ctx);
  if (!g) {
    g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(46,62,150,.78)');
    g.addColorStop(.55, 'rgba(18,24,70,.84)');
    g.addColorStop(1, 'rgba(8,10,30,.9)');
    hazeCache.set(ctx, g);
  }
  return g;
}

/** Scratch-field parameters. The segment callbacks below are stable, so a five-second hedgehog does not allocate a
 *  closure every frame. One field is drawn at a time; scratches() does not re-enter slantField. */
const FP = { cx: 0, cy: 0, reach: 0, t: 0, rate: 0, base: 0 };
function fieldSeg(i: number, o: number[]): boolean {
  const life = .45 + hash(i, 201) * .6;
  const u = ((FP.t * FP.rate) / life + hash(i, 202)) % 1;
  const a = FP.base + (hash(i, 203) - .5) * .32;
  // Born over a wide field round her, thickest at the body; each drifts a little way up the slant and goes.
  const r = Math.sqrt(hash(i, 204));
  const th = hash(i, 205) * TAU;
  const bx = FP.cx + Math.cos(th) * r * FP.reach * 1.25, by = FP.cy + Math.sin(th) * r * FP.reach * .95;
  const d = u * FP.reach * (.25 + hash(i, 206) * .55);
  const x = bx + Math.cos(a) * d, y = by + Math.sin(a) * d;
  const long = hash(i, 207) < .18;
  const len = (long ? 38 + hash(i, 216) * 50 : 6 + hash(i, 216) * 20) * Math.sin(u * Math.PI);
  if (len < 2) return false;
  o[0] = x; o[1] = y; o[2] = x + Math.cos(a) * len; o[3] = y + Math.sin(a) * len;
  return true;
}
const fieldBright = (i: number, o: number[]) => i % 3 !== 0 && fieldSeg(i, o);
const fieldDim = (i: number, o: number[]) => i % 3 === 0 && fieldSeg(i, o);
function hotSeg(i: number, o: number[]): boolean {
  const u = ((FP.t * FP.rate * 1.3) + hash(i, 213)) % 1;
  const a = FP.base + (hash(i, 214) - .5) * .3;
  const r = Math.sqrt(hash(i, 217)), th = hash(i, 218) * TAU;
  const x = FP.cx + Math.cos(th) * r * FP.reach + Math.cos(a) * u * 60;
  const y = FP.cy + Math.sin(th) * r * FP.reach * .8 + Math.sin(a) * u * 60;
  o[0] = x; o[1] = y; o[2] = x + Math.cos(a) * 22; o[3] = y + Math.sin(a) * 22;
  return true;
}
/** The thorns as the anime draws them: thin red scratches streaming out of the body and away along one slant
 *  (bottom-left to top-right when she faces right), each one respawning at the body when it has gone. `reach` is how
 *  far they travel; `hot` adds white threads. Everything is a function of the clock (no per-particle state). */
function slantField(ctx: CanvasRenderingContext2D, cx: number, cy: number, reach: number, t: number, dir: number, n: number, rate: number, lite: boolean, hot: boolean, specks = 30): void {
  FP.cx = cx; FP.cy = cy; FP.reach = reach; FP.t = t; FP.rate = rate;
  FP.base = -Math.PI / 2 + dir * .62;
  // Two passes: most bright, a third dimmer and thinner, so the field has depth.
  const alpha = ctx.globalAlpha;
  scratches(ctx, n, fieldBright, 1.5, lite);
  ctx.globalAlpha = alpha * .5;
  scratches(ctx, n, fieldDim, 1, true, DEEP);
  ctx.globalAlpha = alpha;
  // Specks between them.
  ctx.fillStyle = RED;
  const m = lite ? Math.ceil(specks / 2) : specks;
  for (let i = 0; i < m; i++) {
    const u = ((t * rate * .7) + hash(i, 208)) % 1;
    const r = Math.sqrt(hash(i, 209)), th = hash(i, 210) * TAU;
    const x = cx + Math.cos(th) * r * reach * 1.3 + Math.cos(FP.base) * u * 40;
    const y = cy + Math.sin(th) * r * reach + Math.sin(FP.base) * u * 40;
    dot(ctx, x, y, (.6 + hash(i, 212) * 1.2) * Math.sin(u * Math.PI));
  }
  if (hot) scratches(ctx, Math.ceil(n / 6), hotSeg, 1, true, '#ffffff');
}

/* ---- I's red / cyan split, drawn behind her own body ---- */

/** 正义之刺: for a beat after the burst her body splits red and cyan, the way the anime's picture does. */
export function drawNinaBack(ctx: CanvasRenderingContext2D, f: Fighter, view: FighterView, footY: number, alpha: number, lite: boolean): void {
  const a = f.attack;
  if (!a || a.skill.fx !== 'nina-thorns' || f.hp <= 0) return;
  const k = 1 - (a.t - a.skill.start) / .32;
  if (!(k > 0) || k > 1) return;
  const off = 7 * k;
  view.draw(ctx, f, f.x - off, footY, alpha * .65 * k, '#ff1e3c');
  if (!lite) view.draw(ctx, f, f.x + off, footY - 1, alpha * .55 * k, '#22e4ff');
}

export function drawNinaShot(ctx: CanvasRenderingContext2D, p: Projectile, liteFx: boolean, images?: ImageCache): boolean {
  if (p.fx !== 'nina-lamp') return false;
  const dir = Math.sign(p.vx) || 1;
  const lit = flicker(p.age);
  ctx.save();
  // Behind it: a soft comet tail of its own light — a faint wide plume and a brighter thin core, both tapering
  // to nothing and drooping a little, as a thrown thing's light smears.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = .3 + .7 * lit;
  for (let layer = 0; layer < 2; layer++) {
    const tex = comet(layer);
    if (!tex) continue;
    const len = layer ? 90 : 140, half = p.size * (layer ? .08 : .2);
    // Mirrored for a leftward throw by drawing into a flipped box.
    ctx.translate(p.x, p.y);
    ctx.scale(-dir, 1);
    ctx.drawImage(tex, 0, -half, len, half * 2);
    ctx.scale(-dir, 1);
    ctx.translate(-p.x, -p.y);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  lamp(ctx, images, p.x, p.y, p.size, p.age * 13 * dir, lit);
  if (!liteFx && lit < 1) {
    ctx.fillStyle = LAMP;
    const t = Math.floor(p.age * 26);
    for (let j = 0; j < 3; j++) sparkle(ctx, p.x + (hash(j, t) - .5) * 50, p.y + (hash(j + 5, t) - .5) * 30, 5);
  }
  ctx.restore();
  return true;
}

export function drawNinaFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('nina-')) return false;
  const el = e.max - e.life;
  const h = e.radius ?? 181;
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    /* ---- U ---- */
    case 'nina-swing': {
      // Two turns of the lamp round her shoulders, its light a smooth tapering band behind it; the thorns rise off
      // her body the whole time (not off the lamp).
      const turns = 2.1;
      const cx = e.x, cy = e.y - h * .74;
      const rx = h * .42, ry = h * .14;
      const ang = (k: number) => -Math.PI / 2 + dir * k * TAU * turns;
      const k = clamp(el / Math.max(.01, e.max - .05), 0, 1);
      const fade = Math.min(1, e.life / .08);
      ctx.globalAlpha = fade * .85;
      slantField(ctx, cx, e.y - h * .5, h * .45, el + 11, dir, count(40, liteFx), 1.1, liteFx, false, 12);
      // The band: a crescent from the tail (thin, faint) to the lamp (wide), one fill and one bright core stroke.
      const span = .2, steps = liteFx ? 10 : 18;
      const k0 = Math.max(0, k - span);
      if (k > k0 + .01) {
        for (let j = 0; j <= steps; j++) {
          const kk = k0 + (k - k0) * j / steps;
          const a = ang(kk);
          SWING_PTS[j * 3] = cx + Math.cos(a) * rx; SWING_PTS[j * 3 + 1] = cy + Math.sin(a) * ry; SWING_PTS[j * 3 + 2] = (j / steps) ** 1.6;
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = LAMP;
        ctx.globalAlpha = fade * .32;
        ctx.beginPath();
        for (let j = 0; j <= steps; j++) {
          const w = 2 + 16 * SWING_PTS[j * 3 + 2];
          const y = SWING_PTS[j * 3 + 1] - w;
          if (j) ctx.lineTo(SWING_PTS[j * 3], y); else ctx.moveTo(SWING_PTS[j * 3], y);
        }
        for (let j = steps; j >= 0; j--) ctx.lineTo(SWING_PTS[j * 3], SWING_PTS[j * 3 + 1] + 2 + 16 * SWING_PTS[j * 3 + 2]);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = fade * .7;
        ctx.strokeStyle = '#fffdf6';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let j = Math.floor(steps * .4); j <= steps; j++) {
          if (j > Math.floor(steps * .4)) ctx.lineTo(SWING_PTS[j * 3], SWING_PTS[j * 3 + 1]); else ctx.moveTo(SWING_PTS[j * 3], SWING_PTS[j * 3 + 1]);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      const a = ang(k);
      ctx.globalAlpha = fade;
      lamp(ctx, images, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 50, a * .5, flicker(el, 1));
      break;
    }
    case 'nina-flicker': {
      const k = el / e.max;
      ctx.globalAlpha = (1 - k) * .7 * flicker(el, 2);
      glow(ctx, e.x, e.y, 46 + 30 * k, LAMP_RGB);
      ctx.globalAlpha = 1 - k;
      scratches(ctx, 5, (i, o) => {
        const a = (dir > 0 ? 0 : Math.PI) + (i - 2) * .35 - .2;
        const r0 = 12 + k * 30, r1 = r0 + 22 * (1 - k);
        o[0] = e.x + Math.cos(a) * r0; o[1] = e.y + Math.sin(a) * r0; o[2] = e.x + Math.cos(a) * r1; o[3] = e.y + Math.sin(a) * r1;
        return true;
      }, 2, liteFx);
      break;
    }
    case 'nina-lamp-break': {
      // The shade gives: a warm pop dying in a flicker, a few glass glints, and the thorns that were behind the light.
      const k = el / e.max;
      ctx.globalAlpha = (1 - k) ** 2 * flicker(el * 1.4, 3);
      glow(ctx, e.x, e.y, 60 + 40 * k, LAMP_RGB);
      ctx.globalAlpha = 1 - k;
      scratches(ctx, count(18, liteFx), (i, o) => {
        const a = -Math.PI / 2 + (hash(i, 61) - .5) * 2.6 + dir * .4;
        const d = (20 + hash(i, 62) * 110) * ease(el / .25);
        const len = 10 + hash(i, 63) * 26;
        o[0] = e.x + Math.cos(a) * d; o[1] = e.y + Math.sin(a) * d;
        o[2] = o[0] + Math.cos(a) * len; o[3] = o[1] + Math.sin(a) * len;
        return true;
      }, 1.8, liteFx);
      ctx.fillStyle = '#fffaf0';
      for (let j = 0; j < count(6, liteFx); j++) {
        const a = hash(j, 64) * TAU, sp = 120 + hash(j, 65) * 160;
        dot(ctx, e.x + Math.cos(a) * sp * el + dir * 30 * el, e.y + Math.sin(a) * sp * el + 380 * el * el, 2.2);
      }
      break;
    }
    /* ---- I ---- */
    case 'nina-burst': {
      // 正义之刺 (episode 1's close-up): the picture behind her goes near-black and grainy, and a field of thin red
      // scratches streams out of her and up along one slant, a few specks among them; a tuft of hatching up and back.
      const cx = e.x, cy = e.y - h * .55;
      const dark = Math.min(1, el / .05) * (1 - clamp((el - .55) / (e.max - .55), 0, 1));
      // The night closing in round her: one radial dark, then the grain on top.
      ctx.globalAlpha = dark * (e.hit ? 1 : .92);
      const nt = nightTex();
      if (nt) ctx.drawImage(nt, cx - h * 2.4, cy - h * 2.4, h * 4.8, h * 4.8);
      const b = blot();
      if (b) {
        ctx.drawImage(b, cx - h * 1.6, cy - h * 1.35, h * 3.2, h * 2.5);
        ctx.globalAlpha = dark * .6;
        ctx.drawImage(b, cx - h * 1.1, cy - h * 1.0, h * 2.2, h * 1.9);
      }
      ctx.globalAlpha = dark * .85;
      stampAlong(ctx, hatch(), cx - dir * 6, cy - h * .15, -Math.PI / 2 - dir * .5, h * (.7 + .7 * ease(el / .25)), h * .75);
      ctx.globalAlpha = dark;
      slantField(ctx, cx, cy, h, el, dir, count(120, liteFx), 1, liteFx, e.hit ?? false);
      break;
    }
    case 'nina-burst-front': {
      // A few of the scratches cross in front of her too, as they do over her hair in the close-up.
      const fade = Math.min(1, el / .05) * (1 - clamp((el - .5) / (e.max - .5), 0, 1));
      ctx.globalAlpha = fade * .9;
      slantField(ctx, e.x, e.y - h * .6, h * .55, el + 7, dir, count(26, liteFx), 1.2, liteFx, false);
      break;
    }
    case 'nina-spines': {
      // The hedgehog: a grainy dark held close behind her and the same slanted scratches streaming off her body,
      // denser and further each level.
      const lvl = Math.max(1, e.n ?? 1);
      const fade = Math.min(1, el / .4, e.life / .3);
      const cx = e.x, cy = e.y - h * .5;
      ctx.globalAlpha = fade * (.45 + .12 * lvl + (e.hit ? .15 : 0));
      const b = blot();
      if (b) ctx.drawImage(b, cx - h * .75, cy - h * .8, h * 1.5, h * 1.55);
      ctx.globalAlpha = fade;
      slantField(ctx, cx, cy - h * .05, h * (.32 + .07 * lvl), el + 3, dir, count(18 + lvl * 14, liteFx), .8, liteFx, e.hit ?? false, 6 + lvl * 3);
      break;
    }
    case 'nina-grow': {
      const k = el / e.max;
      ctx.globalAlpha = 1 - k;
      const cx = e.x, cy = e.y - h * .55;
      scratches(ctx, count(16, liteFx), (i, o) => {
        const a = -Math.PI / 2 + (hash(i, 91) - .5) * 1.8;
        const d = 20 + h * .6 * ease(k * 2) * hash(i, 92);
        o[0] = cx + Math.cos(a) * d; o[1] = cy + Math.sin(a) * d; o[2] = o[0] + Math.cos(a) * 20; o[3] = o[1] + Math.sin(a) * 20;
        return true;
      }, 2, liteFx);
      break;
    }
    case 'nina-prick': {
      const k = el / e.max;
      ctx.globalAlpha = (1 - k) * .8;
      stampAlong(ctx, hatch(), e.x - dir * 20, e.y, dir > 0 ? 0 : Math.PI, 90 * ease(k * 3), 46);
      ctx.globalAlpha = 1 - k;
      scratches(ctx, count(10, liteFx), (i, o) => {
        const a = (dir > 0 ? 0 : Math.PI) + (hash(i, 101) - .5) * 1.1;
        const d = (10 + hash(i, 102) * 70) * ease(k * 2.5);
        o[0] = e.x + Math.cos(a) * d; o[1] = e.y + Math.sin(a) * d; o[2] = o[0] + Math.cos(a) * 22; o[3] = o[1] + Math.sin(a) * 22;
        return true;
      }, 2, liteFx);
      break;
    }
    /* ---- O ---- */
    case 'nina-glare': {
      // 绝不低头: she does not move; behind her back the hatching piles up, red threads seeping through it.
      const k = clamp(el / e.max, 0, 1);
      const fade = Math.min(1, el / .08, e.life / .06);
      const sx = e.x - dir * 12, sy = e.y - h * .66;
      const jitter = (hash(Math.floor(el * 24), 111) - .5) * .08;
      ctx.globalAlpha = fade * .3;
      glow(ctx, e.x, sy + h * .08, h * .36, '217,14,44');
      ctx.globalAlpha = fade * (.7 + .3 * k);
      stampAlong(ctx, hatch(), sx, sy, -Math.PI / 2 - dir * (.75 + jitter), h * (.4 + 1 * ease(k)), h * (.5 + .4 * k));
      stampAlong(ctx, hatch(), sx + dir * 6, sy + h * .12, -Math.PI / 2 - dir * (.95 - jitter), h * (.3 + .8 * ease(k)), h * (.4 + .3 * k));
      ctx.globalAlpha = fade * .8;
      scratches(ctx, count(8, liteFx), (i, o) => {
        const a = -Math.PI / 2 - dir * (.55 + hash(i, 112) * .5);
        const d = h * (.1 + hash(i, 113) * .8 * ease(k));
        o[0] = sx + Math.cos(a) * d; o[1] = sy + Math.sin(a) * d; o[2] = o[0] + Math.cos(a) * 26; o[3] = o[1] + Math.sin(a) * 26;
        return true;
      }, 1, true);
      break;
    }
    case 'nina-unbowed': {
      // The hit lands and she holds: the pile behind her jolts tight and a gust of the slanted scratches leaves her.
      const k = el / e.max;
      const cx = e.x, cy = e.y - h * .55;
      ctx.globalAlpha = (1 - k) * .95;
      stampAlong(ctx, hatch(), cx - dir * 10, cy - h * .1, -Math.PI / 2 - dir * .8, h * (1.2 - .3 * ease(k)), h * .6);
      ctx.globalAlpha = 1 - k;
      slantField(ctx, cx, cy, h * .5, el * 2 + 5, dir, count(30, liteFx), 1.5, liteFx, true, 8);
      break;
    }
    case 'nina-shove': {
      const k = el / e.max;
      ctx.globalAlpha = (1 - k) * .6;
      stampAlong(ctx, hatch(), e.x - dir * 30, e.y, dir > 0 ? 0 : Math.PI, 60 + 40 * k, 30 * (1 - k) + 6);
      break;
    }
    case 'nina-slap': {
      // The slap: everything piled behind her goes forward in one cone, a hard white star where the palm lands.
      const k = el / e.max;
      const pop = ease(el / .06);
      ctx.globalAlpha = (1 - k) * .95;
      stampAlong(ctx, hatch(), e.x - dir * 30, e.y, dir > 0 ? 0 : Math.PI, 90 + 240 * ease(el / .18), 100 + 50 * k);
      ctx.globalAlpha = 1 - k;
      scratches(ctx, count(24, liteFx), (i, o) => {
        const a = (dir > 0 ? 0 : Math.PI) + (hash(i, 121) - .5) * .7 - dir * .25;
        const d = (10 + hash(i, 122) * 230) * ease(el / .22);
        const len = 16 + hash(i, 123) * 30;
        o[0] = e.x + Math.cos(a) * d; o[1] = e.y + Math.sin(a) * d; o[2] = o[0] + Math.cos(a) * len; o[3] = o[1] + Math.sin(a) * len;
        return true;
      }, 2.2, liteFx);
      ctx.globalAlpha = Math.max(0, 1 - el / .22);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      const spikes = 9;
      for (let j = 0; j < spikes * 2; j++) {
        const a = j / (spikes * 2) * TAU + .2;
        const r = (j % 2 ? 16 : 50 + hash(j, 124) * 24) * pop;
        const x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r * .8;
        if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    /* ---- L ---- */
    case 'nina-rain': {
      // Alone in the rain: a blue haze over the stage and a storm of slashes round her — black, white and red, the
      // thorns and the rain at once. Each scream lifts the haze and thins the storm; after the tide it is gone.
      const S = NINA_SCREAM;
      let passed = 0;
      for (const w of S.waves) if (el >= w) passed++;
      const tide = clamp((el - S.tide) / .35, 0, 1);
      const fade = Math.min(1, el / .25, e.life / .4);
      ctx.globalAlpha = fade * (1 - passed * .12) * (1 - tide * .7);
      ctx.fillStyle = haze(ctx);
      ctx.fillRect(0, 0, W, H);
      const keep = (1 - passed * .26) * (1 - tide);
      if (keep <= 0) break;
      const n = count(240, liteFx);
      const ox = e.x, oy = e.y - 110;
      // Short slashes along one slant, packed round her and thinning outward (the stage shot of the storm).
      const vx = -.42 * dir, vy = 1;
      for (let c = 0; c < 3; c++) {
        ctx.beginPath();
        let any = false;
        for (let j = c; j < n; j += 3) {
          if (hash(j, 131) > keep) continue;
          const spread = .12 + hash(j, 132) ** 1.8 * .9;
          const sp = 600 + hash(j, 133) * 500;
          const run = (el * sp + hash(j, 134) * 500) % 500 - 250;
          const x = ox + (hash(j, 135) - .5) * 720 * spread + vx * run * .5;
          const y = oy + (hash(j, 136) - .5) * 420 * spread + vy * run * .5;
          const len = 8 + hash(j, 137) * 22;
          ctx.moveTo(x, y);
          ctx.lineTo(x + vx * len, y + vy * len);
          any = true;
        }
        if (!any) continue;
        ctx.globalAlpha = fade * (c === 1 ? .6 : .85);
        ctx.strokeStyle = c === 0 ? INK : c === 1 ? '#e8f0ff' : RED;
        ctx.lineWidth = c === 0 ? 2 : 1.4;
        ctx.stroke();
      }
      break;
    }
    case 'nina-spot': {
      const fade = Math.min(1, el / .25, e.life / .3);
      const w0 = 40, w1 = h * .7;
      ctx.globalAlpha = fade * .16;
      ctx.fillStyle = '#fff2e0';
      ctx.beginPath();
      ctx.moveTo(e.x - w0, 0);
      ctx.lineTo(e.x + w0, 0);
      ctx.lineTo(e.x + w1, e.y);
      ctx.lineTo(e.x - w1, e.y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = fade * .3;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, w1, 14, 0, 0, TAU);
      ctx.fill();
      break;
    }
    case 'nina-prism': {
      // The practice room: the moment they played together the light fanned out of the music — wide soft prism rays
      // reaching across the frame, slowly turning, a small flare at the source.
      const n = e.n ?? 0;
      const rays = count(9 + n * 2, liteFx);
      const open = ease(el / .14);
      const fade = 1 - clamp((el - .2) / (e.max - .2), 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      for (let j = 0; j < rays; j++) {
        // Mostly forward, some up and behind, all slowly turning.
        const back = j % 5 === 4;
        const a = (back ? (dir > 0 ? Math.PI : 0) : (dir > 0 ? 0 : Math.PI)) + (back ? dir : -dir) * (hash(j, 141) * 1.5 - .45) + el * .35 * (j % 2 ? 1 : -1) * dir;
        const len = (380 + hash(j, 143) * 420 + n * 60) * open;
        const tex = ray(j % PRISM.length);
        ctx.globalAlpha = fade * (.3 + hash(j, 144) * .3 + n * .05);
        if (tex) stampAlong(ctx, tex, e.x, e.y, a, len, 60 + hash(j, 145) * 90 + n * 14);
      }
      ctx.globalAlpha = fade * (.4 + n * .05);
      glow(ctx, e.x, e.y, 40 + 8 * n, '255,248,232');
      // The flare: a thin horizontal line and a small four-point star.
      ctx.globalAlpha = fade * .55;
      ctx.strokeStyle = '#fff6e6';
      streak(ctx, e.x - 120 - 40 * n, e.y, e.x + 120 + 40 * n, e.y, 1.5);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = fade * .9;
      sparkle(ctx, e.x, e.y, 16 + 4 * n);
      break;
    }
    case 'nina-wave': {
      // A scream's light crossing the stage: soft bands of colour streaking past at speed, thick and thin,
      // slightly slanted, thinning out once they have crossed.
      const n = e.n ?? 0;
      const range = e.radius ?? 460;
      const front = el * NINA_SCREAM.speed;
      const fade = Math.min(1, e.life / .3);
      const lines = count(14 + n * 4, liteFx);
      ctx.globalCompositeOperation = 'lighter';
      for (let j = 0; j < lines; j++) {
        const len = 200 + hash(j, 151) * 360;
        const head = front - hash(j, 152) * 140;
        if (head <= 0) continue;
        const tail = Math.max(20, head - len);
        const reach = range + 300;
        const x1 = Math.min(head, reach), x0 = Math.min(tail, reach);
        if (x1 - x0 < 10) continue;
        const y = e.y + (hash(j, 154) - .5) * (110 + n * 50);
        const thick = 3 + hash(j, 155) ** 2 * (16 + n * 6);
        const tilt = (hash(j, 153) - .5) * .06 - .03;
        const out = clamp((tail - range) / 220, 0, 1);
        ctx.globalAlpha = fade * (1 - out) * (.35 + hash(j, 156) * .45);
        const tex = band(j % PRISM.length);
        if (tex) bandAt(ctx, tex, e.x + dir * x0, y, dir > 0 ? tilt : Math.PI - tilt, x1 - x0, thick);
      }
      break;
    }
    case 'nina-tide': {
      // The tide: every colour at once, dense, warm at the front — bright, but the bodies stay readable.
      const range = e.radius ?? 460;
      const front = el * NINA_SCREAM.tideSpeed;
      const fade = 1 - clamp((el - .4) / (e.max - .4), 0, 1);
      const lines = count(30, liteFx);
      ctx.globalCompositeOperation = 'lighter';
      for (let j = 0; j < lines; j++) {
        const head = front - hash(j, 161) * 160;
        if (head <= 0) continue;
        const tail = Math.max(40, head - (300 + hash(j, 162) * 420));
        const x1 = Math.min(head, range + 420), x0 = Math.min(tail, range + 420);
        if (x1 - x0 < 10) continue;
        const y = e.y + (hash(j, 163) - .5) * 230;
        const thick = 4 + hash(j, 164) ** 2 * 26;
        ctx.globalAlpha = fade * (.3 + hash(j, 165) * .4);
        const tex = band(j % PRISM.length);
        if (tex) bandAt(ctx, tex, e.x + dir * x0, y, dir > 0 ? -.02 : Math.PI + .02, x1 - x0, thick);
      }
      const fx = e.x + dir * Math.min(front, range + 100);
      ctx.globalAlpha = fade * .45;
      glow(ctx, fx, e.y, 110, '255,244,226');
      if (!liteFx) {
        ctx.fillStyle = '#ffffff';
        for (let j = 0; j < 8; j++) {
          ctx.globalAlpha = fade * (.8 - hash(j, 166) * .4);
          sparkle(ctx, fx - dir * hash(j, 167) * 180, e.y + (hash(j, 168) - .5) * 200, 6 + hash(j, 169) * 8);
        }
      }
      break;
    }
    case 'nina-pinky': {
      const k = el / e.max;
      ctx.globalAlpha = Math.min(1, el / .1) * (1 - k);
      glow(ctx, e.x, e.y, 30, '255,230,233');
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x, e.y - 6 - k * 14, 10 + 4 * Math.sin(el * 14));
      break;
    }
    default:
      break;
  }
  ctx.restore();
  return true;
}
