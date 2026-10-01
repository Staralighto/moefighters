import type { Fighter } from '../game/fighter.ts';
import { attackPhase, stateFor } from '../game/animState.ts';
import { YOKAN_OX } from './miyakoSheet.ts';
import { RIB_OX, SKEWER_OX, STEAK_OX } from './ritsuSheet.ts';

/** Square cell. Img2img replacements must keep this size and the grids below.
 *  Common is 8×3 so the sheet is 2048×768 (8:3), under the 3:1 upload limit.
 *  Do not downscale a 2048×768 export to 1024×384; the game samples this cell. */
export const CELL = 256;
export const COMMON_COLS = 8;
export const COMMON_ROWS = 3;
export const SPECIAL_COLS = 4;
export const SPECIAL_ROWS = 3;

export const PHASES = ['windup', 'active', 'recover'] as const;
export const SPECIAL_KEYS = ['U', 'I', 'O', 'L'] as const;

const PHASE_COL: Record<(typeof PHASES)[number], number> = { windup: 0, active: 1, recover: 2 };

/** Row 0 is the walk. Row 1 finishes locomotion and the grounded normals. Row 2 is ko plus air normals. */
export const COMMON_LABELS: string[][] = [
  ['idle', 'run0', 'run1', 'run2', 'run3', 'jump', 'block', 'dodge'],
  ['hurt', 'down', 'light-windup', 'light-active', 'light-recover', 'heavy-windup', 'heavy-active', 'heavy-recover'],
  ['ko', 'airLight-windup', 'airLight-active', 'airLight-recover', 'airHeavy-windup', 'airHeavy-active', 'airHeavy-recover', ''],
];

const LOCO: Record<string, { c: number; r: number }> = {
  idle: { c: 0, r: 0 },
  run0: { c: 1, r: 0 },
  run1: { c: 2, r: 0 },
  run2: { c: 3, r: 0 },
  run3: { c: 4, r: 0 },
  jump: { c: 5, r: 0 },
  block: { c: 6, r: 0 },
  dodge: { c: 7, r: 0 },
  hurt: { c: 0, r: 1 },
  down: { c: 1, r: 1 },
  ko: { c: 0, r: 2 },
};

const RUN_FRAMES = ['run0', 'run1', 'run2', 'run3'] as const;

const NORMAL: Record<'light' | 'heavy' | 'airLight' | 'airHeavy', { c: number; r: number }> = {
  light: { c: 2, r: 1 },
  heavy: { c: 5, r: 1 },
  airLight: { c: 1, r: 2 },
  airHeavy: { c: 4, r: 2 },
};

export interface Clip {
  sheet: 'common' | 'special' | 'frenzy' | 'world';
  col: number;
  row: number;
  sx: number;
  sy: number;
  /** Cell-space body offset baked into the art. SpriteView translates it back out. */
  ox?: number;
}

function at(sheet: Clip['sheet'], col: number, row: number): Clip {
  return { sheet, col, row, sx: col * CELL, sy: row * CELL };
}

function loco(key: keyof typeof LOCO): Clip {
  const { c, r } = LOCO[key];
  return at('common', c, r);
}

/** Row of the seated drum loop. The three L-column frames play four times across the super. */
export function drumRow(t: number, duration: number): number {
  const u = duration > 0 ? Math.min(0.999, Math.max(0, t / duration)) : 0;
  return Math.floor(u * 12) % 3;
}

/** Strum loop. The last 0.22s is the recover cell, matching the early release in combat. */
export function chordRow(t: number, duration: number): number {
  if (t >= duration - .22) return 2;
  return Math.floor(Math.max(0, t) / .14) % 3;
}

/** 高能量！／高音量！: one column of the special sheet is a single cycle — punch or shout — and
 *  the three cells repeat once per shot at the hit interval, each shot landing as the middle
 *  cell comes up. After the last one the recover cell holds out the tail. */
export function volleyRow(t: number, s: { start: number; duration: number; count?: number; interval?: number }): number {
  const count = s.count ?? 1;
  const interval = s.interval ?? Math.max(.05, (s.duration - s.start) / count);
  const first = s.start - interval / 3;
  if (t < first) return 0;
  const k = Math.floor((t - first) / interval);
  if (k >= count) return 2;
  const p = (t - first) / interval - k;
  return p < 1 / 3 ? 0 : p < 2 / 3 ? 1 : 2;
}

/** 吉他激奏: the strum loop repeats for as long as the key is held — one 0.42s cycle per wave.
 *  The release fast-forward in combat lands in the 0.3s recover tail. */
export function riffRow(t: number, duration: number): number {
  if (t >= duration - .3) return 2;
  return Math.floor(Math.max(0, t) / .14) % 3;
}

