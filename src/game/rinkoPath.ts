/* 白金燐子: numbers shared by game/rinko.ts, render/rinkoFx.ts and render/clips.ts. */

/** U 帐篷出行: seconds in the tent, the damage she still takes, her walking pace inside it, and how long the tent
 *  takes to drop over her (her body is not drawn after that: she is inside). */
export const RINKO_TENT = { time: 1.8, brace: .2, pace: .5, cover: .12 } as const;
/** U: the toss pose after the tent is flung (her own U, replayed from the last cell). a.mode on that pose. */
export const RINKO_TOSS = { mode: 1, time: .3 } as const;

/** I 键盘手有话要说: the gap between two dots (the skill's interval; selfcheck holds them equal). */
export const RINKO_DOT_GAP = .26;

/** L 燐燐开花, on the attack clock. The spotlight and the eyes until the skill's start; then the keys run. */
export const RINKO_BLOOM = {
  /** a.mode: stage fright, the keys running, held among the roses, thrown, the keys ran out. */
  fright: 0, run: 1, bloom: 2, done: 3, miss: 4,
  /** The keys' head rides this high over the floor. */
  keyY: 34,
  /** The last rose waits this long after the small ones. */
  bigGap: .1,
  /** The rose window breaks into petals this long after it opens. */
  shatter: .72,
  /** The end pose lasts this long once the big rose is out (or the keys ran out). */
  bow: .55,
} as const;

/** The kaomoji the chat window posts, in order (O 线上话痨模式). The last one is her logging off. */
export const RINKO_KAOMOJI = ['(〃∀〃)', '(>_<)', '(*´ω｀*)', 'ヽ(・∀・)ﾉ', '(｡•ㅅ•｡)', '(ﾉ´▽｀)ﾉ', 'Σ(っ°Д°;)', '(｡•́︿•̀｡)'] as const;
/** The lines the chat window scrolls while she types. */
export const RINKO_CHAT = ['RinRin: 大家好(〃∀〃)', 'RinRin: 今天也要加油ヽ(・∀・)ﾉ', 'RinRin: 这个我知道！', 'RinRin: 冲呀(ﾉ´▽｀)ﾉ', 'RinRin: 我…我先下线了(｡•́︿•̀｡)'] as const;
