/** Oversized food on 峰月律's special sheet. Each value shifts the body inside its 256 cell
 *  (negative = left) so the prop can hang into the right side. Indexed windup / active / recover,
 *  the same order as PHASES. scripts/ritsu-sheet.ts draws with these and SpriteView translates
 *  by the inverse, so the body still sits on the fighter origin at playback. */
export const RIB_OX: readonly [number, number, number] = [-48, -56, -40];
export const SKEWER_OX: readonly [number, number, number] = [-36, -56, -32];
export const STEAK_OX: readonly [number, number, number] = [-28, -16, -24];
