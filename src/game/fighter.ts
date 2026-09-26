import type { CharacterData, Skill } from '../data/types.ts';
import { COMBO_DECAY, COMBO_ESCAPE, FLOOR, clamp } from './constants.ts';

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
  /** 我要拉黑他: seconds of total lock. Hits during it deal half damage and nothing shortens it. */
  ban: number;
  /** 鼓点: beat stacks from landing hits; spent on cooldown speed and walk speed, lost on taking hits. */
  beatStacks: number;
  /** Seconds left of 就由我来结束一切: faster J/K, the frenzy sheet, brown afterimages. */
  frenzy: number;
  /** 就由我来结束一切: ground lights chained during the frenzy, and seconds before the chain cools off. */
  jabChain: number;
  jabChainClock: number;
  /** 绊创膏: seconds of no-flinch left. Hits still land, but nothing stops the move in progress. */
  braced: number;
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
  /** 诗超绊 teammate: a real Fighter on loan. Never counts toward the round, never gets the CPU brain. */
  minion?: boolean;
  /** Seconds before a summoned teammate bows out. Only minions carry it; kept out of DECAY_TIMERS on purpose. */
  life?: number;
  /** Challenge buff: multiplier on this fighter's final damage. 1 is neutral. */
  dmgMul: number;
  /** Challenge mode's own base damage boost, its own factor so deck buffs multiply on top of it. 1 is neutral. */
  baseDmgMul: number;
  /** Challenge buff: fraction of max health healed per second during the fight. 0 is neutral. */
  regen: number;
  /** 没问题的哦…: crit chance rolled per unblocked hit. 0 is neutral. */
  critChance: number;
  /** 碧天伴走: seconds added to the combo window, and the decay per extra combo hit. */
  comboTimeBonus: number;
  comboDecay: number;
  /** 来组乐队吧！: multiplier on every energy gain. 1 is neutral. */
  energyMul: number;
  /** 就算是迷子也要前进: walk-speed multiplier and back-dodge-cooldown multiplier. 1 is neutral. */
  moveMul: number;
  dodgeCdMul: number;
  /** 再来一次: multiplier on skill cooldowns. 1 is neutral. */
  cdMul: number;
  /** 堕天: added damage multiplier while this fighter is below half health. 0 is neutral. */
  lowHpDmg: number;
  /** 这是最后通牒: added damage multiplier taken while below quarter health. 0 is neutral. */
  executeDmg: number;
  /** 潜在表明: fraction of damage dealt healed back. 0 is neutral. */
  lifesteal: number;
  /** 竟敢无视灯: fraction of melee damage reflected at the attacker. 0 is neutral. */
  thorns: number;
  /** 我会保护小睦: multiplier on hitstun taken, and the combo count that frees the victim. */
  stunMul: number;
  escapeCombo: number;
  /** 想成为人类: cheat-death charges left this round. 0 is neutral. */
  deathSave: number;
  /** 因为我爱慕虚荣: damage/energy bonus armed by the next kill; cleared once it fires. 0 is neutral. */
  vainDmg: number;
  vainEnergy: number;
}

export const DECAY_TIMERS = ['stun', 'invuln', 'comboTime', 'hitFlash', 'landing', 'guardBroken', 'dodge', 'dodgeCd', 'frenzy', 'jabChainClock', 'braced', 'ban'] as const;

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
    knocked: 0, downTime: 0, hitBySuper: false, root: 0, rootHits: 0, ban: 0, beatStacks: 0, frenzy: 0,
    jabChain: 0, jabChainClock: 0, braced: 0,
    dodge: 0, dodgeCd: 0, dodgeRequest: false, dodgeBuffer: 0, blockTap: -1, blockBuffer: 0, blockLeft: 0,
    attack: null, attackSerial: 0, cooldowns: [0, 0, 0, 0, 0, 0], queue: [],
    jumpRequest: false, jumpBuffer: 0,
    combo: 0, hitCount: 0, walk: 0,
    animState: 'idle', animTime: 0, animSerial: 0,
    ai: { wait: .5, move: 0, block: 0, facing: init.facing, press: 0 },
    dmgMul: 1, baseDmgMul: 1, regen: 0,
    critChance: 0, comboTimeBonus: 0, comboDecay: COMBO_DECAY, energyMul: 1,
    moveMul: 1, dodgeCdMul: 1, cdMul: 1,
    lowHpDmg: 0, executeDmg: 0, lifesteal: 0, thorns: 0,
    stunMul: 1, escapeCombo: COMBO_ESCAPE, deathSave: 0, vainDmg: 0, vainEnergy: 0,
  };
}

/** Every energy gain funnels through here so card multipliers apply once; drains stay raw. */
export function gainEnergy(f: Fighter, amount: number): void {
  f.energy = clamp(f.energy + amount * f.energyMul, 0, 100);
}

/** Idle stand-in for select-screen portraits. */
export function previewFighter(data: CharacterData, time: number, facing: 1 | -1 = 1): Fighter {
  const f = makeFighter(data, 0, { x: 0, facing, controller: null, energy: 0, team: 0 });
  f.animTime = time;
  return f;
}
