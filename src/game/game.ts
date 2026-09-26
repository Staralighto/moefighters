import type { CharacterData, Skill, StageData } from '../data/types.ts';
import type { Attack, Fighter, QueuedInput } from './fighter.ts';
import { DECAY_TIMERS, gainEnergy, makeFighter } from './fighter.ts';
import { AIR_SKILLS } from '../data/skills.ts';
import { ROSTER_BY_ID } from '../data/characters.ts';
import { advanceAnim } from './animState.ts';
import { effectSettled, stepProjectiles, updateAttack, wailShots } from './combat.ts';
import { stepAI } from './ai.ts';
import { COMBO_DECAY, COMBO_ESCAPE, CONTROLS, FLOOR, GRAVITY, INPUT_BUFFER, SIDE, STEP, X_MAX, X_MIN, clamp } from './constants.ts';

/* Fixed-step arcade simulation. This module never touches the DOM or a canvas; it emits effects as data. */

export type Mode = 'cpu' | 'training' | 'team' | 'challenge';
export type Phase = 'intro' | 'fight' | 'roundend' | 'finished';

const DUO_SPAWN = [
  { x: 265, facing: 1 as const, team: 0, controller: 0 as number | null },
  { x: 695, facing: -1 as const, team: 1, controller: null },
];
const TEAM_SPAWN = [
  { x: 210, facing: 1 as const, team: 0, controller: 0 as number | null },
  { x: 120, facing: 1 as const, team: 0, controller: null },
  { x: 750, facing: -1 as const, team: 1, controller: null },
  { x: 840, facing: -1 as const, team: 1, controller: null },
];
/** Challenge is a 2-on-1: the solo human left, the random CPU pair right. */
const CHALLENGE_SPAWN = [
  { x: 210, facing: 1 as const, team: 0, controller: 0 as number | null },
  { x: 750, facing: -1 as const, team: 1, controller: null },
  { x: 840, facing: -1 as const, team: 1, controller: null },
];

/** Block key released faster than this becomes a back-dodge instead of a block. */
export const DODGE_TAP = .12;
/** A tapped block keeps guarding at least this long after the finger lifts. */
const BLOCK_MIN = .16;
/** True while a press should wait instead of expiring. Hitstun, knockdown, a move, a dodge, or a root. */
function inputLocked(f: Fighter): boolean {
  return f.stun > 0 || f.knocked > 0 || !!f.attack || f.dodge > 0 || f.root > 0 || f.ban > 0;
}
const DODGE_TIME = .28, DODGE_INVULN = .16, DODGE_CD = 1.2;
/** Back-dodge covers 35% of the stage, enough to clear key skills. */
const DODGE_SPEED = (X_MAX - X_MIN) * .35 / DODGE_TIME;
/** 狂化连招: three ground jabs inside the window arm the next press as the heavy, so mashing J keeps looping. */
const FRENZY_CHAIN_JABS = 3;
const FRENZY_CHAIN_WINDOW = .6;
/** 诗超绊: the teammate's health CAP is this slice of the borrowed sheet, for this long. The brain is the master AI (stepAI). */
const MINION_HP_RATIO = .2;
const MINION_LIFE = 12;
/** Who can answer the call. ponytail: roster ids only, so a teammate is always a finished character. */
const MINION_POOL = ['anon', 'soyo'] as const;
export type SfxKind = 'light' | 'heavy' | 'hit' | 'block' | 'super' | 'select' | 'jump' | 'ko' | 'cast';

export interface Effect {
  type: string; x: number; y: number; color: string; life: number; max: number;
  radius?: number; dir?: number; fighter?: number; alpha?: number; tint?: string;
  /** Attack clock for a guitar that has to stay glued to the move. */
  age?: number;
}
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }
export interface FloatingText { text: string; x: number; y: number; color: string; life: number; max: number; size: number }
export interface Projectile {
  owner: number; x: number; y: number; vx: number; vy: number; life: number; age: number;
  skill: Skill; color: string; radius: number; size: number; fx: string;
  attack: Attack; hit: Set<number>; trail: { x: number; y: number }[];
  /** Cucumber boomerang has already turned around once. */
  returned?: boolean;
  /** Chocolate milk has landed and can be picked up. Bags never set this. */
  settled?: boolean;
  /** 奇独点: the last damage tick this well fired. */
  ticked?: number;
}

export interface GameOptions {
  mode: Mode;
  difficulty: number;
  /** Per fighter. Omitted keeps the old default: slot 0 human, everyone else CPU. */
  controllers?: (number | null)[];
  /** Per fighter slot. Challenge decks only; omitted keeps every fighter neutral. */
  mods?: ChallengeMods[];
  /** Rounds a side needs to win the match. Defaults to the classic best-of-three (first to 2). */
  roundsToWin?: number;
  stage: StageData;
  audio: { play(kind: SfxKind): void };
  random?: () => number;
  onHUD?(g: FightGame): void;
  onBanner?(title: string, sub: string): void;
  onEnd?(title: string, stats: string): void;
  onPause?(paused: boolean): void;
}

