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
 */
export function fitCanvas(canvas: HTMLCanvasElement, designW: number, designH: number): number | null {
  const box = canvas.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  const scale = Math.min(box.width / designW, box.height / designH) * (window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(designW * scale));
  const h = Math.max(1, Math.round(designH * scale));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return scale;
}
