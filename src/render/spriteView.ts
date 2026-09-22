import type { FighterView } from './view.ts';
import type { Fighter } from '../game/fighter.ts';
import type { ImageCache } from '../assets/loader.ts';
import { CELL, clipFor } from './clips.ts';

let tintBuf: HTMLCanvasElement | undefined;

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

  draw(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, alpha: number, tint?: string): void {
    const clip = clipFor(f);
    const src = clip.sheet === 'common' ? this.common : this.special;
    const im = this.images.get(src);
    if (!im || !im.naturalWidth) { this.fallback.draw(ctx, f, x, y, alpha); return; }
    const h = this.height;
    ctx.save();
    try {
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(f.facing, 1);
      ctx.globalAlpha = alpha;
      // Source cell is 256, drawn near 181. High-quality downscale keeps the extra pixels.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (tint) drawTint(ctx, im, clip.sx, clip.sy, h, tint);
      else {
        if (f.hitFlash > 0) ctx.filter = 'brightness(2.1)';
        else if (f.invuln > .1) ctx.filter = 'brightness(1.25)';
        ctx.drawImage(im, clip.sx, clip.sy, CELL, CELL, -h / 2, -h, h, h);
      }
    } finally {
      ctx.restore();
    }
  }
}
