/** One lite tier, switched on once and kept for the session so it cannot oscillate. */
export let liteFx = false;
export function isLiteFx(): boolean { return liteFx; }
export function setLiteFx(on: boolean): void { liteFx = on; }

/** Average frame gap that trips the lite tier, roughly 42fps or worse. */
export function shouldGoLite(avgMs: number, touch: boolean): boolean {
  return touch && avgMs > 24;
}
