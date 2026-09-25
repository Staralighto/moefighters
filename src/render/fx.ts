import type { Effect, FightGame, FloatingText, Particle, Projectile } from '../game/game.ts';
import { SIDE } from '../game/constants.ts';
import type { ImageCache } from '../assets/loader.ts';
import { CELL } from './clips.ts';
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
const ANON_NOTE_SRC = '/sprites/anon/note.png';
const SOYO_NOTE_SRC = '/sprites/soyo/note.png';
const HEART_SRC = '/sprites/anon/heart.png';
const STONE_SRC = '/sprites/tomori/stone.png';
const PLASTER_SRC = '/sprites/tomori/plaster.png';
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

function drawMortisGhost(ctx: CanvasRenderingContext2D, im: HTMLImageElement, col: number, row: number, alpha: number): void {
  if (typeof document === 'undefined') return;
  if (!ghostBuf) ghostBuf = document.createElement('canvas');
  ghostBuf.width = CELL;
  ghostBuf.height = CELL;
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
  ctx.save();
  if (p.fx === 'mutsumi-note' || p.fx === 'chord') noteRibbon(ctx, p);
  else if (p.fx === 'sob') noteRibbon(ctx, p, '#f4e7b4', '#e8c96a');
  else {
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

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life * 5);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

const LIME = new Set(['#b7ff6e']);
export const UI_FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';

export function drawTexts(ctx: CanvasRenderingContext2D, texts: FloatingText[]): void {
  ctx.textAlign = 'center';
  for (const t of texts) {
    const lime = LIME.has(t.color);
    ctx.globalAlpha = Math.min(1, t.life * 4);
    ctx.font = `${lime ? 700 : 900} ${lime ? Math.round(t.size * 1.2) : t.size}px ${UI_FONT}`;
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
    if (f.minion || f.combo <= 1 || f.comboTime <= 0) continue;
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
