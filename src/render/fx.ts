import type { Effect, FightGame, FloatingText, Particle, Projectile } from '../game/game.ts';
import { FLOOR } from '../game/constants.ts';
import type { ImageCache } from '../assets/loader.ts';
import { CELL } from './clips.ts';

const CUCUMBER_SRC = '/sprites/mutsumi-cucumber.png';
const NOTE_SRC = '/sprites/mutsumi-note.png';
const MORTIS_SRC = '/sprites/mutsumi-mortis.png';
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
    case 'burst':
      ctx.translate(e.x, e.y);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r * p, 0, Math.PI * 2); ctx.stroke();
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
      if (im?.naturalWidth) {
        ctx.drawImage(keyed(im), col * CELL, row * CELL, CELL, CELL, -MORTIS_H / 2, -MORTIS_H, MORTIS_H, MORTIS_H);
      } else {
        ctx.fillStyle = e.color;
        ctx.fillRect(-7, -MORTIS_H * .7, 14, MORTIS_H * .42);
        ctx.beginPath(); ctx.arc(0, -MORTIS_H * .8, 12, 0, Math.PI * 2); ctx.fill();
      }
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
function noteRibbon(ctx: CanvasRenderingContext2D, p: Projectile): void {
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
  stroke(7, '#e7a0b8', .35);
  stroke(3, '#ff4f96', .7);
}

export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, images?: ImageCache): void {
  ctx.save();
  if (p.fx === 'mutsumi-note') noteRibbon(ctx, p);
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

export function drawTexts(ctx: CanvasRenderingContext2D, texts: FloatingText[]): void {
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#171120';
  for (const t of texts) {
    ctx.globalAlpha = Math.min(1, t.life * 4);
    ctx.font = `900 ${t.size}px 'Microsoft YaHei', sans-serif`;
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

export function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#05050c66';
  ctx.beginPath();
  ctx.ellipse(x, FLOOR + 3, Math.max(10, 50 - (FLOOR - y) * .09), 9, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawCombo(ctx: CanvasRenderingContext2D, g: FightGame): void {
  for (const f of g.fighters) {
    if (f.combo <= 1 || f.comboTime <= 0) continue;
    const left = f.team === 0, x = left ? 42 : 918, y = 205;
    ctx.textAlign = left ? 'left' : 'right';
    ctx.font = 'italic 45px Impact, sans-serif';
    ctx.fillStyle = left ? '#d8ff62' : '#ff75a4';
    ctx.strokeStyle = '#201429';
    ctx.lineWidth = 4;
    ctx.strokeText(f.combo + ' HIT', x, y);
    ctx.fillText(f.combo + ' HIT', x, y);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(f.combo >= 5 ? 'NICE COMBO!' : 'COMBO', x, y + 20);
  }
}
