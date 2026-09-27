/** 巨羊羹砸击 only. The yokan is longer than the cell can hold beside a centred body, so each
 *  U-column cell offsets the body inside its 256 cell to make room for the block. Indexed by
 *  windup/active/recover, the same order as PHASES. scripts/miyako-sheet.ts draws with these and
 *  SpriteView translates by the inverse so the body still sits on the fighter origin at playback. */
export const YOKAN_OX: readonly [number, number, number] = [54, -44, -16];
