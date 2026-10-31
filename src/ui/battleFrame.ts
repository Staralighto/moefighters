import { FLOOR, H, W } from '../game/constants.ts';

const GAP = 8;

export interface BattleFrame {
  scale: number;
  /** Canvas `top` in px. Negative crops sky; the width still fills the box. */
  top: number;
  floorY: number;
  imageH: number;
  /** 1 on a 16:9 box. Shorter phones shrink the top HUD so its share of the height matches desktop. */
  hud: number;
}

/**
 * Fit the 960×540 battle bitmap to a landscape arena.
 * Width is filled. The floor sits at the desktop ratio (443/540) of the box.
 * That ratio already parks the floor over the ground strip, so the key cluster, which hugs the same
 * bottom-right corner, only ever covers ground rather than feet.
 */
export function battleFrame(viewW: number, viewH: number): BattleFrame {
  const scale = viewW / W;
  const imageH = H * scale;
  const hud = Math.min(1, (viewH * W) / (viewW * H));

  let floorY = viewH * FLOOR / H;
  if (imageH >= viewH) {
    const bottomAligned = viewH - (H - FLOOR) * scale;
    const topAligned = FLOOR * scale;
    if (floorY < bottomAligned) floorY = bottomAligned;
    if (floorY > topAligned) floorY = topAligned;
  }
  // Feet stay on screen. This only fires if the ratio itself would leave the box.
  if (floorY > viewH - GAP) floorY = viewH - GAP;

  return { scale, top: floorY - FLOOR * scale, floorY, imageH, hud };
}

/** Top HUD scale for a picture `pictureW` CSS pixels wide.
 *  The 960-wide share, then 1.2× so a phone-width portrait stays readable. */
export function pictureHud(pictureW: number): number {
  return pictureW > 0 ? pictureW / W * 1.2 : 1;
}

/** Stage baseline of the HIT line. `clearPx` is how far below the canvas top the HUD chrome
 *  reaches, in CSS pixels. 205 is the resting spot; a cropped sky pulls that spot up under
 *  the portraits, and then the line moves down so the 45px face sits fully below the chrome. */
export function comboAnchor(clearPx: number, scale: number): number {
  if (!(scale > 0)) return 205;
  return Math.max(205, clearPx / scale + 45);
}
