import type { CharacterData, RootLevel, Skill } from '../data/types.ts';
import type { Mod } from './mods.ts';
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
  /** 微笑大回旋: the one mid-flight reversal has been spent. */
  flipped?: boolean;
  /** Fighter id held by 信用 before the slam. -1 means nobody. */
  hold: number;
  /** World x where 高性能作曲AI planted its lane. */
  anchor: number;
}

export interface QueuedInput { index: number; ttl: number }

/** 录音: one captured action. t is seconds since the tape started rolling. */
export interface RecEvent { t: number; kind: 'move' | 'jump' | 'atk'; v?: number }

/** The tape an echo performs: the master wrote into events while recording, then the echo plays it once. */
export interface RecTape {
  events: RecEvent[];
  /** Playback clock, running only once playing is set. */
  t: number;
  /** Length of the recording window the events were captured in. */
  total: number;
  playing: boolean;
  /** Events before this index are done; the driver resumes here so nothing replays twice. */
  cursor: number;
}

export interface Fighter {
  data: CharacterData;
  id: number;
  team: number;
  /** Index into CONTROLS, or null for CPU. */
  controller: number | null;
  x: number; y: number; vx: number; vy: number;
  facing: 1 | -1;
  hp: number; energy: number; guard: number;
  /** Meter cap: the super's own cost, never below the arcade 100. */
  energyMax: number;
  blocking: boolean;
  stun: number; invuln: number; comboTime: number; hitFlash: number; landing: number; guardBroken: number;
  knocked: number; downTime: number;
  /** The last hit that connected was a super. Lets 恐湖 break that combo. */
  hitBySuper: boolean;
  /** 超恢复: seconds of hp regen and a lock on J/K. The brace timer is separate. */
  feast: number;
  /** 无敌仓库大王: seconds left of the box form. Halves damage taken (grabs and supers
   *  excepted) and drips hp back; the king flag rides the same clock for the sheet swap. */
  box: number;
  /** 直接无限大: seconds left on the bill window. Damage taken is stored in debtDmg, not subtracted yet. */
  debt: number;
  debtDmg: number;
  /** Seconds 爱音之光 keeps the fighter from walking, jumping, dodging, or dashing. */
  root: number;
  /** Clean hits taken during the current root. Cleared when the root ends. */
  rootHits: number;
  /** Clean hits the current root can absorb before it breaks early. 0 holds until the clock lifts it. */
  rootBreak: number;
  /** The fx that applied the current root: its own follow-up hits do not count toward the break. */
  rootFx: string;
  /** Tier of the current root. Only read while root > 0; 'move' is the arcade default. */
  rootLevel: RootLevel;
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
  /** 梦想即力量！: throttle on the golden absorb feedback so a volley pops one ring, not seven. */
  braceFx: number;
  /** 禁回: seconds of energy-gain lock. Every gain funnels through gainEnergy, so one check
   *  here blocks hit gains, defender gains, block taps and idle regen; drains stay raw. */
  noGain: number;
  /** 高肌肉！: seconds of +30% damage left while the flex holds. */
  muscle: number;
  /** 秋叶原马拉松: seconds of faster walking left. Stacks on top of moveMul. */
  sprint: number;
  /** 秋叶原马拉松: seconds of no-flinch. Damage and knockback stay full; grabs and supers ignore it. */
  poise: number;
  /** 九字真言: seconds the fighter cannot block or back-dodge. Walking and jumping stay open. */
  purge: number;
  /** 脆弱: seconds of extra damage taken. 0 is neutral. */
  frail: number;
  /** Added fraction of damage taken while frail is up. 0.2 is +20%. */
  frailBonus: number;
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
  /** 对半分: J/K only. ponytail: also the translucent veil — a second basic fighter would fade too. */
  basic?: boolean;
  /** Nono国王: the king common sheet stays up through the last staff swing after the timer. */
  king?: boolean;
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
  /** 荆棘的蓝蔷薇: seconds left on the thorn window; hitting zero hands thorns back to roseBase. */
  rose: number;
  /** The thorns value the rose window arms over, so a challenge deck's own thorns survives the bloom. */
  roseBase: number;
  /** 漆黑呐喊: seconds of the unsealed damage buff left; the price lands the moment it dies. */
  shout: number;
  /** 我会保护小睦: multiplier on hitstun taken, and the combo count that frees the victim. */
  stunMul: number;
  escapeCombo: number;
  /** 想成为人类: cheat-death charges left this round. 0 is neutral. */
  deathSave: number;
  /** 因为我爱慕虚荣: damage/energy bonus armed by the next kill; cleared once it fires. 0 is neutral. */
  vainDmg: number;
  vainEnergy: number;
  /** 录音: seconds of tape left on the master. Drives the input capture; dies with DECAY_TIMERS. */
  recLeft: number;
  /** 录音: the events captured so far. The echo holds the same array by reference. */
  recTape: RecEvent[];
  /** 录音: the last move direction written to the tape, so only changes are recorded. */
  recMove: number;
  /** 打气 (GaugeSpec): the second meter. Charged through gainGauge, spent by moves directly. */
  gauge: number;
  /** 录音: this fighter is a recorded echo — unhittable, bodyless, and it replays its tape once. */
  echo?: boolean;
  /** 录音: the master this echo answers to. Echoes only. */
  master?: number;
  /** 录音: the tape an echo performs. Echoes only. */
  tape?: RecTape;
  /** Scalar buffs. The same-named timers below are a projection of this list. */
  mods: Mod[];
}

