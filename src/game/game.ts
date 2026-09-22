import type { CharacterData, Skill, StageData } from '../data/types.ts';
import type { Attack, Fighter } from './fighter.ts';
import { DECAY_TIMERS, makeFighter } from './fighter.ts';
import { AIR_SKILLS } from '../data/skills.ts';
import { advanceAnim } from './animState.ts';
import { stepProjectiles, updateAttack, wailShots } from './combat.ts';
import { stepAI } from './ai.ts';
import { CONTROLS, FLOOR, GRAVITY, STEP, X_MAX, X_MIN, clamp } from './constants.ts';

/* Fixed-step arcade simulation. This module never touches the DOM or a canvas; it emits effects as data. */

export type Mode = 'cpu' | 'training';
export type Phase = 'intro' | 'fight' | 'roundend' | 'finished';

/** Block key released faster than this becomes a back-dodge instead of a block. */
export const DODGE_TAP = .12;
const DODGE_TIME = .28, DODGE_INVULN = .16, DODGE_CD = 1.2, DODGE_SPEED = 520;
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
}

export interface GameOptions {
  mode: Mode;
  difficulty: number;
  stage: StageData;
  audio: { play(kind: SfxKind): void };
  random?: () => number;
  onHUD?(g: FightGame): void;
  onBanner?(title: string, sub: string): void;
  onEnd?(winner: Fighter, stats: string): void;
  onPause?(paused: boolean): void;
}

export class FightGame {
  readonly characters: CharacterData[];
  readonly options: GameOptions;
  readonly mode: Mode;
  readonly difficulty: number;
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

  constructor(characters: CharacterData[], options: GameOptions) {
    this.characters = characters;
    this.options = options;
    this.mode = options.mode;
    this.difficulty = clamp(options.difficulty, 0, 1);
    this.audio = options.audio;
    this.random = options.random ?? Math.random;
    this.totalHits = characters.map(() => 0);
    this.maxCombo = characters.map(() => 0);
    this.resetRound();
  }

