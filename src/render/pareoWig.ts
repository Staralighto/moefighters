import type { Fighter } from '../game/fighter.ts';
import { CELL, PAREO_GRAY, PAREO_WIGS, PAREO_WIG_BLACK, PAREO_WIG_TAG } from './clips.ts';

/** Packed masks follow the installed sheets: R = original pink locks, G = original cyan locks. */
export const PAREO_HAIR_MASKS = {
  common: '/sprites/pareo/common-hair-mask.png',
  special: '/sprites/pareo/special-hair-mask.png',
} as const;
const CACHE_MAX = 96;
const cache = new Map<string, HTMLCanvasElement>();

function hexHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return rgbHsl((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255);
}
function rgbHsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hue2(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function hslRgb(h: number, s: number, l: number): [number, number, number] {
  if (s <= 0) return [l, l, l];
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, k = h / 360;
  return [hue2(p, q, k + 1 / 3), hue2(p, q, k), hue2(p, q, k - 1 / 3)];
}

/** Blend only the two marked hair regions; keep original alpha, outlines and shading. */
export function recolorWigPixels(px: Uint8ClampedArray, mask: Uint8ClampedArray, wig: number): void {
  const target = PAREO_WIGS[wig] ?? PAREO_WIGS[0];
  const colors = [hexHsl(target.hair), hexHsl(target.tip)];
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const red = mask[i] / 255, green = mask[i + 1] / 255;
    const total = red + green;
    if (!total) continue;
    const lum = (.2126 * px[i] + .7152 * px[i + 1] + .0722 * px[i + 2]) / 255;
    if (lum < .16) continue;
    // Raster filtering can mix the channels at a boundary; never apply more than full coverage.
    const weights = [red / Math.max(1, total), green / Math.max(1, total)];
    const rgb = [px[i], px[i + 1], px[i + 2]].map(v => v * (1 - Math.min(1, total)));
    for (let layer = 0; layer < 2; layer++) {
      if (!weights[layer]) continue;
      const [h, s, l] = colors[layer];
      // Keep highlights coloured instead of washing the secondary locks out to white.
      const shade = l < .25 ? .4 : lum > .72 ? .35 : .7;
      const lightness = Math.min(.98, Math.max(.04, l + (lum - .72) * shade));
      const color = hslRgb(h, s, lightness);
      for (let c = 0; c < 3; c++) rgb[c] += color[c] * 255 * weights[layer];
    }
    for (let c = 0; c < 3; c++) px[i + c] = rgb[c];
  }
}

/** One cell of `im`, at raster size hs, with wig `wig` on. */
export function wigCell(im: HTMLImageElement, sx: number, sy: number, cs: number, hs: number, wig: number, mask: HTMLImageElement | undefined): HTMLCanvasElement | undefined {
  if (typeof document === 'undefined' || !mask?.naturalWidth) return undefined;
  const key = im.src + '|' + mask.src + '|' + sx + '|' + sy + '|' + cs + '|' + hs + '|' + wig;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = hs; c.height = hs;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return undefined;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(im, sx, sy, cs, cs, 0, 0, hs, hs);
  try {
    const data = g.getImageData(0, 0, hs, hs);
    g.clearRect(0, 0, hs, hs);
    // Use cell size, not image width: idle crops are one cell, while lite sheets are half-size.
    const ratio = CELL / cs;
    g.drawImage(mask, sx * ratio, sy * ratio, cs * ratio, cs * ratio, 0, 0, hs, hs);
    recolorWigPixels(data.data, g.getImageData(0, 0, hs, hs).data, wig);
    g.putImageData(data, 0, 0);
  } catch { return undefined; }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, c);
  return c;
}

/** Which wig she wears now: a live 'look' with the wig tag, v the index into PAREO_WIGS. Undefined is her own two-tone.
 *  灰色重染 puts her own black hair on until the colour comes back. */
export function wigOf(f: Fighter): number | undefined {
  if (f.data.id !== 'pareo') return undefined;
  if (f.attack?.skill.fx === 'pareo-gray' && f.attack.t < PAREO_GRAY.color) return PAREO_WIG_BLACK;
  for (const m of f.mods) if (m.kind === 'look' && m.tag === PAREO_WIG_TAG && m.left > 0) return m.v;
  return undefined;
}
