/** One lite tier, switched on once and kept for the session so it cannot oscillate. */
export let liteFx = false;
export function isLiteFx(): boolean { return liteFx; }
export function setLiteFx(on: boolean): void { liteFx = on; }

/** Sustained gaps over 20ms miss the 60fps budget by a visible margin. */
export function shouldGoLite(avgMs: number, touch: boolean): boolean {
  return touch && avgMs > 20;
}
