import type { FighterView, FrozenPose } from './view.ts';
import type { Fighter } from '../game/fighter.ts';
import { missingImages, portraitSrc, type ImageCache } from '../assets/loader.ts';
import { CELL, clipFor, type Clip } from './clips.ts';

const rimCache = new Map<string, HTMLCanvasElement>();
const cellCache = new Map<string, HTMLCanvasElement>();
const tintCache = new Map<string, HTMLCanvasElement>();

/** ponytail: LRU cap per baked-cell cache. A cell is h×h (181px ≈ 130KB on a dpr-1 canvas,
 *  ~240KB at the arena's usual device scale), the working set is the fielded cast's cells,
 *  and 256 keeps the worst case bounded at ~60MB; eviction rebuilds on demand, so the worst
 *  case is a one-frame bake. Raise only with a memory reason. */
const CELL_CACHE_MAX = 256;
const RIM_CACHE_MAX = 128;

/** LRU get-or-bake. Refreshing on hit keeps the hot cells of the current match alive. */
function cacheCell(cache: Map<string, HTMLCanvasElement>, max: number, key: string, bake: () => HTMLCanvasElement): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const made = bake();
  if (cache.size >= max) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, made);
  return made;
}

/** The 256px cell pre-scaled to the raster size it is blitted at (with the flash filter baked
 *  in), so the per-draw cost is a 1:1 blit instead of a high-quality resample of the whole sheet. */
function prescaledCell(im: HTMLImageElement, sx: number, sy: number, h: number, filter: string): HTMLCanvasElement {
  return cacheCell(cellCache, CELL_CACHE_MAX, im.src + '|' + sx + '|' + sy + '|' + h + '|' + filter, () => {
    const c = document.createElement('canvas');
    c.width = h;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) return c;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    if (filter !== 'none') g.filter = filter;
    g.drawImage(im, sx, sy, CELL, CELL, 0, 0, h, h);
    return c;
  });
}

function spriteFilter(f: Fighter): string {
  if (f.hitFlash > 0) return 'brightness(2.1)';
  if (f.invuln > .1) return 'brightness(1.25)';
  return 'none';
}

const RIM = 3;
const RIM_PAD = 4;
/** 无敌仓库大王: the box art's bottom face is a perspective parallelogram, so the picture sinks
 *  until its LEFT/RIGHT bottom vertices straddle the shared foot line — the front tip (the
 *  lowest point) deliberately hangs below. Measured on the current sheet: vertices y=191/167,
 *  average 179 → 46px at h=181, backed off to 40 after eyeballing. Re-measure if the art is replaced. */
const BOX_SINK = 40;

/** ~3px stroke from the smoothed silhouette, then a 1px blur so the edge isn't stepped. Cached per cell. */
function hardRim(im: HTMLImageElement, sx: number, sy: number, h: number, color: string): HTMLCanvasElement {
  const key = im.src + '|' + sx + '|' + sy + '|' + h + '|' + color;
  return cacheCell(rimCache, RIM_CACHE_MAX, key, () => {
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
    return c;
  });
}

/** Flat colour wash over the opaque pixels, baked per (sheet, cell, raster size, tint).
 *  Same trick as the 墨缇丝 afterimage. `h` is the logical draw size, `hs` the raster size. */
function drawTint(ctx: CanvasRenderingContext2D, im: HTMLImageElement, sx: number, sy: number, h: number, hs: number, tint: string): void {
  if (typeof document === 'undefined') {
    ctx.drawImage(im, sx, sy, CELL, CELL, -Math.round(h / 2), -h, h, h);
    return;
  }
  const baked = cacheCell(tintCache, CELL_CACHE_MAX, im.src + '|' + sx + '|' + sy + '|' + hs + '|' + tint, () => {
    const c = document.createElement('canvas');
    c.width = hs;
    c.height = hs;
    const g = c.getContext('2d');
    if (!g) return c;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(im, sx, sy, CELL, CELL, 0, 0, hs, hs);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = tint;
    g.fillRect(0, 0, hs, hs);
    return c;
  });
  ctx.drawImage(baked, -Math.round(h / 2), -h, h, h);
}

/* Looks up the cache every frame so a late-loaded sheet replaces the geometry fallback without rebuilding views. */
export class SpriteView implements FighterView {
  constructor(
    private readonly images: ImageCache,
    private readonly common: string,
    private readonly special: string,
    private readonly height: number,
    private readonly fallback: FighterView,
    private readonly frenzy?: string,
    private readonly king?: string,
    private readonly kingScale = 1,
    private readonly world?: string,
    private readonly box?: string,
  ) {}

