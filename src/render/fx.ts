import type { Effect, FightGame, FloatingText, Particle, Projectile } from '../game/game.ts';
import { SHIP_HOLD, SHIP_SWEEP } from '../game/combat.ts';
import type { Fighter } from '../game/fighter.ts';
import { clamp, FLOOR, H, SIDE, W } from '../game/constants.ts';
import type { ImageCache } from '../assets/loader.ts';
import { CELL, clipFor, pillarFrame } from './clips.ts';
import { watchProp } from './propLayout.ts';

const CUCUMBER_SRC = '/sprites/mutsumi/cucumber.png';
const NOTE_SRC = '/sprites/mutsumi/note.png';
const MORTIS_SRC = '/sprites/mutsumi/mortis.png';
const KIT_SRC = '/sprites/nyamu/kit.png';
const MILK_SRC = '/sprites/umiri/milk.png';
const BAG_SRC = '/sprites/umiri/bag.png';
const GUITAR_SRC = '/sprites/anon/guitar.png';
/** Headstock on the current guitar sheet. The body is the far end, so the pivot is not the image center. */
const GUITAR_HEAD_X = 438 / 512;
const GUITAR_HEAD_Y = 122 / 256;
const LAYER_BASS_SRC = '/sprites/layer/bass.png';
/** Neck/body joint on the 512×256 bass. Rotation pivots here. */
const LAYER_BASS_GRIP = { x: 212, y: 122 };
/** 燃尽 windup, hit, recover. Recover size 0 leaves the hands empty. */
const LAYER_BASS_POSES = [
  { x: -60, y: -242, rot: 1.18, size: 220 },
  { x: 136, y: -54, rot: 3.24, size: 220 },
  { x: 0, y: 0, rot: 0, size: 0 },
] as const;
const MITAKE_GUITAR_SRC = '/sprites/mitake/guitar.png';
/** Grip and round-body center on the 2048×1024 sheet, after the tuned gx offset. */
const MITAKE_GRIP = { x: 462, y: 597 };
const MITAKE_BODY_ANG = Math.atan2(569 - 597, 1617 - 462);
/** Windup, hit, recover. deg: 0 is forward, positive is up. rot is added on top. */
const MITAKE_POSES = [
  { x: -38, y: -150, rot: 4.56, size: 160, deg: 45 },
  { x: 35, y: -45, rot: 0.3, size: 160, deg: 0 },
  { x: 0, y: 0, rot: 0, size: 0, deg: -20 },
] as const;
const ANON_NOTE_SRC = '/sprites/anon/note.png';
const SOYO_NOTE_SRC = '/sprites/soyo/note.png';
const HEART_SRC = '/sprites/anon/heart.png';
const STONE_SRC = '/sprites/tomori/stone.png';
const PLASTER_SRC = '/sprites/tomori/plaster.png';
const PARFAIT_SRC = '/sprites/rana/parfait.png';
const MATCHA_SRC = '/sprites/rana/matcha.png';
const SEAL_SRC = '/sprites/miyako/seal.png';
const FUGA_ARROW_SRC = '/sprites/viola/fuga-arrow.png';
const FUGA_BURST_SRC = '/sprites/viola/fuga-burst.png';
const MEAT_SRC = '/sprites/yuno/meat.png';
const YUNO_NOTE_SRC = '/sprites/yuno/note.png';
const DONUT_STRAW_SRC = '/sprites/mana/donut-straw.png';
const DONUT_CHOC_SRC = '/sprites/mana/donut-choc.png';
const MANA_HEART_SRC = '/sprites/mana/heart.png';
const SHIP_SRC = '/sprites/kokoro/ship.png';
const BALL_SRC = '/sprites/kokoro/ball.png';
const WAVE_SRC = '/sprites/kokoro/wave.png';
const KASUMI_STAR_SRC = '/sprites/kasumi/star.png';
const PILLAR_SRC = '/sprites/yukina/pillar.png';
const JELLY_SRC = '/sprites/mashiro/jelly.png';
const WHALE_SRC = '/sprites/mashiro/whale.png';
const MORTIS_H = 181;

/* Drop the pose-sheet chrome and the chroma key so a placeholder can sit in the fight. */
const cutCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

function keyed(im: HTMLImageElement): CanvasImageSource {
  const hit = cutCache.get(im);
  if (hit) return hit;
  if (typeof document === 'undefined' || !im.naturalWidth) return im;
  const canvas = document.createElement('canvas');
  canvas.width = im.naturalWidth;
  canvas.height = im.naturalHeight;
  const g = canvas.getContext('2d');
  if (!g) return im;
  g.drawImage(im, 0, 0);
  const data = g.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gv = px[i + 1], b = px[i + 2];
    const chroma = gv > 240 && r < 20 && b < 20;
    const sheet = Math.abs(r - 26) <= 3 && Math.abs(gv - 21) <= 3 && Math.abs(b - 40) <= 3;
    const grid = Math.abs(r - 255) <= 8 && Math.abs(gv - 54) <= 12 && Math.abs(b - 200) <= 12;
    if (chroma || sheet || grid) px[i + 3] = 0;
  }
  g.putImageData(data, 0, 0);
  cutCache.set(im, canvas);
  return canvas;
}

function prop(ctx: CanvasRenderingContext2D, images: ImageCache | undefined, src: string, size: number): boolean {
  const im = images?.get(src);
  if (!im?.naturalWidth) return false;
  const s = Math.max(16, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(keyed(im), -s / 2, -s / 2, s, s);
  return true;
}

/** Dash, grab, punch, kick, punch, kick, then the exit stance. */
function mortisFrame(p: number): [number, number] {
  if (p < 0.08) return [0, 0];
  if (p < 0.16) return [0, 1];
  if (p < 0.26) return [0, 2];
  if (p < 0.34) return [1, 1];
  if (p >= 0.74) return [3, 2];
  const beats: [number, number][] = [[2, 1], [3, 1], [2, 1], [3, 1]];
  return beats[Math.min(3, Math.floor((p - 0.34) / 0.1))];
}

/** The pose she just left, while the flurry is still going. Null on the approach and the exit. */
export function mortisAfterimage(p: number): [number, number] | null {
  if (p < 0.34 || p >= 0.74) return null;
  const cur = mortisFrame(p);
  const prev = mortisFrame(p - 0.1);
  if (prev[0] === cur[0] && prev[1] === cur[1]) return null;
  return prev;
}

let ghostBuf: HTMLCanvasElement | undefined;

const silhouetteCache = new WeakMap<CanvasImageSource, Map<string, HTMLCanvasElement>>();

/** A flat single-colour silhouette of any image, source-atop like the mortis ghost.
 *  ponytail: the result is pure per (source, size, colour), so it bakes once; the per-src
 *  map stays tiny (one effect, one colour each) and clears rather than growing. */
function tintedSilhouette(src: CanvasImageSource, w: number, h: number, color: string): CanvasImageSource | null {
  if (typeof document === 'undefined') return null;
  const bw = Math.round(w), bh = Math.round(h);
  let perSrc = silhouetteCache.get(src);
  if (!perSrc) { perSrc = new Map(); silhouetteCache.set(src, perSrc); }
  const key = bw + 'x' + bh + '|' + color;
  const hit = perSrc.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = bw;
  canvas.height = bh;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.drawImage(src, 0, 0, bw, bh);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, bw, bh);
  if (perSrc.size >= 8) perSrc.clear();
  perSrc.set(key, canvas);
  return canvas;
}

function drawMortisGhost(ctx: CanvasRenderingContext2D, im: HTMLImageElement, col: number, row: number, alpha: number): void {
  if (typeof document === 'undefined') return;
  if (!ghostBuf) ghostBuf = document.createElement('canvas');
  // Assigning width/height resets the bitmap even when the value is unchanged; guard it.
  if (ghostBuf.width !== CELL) { ghostBuf.width = CELL; ghostBuf.height = CELL; }
  const g = ghostBuf.getContext('2d');
  if (!g) return;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.clearRect(0, 0, CELL, CELL);
  g.globalCompositeOperation = 'source-over';
  g.drawImage(keyed(im), col * CELL, row * CELL, CELL, CELL, 0, 0, CELL, CELL);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = '#c8ffd2';
  g.fillRect(0, 0, CELL, CELL);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(ghostBuf, -10 - MORTIS_H / 2, -MORTIS_H, MORTIS_H, MORTIS_H);
  ctx.restore();
}

/* Effects are looked up by `type` (from the engine) and projectiles by `fx` (from skill data). Add a case, not an if-chain elsewhere. */

/** 剪: one spindle slash — thick in the middle, tapering to points at both ends, thin dark edge.
    Drawn centred at the origin along the local x axis; the caller positions and rotates it. */
function slashSpindle(ctx: CanvasRenderingContext2D, len: number, wid: number, fill: string, edge: string): void {
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.quadraticCurveTo(0, -wid, len / 2, 0);
  ctx.quadraticCurveTo(0, wid, -len / 2, 0);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

/** The even-width heart: short blunt tip, full lower arcs — no long tapering point.
    Traced centred at the origin, half-width s. Used by the ult pulse. */
function heartPath(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, s * .62);
  ctx.bezierCurveTo(-s * .55, s * .38, -s, 0, -s, -s * .35);
  ctx.bezierCurveTo(-s, -s * .72, -s * .62, -s * .95, -s * .3, -s * .95);
  ctx.bezierCurveTo(-s * .12, -s * .95, 0, -s * .82, 0, -s * .68);
  ctx.bezierCurveTo(0, -s * .82, s * .12, -s * .95, s * .3, -s * .95);
  ctx.bezierCurveTo(s * .62, -s * .95, s, -s * .72, s, -s * .35);
  ctx.bezierCurveTo(s, 0, s * .55, s * .38, 0, s * .62);
  ctx.closePath();
}

/** The five-point star: traced centred at the origin, outer radius s, inner radius s*.42,
    point up. Shared by the star rain, the wish, the poppa ring and the dizzy head. */
