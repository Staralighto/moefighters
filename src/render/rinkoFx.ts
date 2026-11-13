import type { Effect, Projectile } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { RINKO_BLOOM, RINKO_CHAT, RINKO_DOT_GAP, RINKO_KAOMOJI } from '../game/rinkoPath.ts';
import { TAU, burst, dot, glow, hash, sparkle, stampText } from './fxParticles.ts';

/* 白金燐子 — 白与灰紫，安静但一出手就满屏。Three registers, kept apart so each move reads at a glance:
   - 社恐: her tent (tent.png, or a drawn fallback) — it drops and squashes, sways as she plods, wears a little
     pennant, and now and then a small 「……」 drifts out of the door slit; a big
     white speech bubble whose only words are 「……」, the dots dropping out of it as heavy ink drops (I), and the same
     empty bubble over whoever is silenced ('rinko-hush');
   - 网游 RinRin: a translucent chat window scrolling her lines, and kaomoji flying out of it (O);
   - 燐燐开花 (L), her piano-competition fright and the first note: a cold grey stage round one spotlight and a
     heartbeat at her feet; the note sends a ring of colour out that washes the grey away; keys of light run along
     the floor under a glowing stave; each beat on them is a note of a rising arpeggio that bursts into petals; then
     a white-and-lilac stained-glass rose window opens behind them, layer by layer, with light through it, and breaks
     into a petal storm that sweeps the screen.
   Cost: every petal, key, beam and the four layers of the window are painted once into cached canvases (with their
   gradients) and stamped with drawImage; per frame the only gradient is the grey wash. No shadowBlur. The busiest
   moment, the window with its rays and the petal storm, stays near 70 stamps (about half in lite). */

export const RINKO_BACK: readonly string[] = ['rinko-glass', 'rinko-keyboard', 'rinko-ring', 'rinko-tent-drop'];
export const RINKO_SCREEN_BACK: readonly string[] = ['rinko-spot'];
export const RINKO_SCREEN_FRONT: readonly string[] = ['rinko-petals'];
export const RINKO_TENT_SRC = '/sprites/rinko/tent.png';

const INK = '#231d30';
const LILAC = '#b9a8e0';
const WHITE_RGB = '255,255,255';
const LILAC_RGB = '196,180,240';
const ROSE_RGB = '246,240,255';
const BLUSH = '#ffb3cc';

const n = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const fadeIO = (el: number, life: number, a: number, b: number) => clamp(Math.min(el / a, life / b), 0, 1);

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}
const keyCache = new WeakMap<HTMLImageElement, CanvasImageSource>();
/** The picture with the chroma green and the placeholder sheet chrome cut out. */
function keyed(im: HTMLImageElement): CanvasImageSource {
  const hit = keyCache.get(im);
  if (hit) return hit;
  if (typeof document === 'undefined') return im;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
  if (!g) return im;
  g.drawImage(im, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gv = px[i + 1], b = px[i + 2];
    const chroma = gv > 240 && r < 20 && b < 20;
    const sheet = Math.abs(r - 26) <= 3 && Math.abs(gv - 21) <= 3 && Math.abs(b - 40) <= 3;
    const grid = Math.abs(r - 255) <= 8 && Math.abs(gv - 54) <= 12 && Math.abs(b - 200) <= 12;
    if (chroma || sheet || grid) px[i + 3] = 0;
  }
  g.putImageData(data, 0, 0);
  keyCache.set(im, c);
  return c;
}

/* ---- cached stamps: painted once, gradients and all, then only drawImage ---- */

const stamps = new Map<string, HTMLCanvasElement | null>();
function stamp(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
  const hit = stamps.get(key);
  if (hit !== undefined) return hit;
  let c: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined') {
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (g) paint(g); else c = null;
  }
  stamps.set(key, c);
  return c;
}

/** The transform the current effect is drawn under, read once per effect (see drawRinkoFx / drawRinkoShot). */
let base: DOMMatrix | null = null;
/** Stamp `c` (w × h) centred on (x, y), turned by rot and scaled (sx, sy), without a save/restore: the transform is
 *  set to base × local and put straight back. Petals and window layers are drawn dozens of times a frame, and a full
 *  state save per stamp costs more than the stamp. Falls back to save/restore where there is no getTransform. */
function place(ctx: CanvasRenderingContext2D, c: CanvasImageSource, x: number, y: number, w: number, h: number, rot: number, sx = 1, sy = 1): void {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const la = cs * sx, lb = sn * sx, lc = -sn * sy, ld = cs * sy;
  if (!base) {
    ctx.save();
    ctx.transform(la, lb, lc, ld, x, y);
    ctx.drawImage(c, -w / 2, -h / 2, w, h);
    ctx.restore();
    return;
  }
  const B = base;
  ctx.setTransform(B.a * la + B.c * lb, B.b * la + B.d * lb, B.a * lc + B.c * ld, B.b * lc + B.d * ld, B.a * x + B.c * y + B.e, B.b * x + B.d * y + B.f);
  ctx.drawImage(c, -w / 2, -h / 2, w, h);
  ctx.setTransform(B);
}

/** One pane of the rose window: a petal outline filled with tinted glass, leaded, with a midrib of lead. */
function glassPetal(g: CanvasRenderingContext2D, ang: number, r: number, w: number, inner: string, outer: string): void {
  g.save();
  g.rotate(ang);
  const gr = g.createLinearGradient(0, -r * .1, 0, -r);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(0, -r * .08);
  g.bezierCurveTo(-w, -r * .3, -w * 1.15, -r * .9, -w * .25, -r);
  g.quadraticCurveTo(0, -r * 1.07, w * .25, -r);
  g.bezierCurveTo(w * 1.15, -r * .9, w, -r * .3, 0, -r * .08);
  g.closePath();
  g.fill();
  lead(g, 3.2);
  g.beginPath(); g.moveTo(0, -r * .2); g.quadraticCurveTo(w * .12, -r * .55, 0, -r * .86);
  lead(g, 1.8);
  g.restore();
}
/** Lead came: a dark lilac line with a fine white highlight running along it (light catching the edge). */
function lead(g: CanvasRenderingContext2D, w: number): void {
  g.strokeStyle = 'rgba(96,76,150,.92)';
  g.lineWidth = w;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.6)';
  g.lineWidth = Math.max(.8, w * .3);
  g.stroke();
}
const GLASS_PX = 384;
/** The rose window in four layers, each its own stamp so they can open one after another: 0 the outer petals in a
 *  ring of round panes, 1 the middle petals, 2 the inner petals, 3 the heart (a pale disc and its spokes). White, lilac
 *  and a breath of pink, all see-through. */
