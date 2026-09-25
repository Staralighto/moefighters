import type { Fighter } from '../game/fighter.ts';
import { attackPhase, stateFor } from '../game/animState.ts';

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
  sheet: 'common' | 'special' | 'frenzy';
  col: number;
  row: number;
  sx: number;
  sy: number;
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
    // 狂化: ground J/K read the frenzy sheet, everything else keeps its own cells.
    if (f.frenzy > 0 && f.attack.index <= 1 && !f.attack.skill.air) {
      const [col, row] = soyoFrenzyFrame(f.attack.index === 0 ? 'light' : 'heavy', f.attack.t, f.attack.skill);
      return { sheet: 'frenzy', col, row, sx: col * CELL, sy: row * CELL };
    }
    if (f.attack.skill.fx === 'drums') return at('special', f.attack.index - 2, drumRow(f.attack.t, f.attack.skill.duration));
    if (f.attack.skill.fx === 'chord') return at('special', f.attack.index - 2, chordRow(f.attack.t, f.attack.skill.duration));
    if (f.attack.skill.fx === 'heart') return at('special', f.attack.index - 2, heartRow(f.attack.t, f.attack.skill.start));
    if (f.attack.skill.fx === 'poem') return at('special', f.attack.index - 2, poemRow(f.attack.t, f.attack.skill.start));
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
    return at('special', f.attack.index - 2, phase);
  }
  const state = stateFor(f);
  // 狂化 stance while she is otherwise just standing around.
  if (f.frenzy > 0 && state === 'idle') return at('frenzy', 0, 2);
  // 4 frames at 8 Hz: one stride is 0.5s.
  if (state === 'run') return loco(RUN_FRAMES[Math.floor(f.animTime * 8) % 4]);
  if (state === 'ko' || state === 'down' || state === 'hurt' || state === 'dodge' || state === 'block' || state === 'jump') return loco(state);
  return loco('idle');
}