  /** The select screen only needs the idle cell. A missing sheet is "ready" so the block figure can stand in. */
  idleReady(): boolean {
    const stand = portraitSrc(this.common);
    if (stand !== this.common && this.images.get(stand)?.naturalWidth) return true;
    if (missingImages.has(this.common)) return true;
    return !!this.images.get(this.common)?.naturalWidth;
  }

  draw(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, alpha: number, tint?: string, outline?: string, pose?: FrozenPose): void {
    const clip = pose
      ? { sheet: pose.sheet as Clip['sheet'], col: pose.col, row: pose.row, sx: pose.col * CELL, sy: pose.row * CELL }
      : clipFor(f);
    // 无敌仓库大王: one 256×256 picture stands in for the whole body while the form runs.
    // The picture is a single cell, so the clip reads (0,0) and no grid math applies.
    const boxed = f.king && !!this.box && clip.sheet === 'common';
    const src = boxed ? this.box
      : f.king && clip.sheet === 'common' && this.king
      ? this.king
      : clip.sheet === 'common' ? this.common
      : clip.sheet === 'special' ? this.special
      : clip.sheet === 'world' && this.world ? this.world
      : this.frenzy;
    // Standing pose uses the 256px crop until the full sheet arrives. Fight cells then share one encode.
    const standSrc = portraitSrc(this.common);
    const sheetIm = src ? this.images.get(src) : undefined;
    const stand = src === this.common && standSrc !== this.common && clip.sx === 0 && clip.sy === 0 && !sheetIm?.naturalWidth
      ? this.images.get(standSrc)
      : undefined;
    const im = stand?.naturalWidth ? stand : sheetIm;
    if (!im || !im.naturalWidth) { this.fallback.draw(ctx, f, x, y, alpha, undefined, outline); return; }
    const h = src === this.king ? this.height * this.kingScale : this.height;
    // Bake the cell at the resolution this canvas rasterises at (device pixels in the arena,
    // the portrait's own scale on the select screen), so the blit below is 1:1 instead of a
    // resample. hypot of the x basis is the scale under any entry rotation or skew; the entry
    // transform only — the facing flip and the cartwheel rotate after this. The cap bounds
    // bake memory on huge canvases.
    const m = ctx.getTransform();
    const hs = Math.min(512, Math.max(1, Math.round(h * Math.hypot(m.a, m.b))));
    const ax = -Math.round(h / 2);
    const cell = boxed ? { sx: 0, sy: 0 } : clip;
    ctx.save();
    try {
      ctx.translate(Math.round(x), Math.round(y));
      // 微笑大回旋: the cell is a front-facing 大字. Don't mirror it; spin that pose three turns on the screen.
      // Frozen ghosts keep their stamped cell; only the live fighter spins.
      const cartwheel = !pose && f.attack?.skill.fx === 'cartwheel';
      ctx.scale(cartwheel ? 1 : (pose ? pose.facing : f.facing), 1);
      if (cartwheel && f.attack) {
        const s = f.attack.skill, end = s.duration - .08;
        if (f.attack.t >= s.start && f.attack.t < end && end > s.start) {
          const p = Math.min(1, Math.max(0, (f.attack.t - s.start) / (end - s.start)));
          const wy = -h * .5;
          ctx.translate(0, wy);
          ctx.rotate(p * Math.PI * 6);
          ctx.translate(0, -wy);
        }
      }
      // 无敌仓库大王: sink the one-picture box onto the floor line (see BOX_SINK).
      if (boxed) ctx.translate(0, BOX_SINK);
      // Undo the body offset baked into the cell so only the prop hangs off the fighter origin.
      if (!boxed && clip.ox) ctx.translate(-Math.round(clip.ox * h / CELL), 0);
      ctx.globalAlpha = alpha;
      if (outline && typeof document !== 'undefined') {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(hardRim(im, cell.sx, cell.sy, h, outline), ax - RIM_PAD, -h - RIM_PAD);
      }
      // Source cell is 256, baked once per raster size (see hs); the per-draw cost is a
      // nearest-neighbour 1:1 blit. Smoothing stays off so the blit cannot soften the pixels.
      ctx.imageSmoothingEnabled = false;
      if (tint) drawTint(ctx, im, cell.sx, cell.sy, h, hs, tint);
      else ctx.drawImage(prescaledCell(im, cell.sx, cell.sy, hs, spriteFilter(f)), ax, -h, h, h);
    } finally {
      ctx.restore();
    }
  }
}
