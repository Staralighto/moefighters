/* 异常: the four reusable statuses — 烧焦 burn, 冻僵 chill, 冻住 freeze, 混乱 confuse.
   Mechanics are keyed by kind and live here; the look is keyed by mark and lives in
   src/render/statusMarks.ts. A move picks the kind and may name a mark; a second character who wants
   the same status in a different look writes the same kind with its own mark and registers one drawer.
   The kernel never reads a mark except to hand it to the render layer, and never reads a character id.
   One-shot graphics travel as effects named `<mark>@apply` and `<mark>@expire`. */

import type { Skill, StatusApply, StatusKind } from '../data/types.ts';
import type { Fighter } from './fighter.ts';
import type { FightGame } from './game.ts';
import { addMod, has } from './mods.ts';
import { hit } from './combat.ts';

/** The look a status wears when the move names none. Neutral on purpose: anyone may lay these. */
export const DEFAULT_MARK: Readonly<Record<StatusKind, string>> = {
  burn: 'burn', chill: 'frost', freeze: 'ice-block', confuse: 'dizzy-q',
};

/** The word that pops once when a status is fresh. Same names as the glossary (index.html 术语). */
export const STATUS_WORD: Readonly<Record<StatusKind, { text: string; color: string }>> = {
  burn: { text: '烧焦', color: '#ffa04a' },
  chill: { text: '冻僵', color: '#bfe6ff' },
  freeze: { text: '冻住!', color: '#e8f8ff' },
  confuse: { text: '混乱', color: '#cbb8ff' },
};

export const BURN_TICK = .5;
const BURN_DMG = 6;
const CHILL = { move: .6, jump: .75, atk: .75 };

/** Whether the body carries this kind right now. chill is any live 减速 and freeze any 禁足-tier 定身,
 *  whoever laid them: the kinds name the clocks, not the character. */
export function hasStatus(f: Fighter, kind: StatusKind): boolean {
  switch (kind) {
    case 'burn': return has(f, 'burn');
    case 'chill': return f.slow > 0;
    case 'freeze': return f.root > 0 && f.rootLevel === 'freeze';
    case 'confuse': return has(f, 'confuse');
  }
}

const KINDS: readonly StatusKind[] = ['burn', 'chill', 'freeze', 'confuse'];

/** The kinds this body carries as bits, in KINDS order (burn 1, chill 2, freeze 4, confuse 8). */
export function statusMask(f: Fighter): number {
  let m = 0;
  KINDS.forEach((k, i) => { if (hasStatus(f, k)) m |= 1 << i; });
  return m;
}

/** 异常引爆: how many different kinds the body carries. */
export function statusCount(f: Fighter): number {
  let n = 0;
  for (const k of KINDS) if (hasStatus(f, k)) n++;
  return n;
}

/** Lay one status. The caller has already passed the clean-hit gate. Returns true when it was a freeze. */
export function layStatus(g: FightGame, attacker: Fighter, defender: Fighter, st: StatusApply, source = '', word = 0): boolean {
  const mark = st.mark ?? DEFAULT_MARK[st.kind];
  const fresh = !hasStatus(defender, st.kind);
  switch (st.kind) {
    case 'burn': {
      const live = defender.mods.find(m => m.kind === 'burn' && m.left > 0);
      const every = st.tick ?? BURN_TICK;
      // A refresh keeps the tick clock running, so re-lighting never delays or doubles a tick.
      addMod(defender, 'burn', st.time, { v: st.dmg ?? BURN_DMG, every, acc: live?.acc ?? every, from: attacker.id, mark, max: true });
      break;
    }
    case 'chill':
      addMod(defender, 'slow', st.time, { v: st.move ?? CHILL.move, jump: st.jump ?? CHILL.jump, atk: st.atk ?? CHILL.atk, mark, max: true });
      break;
    case 'freeze':
      defender.root = Math.max(defender.root, st.time);
      defender.rootLevel = 'freeze';
      defender.rootBreak = 0;
      defender.rootHits = 0;
      defender.rootFx = source;
      defender.rootMark = mark;
      defender.dodge = 0;
      defender.vx = 0;
      defender.vy = 0;
      defender.knocked = 0;
      break;
    case 'confuse':
      addMod(defender, 'confuse', st.time, { mark, max: true });
      break;
  }
  if (fresh) {
    g.effect(mark + '@apply', defender.x, defender.y, attacker.data.color, .6, { follow: defender.id, ox: 0, oy: 0 });
    const w = STATUS_WORD[st.kind];
    g.text(w.text, defender.x, defender.y - 195 - word * 22, w.color, .6, 18);
  }
  return st.kind === 'freeze';
}

