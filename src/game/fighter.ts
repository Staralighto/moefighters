import type { CharacterData, Skill } from '../data/types.ts';
import { FLOOR } from './constants.ts';

export type AnimState =
  | 'idle' | 'run' | 'jump' | 'block' | 'dodge' | 'hurt' | 'down' | 'ko'
  | 'light' | 'heavy' | 'skill1' | 'skill2' | 'skill3' | 'super';

export const ATTACK_STATES: AnimState[] = ['light', 'heavy', 'skill1', 'skill2', 'skill3', 'super'];

export interface Attack {
  skill: Skill;
  index: number;
  serial: number;
  t: number;
  emitted: boolean;
  shots: number;
  /** Shots this cast will fire. 0 means use the skill's count. */
  burst: number;
  /** Fighter ids already hit by this attack instance. */
  hit: Set<number>;
  /** Hits this move can absorb during wind-up without being interrupted. */
  endure: number;
  /** Attack time when 推落 starts the slow lift. 0 means no lift pending. */
  liftAt: number;
  /** Attack time when 推落 releases the held fighter. 0 means no release pending. */
  tossAt: number;
  /** Fighter id held by 信用 before the slam. -1 means nobody. */
  hold: number;
}

export interface QueuedInput { index: number; ttl: number }

export interface Fighter {
  data: CharacterData;
  id: number;
  team: number;
  /** Index into CONTROLS, or null for CPU. */
  controller: number | null;
  x: number; y: number; vx: number; vy: number;
  facing: 1 | -1;
  hp: number; energy: number; guard: number;
  blocking: boolean;
  stun: number; invuln: number; comboTime: number; hitFlash: number; landing: number; guardBroken: number;
  knocked: number; downTime: number;
  /** The last hit that connected was a super. Lets 恐湖 break that combo. */
  hitBySuper: boolean;
  /** Seconds 爱音之光 keeps the fighter from walking, jumping, dodging, or dashing. */
  root: number;
  /** Clean hits taken during root. The second one clears it. */
  rootHits: number;
  /** Remaining back-dodge time and its cooldown. */
  dodge: number; dodgeCd: number;
  dodgeRequest: boolean;
  /** Seconds a dodge press is kept. The clock pauses while the fighter cannot act. */
  dodgeBuffer: number;
  /** Seconds the block key has been held; -1 when released. A tap shorter than DODGE_TAP becomes a dodge. */
  blockTap: number;
  /** A block press kept until it can happen. The clock pauses while a move or stun is on. */
  blockBuffer: number;
  /** A released tap keeps guarding this long, so the block is actually there. */
  blockLeft: number;
  attack: Attack | null;
  attackSerial: number;
  cooldowns: number[];
  queue: QueuedInput[];
  jumpRequest: boolean;
  jumpBuffer: number;
  combo: number; hitCount: number;
  walk: number;
  animState: AnimState; animTime: number; animSerial: number;
  ai: { wait: number; move: number; block: number; facing: 1 | -1; press: number };
}

export const DECAY_TIMERS = ['stun', 'invuln', 'comboTime', 'hitFlash', 'landing', 'guardBroken', 'dodge', 'dodgeCd'] as const;

export function makeFighter(
  data: CharacterData,
  id: number,
  init: { x: number; facing: 1 | -1; controller: number | null; energy: number; team: number },
): Fighter {
  return {
    data, id, team: init.team, controller: init.controller,
    x: init.x, y: FLOOR, vx: 0, vy: 0, facing: init.facing,
    hp: data.hp, energy: init.energy, guard: 100, blocking: false,
    stun: 0, invuln: 0, comboTime: 0, hitFlash: 0, landing: 0, guardBroken: 0,
    knocked: 0, downTime: 0, hitBySuper: false, root: 0, rootHits: 0,
    dodge: 0, dodgeCd: 0, dodgeRequest: false, dodgeBuffer: 0, blockTap: -1, blockBuffer: 0, blockLeft: 0,
    attack: null, attackSerial: 0, cooldowns: [0, 0, 0, 0, 0, 0], queue: [],
    jumpRequest: false, jumpBuffer: 0,
    combo: 0, hitCount: 0, walk: 0,
    animState: 'idle', animTime: 0, animSerial: 0,
    ai: { wait: .5, move: 0, block: 0, facing: init.facing, press: 0 },
  };
}

/** Idle stand-in for select-screen portraits. */
export function previewFighter(data: CharacterData, time: number, facing: 1 | -1 = 1): Fighter {
  const f = makeFighter(data, 0, { x: 0, facing, controller: null, energy: 0, team: 0 });
  f.animTime = time;
  return f;
}