function starPath(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? s * .42 : s;
    const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** The while-rooted status effect. Every root shows something at the torso; a character whose
 *  control comes from somewhere else overrides it per data (rootFx, e.g. an ice crystal).
 *  The default is the ult pulse's heart, scaled down — solid, gently breathing. */
export function drawRootFx(ctx: CanvasRenderingContext2D, f: Fighter, time: number): void {
  const bob = Math.sin(time * 4 + f.id * 1.7) * 3;
  ctx.save();
  ctx.translate(f.x, f.y - 105 + bob);
  switch (f.data.rootFx) {
    case 'stun': {
      // 星之鼓动: three dizzy little stars circle the head instead of the heart.
      for (let i = 0; i < 3; i++) {
        const a = time * 5 + (i * Math.PI * 2) / 3;
        const sx = Math.cos(a) * 26, sy = Math.sin(a) * 8 - 16;
        const s = 9 + Math.sin(a + 1.2) * 1.5;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(a * .8);
        ctx.fillStyle = '#ffd257';
        starPath(ctx, s);
        ctx.fill();
        ctx.strokeStyle = '#b46a1e';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    default: {
      const pulse = 1 + Math.sin(time * 6 + f.id) * .06;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#ff5f9e';
      heartPath(ctx, 15);
      ctx.fill();
      ctx.strokeStyle = '#ffd9ec';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/** 打气: the declared second meter floats over the fighter's head; full is a colour change only. */
export function drawGauge(ctx: CanvasRenderingContext2D, f: Fighter): void {
  const spec = f.data.gauge;
  if (!spec?.head || f.hp <= 0) return;
  const w = 46;
  const x = Math.round(f.x) - w / 2;
  const y = Math.round(f.y) - 208;
  const k = clamp(f.gauge / spec.max, 0, 1);
  ctx.fillStyle = '#171120aa';
  ctx.fillRect(x - 1, y - 1, w + 2, 6);
  if (k > 0) {
    ctx.fillStyle = k >= 1 ? '#ffffff' : spec.color;
    ctx.fillRect(x, y, Math.max(3, Math.round(w * k)), 4);
  }
}

/** One rose petal: a body plus a lighter lobe. 友希那用蓝，花道·缠把同一笔改成红。 */
function drawPetal(ctx: CanvasRenderingContext2D, body: string, lobe: string): void {
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = lobe;
  ctx.beginPath(); ctx.ellipse(-1.5, -1, 3, 1.4, -.4, 0, Math.PI * 2); ctx.fill();
}

/** 蝶变: cyan leaf wings (fore + hind each side) on a hairline body, about twice a petal.
    `open` is 0 (clapped) to 1 (spread); the flap squeezes the wings toward the body axis. */
function drawButterfly(ctx: CanvasRenderingContext2D, open: number): void {
  ctx.scale(2, 2);
  const leaf = (angle: number, l: number, w: number) => {
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(l * .25, -w * .5, l * .6, -w * 1.25, l, 0);
    ctx.bezierCurveTo(l * .7, w * 1.1, l * .3, w * .8, 0, 0);
    ctx.fill();
  };
  ctx.fillStyle = '#4EDFF9';
  for (const side of [1, -1]) {
    ctx.save();
    ctx.scale(side * Math.max(.08, open), 1);
    ctx.save(); leaf(.45, 4.6, 1.9); ctx.restore();
    leaf(-.5, 7.5, 2.6);
    ctx.translate(2.8, -.6);
    ctx.fillStyle = '#A6F4FF';
    leaf(0, 3.4, 1);
    ctx.restore();
  }
  ctx.beginPath(); ctx.ellipse(0, .4, .7, 2.6, 0, 0, Math.PI * 2); ctx.fill();
}

/** Layer's bass on 燃尽. Places are baked; size 0 hides that phase. */
export function drawLayerBass(ctx: CanvasRenderingContext2D, f: Fighter, images: ImageCache | undefined, alpha: number): void {
  if (alpha <= 0 || f.attack?.skill.fx !== 'burnout') return;
  const clip = clipFor(f);
  if (clip.row > 2) return;
  const place = LAYER_BASS_POSES[clip.row];
  if (place.size <= 0) return;
  const im = images?.get(LAYER_BASS_SRC);
  if (!im?.naturalWidth) return;
  const dw = place.size;
  const dh = dw * (im.naturalHeight / im.naturalWidth);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(f.x, f.hp <= 0 ? FLOOR : f.y);
  ctx.scale(f.facing, 1);
  ctx.translate(place.x, place.y);
  ctx.rotate(place.rot);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(keyed(im), -LAYER_BASS_GRIP.x / im.naturalWidth * dw, -LAYER_BASS_GRIP.y / im.naturalHeight * dh, dw, dh);
  ctx.restore();
}

export function drawEffect(ctx: CanvasRenderingContext2D, e: Effect, images?: ImageCache): void {
  const p = 1 - e.life / e.max, r = e.radius ?? 50;
  const square = (x: number, y: number, w: number, h: number) => ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.save();
  ctx.globalAlpha = Math.min(1, e.life * 6);
  ctx.fillStyle = e.color;
  ctx.strokeStyle = e.color;
  ctx.lineWidth = 4;
  switch (e.type) {
    case 'dust':
      ctx.globalAlpha = (1 - p) * .7;
      { const width = r * (.2 + p); ctx.strokeRect(e.x - width, e.y - 8 - p * 28, width * 2, 10 + p * 20); }
      break;
    case 'shield':
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, r * .43, r, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = .12; ctx.fill();
      break;
    case 'hit':
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); square(r * .2 + p * r * .5, -3, r * (1 - p), 6); }
      ctx.fillStyle = '#fffbea'; square(-8, -8, 16, 16);
      break;
    case 'slash':
      ctx.translate(e.x, e.y); ctx.scale(e.dir ?? 1, 1);
      ctx.lineWidth = 9 * (1 - p) + 2;
      ctx.beginPath(); ctx.arc(-22, 12, r * (.8 + p * .4), -1.5, .7); ctx.stroke();
      ctx.strokeStyle = '#fff7de'; ctx.lineWidth = 3; ctx.stroke();
      break;
    case 'bass-burst': {
      // 燃尽: small red blocks flying out of the bass body where it lands.
      ctx.translate(e.x, e.y);
      ctx.fillStyle = '#CC0000';
      const n = 12;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const dist = 4 + p * r;
        const w = Math.max(4, 18 * (1 - p * .4));
        const h = Math.max(3, 9 * (1 - p * .35));
        ctx.save();
        ctx.translate(Math.cos(ang) * dist, Math.sin(ang) * dist);
        ctx.rotate(ang);
        square(-w / 2, -h / 2, w, h);
        ctx.restore();
      }
      break;
    }
    case 'shove':
    case 'grab':
      ctx.translate(e.x, e.y);
      ctx.lineWidth = 5 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(0, 0, r * (.5 + p * .6), 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * (.2 + p * .4), 0, Math.PI * 2); ctx.stroke();
      break;
    case 'upper':
      // Rising streak: a slash rotated to point up, trailing below.
      ctx.translate(e.x - (e.dir ?? 1) * 30, e.y - 20); ctx.scale(e.dir ?? 1, 1);
      ctx.lineWidth = 8 * (1 - p) + 2;
      ctx.beginPath(); ctx.arc(-10, 30, r * (.9 + p * .5), -2.6, -1.0); ctx.stroke();
      ctx.strokeStyle = '#fff7de'; ctx.lineWidth = 3; ctx.stroke();
      break;
    case 'sweep':
      // Low, wide arc hugging the floor.
      ctx.translate(e.x - (e.dir ?? 1) * 40, e.y); ctx.scale(e.dir ?? 1, 1);
      ctx.lineWidth = 7 * (1 - p) + 2;
      ctx.beginPath(); ctx.ellipse(0, 0, r * (1 + p * .3), r * .28, 0, -.4, .9); ctx.stroke();
      ctx.strokeStyle = '#fff7de'; ctx.lineWidth = 2; ctx.stroke();
      break;
    case 'launch':
      // Stack of chevrons climbing out of the impact point.
      ctx.translate(e.x, e.y); ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        const y = -p * 70 - i * 18;
        ctx.beginPath(); ctx.moveTo(-14, y + 10); ctx.lineTo(0, y); ctx.lineTo(14, y + 10); ctx.stroke();
      }
      break;
    case 'crescent':
      // Rising moon-arc. The inner stroke is the lit edge of the blade.
      ctx.translate(e.x - (e.dir ?? 1) * 16, e.y + 16); ctx.scale(e.dir ?? 1, 1);
      ctx.lineWidth = 8 * (1 - p) + 2;
      ctx.beginPath(); ctx.arc(-6, 18, r * (.9 + p * .35), -2.55, -.3); ctx.stroke();
      ctx.strokeStyle = '#fff7de'; ctx.lineWidth = 3; ctx.stroke();
      break;
    case 'arc-kick':
      // Three-quarter circle: behind, over the head, down into the slam.
      ctx.translate(e.x - (e.dir ?? 1) * 8, e.y - 36); ctx.scale(e.dir ?? 1, 1);
      ctx.lineWidth = 7 * (1 - p) + 2;
      ctx.beginPath(); ctx.arc(6, 8, Math.max(36, r), Math.PI, Math.PI / 2); ctx.stroke();
      ctx.globalAlpha *= .4; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(-8, 14, Math.max(28, r * .72), Math.PI * .9, Math.PI * .4); ctx.stroke();
      break;
    case 'drums': {
      ctx.translate(e.x, e.y); ctx.scale(e.dir ?? 1, 1);
      const im = images?.get(KIT_SRC);
      const w = 360, h = 180;
      // Image center is the bass drum. The old -110 offset was the side-view seat gap.
      if (im?.naturalWidth) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(keyed(im), -w / 2, -h + 32, w, h);
      }
      else {
        ctx.beginPath(); ctx.arc(48, -40, 28, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(8, -78, 16, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'drum-wave': {
      const grow = 8 + p * (e.radius ?? 24);
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= (1 - p) * .9;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, grow, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.globalAlpha *= .5;
      ctx.beginPath(); ctx.arc(0, 0, grow * .6, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'burst':
      ctx.translate(e.x, e.y);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r * p, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'smile-pulse': {
      // 世界微笑 impact pulse: the wave's own grin stamped on the victim, swelling once —
      // ghostly, fast, gone. e.radius is the full-swell size (~150% of the victim's height);
      // the swell eases out so it blows up fast and settles softly while fading.
      const im = images?.get(WAVE_SRC);
      const grow = 1 - Math.pow(1 - p, 3);
      const s = r * (.35 + .65 * grow);
      ctx.translate(e.x, e.y);
      ctx.scale(e.dir ?? 1, 1);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (im?.naturalWidth) {
        ctx.globalAlpha = (1 - p) * .5;
        ctx.drawImage(keyed(im), -s / 2, -s / 2, s, s);
      } else {
        const wr = Math.max(40, s * .85);
        ctx.strokeStyle = e.color;
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = (1 - p) * .5 * (1 - i * .28);
          ctx.lineWidth = 9 - i * 2.5;
          ctx.beginPath();
          ctx.arc(-wr * .3 - i * wr * .22, 0, wr - i * 12, -1.15, 1.15);
          ctx.stroke();
        }
      }
      break;
    }
    case 'star-pulse': {
      // 星之鼓动 impact pulse: the star's own shape stamped on the landing point, swelling
      // once — ghostly, fast, gone, the same beat as kokoro's smile pulse.
      const im = images?.get(KASUMI_STAR_SRC);
      const grow = 1 - Math.pow(1 - p, 3);
      const s = r * (.35 + .65 * grow);
      ctx.translate(e.x, e.y);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (im?.naturalWidth) {
        ctx.globalAlpha = (1 - p) * .5;
        ctx.drawImage(keyed(im), -s / 2, -s / 2, s, s);
      } else {
        ctx.strokeStyle = e.color;
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = (1 - p) * .5 * (1 - i * .28);
          ctx.lineWidth = 9 - i * 2.5;
          starPath(ctx, s * (.55 - i * .14));
          ctx.stroke();
        }
      }
      break;
    }
    case 'debt': {
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = .8;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, e.radius ?? 52, 16, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'compose': {
      const half = e.radius ?? 100;
      const elapsed = e.max - e.life;
      ctx.translate(e.x, e.y);
      ctx.fillStyle = '#EE5577';
      ctx.strokeStyle = '#EE5577';
      for (let i = 0; i < 7; i++) {
        const u = (elapsed * 1.4 + i / 7) % 1;
        const x = -half + 16 + (i * 27) % (half * 2 - 20);
        const y = -240 + u * 250;
        ctx.globalAlpha = .9;
        ctx.fillRect(x, y, 3, 12);
        ctx.beginPath(); ctx.ellipse(x - 4, y + 12, 6, 4, -.4, 0, Math.PI * 2); ctx.fill();
        // Notes are pure paint, so each one rings from u itself: once at spawn,
        // once as it crosses the floor line on the way down.
        const k = u < .14 ? u / .14 : u > .86 ? (u - .86) / .14 : -1;
        if (k >= 0) {
          ctx.globalAlpha = (1 - k) * .8;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, u < .14 ? y + 6 : 0, 5 + k * 13, 0, Math.PI * 2); ctx.stroke();
        }
      }
      break;
    }
    case 'howl': {
      // 满月嚎叫: a ring in the screen plane, centred on her chest, not a floor ellipse.
      const radius = e.radius ?? 87;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, radius * Math.max(p, .15), 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.globalAlpha *= .55;
      ctx.beginPath(); ctx.arc(0, 0, radius * Math.max(p, .15) * .62, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'yokan': {
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(0, 0, (e.radius ?? 80) * (.35 + p * .65), 10 + p * 8, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'steak': {
      // 大份牛排: blue pluses above her when the bite lands.
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.strokeStyle = '#6eb6ff';
      ctx.lineWidth = 3;
      for (const [x, y] of [[-26, 8], [0, -16], [24, 2], [-10, -34], [16, -30]] as const) {
        const yy = y - p * 18;
        ctx.beginPath();
        ctx.moveTo(x - 6, yy); ctx.lineTo(x + 6, yy);
        ctx.moveTo(x, yy - 6); ctx.lineTo(x, yy + 6);
        ctx.stroke();
      }
      break;
    }
    case 'feast': {
      // 超恢复: a parenthesis on each side. Drawn while the buff holds, gone the frame it ends.
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = .9;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(-32, 8, 36, Math.PI * .62, Math.PI * 1.38); ctx.stroke();
      ctx.beginPath(); ctx.arc(32, 8, 36, -Math.PI * .38, Math.PI * .38); ctx.stroke();
      break;
    }
    case 'marathon': {
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 3;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 18, 10);
        ctx.lineTo(side * (28 + p * 36), -8 - p * 20);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(0, 28, 36 + p * 20, 8, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'ripple': {
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(0, 0, (e.radius ?? 300) * p, 16 + p * 10, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#c45a6a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, (e.radius ?? 300) * p * .72, 10, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'whale-pool': {
      // 巨鲸: a flat sea disc on the foot line. Two arcs swirl, two ripples walk out.
      const rad = e.radius ?? 120;
      const ry = rad * .26;
      const fade = Math.min(1, e.life * 6);
      const spin = p * 8;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = fade * .2;
      ctx.fillStyle = '#1c6eb8';
      ctx.beginPath(); ctx.ellipse(0, 0, rad, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = fade * .1;
      ctx.fillStyle = '#4EDFF9';
      ctx.beginPath(); ctx.ellipse(0, 0, rad * .4, ry * .4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7eebff';
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const a0 = spin + i * 2.2;
        ctx.globalAlpha = fade * (.21 - i * .06);
        ctx.lineWidth = 3 - i;
        ctx.beginPath(); ctx.ellipse(0, 0, rad * (.46 + i * .24), ry * (.46 + i * .24), 0, a0, a0 + 1.7); ctx.stroke();
      }
      for (let i = 0; i < 2; i++) {
        const t = (p * 1.2 + i * .5) % 1;
        ctx.globalAlpha = fade * (1 - t) * .15;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, rad * (.62 + t * .48), ry * (.62 + t * .48), 0, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'shade': {
      // 暗玉: a dark pool opens at her feet and closes again.
      const rad = e.radius ?? 220;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= (1 - p) * .85;
      ctx.fillStyle = '#241c44';
      ctx.beginPath(); ctx.ellipse(0, 20, rad * (.25 + p * .75), 22 + p * 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha *= .55;
      ctx.fillStyle = '#6677CC';
      ctx.beginPath(); ctx.ellipse(0, 20, rad * p * .45, 12, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'huh': {
      // 哈？: a jagged speech bubble bursts out of the shout while rings chase it along the floor.
      const r = e.radius ?? 280;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(0, 0, r * p, 16 + p * 10, 0, 0, Math.PI * 2); ctx.stroke();
      const grow = Math.min(1, p * 2.2);
      const bx = (e.dir ?? 1) * r * .38 * grow;
      const by = -52 - grow * 24;
      const s = 28 + grow * 26;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate((e.dir ?? 1) * -.06);
      ctx.globalAlpha *= Math.min(1, (1 - p) * 1.6);
      ctx.fillStyle = '#fffaf0';
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        const rad = s * (i % 2 ? 1.16 : .94);
        const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad * .82;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, s * .74); ctx.lineTo(2, s * 1.08); ctx.lineTo(10, s * .7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#171120';
      ctx.font = `900 ${Math.round(s * .78)}px ${UI_FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('哈？', 0, 2);
      ctx.restore();
      break;
    }
    case 'tsun': {
      // 脸靠的太近了: a hot-red pride ring slams out along the floor, a thinner one chasing it.
      const r = e.radius ?? 280;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.strokeStyle = '#ff5f7a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let i = 0; i <= 22; i++) {
        const ang = (i / 22) * Math.PI * 2;
        const rad = r * p * (i % 2 ? 1.05 : .93);
        const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad * .32;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(0, 0, r * p * .7, 12 + p * 8, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'box': {
      // 无敌仓库大王: a cardboard dust ring, scraps of packing paper kicking up around it.
      const r = e.radius ?? 200;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.strokeStyle = '#c8965a';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(0, 0, r * p, 14 + p * 10, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e8d9b0';
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + p * 2;
        const d = r * (.3 + p * .7);
        ctx.save();
        ctx.translate(Math.cos(a) * d, Math.sin(a) * d * .3 - p * 30);
        ctx.rotate(a * 2);
        ctx.fillRect(-6, -4, 12, 8);
        ctx.restore();
      }
      break;
    }
    case 'riff':
    case 'sing': {
      // 吉他激奏 / 这次是真的在唱！: sound rings race out from her chest and fade as they
      // widen; the sing's script keeps the reach flat, so its rings hold one fixed radius.
      const r = e.radius ?? (e.type === 'riff' ? 240 : 260);
      const alt = e.type === 'riff' ? '#d8f7e2' : '#ffe3f1';
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 3; i++) {
        const ring = Math.min(1, p * 1.5 - i * .18);
        if (ring <= 0) continue;
        ctx.globalAlpha = Math.min(1, e.life * 6) * (1 - ring * .8) * .9;
        ctx.strokeStyle = i === 0 ? e.color : alt;
        ctx.lineWidth = (5 - i) * (1 - p) + 1;
        ctx.beginPath(); ctx.arc(0, 0, Math.max(6, r * ring), 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'chop': {
      // 劈瓦手刀: the chop arc slams down and a spray of pink tile shards bursts forward,
      // fanning up from the strike point and dropping under gravity.
      ctx.translate(e.x, e.y); ctx.scale(e.dir ?? 1, 1);
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 8 * (1 - p) + 2;
      ctx.beginPath(); ctx.arc(-16, -10, Math.max(10, r), -2.4, -.2); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const t = p * 1.7 - i * .13;
        if (t <= 0 || t >= 1) continue;
        const ang = -.85 - (i % 4) * .38;
        const dist = t * r * (1.3 + (i % 3) * .4);
        const size = 6 + (i % 3) * 5;
        ctx.save();
        ctx.translate(Math.cos(ang) * dist, Math.sin(ang) * dist + t * t * 150);
        ctx.rotate(t * 10 + i);
        ctx.fillStyle = i % 2 ? '#ffb3d9' : e.color;
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.restore();
      }
      break;
    }
    case 'flashbulbs': {
      // 丸山闪光: camera bulbs pop across the arena; each one is a white starburst.
      for (let i = 0; i < 7; i++) {
        const t = p * 2.2 - i * .28;
        if (t <= 0 || t >= 1) continue;
        const bx = e.x + Math.sin(i * 12.9898) * 420;
        const by = e.y - 60 - Math.abs(Math.cos(i * 7.233)) * 150 + i * 24;
        ctx.save();
        ctx.translate(bx, by);
        ctx.globalAlpha = (1 - t) * .9;
        ctx.fillStyle = '#fffdf4';
        starPath(ctx, 9 + (1 - t) * 15);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'wind': {
      // 来去如风: a coil of wind bursts at the spot; a few leaves ride it out.
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.strokeStyle = e.color;
      ctx.lineCap = 'round';
      const spin = p * 6 * (e.dir ?? 1);
      for (let i = 0; i < 3; i++) {
        const a0 = spin + i * 2.1;
        ctx.lineWidth = 4 - i;
        ctx.beginPath(); ctx.arc(0, -i * 13, 30 + i * 9, a0, a0 + 2); ctx.stroke();
      }
      ctx.fillStyle = '#d9f4e3';
      for (let i = 0; i < 3; i++) {
        const t = p * 1.5 - i * .2;
        if (t <= 0 || t >= 1) continue;
        const lx = (e.dir ?? 1) * t * 74;
        const ly = -i * 16 - t * 40 + Math.sin(t * 8 + i * 2) * 10;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(t * 10 * (e.dir ?? 1));
        ctx.fillRect(-4, -2, 8, 4);
        ctx.restore();
      }
      break;
    }
    case 'blue-rose': {
      // 荆棘的蓝蔷薇: a ring of thorns bursts outward while a halo of petals scatters and falls.
      const r = e.radius ?? 210;
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 2; i++) {
        const ring = Math.min(1, p * 1.4 - i * .2);
        if (ring <= 0) continue;
        ctx.globalAlpha = (1 - ring) * .9;
        ctx.strokeStyle = i === 0 ? '#5a8fd8' : '#9cc4ff';
        ctx.lineWidth = (4 - i) * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(0, 0, Math.max(6, r * ring), 14 + ring * 8, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#6fa8ff';
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2 + .4;
        const t = Math.min(1, p * 1.6);
        const px = Math.cos(ang) * r * t;
        const py = Math.sin(ang) * r * t * .3 - t * 46 + t * t * 40;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang + t * 5);
        ctx.globalAlpha = (1 - p) * .85;
        ctx.beginPath(); ctx.ellipse(0, 0, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'rose-petal': {
      // 荆棘的蓝蔷薇: one petal sways down from where the bloom dropped it.
      const fall = p * 150;
      const sway = Math.sin(p * 9) * 14;
      ctx.translate(e.x + sway, e.y + fall);
      ctx.rotate(Math.sin(p * 9) * .9 + p * 3);
      ctx.globalAlpha = (1 - p) * .9;
      drawPetal(ctx, '#6fa8ff', '#9cc4ff');
      break;
    }
    case 'summit': {
      // 顶点: the shout is a 360° wave facing the screen — rings race out of her body in
      // circle space (no floor perspective) with a white-hot core flash on the cast.
      const r = e.radius ?? 560;
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 4; i++) {
        const ring = Math.min(1, p * 1.35 - i * .14);
        if (ring <= 0) continue;
        ctx.globalAlpha = (1 - ring) * .95;
        ctx.strokeStyle = i === 0 ? '#eaf4ff' : i === 1 ? '#cfe6ff' : '#8fb8ff';
        ctx.lineWidth = (6 - i * 1.2) * (1 - p) + 1;
        ctx.beginPath(); ctx.arc(0, 0, Math.max(8, r * ring), 0, Math.PI * 2); ctx.stroke();
      }
      if (p < .4) {
        ctx.globalAlpha = (1 - p / .4) * .8;
        ctx.fillStyle = '#eaf4ff';
        ctx.beginPath(); ctx.arc(0, 0, 40 * (p / .4) + 10, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'black-shout': {
      // 漆黑呐喊: the seal burns off — a dark indigo burst with a blue flame standing in it.
      const r = e.radius ?? 130;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - p) * .9;
      ctx.strokeStyle = '#3f6fd8';
      ctx.lineWidth = 5 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(0, 0, r * p, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = (1 - p) * .5;
      ctx.fillStyle = '#1c2450';
      ctx.beginPath(); ctx.arc(0, 0, r * p * .7, 0, Math.PI * 2); ctx.fill();
      const flick = Math.sin(p * 26) * 3;
      ctx.globalAlpha = (1 - p);
      ctx.fillStyle = '#5fd0ff';
      ctx.beginPath();
      ctx.moveTo(0, -r * .85 - flick);
      ctx.quadraticCurveTo(r * .22, -r * .3, 0, r * .18);
      ctx.quadraticCurveTo(-r * .22, -r * .3, 0, -r * .85 - flick);
      ctx.fill();
      break;
    }
    case 'eye-flame': {
      // 漆黑呐喊: one wisp of blue flame sheds off the eyes and drifts back over the hair.
      const drift = -(e.dir ?? 1) * p * 46;
      ctx.translate(e.x + drift, e.y - p * 26 + Math.sin(p * 12) * 4);
      ctx.rotate(-(e.dir ?? 1) * .5 + Math.sin(p * 14) * .2);
      ctx.globalAlpha = (1 - p) * .95;
      const s = 7 * (1 - p * .55);
      ctx.fillStyle = '#5fd0ff';
      ctx.beginPath();
      ctx.moveTo(0, -s * 2.1);
      ctx.quadraticCurveTo(s * .8, -s * .5, 0, s * .55);
      ctx.quadraticCurveTo(-s * .8, -s * .5, 0, -s * 2.1);
      ctx.fill();
      ctx.fillStyle = '#d8f4ff';
      ctx.beginPath(); ctx.ellipse(0, -s * .2, s * .3, s * .75, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'parfait': {
      // 抹茶大芭菲: the parfait stands on the floor; a green glow pulses under the eruption.
      // Silhouette flash (残影 without the travel): same-size flat tinted copies appear at once and
      // fade, staggered, behind the parfait as it lands and again as it leaves — no scaling at all.
      const t = e.max - e.life;
      const PULSE = .55;
      ctx.translate(e.x, e.y);
      const im = images?.get(PARFAIT_SRC);
      const has = !!im?.naturalWidth;
      const w = 200, h = 200;
      const sil = has ? tintedSilhouette(keyed(im), im.naturalWidth, im.naturalHeight, e.color) : null;
      const shapes = (fill: string) => {
        ctx.fillStyle = fill;
        square(-46, -176, 92, 36);
        square(-56, -144, 112, 36);
        square(-42, -108, 84, 102);
      };
      const flash = (k: number) => {
        if (k <= 0 || k >= 1) return;
        for (let i = 2; i >= 0; i--) {
          const tt = k * 1.5 - i * .14;
          if (tt <= 0 || tt >= 1) continue;
          ctx.save();
          ctx.globalAlpha = (tt < .3 ? 1 : 1 - (tt - .3) / .7) * .34;
          if (sil) ctx.drawImage(sil, -w / 2, -h + 10, w, h);
          else shapes(e.color);
          ctx.restore();
        }
      };
      flash(t / PULSE);
      flash((PULSE - e.life) / PULSE);
      const glow = .5 + Math.sin(t * 9) * .2;
      ctx.globalAlpha = glow * .55;
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.ellipse(0, -4, 76, 15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = Math.min(1, t * 4, e.life * 3);
      if (has) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(keyed(im), -w / 2, -h + 10, w, h);
      } else {
        shapes('#f6f2e8');
        ctx.fillStyle = e.color;
        square(-56, -144, 112, 36);
        square(-42, -108, 84, 102);
        ctx.fillStyle = '#e05a7a';
        ctx.beginPath(); ctx.arc(0, -182, 12, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'resolve': {
      // 就由我来结束一切: brown shockwave rings spreading from her stance, a pale crest on the outer wave.
      const r = e.radius ?? 190;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= (1 - p) * .95;
      for (let i = 0; i < 3; i++) {
        const ring = Math.min(1, p * 1.5 - i * .18);
        if (ring <= 0) continue;
        ctx.strokeStyle = i === 2 ? '#f6e7bd' : '#a5714f';
        ctx.lineWidth = (7 - i * 2) * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(0, 0, r * ring, r * .34 * ring, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = '#a5714f';
      ctx.lineWidth = 3 * (1 - p) + 1;
      ctx.beginPath(); ctx.moveTo(-r * .3, 8); ctx.lineTo(-r * .3, -r * .55 * p - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * .3, 8); ctx.lineTo(r * .3, -r * .55 * p - 8); ctx.stroke();
      break;
    }
    case 'plaster': {
      // 绊创膏: the plaster pulses — three translucent copies of itself scale up and spin out from the one on her chest.
      const im = images?.get(PLASTER_SRC);
      const base = Math.min(1, e.life * 3);
      ctx.translate(e.x, e.y);
      const draw = (scale: number, alpha: number, rot: number) => {
        if (alpha <= 0) return;
        ctx.save();
        ctx.rotate(rot);
        ctx.globalAlpha = alpha;
        const w = 120 * scale;
        if (im?.naturalWidth) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(keyed(im), -w / 2, -w / 2, w, w);
        } else {
          ctx.fillStyle = '#f7e8da';
          square(-w * .4, -w * .12, w * .8, w * .24);
          ctx.fillStyle = e.color;
          for (const px of [-w * .12, w * .12]) {
            ctx.beginPath(); ctx.arc(px, 0, w * .08, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.restore();
      };
      for (let i = 0; i < 3; i++) {
        const tt = Math.min(1, Math.max(0, (p * 1.2 - i * .22) / .55));
        if (tt <= 0 || tt >= 1) continue;
        draw(1 + tt * 1.2, (1 - tt) * .55, (e.dir ?? 1) * (-.45 + tt * .8));
      }
      draw(1, base * .95, (e.dir ?? 1) * -.45);
      break;
    }
    case 'poem': {
      // 诗超绊: three rings swell out of the stance for the length of the sing, notes riding the front.
      const r = e.radius ?? 220;
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 3; i++) {
        const ring = Math.min(1, p * 1.25 - i * .16);
        if (ring <= 0) continue;
        ctx.globalAlpha = (1 - p) * (.9 - i * .22);
        ctx.lineWidth = (6 - i * 2) * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(0, 0, r * ring, r * .36 * ring, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#fff9e6';
      ctx.globalAlpha = (1 - p) * .9;
      for (const side of [-1, 1]) {
        const nx = side * r * .55 * p, ny = -r * (.28 + side * .08) * p;
        ctx.fillRect(nx - 1.5, ny - 9, 3, 9);
        ctx.beginPath(); ctx.ellipse(nx - 3, ny, 4.5, 3, -.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'muscle': {
      // 高肌肉！: golden rings pop out of the stance while two power streaks climb past her arms.
      const r = e.radius ?? 190;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= (1 - p) * .95;
      for (let i = 0; i < 3; i++) {
        const ring = Math.min(1, p * 1.5 - i * .18);
        if (ring <= 0) continue;
        ctx.strokeStyle = i === 2 ? '#fff7c2' : e.color;
        ctx.lineWidth = (7 - i * 2) * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(0, 0, r * ring, r * .34 * ring, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = '#fff7c2';
      ctx.lineWidth = 3 * (1 - p) + 1;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * r * .3, 8);
        ctx.lineTo(side * r * .3, -r * .55 * p - 8);
        ctx.stroke();
      }
      break;
    }
    case 'boost': {
      // 认真模式: a confident double ring pops at her chest with a few orbiting sparks.
      const r = e.radius ?? 90;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, r * Math.min(1, p * 1.4), 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r * Math.min(1, p * 1.4) * .72, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = e.color;
      for (let i = 0; i < 5; i++) {
        const a = i * 1.256 + p * 3;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * .9, Math.sin(a) * r * .6, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'dream': {
      // 梦想即力量！: a golden starburst — rings swell while eight rays shoot out of the pose.
      const r = e.radius ?? 220;
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 3; i++) {
        const ring = Math.min(1, p * 1.25 - i * .16);
        if (ring <= 0) continue;
        ctx.globalAlpha = (1 - p) * (.9 - i * .22);
        ctx.strokeStyle = i === 0 ? e.color : '#fff7c2';
        ctx.lineWidth = (6 - i * 2) * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(0, 0, r * ring, r * .36 * ring, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = e.color;
      ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + p * .6;
        const a = Math.min(1, p * 1.6);
        if (a <= 0) continue;
        ctx.globalAlpha = (1 - p) * .8;
        ctx.lineWidth = 4 * (1 - p) + 1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r * .3 * a, Math.sin(ang) * r * .15 * a - 20);
        ctx.lineTo(Math.cos(ang) * r * .78 * a, Math.sin(ang) * r * .39 * a - 20);
        ctx.stroke();
      }
      break;
    }
    case 'slam':
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(0, 0, r * (.4 + p), 18 + p * 14, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff6ea';
      ctx.globalAlpha *= .7;
      ctx.beginPath(); ctx.ellipse(0, 0, r * .25 * (1 - p), 8, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'mortis': {
      const travel = Math.min(1, p / 0.25);
      const x = e.x + (e.dir ?? 1) * (e.radius ?? 280) * travel;
      let alpha = 1;
      if (p < 0.06) alpha = p / 0.06;
      if (p > 0.78) alpha = Math.max(0, (1 - p) / 0.22);
      ctx.globalAlpha = alpha;
      const [col, row] = mortisFrame(p);
      const im = images?.get(MORTIS_SRC);
      ctx.translate(x, e.y);
      ctx.scale(e.dir ?? 1, 1);
      const ghost = mortisAfterimage(p);
      if (im?.naturalWidth) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (ghost) drawMortisGhost(ctx, im, ghost[0], ghost[1], alpha * .5);
        ctx.globalAlpha = alpha;
        ctx.drawImage(keyed(im), col * CELL, row * CELL, CELL, CELL, -MORTIS_H / 2, -MORTIS_H, MORTIS_H, MORTIS_H);
      } else {
        ctx.fillStyle = e.color;
        ctx.fillRect(-7, -MORTIS_H * .7, 14, MORTIS_H * .42);
        ctx.beginPath(); ctx.arc(0, -MORTIS_H * .8, 12, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'strum':
    case 'spin': {
      // Headstock stays on the pivot; the body is the far end. Spin orbits her in screen space.
      // Strum is a held guitar: smaller, neck rising back to the shoulder, body down in front.
      const elapsed = e.age ?? (e.max - e.life);
      const im = images?.get(GUITAR_SRC);
      const spin = e.type === 'spin';
      const place = watchProp(spin ? 'anon-spin' : 'anon-strum');
      const u = !spin || elapsed <= .28 ? 0 : Math.min(1, (elapsed - .28) / .7);
      const angle = spin ? u * Math.PI * 4 + place.rot : place.rot;
      const dw = place.size;
      const dh = im?.naturalWidth ? dw * (im.naturalHeight / im.naturalWidth) : dw / 2;
      const stamp = (src: CanvasImageSource | null, ang: number) => {
        ctx.save();
        ctx.translate(e.x, e.y + place.y);
        if (spin) ctx.translate(place.x, 0);
        else ctx.scale(e.dir ?? 1, 1);
        if (!spin) ctx.translate(place.x, 0);
        ctx.rotate(ang);
        if (src) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.scale(-1, 1);
          ctx.drawImage(src, -GUITAR_HEAD_X * dw, -GUITAR_HEAD_Y * dh, dw, dh);
        } else {
          ctx.fillStyle = e.color;
          const len = dw * (spin ? 280 / 420 : 110 / 156);
          ctx.fillRect(0, -6, len, 12);
          ctx.beginPath(); ctx.moveTo(len - 30, -6); ctx.lineTo(len + 20, -36); ctx.lineTo(len + 32, 28); ctx.lineTo(len - 30, 6); ctx.fill();
        }
        ctx.restore();
      };
      // The guitar itself, half faded, a short arc behind. Not during wind-up or the held end.
      if (spin && im?.naturalWidth && u > 0 && u < 1) {
        ctx.save();
        ctx.globalAlpha *= .45;
        stamp(keyed(im), angle - .5);
        ctx.restore();
      }
      stamp(im?.naturalWidth ? keyed(im) : null, angle);
      break;
    }
    case 'rabbit': {
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(-6, 0, 8 + p * 6, .2, Math.PI - .2); ctx.stroke();
      ctx.beginPath(); ctx.arc(8, 2, 7 + p * 5, .3, Math.PI - .1); ctx.stroke();
      break;
    }
    case 'kiss': {
      // 抱抱还是亲亲: one light-pink heart blooms on the body and fades. Five kisses, five pulses.
      ctx.translate(e.x, e.y);
      const s = 16 + p * 36;
      ctx.globalAlpha = (1 - p) * .8;
      ctx.fillStyle = '#ffd0e4';
      ctx.beginPath();
      ctx.moveTo(0, s * .3);
      ctx.bezierCurveTo(s * .2, s * .1, s * .5, -s * .3, s * .5, -s * .5);
      ctx.bezierCurveTo(s * .5, -s * .85, s * .1, -s * .85, 0, -s * .5);
      ctx.bezierCurveTo(-s * .1, -s * .85, -s * .5, -s * .85, -s * .5, -s * .5);
      ctx.bezierCurveTo(-s * .5, -s * .3, -s * .2, s * .1, 0, s * .3);
      ctx.fill();
      break;
    }
    case 'half': {
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - p) * .8;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, r * (.3 + p * .7), r * .4 * (.3 + p), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = (1 - p) * .35;
      ctx.beginPath(); ctx.ellipse(-12, 0, r * .25, r * .35, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(12, 0, r * .25, r * .35, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'king': {
      const rad = e.radius ?? 160;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - p) * .85;
      ctx.fillStyle = '#fff6fb';
      ctx.beginPath(); ctx.ellipse(0, -10, 28 + p * 40, 46 + p * 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd0dc';
      ctx.lineWidth = 4 * (1 - p) + 1;
      ctx.beginPath(); ctx.ellipse(0, 0, rad * (.2 + p * .8), rad * .28 * (.2 + p), 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'snip-mark': {
      // 剪: a reticle rides the target through the wind-up — brackets turn inward as the window closes.
      const spin = (e.max - e.life) * 5;
      const k = 1 - e.life / e.max;
      const r = (e.radius ?? 60) * (1 - k * .22);
      ctx.translate(e.x, e.y);
      ctx.rotate(spin);
      ctx.globalAlpha *= .85;
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath(); ctx.arc(0, 0, r, .35, 1.2); ctx.stroke();
      }
      ctx.rotate(-spin);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'snip': {
      // 剪: a burst of spindle slashes across the spot — pale violet blades about her height.
      ctx.translate(e.x, e.y);
      const grow = .8 + p * .35;
      const angles = [.5, 2.2, 3.9].map(a => a * (e.dir ?? 1) + p * .5);
      const lens = [186, 150, 168];
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate(angles[i]);
        ctx.globalAlpha *= (1 - p) * (1 - i * .12);
        slashSpindle(ctx, lens[i] * grow, 13 - i * 2, i === 0 ? '#efe6ff' : '#d9c7f8', '#241433');
        ctx.restore();
      }
      break;
    }
    case 'violet': {
      // 哭泣的紫罗兰: the petal burst — a soft ring and eight petals tearing outward and fluttering down.
      const r = e.radius ?? 175;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= (1 - p) * .9;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(0, 0, r * Math.max(.15, p), 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + .4;
        const t = Math.min(1, p * 1.4 - i * .04);
        if (t <= 0) continue;
        const px = Math.cos(ang) * r * t;
        const py = Math.sin(ang) * r * t - t * 26 + t * t * 44;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang + t * 7);
        ctx.globalAlpha = (1 - p) * .8;
        ctx.fillStyle = i % 2 ? e.color : '#e6d4ff';
        ctx.beginPath(); ctx.ellipse(0, 0, 9 * (1 - t * .3), 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'record': {
      // 录音: the tape rolls — a ring winds down around her with a blinking REC dot.
      const k = 1 - e.life / e.max;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= .9;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.arc(0, 0, 44 + Math.sin(k * 12) * 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k)); ctx.stroke();
      ctx.setLineDash([]);
      if (Math.floor(e.life * 6) % 2 === 0) {
        ctx.fillStyle = '#ff5a5a';
        ctx.beginPath(); ctx.arc(0, -58, 4, 0, Math.PI * 2); ctx.fill();
        ctx.font = `700 11px ${UI_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('REC', 0, -66);
      }
      break;
    }
    case 'fuga-bow': {
      // 火的故事: the void bow condenses — the limbs burn in from nothing while sparks fall inward.
      const k = 1 - e.life / e.max;
      const r = 60 + k * 38;
      const a = Math.min(1, k * 2.2);
      ctx.translate(e.x, e.y);
      ctx.scale(e.dir ?? 1, 1);
      ctx.globalAlpha *= a;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 5 * k + 1;
      ctx.beginPath(); ctx.arc(46, 0, r, Math.PI * .62, Math.PI * 1.38); ctx.stroke();
      ctx.strokeStyle = '#ffd9a8';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha *= .8;
      ctx.strokeStyle = '#f3e8ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(46 + Math.cos(Math.PI * .62) * r, Math.sin(Math.PI * .62) * r);
      ctx.lineTo(46 + Math.cos(Math.PI * 1.38) * r, Math.sin(Math.PI * 1.38) * r);
      ctx.stroke();
      ctx.fillStyle = '#ffb46a';
      for (let i = 0; i < 6; i++) {
        const t = (k * 2 + i / 6) % 1;
        const px = 46 + Math.cos(1.1 + i) * r * (1 - t) * .8;
        const py = Math.sin(1.1 + i * 2) * r * (1 - t) * .7;
        ctx.globalAlpha = a * t;
        ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
      break;
    }
    case 'fuga-burst': {
      // 火的故事: the blast — a twelve-frame sheet played once, drawn at twice the cell.
      const im = images?.get(FUGA_BURST_SRC);
      const size = (e.radius ?? 240) * 2;
      ctx.translate(e.x, e.y);
      if (im?.naturalWidth) {
        const frame = Math.min(11, Math.floor(p * 12));
        const col = frame % 4, row = Math.floor(frame / 4);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.globalAlpha = Math.min(1, e.life * 8);
        ctx.drawImage(keyed(im), col * CELL, row * CELL, CELL, CELL, -size / 2, -size / 2, size, size);
      } else {
        ctx.globalAlpha *= (1 - p) * .95;
        ctx.fillStyle = '#ffb46a';
        ctx.beginPath(); ctx.arc(0, 0, size * .18 * (1 - p * .5), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 10 * (1 - p) + 1;
        ctx.beginPath(); ctx.arc(0, 0, size * .5 * Math.max(.12, p), 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'crown': {
      // 五冠王的威压: an expanding ring carrying five notes — the five crowns ride the wave out.
      ctx.translate(e.x, e.y);
      const rad = Math.max(30, r * (.55 + p * .6));
      ctx.globalAlpha = (1 - p) * .9;
      ctx.lineWidth = 6 - p * 3.5;
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + p * 1.2;
        const nx = Math.cos(a) * rad, ny = Math.sin(a) * rad * .55;
        ctx.fillRect(nx - 1.5, ny - 4.4, 3, 6.4);
        ctx.beginPath(); ctx.ellipse(nx - 3, ny + 1, 4.5, 3, -.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'world-heart': {
      // 此即世界: four hollow hearts pop one after another, each swelling and fading — a slow,
      // readable multi-layer pulse. Young layers ride thick and small, old ones thin and wide.
      ctx.translate(e.x, e.y);
      const t = e.max - e.life;
      const SPAWN = .3, LAYER = .7;
      for (let i = 0; i < 4; i++) {
        const q = (t - i * SPAWN) / LAYER;
        if (q <= 0 || q >= 1) continue;
        const s = 92 * (.35 + .85 * q);
        const w = 6.5 - 3.5 * q;
        ctx.globalAlpha = Math.min(1, q * 7) * (1 - q);
        heartPath(ctx, s);
        ctx.strokeStyle = '#ff5f9e';
        ctx.lineWidth = w;
        ctx.stroke();
        ctx.strokeStyle = '#ffd9ec';
        ctx.lineWidth = w * .45;
        ctx.stroke();
      }
      break;
    }
    case 'poppa': {
      // PoPiPa！: the round-formation ring — a wide circle pops open and five little stars
      // ride it outward, one per member, like everyone called into the circle.
      const r = (e.radius ?? 90) * (.4 + p * .8);
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p * .7;
      ctx.strokeStyle = '#fff6ea';
      ctx.lineWidth = 5 * (1 - p) + 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * .38, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2.5 * (1 - p) + 1;
      ctx.beginPath(); ctx.ellipse(0, 0, r * .8, r * .3, 0, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + p * 1.1;
        const sx = Math.cos(a) * r, sy = Math.sin(a) * r * .38 - 4;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(p * 2.4);
        ctx.fillStyle = i % 2 ? '#ffd257' : e.color;
        starPath(ctx, 7 * (1 - p * .4));
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'wish-mark': {
      // 星之鼓动: the landing tell — a star sits in a shrinking floor ring; when the ring
      // closes, the sky answers. Blinking harder as the prayer runs out.
      const k = e.life / e.max;
      const blink = k < .3 && Math.floor(e.life * 10) % 2 === 0 ? .35 : 1;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= .85 * blink;
      ctx.strokeStyle = '#ffd257';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, (e.radius ?? 120) * (.55 + k * .45), (e.radius ?? 120) * .16 * (.55 + k * .45), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha *= .5;
      ctx.beginPath(); ctx.ellipse(0, 0, (e.radius ?? 120) * .9, (e.radius ?? 120) * .26, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha *= blink;
      ctx.fillStyle = '#ffd257';
      ctx.save();
      ctx.translate(0, -34 - k * 26);
      ctx.rotate((1 - k) * 2.4);
      starPath(ctx, 16 + k * 6);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'star-pop': {
      // 小星星: a star burns out where it lands — quick star flare and two spark lines.
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.save();
      ctx.rotate(p * 1.6);
      ctx.fillStyle = '#fff3c4';
      starPath(ctx, 16 * (1 - p * .5));
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#ffd257';
      ctx.lineWidth = 2 * (1 - p) + .5;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 10, -4);
        ctx.lineTo(side * (22 + p * 22), -12 - p * 14);
        ctx.stroke();
      }
      break;
    }
    case 'star-burst': {
      // 星之鼓动: the landing — a white core flashes, a shock ring races out along the floor,
      // and eight star shards arc outward, spinning, while the column above glows.
      const r = e.radius ?? 190;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, e.life * 5);
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath(); ctx.ellipse(0, 0, r * .3 * (1 - p * .6), r * .12 * (1 - p * .6), 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd257';
      ctx.lineWidth = 9 * (1 - p) + 1.5;
      ctx.beginPath(); ctx.ellipse(0, 6, r * Math.max(.12, p), r * .3 * Math.max(.12, p), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ff9a4d';
      ctx.lineWidth = 3 * (1 - p) + 1;
      ctx.beginPath(); ctx.ellipse(0, 6, r * Math.max(.06, p * .72), r * .2 * Math.max(.06, p * .72), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffd257';
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 6 * (1 - p) + 1;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.quadraticCurveTo(10, -110 * (1 - p * .4), 0, -230);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + .35;
        const t = Math.min(1, p * 1.35);
        const sx = Math.cos(ang) * r * .5 * t, sy = Math.sin(ang) * r * .26 * t - t * t * 46;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(t * 6 + i);
        ctx.fillStyle = i % 2 ? '#ffd257' : '#fff3c4';
        starPath(ctx, 12 * (1 - t * .5));
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'hug': {
      // 贴贴: three little hearts pop around the nuzzle, staggered, with a content sparkle.
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 3; i++) {
        const q = (p * 1.4 - i * .18);
        if (q <= 0 || q >= 1) continue;
        const s = 10 + q * 16;
        ctx.save();
        ctx.translate((i - 1) * 16, -q * 34 + i * 6);
        ctx.rotate((i - 1) * .4);
        ctx.globalAlpha = (1 - q) * .85;
        ctx.fillStyle = i === 1 ? '#ff8fb8' : '#ffd0e4';
        heartPath(ctx, s);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha *= 1 - p;
      ctx.fillStyle = '#fff3c4';
      ctx.save();
      ctx.translate(14, -44);
      ctx.rotate(p * 2.2);
      starPath(ctx, 7 * (1 - p * .5));
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'petal-aura': {
      // 花道·缠: 友希那的落瓣原样改红。减速期间按 1.1 秒一轮循环，运动读 e.age，不读淡出时钟。
      const t = e.age ?? 0;
      const cycle = 1.1;
      for (let i = 0; i < 6; i++) {
        const u = (t / cycle + i / 6) % 1;
        const fall = u * 150;
        const sway = Math.sin(u * 9) * 14;
        const x = ((i * 41) % 125) - 62;
        const y0 = -63 - (i % 3) * 18;
        ctx.save();
        ctx.translate(e.x + x + sway, e.y + y0 + fall);
        ctx.rotate(Math.sin(u * 9) * .9 + u * 3);
        ctx.globalAlpha = (1 - u) * .9;
        drawPetal(ctx, e.color, '#ffb8cf');
        ctx.restore();
      }
      break;
    }
    case 'mitake-guitar': {
      // 不良主唱: three poses on her forward side. Numbers are the tuned layout.
      const pose = MITAKE_POSES[e.col ?? 0] ?? MITAKE_POSES[0];
      const im = images?.get(MITAKE_GUITAR_SRC);
      const dir = e.dir ?? 1;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = 1;
      ctx.translate(0, pose.y);
      ctx.scale(dir, 1);
      ctx.translate(pose.x, 0);
      ctx.rotate(-(pose.deg * Math.PI / 180) - MITAKE_BODY_ANG + pose.rot);
      if (!im?.naturalWidth || pose.size <= 0) break;
      const dw = pose.size;
      const dh = dw * (im.naturalHeight / im.naturalWidth);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(keyed(im), -MITAKE_GRIP.x / im.naturalWidth * dw, -MITAKE_GRIP.y / im.naturalHeight * dh, dw, dh);
      break;
    }
    case 'guitar-smash': {
      // 不良主唱: the ground shock. The guitar itself is mitake-guitar.
      const rad = (e.radius ?? 90) * 1.7;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(0, 0, rad * (.3 + p * .7), 15 + p * 13, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffd6e0';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, rad * (.3 + p * .7) * .6, 9 + p * 7, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'as-usual': {
      // 像以前一样: a red sonic ring bursts out of the chest in the screen plane.
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, (e.radius ?? 250) * Math.max(p, .12), 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffd6e0';
      ctx.lineWidth = 2;
      ctx.globalAlpha *= .7;
      ctx.beginPath(); ctx.arc(0, 0, (e.radius ?? 250) * Math.max(p, .12) * .66, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'declaration': {
      // 宣战布告: 此即世界那盏半透明光，改成从画面顶上直落的一根红光。基础色 #EE0022。
      const x = e.x;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= 1 - p;
      const beam = ctx.createLinearGradient(0, 0, 0, FLOOR);
      beam.addColorStop(0, 'rgba(238, 0, 34, .3)');
      beam.addColorStop(1, 'rgba(238, 0, 34, .06)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x - 22, 0);
      ctx.lineTo(x + 22, 0);
      ctx.lineTo(x + 100, FLOOR);
      ctx.lineTo(x - 100, FLOOR);
      ctx.closePath();
      ctx.fill();
      const glow = ctx.createRadialGradient(x, FLOOR - 88, 6, x, FLOOR - 88, 90);
      glow.addColorStop(0, 'rgba(255, 214, 224, .26)');
      glow.addColorStop(1, 'rgba(238, 0, 34, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, FLOOR - 88, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(x, FLOOR);
      ctx.scale(1, .3);
      const pool = ctx.createRadialGradient(0, 0, 8, 0, 0, 105);
      pool.addColorStop(0, 'rgba(238, 0, 34, .38)');
      pool.addColorStop(1, 'rgba(238, 0, 34, 0)');
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.arc(0, 0, 105, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'super':
    default:
      ctx.translate(e.x, e.y); ctx.rotate(p * 1.5);
      ctx.lineWidth = 3;
      ctx.strokeRect(-r * p, -r * p, r * p * 2, r * p * 2);
      ctx.rotate(Math.PI / 4);
      ctx.strokeRect(-r * p * .7, -r * p * .7, r * p * 1.4, r * p * 1.4);
      break;
  }
  ctx.restore();
}

/** Straight pale ribbon behind a note, so the lane stays readable. */
function noteRibbon(ctx: CanvasRenderingContext2D, p: Projectile, outer = '#e7a0b8', inner = '#ff4f96'): void {
  const pts = p.trail;
  if (pts.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stroke = (width: number, color: string, alpha: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  stroke(7, outer, .35);
  stroke(3, inner, .7);
}

export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, images?: ImageCache): void {
  // 抹茶大芭菲: the standing parfait is drawn by its effect, never as a shot.
  if (p.fx === 'parfait') return;
  ctx.save();
  // 火的故事: the arrow art rides ten pixels above its flight band so the flame head reads on the body.
  if (p.fx === 'fuga') ctx.translate(0, -10);
  if (p.fx === 'mutsumi-note' || p.fx === 'chord') noteRibbon(ctx, p);
  else if (p.fx === 'sob') noteRibbon(ctx, p, '#f4e7b4', '#e8c96a');
  else if (p.fx !== 'fuga' && p.fx !== 'smile-ship' && p.fx !== 'whale' && p.fx !== 'butterfly') {
    // 火的故事 skips the stock dots — they read as purple balls; its case draws gold afterimages.
    // 微笑号 is a screen-sized sweep, so the travelling point must not leave a dot trail.
    ctx.fillStyle = p.color;
    for (let i = 0; i < p.trail.length; i++) {
      const t = p.trail[i], k = (i + 1) / p.trail.length;
      ctx.globalAlpha = k * .35;
      ctx.beginPath(); ctx.arc(t.x, t.y, p.radius * k * .8, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.translate(p.x, p.y);
  switch (p.fx) {
    case 'firebird': {
      // 火鸟: the pillar sheet plays eruption → burn → embers, cell bottom pinned to the
      // stage floor. The procedural tongues are the stand-in while the sheet is a missing
      // or still-unloaded colour block.
      const pillarSheet = images?.get(PILLAR_SRC);
      if (pillarSheet?.naturalWidth) {
        const [col, row] = pillarFrame(p.age, p.life);
        ctx.drawImage(keyed(pillarSheet), col * CELL, row * CELL, CELL, CELL, -CELL / 2, -CELL, CELL, CELL);
        break;
      }
      const grow = Math.min(1, p.age / .12);
      const fade = Math.min(1, p.life / .22);
      const h = 225 * grow * (.7 + .3 * fade);
      const w = 52 * (1 + Math.sin(p.age * 21) * .08);
      const sway = Math.sin(p.age * 13) * 7;
      ctx.globalAlpha = fade;
      const tongue = (hh: number, ww: number, fill: string) => {
        ctx.beginPath();
        ctx.moveTo(-ww, 0);
        ctx.quadraticCurveTo(-ww * .9, -hh * .45, sway, -hh);
        ctx.quadraticCurveTo(ww * .9, -hh * .45, ww, 0);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      tongue(h, w, '#ff7a33');
      tongue(h * .78, w * .62, '#ffc24d');
      tongue(h * .5, w * .34, '#fff3c4');
      ctx.fillStyle = '#b83a1a';
      ctx.beginPath(); ctx.ellipse(0, 0, w * 1.15, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffc24d';
      ctx.beginPath(); ctx.ellipse(0, 0, w * .8, 8, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'milk': {
      if (p.settled) ctx.translate(0, -p.size * .28);
      if (!prop(ctx, images, MILK_SRC, p.size)) {
        ctx.fillStyle = '#6b3a22';
        ctx.fillRect(-p.radius * .7, -p.radius, p.radius * 1.4, p.radius * 1.8);
        ctx.fillStyle = '#f2efe6';
        ctx.fillRect(-p.radius * .45, -p.radius * .85, p.radius * .9, p.radius * .35);
      }
      break;
    }
    case 'bag': {
      ctx.rotate(p.age * 3 * Math.sign(p.vx || 1));
      if (!prop(ctx, images, BAG_SRC, p.size)) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-p.radius, -p.radius * .2);
        ctx.lineTo(-p.radius * .7, p.radius);
        ctx.lineTo(p.radius * .7, p.radius);
        ctx.lineTo(p.radius, -p.radius * .2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#151222';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(-p.radius * .25, -p.radius * .55, p.radius * .35, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.radius * .25, -p.radius * .55, p.radius * .35, Math.PI, 0); ctx.stroke();
      }
      break;
    }
    case 'meat': {
      ctx.rotate(p.age * 7 * Math.sign(p.vx || 1));
      if (!prop(ctx, images, MEAT_SRC, p.size)) {
        ctx.fillStyle = '#c44858';
        ctx.beginPath(); ctx.ellipse(0, 0, p.radius * 1.3, p.radius * .7, .4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#f4ead8';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-p.radius * .2, p.radius * .2); ctx.lineTo(p.radius * .9, -p.radius * .5); ctx.stroke();
      }
      break;
    }
    case 'smile-ship': {
      // 微笑号: one screen-wide hull. After a beat it slides fully off one side to fully off
      // the other in two seconds. ponytail: picture only — the hit is still the old point.
      const dir = Math.sign(p.vx) || 1;
      const ship = images?.get(SHIP_SRC);
      const aspect = ship?.naturalWidth ? ship.naturalHeight / ship.naturalWidth : .5;
      const w = W;
      const h = w * aspect;
      const u = Math.min(1, Math.max(0, p.age - SHIP_HOLD) / SHIP_SWEEP);
      const centerX = dir > 0 ? -w / 2 + u * (W + w) : W + w / 2 - u * (W + w);
      ctx.translate(centerX - p.x, H / 2 - p.y);
      ctx.scale(dir, 1);
      ctx.imageSmoothingEnabled = true;
      if (ship?.naturalWidth) {
        ctx.drawImage(keyed(ship), -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = '#f6f2ea';
        ctx.fillRect(-w / 2, -h * .15, w, h * .45);
        ctx.fillStyle = '#ffd94f';
        ctx.fillRect(-w * .15, -h * .42, w * .35, h * .28);
        ctx.strokeStyle = '#151222';
        ctx.lineWidth = 4;
        ctx.strokeRect(-w / 2, -h * .15, w, h * .45);
        ctx.strokeRect(-w * .15, -h * .42, w * .35, h * .28);
      }
      break;
    }
    case 'juggle-ball': {
      ctx.rotate(p.age * 9 * Math.sign(p.vx || 1));
      if (!prop(ctx, images, BALL_SRC, p.size)) {
        const r = p.size / 2;
        ctx.fillStyle = '#f6f2ea';
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d94455';
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * .38, .5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#151222';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'smile-wave': {
      // 世界微笑: the shout family of stacked crescents, grinning — a golden wave with the
      // corners turned up, drawn by hand when the sheet has not landed yet.
      const r = Math.max(40, p.size * .85);
      ctx.scale(Math.sign(p.vx) || 1, 1);
      if (!prop(ctx, images, WAVE_SRC, p.size)) {
        ctx.strokeStyle = p.color;
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = (1 - i * .28) * .95;
          ctx.lineWidth = 9 - i * 2.5;
          ctx.beginPath();
          ctx.arc(-r * .3 - i * r * .22, 0, r - i * 12, -1.15, 1.15);
          ctx.stroke();
        }
        ctx.globalAlpha = .9;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, r * .08, r * .42, .35, Math.PI - .35);
        ctx.stroke();
      }
      break;
    }
    case 'groove-note': {
      if (!prop(ctx, images, YUNO_NOTE_SRC, p.size)) {
        const s = Math.max(7, p.radius);
        ctx.fillStyle = '#EE5577';
        ctx.fillRect(s * .4, -s * 1.28, s * .18, s * 1.38);
        ctx.beginPath(); ctx.ellipse(-s * .08, s * .18, s * .58, s * .36, -.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'cucumber': {
      ctx.rotate(p.age * 8 * Math.sign(p.vx || 1));
      if (!prop(ctx, images, CUCUMBER_SRC, p.size)) {
        ctx.fillStyle = '#3f8c45';
        ctx.beginPath(); ctx.ellipse(0, 0, p.radius * 1.4, p.radius * .45, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2f6a34';
        ctx.beginPath(); ctx.arc(p.radius, 0, p.radius * .28, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(-p.radius, 0, p.radius * .28, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'mutsumi-note': {
      if (!prop(ctx, images, NOTE_SRC, p.size)) {
        const s = Math.max(7, p.radius);
        ctx.fillStyle = '#e7a0b8';
        ctx.fillRect(s * .4, -s * 1.28, s * .18, s * 1.38);
        ctx.beginPath(); ctx.ellipse(-s * .08, s * .18, s * .58, s * .36, -.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'chord': {
      if (!prop(ctx, images, ANON_NOTE_SRC, p.size)) {
        const s = Math.max(7, p.radius);
        ctx.fillStyle = '#ff4f96';
        ctx.fillRect(s * .4, -s * 1.28, s * .18, s * 1.38);
        ctx.beginPath(); ctx.ellipse(-s * .08, s * .18, s * .58, s * .36, -.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'sob': {
      // A cream note with a tear; the trail dots above already carry her colour.
      if (!prop(ctx, images, SOYO_NOTE_SRC, p.size)) {
        const s = Math.max(7, p.radius);
        ctx.fillStyle = '#e8c96a';
        ctx.fillRect(s * .4, -s * 1.28, s * .18, s * 1.38);
        ctx.beginPath(); ctx.ellipse(-s * .08, s * .18, s * .58, s * .36, -.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * .52, s * .3);
        ctx.bezierCurveTo(s * .3, s * .95, s * .66, s * 1.05, s * .56, s * .55);
        ctx.fill();
      }
      break;
    }
    case 'shout': {
      // 为什么要演奏春日影: three stacked crescents leaning into the travel, notes riding the front.
      const r = Math.max(40, p.size * .85);
      ctx.scale(Math.sign(p.vx) || 1, 1);
      ctx.strokeStyle = p.color;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = (1 - i * .28) * .95;
        ctx.lineWidth = 9 - i * 2.5;
        ctx.beginPath();
        ctx.arc(-r * .3 - i * r * .22, 0, r - i * 12, -1.15, 1.15);
        ctx.stroke();
      }
      ctx.fillStyle = p.color;
      ctx.globalAlpha = .9;
      const note = (ny: number) => {
        ctx.fillRect(r * .18, ny - 11, 3, 11);
        ctx.beginPath(); ctx.ellipse(r * .12, ny, 5, 3.4, -.5, 0, Math.PI * 2); ctx.fill();
      };
      note(-r * .45);
      note(r * .3);
      break;
    }
    case 'abuse': {
      // 离灯远点: a jagged speech bubble, three cold dots inside, wobbling as it flies.
      ctx.rotate(p.age * 2 * Math.sign(p.vx || 1));
      const r = Math.max(14, p.radius);
      ctx.fillStyle = '#171120';
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 11; i++) {
        const ang = (i / 11) * Math.PI * 2;
        const rad = r * (i % 2 ? 1.22 : .95);
        const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = p.color;
      for (const dx of [-r * .38, 0, r * .38]) {
        ctx.beginPath(); ctx.arc(dx, 0, r * .13, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'bubble': {
      // 才没有喜欢你呢: a blush-pink speech bubble wobbles ahead, "!?" scrawled inside.
      ctx.rotate(p.age * 2.4 * Math.sign(p.vx || 1));
      const r = Math.max(14, p.radius);
      ctx.fillStyle = '#fff5fa';
      ctx.strokeStyle = '#e86ba4';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.12, r * .92, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * .5, r * .62);
      ctx.lineTo(-r * .78, r * 1.24);
      ctx.lineTo(-r * .12, r * .84);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e86ba4';
      ctx.font = `900 ${Math.round(r * 1.1)}px ${UI_FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!?', 0, r * .04);
      break;
    }
    case 'heart': {
      ctx.rotate(p.age * 2);
      if (!prop(ctx, images, HEART_SRC, p.size)) {
        const s = Math.max(8, p.radius);
        ctx.fillStyle = '#ff4f96';
        ctx.beginPath();
        ctx.moveTo(0, s * .7);
        ctx.bezierCurveTo(-s * 1.3, -s * .2, -s * .5, -s * 1.1, 0, -s * .45);
        ctx.bezierCurveTo(s * .5, -s * 1.1, s * 1.3, -s * .2, 0, s * .7);
        ctx.fill();
      }
      break;
    }
    case 'donut-straw':
    case 'donut-choc': {
      // 甜甜圈: the flavour image spins gently as it flies; the rings are the missing-file stand-in.
      ctx.rotate(p.age * 3 * Math.sign(p.vx || 1));
      const straw = p.fx === 'donut-straw';
      if (prop(ctx, images, straw ? DONUT_STRAW_SRC : DONUT_CHOC_SRC, p.size)) break;
      const r = Math.max(14, p.radius);
      ctx.fillStyle = straw ? '#f2a2b8' : '#8a5230';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#151222';
      ctx.beginPath(); ctx.arc(0, 0, r * .36, 0, Math.PI * 2); ctx.fill();
      if (straw) {
        ctx.fillStyle = '#fff2f8';
        for (let i = 0; i < 7; i++) {
          const a = i * 2.4 + .5, rr = r * .66;
          ctx.fillRect(Math.cos(a) * rr - 2.5, Math.sin(a) * rr - 1.2, 5, 2.4);
        }
      }
      break;
    }
    case 'wink': {
      // 偶像魅力: a huge heart that pulses as it drifts, slow enough to read the whole flight.
      const pulse = 1 + Math.sin(p.age * 6) * .07;
      ctx.scale(pulse * (Math.sign(p.vx) || 1), pulse);
      if (!prop(ctx, images, MANA_HEART_SRC, p.size)) {
        const s = Math.max(12, p.radius);
        ctx.fillStyle = '#ff5f9e';
        ctx.beginPath();
        ctx.moveTo(0, s * .9);
        ctx.bezierCurveTo(-s * 1.5, -s * .3, -s * .6, -s * 1.35, 0, -s * .55);
        ctx.bezierCurveTo(s * .6, -s * 1.35, s * 1.5, -s * .3, 0, s * .9);
        ctx.fill();
        ctx.strokeStyle = '#ffd9ec';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      break;
    }
    case 'matcha': {
      // 抹茶熔岩: the dollop image spins gently as it flies; the circles are the missing-file stand-in.
      ctx.rotate(p.age * 4 * Math.sign(p.vx || 1));
      if (prop(ctx, images, MATCHA_SRC, p.size)) break;
      const r = Math.max(10, p.radius);
      ctx.fillStyle = '#3e7d46';
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        const rad = r * (1.06 + Math.sin(ang * 3 + p.age * 9) * .12);
        const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#77DD77';
      ctx.beginPath(); ctx.arc(-r * .25, -r * .3, r * .38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4f9ee';
      ctx.beginPath(); ctx.arc(r * .3, -r * .15, r * .16, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'note': {
      const s = Math.max(7, p.radius);
      ctx.fillStyle = '#16141f';
      ctx.fillRect(s * .32, -s * 1.4, s * .34, s * 1.55);
      ctx.beginPath(); ctx.ellipse(-s * .08, s * .18, s * .78, s * .52, -.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.color;
      ctx.fillRect(s * .4, -s * 1.28, s * .18, s * 1.38);
      ctx.beginPath(); ctx.ellipse(-s * .08, s * .18, s * .58, s * .36, -.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f7f1e4';
      ctx.beginPath(); ctx.ellipse(-s * .2, s * .08, s * .2, s * .12, -.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(s * .56, -s * 1.28);
      ctx.quadraticCurveTo(s * 1.35, -s * .72, s * .62, -s * .32);
      ctx.quadraticCurveTo(s * 1.05, -s * .78, s * .56, -s * .96);
      ctx.fill();
      break;
    }
    case 'stone': {
      // 飞砾谱: a pebble with a crayon star, tumbling as it flies.
      if (!prop(ctx, images, STONE_SRC, p.size)) {
        ctx.rotate(p.age * 7 * Math.sign(p.vx || 1));
        const r = p.radius;
        ctx.fillStyle = '#b9b2ad';
        ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * .8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#948d88';
        ctx.beginPath(); ctx.ellipse(-r * .25, r * .15, r * .45, r * .3, .4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(r * .1, -r * .5); ctx.lineTo(r * .32, 0); ctx.lineTo(r * .1, r * .5); ctx.lineTo(-r * .12, 0);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'blackhole': {
      // 奇独点: a face-on circular well — black core, purple spiral arms curling inward, pale specks falling in.
      const span = p.skill.life ?? 1.4;
      const r = Math.max(40, p.size * 1.2 * (1 - .3 * Math.min(1, p.age / span)));
      const base = Math.min(1, p.life * 3);
      ctx.globalAlpha = base;
      ctx.fillStyle = '#0c0918';
      ctx.beginPath(); ctx.arc(0, 0, r * .48, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3d2a6b';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r * .5, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const a0 = p.age * 3.2 + (i * Math.PI * 2) / 3;
        let prev: [number, number] | null = null;
        for (let s = 0; s <= 12; s++) {
          const t = s / 12;
          const ang = a0 - t * 3.6;
          const rad = r * (.95 - .52 * t);
          const cur: [number, number] = [Math.cos(ang) * rad, Math.sin(ang) * rad];
          if (prev) {
            ctx.globalAlpha = base * (.8 - t * .5);
            ctx.strokeStyle = t > .55 ? '#a98be0' : '#6d3fb8';
            ctx.lineWidth = 4.5 - t * 3;
            ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(cur[0], cur[1]); ctx.stroke();
          }
          prev = cur;
        }
      }
      ctx.fillStyle = '#e6d9ff';
      for (let i = 0; i < 4; i++) {
        const t = (p.age * .7 + i / 4) % 1;
        const ang = p.age * 2.6 + i * 1.57;
        const rad = r * (1 - t * .92);
        ctx.globalAlpha = base * (1 - t) * .9;
        ctx.beginPath(); ctx.arc(Math.cos(ang) * rad, Math.sin(ang) * rad, 2, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'mega': {
      // 高音量！: megaphone waves — three stacked crescents leaning into the travel, a hot leading edge.
      const r = Math.max(40, p.size * .85);
      ctx.scale(Math.sign(p.vx) || 1, 1);
      ctx.strokeStyle = p.color;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = (1 - i * .28) * .95;
        ctx.lineWidth = 9 - i * 2.5;
        ctx.beginPath();
        ctx.arc(-r * .3 - i * r * .22, 0, r - i * 12, -1.15, 1.15);
        ctx.stroke();
      }
      ctx.strokeStyle = '#fffbe0';
      ctx.globalAlpha = .9;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(-r * .3, 0, r, -1.0, 1.0);
      ctx.stroke();
      break;
    }
    case 'seal': {
      // 九字真言: on a body the circle grows along its flight, trailing edge fixed.
      const grown = sealSwell(p.size, p.vx, p.swell ?? 0);
      ctx.translate(grown.shift, 0);
      if (prop(ctx, images, SEAL_SRC, p.size * grown.scale)) break;
      const rad = (p.radius + 6) * grown.scale;
      ctx.strokeStyle = p.color;
      ctx.fillStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = .35;
      ctx.beginPath(); ctx.arc(0, 0, rad * .72, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = .9;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const ang = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
        const x = Math.cos(ang) * rad * .62;
        const y = Math.sin(ang) * rad * .62;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'snip': {
      // 剪: the standing void field — a slow wheel of body-height spindle slashes over the spot.
      const r = Math.max(46, p.size * .8);
      const spin = p.age * .9;
      const specs = [
        { a: 0, d: r * .35, l: 172, w: 11 },
        { a: 1.5, d: r * .18, l: 190, w: 13 },
        { a: 2.7, d: r * .42, l: 156, w: 9 },
        { a: 4.1, d: r * .12, l: 168, w: 10 },
        { a: 5.3, d: r * .3, l: 180, w: 12 },
      ];
      for (const s of specs) {
        const a = s.a + spin;
        ctx.save();
        ctx.translate(Math.cos(a) * s.d, Math.sin(a) * s.d * .55);
        ctx.rotate(a + Math.PI / 2 + Math.sin(p.age * 2 + s.a) * .3);
        ctx.globalAlpha = Math.min(1, p.life * 4) * (.5 + .3 * Math.sin(p.age * 5 + s.a * 3));
        slashSpindle(ctx, s.l, s.w, '#d9c7f8', '#241433');
        ctx.restore();
      }
      break;
    }
    case 'fuga': {
      // 火的故事: the slow arrow — a burning bolt with a hot head, pointing the way it flies.
      // Behind it, flat gold copies of the arrow fade along the flight history (the stock dot
      // trail is skipped for fuga); local x is divided back out of the mirror so leftward
      // flights keep their ghosts behind them.
      const sx = Math.sign(p.vx) || 1;
      ctx.scale(sx, 1);
      const aim = images?.get(FUGA_ARROW_SRC);
      const gold = aim?.naturalWidth ? tintedSilhouette(keyed(aim), aim.naturalWidth, aim.naturalHeight, '#ffd257') : null;
      if (gold && p.trail.length > 2) {
        for (let i = 0; i < 3; i++) {
          const t = p.trail[Math.max(0, p.trail.length - 40 + i * 15)];
          if (!t) continue;
          ctx.save();
          ctx.globalAlpha = .12 + i * .09;
          ctx.drawImage(gold, (t.x - p.x) * sx - p.size / 2, (t.y - p.y) - p.size / 2, p.size, p.size);
          ctx.restore();
        }
      }
      if (!prop(ctx, images, FUGA_ARROW_SRC, p.size)) {
        const len = p.size * .8;
        ctx.globalAlpha = .8;
        ctx.fillStyle = '#ff9a4d';
        ctx.beginPath();
        ctx.moveTo(-len * .5, -7);
        ctx.quadraticCurveTo(-len * .1, -15, len * .32, -6);
        ctx.lineTo(len * .32, 6);
        ctx.quadraticCurveTo(-len * .1, 15, -len * .5, 7);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd9a8';
        ctx.beginPath();
        ctx.moveTo(len * .58, 0);
        ctx.lineTo(len * .26, -8);
        ctx.lineTo(len * .26, 8);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'star': {
      // 小星星: the shared star sprite tumbling along the diagonal. Procedural fallback keeps
      // the draw alive before the prop loads.
      ctx.rotate(p.age * 5 * Math.sign(p.vx || 1));
      if (prop(ctx, images, KASUMI_STAR_SRC, Math.max(18, p.size))) break;
      ctx.fillStyle = '#ffd257';
      starPath(ctx, Math.max(9, p.size * .5));
      ctx.fill();
      ctx.strokeStyle = '#b46a1e';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath(); ctx.arc(-p.size * .12, -p.size * .14, Math.max(2.4, p.size * .1), 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'star-fall': {
      // 星之鼓动: the wish star rides the diagonal — streaks lean against the velocity, the
      // art sits above the hit centre so the lower point touches the floor right as it lands.
      const r = p.size * .5;
      ctx.save();
      ctx.rotate(Math.atan2(-(p.vx || 0), p.vy || 1));
      ctx.strokeStyle = '#fff3c4';
      ctx.lineWidth = 3;
      ctx.globalAlpha = .5;
      for (let i = -1; i <= 1; i++) {
        const x = i * r * .34;
        ctx.beginPath();
        ctx.moveTo(x, -r * 1.15);
        ctx.lineTo(x + i * 4, -r * 1.7);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.translate(0, -p.size * .32);
      ctx.rotate(p.age * .8);
      if (prop(ctx, images, KASUMI_STAR_SRC, p.size * 1.06)) break;
      ctx.fillStyle = '#ffd257';
      starPath(ctx, r);
      ctx.fill();
      ctx.strokeStyle = '#b46a1e';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath(); ctx.arc(-r * .16, -r * .2, r * .14, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'hana': {
      // 花道·缠: a spinning blossom. The trail dots behind it come from the stock loop.
      const s = (p.size ?? 46) * .3;
      ctx.rotate(p.age * 7 * Math.sign(p.vx || 1));
      for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.rotate((i / 5) * Math.PI * 2);
        ctx.fillStyle = '#2a2230';
        ctx.beginPath(); ctx.ellipse(0, -s * .8, s * .42, s * .8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(0, -s * .8, s * .32, s * .7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#ffe6f0';
      ctx.beginPath(); ctx.arc(0, 0, s * .34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd257';
      ctx.beginPath(); ctx.arc(0, 0, s * .16, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'jelly': {
      if (p.hue) ctx.filter = `hue-rotate(${p.hue}deg)`;
      if (!prop(ctx, images, JELLY_SRC, p.size)) {
        ctx.fillStyle = '#9ec0ee';
        ctx.beginPath(); ctx.ellipse(0, p.radius * .35, p.radius, p.radius * .35, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-p.radius, p.radius * .2);
        ctx.quadraticCurveTo(0, -p.radius * 1.3, p.radius, p.radius * .2);
        ctx.quadraticCurveTo(0, p.radius * .05, -p.radius, p.radius * .2);
        ctx.fill();
      }
      break;
    }
    case 'whale': {
      // 地面遮罩：低于脚线的部分不画，鲸鱼从地里涌出再沉回去。
      const ground = FLOOR - p.y;
      ctx.beginPath();
      ctx.rect(-W, ground - H, W * 2, H);
      ctx.clip();
      ctx.rotate(Math.atan2(p.vy, p.vx || 1));
      if (!prop(ctx, images, WHALE_SRC, p.size ?? 512)) {
        const r = 48;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(10, 0, r * 1.7, r * .7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-r * 1.4, 0); ctx.lineTo(-r * 2.3, -r * .55); ctx.lineTo(-r * 2.3, r * .55); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#151222';
        ctx.beginPath(); ctx.arc(r * 1.15, -r * .12, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'butterfly': {
      // 蝶变: inner seven, plus seven evenly around them. One hitbox.
      const dir = Math.sign(p.vx || 1);
      ctx.scale(dir, 1);
      ctx.globalAlpha = .9;
      const wing = (i: number, x: number, y: number) => {
        const phase = p.age * 5 + i * 2.1;
        const open = .25 + .75 * (.5 + .5 * Math.sin(p.age * 22 + i * 1.9));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(.35 + Math.sin(phase) * .3);
        drawButterfly(ctx, open);
        ctx.restore();
      };
      for (let i = 0; i < 7; i++) {
        const phase = p.age * 5 + i * 2.1;
        wing(i, ((i * 2) % 7 - 3) * 10 + Math.sin(phase) * 14, ((i * 3) % 7 - 3) * 8 + Math.cos(phase * 1.3) * 4);
      }
      for (let i = 0; i < 7; i++) {
        const phase = p.age * 5 + (i + 7) * 2.1;
        const ang = (i / 7) * Math.PI * 2 - Math.PI / 2;
        wing(i + 7, Math.cos(ang) * 72 + Math.sin(phase) * 6, Math.sin(ang) * 50 + Math.cos(phase * 1.3) * 4);
      }
      break;
    }
    case 'wail':
    case 'orb':
    default: {
      ctx.rotate(p.age * 6 * Math.sign(p.vx));
      ctx.fillStyle = '#151222';
      ctx.fillRect(-p.radius - 2, -p.radius - 2, p.radius * 2 + 4, p.radius * 2 + 4);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.radius, -p.radius, p.radius * 2, p.radius * 2);
      ctx.fillStyle = '#fff9e6';
      ctx.fillRect(-p.radius * .4, -p.radius * .4, p.radius * .8, p.radius * .8);
    }
  }
  ctx.restore();
}

/** 我要拉黑他: the prohibition sign over a banned fighter — pulsing, blinking out its last second. */
export function drawBanSign(ctx: CanvasRenderingContext2D, f: Fighter): void {
  const left = f.ban;
  if (left < 1 && Math.floor(left * 8) % 2 === 0) return;
  const pulse = 1 + Math.sin(left * 9) * .06;
  const r = 20 * pulse;
  const x = f.x, y = f.y - 218;
  ctx.save();
  ctx.globalAlpha = .92;
  ctx.strokeStyle = '#ff5a5a';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r * .68, y + r * .68);
  ctx.lineTo(x + r * .68, y - r * .68);
  ctx.stroke();
  ctx.globalAlpha = .3;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(f.x, f.y, 44, 10, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life * 5);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

/** Resting size is 1. On a body the circle is 70% larger, and only along its flight. */
export function sealSwell(size: number, vx: number, swell = 0): { scale: number; shift: number } {
  const scale = 1 + 0.7 * swell;
  return { scale, shift: Math.sign(vx || 1) * size * (scale - 1) / 2 };
}

/** 九字真言, one brush character per beat. The blank tail is the gap before the next character. */
export const KUJI = '临兵斗者皆阵烈在前';
export const KUJI_STEP = 0.072;

export function kujiFlash(t: number): { ch: string; alpha: number } | null {
  if (t < 0) return null;
  const i = Math.floor(t / KUJI_STEP);
  if (i >= KUJI.length) return null;
  const k = t / KUJI_STEP - i;
  if (k >= 0.84) return null;
  if (k < 0.18) return { ch: KUJI[i], alpha: k / 0.18 };
  if (k < 0.62) return { ch: KUJI[i], alpha: 1 };
  return { ch: KUJI[i], alpha: 1 - (k - 0.62) / 0.22 };
}

export function drawKuji(ctx: CanvasRenderingContext2D, g: FightGame): void {
  for (const f of g.fighters) {
    const a = f.attack;
    if (!a || a.skill.fx !== 'seal' || f.hp <= 0) continue;
    const flash = kujiFlash(a.t);
    if (!flash) continue;
    const h = f.data.view.kind === 'sprite' ? f.data.view.height : 176;
    // Super windup hair starts 58px down the 256 cell. Baseline sits a few pixels above that.
    const head = (CELL - 58) * h / CELL;
    ctx.save();
    ctx.translate(Math.round(f.x), Math.round(f.y - head - 6));
    ctx.globalAlpha = flash.alpha;
    ctx.font = '48px "Ma Shan Zheng", KaiTi, STKaiti, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#241433';
    ctx.strokeText(flash.ch, 0, 0);
    ctx.fillStyle = '#e6d4ff';
    ctx.fillText(flash.ch, 0, 0);
    ctx.restore();
  }
}

const LIME = new Set(['#b7ff6e']);
export const UI_FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';

/** Floating texts cycle a handful of sizes; the font string is built once per (weight, px). */
const fontCache = new Map<string, string>();
function floatingFont(lime: boolean, size: number): string {
  const px = lime ? Math.round(size * 1.2) : size;
  const key = (lime ? 'b' : 'h') + px;
  let font = fontCache.get(key);
  if (!font) {
    font = `${lime ? 700 : 900} ${px}px ${UI_FONT}`;
    fontCache.set(key, font);
  }
  return font;
}

export function drawTexts(ctx: CanvasRenderingContext2D, texts: FloatingText[]): void {
  ctx.textAlign = 'center';
  for (const t of texts) {
    const lime = LIME.has(t.color);
    ctx.globalAlpha = Math.min(1, t.life * 4);
    ctx.font = floatingFont(lime, t.size);
    ctx.lineWidth = lime ? 6 : 4;
    ctx.strokeStyle = lime ? '#000' : '#171120';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = lime ? '#fff' : t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

export function drawCombo(ctx: CanvasRenderingContext2D, g: FightGame): void {
  for (const f of g.fighters) {
    if (f.minion || f.echo || f.combo <= 1 || f.comboTime <= 0) continue;
    const left = f.team === 0;
    const slot = g.fighters.filter(m => m.team === f.team).indexOf(f);
    const x = left ? 42 : 918, y = 205 + slot * 36;
    ctx.textAlign = left ? 'left' : 'right';
    ctx.font = 'italic 45px Impact, sans-serif';
    ctx.fillStyle = SIDE[f.team];
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText(f.combo + ' HIT', x, y);
    ctx.fillText(f.combo + ' HIT', x, y);
    ctx.font = `12px ${UI_FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(f.combo >= 5 ? 'NICE COMBO!' : 'COMBO', x, y + 20);
  }
}