  /* ---- queries ---- */
  isEnemy(a: Fighter | undefined, b: Fighter | undefined): boolean { return !!a && !!b && a.team !== b.team; }
  opponents(f: Fighter): Fighter[] { return this.fighters.filter(o => this.isEnemy(f, o) && o.hp > 0); }
  targetFor(f: Fighter): Fighter | undefined {
    return this.opponents(f).sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x))[0];
  }
  teamHealth(team: number): number {
    const members = this.fighters.filter(f => f.team === team);
    return members.reduce((n, f) => n + f.hp, 0) / members.reduce((n, f) => n + f.data.hp, 0);
  }
  teamAlive(team: number): boolean { return this.fighters.some(f => f.team === team && f.hp > 0); }
  isControl(code: string): boolean {
    return code === 'Escape' || CONTROLS.some(c => c.left === code || c.right === code || c.block === code || c.jump.includes(code) || c.attacks.includes(code));
  }

  /* ---- round lifecycle ---- */
  resetRound(): void {
    this.fighters = this.characters.map((d, i) => makeFighter(d, i, {
      x: i === 0 ? 265 : 695,
      facing: i === 0 ? 1 : -1,
      controller: i === 0 ? 0 : null,
      energy: this.mode === 'training' ? 100 : 20,
    }));
    this.projectiles = [];
    this.effects = [];
    this.particles = [];
    this.texts = [];
    this.time = 60;
    this.phase = 'intro';
    this.phaseTime = 2.25;
    this.hitstop = 0;
    this.keys.clear();
    this.setBanner('ROUND ' + this.round, '先赢两回合 · READY');
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
    for (const f of this.fighters) { f.queue = []; f.jumpRequest = false; f.jumpBuffer = 0; f.dodgeRequest = false; f.blockTap = -1; }
    this.options.onBanner?.(this.paused ? 'PAUSED' : '', this.paused ? '点击下方继续战斗，或按 ESC' : '');
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
      if (code === c.block) f.blockTap = 0;
      const index = c.attacks.indexOf(code);
      if (index >= 0) f.queue.push({ index, ttl: .18 });
    }
  }
  keyUp(code: string): void {
    this.keys.delete(code);
    for (const f of this.fighters) {
      const c = f.controller !== null ? CONTROLS[f.controller] : undefined;
      if (!c || code !== c.block) continue;
      // A clean short tap (no hit absorbed while holding) is a dodge; a hold was a block.
      if (f.blockTap >= 0 && f.blockTap < DODGE_TAP) f.dodgeRequest = true;
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
  airborne(f: Fighter): boolean { return f.y < FLOOR - .5; }

  /** The move a key would produce right now: shared air normals off the ground, the character's list on it. */
  skillFor(f: Fighter, index: number): Skill {
    return this.airborne(f) && index <= 1 ? AIR_SKILLS[index] : f.data.skills[index];
  }

  canAttack(f: Fighter, index: number): boolean {
    if (this.paused || this.phase !== 'fight') return false;
    if (f.hp <= 0 || f.blocking || f.dodge > 0 || f.cooldowns[index] > 0) return false;
    const ripple = index === 4 && f.data.skills[4]?.fx === 'ripple';
    const downed = f.y >= FLOOR - .1 && f.knocked > 0 && f.vy >= 0;
    const escape = ripple && f.hitBySuper && !downed;
    if (!escape && (f.stun > 0 || f.knocked > 0)) return false;
    if (index >= 2 && this.airborne(f) && !escape) return false;
    if (f.root > 0 && this.skillFor(f, index).type === 'dash') return false;
    if (index === 5 && f.energy < 100) return false;
    const a = f.attack;
    // Grounded light attacks that connected can cancel into light or heavy.
    // A counted melee flurry is not a chainable jab; it plays out.
    const flurry = !!a && (a.skill.count ?? 0) > 1 && a.skill.type !== 'projectile';
    if (a && !(a.skill.type === 'light' && !a.skill.air && !flurry && a.hit.size > 0 && a.t > .12 && index <= 1)) return false;
    return true;
  }

  attack(f: Fighter, index: number): boolean {
    if (!this.canAttack(f, index)) return false;
    const skill = this.skillFor(f, index);
    f.attack = {
      skill, index, serial: ++f.attackSerial, t: 0, emitted: false, shots: 0, hit: new Set(),
      burst: skill.fx === 'wail' ? wailShots(f.hp, f.data.hp) : 0,
      endure: skill.type === 'endure' ? 1 : 0,
      liftAt: 0,
      tossAt: 0,
      hold: -1,
    };
    if (skill.fx === 'ripple' && f.hitBySuper) {
      f.stun = 0;
      f.knocked = 0;
      f.downTime = 0;
      f.vx = 0;
      f.vy = 0;
      f.y = FLOOR;
      f.invuln = Math.max(f.invuln, .34);
      f.hitBySuper = false;
    }
    f.cooldowns[index] = skill.cd;
    if (index === 5) {
      f.energy = 0;
      f.invuln = .64;
      this.flash = .15;
      this.shake = 5;
      this.audio.play('super');
      this.setBanner(skill.name, f.data.name + ' · SUPER', 1.0);
      this.effect('super', f.x, f.y - 80, f.data.color, .8, { radius: 160 });
    } else {
      this.audio.play(index === 0 ? 'light' : index === 1 ? 'heavy' : 'cast');
    }
    if (skill.type === 'dash') f.invuln = skill.super ? .42 : (skill.invuln ?? 0);
    if (skill.type === 'upper') { f.vy = -580; f.invuln = Math.max(f.invuln, .2); }
    if (skill.air && skill.type === 'heavy') f.vy = Math.max(f.vy, 180);
    return true;
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
        if (this.wins.some(n => n >= 2)) {
          this.phase = 'finished';
          const team = this.wins[0] >= 2 ? 0 : 1;
          this.winnerTeam = team;
          const winner = this.fighters.find(f => f.team === team && f.hp > 0) ?? this.fighters[team];
          this.options.onEnd?.(winner, `${this.wins[0]} : ${this.wins[1]} · 1P 最高 ${this.maxCombo[0]} 连击 · ${this.totalHits[0]} 次命中`);
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
    for (const f of this.fighters) advanceAnim(f, dt);
    stepProjectiles(this, dt);

    if (this.mode === 'training') {
      for (const f of this.fighters) {
        if (f.hp <= 0) { f.hp = f.data.hp; f.stun = .5; this.text('训练恢复', f.x, f.y - 185, '#b8ff83'); }
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
    this.setBanner(title, draw ? '平局 · 再战一回合' : this.fighters[winner].data.name + ' 赢下本回合');
    this.audio.play('ko');
    this.options.onHUD?.(this);
  }

  private fall(f: Fighter, dt: number): void {
    f.vy += GRAVITY * dt;
    f.y = Math.min(FLOOR, f.y + f.vy * dt);
    if (f.y === FLOOR) f.vy = 0;
  }

  private retire(f: Fighter): void {
    f.hp = 0; f.attack = null; f.queue = []; f.jumpRequest = false; f.jumpBuffer = 0; f.dodgeRequest = false; f.dodge = 0; f.blocking = false; f.ai.move = 0; f.ai.block = 0;
  }

  private startDodge(f: Fighter): void {
    f.dodge = DODGE_TIME;
    f.dodgeCd = DODGE_CD;
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

    f.cooldowns = f.cooldowns.map(n => Math.max(0, n - dt));
    for (const key of DECAY_TIMERS) f[key] = Math.max(0, f[key] - dt);
    if (f.root > 0) {
      f.root = Math.max(0, f.root - dt);
      if (f.root === 0) f.rootHits = 0;
      f.vx = 0;
    }
    if (f.knocked > 0 && f.y >= FLOOR - .1 && f.vy >= 0) { f.knocked = Math.max(0, f.knocked - dt); f.downTime += dt; }
    if (f.stun <= 0 && f.knocked <= 0) f.hitBySuper = false;
    if (!f.comboTime) f.combo = 0;
    f.energy = clamp(f.energy + dt * 2, 0, 100);
    if (this.mode === 'training') {
      f.energy = 100;
      if (f.id === 1 && f.stun === 0 && !this.fighters[0].comboTime) f.hp = Math.min(f.data.hp, f.hp + dt * 350);
    }

    const grounded = f.y >= FLOOR - .1;
    if (f.blockTap >= 0) f.blockTap += dt;
    const move = human
      ? (c && this.keys.has(c.right) ? 1 : 0) - (c && this.keys.has(c.left) ? 1 : 0)
      : this.mode !== 'training' ? f.ai.move : 0;

    const free = !f.attack && f.stun <= 0 && !f.knocked && f.dodge <= 0;
    if (f.dodgeRequest) {
      f.dodgeRequest = false;
      if (grounded && free && f.dodgeCd <= 0 && f.root <= 0) this.startDodge(f);
    }

    const block = human ? !!c && this.keys.has(c.block) : this.mode !== 'training' && f.ai.block > 0;
    f.blocking = !!(block && grounded && free && f.guardBroken <= 0 && f.guard > 0);
    if (!f.blocking) f.guard = clamp(f.guard + dt * 15, 0, 100);

    if (free) {
      if (move && (human || !f.blocking)) f.facing = Math.sign(move) as 1 | -1;
      if (!human && o && (f.ai.block > 0 || f.queue.length)) f.facing = f.ai.block > 0 ? f.ai.facing : (o.x >= f.x ? 1 : -1);
    }

    if (f.jumpRequest) { f.jumpBuffer = .14; f.jumpRequest = false; }
    if (f.jumpBuffer > 0) {
      f.jumpBuffer = Math.max(0, f.jumpBuffer - dt);
      if (grounded && free && !f.blocking && f.root <= 0) {
        f.jumpBuffer = 0;
        f.vy = -600;
        this.audio.play('jump');
        this.effect('dust', f.x, FLOOR, '#afa1c1', .3, { radius: 25 });
      }
    }

    f.queue = f.queue.filter(q => { q.ttl -= dt; return q.ttl > 0; }).slice(-4);
    if (f.queue.length && this.attack(f, f.queue[0].index)) f.queue.shift();

    if (f.dodge > 0) {
      f.x -= f.facing * DODGE_SPEED * dt;
      f.walk = 0;
    } else if (f.stun <= 0 && !f.blocking && !f.knocked && f.root <= 0) {
      // Air normals keep drift so a jump-in can still be steered. A melee flurry stays planted.
      const flurry = !!f.attack && (f.attack.skill.count ?? 0) > 1 && f.attack.skill.type !== 'projectile';
      const factor = !f.attack ? 1 : f.attack.skill.air ? .6 : f.attack.skill.type === 'light' && !flurry ? .25 : 0;
      f.x += move * f.data.speed * factor * dt;
      if (move && factor && grounded) f.walk += dt * 12; else f.walk = 0;
    }

    f.x += f.vx * dt;
    f.vx *= Math.exp(-9 * dt);
    f.vy += GRAVITY * dt;
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
