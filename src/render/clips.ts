import type { Fighter } from '../game/fighter.ts';
import { attackPhase, stateFor } from '../game/animState.ts';

/** Square cell. Img2img replacements must keep this size and the grids below.
 *  Common is 8×3 so the sheet is 1024×384 (8:3), under the 3:1 upload limit. */
export const CELL = 128;
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
  sheet: 'common' | 'special';
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

/** Which cell a fighter occupies this frame. Missing sheets still fall back in SpriteView. */
export function clipFor(f: Fighter): Clip {
  if (f.attack) {
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
  if (state === 'run') return loco(RUN_FRAMES[Math.floor(f.animTime * 16) % 4]);
  if (state === 'ko' || state === 'down' || state === 'hurt' || state === 'dodge' || state === 'block' || state === 'jump') return loco(state);
  return loco('idle');
}
