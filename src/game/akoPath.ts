/* 宇田川亚子: numbers shared by game/ako.ts and render/akoFx.ts. */

/** I 暗黑咏唱·提词版, on the attack clock: the line reads, sticks, and 燐子 slips her the rest. */
export const AKO_CHANT = {
  /** The strip stops at 「……那个……是什么来着？」 here, and she is open until stuckTo. */
  stuckFrom: .35,
  stuckTo: .75,
  /** Broken while stuck: this much of the wait is left. */
  refund: .5,
  /** 燐子 behind her this long. */
  rinko: .6,
  /** L: the pause after the last little spirit, then the warning ring. */
  bigGap: .2,
  bigWarn: .35,
} as const;
/** The little spirits' cruising speed once they turn on the foe. */
export const AKO_SPIRIT_SPEED = 520;
/** The big spirit starts above the top of the screen and stops with its centre this high over the floor. */
export const AKO_BIG_TOP = -160;
export const AKO_BIG_Y = 110;
/** The chant strip's three lines. */
export const AKO_LINES = ['吾之右眼中沉睡的……', '……那个……是什么来着？', '——沉眠于永夜吧！'] as const;
/** L: the summoning gate stands this far behind her, its centre this high over the floor; the spirits come out of it. */
export const AKO_GATE = { back: 46, y: 118 } as const;
