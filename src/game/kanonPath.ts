/* 松原花音: numbers and the one shape shared by src/game/kanon.ts (the moves) and src/render/kanonFx.ts (the pictures).
   Pure: no side effects, so the render side can import it without pulling the move scripts in. */

/** 十米迷路: she wanders WANDER seconds from where she stood to where she ends up, along LOOPS flattened rings of
 *  radius LOOP_R on the floor; the trail of footprints stays TRAIL seconds after the cast. */
export const WANDER = .46;
export const LOOPS = 2.5;
export const LOOP_R = 46;
/** The ring is drawn flattened on the floor: its depth is this fraction of its width. */
export const LOOP_DEPTH = .26;
export const TRAIL = 3;
/** Footprints along the whole walk. */
export const STEPS = 18;

/** The walk at fraction u (0..1) of the way from `from` to `to`: the body's x and the ring's depth below the foot line
 *  (y down, footprints only — the body stays on the floor). The rings shrink to nothing as she arrives.
 *  Pass `out` to reuse one point; the same object is overwritten on the next call. */
export function wanderAt(from: number, to: number, u: number, out?: { x: number; dy: number }): { x: number; dy: number } {
  const v = Math.min(1, Math.max(0, u));
  const ease = v * v * (3 - 2 * v);
  const ring = LOOP_R * (1 - v * .55);
  const a = v * LOOPS * Math.PI * 2;
  const fade = 1 - v ** 6;
  const o = out ?? { x: 0, dy: 0 };
  o.x = from + (to - from) * ease + Math.sin(a) * ring * fade;
  o.dy = (1 - Math.cos(a)) * ring * LOOP_DEPTH * fade;
  return o;
}

/** 云之呼诶: the glyph of shot i (the first is ふ, the rest ぇ), and how big it is drawn. */
export function fueeGlyph(i: number): { text: string; scale: number } {
  return { text: i <= 0 ? 'ふ' : 'ぇ', scale: 1 + Math.max(0, i) * .18 };
}

/** 迷宫水母: it bobs about JELLY_Y over the floor, JELLY_BOB up and down, one bob every JELLY_PERIOD seconds,
 *  JELLY_OUT ahead of her. */
export const JELLY_OUT = 150;
export const JELLY_Y = 112;
export const JELLY_BOB = 34;
export const JELLY_PERIOD = 2.2;
export function jellyY(age: number): number {
  return JELLY_Y + Math.sin(age * Math.PI * 2 / JELLY_PERIOD) * JELLY_BOB;
}

/** 水母之海: little jellyfish rise at SEA_RISE px/s from under the floor; the warning ring stands SEA_WARN seconds
 *  before the big one drops at SEA_DROP px/s from SEA_TOP and stops SEA_BIG_Y over the floor. */
export const SEA_RISE = 250;
export const SEA_WARN = .4;
export const SEA_GAP = .12;
export const SEA_TOP = -260;
export const SEA_DROP = 1500;
export const SEA_BIG_Y = 120;
export const SEA_BIG_SIZE = 260;
