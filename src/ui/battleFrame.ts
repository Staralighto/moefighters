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
  /** Box taller than 16:9 (tablet landscape, 16:10 desktop): the picture is whole and the slack becomes bands. */
  deck: boolean;
}

/**
 * Fit the 960×540 battle bitmap to a landscape arena. Width is always filled; nothing is stretched.
 *
 * Wider than 16:9 (phones): the bitmap is taller than the box, so sky and ground are cropped and the floor
 * sits at the desktop ratio (453/540) of the box. That parks the floor over the ground strip, so the key
 * cluster hugging the bottom-right corner covers ground rather than feet.
 *
 * Taller than 16:9 (tablets, 16:10 and 4:3 windows): the whole picture shows and the leftover height becomes
 * two bands. The picture drops just below the HUD (`hudClear`, px from the box top), so the health bars live in
 * the top band instead of over the sky, and whatever is left becomes a control deck under the picture.
 * When the slack is smaller than the HUD the picture sits on the bottom edge and the HUD overlaps its top.
 */
export function battleFrame(viewW: number, viewH: number, hudClear = 0): BattleFrame {
  const scale = viewW / W;
  const imageH = H * scale;
  const hud = Math.min(1, (viewH * W) / (viewW * H));
  const slack = viewH - imageH;
  if (slack > 1) {
    const top = Math.min(slack, Math.max(0, Number.isFinite(hudClear) ? hudClear : 0));
    return { scale, top, floorY: top + FLOOR * scale, imageH, hud, deck: true };
  }

  let floorY = viewH * FLOOR / H;
  const bottomAligned = viewH - (H - FLOOR) * scale;
  const topAligned = FLOOR * scale;
  if (floorY < bottomAligned) floorY = bottomAligned;
  if (floorY > topAligned) floorY = topAligned;
  // Feet stay on screen. This only fires if the ratio itself would leave the box.
  if (floorY > viewH - GAP) floorY = viewH - GAP;

  return { scale, top: floorY - FLOOR * scale, floorY, imageH, hud, deck: false };
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
