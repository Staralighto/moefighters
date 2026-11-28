import { PUBLIC_ROSTER } from '../data/characters.ts';
import { registerSection } from '../save/registry.ts';
import { isRecord, readJson, writeJson } from '../save/storage.ts';

export type MusouRank = 'S' | 'A' | 'B' | 'C';

export interface MusouCharRecord {
  rank: MusouRank;
  kills: number;
  bosses: number;
  streak: number;
  level: number;
  clear: boolean;
}

const KEY = 'mf.musou.records.v1';
const RANK_ORDER: Record<MusouRank, number> = { C: 0, B: 1, A: 2, S: 3 };
const CHAR_IDS = new Set(PUBLIC_ROSTER.map(c => c.id));
type Records = Record<string, MusouCharRecord>;

function validRecord(r: unknown): r is MusouCharRecord {
  return isRecord(r) && typeof r.rank === 'string' && Object.hasOwn(RANK_ORDER, r.rank)
    && [r.kills, r.bosses, r.streak, r.level].every(v => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0)
    && typeof r.clear === 'boolean';
}

function parseRecords(raw: unknown): Records | null {
  if (!isRecord(raw)) return null;
  const records: Records = Object.create(null);
  for (const [id, v] of Object.entries(raw)) if (/^[a-z0-9][a-z0-9-]{0,39}$/.test(id) && validRecord(v)) {
    const { rank, kills, bosses, streak, level, clear } = v;
    records[id] = { rank, kills, bosses, streak, level, clear };
  }
  return records;
}

export function readMusouRecords(): Records {
  return parseRecords(readJson(KEY)) ?? Object.create(null);
}

function best(prev: MusouCharRecord | undefined, run: MusouCharRecord): MusouCharRecord {
  if (!prev) return run;
  return {
    rank: RANK_ORDER[run.rank] >= RANK_ORDER[prev.rank] ? run.rank : prev.rank,
    kills: Math.max(prev.kills, run.kills),
    bosses: Math.max(prev.bosses, run.bosses),
    streak: Math.max(prev.streak, run.streak),
    level: Math.max(prev.level, run.level),
    clear: prev.clear || run.clear,
  };
}

function merge(local: Records, incoming: Records): Records {
  const out: Records = Object.assign(Object.create(null), local);
  for (const [id, v] of Object.entries(incoming)) out[id] = best(out[id], v);
  return out;
}

/** 合并并保存本角色的音浪无双最佳成绩；若破了任一核心纪录（评级/Boss/击破/连破）返回 true。 */
export function recordMusouRun(charId: string, run: MusouCharRecord): boolean {
  if (!CHAR_IDS.has(charId) || !validRecord(run)) return false;
  const all = readMusouRecords();
  const prev = all[charId];
  const isNewPb = !prev
    || RANK_ORDER[run.rank] > RANK_ORDER[prev.rank]
    || run.bosses > prev.bosses
    || run.kills > prev.kills
    || run.streak > prev.streak;
  all[charId] = best(prev, run);
  writeJson(KEY, all);
  return isNewPb;
}

registerSection<Records>({
  id: 'musou',
  version: 1,
  read: readMusouRecords,
  parse: parseRecords,
  merge,
  write: v => writeJson(KEY, merge(readMusouRecords(), v)),
  isEmpty: v => !Object.keys(v).length,
  summary: v => {
    const played = Object.keys(v).filter(id => CHAR_IDS.has(id));
    return played.length ? [{ label: '音浪无双', value: `${played.length} 人出演 · ${played.filter(id => v[id].clear).length} 人完成` }] : [];
  },
  dump: v => Object.keys(v).length ? v : undefined,
});
