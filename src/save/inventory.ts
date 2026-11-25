/* 已拥有的物品与当前装备。物品 id 形如 `frame:roselia`（类别:名字），类别决定装在哪个槽。
   商店、任务奖励、首场赠礼都往这里放；仓库从这里读。 */

import { registerSection } from './registry.ts';
import { isRecord, onOtherTab, readJson, writeJson } from './storage.ts';

const KEY = 'mf.inventory';
/** flags：一次性的事件记号（比如首场赠礼已领）。 */
export interface Inventory { owned: string[]; equipped: Record<string, string>; flags: string[] }
const ID = /^[a-z]+:[\w-]{1,48}$/;
const SLOT = /^[a-z]+(:[\w-]{1,48})?$/;
const FLAG = /^[\w-]{1,40}$/;

function parse(raw: unknown): Inventory {
  const r = isRecord(raw) ? raw : {};
  const owned = Array.isArray(r.owned) ? [...new Set(r.owned.filter((x): x is string => typeof x === 'string' && ID.test(x)))] : [];
  const equipped: Record<string, string> = {};
  if (isRecord(r.equipped)) for (const [slot, id] of Object.entries(r.equipped)) if (SLOT.test(slot) && typeof id === 'string' && ID.test(id)) equipped[slot] = id;
  const flags = Array.isArray(r.flags) ? [...new Set(r.flags.filter((x): x is string => typeof x === 'string' && FLAG.test(x)))] : [];
  return { owned, equipped, flags };
}

let inv = parse(readJson(KEY));
const listeners = new Set<() => void>();
export function onInventory(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
onOtherTab(KEY, () => { inv = parse(readJson(KEY)); for (const fn of listeners) fn(); });
/** 写失败时内存保持原样，调用方可以重试。 */
function commit(next: Inventory): boolean {
  if (!writeJson(KEY, next)) return false;
  inv = next;
  for (const fn of listeners) fn();
  return true;
}

export function owns(id: string): boolean { return inv.owned.includes(id); }
export function ownedIds(): readonly string[] { return inv.owned; }
/** 加进仓库；已有返回 false。 */
export function grant(id: string): boolean {
  if (!ID.test(id) || owns(id)) return false;
  return commit({ ...inv, owned: [...inv.owned, id] });
}
export function hasFlag(f: string): boolean { return inv.flags.includes(f); }
export function setFlag(f: string): boolean {
  if (!FLAG.test(f) || hasFlag(f)) return false;
  return commit({ ...inv, flags: [...inv.flags, f] });
}
export function equipped(slot: string): string | undefined { return inv.equipped[slot]; }
/** id 为 undefined 时卸下，回到默认款。是否拥有由调用方（shop/state.ts）判断，默认款不在 owned 里。 */
export function equip(slot: string, id: string | undefined): void {
  const next = { ...inv.equipped };
  if (id && ID.test(id)) next[slot] = id; else delete next[slot];
  commit({ ...inv, equipped: next });
}

registerSection<Inventory>({
  id: 'inventory',
  version: 1,
  read: () => inv,
  parse: raw => isRecord(raw) ? parse(raw) : null,
  merge: (a, b) => ({ owned: [...new Set([...a.owned, ...b.owned])], equipped: { ...b.equipped }, flags: [...new Set([...a.flags, ...b.flags])] }),
  write: commit,
  isEmpty: v => !v.owned.length && !v.flags.length,
  summary: v => v.owned.length ? [{ label: '仓库物品', value: `${v.owned.length} 件` }] : [],
  dump: v => v.owned.length || Object.keys(v.equipped).length || v.flags.length ? v : undefined,
});
