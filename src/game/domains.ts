import type { DomainBuff, Skill } from '../data/types.ts';
import type { Fighter } from './fighter.ts';
import type { FightGame } from './game.ts';
import { addMod, clearTag } from './mods.ts';

/* 领域: the newest live field is the only one that applies. A covered field is not ended —
   its clock keeps running, and it comes back with whatever time it has left when the covering
   field ends. The covering field pays for the suppression by burning its own clock at 2×, so
   covering is a trade rather than free denial. */

/** How fast the covering domain's clock burns while it suppresses another live domain. */
export const DOMAIN_SUPPRESS_DRAIN = 2;
/** Every domain buff carries this tag, so the whole projection can be cleared in one pass. */
const TAG = 'domain';

export interface Domain {
  owner: number;
  team: number;
  background: string;
  remaining: number;
  buffs: DomainBuff[];
  target: 'self' | 'team' | 'enemies';
}

/** Opens the field declared on `s`. A later call covers the current one without ending it. */
export function beginDomain(g: FightGame, f: Fighter, s: Skill): void {
  const spec = s.domain;
  if (!spec || g.netRole === 'guest') return;
  g.domains.push({
    owner: f.id,
    team: f.team,
    background: spec.background,
    remaining: spec.time,
    buffs: spec.buffs.map(b => ({ ...b })),
    target: spec.target ?? 'self',
  });
  syncDomain(g);
}

/** Ticks every clock. The top field burns at double rate while a covered field is still alive. */
export function stepDomains(g: FightGame, dt: number): void {
  if (!g.domains.length) return;
  const covered = g.domains.length > 1;
  const top = g.domains[g.domains.length - 1];
  let w = 0;
  for (const d of g.domains) {
    d.remaining = Math.max(0, d.remaining - dt * (d === top && covered ? DOMAIN_SUPPRESS_DRAIN : 1));
    if (d.remaining > 0) g.domains[w++] = d;
  }
  if (w === g.domains.length) return;
  g.domains.length = w;
  syncDomain(g);
}

/** The field that applies: the last live one. */
function topDomain(g: FightGame): Domain | undefined {
  return g.domains[g.domains.length - 1];
}

/** Clears every domain buff and re-projects the top field's buffs at its remaining time. */
function syncDomain(g: FightGame): void {
  for (const f of g.fighters) clearTag(f, TAG);
  const d = topDomain(g);
  // The guest only paints this string; it never steps the field list.
  g.domainBg = d?.background ?? '';
  if (!d) return;
  const owner = g.fighterById(d.owner);
  if (!owner) return;
  const targets = d.target === 'self' ? [owner]
    : d.target === 'team' ? g.fighters.filter(f => f.team === d.team)
    : g.fighters.filter(f => f.team !== d.team);
  for (const f of targets) {
    if (f.hp <= 0) continue;
    for (const b of d.buffs) addMod(f, b.kind, d.remaining, { v: b.v, atk: b.atk, mark: b.mark, tag: TAG });
  }
}
