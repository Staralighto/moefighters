/** Colour-block body used by the fallback drawer and the img2img sheets. */

export type Build = 'slim' | 'bulky' | 'tall';

export interface Dims {
  torsoW: number;
  torsoH: number;
  headR: number;
  limb: number;
  upperArm: number;
  foreArm: number;
  thigh: number;
  shin: number;
}

/**
 * Bishoujo, about 7.2–7.6 heads: long legs, narrow waist, small head.
 * `bulky` is the sturdier girl (wider hip, thicker limbs), not a male tank.
 */
export const DIMS: Record<Build, Dims> = {
  slim: { torsoW: 18, torsoH: 40, headR: 11, limb: 6, upperArm: 22, foreArm: 20, thigh: 48, shin: 46 },
  tall: { torsoW: 16, torsoH: 44, headR: 11, limb: 5.5, upperArm: 24, foreArm: 22, thigh: 50, shin: 48 },
  bulky: { torsoW: 26, torsoH: 42, headR: 11, limb: 8, upperArm: 22, foreArm: 20, thigh: 46, shin: 44 },
};

/** Gap from shoulder to the head centre, in the same units as DIMS. */
export const NECK = 4;

export interface Pt { x: number; y: number }

/** Half-widths at hip, waist, shoulder. Waist is the narrow point. */
export function torsoRadii(torsoW: number): [number, number, number] {
  return [torsoW * 0.5, torsoW * 0.32, torsoW * 0.4];
}

export function torsoPoints(hip: Pt, shoulder: Pt, radii: [number, number, number], pad: number): Pt[] {
  const dx = shoulder.x - hip.x, dy = shoulder.y - hip.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const ts = [0, 0.42, 1];
  const side = (sign: number) => ts.map((t, i) => ({
    x: hip.x + dx * t + nx * (radii[i] + pad) * sign,
    y: hip.y + dy * t + ny * (radii[i] + pad) * sign,
  }));
  return [...side(-1), ...side(1).reverse()];
}

export function headsTall(d: Dims): number {
  return (d.thigh + d.shin + d.torsoH + d.headR * 2 + NECK) / (d.headR * 2);
}