/** One slot's card deck, aggregated from the picked stack counts by challenge.ts aggregatePicks.
    Every field is optional and defaults to neutral, so {} arms nothing. */
export interface ChallengeMods {
  /** Challenge mode's own base damage boost for the player slot, kept apart from deck buffs so they multiply on top. */
  baseDamage?: number;
  /** 焚音打: multiplier on final damage. */
  damage?: number;
  /** 没问题的哦: fraction of max health healed per second. */
  regen?: number;
  /** 最喜欢闪闪发光的东西！: crit chance per unblocked hit. */
  crit?: number;
  /** 碧天伴走: seconds added to the combo window, and the decay per extra combo hit. */
  comboTimeBonus?: number;
  comboDecay?: number;
  /** 来组乐队吧！: multiplier on every energy gain. */
  energyMul?: number;
  /** 就算是迷子也要前进: walk-speed multiplier and back-dodge-cooldown multiplier. */
  moveMul?: number;
  dodgeCdMul?: number;
  /** 再来一次: multiplier on skill cooldowns. */
  cdMul?: number;
  /** 堕天: added damage multiplier while the attacker is below half health. */
  lowHpDmg?: number;
  /** 这是最后通牒: added damage multiplier while the defender is below quarter health. */
  executeDmg?: number;
  /** 潜在表明: fraction of damage dealt healed back. */
  lifesteal?: number;
  /** 竟敢无视灯: fraction of melee damage reflected at the attacker. */
  thorns?: number;
  /** 我会保护小睦: multiplier on hitstun taken, and the combo count that frees the victim. */
  stunMul?: number;
  escapeCombo?: number;
  /** 想成为人类: cheat-death charges for this round. */
  deathSave?: number;
  /** 因为我爱慕虚荣: damage/energy bonus armed by the first kill of the round. */
  vainDamage?: number;
  vainEnergy?: number;
}

export class FightGame {
  readonly characters: CharacterData[];
  readonly options: GameOptions;
  readonly mode: Mode;
  readonly difficulty: number;
  readonly roundsToWin: number;
  readonly audio: GameOptions['audio'];
  readonly random: () => number;

  fighters: Fighter[] = [];
  projectiles: Projectile[] = [];
  effects: Effect[] = [];
  particles: Particle[] = [];
  texts: FloatingText[] = [];
  wins = [0, 0];
  round = 1;
  time = 60;
  age = 0;
  phase: Phase = 'intro';
  phaseTime = 0;
  paused = false;
  shake = 0;
  hitstop = 0;
  flash = 0;
  totalHits: number[];
  maxCombo: number[];
  winnerTeam = -1;
  keys = new Set<string>();

  private accumulator = 0;
  private lastFrame = 0;
  private uiClock = 0;
  private bannerLeft = 0;
  private lastBanner = '';
  /** Minion ids start past any real slot (team mode has 0-3): every id stays unique, so hit sets and holds never alias. */
  private minionSeq = 100;

  constructor(characters: CharacterData[], options: GameOptions) {
    this.characters = characters;
    this.options = options;
    this.mode = options.mode;
    this.difficulty = clamp(options.difficulty, 0, 2);
    this.roundsToWin = Math.max(1, Math.round(options.roundsToWin ?? 2));
    this.audio = options.audio;
    this.random = options.random ?? Math.random;
    this.totalHits = characters.map(() => 0);
    this.maxCombo = characters.map(() => 0);
    this.resetRound();
  }

