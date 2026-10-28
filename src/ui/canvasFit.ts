/**
 * Size a visible canvas's backing store to the device pixels it actually covers.
 *
 * CSS owns the box: object-fit letterboxes the design raster inside it. So the design
 * w×h is scaled to that content box and then to device pixels. The returned factor is
 * design → device; draw in design units × factor and the compositor blits 1:1 instead of
 * resampling a 1× bitmap (which is what softens portraits on HiDPI laptops).
 *
 * Call every frame: a scale change (move a window to another monitor, browser zoom) is
 * picked up on the next draw. Returns null while the box is hidden or not laid out.
 *
 * The box is the layout box (clientWidth/Height), not the painted rect: the select stage's 3D
 * tilt and the hover / pop scales on ancestors must not resize the backing store every frame,
 * which would also rebake every sprite cell at a new raster size.
 */
export function fitCanvas(canvas: HTMLCanvasElement, designW: number, designH: number): number | null {
  const bw = canvas.clientWidth, bh = canvas.clientHeight;
  if (!bw || !bh) return null;
  const scale = Math.min(bw / designW, bh / designH) * (window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(designW * scale));
  const h = Math.max(1, Math.round(designH * scale));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return scale;
}

const fitted = new WeakMap<HTMLCanvasElement, { k: number; dpr: number }>();
const watch = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver(entries => { for (const e of entries) fitted.delete(e.target as HTMLCanvasElement); })
  : null;

/**
 * fitCanvas for per-frame callers: the layout box is measured once and again only when a
 * ResizeObserver reports a new box or the display scale changes, so a frame loop that also writes
 * styles (the select stage's parallax) never forces a style + layout pass just to re-read a size
 * that has not changed. Without ResizeObserver it measures on every call, like fitCanvas.
 */
export function fitCanvasCached(canvas: HTMLCanvasElement, designW: number, designH: number): number | null {
  const dpr = window.devicePixelRatio || 1;
  const hit = fitted.get(canvas);
  if (hit && hit.dpr === dpr) return hit.k;
  const k = fitCanvas(canvas, designW, designH);
  if (k !== null && watch) {
    fitted.set(canvas, { k, dpr });
    watch.observe(canvas);
  }
  return k;
}