/** 韵律直觉: wind and hit alternate once per pulse. Release lands on the recover cell. */
export function grooveRow(t: number, duration: number): number {
  if (t >= duration - .3) return 2;
  return Math.floor(Math.max(0, t) / .42) % 2;
}

/** 高性能作曲AI: the mash alternates until the last quarter-second bows out. */
export function composeRow(t: number, start: number, duration: number): number {
  if (t < start) return 0;
  if (t >= duration - .25) return 2;
  return Math.floor((t - start) / .12) % 2;
}

/** 抹茶大芭菲: the arms-wide beat holds 0.25s — well past the default 0.1s active — then the bow. */
export function parfaitRow(t: number, start: number, duration: number): number {
  if (t < start) return 0;
  if (t < duration - .15) return 1;
  return 2;
}

/** Wink, heart hands, then back to standing. */
export function heartRow(t: number, start: number): number {
  if (t < start) return 0;
  if (t < start + .32) return 1;
  return 2;
}

/** 诗超绊: a short breath, a 0.6s sung note that lands right on the summon, then the bow. */
export function poemRow(t: number, start: number): number {
  if (t < start - .6) return 0;
  if (t < start) return 1;
  return 2;
}

/** 此即世界: the cast gesture rides the special L column, the chant plays the dedicated dance
 *  sheet while the world stands still, and the pulse lands on the row-2 hold pose. Cell meaning
 *  is fixed: row 0 dance beats, row 1 fancier beats, row 2 cell 0 the post-pulse pose. */
export const WORLD_CAST = .4;
export function manaWorldFrame(t: number, s: { start: number }): Clip {
  if (t < WORLD_CAST) {
    const row = t < WORLD_CAST / 3 ? 0 : t < (WORLD_CAST * 2) / 3 ? 1 : 2;
    return at('special', 3, row);
  }
  if (t >= s.start) return at('world', 0, 2);
  const beat = Math.floor((t - WORLD_CAST) / .2) % 8;
  return at('world', beat % 4, beat < 4 ? 0 : 1);
}

/** 和灯在一起的话: seven accelerating beats after the catch — first gap, then shrink per beat.
 *  Lives here so the hit scheduler (combat), the geometry poses and the row mapper share one schedule. */
export const VOW_BEATS = 7;
const VOW_GAP = .32;
const VOW_SHRINK = .8;

/** Catch-to-beat k, shared by the hit scheduler and the animators so they never drift. */
export function vowBeatTime(k: number): number {
  let t = 0;
  for (let i = 0; i < k; i++) t += VOW_GAP * Math.pow(VOW_SHRINK, i);
  return t;
}

/** 一辈子: cell 0 is the lunge and the catch; after the catch the loop coils (1) through most of
 *  each gap and slams (2) on the beat, faster every beat. Row 2 holds through the recover. */
export function vowRow(t: number, tossAt: number): number {
  if (tossAt <= 0 || t < tossAt) return 0;
  const bt = t - tossAt;
  if (bt >= vowBeatTime(VOW_BEATS - 1)) return 2;
  let j = 0;
  while (j + 1 < VOW_BEATS && vowBeatTime(j + 1) <= bt) j++;
  const span = vowBeatTime(j + 1) - vowBeatTime(j);
  const p = Math.max(0, Math.min(1, (bt - vowBeatTime(j)) / span));
  return p < .62 ? 1 : 2;
}

/** 狂化 J/K on the frenzy sheet. Row 0 is the light flurry, row 1 the kicks.
 *  Cells: 0 windup, 1 and 2 the two flurry beats, 3 the follow-through. */
export function soyoFrenzyFrame(kind: 'light' | 'heavy', t: number, s: { start: number; duration: number }): [number, number] {
  const row = kind === 'light' ? 0 : 1;
  if (t < s.start) return [0, row];
  if (t >= s.duration - .1) return [3, row];
  const span = Math.max(.05, s.duration - .1 - s.start);
  const beat = Math.floor(((t - s.start) / span) * 2);
  return [1 + Math.min(1, beat), row];
}

