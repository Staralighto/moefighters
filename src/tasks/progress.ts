/* 任务进度：每条任务的计数、去重集合、已领取列表、人机连胜。比赛结束时 recordMatch 推进，
   任务页读 progressOf / claimable，领取时 claim 发碎片和物品。存档段 tasks：计数取大、集合与已领取取并集。 */

import { PLAYABLE_BY_ID } from '../data/characters.ts';
import { registerSection } from '../save/registry.ts';
import { grant, owns } from '../save/inventory.ts';
import { count, isRecord, onOtherTab, readJson, writeJson } from '../save/storage.ts';
import { earn } from '../save/wallet.ts';
import { readStamps } from '../ui/stamps.ts';
import { ALBUMS, TASK_BY_ID, TASKS, tasksOf, type TaskCtx, type TaskDef } from './defs.ts';
import type { MatchFacts } from './facts.ts';

const KEY = 'mf.tasks';
interface State { p: Record<string, number>; s: Record<string, string[]>; c: string[]; streak: number }

const ID = /^[\w:-]{1,80}$/;
function parse(raw: unknown): State {
  const r = isRecord(raw) ? raw : {};
  const p: Record<string, number> = {};
  if (isRecord(r.p)) for (const [k, v] of Object.entries(r.p)) if (ID.test(k)) { const n = count(v, 0, 1e6); if (n) p[k] = n; }
  const s: Record<string, string[]> = {};
  if (isRecord(r.s)) for (const [k, v] of Object.entries(r.s)) if (ID.test(k) && Array.isArray(v)) s[k] = [...new Set(v.filter((x): x is string => typeof x === 'string' && ID.test(x)))].slice(0, 200);
  const c = Array.isArray(r.c) ? [...new Set(r.c.filter((x): x is string => typeof x === 'string' && ID.test(x)))] : [];
  return { p, s, c, streak: count(r.streak, 0, 1e6) };
}

