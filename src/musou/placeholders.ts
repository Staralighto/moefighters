import type { ImageCache } from '../assets/loader.ts';

import type { MobKind } from './songs.ts';
export type { MobKind };
/** 占位图的造型（4 种画法），按杂兵种类配色复用。换成 GPT 图后这一层就不用了。 */
type MobShape = 'fan' | 'amp' | 'box' | 'note';
const SHAPE: Record<MobKind, MobShape> = { fan: 'fan', glow: 'note', amp: 'amp', guard: 'box', scalper: 'fan' };
export const WORLD_W = 2880;
export const VIEW_W = 960;
export const VIEW_H = 540;
export const MUSOU_FLOOR = 453;

export const MOB_CELL = 256;
export const MOB_BAKE_CELL = 128;
export const STREET_LAYERS = ['far', 'mid', 'near'] as const;
export const STREET_ART = STREET_LAYERS.map(id => `/musou/bg/${id}.png`);
export const MUSOU_FIGHT_ART = [
  ...STREET_ART, ...STREET_LAYERS.map(id => `/musou/bg/${id}-neon.png`),
  ...['fan', 'glow', 'amp', 'guard', 'scalper'].map(id => `/musou/mobs/${id}.png`),
];

export interface MusouArtPack {
  bgFar: HTMLCanvasElement;
  bgMid: HTMLCanvasElement;
  bgNear: HTMLCanvasElement;
  mobs: Record<MobKind, HTMLCanvasElement>;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  return [c, g];
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/**
 * 3-layer parallax placeholder stage (1440 / 2112 / 2880 × 540), aligned to FLOOR = 453.
 * Replace seamlessly later by dropping GPT PNGs at /musou/bg-far.png, /musou/bg-mid.png, /musou/bg-near.png.
 */
function paintFarPlaceholder(): HTMLCanvasElement {
  const w = 1440;
  const [c, g] = makeCanvas(w, VIEW_H);
  const sky = g.createLinearGradient(0, 0, 0, MUSOU_FLOOR);
  sky.addColorStop(0, '#0d1024');
  sky.addColorStop(0.55, '#191b3a');
  sky.addColorStop(1, '#2d1e48');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, VIEW_H);

  // Moon + neon glow
  const moon = g.createRadialGradient(1100, 118, 12, 1100, 118, 130);
  moon.addColorStop(0, 'rgba(253, 233, 121, 0.35)');
  moon.addColorStop(1, 'rgba(253, 233, 121, 0)');
  g.fillStyle = moon;
  g.fillRect(960, 0, 280, 260);
  g.fillStyle = '#fde979';
  g.beginPath();
  g.arc(1100, 118, 36, 0, Math.PI * 2);
  g.fill();

  // Stars
  g.fillStyle = 'rgba(255,255,255,0.45)';
  for (let i = 0; i < 48; i++) {
    const sx = (i * 197 + 41) % w;
    const sy = (i * 89 + 23) % 240;
    g.fillRect(sx, sy, (i % 3) + 1, (i % 3) + 1);
  }

  // Distant city skyline & ferris wheel silhouette
  g.fillStyle = '#15142d';
  for (let x = 0; x < w; x += 72) {
    const bh = 90 + ((x * 37) % 140);
    g.fillRect(x, MUSOU_FLOOR - bh, 64, bh);
    g.fillStyle = x % 144 === 0 ? 'rgba(63,240,255,0.16)' : 'rgba(255,59,127,0.14)';
    for (let wy = MUSOU_FLOOR - bh + 14; wy < MUSOU_FLOOR - 24; wy += 20) {
      g.fillRect(x + 12, wy, 10, 8);
      g.fillRect(x + 36, wy, 10, 8);
    }
    g.fillStyle = '#15142d';
  }
  // Ferris wheel silhouette
  g.strokeStyle = 'rgba(255, 119, 204, 0.22)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(420, 235, 92, 0, Math.PI * 2);
  g.stroke();
  return c;
}

