import type { Fighter } from './fighter.ts';

/* 悬浮 (view.hover): how high a floating fighter's drawn body rests above her feet. Game code uses it only to place
   effects on her body (hit sparks, guard flashes, her own swing); hitboxes and positions never read it.
   The live float (bob, sink, fall, rise) is render/hover.ts. */
export function bodyLift(f: Fighter): number {
  const v = f.data.view;
  return v.kind === 'sprite' ? v.hover?.lift ?? 0 : 0;
}
