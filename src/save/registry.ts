/* 存档注册表。每个需要进存档的模块登记一段 section：怎么从本机读、怎么宽松解析文件里的那段、
   两份怎么合并、怎么写回、在确认表里显示什么。存档文件只是这些段的集合。

   健壮性约定（加字段、少字段都不能坏）：
   - 文件里缺的段：跳过，本机这段原样保留。
   - 文件里某段坏了（parse 返回 null）：只丢这一段，其余照常导入。
   - 文件里有本版本不认识的段：原样存进 FOREIGN_KEY，下次导出再带出去，新版存档经过旧版不丢数据。
   - 每段自己做字段级的宽松解析：多出来的字段忽略，缺的字段补默认值。
   导入只做合并（并集 / 取大），然后写本机、整页重载，各模块按自己的初始化重新读一遍。 */

import { isRecord, readJson, writeJson } from './storage.ts';

export interface SummaryRow { label: string; value: string }

export interface SaveSection<T> {
  /** 文件里的段名。定了就不要改。 */
  id: string;
  /** 段格式版本。parse 收到旧版本时自己升级。 */
  version: number;
  /** 导出时让玩家勾选是否包含（键位这类不算进度、但换设备重配很烦的东西）。 */
  optional?: string;
  /** 本机当前值，读不到给默认值。 */
  read(): T;
  /** 文件里的那段，宽松解析；整段不可用返回 null。 */
  parse(raw: unknown, version: number): T | null;
  merge(local: T, incoming: T): T;
  write(v: T): void;
  /** 是否还是全新设备的默认状态。 */
  isEmpty(v: T): boolean;
  /** 确认表里的行。返回空数组表示这段不上表。 */
  summary(v: T): SummaryRow[];
  /** 导出成文件里的数据；返回 undefined 表示这段没内容，不写进文件。 */
  dump(v: T): unknown;
}

const sections: SaveSection<unknown>[] = [];

export function registerSection<T>(s: SaveSection<T>): void {
  if (sections.some(x => x.id === s.id)) throw new Error('save section registered twice: ' + s.id);
  sections.push(s as SaveSection<unknown>);
}

export const SAVE_GAME = 'moefighters';
export const SAVE_FORMAT = 1;
const FOREIGN_KEY = 'mf.save.foreign';

interface Packed { v: number; data: unknown }

function foreign(): Record<string, Packed> {
  const raw = readJson(FOREIGN_KEY);
  const out: Record<string, Packed> = {};
  if (!isRecord(raw)) return out;
  for (const [id, p] of Object.entries(raw)) if (isRecord(p) && typeof p.v === 'number') out[id] = { v: p.v, data: p.data };
  return out;
}

/** 可选段的名字，导出界面据此画勾选框。 */
export function optionalSections(): { id: string; label: string; has: boolean }[] {
  return sections.filter(s => s.optional).map(s => ({ id: s.id, label: s.optional!, has: !s.isEmpty(s.read()) }));
}

export function exportSave(skip: ReadonlySet<string> = new Set()): string {
  const out: Record<string, Packed> = { ...foreign() };
  for (const s of sections) {
    if (skip.has(s.id)) { delete out[s.id]; continue; }
    const data = s.dump(s.read());
    if (data === undefined) delete out[s.id];
    else out[s.id] = { v: s.version, data };
  }
  return JSON.stringify({ game: SAVE_GAME, format: SAVE_FORMAT, savedAt: new Date().toISOString(), sections: out }, null, 1);
}

export interface ImportPlan {
  /** 本机导入前是不是全新状态。 */
  fresh: boolean;
  /** 合并后的最终状态。 */
  rows: SummaryRow[];
  /** 文件里能用的段数；0 表示文件里没有任何能导入的东西。 */
  used: number;
  /** 文件里坏掉而被跳过的段。 */
  broken: number;
  savedAt: string | null;
  apply(): void;
}

export type ImportError = 'not-json' | 'not-save';

/** 解析并合并，但不写。返回的 apply() 才落盘。 */
export function planImport(text: string): ImportPlan | ImportError {
  let file: unknown;
  try { file = JSON.parse(text.replace(/^﻿/, '')); } catch { return 'not-json'; }
  if (!isRecord(file) || file.game !== SAVE_GAME || !isRecord(file.sections)) return 'not-save';
  const incoming = file.sections;
  const known = new Set(sections.map(s => s.id));
  const merged: { s: SaveSection<unknown>; v: unknown }[] = [];
  let fresh = true, used = 0, broken = 0;
  const rows: SummaryRow[] = [];
  for (const s of sections) {
    const local = s.read();
    if (!s.isEmpty(local)) fresh = false;
    const packed = incoming[s.id];
    let value = local;
    if (packed !== undefined) {
      const ok = isRecord(packed) && typeof packed.v === 'number';
      const parsed = ok ? s.parse(packed.data, packed.v as number) : null;
      if (parsed == null) broken++;
      else { value = s.merge(local, parsed); used++; merged.push({ s, v: value }); }
    }
    rows.push(...s.summary(value));
  }
  const unknown: Record<string, Packed> = {};
  for (const [id, p] of Object.entries(incoming)) {
    if (known.has(id) || !isRecord(p) || typeof p.v !== 'number') continue;
    unknown[id] = { v: p.v, data: p.data };
    used++;
  }
  if (fresh && Object.keys(foreign()).length) fresh = false;
  return {
    fresh,
    rows,
    used,
    broken,
    savedAt: typeof file.savedAt === 'string' ? file.savedAt : null,
    apply() {
      for (const { s, v } of merged) s.write(v);
      if (Object.keys(unknown).length) writeJson(FOREIGN_KEY, { ...foreign(), ...unknown });
    },
  };
}

/** 本机当前状态的确认表行（导出时展示）。 */
export function currentRows(): SummaryRow[] {
  return sections.flatMap(s => s.summary(s.read()));
}

/** 本机是否还是全新存档（所有段都是默认）。 */
export function saveIsFresh(): boolean {
  return sections.every(s => s.isEmpty(s.read())) && !Object.keys(foreign()).length;
}

export function saveFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `萌趣格斗存档-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}