let st = parse(readJson(KEY));
const listeners = new Set<() => void>();
export function onTasks(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
onOtherTab(KEY, () => { st = parse(readJson(KEY)); for (const fn of listeners) fn(); });
function commit(): boolean {
  if (!writeJson(KEY, st)) return false;
  for (const fn of listeners) fn();
  return true;
}

export const albumBonusId = (album: string) => `album:${album}`;

export function progressOf(t: TaskDef): number {
  return Math.min(t.goal, t.distinct ? (st.s[t.id]?.length ?? 0) : (st.p[t.id] ?? 0));
}
export const isDone = (t: TaskDef) => progressOf(t) >= t.goal;
export const isClaimed = (id: string) => st.c.includes(id);

export function albumDone(album: string): boolean { return tasksOf(album).every(isDone); }
export function albumCleared(album: string): boolean { return isClaimed(albumBonusId(album)); }

export interface Claimable { id: string; album: string; reward: number; item?: string }

/** 当前所有可领取的（任务 + 专辑全清奖励）。album 给定时只看那一张。 */
export function claimable(album?: string): Claimable[] {
  const out: Claimable[] = [];
  for (const a of ALBUMS) {
    if (album && a.id !== album) continue;
    for (const t of tasksOf(a.id)) if (isDone(t) && !isClaimed(t.id)) out.push({ id: t.id, album: a.id, reward: t.reward });
    const bid = albumBonusId(a.id);
    if (albumDone(a.id) && !isClaimed(bid)) out.push({ id: bid, album: a.id, reward: a.bonus, item: a.frame });
  }
  return out;
}

/** 领取一批，返回实际发放的碎片和物品。 */
export function claim(ids: readonly string[]): { shards: number; items: string[]; count: number } {
  const ready = new Map(claimable().map(c => [c.id, c]));
  const prev = st.c.slice();
  let shards = 0, n = 0;
  const items: string[] = [];
  for (const id of ids) {
    const c = ready.get(id);
    if (!c || st.c.includes(id)) continue;
    if (c.item && !owns(c.item)) {
      if (!grant(c.item)) continue;
      items.push(c.item);
    }
    st.c.push(id);
    shards += c.reward;
    n++;
  }
  const none = { shards: 0, items: [] as string[], count: 0 };
  if (!n) return none;
  if (!commit()) { st.c = prev; return none; }
  if (shards > 0 && !earn(shards)) { st.c = prev; commit(); return none; }
  return { shards, items, count: n };
}

function ctx(): TaskCtx {
  const book = readStamps();
  const ids = Object.keys(book).filter(id => PLAYABLE_BY_ID.has(id));
  return { streak: st.streak, stamps: ids.length, masterStamps: ids.filter(id => book[id].d === 2).length };
}

/** 0 没变，1 有进度，2 这次完成。 */
function advance(t: TaskDef, f: MatchFacts | null, c: TaskCtx): 0 | 1 | 2 {
  if (isClaimed(t.id) || isDone(t)) return 0;
  if (t.distinct) {
    if (!f) return 0;
    const got = t.distinct(f).filter(id => ID.test(id));
    if (!got.length) return 0;
    const set = new Set(st.s[t.id] ?? []);
    const before = set.size;
    for (const id of got) set.add(id);
    if (set.size === before) return 0;
    st.s[t.id] = [...set];
  } else {
    if (!t.test || (!f && !t.passive)) return 0;
    const v = t.test(f as MatchFacts, c);
    if (!(v > 0)) return 0;
    const prev = st.p[t.id] ?? 0;
    const next = t.abs ? Math.max(prev, Math.floor(v)) : prev + Math.floor(v);
    if (next === prev) return 0;
    st.p[t.id] = next;
  }
  return isDone(t) ? 2 : 1;
}

/** 一场比赛结束：推进所有任务，返回这场新完成的任务。 */
export function recordMatch(f: MatchFacts): TaskDef[] {
  if (f.diff != null && (f.kind === 'cpu' || f.kind === 'team' || f.kind === 'challenge') && f.win !== null) {
    st.streak = f.win ? st.streak + 1 : 0;
  }
  const c = ctx();
  const done: TaskDef[] = [];
  for (const t of TASKS) if (advance(t, f, c) === 2) done.push(t);
  commit();
  return done;
}

/** 只看累计数据的任务（印章数）：打开任务页时重算一次。 */
export function refreshPassive(): void {
  const c = ctx();
  let changed = false;
  for (const t of TASKS) if (t.passive && advance(t, null, c)) changed = true;
  if (changed) commit();
}

export function totals(): { done: number; all: number; ready: number } {
  return { done: TASKS.filter(isDone).length, all: TASKS.length, ready: claimable().length };
}

registerSection<State>({
  id: 'tasks',
  version: 1,
  read: () => st,
  parse: raw => isRecord(raw) ? parse(raw) : null,
  merge: (a, b) => {
    const p = { ...a.p };
    for (const [k, v] of Object.entries(b.p)) p[k] = Math.max(p[k] ?? 0, v);
    const s = { ...a.s };
    for (const [k, v] of Object.entries(b.s)) s[k] = [...new Set([...(s[k] ?? []), ...v])];
    return { p, s, c: [...new Set([...a.c, ...b.c])], streak: Math.max(a.streak, b.streak) };
  },
  write: v => { writeJson(KEY, v); },
  isEmpty: v => !Object.keys(v.p).length && !Object.keys(v.s).length && !v.c.length,
  summary: v => {
    const done = TASKS.filter(t => (t.distinct ? (v.s[t.id]?.length ?? 0) : (v.p[t.id] ?? 0)) >= t.goal || v.c.includes(t.id)).length;
    return [{ label: '任务', value: `${done} / ${TASKS.length}` }];
  },
  dump: v => Object.keys(v.p).length || Object.keys(v.s).length || v.c.length ? v : undefined,
});

export { TASK_BY_ID };