function paintMidPlaceholder(): HTMLCanvasElement {
  const w = 2112;
  const [c, g] = makeCanvas(w, VIEW_H);

  // Midground Livehouse storefronts, neon billboards, and festival trusses
  const signs = ['LIVE', 'RiNG', 'STAR', 'ENCORE', 'ROCK', 'MUSIC'];
  const colors = ['#ff3b7f', '#3ff0ff', '#fde979', '#c8f181', '#ff77cc', '#a78bfa'];
  for (let i = 0; i < 9; i++) {
    const bx = 60 + i * 230;
    const bw = 176;
    const bh = 160 + (i % 3) * 34;
    const by = MUSOU_FLOOR - bh;

    g.fillStyle = '#1c1836';
    g.fillRect(bx, by, bw, bh);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 2;
    g.strokeRect(bx, by, bw, bh);

    // Neon sign header
    const col = colors[i % colors.length];
    g.fillStyle = 'rgba(10, 12, 24, 0.9)';
    roundRect(g, bx + 18, by + 18, bw - 36, 36, 8);
    g.fill();
    g.strokeStyle = col;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = col;
    g.font = '900 18px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(signs[i % signs.length], bx + bw / 2, by + 37);

    // Shop shutters / posters
    g.fillStyle = 'rgba(255,255,255,0.04)';
    g.fillRect(bx + 20, MUSOU_FLOOR - 84, bw - 40, 84);
  }
  return c;
}

function paintNearPlaceholder(): HTMLCanvasElement {
  const w = WORLD_W;
  const [c, g] = makeCanvas(w, VIEW_H);

  // Guardrails & festival poles along street
  g.fillStyle = '#252142';
  g.fillRect(0, MUSOU_FLOOR - 32, w, 4);
  for (let x = 40; x < w; x += 160) {
    g.fillStyle = '#2f2954';
    g.fillRect(x, MUSOU_FLOOR - 40, 8, 40);
    // Street lamp glow
    if (x % 320 === 40) {
      g.fillStyle = '#3a3366';
      g.fillRect(x + 1, MUSOU_FLOOR - 170, 6, 130);
      g.fillStyle = '#fde979';
      g.fillRect(x - 6, MUSOU_FLOOR - 176, 20, 8);
    }
  }

  // Street floor starting strictly at MUSOU_FLOOR = 453
  const floorG = g.createLinearGradient(0, MUSOU_FLOOR, 0, VIEW_H);
  floorG.addColorStop(0, '#1f1934');
  floorG.addColorStop(0.2, '#171328');
  floorG.addColorStop(1, '#0e0b1a');
  g.fillStyle = floorG;
  g.fillRect(0, MUSOU_FLOOR, w, VIEW_H - MUSOU_FLOOR);

  // Floor perspective lines & zone markers
  g.fillStyle = 'rgba(255, 59, 127, 0.45)';
  g.fillRect(0, MUSOU_FLOOR, w, 3);
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  g.lineWidth = 2;
  for (let x = 0; x < w; x += 120) {
    g.beginPath();
    g.moveTo(x, MUSOU_FLOOR + 3);
    g.lineTo(x - 45, VIEW_H);
    g.stroke();
  }
  return c;
}

/**
 * Generates a 4×1 (1024×256) placeholder sprite strip for each Q-version mob,
 * then bakes it down to 128px cells (512×128) for fast mobile blitting.
 * Cells: 0=walk0, 1=walk1, 2=hurt, 3=ko
 */