export const DECAY_TIMERS = ['stun', 'invuln', 'comboTime', 'hitFlash', 'landing', 'guardBroken', 'dodge', 'dodgeCd', 'frenzy', 'jabChainClock', 'braceFx', 'ban', 'frail', 'recLeft'] as const;

/** Meter cap for a character: the super's cost, but never below the arcade 100. */
export function meterCap(data: CharacterData): number {
  return Math.max(100, data.skills[5]?.cost ?? 100);
}

export function makeFighter(
  data: CharacterData,
  id: number,
  init: { x: number; facing: 1 | -1; controller: number | null; energy: number; team: number },
): Fighter {
  const cap = meterCap(data);
  return {
    data, id, team: init.team, controller: init.controller,
    x: init.x, y: FLOOR, vx: 0, vy: 0, facing: init.facing,
    hp: data.hp, energy: Math.min(init.energy, cap), energyMax: cap, guard: 100, blocking: false,
    stun: 0, invuln: 0, comboTime: 0, hitFlash: 0, landing: 0, guardBroken: 0,
    knocked: 0, downTime: 0, hitBySuper: false, root: 0, rootHits: 0, rootBreak: 0, rootFx: '', rootLevel: 'move', ban: 0, beatStacks: 0, frenzy: 0,
    jabChain: 0, jabChainClock: 0, braced: 0, braceFx: 0, noGain: 0, muscle: 0, sprint: 0, poise: 0, purge: 0, frail: 0, frailBonus: 0, feast: 0, box: 0,
    dodge: 0, dodgeCd: 0, dodgeRequest: false, dodgeBuffer: 0, blockTap: -1, blockBuffer: 0, blockLeft: 0,
    debt: 0, debtDmg: 0,
    attack: null, attackSerial: 0, cooldowns: [0, 0, 0, 0, 0, 0], queue: [],
    jumpRequest: false, jumpBuffer: 0,
    combo: 0, hitCount: 0, walk: 0,
    animState: 'idle', animTime: 0, animSerial: 0,
    ai: { wait: .5, move: 0, block: 0, facing: init.facing, press: 0 },
    dmgMul: 1, baseDmgMul: 1, regen: 0,
    critChance: 0, comboTimeBonus: 0, comboDecay: COMBO_DECAY, energyMul: 1,
    moveMul: 1, dodgeCdMul: 1, cdMul: 1,
    lowHpDmg: 0, executeDmg: 0, lifesteal: 0, thorns: 0, rose: 0, roseBase: 0, shout: 0,
    stunMul: 1, escapeCombo: COMBO_ESCAPE, deathSave: 0, vainDmg: 0, vainEnergy: 0,
    recLeft: 0, recTape: [], recMove: 0,
    gauge: 0,
    mods: [],
  };
}

/** Every energy gain funnels through here so card multipliers apply once; drains stay raw.
 *  禁回: while the lock holds the fighter cannot gain energy at all. */
export function gainEnergy(f: Fighter, amount: number): void {
  if (f.mods.some(m => m.kind === 'noGain' && m.left > 0)) return;
  f.energy = clamp(f.energy + amount * f.energyMul, 0, f.energyMax);
}

/** The second meter. No multipliers yet — the spec carries flat amounts; clamp at the declared cap. */
export function gainGauge(f: Fighter, amount: number): void {
  const max = f.data.gauge?.max;
  if (!max) return;
  f.gauge = clamp(f.gauge + amount, 0, max);
}

/** Idle stand-in for select-screen portraits. */
export function previewFighter(data: CharacterData, time: number, facing: 1 | -1 = 1): Fighter {
  const f = makeFighter(data, 0, { x: 0, facing, controller: null, energy: 0, team: 0 });
  f.animTime = time;
  return f;
}
