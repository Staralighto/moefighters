/* Host-authoritative wire state. The host flattens the match into entities of fields, sends
   field-level deltas against the newest state the guest acked, and splits them so every
   message fits one unfragmented data-channel packet. Fighter, projectile and effect fields
   are derived from the live objects, so a field a new character adds rides along by itself;
   only NO_WIRE lists what the guest must not get. */

import { AIR_SKILLS } from '../data/skills.ts';
import type { CharacterData, Skill } from '../data/types.ts';
import { ROSTER_BY_ID } from '../data/characters.ts';
import { makeFighter, type Fighter } from '../game/fighter.ts';
import type { Effect, FightGame, Phase, Projectile } from '../game/game.ts';

/** Fighter fields that stay on the host: input, CPU brain, the echo's tape, the shared data. */
export const NO_WIRE: ReadonlySet<string> = new Set(['data', 'controller', 'queue', 'ai', 'recTape']);

/** Game-level fields the guest paints from. */
export const GAME_FIELDS = [
  'phase', 'time', 'round', 'wins', 'shake', 'flash', 'timeStop', 'age', 'hitstop',
  'bannerTitle', 'bannerSub', 'netEnd', 'winnerTeam',
] as const;

/** Effects age on the guest; their clock is sent once, when they appear. */
const LOCAL_CLOCK = 'life';

/** One message stays under this many bytes: a single SCTP chunk on every path we care about. */
export const PART_BYTES = 1100;

/** Entity key ('g', 'f<id>', 'p<id>', 'e<id>') → field → JSON text. */
export type WireState = Map<string, Map<string, string>>;

const PHASES: readonly Phase[] = ['intro', 'fight', 'roundend', 'finished'];

function round(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

function isSkill(v: object): v is Skill {
  const s = v as Partial<Skill>;
  return typeof s.fx === 'string' && typeof s.cd === 'number' && typeof s.type === 'string' && typeof s.duration === 'number';
}

/** A skill travels as a reference into the roster; a frenzy clone keeps its changed numbers. */
function skillRef(s: Skill, owner: CharacterData | undefined): unknown {
  const air = AIR_SKILLS.indexOf(s);
  if (air >= 0) return { $a: air };
  const list = owner?.skills ?? [];
  let i = list.indexOf(s);
  if (i >= 0) return { $k: i, c: owner!.id };
  i = list.findIndex(x => x.fx === s.fx && x.name === s.name);
  if (i >= 0) return { $k: i, c: owner!.id, range: s.range, damage: s.damage };
  const a = AIR_SKILLS.findIndex(x => x.fx === s.fx && x.name === s.name);
  if (a >= 0) return { $a: a, range: s.range, damage: s.damage };
  return { $s: { ...s } };
}

/** `exact` keeps every bit of a number (lockstep resync); the snapshot wire rounds to 1/1000. */
export function enc(v: unknown, owner: CharacterData | undefined, depth = 0, exact = false): unknown {
  if (typeof v === 'number') return exact ? (Number.isFinite(v) ? v : 0) : round(v);
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v !== 'object' || depth > 8) return undefined;
  if (v instanceof Set) return { $set: [...v].map(x => enc(x, owner, depth + 1, exact)) };
  if (v instanceof Map) return { $map: [...v].map(([k, x]) => [enc(k, owner, depth + 1, exact), enc(x, owner, depth + 1, exact)]) };
  if (Array.isArray(v)) return v.map(x => enc(x, owner, depth + 1, exact) ?? null);
  if (isSkill(v)) return skillRef(v, owner);
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    const e = enc(x, owner, depth + 1, exact);
    if (e !== undefined) out[k] = e;
  }
  return out;
}

export function dec(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(dec);
  const o = v as Record<string, unknown>;
  if ('$set' in o) return new Set((o.$set as unknown[]).map(dec));
  if ('$map' in o) return new Map((o.$map as [unknown, unknown][]).map(([k, x]) => [dec(k), dec(x)]));
  if ('$a' in o || '$k' in o || '$s' in o) {
    let base: Skill | undefined;
    if ('$a' in o) base = AIR_SKILLS[o.$a as number];
    else if ('$k' in o) base = ROSTER_BY_ID.get(String(o.c))?.skills[o.$k as number];
    else base = o.$s as Skill;
    if (!base) return undefined;
    return typeof o.range === 'number' ? { ...base, range: o.range, damage: o.damage as number } : base;
  }
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(o)) out[k] = dec(x);
  return out;
}