/** A clean hit's status list. Upgrades (ifHas) read the body as it was before this list; when one lands,
 *  the plain entries are skipped. Returns true when the body was frozen, so the hit skips its pose. */
export function applyStatus(g: FightGame, attacker: Fighter, defender: Fighter, skill: Skill, list = skill.status): boolean {
  if (!list?.length) return false;
  const upgrades = list.filter(st => st.ifHas && hasStatus(defender, st.ifHas));
  const chosen = upgrades.length ? upgrades : list.filter(st => !st.ifHas);
  let froze = false, word = 0;
  for (const st of chosen) {
    const fresh = !hasStatus(defender, st.kind);
    if (layStatus(g, attacker, defender, st, skill.fx, word)) froze = true;
    if (fresh) word++;
  }
  return froze;
}

/** 异常延长: every status the body carries runs `more` × its remaining time longer (1 doubles it). Each one
 *  that grew replays its landing graphic, so the stretch reads as the statuses flaring up again. True when
 *  anything was extended. */
export function extendStatus(g: FightGame, attacker: Fighter, f: Fighter, more: number): boolean {
  if (!(more > 0)) return false;
  let any = false;
  for (const m of f.mods) {
    if (m.left <= 0 || (m.kind !== 'burn' && m.kind !== 'slow' && m.kind !== 'confuse')) continue;
    m.left += m.left * more;
    any = true;
    if (m.mark) g.effect(m.mark + '@apply', f.x, f.y, attacker.data.color, .6, { follow: f.id, ox: 0, oy: 0 });
  }
  if (f.root > 0 && f.rootLevel === 'freeze') {
    f.root += f.root * more;
    any = true;
    if (f.rootMark) g.effect(f.rootMark + '@apply', f.x, f.y, attacker.data.color, .6, { follow: f.id, ox: 0, oy: 0 });
  }
  if (any) {
    // project() keeps f.slow in step with the mods; touching left directly needs the same refresh.
    f.slow = Math.max(0, ...f.mods.filter(m => m.kind === 'slow' && m.left > 0).map(m => m.left));
    g.text('异常延长', f.x, f.y - 222, '#cbb8ff', .7, 17);
  }
  return any;
}

/** A blocked hit's statuses: only the entries that declare onBlock, for time × onBlock; upgrades never. The
 *  caller has already ruled out a perfect block. */
export function applyStatusBlocked(g: FightGame, attacker: Fighter, defender: Fighter, skill: Skill): void {
  const list = skill.status;
  if (!list?.length) return;
  let word = 0;
  for (const st of list) {
    if (st.ifHas || !(st.onBlock && st.onBlock > 0)) continue;
    const fresh = !hasStatus(defender, st.kind);
    layStatus(g, attacker, defender, { ...st, time: st.time * st.onBlock }, skill.fx, word);
    if (fresh) word++;
  }
}

/** 烧焦's tick, cut once per damage value. Through hit() like every other damage: no flinch, no combo,
 *  no hitstop, no meter, and a guard does not catch it. */
const burnSkills = new Map<number, Skill>();
function burnSkill(dmg: number): Skill {
  let s = burnSkills.get(dmg);
  if (!s) {
    s = {
      key: '', name: '烧焦', type: 'light', super: false, damage: dmg, range: 0, start: 0, duration: 0, cd: 0,
      fx: 'burn-tick', brief: '', detail: '', react: { kind: 'none', stun: 0 },
      noBlock: true, noSparks: true, gain: 0, knock: 0, shake: 0, hitstop: 0, dot: true,
    };
    burnSkills.set(dmg, s);
  }
  return s;
}

/** Per fixed step, before the mods tick down: 烧焦 lands its ticks; a lifted 冻住 plays its expire. */
export function tickStatus(g: FightGame, f: Fighter, dt: number): void {
  if (g.netRole === 'guest') return;
  for (const m of f.mods) {
    if (m.kind !== 'burn' || m.left <= 0) continue;
    const every = m.every ?? BURN_TICK;
    m.acc = (m.acc ?? every) - dt;
    while (m.acc <= 1e-6) {
      m.acc += every;
      const from = m.from != null ? g.fighterById(m.from) : undefined;
      if (from && f.hp > 0) hit(g, from, f, burnSkill(m.v ?? BURN_DMG), { hit: new Set() }, f.x);
    }
  }
}

/** The step a status-laid 定身 lifts, whatever lifted it: the expire graphic once, then forget the mark. */
export function settleRootMark(g: FightGame, f: Fighter): void {
  if (!f.rootMark || f.root > 0) return;
  g.effect(f.rootMark + '@expire', f.x, f.y, '#ffffff', .7, { follow: f.id, ox: 0, oy: 0 });
  f.rootMark = '';
}