function glassStamp(layer: number): HTMLCanvasElement | null {
  return stamp('glass' + layer, GLASS_PX, GLASS_PX, g => {
    const m = GLASS_PX / 2, R = m - 6;
    g.translate(m, m);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (layer === 0) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        g.beginPath(); g.arc(Math.cos(a) * (R - 11), Math.sin(a) * (R - 11), 9, 0, TAU);
        g.fillStyle = i % 2 ? 'rgba(206,188,248,.6)' : 'rgba(255,236,248,.55)';
        g.fill();
        lead(g, 2.2);
      }
      for (let i = 0; i < 8; i++) glassPetal(g, (i / 8) * TAU, R - 26, (R - 26) * .36, 'rgba(236,228,255,.62)', 'rgba(196,176,246,.5)');
    } else if (layer === 1) {
      for (let i = 0; i < 8; i++) glassPetal(g, (i / 8 + 1 / 16) * TAU, R * .64, R * .22, 'rgba(255,240,250,.66)', 'rgba(232,190,236,.5)');
    } else if (layer === 2) {
      for (let i = 0; i < 6; i++) glassPetal(g, (i / 6) * TAU, R * .42, R * .17, 'rgba(255,255,255,.72)', 'rgba(210,196,252,.58)');
    } else {
      const r = R * .17;
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, 'rgba(255,255,255,.95)');
      gr.addColorStop(1, 'rgba(214,200,255,.7)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      lead(g, 3);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        g.beginPath(); g.moveTo(Math.cos(a) * r * .3, Math.sin(a) * r * .3); g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        lead(g, 1.6);
      }
      g.beginPath(); g.arc(0, 0, r * .3, 0, TAU);
      g.fillStyle = '#ffffff';
      g.fill();
      lead(g, 1.6);
    }
  });
}
/** A loose petal: a curved white blade with a lilac base and a fine vein. */
const PETAL_W = 24, PETAL_H = 36;
function looseStamp(shade: boolean): HTMLCanvasElement | null {
  return stamp('loose' + (shade ? 1 : 0), PETAL_W, PETAL_H, g => {
    const gr = g.createLinearGradient(0, PETAL_H, 0, 0);
    gr.addColorStop(0, shade ? '#cbbde8' : '#ddd3f3');
    gr.addColorStop(.5, '#f6f2ff');
    gr.addColorStop(1, '#ffffff');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(PETAL_W / 2, PETAL_H - 1);
    g.bezierCurveTo(1, PETAL_H * .7, 0, PETAL_H * .2, PETAL_W * .4, 2);
    g.quadraticCurveTo(PETAL_W / 2, 0, PETAL_W * .6, 2);
    g.bezierCurveTo(PETAL_W, PETAL_H * .2, PETAL_W - 1, PETAL_H * .7, PETAL_W / 2, PETAL_H - 1);
    g.fill();
    g.strokeStyle = 'rgba(170,150,215,.35)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(PETAL_W / 2, PETAL_H - 4); g.quadraticCurveTo(PETAL_W * .45, PETAL_H * .5, PETAL_W / 2, 6); g.stroke();
  });
}
/** A petal tumbling: `flip` is its spin about its own long axis, so it narrows and widens like a real one. */
function loose(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number, flip: number, shade: boolean): void {
  const c = looseStamp(shade);
  if (!c || !(size > 0)) return;
  const sx = Math.cos(flip);
  if (Math.abs(sx) < .08) return;
  place(ctx, c, x, y, size * PETAL_W / PETAL_H, size, rot, sx);
}
/** Piano keys seen low over the floor, painted at 3× so the bevels stay crisp: a white key, the same key lit and
 *  pressed, and a glossy black key. Each has a top face leaning away from the viewer, a front face that gives it
 *  thickness, a bright bevel on the near-left edge, a shadow on the right edge, and a soft diagonal sheen. */
