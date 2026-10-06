import type { Fighter } from './fighter.ts';
import type { FightGame } from './game.ts';

/** Scalar buffs. root, ban, frenzy and king stay on the fighter: they stop clocks and swap moves. */
export type ModKind =
  | 'brace' | 'poise' | 'dmgDealt' | 'dmgTaken' | 'speed' | 'slow' | 'regen'
  | 'noGain' | 'lockNormals' | 'lockGuard' | 'thorns' | 'debt';

/**
 * One running buff.
 * ponytail: onExpire and pulse are closures. Ceiling: there is no replay and no netcode.
 * If either arrives, store the bill on the mod (the debt acc already is) and drop the functions.
 */
export interface Mod {
  kind: ModKind;
  left: number;
  v?: number;
  /** 花道·缠: jump launch-velocity multiplier carried by a 'slow' mod. */
  jump?: number;
  tag?: string;
  acc?: number;
  onExpire?: (g: FightGame, f: Fighter) => void;
  pulseEvery?: number;
  pulse?: (g: FightGame, f: Fighter) => void;
}

export function addMod(f: Fighter, kind: ModKind, time: number, opt: Partial<Mod> & { max?: boolean } = {}): Mod {
  const tag = opt.tag ?? '';
  let m = f.mods.find(x => x.kind === kind && (x.tag ?? '') === tag);
  if (!m) {
    m = { kind, left: 0 };
    f.mods.push(m);
  }
  if (tag) m.tag = tag;
  m.left = opt.max ? Math.max(m.left, time) : time;
  if (opt.v != null) m.v = opt.v;
  if (opt.jump != null) m.jump = opt.jump;
  if (opt.acc != null) m.acc = opt.acc;
  if (opt.onExpire) m.onExpire = opt.onExpire;
  if (opt.pulse) m.pulse = opt.pulse;
  if (opt.pulseEvery) m.pulseEvery = opt.pulseEvery;
  project(f);
  return m;
}

export function clearMod(f: Fighter, kind: ModKind, tag = ''): void {
  const m = f.mods.find(x => x.kind === kind && (x.tag ?? '') === tag);
  if (m) m.left = 0;
  project(f);
}

export function has(f: Fighter, kind: ModKind): boolean {
  return f.mods.some(m => m.kind === kind && m.left > 0);
}

/** Damage dealt. Each live mod multiplies (1 + v). */
export function dmgDealtMul(f: Fighter): number {
  let m = 1;
  for (const mod of f.mods) if (mod.kind === 'dmgDealt' && mod.left > 0) m *= 1 + (mod.v ?? 0);
  return m;
}

/** Damage taken from brace and dmgTaken. Brace applies once, including the howl/frenzy case. */
export function dmgTakenMul(f: Fighter, opt: { grab: boolean; superHit: boolean; superBrace: boolean; fallback: number }): number {
  let m = 1;
  const brace = has(f, 'brace');
  if ((brace && !opt.grab && !opt.superHit) || opt.superBrace) {
    m *= f.mods.find(x => x.kind === 'brace' && x.left > 0)?.v ?? opt.fallback;
  }
  if (!opt.grab && !opt.superHit) {
    for (const mod of f.mods) if (mod.kind === 'dmgTaken' && mod.left > 0) m *= mod.v ?? 1;
  }
  return m;
}

/** Walk multiplier. 1 when nothing changes the pace. Sprint speeds up, 减速 slows down. */
export function speedMul(f: Fighter): number {
  let m = 1;
  for (const mod of f.mods) if ((mod.kind === 'speed' || mod.kind === 'slow') && mod.left > 0) m *= mod.v ?? 1;
  return m;
}

/** Jump launch-velocity multiplier. 1 when no 减速 is up; the height scales with the square. */
export function jumpMul(f: Fighter): number {
  let m = 1;
  for (const mod of f.mods) if (mod.kind === 'slow' && mod.left > 0) m *= mod.jump ?? 1;
  return m;
}

export function addDebt(f: Fighter, amount: number): void {
  const m = f.mods.find(x => x.kind === 'debt' && x.left > 0);
  if (!m) return;
  m.acc = (m.acc ?? 0) + amount;
  project(f);
}

/** Flat hp per second from live regen mods. */
export function regenPerSec(f: Fighter): number {
  let n = 0;
  for (const m of f.mods) if (m.kind === 'regen' && m.left > 0) n += m.v ?? 0;
  return n;
}

export function tickMods(g: FightGame, f: Fighter, dt: number): void {
  for (const m of f.mods) {
    if (m.left <= 0) continue;
    const before = m.left;
    m.left = Math.max(0, m.left - dt);
    if (m.left > 0 && m.pulse && m.pulseEvery && Math.floor(m.left * m.pulseEvery) !== Math.floor((m.left + dt) * m.pulseEvery)) m.pulse(g, f);
    if (before > 0 && m.left === 0 && m.onExpire) m.onExpire(g, f);
  }
  let w = 0;
  for (const m of f.mods) if (m.left > 0) f.mods[w++] = m;
  f.mods.length = w;
  project(f);
}

function left(f: Fighter, kind: ModKind, tag?: string): number {
  let n = 0;
  for (const m of f.mods) {
    if (m.kind !== kind || m.left <= 0) continue;
    if (tag != null && (m.tag ?? '') !== tag) continue;
    if (m.left > n) n = m.left;
  }
  return n;
}

/** The old timer fields stay readable for the HUD and the checks. The mods are the clock. */
function project(f: Fighter): void {
  f.braced = left(f, 'brace');
  f.poise = left(f, 'poise');
  f.muscle = left(f, 'dmgDealt', 'muscle');
  f.shout = left(f, 'dmgDealt', 'shout');
  f.feast = left(f, 'lockNormals', 'feast');
  f.box = left(f, 'dmgTaken', 'box');
  f.sprint = left(f, 'speed');
  f.slow = left(f, 'slow');
  f.noGain = left(f, 'noGain');
  f.purge = left(f, 'lockGuard');
  f.rose = left(f, 'thorns', 'rose');
  f.debt = left(f, 'debt');
  f.debtDmg = f.mods.find(m => m.kind === 'debt' && m.left > 0)?.acc ?? 0;
}
