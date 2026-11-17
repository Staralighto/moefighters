/* 已有模块的存档段。新模块直接在自己的文件里 registerSection，不用往这里加。
   这里集中放的是存档系统出现之前就有的数据：印章、无尽模式最高纪录、键位布局。 */

import { PLAYABLE_BY_ID } from '../data/characters.ts';
import { readBest, writeBest, type ChallengeKind } from '../ui/challenge.ts';
import { rankBetter } from '../ui/stamps.ts';
import { registerSection } from './registry.ts';
import { count, isRecord, readJson, writeJson } from './storage.ts';
import './wallet.ts';

/* ---- 印章：角色 id → 击败它的最高难度和评级。不认识的 id（新版本的角色）照样保留。 ---- */
type Book = Record<string, { d: number; rank?: string }>;
const STAMP_KEY = 'mf.stamps.v2';

function parseBook(raw: unknown): Book {
  const out: Book = {};
  if (!isRecord(raw)) return out;
  for (const [id, v] of Object.entries(raw)) {
    if (!/^[\w-]{1,40}$/.test(id) || !isRecord(v)) continue;
    const d = v.d;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 2) continue;
    out[id] = { d, rank: typeof v.rank === 'string' && /^[SABC]$/.test(v.rank) ? v.rank : undefined };
  }
  return out;
}

registerSection<Book>({
  id: 'stamps',
  version: 1,
  read: () => parseBook(readJson(STAMP_KEY)),
  parse: raw => isRecord(raw) ? parseBook(raw) : null,
  merge: (a, b) => {
    const out: Book = { ...a };
    for (const [id, s] of Object.entries(b)) {
      const p = out[id];
      if (!p || s.d > p.d || (s.d === p.d && s.rank && rankBetter(s.rank, p.rank))) out[id] = s;
    }
    return out;
  },
  write: v => { writeJson(STAMP_KEY, v); },
  isEmpty: v => !Object.keys(v).length,
  summary: v => {
    const ids = Object.keys(v).filter(id => PLAYABLE_BY_ID.has(id));
    return [{ label: '印章', value: `${ids.length} 枚 · 大师 ${ids.filter(id => v[id].d === 2).length}` }];
  },
  dump: v => Object.keys(v).length ? v : undefined,
});

/* ---- 无尽模式最高纪录（存在 cookie 里）。 ---- */
type Best = Record<ChallengeKind, number>;
const KINDS: ChallengeKind[] = ['climb', 'brawl'];

registerSection<Best>({
  id: 'records',
  version: 1,
  read: () => ({ climb: readBest('climb'), brawl: readBest('brawl') }),
  parse: raw => isRecord(raw) ? { climb: count(raw.climb, 0, 9999), brawl: count(raw.brawl, 0, 9999) } : null,
  merge: (a, b) => ({ climb: Math.max(a.climb, b.climb), brawl: Math.max(a.brawl, b.brawl) }),
  write: v => { for (const k of KINDS) if (v[k] > readBest(k)) writeBest(k, v[k]); },
  isEmpty: v => !v.climb && !v.brawl,
  summary: v => v.climb || v.brawl ? [{ label: '无尽纪录', value: `闯关 ${v.climb} 关 · 激战 ${v.brawl} 关` }] : [],
  dump: v => v.climb || v.brawl ? v : undefined,
});

/* ---- 键位布局：不算进度，导出时可选。原样搬运，读取时 controls.ts 自己逐项校验。 ---- */
const CONTROLS_KEY = 'mf-controls';

registerSection<Record<string, unknown> | null>({
  id: 'controls',
  version: 1,
  optional: '键位布局',
  read: () => { const v = readJson(CONTROLS_KEY); return isRecord(v) ? v : null; },
  parse: raw => isRecord(raw) ? raw : null,
  merge: (_local, incoming) => incoming,
  write: v => { if (v) writeJson(CONTROLS_KEY, v); },
  isEmpty: v => !v,
  summary: v => v ? [{ label: '键位布局', value: '已包含' }] : [],
  dump: v => v ?? undefined,
});
