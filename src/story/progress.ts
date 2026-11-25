/* 剧情闯关进度：每关是否通过、拿到过的附加目标（位掩码，取并集）。主线线性：前一关通过才解锁下一关。
   进存档文件（registerSection），合并取并集。 */

import { registerSection } from '../save/registry.ts';
import { count, isRecord, onOtherTab, readJson, writeJson } from '../save/storage.ts';
import { ALL_STAGES, CHAPTERS } from './chapters.ts';

const KEY = 'mf.story';
export interface StoryProgress {
  /** 关卡编号 → 拿到的目标位掩码（bit0 = 获胜）。剧情关通过记 7。出现在表里就算通过。 */
  done: Record<string, number>;
  /** 我方操控谁：0 祥子 1 初华。 */
  lead: number;
  /** 首页入口的新内容粉点：最后看过地图时的通关数 + 1（0 = 从没进过）。 */
  seen: number;
}

function parse(raw: unknown): StoryProgress {
  const r = isRecord(raw) ? raw : {};
  const done: Record<string, number> = {};
  if (isRecord(r.done)) for (const [id, v] of Object.entries(r.done)) if (/^\d+-\d+$/.test(id)) done[id] = count(v, 0, 7);
  return { done, lead: r.lead === 1 ? 1 : 0, seen: count(r.seen) };
}

let cache = parse(readJson(KEY));
const listeners = new Set<() => void>();
onOtherTab(KEY, () => { cache = parse(readJson(KEY)); for (const f of listeners) f(); });
function save(): void { writeJson(KEY, cache); for (const f of listeners) f(); }

export function onStory(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
export const storyProgress = (): StoryProgress => cache;
export const cleared = (id: string): boolean => id in cache.done;
export const goalMask = (id: string): number => cache.done[id] ?? 0;
export const starCount = (mask: number): number => (mask & 1) + (mask >> 1 & 1) + (mask >> 2 & 1);

/** 第一关永远开放；之后每关要前一关通过。 */
export function unlocked(id: string): boolean {
  const i = ALL_STAGES.findIndex(s => s.id === id);
  return i === 0 || (i > 0 && cleared(ALL_STAGES[i - 1].id));
}
/** 下一关：第一个没通过的；全通过了返回 null。 */
export function nextStage(): string | null { return ALL_STAGES.find(s => !cleared(s.id))?.id ?? null; }
export function clearedCount(): number { return ALL_STAGES.filter(s => cleared(s.id)).length; }

/** 记一次通关，返回这次新拿到的目标位（之前没有的）。 */
export function recordClear(id: string, mask: number): number {
  const before = cache.done[id];
  const fresh = before === undefined ? mask : mask & ~before;
  cache = { ...cache, done: { ...cache.done, [id]: (before ?? 0) | mask } };
  save();
  return fresh;
}
export function setLead(lead: number): void { cache = { ...cache, lead: lead ? 1 : 0 }; save(); }
export function markSeen(): void { if (hasNew()) { cache = { ...cache, seen: openCount() + 1 }; save(); } }
/** 已解锁的关数：通过的 + 下一关。更新里加了新章时这个数会变大，打完上一章的玩家也能看到粉点。 */
function openCount(): number { return clearedCount() + (nextStage() ? 1 : 0); }
/** 有新解锁、还没进地图看过（首页粉点）。seen 记「看过时的已解锁关数 + 1」，0 表示从没进过。 */
export const hasNew = (): boolean => cache.seen <= openCount();

/** 章节进度：当前章（第一个没打完的章，全通了是最后一章）和这一章的通关数。 */
export function chapterProgress(): { no: number; name: string; done: number; total: number } {
  const ch = CHAPTERS.find(c => c.stages.some(s => !cleared(s.id))) ?? CHAPTERS[CHAPTERS.length - 1];
  return { no: ch.no, name: ch.name, done: ch.stages.filter(s => cleared(s.id)).length, total: ch.stages.length };
}

registerSection<StoryProgress>({
  id: 'story',
  version: 1,
  read: () => cache,
  parse: raw => isRecord(raw) ? parse(raw) : null,
  merge: (a, b) => {
    const done = { ...a.done };
    for (const [id, m] of Object.entries(b.done)) done[id] = (done[id] ?? 0) | m;
    return { done, lead: a.lead, seen: Math.max(a.seen, b.seen) };
  },
  // 导入存档后首页进度卡、地图要跟着刷新。
  write: v => {
    if (!writeJson(KEY, v)) return false;
    cache = v;
    for (const f of listeners) f();
    return true;
  },
  isEmpty: v => Object.keys(v.done).length === 0,
  summary: v => {
    const n = Object.keys(v.done).length;
    return n ? [{ label: '剧情闯关', value: `通过 ${n} 关` }] : [];
  },
  dump: v => Object.keys(v.done).length ? v : undefined,
});