const KEY_W = 24, KEY_H = 20, KEY_S = 3;
/** Stamp size in game pixels; the stamp's (0, 0) sits KEY_PAD up and left of the key's top-left corner. */
const KEY_PAD = 3, KEY_BOX_W = KEY_W + 10, KEY_BOX_H = KEY_H + 10;
function keyStamp(kind: 'white' | 'lit' | 'black'): HTMLCanvasElement | null {
  return stamp('key3' + kind, KEY_BOX_W * KEY_S, KEY_BOX_H * KEY_S, g => {
    g.scale(KEY_S, KEY_S);
    g.translate(KEY_PAD, KEY_PAD);
    const black = kind === 'black';
    const w = black ? 12 : KEY_W - 6, h = black ? 11 : KEY_H - 4, lean = black ? 2.5 : 4, depth = black ? 3 : 4;
    const top = () => { g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w + lean, h); g.lineTo(lean, h); g.closePath(); };
    const front = () => { g.beginPath(); g.moveTo(lean, h); g.lineTo(w + lean, h); g.lineTo(w + lean, h + depth); g.lineTo(lean, h + depth); g.closePath(); };
    // Front face first (the thickness), darker and cooler.
    const fg = g.createLinearGradient(0, h, 0, h + depth);
    if (kind === 'white') { fg.addColorStop(0, '#cfc6e8'); fg.addColorStop(1, '#9f93c4'); }
    else if (kind === 'lit') { fg.addColorStop(0, '#d9c6ff'); fg.addColorStop(1, '#a98ae8'); }
    else { fg.addColorStop(0, '#1d1828'); fg.addColorStop(1, '#0a080e'); }
    g.fillStyle = fg;
    front();
    g.fill();
    // Top face.
    const tg = g.createLinearGradient(0, 0, 0, h);
    if (kind === 'white') { tg.addColorStop(0, '#ffffff'); tg.addColorStop(.7, '#f4f1fb'); tg.addColorStop(1, '#e2dcf2'); }
    else if (kind === 'lit') { tg.addColorStop(0, '#ffffff'); tg.addColorStop(.5, '#f3ebff'); tg.addColorStop(1, '#dccbff'); }
    else { tg.addColorStop(0, '#5b5180'); tg.addColorStop(.35, '#2c2440'); tg.addColorStop(1, '#16121f'); }
    g.fillStyle = tg;
    top();
    g.fill();
    if (kind === 'lit') {
      // Light from inside the key: a soft lilac bloom in the middle of the face.
      g.save();
      top();
      g.clip();
      const ig = g.createRadialGradient(w / 2 + lean / 2, h * .55, 0, w / 2 + lean / 2, h * .55, w * .7);
      ig.addColorStop(0, 'rgba(200,170,255,.55)');
      ig.addColorStop(1, 'rgba(200,170,255,0)');
      g.fillStyle = ig;
      g.fillRect(0, 0, w + lean, h);
      g.restore();
    }
    // A diagonal sheen across the face.
    g.save();
    top();
    g.clip();
    g.fillStyle = black ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.5)';
    g.beginPath(); g.moveTo(w * .15, 0); g.lineTo(w * .38, 0); g.lineTo(w * .2 + lean, h); g.lineTo(lean - w * .05, h); g.closePath(); g.fill();
    g.restore();
    // Bevels: the near-left and back edges catch the light, the right edge sits in shadow, the front lip glints.
    g.lineCap = 'round';
    g.lineWidth = .7;
    g.strokeStyle = black ? 'rgba(200,190,240,.7)' : 'rgba(255,255,255,.95)';
    g.beginPath(); g.moveTo(lean, h); g.lineTo(0, 0); g.lineTo(w, 0); g.stroke();
    g.strokeStyle = black ? 'rgba(0,0,0,.6)' : kind === 'lit' ? 'rgba(150,110,230,.6)' : 'rgba(120,105,170,.55)';
    g.beginPath(); g.moveTo(w, 0); g.lineTo(w + lean, h); g.lineTo(w + lean, h + depth); g.stroke();
    g.strokeStyle = black ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.8)';
    g.lineWidth = .5;
    g.beginPath(); g.moveTo(lean + .6, h + .3); g.lineTo(w + lean - .6, h + .3); g.stroke();
  });
}
/** One key at (x, y) top-left, `rise` 0–1 lifting it out of the floor. */
function key(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement | null, x: number, y: number, rise: number): void {
  if (!c || rise <= 0) return;
  const h = KEY_BOX_H * rise;
  ctx.drawImage(c, x - KEY_PAD, y - KEY_PAD + KEY_BOX_H - h, KEY_BOX_W, h);
}
/** A soft vertical shaft of light: clear at the sides and the top, brightest down the middle near the floor. */
function beamStamp(): HTMLCanvasElement | null {
  return stamp('beam', 64, 256, g => {
    const across = g.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, `rgba(${ROSE_RGB},0)`);
    across.addColorStop(.5, `rgba(${WHITE_RGB},.9)`);
    across.addColorStop(1, `rgba(${ROSE_RGB},0)`);
    g.fillStyle = across;
    g.fillRect(0, 0, 64, 256);
    g.globalCompositeOperation = 'destination-in';
    const down = g.createLinearGradient(0, 0, 0, 256);
    down.addColorStop(0, 'rgba(0,0,0,0)');
    down.addColorStop(.35, 'rgba(0,0,0,.7)');
    down.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = down;
    g.fillRect(0, 0, 64, 256);
  });
}
/** The spotlight cone: nested faint trapezoids, so its edges fall off softly, fading in from the top. */
function coneStamp(): HTMLCanvasElement | null {
  return stamp('cone', 128, 256, g => {
    for (let i = 0; i < 14; i++) {
      const top = 4 + i * 1.1, bot = 14 + i * 3.75;
      g.fillStyle = `rgba(${i < 6 ? WHITE_RGB : LILAC_RGB},.038)`;
      g.beginPath(); g.moveTo(64 - top, 0); g.lineTo(64 + top, 0); g.lineTo(64 + bot, 256); g.lineTo(64 - bot, 256); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'destination-in';
    const down = g.createLinearGradient(0, 0, 0, 256);
    down.addColorStop(0, 'rgba(0,0,0,.15)');
    down.addColorStop(.6, 'rgba(0,0,0,.85)');
    down.addColorStop(.86, 'rgba(0,0,0,1)');
    down.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = down;
    g.fillRect(0, 0, 128, 256);
  });
}
/** A flat pool of light on the floor: the glow squashed into an ellipse, so it lies on the ground instead of a disc
 *  standing up out of it. */
function pool(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, rgb: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, .22);
  glow(ctx, 0, 0, rx, rgb);
  ctx.restore();
}

/* ---- shared pieces ---- */

/** A rounded speech bubble, centre (x, y), with a tail pointing down toward `tx`. */
function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tx: number): void {
  const r = Math.min(h / 2, 22);
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + r, y - h / 2);
  ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, r);
  ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, r);
  ctx.lineTo(tx + 8, y + h / 2);
  ctx.lineTo(tx - 4, y + h / 2 + 16);
  ctx.lineTo(tx - 6, y + h / 2);
  ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, r);
  ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, r);
  ctx.closePath();
}
/** A heavy ink dot with a lilac sheen: one of her 「……」. */
function inkDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (!(r > 0)) return;
  ctx.fillStyle = INK;
  dot(ctx, x, y, r);
  ctx.fillStyle = 'rgba(200,185,255,.55)';
  dot(ctx, x - r * .32, y - r * .34, r * .3);
}

/* ---- the tent (U) ---- */

