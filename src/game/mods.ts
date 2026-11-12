import type { Fighter } from './fighter.ts';
import type { FightGame } from './game.ts';

/** Scalar buffs. root, ban, frenzy and king stay on the fighter: they stop clocks and swap moves. */
export type ModKind =
  | 'brace' | 'poise' | 'dmgDealt' | 'dmgTaken' | 'speed' | 'slow' | 'regen'
  | 'noGain' | 'lockNormals' | 'lockGuard' | 'thorns' | 'debt' | 'nocd' | 'veil'
  | 'relapse' | 'incoming' | 'reflect' | 'soulorb' | 'lifesteal' | 'undying'
  /** 一肩扛下: v is the charges left; each eats one whole hit (combat.ts hit()). */
  | 'burden'
  /** 一肩扛下, carried through: acc is the aftershocks the next clean hit adds. */
  | 'quake'
  /** 异常·烧焦: v is the damage per tick, every the seconds between ticks, acc the countdown to the next,
   *  from the fighter who lit it. combat.ts tickStatus lands each tick through hit(). */
  | 'burn'
  /** 异常·混乱: left and right swap on the stick (game.ts reads moveSign). */
  | 'confuse'
  /** 异常·沉默: U I O L will not come out; J, K and breakouts still do (game.ts canAttack). */
  | 'silence'
  /** 不同意我就不回去: the window after a knockdown that strengthens LOCK's next unseal. */
  | 'comeback'
  /** 异常·跟班: no controls; the body walks behind `from` (game.ts stepFollow). v is the 部下 number. */
  | 'follow'
  /** 跟班 just ended: the body cannot be made a follower again while this holds. */
  | 'followCd'
  /** 部下 badge: left by 跟班, read by the layer's super (千樱梨联盟集合). No effect of its own. */
  | 'recruit'
  /** 独占欢呼 (千樱梨登场): every bit of energy this body would gain goes to `thief` instead. acc collects
   *  what was taken since the last pulse, for the graphic. */
  | 'cheer'
  /** 银猫扑脸: the cat clinging to this face. from is who sent it, acc its seconds left, v the scratches so far (game/lisa.ts). */
  | 'cling'
  /** 不用说我也懂: on her, acc its seconds left. The first U / I / O a foe starts while it holds is cut off (game/lisa.ts). */
  | 'read'
  /** 特制曲奇·隐藏风味: the mustard eaten. from is who baked it; it goes off when acc runs out (game/lisa.ts). */
  | 'mustard'
  /** 一呼零应: v is how many times nobody answered her this round; 一呼百应 spends them (game/himari.ts). */
  | 'grievance'
  /** 铁壁微笑: on her, v the veins so far (game/chisato.ts). */
  | 'smile'
  /** 有必要说教一下呢: on whoever is being lectured; left counts down to the 花丸 (render/clips.ts lectureSquash). */
  | 'lecture'
  /** 还想再看看你: on 丰川瑞穗, v 0 while the wish is still unspent, 1 after (game/mizuho.ts). */
  | 'wish'
  /** 崩坏: on 后藤一里, v is the game age her next collapse is ready (game/bocchi.ts). */
  | 'crumble';

/**
 * One running buff.
 * ponytail: onExpire and pulse are closures. The guest copies kind/left/mark only;
 * closures are not replayed. A replay would store the bill on the mod (the debt acc already is) and drop the functions.
 */
export interface Mod {
  kind: ModKind;
  left: number;
  v?: number;
  /** 花道·缠: jump launch-velocity multiplier carried by a 'slow' mod. */
  jump?: number;
  /** 半速: attack-speed multiplier. J/K cooldown clocks tick at this rate. Unset is 1. */
  atk?: number;
  /** 半速: which status graphic this slow wears. Unset is the petal aura. */
  mark?: string;
  tag?: string;
  acc?: number;
  onExpire?: (g: FightGame, f: Fighter) => void;
  pulseEvery?: number;
  pulse?: (g: FightGame, f: Fighter) => void;
  /** Runs once per hit that costs hp, including guard chip. */
  hurt?: (g: FightGame, f: Fighter, attacker: Fighter, blocked: boolean) => void;
  /** 珍稀动物认证: an 'incoming' mod with an owner only multiplies hits from that fighter id. */
  from?: number;
  /** 烧焦: seconds between two ticks. */
  every?: number;
}

/** 独占欢呼: who a 'cheer' mod's energy goes to. Kept off the mod itself so the wire never walks into a
 *  whole Fighter; host-side only (the guest never gains energy itself). */
export const cheerThief = new WeakMap<Mod, Fighter>();