function fieldsOf(obj: object, owner: CharacterData | undefined, skip?: ReadonlySet<string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    if (skip?.has(k) || typeof v === 'function') continue;
    const e = enc(v, owner);
    if (e === undefined) continue;
    m.set(k, JSON.stringify(e));
  }
  return m;
}

/** Stable ids for objects the sim keeps in plain arrays. */
export class IdBook {
  private ids = new WeakMap<object, number>();
  private next = 1;
  of(o: object): number {
    let id = this.ids.get(o);
    if (id === undefined) { id = this.next++; this.ids.set(o, id); }
    return id;
  }
}

export function captureState(g: FightGame, book: IdBook): WireState {
  const s: WireState = new Map();
  const game = new Map<string, string>();
  for (const k of GAME_FIELDS) game.set(k, JSON.stringify(enc((g as unknown as Record<string, unknown>)[k], undefined) ?? null));
  s.set('g', game);
  for (const f of g.fighters) {
    const m = fieldsOf(f, f.data, NO_WIRE);
    m.set('charId', JSON.stringify(f.data.id));
    s.set('f' + f.id, m);
  }
  for (const p of g.projectiles) s.set('p' + book.of(p), fieldsOf(p, g.fighterById(p.owner)?.data));
  for (const e of g.effects) s.set('e' + book.of(e), fieldsOf(e, undefined));
  return s;
}

/** [entity, field, json] triples; a json of undefined deletes the field. */
export type Change = [string, string, string | undefined];

export function diffState(base: WireState | null, cur: WireState): { changes: Change[]; gone: string[] } {
  const changes: Change[] = [];
  const gone: string[] = [];
  for (const [key, fields] of cur) {
    const old = base?.get(key);
    for (const [k, v] of fields) {
      if (old && k === LOCAL_CLOCK && key[0] === 'e') continue;
      if (old?.get(k) !== v) changes.push([key, k, v]);
    }
    if (old) for (const k of old.keys()) if (!fields.has(k)) changes.push([key, k, undefined]);
  }
  if (base) for (const key of base.keys()) if (!cur.has(key)) gone.push(key);
  return { changes, gone };
}

/** Copy-on-write: entities a patch does not touch keep the base's own field map. */
export function patchState(base: WireState | null, changes: Change[], gone: string[]): WireState {
  const s: WireState = new Map(base ?? []);
  for (const key of gone) s.delete(key);
  const touched = new Set<string>();
  for (const [key, k, v] of changes) {
    if (!touched.has(key)) {
      touched.add(key);
      s.set(key, new Map(s.get(key) ?? []));
    }
    const m = s.get(key)!;
    if (v === undefined) m.delete(k);
    else m.set(k, v);
  }
  return s;
}

export interface Part {
  n: number; b: number; i: number; k: number;
  d: Change[]; x: string[];
}

/** Split a delta into messages of at most PART_BYTES. `extra` is the per-message header budget. */
const utf8 = new TextEncoder();
function bytes(text: string): number {
  // ASCII is the common case; only measure for real when something wider is in there.
  return /^[\x00-\x7f]*$/.test(text) ? text.length : utf8.encode(text).length;
}

export function splitParts(n: number, b: number, changes: Change[], gone: string[], extra = 0): string[][] {
  const groups: Change[][] = [[]];
  let size = 0;
  const budget = PART_BYTES - 90 - extra - bytes(JSON.stringify(gone));
  for (const c of changes) {
    // A single field larger than a packet still goes, alone; SCTP fragments it and the next state retries.
    const len = bytes(c[0]) + bytes(c[1]) + (c[2] === undefined ? 0 : bytes(c[2])) + 10;
    if (size + len > budget && groups[groups.length - 1].length) { groups.push([]); size = 0; }
    groups[groups.length - 1].push(c);
    size += len;
  }
  // A deleted field is a pair; a field whose value is null is still a triple.
  return groups.map(d => d.map(c => '[' + JSON.stringify(c[0]) + ',' + JSON.stringify(c[1]) + (c[2] === undefined ? '' : ',' + c[2]) + ']'));
}

