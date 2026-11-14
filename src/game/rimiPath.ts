/* 牛込里美: numbers shared by game/rimi.ts, render/rimiFx.ts and render/clips.ts. */

/** U 今晚放映恐怖片: the TV lands this far ahead of her; the ghost spends `rise` seconds climbing out of the screen,
 *  then crawls along the floor at the skill's speed for the skill's range. `reach` is how close (each side) it has
 *  to be to grab an ankle, `air` how far off the floor a body may be and still be caught (a jump clears it). */
export const RIMI_TV = { out: 112, rise: .5, reach: 34, air: 40, fade: .35 } as const;
/** U: the clap pose holds until this long before the end. */
export const RIMI_TV_TAIL = .22;

/** I 巧克力螺，请收下！: four cornets out of both hands, each its own throw (forward speed, upward speed). A cornet that
 *  lands waits `settle` seconds to be picked up; she eats it if she walks within `pick`: `heal` hp and `energy` 气. At
 *  most `keep` wait on the floor at once (the oldest goes). */
export const RIMI_TOSS = {
  throws: [[250, -560], [340, -470], [430, -390], [520, -300]] as readonly (readonly [number, number])[],
  hand: 104, settle: 4, pick: 40, heal: 8, energy: 10, keep: 4, tail: .25,
} as const;

/** O 告一段"螺": windup to the skill's start, then she drills forward for `dash` seconds with a tick every `tick`
 *  (`ticks` of them), carrying whoever the tip catches `carry` px ahead; then the chocolate spray reaching `spray` px.
 *  The recovery pose holds `tail`. */
export const RIMI_DRILL = { dash: .44, tick: .1, ticks: 4, carry: 118, reach: 150, spray: 190, tail: .32 } as const;
/** a.mode of O: winding up, drilling, done. */
export const DRILL = { wind: 0, drill: 1, done: 2 } as const;

/** L 我的心是巧克力螺: a.mode walks these. Bite until the skill's start, then the poof; she rolls to the wall, turns,
 *  rolls back to where she started (or the other wall), and pops back out. */
export const ROLL = { bite: 0, out: 1, turn: 2, back: 3, spit: 4 } as const;
export const RIMI_ROLL = {
  /** Rolling speed, and how close to the wall it turns. */
  speed: 950, wall: 64,
  /** A body within `reach` of her middle and no higher than `air` off the floor is rolled over. */
  reach: 70, air: 64,
  /** Seconds the turn at the wall takes. */
  turn: .16,
  /** Each pass that rolls over a body lands `hits` segments, `gap` apart. The last pass ends in the finale. */
  hits: 3, gap: .1,
  /** Flattened bodies stay squashed this long at most (the second pass or the finale lifts it sooner). */
  flat: 2.4,
  /** A cornet lying on the floor within `slurp` of her is rolled up; each adds `bonus` to the finale. */
  slurp: 60, bonus: 8,
  /** The pop-out: the first `pop` seconds are the arms-up cell, the rest the sitting cell. */
  pop: .2, tail: 1.05,
} as const;
/** The squash a rolled-over body wears (render/clips.ts flatSquash). */
export const RIMI_FLAT = { x: 1.42, y: .32, ease: .06 } as const;

/** Her special cells play this much bigger, about the feet (view.specialScale in data/characters.ts; selfcheck holds
 *  them equal); the fx that sit on her hands or mouth scale their offsets by it too. */
export const RIMI_POSE = 1.1;

/** Drawn sizes of the four props, for a 256 px picture (render/rimiFx.ts). */
export const RIMI_DRAW = { tv: 150, ghost: 168, cornet: 62, drill: 120, giant: 220 } as const;

/** Which special row a 牛込里美 move shows right now. */
export function rimiRow(fx: string, t: number, start: number, duration: number, mode: number | undefined, popAt: number): number {
  switch (fx) {
    case 'rimi-tv': return t < start ? 0 : t < duration - RIMI_TV_TAIL ? 1 : 2;
    case 'rimi-cornet': return t < start ? 0 : t < duration - RIMI_TOSS.tail ? 1 : 2;
    case 'rimi-drill': return (mode ?? DRILL.wind) === DRILL.wind ? 0 : mode === DRILL.drill ? 1 : 2;
    case 'rimi-roll': {
      const m = mode ?? ROLL.bite;
      if (m === ROLL.bite) return 0;
      if (m === ROLL.spit) return t < popAt + RIMI_ROLL.pop ? 1 : 2;
      return 1;
    }
    default: return 0;
  }
}
