import type { FighterView } from './view.ts';
import type { Fighter } from '../game/fighter.ts';
import type { ImageCache } from '../assets/loader.ts';
import { CELL, clipFor } from './clips.ts';

let tintBuf: HTMLCanvasElement | undefined;
const rimCache = new Map<string, HTMLCanvasElement>();

function spriteFilter(f: Fighter): string {
  if (f.hitFlash > 0) return 'brightness(2.1)';
  if (f.invuln > .1) return 'brightness(1.25)';
  return 'none';
}

const RIM = 3;
const RIM_PAD = 4;

/** ~3px stroke from the smoothed silhouette, then a 1px blur so the edge isn't stepped. Cached per cell. */
function hardRim(im: HTMLImageElement, sx: number, sy: number, h: number, color: string): HTMLCanvasElement {
  const key = im.src + '|' + sx + '|' + sy + '|' + h + '|' + color;
  const hit = rimCache.get(key);
  if (hit) return hit;
  const tinted = document.createElement('canvas');
  tinted.width = h;
  tinted.height = h;
  const tg = tinted.getContext('2d');
  if (!tg) return tinted;
  tg.imageSmoothingEnabled = true;
  tg.imageSmoothingQuality = 'high';
  tg.drawImage(im, sx, sy, CELL, CELL, 0, 0, h, h);
  tg.globalCompositeOperation = 'source-in';
  tg.fillStyle = color;
  tg.fillRect(0, 0, h, h);

  const size = h + RIM_PAD * 2;
  const raw = document.createElement('canvas');
  raw.width = size;
  raw.height = size;
  const rg = raw.getContext('2d');
  if (!rg) return tinted;
  rg.imageSmoothingEnabled = true;
  rg.imageSmoothingQuality = 'high';
  const steps = 20;
  for (const radius of [RIM, RIM * 0.5]) {
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      rg.drawImage(tinted, RIM_PAD + Math.cos(a) * radius, RIM_PAD + Math.sin(a) * radius);
    }
  }

  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) return raw;
  g.imageSmoothingEnabled = true;
  g.filter = 'blur(0.8px)';
  g.drawImage(raw, 0, 0);
  rimCache.set(key, c);
  return c;
}

/** Flat colour wash over the opaque pixels. Same trick as the 墨缇丝 afterimage. */
function drawTint(ctx: CanvasRenderingContext2D, im: CanvasImageSource, sx: number, sy: number, h: number, tint: string): void {
  if (typeof document === 'undefined') {
    ctx.drawImage(im, sx, sy, CELL, CELL, -h / 2, -h, h, h);
    return;
  }
  if (!tintBuf) tintBuf = document.createElement('canvas');
  tintBuf.width = CELL;
  tintBuf.height = CELL;
  const g = tintBuf.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, CELL, CELL);
  g.globalCompositeOperation = 'source-over';
  g.drawImage(im, sx, sy, CELL, CELL, 0, 0, CELL, CELL);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = tint;
  g.fillRect(0, 0, CELL, CELL);
  ctx.drawImage(tintBuf, -h / 2, -h, h, h);
}

/* Looks up the cache every frame so a late-loaded sheet replaces the geometry fallback without rebuilding views. */
export class SpriteView implements FighterView {
  constructor(
    private readonly images: ImageCache,
    private readonly common: string,
    private readonly special: string,
    private readonly height: number,
    private readonly fallback: FighterView,
  ) {}

  draw(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, alpha: number, tint?: string, outline?: string): void {
    const clip = clipFor(f);
    const src = clip.sheet === 'common' ? this.common : this.special;
    const im = this.images.get(src);
    if (!im || !im.naturalWidth) { this.fallback.draw(ctx, f, x, y, alpha, undefined, outline); return; }
    const h = this.height;
    ctx.save();
    try {
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(f.facing, 1);
      ctx.globalAlpha = alpha;
      if (outline && typeof document !== 'undefined') {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(hardRim(im, clip.sx, clip.sy, h, outline), -h / 2 - RIM_PAD, -h - RIM_PAD);
      }
      // Source cell is 256, drawn near 181. High-quality downscale keeps the extra pixels.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (tint) drawTint(ctx, im, clip.sx, clip.sy, h, tint);
      else {
        ctx.filter = spriteFilter(f);
        ctx.drawImage(im, clip.sx, clip.sy, CELL, CELL, -h / 2, -h, h, h);
      }
    } finally {
      ctx.restore();
    }
  }
}