export function addMod(f: Fighter, kind: ModKind, time: number, opt: Partial<Mod> & { max?: boolean; thief?: Fighter } = {}): Mod {
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
  if (opt.atk != null) m.atk = opt.atk;
  m.mark = opt.mark;
  if (opt.acc != null) m.acc = opt.acc;
  if (opt.onExpire) m.onExpire = opt.onExpire;
  if (opt.pulse) m.pulse = opt.pulse;
  if (opt.pulseEvery) m.pulseEvery = opt.pulseEvery;
  if (opt.hurt) m.hurt = opt.hurt;
  if (opt.from != null) m.from = opt.from;
  if (opt.every != null) m.every = opt.every;
  if (opt.thief) cheerThief.set(m, opt.thief);
  project(f);
  return m;
}

export function clearMod(f: Fighter, kind: ModKind, tag = ''): void {
  const m = f.mods.find(x => x.kind === kind && (x.tag ?? '') === tag);
  if (m) m.left = 0;
  project(f);
}

/** Drop every mod carrying `tag`, whatever its kind, and refresh the projected fields. */
export function clearTag(f: Fighter, tag: string): void {
  let w = 0;
  for (const m of f.mods) if ((m.tag ?? '') !== tag) f.mods[w++] = m;
  f.mods.length = w;
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
export function dmgTakenMul(f: Fighter, opt: { grab: boolean; superHit: boolean; superBrace: boolean; brace?: number; fallback: number }): number {
  let m = 1;
  if ((opt.brace != null && !opt.grab && !opt.superHit) || opt.superBrace) m *= opt.brace ?? opt.fallback;
  if (!opt.grab && !opt.superHit) {
    for (const mod of f.mods) if (mod.kind === 'dmgTaken' && mod.left > 0) m *= mod.v ?? 1;
  }
  return m;
}

/** Incoming-damage multiplier that ignores the grab/super gate. Each live mod multiplies.
 *  A mod with an owner (`from`) only counts for hits from that fighter (珍稀动物认证). */
export function incomingMul(f: Fighter, from?: number): number {
  let m = 1;
  for (const mod of f.mods) {
    if (mod.kind !== 'incoming' || mod.left <= 0) continue;
    if (mod.from != null && mod.from !== from) continue;
    m *= mod.v ?? 1;
  }
  return m;
}

/** Fraction of the damage just taken that is paid back to the attacker. Sums, so 50% is .5. */
export function reflectAmount(f: Fighter): number {
  let n = 0;
  for (const mod of f.mods) if (mod.kind === 'reflect' && mod.left > 0) n += mod.v ?? 0;
  return n;
}

/** 混乱: -1 while left and right are swapped. A 禁足 holds the body still, so the swap waits it out. */
export function moveSign(f: Fighter): 1 | -1 {
  if (f.root > 0 && f.rootLevel === 'freeze') return 1;
  return has(f, 'confuse') ? -1 : 1;
}

/** Walk multiplier. 1 when nothing changes the pace. Sprint speeds up, 减速 slows down. */
export function speedMul(f: Fighter): number {
  // 一人二役: the form that is up sets the base pace.
  const p = f.data.forms;
  let m = p ? (f.form ? p.alt.speed : p.base.speed) ?? 1 : 1;
  for (const mod of f.mods) if ((mod.kind === 'speed' || mod.kind === 'slow') && mod.left > 0) m *= mod.v ?? 1;
  return m;
}

/** Jump launch-velocity multiplier. 1 when no 减速 is up; the height scales with the square. */
export function jumpMul(f: Fighter): number {
  // 一人二役: a heavy form jumps lower.
  const p = f.data.forms;
  let m = p ? (f.form ? p.alt.jump : p.base.jump) ?? 1 : 1;
  for (const mod of f.mods) if (mod.kind === 'slow' && mod.left > 0) m *= mod.jump ?? 1;
  return m;
}

/** Attack-speed multiplier. 1 when no pace mod cuts or lifts it. J/K cooldown clocks tick at this rate.
 *  起死开战: a 'speed' mod may carry atk above 1, so the sprint and the faster swings ride one clock. */
export function atkMul(f: Fighter): number {
  // 一人二役: the form that is up sets the base swing pace.
  const p = f.data.forms;
  let m = p ? (f.form ? p.alt.atk : p.base.atk) ?? 1 : 1;
  for (const mod of f.mods) if ((mod.kind === 'slow' || mod.kind === 'speed') && mod.left > 0) m *= mod.atk ?? 1;
  return m;
}

/** Fraction of damage just dealt that flows back as hp. Sum of live lifesteal mods on top of the
 *  challenge-deck field. 起死开战. */
export function lifestealOf(f: Fighter): number {
  let n = 0;
  for (const m of f.mods) if (m.kind === 'lifesteal' && m.left > 0) n += m.v ?? 0;
  return n;
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