/** Which cell a fighter occupies this frame. Missing sheets still fall back in SpriteView. */
export function clipFor(f: Fighter): Clip {
  if (f.attack) {
    // 狂化: ground J/K read the frenzy sheet. A king reskin keeps the common cells and swaps the image.
    const crowned = f.data.view.kind === 'sprite' && !!f.data.view.king;
    if (f.frenzy > 0 && !crowned && f.attack.index <= 1 && !f.attack.skill.air) {
      const [col, row] = soyoFrenzyFrame(f.attack.index === 0 ? 'light' : 'heavy', f.attack.t, f.attack.skill);
      return { sheet: 'frenzy', col, row, sx: col * CELL, sy: row * CELL };
    }
    if (f.attack.skill.fx === 'flurry' || f.attack.skill.fx === 'mega')
      return at('special', f.attack.index - 2, volleyRow(f.attack.t, f.attack.skill));
    if (f.attack.skill.fx === 'drums') return at('special', f.attack.index - 2, drumRow(f.attack.t, f.attack.skill.duration));
    if (f.attack.skill.fx === 'chord') return at('special', f.attack.index - 2, chordRow(f.attack.t, f.attack.skill.duration));
    if (f.attack.skill.fx === 'riff') return at('special', f.attack.index - 2, riffRow(f.attack.t, f.attack.skill.duration));
    if (f.attack.skill.fx === 'groove') return at('special', f.attack.index - 2, grooveRow(f.attack.t, f.attack.skill.duration));
    if (f.attack.skill.fx === 'compose') return at('special', f.attack.index - 2, composeRow(f.attack.t, f.attack.skill.start, f.attack.skill.duration));
    if (f.attack.skill.fx === 'parfait') return at('special', f.attack.index - 2, parfaitRow(f.attack.t, f.attack.skill.start, f.attack.skill.duration));
    if (f.attack.skill.fx === 'heart') return at('special', f.attack.index - 2, heartRow(f.attack.t, f.attack.skill.start));
    if (f.attack.skill.fx === 'wink') return at('special', f.attack.index - 2, heartRow(f.attack.t, f.attack.skill.start));
    if (f.attack.skill.fx === 'crown') return at('special', f.attack.index - 2, volleyRow(f.attack.t, f.attack.skill));
    if (f.attack.skill.fx === 'world') return manaWorldFrame(f.attack.t, f.attack.skill);
    if (f.attack.skill.fx === 'poem') return at('special', f.attack.index - 2, poemRow(f.attack.t, f.attack.skill.start));
    if (f.attack.skill.fx === 'star') return at('special', f.attack.index - 2, volleyRow(f.attack.t, f.attack.skill));
    if (f.attack.skill.fx === 'rabbit' || f.attack.skill.fx === 'kiss' || f.attack.skill.fx === 'hug' || f.attack.skill.fx === 'half' || f.attack.skill.fx === 'king') {
      const t = f.attack.t, s = f.attack.skill;
      const row = t < s.start ? 0 : t >= s.duration - .22 ? 2 : 1;
      return at('special', f.attack.index - 2, row);
    }
    if (f.attack.skill.fx === 'vow') return at('special', f.attack.index - 2, vowRow(f.attack.t, f.attack.tossAt));
    if (f.attack.skill.fx === 'spin') {
      const t = f.attack.t, s = f.attack.skill;
      const row = t < s.start ? 0 : t >= s.duration - .26 ? 2 : 1;
      return at('special', f.attack.index - 2, row);
    }
    const phase = PHASE_COL[attackPhase(f.attack).phase];
    if (f.attack.skill.air) {
      const base = f.attack.skill.type === 'heavy' ? NORMAL.airHeavy : NORMAL.airLight;
      return at('common', base.c + phase, base.r);
    }
    if (f.attack.index <= 1) {
      const base = f.attack.index === 0 ? NORMAL.light : NORMAL.heavy;
      return at('common', base.c + phase, base.r);
    }
    // 巨羊羹砸击: the cell shifts the body aside to fit the block, so hand back the inverse.
    if (f.attack.skill.fx === 'yokan') return { ...at('special', f.attack.index - 2, phase), ox: YOKAN_OX[phase] };
    // 峰月律: the same shift, one table per food column.
    if (f.attack.skill.fx === 'rib') return { ...at('special', f.attack.index - 2, phase), ox: RIB_OX[phase] };
    if (f.attack.skill.fx === 'skewer') return { ...at('special', f.attack.index - 2, phase), ox: SKEWER_OX[phase] };
    if (f.attack.skill.fx === 'steak') return { ...at('special', f.attack.index - 2, phase), ox: STEAK_OX[phase] };
    return at('special', f.attack.index - 2, phase);
  }
  const state = stateFor(f);
  // 狂化 stance while she is otherwise just standing around. The king sheet uses the common idle cell.
  const crowned = f.data.view.kind === 'sprite' && !!f.data.view.king;
  if (f.frenzy > 0 && !crowned && state === 'idle') return at('frenzy', 0, 2);
  // 4 frames at 8 Hz: one stride is 0.5s.
  if (state === 'run') return loco(RUN_FRAMES[Math.floor(f.animTime * 8) % 4]);
  if (state === 'ko' || state === 'down' || state === 'hurt' || state === 'dodge' || state === 'block' || state === 'jump') return loco(state);
  return loco('idle');
}
