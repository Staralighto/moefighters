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