  /* ---- queries ---- */
  isEnemy(a: Fighter | undefined, b: Fighter | undefined): boolean { return !!a && !!b && a.team !== b.team; }
  /** By id, never by array slot: a summoned teammate's id has nothing to do with its position. */
  fighterById(id: number): Fighter | undefined { return this.fighters.find(f => f.id === id); }
  opponents(f: Fighter): Fighter[] { return this.fighters.filter(o => this.isEnemy(f, o) && o.hp > 0); }
  targetFor(f: Fighter): Fighter | undefined {
    return this.opponents(f).sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x))[0];
  }
  teamHealth(team: number): number {
    const members = this.fighters.filter(f => f.team === team && !f.minion);
    return members.reduce((n, f) => n + f.hp, 0) / members.reduce((n, f) => n + f.data.hp, 0);
  }
  teamAlive(team: number): boolean { return this.fighters.some(f => f.team === team && f.hp > 0 && !f.minion); }
  isControl(code: string): boolean {
    return code === 'Escape' || CONTROLS.some(c => c.left === code || c.right === code || c.block === code || c.jump.includes(code) || c.attacks.includes(code));
  }

  /* ---- round lifecycle ---- */
  resetRound(): void {
    const spawn = this.mode === 'team' ? TEAM_SPAWN
      : this.mode === 'challenge' ? (this.characters.length === 2 ? DUO_SPAWN : CHALLENGE_SPAWN)
      : DUO_SPAWN;
    const controls = this.options.controllers;
    this.fighters = this.characters.map((d, i) => {
      const f = makeFighter(d, i, {
        ...spawn[i],
        controller: controls ? (controls[i] ?? null) : spawn[i].controller,
        energy: this.mode === 'training' ? 100 : 20,
      });
      const m = this.options.mods?.[i];
      f.dmgMul = m?.damage ?? 1;
      f.baseDmgMul = m?.baseDamage ?? 1;
      f.regen = m?.regen ?? 0;
      f.critChance = m?.crit ?? 0;
      f.comboTimeBonus = m?.comboTimeBonus ?? 0;
      f.comboDecay = m?.comboDecay ?? COMBO_DECAY;
      f.energyMul = m?.energyMul ?? 1;
      f.moveMul = m?.moveMul ?? 1;
      f.dodgeCdMul = m?.dodgeCdMul ?? 1;
      f.cdMul = m?.cdMul ?? 1;
      f.lowHpDmg = m?.lowHpDmg ?? 0;
      f.executeDmg = m?.executeDmg ?? 0;
      f.lifesteal = m?.lifesteal ?? 0;
      f.thorns = m?.thorns ?? 0;
      f.stunMul = m?.stunMul ?? 1;
      f.escapeCombo = m?.escapeCombo ?? COMBO_ESCAPE;
      f.deathSave = m?.deathSave ?? 0;
      // vain re-arms every round from the deck; the kill itself spends it until the next reset.
      f.vainDmg = m?.vainDamage ?? 0;
      f.vainEnergy = m?.vainEnergy ?? 0;
      return f;
    });
    this.projectiles = [];
    this.effects = [];
    this.particles = [];
    this.texts = [];
    this.time = 60;
    this.phase = 'intro';
    this.phaseTime = 2.25;
    this.hitstop = 0;
    this.keys.clear();
    this.setBanner('ROUND ' + this.round, this.roundsToWin === 1 ? '单回合决胜 · READY' : '先赢两回合 · READY');
    this.options.onHUD?.(this);
  }

  /** Feed a requestAnimationFrame timestamp; runs as many fixed steps as elapsed time allows. */
  advance(nowMs: number): void {
    if (!this.lastFrame) this.lastFrame = nowMs;
    const delta = Math.min((nowMs - this.lastFrame) / 1000, .1);
    this.lastFrame = nowMs;
    this.accumulator += delta;
    while (this.accumulator >= STEP) {
      this.step(STEP);
      this.accumulator -= STEP;
    }
  }

  togglePause(force?: boolean): void {
    if (this.phase === 'finished') return;
    this.paused = force ?? !this.paused;
    this.keys.clear();
    for (const f of this.fighters) { f.queue = []; f.jumpRequest = false; f.jumpBuffer = 0; f.dodgeRequest = false; f.dodgeBuffer = 0; f.blockTap = -1; f.blockBuffer = 0; f.blockLeft = 0; }
    this.options.onBanner?.(this.paused ? 'PAUSED' : '', '');
    this.options.onPause?.(this.paused);
  }

  /* ---- input ---- */
  keyDown(code: string): void {
    if (code === 'Escape') { this.togglePause(); return; }
    if (this.keys.has(code)) return;
    this.keys.add(code);
    if (this.paused || this.phase !== 'fight') return;
    for (const f of this.fighters) {
      if (f.controller === null || f.hp <= 0) continue;
      const c = CONTROLS[f.controller];
      if (!c) continue;
      if (c.jump.includes(code)) f.jumpRequest = true;
      if (code === c.block) { f.blockTap = 0; f.blockBuffer = INPUT_BUFFER; }
      const index = c.attacks.indexOf(code);
      if (index >= 0) {
        const last = f.queue[f.queue.length - 1];
        if (last?.index === index) last.ttl = INPUT_BUFFER;
        else f.queue.push({ index, ttl: INPUT_BUFFER });
      }
    }
  }
  keyUp(code: string, dodge = true): void {
    this.keys.delete(code);
    for (const f of this.fighters) {
      const c = f.controller !== null ? CONTROLS[f.controller] : undefined;
      if (!c || code !== c.block) continue;
      // A clean short tap (no hit absorbed while holding) is a dodge; a hold was a block.
      // Touch passes dodge=false: a tap on the phone block button stays a block, and is remembered.
      const tap = f.blockTap >= 0 && f.blockTap < DODGE_TAP;
      if (dodge && tap) { f.dodgeRequest = true; f.blockBuffer = 0; }
      else if (!dodge && tap) f.blockBuffer = INPUT_BUFFER;
      else f.blockBuffer = 0;
      f.blockTap = -1;
    }
  }

  /* ---- fx as data ---- */
  setBanner(title: string, sub = '', duration = 0): void {
    this.lastBanner = title;
    this.options.onBanner?.(title, sub);
    this.bannerLeft = duration;
  }
  effect(type: string, x: number, y: number, color: string, life = .4, extra: Partial<Effect> = {}): void {
    this.effects.push({ type, x, y, color, life, max: life, ...extra });
  }
  text(text: string, x: number, y: number, color = '#fff', life = .65, size = 22): void {
    this.texts.push({ text, x, y, color, life, max: life, size });
  }
  sparks(x: number, y: number, color: string, count = 16, power = 1): void {
    for (let i = 0; i < count; i++) {
      const a = this.random() * Math.PI * 2, v = (75 + this.random() * 200) * power;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: .15 + this.random() * .4, color, size: 2 + Math.floor(this.random() * 5) });
    }
  }

  /* ---- attacks ---- */
  airborne(f: Fighter): boolean { return f.y < FLOOR - .5 || f.vy < 0; }

  /** The move a key would produce right now: shared air normals off the ground, the character's list on it. */
  skillFor(f: Fighter, index: number): Skill {
    return this.airborne(f) && index <= 1 ? AIR_SKILLS[index] : f.data.skills[index];
  }

  canAttack(f: Fighter, index: number): boolean {
    if (this.paused || this.phase !== 'fight') return false;
    if (f.hp <= 0 || f.blocking || f.dodge > 0 || f.cooldowns[index] > 0) return false;
    const breakout = !!f.data.skills[index]?.breakout;
    const downed = f.y >= FLOOR - .1 && f.knocked > 0 && f.vy >= 0;
    const escape = breakout && f.hitBySuper && !downed;
    if (f.ban > 0 || (!escape && (f.stun > 0 || f.knocked > 0))) return false;
    if (index >= 2 && this.airborne(f) && !escape) return false;
    if ((f.root > 0 || f.ban > 0) && this.skillFor(f, index).type === 'dash') return false;
    if (index === 5 && f.energy < 100) return false;
    const a = f.attack;
    // Grounded light attacks that connected can cancel into light or heavy.
    // A counted melee flurry is not a chainable jab; it plays out.
    const flurry = !!a && (a.skill.count ?? 0) > 1 && a.skill.type !== 'projectile';
    if (a && !(a.skill.type === 'light' && !a.skill.air && !flurry && a.hit.size > 0 && a.t > .12 && index <= 1)) return false;
    return true;
  }

  /** 狂化连招: while the chain is warm, the ground press after the third jab resolves as the kick. */
  private frenzyChain(f: Fighter, index: number): number {
    if (index !== 0 || f.frenzy <= 0 || this.airborne(f)) return index;
    if (f.jabChainClock <= 0) f.jabChain = 0;
    return f.jabChain >= FRENZY_CHAIN_JABS ? 1 : 0;
  }

  attack(f: Fighter, index: number): boolean {
    const slot = this.frenzyChain(f, index);
    if (!this.canAttack(f, slot)) return false;
    const skill = this.skillFor(f, slot);
    f.attack = {
      skill, index: slot, serial: ++f.attackSerial, t: 0, emitted: false, shots: 0, hit: new Set(),
      burst: skill.fx === 'wail' ? wailShots(f.hp, f.data.hp) : 0,
      endure: skill.type === 'endure' ? 1 : 0,
      liftAt: 0,
      tossAt: 0,
      hold: -1,
    };
    if (skill.breakout && f.hitBySuper) {
      f.stun = 0;
      f.knocked = 0;
      f.downTime = 0;
      f.vx = 0;
      f.vy = 0;
      f.y = FLOOR;
      f.invuln = Math.max(f.invuln, skill.invuln ?? .34);
      f.hitBySuper = false;
    } else if (skill.breakout && skill.invuln) {
      f.invuln = Math.max(f.invuln, skill.invuln);
    }
    // Frenzy shortens the recast wait of the ground jab and kick to match the faster clock.
    f.cooldowns[slot] = skill.cd * f.cdMul * (f.frenzy > 0 && slot <= 1 && !skill.air ? .6 : 1);
    if (slot === 5) {
      f.energy = 0;
      f.invuln = .64;
      this.flash = .15;
      this.shake = 5;
      this.audio.play('super');
      this.setBanner(skill.name, f.data.name + ' · SUPER', 1.0);
      this.effect('super', f.x, f.y - 80, f.data.color, .8, { radius: 160 });
    } else {
      this.audio.play(slot === 0 ? 'light' : slot === 1 ? 'heavy' : 'cast');
    }
    if (skill.type === 'dash') f.invuln = skill.super ? .42 : (skill.invuln ?? 0);
    if (skill.type === 'upper') { f.vy = -580; f.invuln = Math.max(f.invuln, .2); }
    // A rising jump keeps its upward speed. The dive kick only adds to a fall.
    if (skill.air && skill.type === 'heavy' && f.vy >= 0) f.vy = Math.max(f.vy, 180);
    // 狂化连招: ground jabs stack the chain; any heavy out of it spends the chain.
    if (f.frenzy > 0 && slot <= 1 && !this.airborne(f)) {
      if (slot === 0) { f.jabChain++; f.jabChainClock = FRENZY_CHAIN_WINDOW; }
      else f.jabChain = 0;
    }
    return true;
  }

  /** A long cooldown or an empty super meter should not sit in front of a move that can happen now. */
  private staleIntent(f: Fighter, index: number): boolean {
    if (f.cooldowns[index] > INPUT_BUFFER) return true;
    return index === 5 && f.energy < 100 && this.mode !== 'training';
  }

  /** Keep a press that is only waiting on a lock, landing, or a cooldown about to end. */
  private bufferHolds(f: Fighter, index: number): boolean {
    if (f.stun > 0 || f.knocked > 0 || !!f.attack || f.dodge > 0 || f.root > 0 || f.ban > 0) return true;
    if (this.airborne(f) && index >= 2) return true;
    if (this.staleIntent(f, index)) return false;
    return f.cooldowns[index] > 0;
  }

  /** Fire the first legal attack. An earlier press that cannot happen soon is dropped. */
  private releaseQueue(f: Fighter, dt: number): boolean {
    let fired = false;
    const skipped: QueuedInput[] = [];
    const later: QueuedInput[] = [];
    for (const q of f.queue) {
      if (!fired && this.attack(f, q.index)) { fired = true; continue; }
      (fired ? later : skipped).push(q);
    }
    const pending = fired ? [...skipped.filter(q => !this.staleIntent(f, q.index)), ...later] : [...f.queue];
    for (const q of pending) if (!this.bufferHolds(f, q.index)) q.ttl -= dt;
    f.queue = pending.filter(q => q.ttl > 0).slice(-4);
    return fired;
  }

  /* ---- simulation ---- */
  step(dt: number): void {
    if (this.paused) return;
    this.age += dt;
    if (this.hitstop > 0) { this.hitstop = Math.max(0, this.hitstop - dt); return; }
    this.shake = Math.max(0, this.shake - dt * 22);
    this.flash = Math.max(0, this.flash - dt);
    if (this.bannerLeft > 0) { this.bannerLeft -= dt; if (this.bannerLeft <= 0) this.setBanner(''); }
    this.updateVisuals(dt);

    if (this.phase !== 'fight') {
      for (const f of this.fighters) {
        if (this.phase === 'roundend' && f.hp <= 0) this.fall(f, dt);
        advanceAnim(f, dt);
      }
    }
    if (this.phase === 'intro') {
      this.phaseTime -= dt;
      if (this.phaseTime < .75 && this.lastBanner !== 'FIGHT!') { this.setBanner('FIGHT!', '开打！'); this.audio.play('super'); }
      if (this.phaseTime <= 0) { this.phase = 'fight'; this.setBanner(''); }
      return;
    }
    if (this.phase === 'roundend') {
      this.phaseTime -= dt;
      if (this.phaseTime <= 0) {
        if (this.wins.some(n => n >= this.roundsToWin)) {
          this.phase = 'finished';
          const team = this.wins[0] >= this.roundsToWin ? 0 : 1;
          this.winnerTeam = team;
          const lead = this.fighters[0];
          this.options.onEnd?.(this.teamNames(team) + ' 获胜', `${this.wins[0]} : ${this.wins[1]} · ${lead.data.name} 最高 ${this.maxCombo[0]} 连击 · ${this.totalHits[lead.id]} 次命中`);
        } else {
          this.round++;
          this.resetRound();
        }
      }
      return;
    }
    if (this.phase !== 'fight') return;

    if (this.mode !== 'training') this.time -= dt;
    stepAI(this, dt);
    for (const f of this.fighters) this.stepFighter(f, dt);
    this.stepMinions(dt);
    if (this.mode === 'team' || this.mode === 'challenge') this.separate();
    for (const f of this.fighters) advanceAnim(f, dt);
    stepProjectiles(this, dt);

    if (this.mode === 'training') {
      for (const f of this.fighters) {
        if (f.hp <= 0) { f.hp = f.data.hp; f.stun = .5; this.text('训练恢复', f.x, f.y - 185, SIDE[1]); }
      }
    } else if (!this.teamAlive(0) || !this.teamAlive(1) || this.time <= 0) {
      this.endRound();
    }

    this.uiClock += dt;
    if (this.uiClock > .07) { this.options.onHUD?.(this); this.uiClock = 0; }
  }

  private endRound(): void {
    const health = [this.teamHealth(0), this.teamHealth(1)];
    const winner = health[0] > health[1] ? 0 : 1;
    const draw = Math.abs(health[0] - health[1]) < .00001;
    if (!draw) this.wins[winner]++;
    this.phase = 'roundend';
    this.phaseTime = 2.4;
    this.projectiles = [];
    for (const f of this.fighters) { f.queue = []; f.attack = null; }
    const title = draw ? 'DRAW' : this.time <= 0 ? 'TIME UP' : 'K.O.';
    this.setBanner(title, draw ? '平局 · 再战一回合' : this.teamNames(winner) + ' 赢下本回合');
    this.audio.play('ko');
    this.options.onHUD?.(this);
  }

  private teamNames(team: number): string {
    return this.fighters.filter(f => f.team === team).map(f => f.data.name).join(' & ');
  }

  /** ponytail: 36px gap only between teams. Teammates have no body and pass through. */
  private separate(): void {
    const GAP = 36;
    const live = this.fighters.filter(f => f.hp > 0);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        if (a.team === b.team) continue;
        if (Math.abs(a.y - b.y) >= 40) continue;
        const dx = b.x - a.x;
        const adx = Math.abs(dx);
        if (adx >= GAP) continue;
        const push = (GAP - adx) / 2;
        const sign = dx === 0 ? 1 : Math.sign(dx);
        a.x = clamp(a.x - sign * push, X_MIN, X_MAX);
        b.x = clamp(b.x + sign * push, X_MIN, X_MAX);
      }
    }
  }

  /** 诗超绊: a MyGO teammate answers the call — a real Fighter whose health cap is 20% of the borrowed sheet. */
  summonAlly(owner: Fighter): void {
    const old = this.fighters.find(f => f.minion && f.team === owner.team);
    if (old) this.dismissMinion(old, false);
    const data = ROSTER_BY_ID.get(MINION_POOL[Math.floor(this.random() * MINION_POOL.length)]);
    if (!data) return;
    const m = makeFighter({ ...data, hp: Math.round(data.hp * MINION_HP_RATIO) }, this.minionSeq++, {
      x: clamp(owner.x - owner.facing * 46, X_MIN, X_MAX),
      facing: owner.facing,
      controller: null,
      energy: 0,
      team: owner.team,
    });
    m.hp = m.data.hp;
    m.minion = true;
    m.life = MINION_LIFE;
    while (this.totalHits.length <= m.id) { this.totalHits.push(0); this.maxCombo.push(0); }
    this.fighters.push(m);
    this.sparks(m.x, m.y - 80, m.data.color, 16);
    this.effect('super', m.x, m.y - 80, m.data.color, .5, { radius: 60 });
    this.text(m.data.name + '！', m.x, m.y - 210, m.data.color, .8, 20);
  }

  private dismissMinion(m: Fighter, expired: boolean): void {
    const i = this.fighters.indexOf(m);
    if (i < 0) return;
    this.fighters.splice(i, 1);
    this.sparks(m.x, m.y - 80, m.data.color, 18);
    this.effect('burst', m.x, m.y - 80, m.data.color, .35, { radius: 60 });
    if (expired) this.text('谢幕', m.x, m.y - 200, m.data.color, .8, 18);
  }

  /** 诗超绊: the teammate's brain is stepAI on the master tier; this pass only ages and retires them. */
  private stepMinions(dt: number): void {
    if (!this.fighters.some(f => f.minion)) return;
    const gone: Fighter[] = [];
    for (const m of this.fighters) {
      if (!m.minion) continue;
      m.life = (m.life ?? 0) - dt;
      if (m.hp <= 0 || m.life <= 0) gone.push(m);
    }
    for (const m of gone) this.dismissMinion(m, m.hp > 0);
  }

  private fall(f: Fighter, dt: number): void {
    f.vy += GRAVITY * dt;
    f.y = Math.min(FLOOR, f.y + f.vy * dt);
    if (f.y === FLOOR) f.vy = 0;
  }

  private retire(f: Fighter): void {
    f.hp = 0; f.attack = null; f.queue = []; f.jumpRequest = false; f.jumpBuffer = 0; f.dodgeRequest = false; f.dodgeBuffer = 0; f.blockBuffer = 0; f.blockLeft = 0; f.dodge = 0; f.blocking = false; f.ai.move = 0; f.ai.block = 0;
  }

  private startDodge(f: Fighter): void {
    f.dodge = DODGE_TIME;
    f.dodgeCd = DODGE_CD * f.dodgeCdMul;
    f.invuln = Math.max(f.invuln, DODGE_INVULN);
    f.blocking = false;
    f.walk = 0;
    this.audio.play('jump');
    this.effect('dust', f.x, FLOOR, '#afa1c1', .3, { radius: 25 });
    this.effect('ghost', f.x, f.y, f.data.color, .2, { fighter: f.id, alpha: .35 });
  }

  private stepFighter(f: Fighter, dt: number): void {
    if (f.hp <= 0) { this.retire(f); this.fall(f, dt); return; }
    const o = this.targetFor(f);
    const c = f.controller !== null ? CONTROLS[f.controller] : undefined;
    const human = f.controller !== null;

    f.cooldowns = f.cooldowns.map(n => Math.max(0, n - dt * (f.data.trait === 'beat' ? 1 + f.beatStacks * .06 : 1)));
    for (const key of DECAY_TIMERS) f[key] = Math.max(0, f[key] - dt);
    if (f.root > 0) {
      f.root = Math.max(0, f.root - dt);
      if (f.root === 0) f.rootHits = 0;
      f.vx = 0;
    }
    // 我要拉黑他: frozen solid — knockback from follow-up hits never moves the body.
    if (f.ban > 0) f.vx = 0;
    if (f.knocked > 0 && f.y >= FLOOR - .1 && f.vy >= 0) { f.knocked = Math.max(0, f.knocked - dt); f.downTime += dt; }
    if (f.stun <= 0 && f.knocked <= 0) f.hitBySuper = false;
    if (!f.comboTime) f.combo = 0;
    gainEnergy(f, dt * 2);
    if (f.regen > 0) f.hp = Math.min(f.data.hp, f.hp + f.data.hp * f.regen * dt);
    if (this.mode === 'training') {
      f.energy = 100;
      if (f.id === 1 && f.stun === 0 && !this.fighters[0].comboTime) f.hp = Math.min(f.data.hp, f.hp + dt * 350);
    }

    const grounded = f.y >= FLOOR - .1;
    if (f.blockTap >= 0) f.blockTap += dt;
    const move = human
      ? (c && this.keys.has(c.right) ? 1 : 0) - (c && this.keys.has(c.left) ? 1 : 0)
      : this.mode !== 'training' ? f.ai.move : 0;
    const blockHeld = human ? !!c && this.keys.has(c.block) : this.mode !== 'training' && f.ai.block > 0;

    if (f.dodgeRequest) { f.dodgeBuffer = INPUT_BUFFER; f.dodgeRequest = false; }
    // Humans can cut recovery into a block or a dodge once the move has already hit. CPU stays committed.
    if (human && f.attack && effectSettled(f.attack)) {
      const wantDodge = f.dodgeBuffer > 0 && grounded && f.dodgeCd <= 0 && f.root <= 0 && f.ban <= 0;
      const wantBlock = (blockHeld || f.blockBuffer > 0) && grounded && f.guardBroken <= 0 && f.guard > 0;
      if (wantDodge) {
        f.attack = null;
        f.dodgeBuffer = 0;
        f.blockBuffer = 0;
        this.startDodge(f);
      } else if (wantBlock) {
        f.attack = null;
        if (!blockHeld) f.blockLeft = Math.max(f.blockLeft, BLOCK_MIN);
        f.blockBuffer = 0;
      }
    }

    let free = !f.attack && f.stun <= 0 && !f.knocked && f.dodge <= 0;
    if (f.dodgeBuffer > 0) {
      if (grounded && free && f.dodgeCd <= 0 && f.root <= 0 && f.ban <= 0) { f.dodgeBuffer = 0; this.startDodge(f); free = false; }
      else if (grounded && !inputLocked(f)) f.dodgeBuffer = Math.max(0, f.dodgeBuffer - dt);
    }

    const canGuard = grounded && free && f.guardBroken <= 0 && f.guard > 0;
    if (canGuard && (blockHeld || f.blockLeft > 0 || f.blockBuffer > 0)) {
      if (!blockHeld && f.blockBuffer > 0) f.blockLeft = Math.max(f.blockLeft, BLOCK_MIN);
      if (!blockHeld) f.blockBuffer = 0;
      f.blocking = blockHeld || f.blockLeft > 0;
    } else f.blocking = false;
    if (f.blockLeft > 0) f.blockLeft = Math.max(0, f.blockLeft - dt);
    if (f.blockBuffer > 0 && !inputLocked(f) && !this.airborne(f)) f.blockBuffer = Math.max(0, f.blockBuffer - dt);
    if (!f.blocking) f.guard = clamp(f.guard + dt * 15, 0, 100);

    if (free) {
      if (move && (human || !f.blocking)) f.facing = Math.sign(move) as 1 | -1;
      if (!human && o && (f.ai.block > 0 || f.queue.length)) f.facing = f.ai.block > 0 ? f.ai.facing : (o.x >= f.x ? 1 : -1);
    }

    if (f.jumpRequest) { f.jumpBuffer = INPUT_BUFFER; f.jumpRequest = false; }
    const jumpHeld = human && !!c && c.jump.some(code => this.keys.has(code));
    const canHop = grounded && f.stun <= 0 && f.knocked <= 0 && f.dodge <= 0 && !f.blocking && f.root <= 0 && f.ban <= 0;
    // A held jump leaves the ground during a jab and comes back out on landing. Skills stay put.
    if (jumpHeld && canHop && f.vy >= 0 && !(f.attack && f.attack.index > 1)) {
      const convert = f.attack && !f.attack.skill.air && f.attack.index <= 1 ? f.attack.index : -1;
      if (convert >= 0) { f.cooldowns[convert] = 0; f.attack = null; }
      f.vy = -600;
      f.jumpBuffer = 0;
      this.audio.play('jump');
      this.effect('dust', f.x, FLOOR, '#afa1c1', .3, { radius: 25 });
      if (convert >= 0) this.attack(f, convert);
    }
    const fired = this.releaseQueue(f, dt);
    if (fired && !jumpHeld) { f.jumpBuffer = 0; f.jumpRequest = false; }
    else if (f.jumpBuffer > 0) {
      if (canHop && !f.attack) {
        f.jumpBuffer = 0;
        f.vy = -600;
        this.audio.play('jump');
        this.effect('dust', f.x, FLOOR, '#afa1c1', .3, { radius: 25 });
      } else if (grounded && !inputLocked(f)) f.jumpBuffer = Math.max(0, f.jumpBuffer - dt);
    }
    if (human && c && this.airborne(f) && !f.attack) {
      const index = this.keys.has(c.attacks[1]) ? 1 : this.keys.has(c.attacks[0]) ? 0 : -1;
      if (index >= 0) {
        if (f.vy < 0 && f.y >= FLOOR - 2) f.cooldowns[index] = 0;
        this.attack(f, index);
      }
    }

    if (f.dodge > 0) {
      f.x -= f.facing * DODGE_SPEED * dt;
      f.walk = 0;
    } else if (f.stun <= 0 && !f.blocking && !f.knocked && f.root <= 0 && f.ban <= 0) {
      // Air normals keep drift so a jump-in can still be steered. A melee flurry stays planted.
      const flurry = !!f.attack && (f.attack.skill.count ?? 0) > 1 && f.attack.skill.type !== 'projectile';
      const factor = !f.attack ? 1 : f.attack.skill.air ? .6 : f.attack.skill.type === 'light' && !flurry ? .25 : 0;
      const beatMove = f.data.trait === 'beat' ? 1 + f.beatStacks * .02 : 1;
      f.x += move * f.data.speed * f.moveMul * beatMove * factor * dt;
      if (move && factor && grounded) f.walk += dt * 12; else f.walk = 0;
    }

    f.x += f.vx * dt;
    f.vx *= Math.exp(-9 * dt);
    // A juggled float falls slower, so launch into a jump attack has time to connect.
    const juggled = !grounded && f.stun > 0 && f.knocked <= 0;
    f.vy += GRAVITY * (juggled ? .6 : 1) * dt;
    f.y += f.vy * dt;
    if (f.y > FLOOR) {
      if (f.vy > 350) { f.landing = .12; this.effect('dust', f.x, FLOOR, '#afa1c1', .3, { radius: 25 }); }
      f.y = FLOOR;
      f.vy = 0;
      if (f.attack?.skill.air) f.attack = null;
    }
    f.x = clamp(f.x, X_MIN, X_MAX);
    updateAttack(this, f, dt);
    f.x = clamp(f.x, X_MIN, X_MAX);
  }

  private updateVisuals(dt: number): void {
    for (const e of this.effects) e.life -= dt;
    this.effects = this.effects.filter(e => e.life > 0);
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 520 * dt; }
    this.particles = this.particles.filter(p => p.life > 0).slice(-320);
    for (const t of this.texts) { t.life -= dt; t.y -= 28 * dt; }
    this.texts = this.texts.filter(t => t.life > 0);
  }
}