const TENT_W = 190, TENT_H = 178;
interface TentLook {
  /** Turn about the tent's middle (in flight). */
  roll?: number;
  /** Squash about the base: sx widens, sy flattens. */
  sx?: number; sy?: number;
  /** Lean about the base (the plod). */
  lean?: number;
  /** The eyes in the door slit, and the pennant on top: 0 to 1. */
  eyes?: number; flag?: number;
  t: number;
  lite: boolean;
}
/** The tent with its floor at (x, y). */
function tent(ctx: CanvasRenderingContext2D, images: ImageCache | undefined, x: number, y: number, dir: number, o: TentLook): void {
  const im = image(images, RINKO_TENT_SRC);
  const w = TENT_W, h = TENT_H;
  ctx.save();
  ctx.translate(x, y);
  if (o.roll) { ctx.translate(0, -h / 2); ctx.rotate(o.roll); ctx.translate(0, h / 2); }
  if (o.lean) ctx.rotate(o.lean);
  ctx.scale(dir * (o.sx ?? 1), o.sy ?? 1);
  if (im) ctx.drawImage(keyed(im), -128, -217, 256, 256);
  else {
    // Fallback: a little grey-violet ridge tent with a darker door flap.
    ctx.fillStyle = '#8f86a8';
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(0, -h); ctx.lineTo(w / 2, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6f6690';
    ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(w / 2, 0); ctx.lineTo(w * .18, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a3150';
    ctx.beginPath(); ctx.moveTo(w * .02, -h * .6); ctx.lineTo(w * .2, 0); ctx.lineTo(-w * .14, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d8d0ee';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-w / 2 - 6, 0); ctx.lineTo(0, -h - 6); ctx.lineTo(w / 2 + 6, 0); ctx.stroke();
  }
  const flag = o.flag ?? 0;
  if (flag > 0) {
    // A pennant on the apex: a short pole and a little white flag with a lilac rose dot, rippling.
    ctx.globalAlpha = flag;
    ctx.strokeStyle = '#6a5f86';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -h - 2); ctx.lineTo(0, -h - 24); ctx.stroke();
    const wv = Math.sin(o.t * 6) * 3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -h - 24); ctx.quadraticCurveTo(10, -h - 24 + wv, 22, -h - 19 + wv * .6);
    ctx.quadraticCurveTo(10, -h - 15 - wv * .4, 0, -h - 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = LILAC;
    dot(ctx, 9, -h - 19 + wv * .5, 2.5);
    ctx.globalAlpha = 1;
  }
  const eyes = o.eyes ?? 0;
  if (eyes > 0) {
    // Dead-fish eyes in the door slit, blinking now and then.
    const blink = (o.t * .7) % 1 < .06 ? .15 : 1;
    const ey = -h * .48;
    ctx.globalAlpha = eyes;
    ctx.fillStyle = '#1a1424';
    ctx.beginPath(); ctx.ellipse(w * .1, ey, w * .085, 8.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#a69bc4';
    for (const ex of [w * .06, w * .14]) {
      ctx.beginPath(); ctx.ellipse(ex, ey, 4.5, 4 * blink, 0, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#e8e2ff';
    ctx.fillRect(w * .06 - 1, ey - 2, 1.5, 1.5);
    ctx.fillRect(w * .14 - 1, ey - 2, 1.5, 1.5);
  }
  ctx.restore();
}
function drawTent(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean, images: ImageCache | undefined): void {
  const dir = e.dir ?? 1;
  const fall = .16;
  const drop = el < fall ? (1 - el / fall) ** 2 * 240 : 0;
  // Landing: a squash, a small rebound, settle.
  const u = clamp((el - fall) / .32, 0, 1);
  const bounce = el < fall ? 0 : Math.sin(u * Math.PI * 2) * (1 - u) * .2;
  const sy = el < fall ? 1.08 : 1 - bounce;
  const sx = el < fall ? .94 : 1 + bounce * .7;
  const plod = el > fall + .32 ? Math.sin(el * 7) * .025 : 0;
  const hop = el > fall + .32 ? Math.abs(Math.sin(el * 7)) * 2.5 : 0;
  const out = clamp(e.life / .1, 0, 1);
  // The shadow first, tightening as it falls.
  ctx.globalAlpha = .28 * out * (1 - drop / 300);
  ctx.fillStyle = '#120e1c';
  ctx.beginPath(); ctx.ellipse(e.x, FLOOR + 2, 104 * (1 - drop / 600), 12, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = out;
  const settle = clamp((el - fall) / .25, 0, 1);
  tent(ctx, images, e.x, e.y - drop - hop, dir, { sx, sy, lean: plod, eyes: settle, flag: settle, t: el, lite });
  // A puff of dust at the hem now and then, as she plods.
  if (!lite && el > .4) {
    const k = (el * 1.6) % 1;
    ctx.globalAlpha = (1 - k) * .3 * out;
    glow(ctx, e.x - dir * (70 + k * 30), FLOOR - 6 - k * 10, 14 + k * 10, '214,206,230');
  }
  // Now and then a small 「……」 drifts out of the door slit.
  if (el > .5) {
    const k = ((el - .5) / 1.3) % 1;
    ctx.globalAlpha = Math.sin(k * Math.PI) * .85 * out;
    stampText(ctx, '……', e.x + dir * (38 + k * 26), e.y - TENT_H * .55 - k * 34, 17, '#ffffff', '#5a4d7a');
  }
}

/* ---- I's bubble ---- */

/** On her while she works up to speaking: ink dots stream from round her waist up into the bubble (the words being
 *  squeezed out), a faint lilac aura shivers up her body, two little tremble marks at her shoulders, a blush; each
 *  dot that drops out of the bubble pushes a thin ring off her chest. e.x, e.y is her middle, radius her height. */
function drawMuster(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const h = e.radius ?? 177;
  const dir = e.dir ?? 1;
  const t0 = e.t0 ?? .42;
  const k = clamp(el / .12, 0, 1) * clamp(e.life / .18, 0, 1);
  if (k <= 0) return;
  const shake = (hash(Math.floor(el * 28), 5) - .5) * 2;
  // The aura: soft lilac wisps rising up her body.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0, m = n(6, lite); i < m; i++) {
    const u = (el * .9 + i / m) % 1;
    ctx.globalAlpha = k * Math.sin(u * Math.PI) * .5;
    glow(ctx, e.x + (hash(i, 41) - .5) * 44 + Math.sin(el * 5 + i) * 6, e.y + h * .45 - u * h * .95, 20 + hash(i, 42) * 14, LILAC_RGB);
  }
  // A ring off her chest each time a dot drops out of the bubble.
  for (let i = 0; i < 3; i++) {
    const p = (el - (t0 + i * RINKO_DOT_GAP)) / .3;
    if (p <= 0 || p >= 1) continue;
    ctx.globalAlpha = (1 - p) * .7 * k;
    ctx.strokeStyle = '#efe8ff';
    ctx.lineWidth = 2 * (1 - p) + .5;
    ctx.beginPath(); ctx.ellipse(e.x + dir * 6, e.y - h * .12, 26 + p * 46, 12 + p * 20, 0, 0, TAU); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  // The dots streaming up: each starts on an orbit round her waist and spirals into the bubble over her head.
  const bx = e.x + dir * 30, by = e.y - h * .5 - 46;
  for (let i = 0, m = n(9, lite); i < m; i++) {
    const u = (el * 1.3 + i / m) % 1;
    const a = (i / m) * TAU + el * 4;
    const ox = e.x + Math.cos(a) * 34, oy = e.y + h * .08 + Math.sin(a) * 12;
    const w = u * u;
    const x = ox + (bx - ox) * w + Math.cos(a + u * 6) * 10 * (1 - u);
    const y = oy + (by - oy) * w;
    const vis = k * Math.sin(u * Math.PI);
    // A pale halo under each dot so it reads on her dark hair and a dark stage.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = vis * .55;
    glow(ctx, x, y, 9, LILAC_RGB);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = vis;
    inkDot(ctx, x, y, 3 + (1 - u) * 1.8);
  }
  // Tremble marks at her shoulders, and a blush.
  ctx.globalAlpha = k * .85;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const sx = e.x + side * 26 + shake, sy = e.y - h * .2;
    ctx.beginPath();
    ctx.moveTo(sx + side * 4, sy - 8);
    ctx.quadraticCurveTo(sx + side * 10, sy - 2, sx + side * 5, sy + 4);
    ctx.quadraticCurveTo(sx + side * 1, sy + 9, sx + side * 7, sy + 13);
    ctx.stroke();
  }
  ctx.globalAlpha = k * (.55 + .2 * Math.sin(el * 9));
  ctx.fillStyle = BLUSH;
  ctx.beginPath(); ctx.ellipse(e.x + dir * 12 + shake * .5, e.y - h * .3, 6, 3, 0, 0, TAU); ctx.fill();
}

const BUBBLE_CAPTION = ['注意！我们伟大的', '键盘手有话要说：'];
function drawBubble(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const t0 = e.t0 ?? .42;
  const dir = e.dir ?? 1;
  const grow = ease(el / (t0 * .9));
  const out = clamp((e.life) / .2, 0, 1);
  const k = grow * out;
  if (k <= 0) return;
  const w = 170 * k, h = 92 * k;
  const x = e.x, y = e.y - 10;
  ctx.globalAlpha = .5 * k;
  glow(ctx, x, y, w * .75, WHITE_RGB);
  ctx.globalAlpha = .96 * out;
  ctx.fillStyle = '#ffffff';
  bubble(ctx, x, y, w, h, x - dir * 26 * k);
  ctx.fill();
  ctx.strokeStyle = LILAC;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  if (k < .8) return;
  stampText(ctx, BUBBLE_CAPTION[0], x, y - 28, 11, '#6b5f88', '', 700);
  stampText(ctx, BUBBLE_CAPTION[1], x, y - 14, 11, '#6b5f88', '', 700);
  // The three dots: each swells as its turn nears and is gone once it has dropped out.
  for (let i = 0; i < 3; i++) {
    const at = t0 + i * RINKO_DOT_GAP;
    if (el >= at) continue;
    const near = clamp(1 - (at - el) / .35, 0, 1);
    const r = (i === 2 ? 9 : 7) * (1 + near * .5);
    const jit = near > .6 && !lite ? (hash(Math.floor(el * 40), i) - .5) * 2.5 : 0;
    inkDot(ctx, x + (i - 1) * 34 + jit, y + 16, r);
  }
}

/* ---- O's chat window ---- */

function drawChat(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const t0 = e.t0 ?? .3;
  const k = ease(el / .18) * clamp(e.life / .18, 0, 1);
  if (k <= 0) return;
  const w = 210, h = 112;
  const x = e.x - w / 2, y = e.y - h / 2;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(k, k);
  ctx.translate(-e.x, -e.y);
  ctx.globalAlpha = .82;
  ctx.fillStyle = '#141a33';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#7fb8ff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#2b4f8f';
  ctx.beginPath(); ctx.roundRect(x, y, w, 18, [8, 8, 0, 0]); ctx.fill();
  stampText(ctx, 'NFO · 队伍聊天', x + 56, y + 9, 10, '#dbe9ff', '', 700);
  ctx.fillStyle = '#ff7a9a';
  dot(ctx, x + w - 12, y + 9, 3.5);
  // Her lines scroll up as fast as she types.
  const typed = Math.max(0, el - t0) / .2;
  const shown = Math.min(RINKO_CHAT.length, Math.floor(typed) + 1);
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    const li = shown - rows + r;
    if (li < 0) continue;
    const line = RINKO_CHAT[li];
    const half = measureHalf(line);
    const ly = y + 32 + r * 21;
    if (li !== shown - 1) {
      stampText(ctx, line, x + 8 + half, ly, 11, '#9fb6dd', '', 600);
      continue;
    }
    // The line being typed is the whole line's stamp revealed by a growing clip, not a new stamp per letter.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 6, ly - 10, 2 + half * 2 * clamp(typed - li, .25, 1), 20);
    ctx.clip();
    stampText(ctx, line, x + 8 + half, ly, 11, '#ffffff', '', 600);
    ctx.restore();
  }
  if (Math.floor(el * 6) % 2 === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 10, y + h - 12, 6, 2);
  }
  ctx.restore();
  // Little taps of light at her fingertips.
  if (el > t0) {
    ctx.fillStyle = '#cfe4ff';
    for (let i = 0; i < n(5, lite); i++) {
      const u = (el * 4 + hash(i, 7)) % 1;
      ctx.globalAlpha = (1 - u) * .9;
      sparkle(ctx, e.x - (e.dir ?? 1) * (58 - hash(i, 8) * 20), e.y + 44 + hash(i, 9) * 16 - u * 14, 4 * (1 - u) + 1.5);
    }
  }
}
/** Text stamps are drawn centred; the chat lines are left-aligned. Half of a rough width of the line at 11 px. */
function measureHalf(s: string): number {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 255 ? 11 : 6.2;
  return w / 2;
}

/* ---- L ---- */

function drawSpot(ctx: CanvasRenderingContext2D, e: Effect, el: number): void {
  // Before her first note the stage is cold and grey round her one spotlight; the note sends a ring of colour out
  // from her that washes the grey off the whole screen, a bright lilac rim riding its edge.
  const t0 = e.t0 ?? .9;
  const into = ease(el / .25);
  const out = clamp(e.life / .35, 0, 1);
  const flood = clamp((el - t0) / .65, 0, 1);
  const cx = e.x, cy = e.y - 90;
  if (flood < 1) {
    const hole = flood > 0 ? 110 + ease(flood) * 1150 : 110;
    const reach = hole + 420;
    const grey = .74 * into * out;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
    const h0 = Math.max(0, (hole - 70) / reach), h1 = hole / reach;
    gr.addColorStop(0, 'rgba(26,30,44,0)');
    gr.addColorStop(h0, 'rgba(26,30,44,0)');
    if (flood > 0) {
      gr.addColorStop(Math.min(.999, h1), `rgba(225,210,255,${.55 * (1 - flood)})`);
      gr.addColorStop(Math.min(1, h1 + .04), `rgba(26,30,44,${grey})`);
    } else gr.addColorStop(Math.min(1, h1 + .2), `rgba(26,30,44,${grey})`);
    gr.addColorStop(1, `rgba(26,30,44,${grey})`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
  }
  // The spotlight: cold white while she freezes, warming to lilac once she plays, and gone as the colour returns.
  const cone = coneStamp();
  if (cone) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .75 * into * out * (1 - flood * .8);
    // The cone runs a little past the floor line and fades out there (its stamp fades at the bottom), so it never
    // stops on a hard edge; the pool lies flat under it.
    ctx.drawImage(cone, cx - 128, 0, 256, FLOOR + 44);
    ctx.globalAlpha = .5 * into * out * (1 - flood * .6);
    pool(ctx, cx, FLOOR + 2, 130, flood > 0 ? LILAC_RGB : WHITE_RGB);
    ctx.globalCompositeOperation = 'source-over';
  }
  // Her heartbeat while she freezes: a thin double ring at her feet, thump-thump.
  if (el < t0) {
    for (let beat = 0; beat < 2; beat++) {
      const ph = ((el + beat * .18) / .75) % 1;
      ctx.globalAlpha = (1 - ph) * .55 * into;
      ctx.strokeStyle = '#e9e2ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx, FLOOR, 40 + ph * 70, 7 + ph * 11, 0, 0, TAU); ctx.stroke();
    }
  }
}
/** The keys of light, laid along the floor from e.x to e.x + tx, lit and pressed as the head runs past; a glowing
 *  stave of notes flows over them. */
function drawKeyboard(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const dir = e.dir ?? 1;
  // It grows at the keys' speed on its own clock until the hit stops it (vx 0); tx is the full or the stopped length.
  const len = Math.min(Math.abs(e.tx ?? 0), e.vx ? el * e.vx : Infinity);
  const out = clamp(e.life / .45, 0, 1);
  if (len <= 0 || out <= 0) return;
  const keys = Math.min(40, Math.floor(len / KEY_W) + 1);
  const y = FLOOR + 1;
  const white = keyStamp('white'), lit = keyStamp('lit'), black = keyStamp('black');
  // How far behind the running head key i is, in keys: it has risen out of the floor by 1.2, is pressed within 5,
  // and glows within 9.
  const behindOf = (i: number) => (len - i * KEY_W) / KEY_W;
  const riseOf = (b: number) => clamp(b / 1.2 + .25, 0, 1);
  const pressOf = (b: number) => b < 5 ? 1 - b / 5 : 0;
  // Pass 1, the white keys; pass 2, the black keys over the gaps (so the next white key never covers them).
  ctx.globalAlpha = out;
  for (let i = 0; i < keys; i++) {
    const b = behindOf(i);
    key(ctx, b < 9 * .75 ? lit : white, e.x + dir * i * KEY_W - KEY_W / 2, y + pressOf(b) * 2.5, riseOf(b));
  }
  if (black) {
    for (let i = 0; i < keys - 1; i++) {
      const note = i % 7;
      if (note === 2 || note === 6) continue;
      const b = behindOf(i);
      key(ctx, black, e.x + dir * i * KEY_W + KEY_W / 2 - 7, y - 2 + pressOf(b) * 2, riseOf(b));
    }
  }
  // Pass 3, all the light at once: the line where the keys meet the floor, the glow under the keys near the head,
  // and a tiny glint off the lip of the key pressed deepest.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = .28 * out;
  ctx.fillStyle = LILAC;
  ctx.fillRect(Math.min(e.x, e.x + dir * len) - 14, y + KEY_H - 2, len + 28, 3);
  ctx.fillStyle = '#ffffff';
  for (let i = Math.max(0, keys - 10); i < keys; i++) {
    const b = behindOf(i);
    if (b >= 9) continue;
    const x = e.x + dir * i * KEY_W + 2;
    ctx.globalAlpha = out * (1 - b / 9) * .55;
    glow(ctx, x, y + 9, 24, LILAC_RGB);
    const press = pressOf(b);
    if (!lite && press > .6) {
      ctx.globalAlpha = out * (press - .6) * 2.5;
      sparkle(ctx, x, y + KEY_H - 2, 5);
    }
  }
  // The stave: five thin glowing lines waving over the keys, still in the light pass.
  const head = e.x + dir * len;
  const steps = lite ? 10 : 18;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = .5 * out;
  for (let l = 0; l < 5; l++) {
    ctx.strokeStyle = l % 2 ? LILAC : '#ffffff';
    ctx.beginPath();
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const px = e.x + dir * len * u;
      const py = y - 74 - l * 7 + Math.sin(px * .018 + el * 3) * 8 * u;
      if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  // Notes ride the stave toward the head.
  for (let i = 0; i < n(7, lite); i++) {
    const u = (el * .9 + i / 7) % 1;
    const px = e.x + dir * len * u;
    const py = y - 84 - (i % 4) * 6 + Math.sin(px * .018 + el * 3) * 8 * u;
    ctx.globalAlpha = out * Math.sin(u * Math.PI);
    stampText(ctx, i % 3 ? '♪' : '♫', px, py - 6, 16, '#ffffff', '', 900);
  }
  // The running head.
  ctx.globalAlpha = out * .5;
  glow(ctx, head, y - 26, 50, ROSE_RGB);
  ctx.globalCompositeOperation = 'source-over';
  if (!lite) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      const u = (el * 2.2 + hash(i, 31)) % 1;
      ctx.globalAlpha = (1 - u) * out;
      sparkle(ctx, e.x + dir * hash(i, 32) * len, y - u * 60, 3 + (1 - u) * 3);
    }
  }
}
/** One note of the arpeggio: it streaks in from below-behind, lands with a ring and a sparkle, and bursts into a
 *  ring of petals that spin out and drift. */
function drawNote(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const dir = e.dir ?? 1;
  const fly = .1;
  const i = e.n ?? 0;
  if (el < fly) {
    const u = ease(el / fly);
    const x = e.x - dir * 120 * (1 - u), y = e.y + 70 * (1 - u);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .9;
    glow(ctx, x, y, 34, LILAC_RGB);
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dir * 50, y + 30); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    stampText(ctx, i % 2 ? '♫' : '♪', x, y, 26, '#ffffff', '#8a72d0');
    return;
  }
  const k = (el - fly) / (e.max - fly);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (1 - k) * .45;
  glow(ctx, e.x, e.y, 40 * (1 - k * .5), LILAC_RGB);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2 * (1 - k) + .4;
  ctx.beginPath(); ctx.arc(e.x, e.y, 14 + ease(k) * 56, 0, TAU); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  if (k < .35) {
    ctx.globalAlpha = 1 - k / .35;
    ctx.fillStyle = '#ffffff';
    sparkle(ctx, e.x, e.y, 18 * (1 - k / .35) + 5);
  }
  const m = n(10, lite);
  for (let j = 0; j < m; j++) {
    const a = (j / m) * TAU + i * .7;
    const d = 12 + ease(k) * 62;
    ctx.globalAlpha = Math.min(1, (1 - k) * 1.6);
    loose(ctx, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * .8 + k * k * 30, 17, a + Math.PI / 2 + k * 3, k * 6 + j, j % 2 === 0);
  }
}
/** The rose window behind them: rays turning behind it, a glow at its heart, and four leaded layers opening one after
 *  another, outside in; at the shatter it swells a little and fades as it becomes the petal storm. */
function drawGlass(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const R = e.radius ?? 150;
  const shatter = RINKO_BLOOM.shatter;
  const out = el < shatter ? 1 : clamp(1 - (el - shatter) / .35, 0, 1);
  const swell = el < shatter ? 0 : ease((el - shatter) / .35) * .1;
  const open = ease(el / .45);
  ctx.globalCompositeOperation = 'lighter';
  const beam = beamStamp();
  if (beam) {
    // Each ray hangs off the centre: placed at its midpoint, half its length out along its own angle.
    ctx.globalAlpha = .22 * open * out;
    for (let i = 0, m = n(8, lite); i < m; i++) {
      const a = (i / m) * TAU + el * .35;
      place(ctx, beam, e.x + Math.sin(a) * R * 1.15, e.y - Math.cos(a) * R * 1.15, 36, R * 2.3, a);
    }
  }
  ctx.globalAlpha = .55 * open * out;
  glow(ctx, e.x, e.y, R * 1.25, ROSE_RGB);
  ctx.globalCompositeOperation = 'source-over';
  for (let layer = 0; layer < 4; layer++) {
    const k = ease((el - layer * .08) / .32);
    if (k <= 0) continue;
    const c = glassStamp(layer);
    if (!c) continue;
    const s = (.5 + .5 * k + swell) * R * 2 * GLASS_PX / (GLASS_PX - 12);
    ctx.globalAlpha = k * out;
    place(ctx, c, e.x, e.y, s, s, (1 - k) * (layer % 2 ? -.7 : .7) + el * (layer % 2 ? -.06 : .06));
  }
  // Light through the glass: a white pulse at the heart as the last layer lands.
  const pulse = clamp(1 - Math.abs(el - .4) / .15, 0, 1);
  if (pulse > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = pulse;
    glow(ctx, e.x, e.y, R * .7, WHITE_RGB);
    ctx.fillStyle = '#ffffff';
    sparkle(ctx, e.x, e.y, 34 * pulse + 8);
    ctx.globalCompositeOperation = 'source-over';
  }
}
/** The window breaks into petals: they burst out of its centre, are swept along by a wind her way of facing, flip as
 *  they go and drift down across the whole screen; soft lights float among them. */
function drawPetals(ctx: CanvasRenderingContext2D, e: Effect, el: number, lite: boolean): void {
  const t = el - (e.t0 ?? 0);
  if (t <= 0) return;
  const dir = e.dir ?? 1;
  const out = clamp(e.life / .5, 0, 1);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0, m = n(8, lite); i < m; i++) {
    const a = hash(i, 21) * TAU;
    const d = 60 + hash(i, 22) * 260 * ease(t / 1.2);
    ctx.globalAlpha = out * clamp(t / .3, 0, 1) * (.14 + hash(i, 23) * .12);
    glow(ctx, e.x + Math.cos(a) * d + dir * t * 50, e.y + Math.sin(a) * d * .6 - t * 15, 22 + hash(i, 24) * 26, i % 2 ? LILAC_RGB : ROSE_RGB);
  }
  ctx.globalCompositeOperation = 'source-over';
  const spread = 1 - Math.exp(-1.8 * t);
  for (let i = 0, m = n(46, lite); i < m; i++) {
    const a = hash(i, 1) * TAU;
    const sp = 260 + hash(i, 2) * 520;
    const x = e.x + Math.cos(a) * sp * spread * .55 + dir * (90 + hash(i, 3) * 120) * t + Math.sin(t * 2.2 + i) * 14;
    const y = e.y + Math.sin(a) * sp * spread * .4 + 34 * t * t + hash(i, 4) * 10;
    if (x < -30 || x > W + 30 || y > H + 30) continue;
    ctx.globalAlpha = out * (.65 + hash(i, 5) * .35);
    loose(ctx, x, y, 15 + hash(i, 6) * 13, a + t * (1 + hash(i, 7) * 2), t * (5 + hash(i, 8) * 5) + i, i % 3 === 0);
  }
}

