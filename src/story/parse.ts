/* 剧本解析：把 story/chN/编号.md（Gemini 写、用户改过的定稿）读成演出用的指令表。
   这个文件不碰 Vite 专有的 import.meta.glob，node 脚本（scripts/story.ts 的排练）也能直接用；按章加载在 script.ts。
   格式和检查规则在 scripts/story.ts（npm run story -- check）。这里只做「宽松读」：检查脚本已经拦过错，
   运行时遇到看不懂的行直接跳过，不让一句笔误卡死整关。 */

import { ROSTER } from '../data/characters.ts';
import { SHORT_NAMES } from '../data/shortNames.ts';

export type Pose = 'idle' | 'jump' | 'hurt' | 'block' | 'down';
export const POSES: Record<string, Pose> = { 平常: 'idle', 开心: 'jump', 吃惊: 'hurt', 防备: 'block', 倒地: 'down' };
export { SLOT_X } from './stage.ts';

export type StageType = '剧情' | '战斗' | 'Boss' | '章末';

/** ln：在定稿文件里的行号（预览 ?story=3-01&at=27 跳到某一行、排练脚本报行号用）。 */
export type Cmd = (
  /** 台词。who 为 null 是旁白；id 是能对上的角色（广播 / 画外音也可以有 id，用来出头像）。 */
  | { k: 'line'; who: string | null; id: string | null; tag?: string; pose?: Pose; text: string }
  | { k: 'act'; who: string; id: string | null; verb: string; arg?: string }
  | { k: 'stage'; verb: string; arg?: string }
  /** 道具：> 道具 星门 亮 3（props.ts）。 */
  | { k: 'prop'; name: string; verb: string; arg?: string }
  /** 特效：> 特效 裂隙 中 / > 特效 收 裂隙（fx.ts）。verb 是特效名或「收」。 */
  | { k: 'fx'; verb: string; arg?: string }
) & { ln?: number };

export interface Script {
  id: string;
  title: string;
  type: StageType;
  scene: string;
  opening: { who: string; slot: string }[];
  /** 战斗前（剧情关就是全部）。 */
  pre: Cmd[];
  /** 战斗后。没有战斗的关为空。 */
  post: Cmd[];
  battle: { us: string[]; them: string[]; intent: string } | null;
}

const NAME_TO_ID = new Map<string, string>();
for (const c of ROSTER) {
  NAME_TO_ID.set(c.name, c.id);
  const s = SHORT_NAMES[c.id];
  if (s) NAME_TO_ID.set(s, c.id);
}
/** 剧本里的简称 → 角色 id；薇欧拉、织萌这类还不是可用角色的返回 null。 */
export const idOf = (name: string): string | null => name === PHANTOM ? 'mutsumi' : NAME_TO_ID.get(name) ?? (isNightmare(name) ? NAME_TO_ID.get(name.slice(2)) ?? null : null);
/** 墨提斯：睦的另一个人格实体化出来的分身。用睦的纸板，画成半透明的冷色、浮在地上；上台是光点汇聚成形，退场是化光散去。 */
export const PHANTOM = '墨提斯';
export const isPhantom = (name: string): boolean => name === PHANTOM;
/** 已经现身的梦魇：剧本里写「梦魇 + 简称」（梦魇海铃）。上台是暗紫纸板、影子极深，被打倒会化光消散。 */
export const isNightmare = (name: string): boolean => name.startsWith('梦魇') && name.length > 2;

export function parseScript(text: string): Script {
  const s: Script = { id: '', title: '', type: '剧情', scene: '', opening: [], pre: [], post: [], battle: null };
  let into = s.pre;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let n = 0; n < lines.length; n++) {
    const l = lines[n].trim(), ln = n + 1;
    if (!l || l.startsWith('//') || l.startsWith('<!--')) continue;
    if (l.startsWith('## ')) {
      const h = l.match(/^##\s+(\d+-\d+)\s*(.*?)\s*[[［](.+?)[\]］]\s*$/);
      if (h) { s.id = h[1]; s.title = h[2]; s.type = h[3].trim() as StageType; }
      continue;
    }
    if (l.startsWith('---')) { into = s.post; continue; }
    if (l.startsWith('@')) {
      const m = l.match(/^@(\S+)\s*(.*)$/);
      if (!m) continue;
      const v = m[2].trim();
      if (m[1] === '场景') s.scene = v;
      else if (m[1] === '开场') {
        for (const tok of v.split(/\s+/)) {
          const t = tok.match(/^(.+?)[(（](.+?)[)）]$/);
          if (t) s.opening.push({ who: t[1], slot: t[2] });
        }
      } else if (m[1] === '战斗') {
        const parts = v.split('|').map(p => p.trim());
        const names = (p: string | undefined, head: string) => (p ?? '').replace(head, '').trim().split(/\s+/).filter(Boolean);
        s.battle = { us: names(parts[0], '我方'), them: names(parts[1], '对手'), intent: (parts[2] ?? '').replace(/^意图[:：]\s*/, '') };
      }
      continue;
    }
    if (l.startsWith('>')) {
      const tok = l.slice(1).trim().split(/\s+/);
      if (tok[0] === '道具') { if (tok[1] && tok[2]) into.push({ k: 'prop', name: tok[1], verb: tok[2], arg: tok[3], ln }); }
      else if (tok[0] === '特效') { if (tok[1]) into.push({ k: 'fx', verb: tok[1], arg: tok[2], ln }); }
      else if (['震屏', '暗场', '亮场', '闪回开始', '闪回结束', '立绘', '停顿'].includes(tok[0])) into.push({ k: 'stage', verb: tok[0], arg: tok[1], ln });
      else if (tok[1]) into.push({ k: 'act', who: tok[0], id: idOf(tok[0]), verb: tok[1], arg: tok[2], ln });
      continue;
    }
    const d = l.match(/^([^:：[［(（]+?)\s*(?:[(（](.+?)[)）])?\s*(?:[[［](.+?)[\]］])?\s*[:：]\s*(.*)$/);
    if (!d || !d[4]) continue;
    const who = d[1].trim();
    into.push({ k: 'line', who: who === '旁白' ? null : who, id: idOf(who), tag: d[2], pose: d[3] ? POSES[d[3]] : undefined, text: d[4], ln });
  }
  return s;
}

/** 一关的旁白 / 台词总句数（地图上不用，预览页和自检用）。 */
export function lineCount(s: Script): number {
  return [...s.pre, ...s.post].filter(c => c.k === 'line').length;
}