/** The text of one part. Values are already JSON, so they are spliced in, not re-encoded. */
export function partText(head: Record<string, unknown>, items: string[], gone: string[]): string {
  const h = JSON.stringify(head);
  return h.slice(0, -1) + ',"d":[' + items.join(',') + '],"x":' + JSON.stringify(gone) + '}';
}

export function readPart(msg: Record<string, unknown>): Part | null {
  const { n, b, i, k, d, x } = msg as Record<string, unknown>;
  if (![n, b, i, k].every(v => Number.isInteger(v)) || !Array.isArray(d) || !Array.isArray(x)) return null;
  if ((k as number) < 1 || (k as number) > 64 || (i as number) < 0 || (i as number) >= (k as number)) return null;
  const changes: Change[] = [];
  for (const c of d) {
    if (!Array.isArray(c) || typeof c[0] !== 'string' || typeof c[1] !== 'string') return null;
    changes.push([c[0], c[1], c.length < 3 ? undefined : JSON.stringify(c[2])]);
  }
  return { n: n as number, b: b as number, i: i as number, k: k as number, d: changes, x: x.filter((v): v is string => typeof v === 'string') };
}

function field(m: Map<string, string> | undefined, k: string): unknown {
  const v = m?.get(k);
  if (v === undefined) return undefined;
  try { return dec(JSON.parse(v)); } catch { return undefined; }
}

function paint(target: Record<string, unknown>, fields: Map<string, string>, prev: Map<string, string> | undefined, skip?: ReadonlySet<string>, force = false): void {
  for (const [k, v] of fields) {
    if (skip?.has(k) || (!force && prev?.get(k) === v)) continue;
    const val = field(fields, k);
    if (val !== undefined) target[k] = val;
  }
  if (prev) for (const k of prev.keys()) if (!fields.has(k) && !skip?.has(k)) delete target[k];
}

const GUEST_SKIP: ReadonlySet<string> = new Set(['charId']);

/** Paint a wire state onto a guest game. `prev` is the state painted last time (unchanged maps are skipped). */
export function applyState(g: FightGame, s: WireState, prev: WireState | null, objs: Map<string, object>): void {
  const game = s.get('g');
  if (game) {
    const rec = g as unknown as Record<string, unknown>;
    for (const k of GAME_FIELDS) {
      if (prev?.get('g')?.get(k) === game.get(k)) continue;
      const v = field(game, k);
      if (k === 'phase' && !PHASES.includes(v as Phase)) continue;
      rec[k] = v ?? (k === 'netEnd' || k === 'timeStop' ? null : rec[k]);
    }
  }
  const fighters: Fighter[] = [];
  const shots: Projectile[] = [];
  const effects: Effect[] = [];
  for (const [key, fields] of s) {
    const kind = key[0];
    if (kind === 'g') continue;
    let obj = objs.get(key);
    const before = prev?.get(key);
    if (!obj) {
      if (kind === 'f') {
        const data = ROSTER_BY_ID.get(String(field(fields, 'charId')));
        if (!data) continue;
        obj = makeFighter(data, Number(key.slice(1)), { x: 0, facing: 1, controller: null, energy: 0, team: 0 });
      } else obj = {};
      objs.set(key, obj);
      paint(obj as Record<string, unknown>, fields, undefined, GUEST_SKIP, true);
    } else if (before !== fields || key === 'f1') paint(obj as Record<string, unknown>, fields, before, GUEST_SKIP, key === 'f1');
    if (kind === 'f') fighters.push(obj as Fighter);
    else if (kind === 'p') shots.push(obj as Projectile);
    else if (kind === 'e') effects.push(obj as Effect);
  }
  for (const e of g.effects) if (e.local && e.life > 0 && !effects.includes(e)) effects.push(e);
  for (const key of [...objs.keys()]) if (!s.has(key)) objs.delete(key);
  fighters.sort((a, b) => a.id - b.id);
  g.fighters = fighters;
  g.projectiles = shots;
  g.effects = effects;
}