export function drawRinkoFx(ctx: CanvasRenderingContext2D, e: Effect, lite = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('rinko-') || e.type.includes('@')) return false;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  base = ctx.getTransform?.() ?? null;
  switch (e.type) {
    /* -- U 帐篷出行 -- */
    case 'rinko-tent': drawTent(ctx, e, el, lite, images); break;
    case 'rinko-tent-drop': {
      // The landing: a ring of dust skids out along the floor, with a few motes kicked up.
      const k = el / e.max;
      ctx.globalAlpha = (1 - k) * .55;
      ctx.strokeStyle = '#e6e0f5';
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, (e.radius ?? 90) * (.6 + k), 14 * (.6 + k), 0, 0, TAU); ctx.stroke();
      burst(el, 17, { n: n(10, lite), speed: [60, 160], life: .45, gravity: -40, drag: .6, spread: Math.PI, angle: -Math.PI / 2 }, (x, y, kk) => {
        ctx.globalAlpha = (1 - kk) * .5;
        glow(ctx, x, y, 10 + kk * 12, '214,206,230');
      }, e.x, e.y - 6);
      break;
    }
    case 'rinko-tent-fold': {
      // She went down inside it: the tent sags flat, wide and low, then fades, with a sigh of dust.
      const k = ease(el / .35);
      ctx.globalAlpha = clamp(e.life / .25, 0, 1);
      tent(ctx, images, e.x, FLOOR, dir, { sx: 1 + k * .3, sy: 1 - k * .85, t: el, lite });
      ctx.globalAlpha = (1 - el / e.max) * .5;
      glow(ctx, e.x - 70, FLOOR - 8, 22, '214,206,230');
      glow(ctx, e.x + 70, FLOOR - 8, 22, '214,206,230');
      break;
    }
    case 'rinko-tent-crash': {
      const k = el / e.max;
      burst(el, 23, { n: n(14, lite), speed: [120, 300], life: .55, gravity: 380, drag: .3, spread: Math.PI * .9, angle: -Math.PI / 2 }, (x, y, kk, i) => {
        ctx.globalAlpha = (1 - kk) * .8;
        if (i % 3 === 0) { ctx.fillStyle = '#a69bc4'; dot(ctx, x, y, 3); } else glow(ctx, x, y, 10 + kk * 10, '214,206,230');
      }, e.x, FLOOR - 40);
      ctx.globalAlpha = (1 - k);
      stampText(ctx, '咚！', e.x + dir * 20, FLOOR - 150 - k * 20, 22 + (1 - k) * 8, '#ffffff', '#5a4d7a');
      break;
    }
    /* -- I 键盘手有话要说 -- */
    case 'rinko-bubble': drawBubble(ctx, e, el, lite); break;
    case 'rinko-muster': drawMuster(ctx, e, el, lite); break;
    case 'rinko-hush-pop': {
      const k = ease(el / .18) * clamp(e.life / .25, 0, 1);
      ctx.globalAlpha = k;
      ctx.fillStyle = '#ffffff';
      bubble(ctx, e.x, e.y, 84 * k, 42 * k, e.x - 10);
      ctx.fill();
      ctx.strokeStyle = LILAC; ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < 3; i++) inkDot(ctx, e.x + (i - 1) * 16, e.y, 4 * k);
      break;
    }
    /* -- O 线上话痨模式 -- */
    case 'rinko-chat': drawChat(ctx, e, el, lite); break;
    /* -- L 燐燐开花 -- */
    case 'rinko-spot': drawSpot(ctx, e, el); break;
    case 'rinko-shiver': {
      const k = clamp(e.life / .15, 0, 1) * ease(el / .15);
      const j = (hash(Math.floor(el * 30), 3) - .5) * 4;
      ctx.globalAlpha = k;
      stampText(ctx, '……', e.x + j, e.y, 26, '#ffffff', INK);
      ctx.fillStyle = '#bfe3ff';
      const u = (el * 1.4) % 1;
      ctx.globalAlpha = k * (1 - u);
      ctx.beginPath(); ctx.ellipse(e.x + 30, e.y + 14 + u * 20, 3.5, 5.5, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'rinko-chord': {
      // The first chord: a bloom of light at her hands, a thin ring, and six sparkles flung out.
      const k = el / e.max;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - k) * .8;
      glow(ctx, e.x + dir * 30, e.y + 20, 60 + k * 50, ROSE_RGB);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5 * (1 - k) + .5;
      ctx.beginPath(); ctx.arc(e.x + dir * 30, e.y + 20, 20 + k * 110, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + .3;
        sparkle(ctx, e.x + dir * 30 + Math.cos(a) * (30 + k * 80), e.y + 20 + Math.sin(a) * (30 + k * 80), 6 * (1 - k) + 1);
      }
      break;
    }
    case 'rinko-keyboard': drawKeyboard(ctx, e, el, lite); break;
    case 'rinko-ring': {
      const k = el / e.max;
      ctx.globalAlpha = (1 - k) * .8;
      ctx.strokeStyle = '#f2eeff';
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, (e.radius ?? 110) * ease(k), 20 * ease(k), 0, 0, TAU); ctx.stroke();
      break;
    }
    case 'rinko-note': drawNote(ctx, e, el, lite); break;
    case 'rinko-glass': drawGlass(ctx, e, el, lite); break;
    case 'rinko-petals': drawPetals(ctx, e, el, lite); break;
    case 'rinko-smile': {
      const k = fadeIO(el, e.life, .15, .3);
      ctx.globalAlpha = k * .8;
      ctx.fillStyle = BLUSH;
      ctx.beginPath(); ctx.ellipse(e.x - 14, e.y + 40, 7, 3.5, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(e.x + 14, e.y + 40, 7, 3.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = k;
      sparkle(ctx, e.x + 30, e.y - 4 - el * 20, 7);
      break;
    }
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  return true;
}

export function drawRinkoShot(ctx: CanvasRenderingContext2D, p: Projectile, lite = false, images?: ImageCache): boolean {
  if (!p.fx.startsWith('rinko-')) return false;
  const dir = Math.sign(p.vx) || p.face || 1;
  ctx.save();
  base = ctx.getTransform?.() ?? null;
  switch (p.fx) {
    case 'rinko-tent-fly': {
      // Tumbling end over end: two fading afterimages behind it and swish arcs.
      const roll = dir * p.age * 9;
      const foot = p.y + TENT_H / 2;
      ctx.strokeStyle = 'rgba(230,224,245,.55)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath(); ctx.arc(p.x - dir * (20 + i * 22), p.y, 72 - i * 10, Math.PI * .6, Math.PI * 1.4); ctx.stroke();
      }
      for (let i = lite ? 1 : 2; i >= 1; i--) {
        ctx.globalAlpha = .22 / i;
        tent(ctx, images, p.x - p.vx * .035 * i, foot, dir, { roll: roll - dir * .32 * i, t: p.age, lite });
      }
      ctx.globalAlpha = 1;
      tent(ctx, images, p.x, foot, dir, { roll, flag: 1, t: p.age, lite });
      break;
    }
    case 'rinko-dots': {
      const r = (p.wave === 2 ? 15 : 11) * Math.min(1, p.age / .08 + .3);
      ctx.globalAlpha = .35;
      glow(ctx, p.x, p.y, r * 2.6, '180,160,235');
      ctx.globalAlpha = 1;
      for (let i = 1; i <= (lite ? 1 : 3); i++) {
        ctx.globalAlpha = .28 / i;
        inkDot(ctx, p.x - dir * i * r * 1.3, p.y, r * (1 - i * .15));
      }
      ctx.globalAlpha = 1;
      inkDot(ctx, p.x, p.y, r);
      break;
    }
    case 'rinko-chat': {
      const face = RINKO_KAOMOJI[(p.wave ?? 0) % RINKO_KAOMOJI.length];
      const last = p.wave === RINKO_KAOMOJI.length - 1;
      const wob = Math.sin(p.age * 18 + (p.wave ?? 0)) * 2;
      ctx.globalAlpha = .4;
      glow(ctx, p.x, p.y, 34, last ? '255,170,200' : '160,205,255');
      ctx.globalAlpha = 1;
      stampText(ctx, face, p.x, p.y + wob, last ? 22 : 17, '#ffffff', last ? '#e0577f' : '#3b6fc4');
      break;
    }
    case 'rinko-keys': {
      // The running head: a bright note of light skimming the floor, a comet tail of petals behind it.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = .9;
      glow(ctx, p.x, p.y, 46, ROSE_RGB);
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, p.x, p.y, 16 + Math.sin(p.age * 30) * 3);
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < (lite ? 2 : 4); i++) {
        const u = ((p.age * 6 + i / 4) % 1);
        ctx.globalAlpha = (1 - u) * .9;
        loose(ctx, p.x - dir * (20 + u * 90), p.y - 6 - u * 30 + Math.sin(i * 2 + u * 6) * 8, 10, u * 4 + i, u * 10 + i, i % 2 === 0);
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

/* ---- 'rinko-hush' (沉默 from 键盘手有话要说): an empty speech bubble over the head, 「……」 inside ---- */

export function auraRinkoHush(ctx: CanvasRenderingContext2D, f: Fighter, bodyH: number, left: number, t: number): void {
  const fade = Math.min(1, left / .3);
  const y = f.y - bodyH - 34 + Math.sin(t * 3) * 3;
  ctx.save();
  ctx.globalAlpha = fade * .92;
  ctx.fillStyle = '#ffffff';
  bubble(ctx, f.x, y, 62, 30, f.x - f.facing * 8);
  ctx.fill();
  ctx.strokeStyle = LILAC;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const bob = Math.max(0, Math.sin(t * 5 - i * .8)) * 2.5;
    inkDot(ctx, f.x + (i - 1) * 13, y - bob, 3.4);
  }
  ctx.restore();
}
export function applyRinkoHush(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  ctx.save();
  burst(age, 29, { n: 8, speed: [40, 110], life: .5, gravity: 60, drag: .4 }, (x, y, k) => {
    ctx.globalAlpha = (1 - k) * .8;
    ctx.fillStyle = INK;
    dot(ctx, x, y, 2.5);
  }, e.x, e.y - 160);
  ctx.restore();
}
