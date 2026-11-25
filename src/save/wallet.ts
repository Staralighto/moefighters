/* 星之碎片。轻量激励货币：每局都有一点，任务给大头，基本随便玩玩就能买下大部分东西。
   不防篡改。shards 是余额，earned 是累计获得（只增不减，给以后的成就和导入合并用）。 */

import type { MatchReport } from '../game/report.ts';
import { registerSection } from './registry.ts';
import { askPersist, count, isRecord, onOtherTab, readJson, writeJson } from './storage.ts';

const KEY = 'mf.wallet';
export interface Wallet { shards: number; earned: number }

function parse(raw: unknown): Wallet {
  const r = isRecord(raw) ? raw : {};
  const shards = count(r.shards);
  return { shards, earned: Math.max(shards, count(r.earned)) };
}

let cache: Wallet = parse(readJson(KEY));
const listeners = new Set<(w: Wallet, delta: number) => void>();
onOtherTab(KEY, () => {
  const before = cache.shards;
  cache = parse(readJson(KEY));
  for (const fn of listeners) fn(cache, cache.shards - before);
});

export function wallet(): Wallet { return cache; }
export function shards(): number { return cache.shards; }

/** delta 为本次变化量，供计数器滚动；整页重载后的首次通知不会发生，读 wallet() 即可。 */
export function onWallet(fn: (w: Wallet, delta: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function commit(next: Wallet, delta: number): boolean {
  if (!writeJson(KEY, next)) return false;
  cache = next;
  askPersist();
  for (const fn of listeners) fn(next, delta);
  return true;
}

export function earn(n: number): boolean {
  if (!(n > 0)) return false;
  const k = Math.floor(n);
  return commit({ shards: cache.shards + k, earned: cache.earned + k }, k);
}

/** 余额不够、或这次没能写入时返回 false，不扣。 */
export function spend(n: number): boolean {
  const k = Math.max(0, Math.floor(n));
  if (cache.shards < k) return false;
  return commit({ ...cache, shards: cache.shards - k }, -k);
}

/** 一局的碎片：人机胜 5 / 10 / 20（轻松 / 标准 / 大师），败 2；本地双人和联机每局 5；观战不给。 */
export function shardsFor(report: MatchReport, training = false): number {
  if (training) return 0;
  const s = report.seal;
  if (typeof s === 'number') return report.win === true ? [5, 10, 20][s] ?? 5 : report.win === false ? 2 : 0;
  if (s === 'pvp' || s === 'online') return 5;
  return 0;
}

const paid = new WeakSet<object>();
/** 每场比赛只发一次：结算可能被重复调用（联机断线提示等），按 game 对象去重。 */
export function awardMatch(game: object, report: MatchReport | null, training = false): number {
  if (!report || paid.has(game)) return 0;
  paid.add(game);
  const n = shardsFor(report, training);
  earn(n);
  return n;
}

registerSection<Wallet>({
  id: 'wallet',
  version: 1,
  read: () => cache,
  parse: raw => isRecord(raw) ? parse(raw) : null,
  merge: (a, b) => ({ shards: Math.max(a.shards, b.shards), earned: Math.max(a.earned, b.earned) }),
  write: v => {
    if (!writeJson(KEY, v)) return false;
    cache = v;
    return true;
  },
  isEmpty: v => v.shards === 0 && v.earned === 0,
  summary: v => [{ label: '星之碎片', value: v.shards.toLocaleString('en-US') }],
  dump: v => v.shards || v.earned ? v : undefined,
});