function bakeMobPlaceholder(kind: MobKind): HTMLCanvasElement {
  const [src, g] = makeCanvas(MOB_CELL * 4, MOB_CELL);
  const colors: Record<MobKind, { main: string; accent: string; dark: string }> = {
    fan: { main: '#38bdf8', accent: '#fde047', dark: '#0f172a' },
    glow: { main: '#1e1b2e', accent: '#c084fc', dark: '#09090b' },
    amp: { main: '#a78bfa', accent: '#ff4f8b', dark: '#1e1b4b' },
    guard: { main: '#64748b', accent: '#76e7ff', dark: '#0b1220' },
    scalper: { main: '#e9c46a', accent: '#ff3b7f', dark: '#3b2a06' },
  };
  const shape = SHAPE[kind];
  const pal = colors[kind];

  for (let col = 0; col < 4; col++) {
    const cx = col * MOB_CELL + MOB_CELL / 2;
    const footY = MOB_CELL - 16;
    const hurt = col === 2;
    const ko = col === 3;
    const hop = col === 1 ? -10 : 0;

    g.save();
    g.translate(cx, footY + hop);
    if (ko) {
      g.translate(0, -40);
      g.rotate(-1.25);
    } else if (hurt) {
      g.rotate(-0.14);
    }

    if (shape === 'fan') {
      // Cute dark silhouette fan wielding twin glowsticks
      g.fillStyle = pal.dark;
      roundRect(g, -34, -108, 68, 72, 22);
      g.fill();
      g.strokeStyle = pal.main;
      g.lineWidth = 5;
      g.stroke();
      // Head
      g.beginPath();
      g.arc(0, -132, 34, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      // Eyes
      g.fillStyle = hurt || ko ? '#ff5c77' : '#ffffff';
      if (hurt || ko) {
        g.font = '900 22px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText('><', 8, -126);
      } else {
        g.fillRect(6, -138, 8, 8);
        g.fillRect(20, -138, 8, 8);
      }
      // Glowsticks
      const swing = col === 1 ? -0.4 : 0.25;
      g.save();
      g.translate(32, -88);
      g.rotate(swing);
      g.fillStyle = pal.accent;
      roundRect(g, -5, -48, 10, 48, 5);
      g.fill();
      g.restore();
    } else if (shape === 'amp') {
      // Bouncy evil speaker monster
      g.fillStyle = pal.dark;
      roundRect(g, -48, -118, 96, 108, 16);
      g.fill();
      g.strokeStyle = pal.main;
      g.lineWidth = 6;
      g.stroke();
      // Speaker cone
      g.fillStyle = '#312e81';
      g.beginPath();
      g.arc(0, -56, 28, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = pal.accent;
      g.lineWidth = 4;
      g.stroke();
      // Angry googly eyes
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(-18, -94, 11, 0, Math.PI * 2);
      g.arc(18, -94, 11, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = hurt || ko ? '#ff5c77' : '#09090b';
      g.beginPath();
      g.arc(-15, -94, 5, 0, Math.PI * 2);
      g.arc(21, -94, 5, 0, Math.PI * 2);
      g.fill();
    } else if (shape === 'box') {
      // Mango cardboard box rusher
      g.fillStyle = pal.main;
      roundRect(g, -52, -104, 104, 96, 12);
      g.fill();
      g.strokeStyle = pal.dark;
      g.lineWidth = 6;
      g.stroke();
      // Tape stripe + zip tie
      g.fillStyle = '#fef3c7';
      g.fillRect(-50, -64, 100, 14);
      // Shivering scribbles / eyes
      g.fillStyle = pal.dark;
      g.font = '900 24px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(hurt || ko ? 'X_X' : '>_<', 10, -76);
      // Little feet
      g.fillStyle = pal.accent;
      g.fillRect(-30 + (col === 1 ? 8 : -4), -12, 16, 12);
      g.fillRect(14 - (col === 1 ? 8 : -4), -12, 16, 12);
    } else {
      // Floating dark musical note ghost
      g.translate(0, -56);
      g.fillStyle = pal.dark;
      g.beginPath();
      g.ellipse(-10, 8, 34, 26, -0.3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = pal.accent;
      g.lineWidth = 6;
      g.stroke();
      // Stem & flag
      g.fillStyle = pal.accent;
      g.fillRect(14, -74, 12, 80);
      g.beginPath();
      g.moveTo(22, -74);
      g.quadraticCurveTo(66, -54, 44, -22);
      g.lineTo(22, -46);
      g.closePath();
      g.fill();
      // Glowing eye
      g.fillStyle = hurt || ko ? '#ff5c77' : '#fde047';
      g.beginPath();
      g.arc(-4, 6, 8, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  // Pre-bake down to 128×128 cells (512×128) for fast mobile Canvas2D blits
  const [baked, bg] = makeCanvas(MOB_BAKE_CELL * 4, MOB_BAKE_CELL);
  bg.imageSmoothingEnabled = true;
  bg.imageSmoothingQuality = 'high';
  bg.drawImage(src, 0, 0, src.width, src.height, 0, 0, baked.width, baked.height);
  return baked;
}

let cachedPack: MusouArtPack | null = null;

export function getPlaceholderPack(): MusouArtPack {
  if (cachedPack) return cachedPack;
  cachedPack = {
    bgFar: paintFarPlaceholder(),
    bgMid: paintMidPlaceholder(),
    bgNear: paintNearPlaceholder(),
    mobs: {
      fan: bakeMobPlaceholder('fan'),
      glow: bakeMobPlaceholder('glow'),
      amp: bakeMobPlaceholder('amp'),
      guard: bakeMobPlaceholder('guard'),
      scalper: bakeMobPlaceholder('scalper'),
    },
  };
  return cachedPack;
}

/** Optional external GPT overrides: if present in cache, draw those instead of placeholders. */
export function resolveCustomArt(images: ImageCache, path: string): HTMLImageElement | null {
  const im = images.get(path);
  return im && im.naturalWidth > 0 ? im : null;
}
