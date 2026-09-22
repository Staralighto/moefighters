import type { FighterView } from './view.ts';
import type { Fighter } from '../game/fighter.ts';
import type { ImageCache } from '../assets/loader.ts';
import { CELL, clipFor } from './clips.ts';

/* Looks up the cache every frame so a late-loaded sheet replaces the geometry fallback without rebuilding views. */
export class SpriteView implements FighterView {
  constructor(
    private readonly images: ImageCache,
    private readonly common: string,
    private readonly special: string,
    private readonly height: number,
    private readonly fallback: FighterView,
  ) {}

  draw(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, alpha: number): void {
    const clip = clipFor(f);
    const src = clip.sheet === 'common' ? this.common : this.special;
    const im = this.images.get(src);
    if (!im || !im.naturalWidth) { this.fallback.draw(ctx, f, x, y, alpha); return; }
    const h = this.height;
    const w = h;
    ctx.save();
    try {
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(f.facing, 1);
      ctx.globalAlpha = alpha;
      if (f.hitFlash > 0) ctx.filter = 'brightness(2.1)';
      else if (f.invuln > .1) ctx.filter = 'brightness(1.25)';
      ctx.drawImage(im, clip.sx, clip.sy, CELL, CELL, -w / 2, -h, w, h);
    } finally {
      ctx.restore();
    }
  }
}
