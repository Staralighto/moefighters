/* 剧情闯关 · 写作流程脚本（双击 剧情-发送.bat / 剧情-接收.bat 调用）。
 *
 *   send   判断进度 → 生成本次要上传的文件和提示词（提示词进剪贴板）→ 告诉你下一步怎么做
 *   recv   从剪贴板读取 Gemini 的输出 → 拆成每关文件（原稿 + 定稿）→ 检查 → 不通过就把修正提示词放进剪贴板
 *   check  检查某章全部定稿：npm run story -- check 1
 *   cards  为某章生成 / 补全角色卡骨架：npm run story -- cards 1
 *   seal   演出审定后盖章：npm run story -- seal 3-01（文字再改动，check 会提示需要重新审定）
 *   rehearse 排练：按指令走一遍，打出每一步的站位和朝向、标出走位问题：npm run story -- rehearse 3（或 3-01，加 --issues 只看问题）
 *
 * 目录约定见 story/README.md。剧本格式见 story/gemini-skill/剧本格式与演出指令.md，本脚本的检查规则与它一一对应。
 * 测试用：设环境变量 STORY_CLIP=某文件，则剪贴板读写改为读写该文件；STORY_YES=1 自动确认。 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import { ROSTER } from '../src/data/characters.ts';
import { SHORT_NAMES } from '../src/data/shortNames.ts';
import { STAGES } from '../src/data/stages.ts';
import { BANDS } from '../src/data/bands.ts';
import { rehearseArg } from './rehearse.ts';
import { PROPS, PROP_VERBS } from '../src/story/props.ts';
import { FX_NAMES, FX_NEED_ACTOR, FX_NEED_ARG, FX_LASTING } from '../src/story/fx.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const S = path.join(ROOT, 'story');
const P = {
  state: path.join(S, 'state.json'),
  outline: path.join(S, '大纲.md'),
  ledger: path.join(S, '账本.md'),
  skill: path.join(S, 'gemini-skill'),
  send: path.join(S, '_send'),
  templates: path.join(S, '_模板'),
  ch: (n: number) => path.join(S, `ch${n}`),
  raw: (n: number) => path.join(S, 'raw', `ch${n}`),
};
const BATCH = 4;
/** 技能附件：源文件（story/gemini-skill/）→ 上传用的 .txt（story/_send/skill/）。 */
const SKILL_UPLOADS: [string, string][] = [['世界观设定.md', 'skill-world.txt'], ['剧本格式与演出指令.md', 'skill-format.txt'], ['样例关.md', 'skill-sample.txt']];

/* ---------------- 词表：与《剧本格式与演出指令》保持一致 ---------------- */
export const TYPES = ['剧情', '战斗', 'Boss', '章末'] as const;
export const POSES: Record<string, string> = { 平常: 'idle', 开心: 'jump', 吃惊: 'hurt', 防备: 'block', 倒地: 'down' };
export const SLOTS = ['左', '中左', '中', '中右', '右'];
export const ACTOR_VERBS = ['走入', '走到', '退场', '转身', '背对', '面向', '靠近', '后退', '跳', '倒下', '起身', '发抖', '换', '消散', '虚化', '复制体翻面'];
/** 墨提斯：睦的分身，只能做演出指令（上台是光点汇聚成形）。 */
const PHANTOM = '墨提斯';
export const STAGE_VERBS = ['震屏', '暗场', '亮场', '闪回开始', '闪回结束', '立绘', '停顿'];
const EXTRA_SPEAKERS = ['旁白', '织萌', '？？？'];
const SPEAKER_TAGS = ['广播', '心声', '伪装'];
type Budget = Record<string, { pre: [number, number]; post?: [number, number] }>;
/** 第 1 章的预算（已定稿，保持原样）。 */
const BUDGET_CH1: Budget = {
  剧情: { pre: [18, 30] },
  战斗: { pre: [8, 14], post: [3, 6] },
  Boss: { pre: [10, 18], post: [4, 8] },
  章末: { pre: [30, 40] },
};
/** 第 2–3 章的预算。 */
const BUDGET: Budget = {
  剧情: { pre: [30, 45] },
  战斗: { pre: [14, 22], post: [6, 10] },
  Boss: { pre: [18, 28], post: [8, 12] },
  章末: { pre: [40, 55] },
};
/** 第 4 章起：剧本加码翻倍，留足人物互动和喘息空间。 */
const BUDGET_CH4: Budget = {
  剧情: { pre: [55, 95] },
  战斗: { pre: [25, 45], post: [10, 22] },
  Boss: { pre: [34, 58], post: [14, 26] },
  章末: { pre: [70, 110] },
};
const budgetOf = (id: string): Budget => id.startsWith('1-') ? BUDGET_CH1 : /^(2|3)-/.test(id) ? BUDGET : BUDGET_CH4;
const LINE_SOFT = 30, LINE_HARD = 56;

/* ---------------- 名字 ---------------- */
const NAME_TO_ID = new Map<string, string>();
for (const c of ROSTER) {
  NAME_TO_ID.set(c.name, c.id);
  const s = SHORT_NAMES[c.id]; if (s) NAME_TO_ID.set(s, c.id);
}
/** 已经现身的梦魇写「梦魇 + 简称」（梦魇海铃），上台是暗紫纸板。 */
const nightmareOf = (n: string) => n.startsWith('梦魇') && NAME_TO_ID.has(n.slice(2)) ? n.slice(2) : null;
const isSpeaker = (n: string) => NAME_TO_ID.has(n) || EXTRA_SPEAKERS.includes(n) || !!nightmareOf(n) || n === PHANTOM;
const shortOf = (id: string) => SHORT_NAMES[id] ?? ROSTER.find(c => c.id === id)?.name ?? id;
const stageByKey = (k: string) => STAGES.find(s => s.id === k || s.name === k || s.name.replace(/\s/g, '') === k.replace(/\s/g, ''));

/* ---------------- 小工具 ---------------- */
const read = (f: string) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '';
const write = (f: string, t: string) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t, 'utf8'); };
const norm = (t: string) => t.replace(/\r\n/g, '\n').split('\n').map(l => l.trimEnd()).join('\n').trim();
const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, '/');
const width = (t: string) => [...t.replace(/\s/g, '')].length;
const C = { b: (s: string) => `\x1b[1m${s}\x1b[0m`, g: (s: string) => `\x1b[32m${s}\x1b[0m`, y: (s: string) => `\x1b[33m${s}\x1b[0m`, r: (s: string) => `\x1b[31m${s}\x1b[0m`, c: (s: string) => `\x1b[36m${s}\x1b[0m` };
const isWin = process.platform === 'win32';

function clipSet(text: string) {
  if (process.env.STORY_CLIP) { write(process.env.STORY_CLIP, text); return; }
  const tmp = path.join(os.tmpdir(), 'moefighters-story-clip.txt');
  fs.writeFileSync(tmp, text, 'utf8');
  if (isWin) execFileSync('powershell', ['-NoProfile', '-Command', `Get-Content -Raw -Encoding UTF8 -LiteralPath '${tmp.replace(/'/g, "''")}' | Set-Clipboard`]);
  else console.log(C.y(`（非 Windows：提示词已写到 ${tmp}）`));
}
function clipGet(): string {
  if (process.env.STORY_CLIP) return read(process.env.STORY_CLIP);
  if (!isWin) throw new Error('非 Windows 环境请用 STORY_CLIP=文件 测试');
  return execFileSync('powershell', ['-NoProfile', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw'], { encoding: 'utf8', maxBuffer: 64 << 20 });
}
function reveal(f: string) {
  if (!isWin || process.env.STORY_CLIP) return;
  spawn('explorer', [`/select,${f}`], { detached: true, stdio: 'ignore' }).unref();
}
async function ask(q: string): Promise<boolean> {
  if (process.env.STORY_YES) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(q)).trim().toLowerCase(); rl.close();
  return a === '' || a === 'y' || a === '是';
}
async function pause(q: string) {
  if (process.env.STORY_YES) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(q); rl.close();
}

type State = { chapter: number; skillHash: string; ledgerDone: boolean; lastBatch: string[]; sent: Record<string, string>; planChat: boolean };
const loadState = (): State => ({ chapter: 1, skillHash: '', ledgerDone: false, lastBatch: [], sent: {}, planChat: false, ...JSON.parse(read(P.state) || '{}') });
const saveState = (s: State) => write(P.state, JSON.stringify(s, null, 2) + '\n');

/* ---------------- 关卡表 ---------------- */
export type PlanNode = { id: string; title: string; type: string; scene: string; cast: string[]; beats: string[] };
export function parsePlan(text: string): PlanNode[] {
  const out: PlanNode[] = [];
  let cur: PlanNode | null = null;
  for (const raw of text.replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const l = raw.trim();
    const h = l.match(/^##\s+(\d+-\d+)\s*(.*?)\s*[\[［](.+?)[\]］]\s*$/);
    if (h) { cur = { id: h[1], title: h[2], type: h[3].trim(), scene: '', cast: [], beats: [] }; out.push(cur); continue; }
    if (!cur) continue;
    const kv = l.match(/^-\s*(场景|出场)\s*[:：]\s*(.*)$/);
    if (kv?.[1] === '场景') cur.scene = kv[2].trim();
    if (kv?.[1] === '出场') cur.cast = kv[2].split(/[,，、\s]+/).filter(Boolean);
    const b = l.match(/^-\s*(B\d+-\d+[a-z])\s*[:：]\s*(.*)$/);
    if (b && b[2].trim()) cur.beats.push(b[1]);
  }
  return out;
}
function planHoles(plan: PlanNode[]): string[] {
  const out: string[] = [];
  for (const p of plan) {
    if (!(TYPES as readonly string[]).includes(p.type)) out.push(`${p.id} 类型「${p.type}」应为 ${TYPES.join(' / ')}`);
    if (!p.scene) out.push(`${p.id} 没填场景`);
    else if (!stageByKey(p.scene)) out.push(`${p.id} 场景「${p.scene}」不存在`);
    if (!p.cast.length) out.push(`${p.id} 没填出场`);
    for (const c of p.cast) if (!isSpeaker(c)) out.push(`${p.id} 出场里的「${c}」不是已知角色（用简称）`);
    if (!p.beats.length) out.push(`${p.id} 没有节拍（至少一条「- B${p.id}a: ……」）`);
  }
  return out;
}
/** 大纲里「## 第 N 章」这一节的正文；只有「（待写）」或空白时返回空串。 */
function outlineOf(n: number): string {
  const t = read(P.outline).replace(/<!--[\s\S]*?-->/g, '');
  const m = t.match(new RegExp(`^##\\s*第\\s*${n}\\s*章[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, 'm'));
  const body = (m?.[1] ?? '').trim();
  return body.replace(/（待写）/g, '').trim() ? body : '';
}
/** 关卡表还是模板原样（一关都没填）。 */
const planUntouched = (plan: PlanNode[]) => plan.every(p => !p.scene && !p.cast.length && !p.beats.length);
function referenceLists(): string {
  const roster = BANDS.map(b => {
    const names = ROSTER.filter(c => c.bands?.[0] === b.id && c.playable !== false && !(c as any).hidden).map(c => shortOf(c.id));
    return names.length ? `- ${b.name}：${names.join('、')}` : '';
  }).filter(Boolean).join('\n');
  const scenes = STAGES.map(x => `- ${x.id}：${x.name}`).join('\n');
  return `# 可用角色（出场请用这里的简称）\n${roster}\n- 其他：薇欧拉、织萌（织萌不参与战斗）\n\n# 可用场景（场景请写 id）\n${scenes}\n`;
}
const planOf = (n: number) => parsePlan(read(path.join(P.ch(n), '关卡表.md')));

/* ---------------- 剧本解析与检查 ---------------- */
export type Issue = { line: number; msg: string; level: 'error' | 'warn' };
export type Stage = { id: string; title: string; type: string; text: string; issues: Issue[]; beats: string[] };

/** 把一段文本按「## 编号」拆成多关。 */
export function splitStages(text: string): { id: string; text: string }[] {
  const t = text.replace(/\r\n/g, '\n');
  const idx = [...t.matchAll(/^##\s+(\d+-\d+)/gm)];
  return idx.map((m, i) => ({ id: m[1], text: t.slice(m.index!, i + 1 < idx.length ? idx[i + 1].index : undefined).trim() + '\n' }));
}

export function checkStage(text: string, plan?: PlanNode): Stage {
  const issues: Issue[] = [];
  const err = (line: number, msg: string) => issues.push({ line, msg, level: 'error' });
  const warn = (line: number, msg: string) => issues.push({ line, msg, level: 'warn' });
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const st: Stage = { id: '', title: '', type: '', text, issues, beats: [] };
  const cast = new Map<string, string>(); // 名字 → 位置
  let pre = 0, post = 0, phase: 'pre' | 'battle' | 'post' = 'pre', hasBattle = false, hasScene = false;
  const count = () => { if (phase === 'post') post++; else pre++; };
  const enter = (ln: number, name: string, slot: string) => {
    if (!SLOTS.includes(slot)) err(ln, `位置「${slot}」不在 ${SLOTS.join('/')} 里`);
    if (cast.has(name)) warn(ln, `${name} 已经在场`);
    // 6 人时站位不够分，游戏里会自动均匀铺开，同位不再提醒。
    if (cast.size < 5) for (const [n, s] of cast) if (s === slot && n !== name) warn(ln, `${name} 和 ${n} 站在同一个位置「${slot}」`);
    cast.set(name, slot);
    // 墨提斯是睦的分身，不算进 6 人上限。
    if ([...cast.keys()].filter(n => n !== PHANTOM).length > 6) err(ln, `同屏超过 6 人（${[...cast.keys()].join('、')}）`);
  };
  const checkName = (ln: number, n: string) => { if (!isSpeaker(n)) err(ln, `不认识的角色名「${n}」（请用角色卡里的简称）`); };

  lines.forEach((rawLine, i) => {
    const ln = i + 1, l = rawLine.trim();
    if (!l || l.startsWith('//') || l.startsWith('<!--')) return;
    if (l.startsWith('## ')) {
      const h = l.match(/^##\s+(\d+-\d+)\s*(.*?)\s*[\[［](.+?)[\]］]\s*$/);
      if (!h) { err(ln, '标题行格式应为「## 1-03 标题 [战斗]」'); return; }
      if (st.id) { err(ln, '一个文件只能有一关'); return; }
      [st.id, st.title, st.type] = [h[1], h[2], h[3].trim()];
      if (!(TYPES as readonly string[]).includes(st.type)) err(ln, `类型「${st.type}」应为 ${TYPES.join(' / ')}`);
      return;
    }
    if (l.startsWith('---')) {
      if (l.replace(/\s/g, '') !== '---战后') err(ln, '分隔行只能写「---战后」');
      else if (!hasBattle) err(ln, '「---战后」必须出现在 @战斗 之后');
      phase = 'post'; return;
    }
    if (l.startsWith('@')) {
      const m = l.match(/^@(\S+)\s*(.*)$/)!;
      const [k, v] = [m[1], m[2].trim().replace(/\\\|/g, '|')];
      if (k === '场景') { hasScene = true; if (!stageByKey(v)) err(ln, `场景「${v}」不存在（可用：${STAGES.map(s => s.id).join(', ')}）`); }
      else if (k === '节拍') st.beats = v.split(/\s+/).filter(Boolean);
      else if (k === '线索') { for (const c of v.split(/\s+/)) if (!/^[+!]C-\S+$/.test(c)) err(ln, `线索「${c}」应写成 +C-xxx（埋）或 !C-xxx（揭）`); }
      else if (k === '开场') {
        for (const tok of v.split(/\s+/).filter(Boolean)) {
          const t = tok.match(/^(.+?)[(（](.+?)[)）]$/);
          if (!t) { err(ln, `开场「${tok}」应写成 名字(位置)`); continue; }
          checkName(ln, t[1]); enter(ln, t[1], t[2]);
        }
      } else if (k === '战斗') {
        hasBattle = true; phase = 'battle';
        if (!/我方.+\|.*对手.+\|.*意图[:：].+/.test(v)) err(ln, '@战斗 应写成「@战斗 我方 祥子 | 对手 初华 | 意图: ……」');
        if (/\d+\s*(%|秒|点|伤害|血)/.test(v)) err(ln, '@战斗 只写意图，不写数值');
      } else if (k === '审定') {
        // @审定 日期 #哈希：演出审定后盖的章（npm run story -- seal 3-01）。文字再被改动，哈希对不上就要重新审定。
        const m2 = v.match(/^(\d{4}-\d{2}-\d{2})\s+#([0-9a-f]{8,})$/);
        if (!m2) err(ln, '@审定 应写成「@审定 2026-11-24 #哈希」（用 npm run story -- seal 编号 生成）');
        else if (m2[2] !== sealHash(text)) warn(ln, `审定（${m2[1]}）之后改过，需要重新审定演出`);
      } else err(ln, `不认识的标记「@${k}」`);
      return;
    }
    if (l.startsWith('>')) {
      const tok = l.slice(1).trim().split(/\s+/);
      if (tok[0] === '道具') {
        if (!PROPS[tok[1] ?? '']) err(ln, `道具「${tok[1] ?? ''}」不存在（可用：${Object.keys(PROPS).join('、')}）`);
        else if (!PROP_VERBS.includes(tok[2] ?? '')) err(ln, `道具动作「${tok[2] ?? ''}」应为 ${PROP_VERBS.join(' / ')}`);
        return;
      }
      if (tok[0] === '特效') {
        // > 特效 名字 [参数] / > 特效 收 名字（src/story/fx.ts）
        const [, name, arg] = tok;
        if (name === '收') { if (!FX_LASTING.includes(arg ?? '')) err(ln, `「特效 收」后面写要收掉的特效：${FX_LASTING.join(' / ')}`); return; }
        if (!FX_NAMES.includes(name ?? '')) { err(ln, `特效「${name ?? ''}」不存在（可用：${FX_NAMES.join('、')}）`); return; }
        if (FX_NEED_ARG.includes(name) && !arg) { err(ln, `特效「${name}」后面要写${FX_NEED_ACTOR.includes(name) ? '角色' : '角色或位置'}`); return; }
        if (arg) {
          if (FX_NEED_ACTOR.includes(name) || !SLOTS.includes(arg)) {
            if (name === '裂隙') err(ln, `「裂隙」后面只能写位置（${SLOTS.join('/')}）`);
            else if (!cast.has(arg)) err(ln, `特效「${name}」的对象 ${arg} 不在场${FX_NEED_ACTOR.includes(name) ? '' : `（也可以写位置 ${SLOTS.join('/')}）`}`);
          }
        }
        return;
      }
      if (STAGE_VERBS.includes(tok[0])) {
        if (tok[0] === '立绘') { if (!tok[1]) err(ln, '「立绘」后面要写角色名'); else checkName(ln, tok[1]); }
        return;
      }
      const [who, verb, arg] = tok;
      if (!verb) { err(ln, `演出指令不完整：「${l}」`); return; }
      checkName(ln, who);
      if (!ACTOR_VERBS.includes(verb)) { err(ln, `不认识的演出「${verb}」（可用：${ACTOR_VERBS.join(' ')}；其他动作请写进台词或旁白）`); return; }
      if (verb === '走入') enter(ln, who, arg ?? '');
      else if (verb === '退场') {
        if (!cast.delete(who)) warn(ln, `${who} 本来就不在场`);
        if (arg && arg !== '左' && arg !== '右') err(ln, `「退场」后面只能写 左 / 右（不写就从近的一侧下台）`);
      }
      // 梦魇被打倒会自己化光消散，之后算下台。
      else if (verb === '倒下' && nightmareOf(who) && cast.has(who)) cast.delete(who);
      else if (verb === '消散') { if (!cast.delete(who)) err(ln, `${who} 不在场，不能「消散」`); }
      else {
        if (!cast.has(who)) err(ln, `${who} 不在场，不能「${verb}」（先「走入」或写进 @开场）`);
        if (verb === '走到') { if (!SLOTS.includes(arg ?? '')) err(ln, `「走到」后面要写位置（${SLOTS.join('/')}）`); else cast.set(who, arg); }
        if ((verb === '靠近' || verb === '背对' || verb === '面向') && arg && !cast.has(arg)) err(ln, `${verb}的对象 ${arg} 不在场`);
        if (verb === '面向' && !arg) err(ln, '「面向」后面要写对着谁');
        if (verb === '换' && !(arg in POSES)) err(ln, `表情「${arg ?? ''}」应为 ${Object.keys(POSES).join(' / ')}`);
      }
      return;
    }
    const d = l.match(/^([^:：\[［(（]+?)\s*(?:[(（](.+?)[)）])?\s*(?:[\[［](.+?)[\]］])?\s*[:：]\s*(.*)$/);
    if (d) {
      const [, who, tag, pose, line] = d;
      checkName(ln, who);
      if (tag && !SPEAKER_TAGS.includes(tag)) err(ln, `说话人标注「(${tag})」应为 ${SPEAKER_TAGS.join(' / ')}`);
      if (pose && !(pose in POSES)) err(ln, `表情「${pose}」应为 ${Object.keys(POSES).join(' / ')}`);
      if (!line) err(ln, '台词是空的');
      const w = width(line);
      if (w > LINE_HARD) err(ln, `台词 ${w} 字，超过两行上限 ${LINE_HARD}，请拆成两句`);
      else if (w > LINE_SOFT) warn(ln, `台词 ${w} 字，建议 ≤ ${LINE_SOFT}`);
      if (who !== '旁白' && !tag && NAME_TO_ID.has(who) && !cast.has(who)) warn(ln, `${who} 在说话但不在场（如果是画外音，写成 ${who}(广播) 或 ${who}(心声)）`);
      if (phase === 'battle') err(ln, '@战斗 和 ---战后 之间不能有台词');
      count(); return;
    }
    err(ln, `看不懂这一行：「${l}」`);
  });

  if (!st.id) err(1, '缺少标题行「## 1-03 标题 [类型]」');
  if (!hasScene) err(1, '缺少 @场景');
  const fight = st.type === '战斗' || st.type === 'Boss';
  if (fight && !hasBattle) err(1, `${st.type}关缺少 @战斗`);
  if (fight && hasBattle && phase !== 'post') err(1, `${st.type}关缺少「---战后」`);
  if (!fight && hasBattle) err(1, `${st.type}关不应该有 @战斗`);
  const b = budgetOf(st.id)[st.type];
  if (b) {
    const judge = (n: number, [lo, hi]: [number, number], what: string) => {
      // 预算只作参考：偏离多少都只提醒，不拦接收。
      if (n < lo || n > hi) warn(1, `${what} ${n} 句，预算 ${lo}–${hi}${n < lo * .5 || n > hi * 1.5 ? '（偏离较多）' : ''}`);
    };
    judge(pre, b.pre, fight ? '战前' : '全关');
    if (b.post && hasBattle) judge(post, b.post, '战后');
  }
  if (plan) {
    if (plan.type !== st.type) err(1, `类型应为「${plan.type}」（关卡表）`);
    const sceneLine = text.match(/^@场景\s+(.+)$/m)?.[1].trim();
    if (sceneLine && plan.scene && stageByKey(sceneLine)?.id !== stageByKey(plan.scene)?.id) warn(1, `场景和关卡表不一致（关卡表是 ${plan.scene}）`);
    const miss = plan.beats.filter(x => !st.beats.includes(x));
    if (miss.length) err(1, `@节拍 缺少关卡表要求的：${miss.join(' ')}`);
    for (const x of st.beats) if (!plan.beats.includes(x)) warn(1, `@节拍 里的 ${x} 不在关卡表这一关里`);
  }
  return st;
}

function printIssues(id: string, iss: Issue[]) {
  for (const x of iss.sort((a, b) => a.line - b.line))
    console.log(`  ${x.level === 'error' ? C.r('✗') : C.y('!')} ${id} 第 ${x.line} 行：${x.msg}`);
}

/* ---------------- 角色卡 ---------------- */
function cardFor(id: string): string {
  const c = ROSTER.find(x => x.id === id)!;
  const band = c.bands?.map(b => BANDS.find(x => x.id === b)?.name ?? b).join(' / ');
  const sk = (c.skills ?? []).slice(2, 6).map((s: any, i: number) => `  - ${'UIOL'[i]} ${s.name}：${s.brief ?? ''}`).join('\n');
  return `## ${shortOf(id)}（${c.name}）
- 说话人写法：${shortOf(id)}
- 乐队：${band}
- 战斗称号：${c.title}　代表台词：${c.quote}
- 闪耀之力（战斗能力特点，台词与旁白中绝不喊出技能名，只描述能力效果）：
${sk}
- 性格与说话方式：（待填，留空则按原作）
- 称呼表（她怎么叫别人）：（待填，例：对祥子→「小祥」）
- 本章状态：（待填）
`;
}
function ensureCards(n: number): string[] {
  const f = path.join(P.ch(n), '角色卡.md');
  let text = read(f) || `# 第 ${n} 章 · 角色卡\n\n只放本章出场的角色。「（待填）」可以留空，Gemini 会按原作补；写了的以你写的为准。\n\n`;
  const added: string[] = [];
  const cast = new Set(planOf(n).flatMap(p => p.cast));
  for (const name of cast) {
    const id = NAME_TO_ID.get(name);
    if (!id) { if (!EXTRA_SPEAKERS.includes(name)) console.log(C.y(`  关卡表「出场」里的「${name}」不是已知角色，角色卡跳过它`)); continue; }
    if (text.includes(`说话人写法：${shortOf(id)}\n`)) continue;
    text += '\n' + cardFor(id); added.push(shortOf(id));
  }
  if (added.length || !fs.existsSync(f)) write(f, text);
  return added;
}

/* ---------------- 状态查询 ---------------- */
const rawFile = (n: number, id: string) => path.join(P.raw(n), `${id}.md`);
const finalFile = (n: number, id: string) => path.join(P.ch(n), `${id}.md`);
const skillHash = () => {
  const h = crypto.createHash('sha1');
  for (const f of fs.readdirSync(P.skill).sort()) h.update(f).update(read(path.join(P.skill, f)));
  return h.digest('hex').slice(0, 12);
};
/** 审定哈希：整关文字（去掉 @审定 行本身）。 */
const sealHash = (t: string) => hashOf(norm(t).split('\n').filter(l => !l.trim().startsWith('@审定')).join('\n')).slice(0, 10);
/** 给一关盖审定章（写在标题行下面；已有就更新）。 */
function seal(id: string) {
  const f = finalFile(Number(id.split('-')[0]), id);
  if (!fs.existsSync(f)) { console.log(C.r(`找不到 ${rel(f)}`)); return; }
  const raw = fs.readFileSync(f, 'utf8');
  const nl = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.replace(/\r\n/g, '\n').split('\n').filter(l => !l.trim().startsWith('@审定'));
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const at = lines.findIndex(l => l.trim().startsWith('## '));
  lines.splice(at + 1, 0, `@审定 ${date} #${sealHash(lines.join('\n'))}`);
  fs.writeFileSync(f, lines.join(nl), 'utf8');
  console.log(C.g(`已审定 ${id}（${date}）`));
}
const hashOf = (t: string) => crypto.createHash('sha1').update(norm(t)).digest('hex').slice(0, 12);
/** 你改过、且改过之后还没发给 Gemini 的定稿（和 Gemini 最新原稿不同，也和上次附上的版本不同）。 */
function editedFinals(n: number, ids: string[], st: State) {
  return ids.filter(id => {
    if (!fs.existsSync(finalFile(n, id))) return false;
    const f = read(finalFile(n, id));
    return norm(f) !== norm(read(rawFile(n, id))) && st.sent[id] !== hashOf(f);
  });
}
const markSent = (n: number, ids: string[], st: State) => { for (const id of ids) st.sent[id] = hashOf(read(finalFile(n, id))); };
function checkFinals(n: number, ids: string[]): number {
  const plan = new Map(planOf(n).map(p => [p.id, p]));
  let errors = 0;
  for (const id of ids) {
    if (!fs.existsSync(finalFile(n, id))) continue;
    const st = checkStage(read(finalFile(n, id)), plan.get(id));
    const e = st.issues.filter(x => x.level === 'error').length;
    errors += e;
    if (st.issues.length) printIssues(id, st.issues);
  }
  return errors;
}

/* ---------------- send ---------------- */
function banner(title: string) { console.log('\n' + C.b(C.c(`【${title}】`))); }
function steps(list: string[]) { list.forEach((s, i) => console.log(`  ${C.b(String(i + 1))}. ${s}`)); }

async function send() {
  const st = loadState();
  const n = st.chapter;

  // 1. Gemini skill 是否需要创建 / 更新
  const h = skillHash();
  if (h !== st.skillHash) {
    // Gemini 不认 Windows 上的 .md（浏览器给不出文件类型），上传件一律复制成英文名 .txt。
    const skillOut = path.join(P.send, 'skill');
    for (const [src, dst] of SKILL_UPLOADS) write(path.join(skillOut, dst), read(path.join(P.skill, src)));
    banner(st.skillHash ? 'Gemini 技能需要更新' : '第一次使用：先在 Gemini 里创建技能');
    const f = (x: string) => read(path.join(P.skill, x)).trim();
    steps([
      `打开 Gemini → Skills → ${st.skillHash ? '找到「' + f('名称.txt') + '」点编辑' : '新建'}`,
      `Name 填：${C.b(f('名称.txt'))}`,
      `Description：复制 ${rel(path.join(P.skill, '描述.txt'))} 的内容`,
      `Instructions：复制 ${rel(path.join(P.skill, '指令.md'))} 的内容（已放进剪贴板，直接粘贴）`,
      `Add files：上传 ${C.b('skill-world.txt、skill-format.txt、skill-sample.txt')}（资源管理器已打开 ${rel(skillOut)}）${st.skillHash ? '，先删掉旧的三个文件' : ''}`,
      '点 Create / 保存',
    ]);
    clipSet(f('指令.md'));
    reveal(path.join(skillOut, 'skill-world.txt'));
    await pause('\n  完成后按回车继续……');
    st.skillHash = h; saveState(st);
  }

  // 2. 本章关卡表
  const planFile = path.join(P.ch(n), '关卡表.md');
  const plan = planOf(n);
  if (!plan.length) {
    if (!fs.existsSync(planFile)) write(planFile, read(path.join(P.templates, '关卡表.md')).replace(/第 N 章/g, `第 ${n} 章`).replace(/N-(\d)/g, `${n}-$1`));
    banner(`第 ${n} 章还没有关卡表`);
    steps([`打开 ${rel(planFile)} 按模板填好每一关`, '再双击「剧情-发送.bat」']);
    reveal(planFile); return;
  }
  if (planUntouched(plan)) {
    const ol = outlineOf(n);
    if (!ol) {
      banner(`先写第 ${n} 章的大纲`);
      console.log(`  在 ${rel(P.outline)} 的「## 第 ${n} 章」下面写这一章的要点，Gemini 会据此规划关卡表。建议写：`);
      steps(['本章的主线：祥子这一章想弄明白什么、想做成什么（一句话）', '本章开头和结尾，主角团各在哪、是什么状态', '必须发生的关键事件（5–10 条，按顺序，前后有因果）', '本章出场的角色（新登场的乐队 1–2 支就够，宁少勿多）', '要埋或揭开的线索、复制体相关的进展', '希望的基调（悬疑 / 轻松 / 压抑……）']);
      console.log('  写完再双击「剧情-发送.bat」。');
      reveal(P.outline); return;
    }
    const prev = n > 1 ? planOf(n - 1).map(p => read(finalFile(n - 1, p.id))).filter(Boolean).join('\n') : '';
    const tpl = read(path.join(P.templates, '关卡表.md')).replace(/第 N 章/g, `第 ${n} 章`).replace(/N-(\d)/g, `${n}-$1`);
    const pack = [
      `# 萌趣格斗 · 第 ${n} 章规划资料包`,
      '\n---\n# 全篇大纲\n', read(P.outline),
      '\n---\n', read(P.ledger),
      '\n---\n', referenceLists(),
      '\n---\n# 关卡表模板（注释里有填写说明）\n', tpl,
      prev ? `\n---\n# 上一章（第 ${n - 1} 章）定稿\n\n${prev}` : '',
    ].join('\n');
    fs.mkdirSync(P.send, { recursive: true });
    const packFile = path.join(P.send, `ch${n}-plan-pack.txt`);
    write(packFile, pack);
    const prompt = `使用「${read(path.join(P.skill, '名称.txt')).trim()}」技能。这次先不写剧本，而是规划关卡表。附件是第 ${n} 章规划资料包。\n` +
      `请根据全篇大纲里第 ${n} 章的要点，把这一章拆成 10–12 关，写成完整的关卡表：\n` +
      `- 严格按模板格式，每关写类型、场景（id）、出场（简称）、承接、节拍（每关 2–4 条，一句话说清这一关必须发生什么）、钩子、线索，战斗关写战斗意图；\n` +
      `- 整章只有一条主线（大纲里写的核心问题或目标），每一关都要推动它；每关从上一关结尾接着发生（写进「承接」），结尾留一个引出下一关的钩子（写进「钩子」）；不写和主线无关的偶遇；\n` +
      `- 节奏参考：约 4 个剧情关、4–5 个战斗关、1 个 Boss 关、1 个章末关，可按大纲调整；\n` +
      `- 新登场的乐队控制在 1–2 支、人数宁少勿多，不为刷脸让角色出场；已经登场的人要有变化和后续；\n` +
      `- 每个战斗关都要由主线冲突逼出来，有“为什么非打不可”的理由；同屏不超过 6 人；每支乐队一次只出一部分人；\n` +
      `- 不要写台词。\n` +
      `整份关卡表放在一个代码块里，代码块第一行必须是「# 第 ${n} 章 · 关卡表」，代码块外不要写别的。`;
    write(path.join(P.send, '提示词.txt'), prompt); clipSet(prompt); reveal(packFile);
    st.planChat = true; saveState(st);
    banner(`第 ${n} 章 · 先让 Gemini 规划关卡表`);
    steps([
      C.b('Gemini 开一个新对话') + '（这一章之后写剧本也用这个对话）',
      `把 ${rel(packFile)} 拖进去（资源管理器已选中它）`,
      '粘贴（剪贴板里已经是提示词）并发送',
      '复制它输出的代码块 → 双击「剧情-接收.bat」',
    ]);
    return;
  }
  const ids = plan.map(p => p.id);
  const holes = planHoles(plan);
  if (holes.length) {
    banner(`第 ${n} 章关卡表还没填完`);
    for (const h of holes) console.log('  ' + C.r('✗ ') + h);
    steps([`打开 ${rel(planFile)} 补全`, '再双击「剧情-发送.bat」']);
    reveal(planFile); return;
  }

  // 3. 先确认你改过的定稿没有格式问题
  const errs = checkFinals(n, ids);
  if (errs) { banner('定稿里有格式问题'); console.log('  请先改好上面标 ✗ 的地方，再双击「剧情-发送.bat」。'); return; }

  const added = ensureCards(n);
  if (added.length) console.log(C.g(`  角色卡已补上：${added.join('、')}（${rel(path.join(P.ch(n), '角色卡.md'))}，可以补称呼和语气）`));

  const pending = ids.filter(id => !fs.existsSync(rawFile(n, id)));
  const doneIds = ids.filter(id => fs.existsSync(rawFile(n, id)));
  fs.mkdirSync(P.send, { recursive: true });

  if (pending.length) {
    const batch = pending.slice(0, BATCH);
    const range = batch.length > 1 ? `${batch[0]} 到 ${batch.at(-1)}` : batch[0];
    st.lastBatch = batch; st.ledgerDone = false; saveState(st);
    if (!doneIds.length && st.planChat) {
      // 关卡表是在这个对话里规划的：不用开新对话，把定稿关卡表和角色卡直接贴进去
      const prompt = `关卡表已经定稿（下面是我修改后的版本，以它为准），另附本章角色卡。请写 ${range}（共 ${batch.length} 关），按剧本格式整批输出在一个代码块里，代码块外不要写别的。\n\n` +
        '```\n' + read(planFile).replace(/<!--[\s\S]*?-->/g, '').trim() + '\n```\n\n```\n' + read(path.join(P.ch(n), '角色卡.md')).trim() + '\n```';
      write(path.join(P.send, '提示词.txt'), prompt); clipSet(prompt);
      banner(`第 ${n} 章 · 第 1 批：${range}`);
      steps([
        C.b('回到规划关卡表的那个 Gemini 对话') + '（不用开新的，也不用上传文件）',
        '粘贴（剪贴板里是提示词，已附上你定稿的关卡表和角色卡）并发送',
        '等它写完 → 点代码块右上角的「复制」→ 双击「剧情-接收.bat」',
      ]);
    } else if (!doneIds.length) {
      // 本章第一批：开新对话 + 上传资料包
      const prev = n > 1 ? planOf(n - 1).map(p => read(finalFile(n - 1, p.id))).filter(Boolean).join('\n') : '';
      const pack = [
        `# 萌趣格斗 · 第 ${n} 章资料包`,
        '本文件包含：全篇大纲、连续性账本、本章角色卡、本章关卡表' + (prev ? '、上一章定稿' : '') + '。以本文件为准。',
        '\n---\n# 全篇大纲\n', read(P.outline),
        '\n---\n', read(P.ledger),
        '\n---\n', read(path.join(P.ch(n), '角色卡.md')),
        '\n---\n', read(planFile),
        prev ? `\n---\n# 上一章（第 ${n - 1} 章）定稿\n\n${prev}` : '',
      ].join('\n');
      const packFile = path.join(P.send, `ch${n}-pack.txt`);
      write(packFile, pack);
      const prompt = `使用「${read(path.join(P.skill, '名称.txt')).trim()}」技能。附件是第 ${n} 章资料包。请先通读，然后写 ${range}（共 ${batch.length} 关）。按剧本格式整批输出在一个代码块里，代码块外不要写别的。`;
      write(path.join(P.send, '提示词.txt'), prompt); clipSet(prompt); reveal(packFile);
      banner(`第 ${n} 章 · 第 1 批：${range}`);
      steps([
        C.b('Gemini 开一个新对话') + '（每章一个对话，后面几批都在这个对话里）',
        `把 ${rel(packFile)} 拖进去（资源管理器已选中它）`,
        '粘贴（剪贴板里已经是提示词）并发送',
        '等它写完 → 点代码块右上角的「复制」→ 双击「剧情-接收.bat」',
      ]);
    } else {
      // 后续批次：同一个对话，附上你改过的定稿
      const edited = editedFinals(n, doneIds, st);
      markSent(n, edited, st); saveState(st);
      let prompt = `继续写 ${range}（共 ${batch.length} 关），格式同前，整批放在一个代码块里。`;
      if (edited.length) prompt = `下面是我修改后的定稿（${edited.join('、')}），请以它们为准，忘掉你原来写的版本，后面的剧情要和定稿衔接：\n\n` +
        edited.map(id => '```\n' + read(finalFile(n, id)).trim() + '\n```').join('\n\n') + '\n\n' + prompt;
      write(path.join(P.send, '提示词.txt'), prompt); clipSet(prompt);
      banner(`第 ${n} 章 · 继续：${range}`);
      steps([
        C.b('回到本章那个 Gemini 对话') + '（不用开新的，也不用上传文件）',
        '粘贴（剪贴板里已经是提示词' + (edited.length ? `，附带了你改过的 ${edited.length} 关定稿` : '') + '）并发送',
        '等它写完 → 点代码块右上角的「复制」→ 双击「剧情-接收.bat」',
      ]);
    }
    return;
  }

  // 4. 全部写完：先确认每关都有定稿且你已改完，再更新账本
  if (!st.ledgerDone) {
    const edited = editedFinals(n, ids, st);
    markSent(n, edited, st); saveState(st);
    let prompt = `第 ${n} 章已全部定稿。请根据定稿更新连续性账本：输出更新后的【完整】账本，放在一个代码块里，代码块第一行必须是「# 账本」。保留原有结构，新增本章确立的事实、角色所在、谁知道什么、线索的埋 / 揭（写清编号和关卡）、复制体真相表的变化、未回收的问题。`;
    if (edited.length) prompt = `下面是我修改后的定稿（${edited.join('、')}），以它们为准：\n\n` + edited.map(id => '```\n' + read(finalFile(n, id)).trim() + '\n```').join('\n\n') + '\n\n' + prompt;
    prompt += `\n\n当前账本：\n\`\`\`\n${read(P.ledger).trim()}\n\`\`\``;
    write(path.join(P.send, '提示词.txt'), prompt); clipSet(prompt);
    banner(`第 ${n} 章写完了：更新账本`);
    console.log('  （确认每一关的定稿都已经改到满意，再做这一步）');
    steps([
      C.b('回到本章那个 Gemini 对话'),
      '粘贴（剪贴板里是“更新账本”的提示词）并发送',
      '复制它输出的代码块 → 双击「剧情-接收.bat」，确认改动后写入',
    ]);
    return;
  }

  // 5. 进入下一章
  const next = n + 1;
  st.chapter = next; st.ledgerDone = false; st.lastBatch = []; st.sent = {}; st.planChat = false; saveState(st);
  banner(`第 ${n} 章完成 🎉 进入第 ${next} 章`);
  console.log(`  告诉 Claude「第 ${n} 章导入」即可做进游戏。`);
  if (!planOf(next).length) {
    const f = path.join(P.ch(next), '关卡表.md');
    if (!fs.existsSync(f)) write(f, read(path.join(P.templates, '关卡表.md')).replace(/第 N 章/g, `第 ${next} 章`).replace(/N-(\d)/g, `${next}-$1`));
    steps([`填 ${rel(f)}（模板已生成）`, '再双击「剧情-发送.bat」，会提示你开新对话']);
    reveal(f);
  } else console.log('  下一章关卡表已就绪，再双击一次「剧情-发送.bat」。');
}

/* ---------------- recv ---------------- */
function stripFences(t: string) {
  const m = [...t.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
  return m.length ? m.map(x => x[1]).join('\n') : t;
}
function lineDiff(a: string, b: string) {
  const A = a.split('\n'), B = b.split('\n');
  const sa = new Set(A), sb = new Set(B);
  return { add: B.filter(l => l.trim() && !sa.has(l)), del: A.filter(l => l.trim() && !sb.has(l)) };
}

async function recv() {
  const st = loadState();
  const n = st.chapter;
  let text: string;
  try { text = clipGet(); } catch (e) { console.log(C.r('读取剪贴板失败：' + (e as Error).message)); return; }
  const body = stripFences(text).trim();
  if (!body) { banner('剪贴板是空的'); console.log('  请先在 Gemini 里点代码块右上角的「复制」。'); return; }

  // 关卡表
  if (/^#\s*第\s*\d+\s*章\s*·?\s*关卡表/.test(body)) {
    const plan = parsePlan(body), holes = planHoles(plan);
    banner(`收到第 ${n} 章关卡表：${plan.length} 关`);
    for (const p of plan) console.log(`  ${p.id} [${p.type}] ${p.title}　${p.cast.join('、')}　节拍 ${p.beats.length} 条`);
    for (const h of holes) console.log('  ' + C.r('✗ ') + h);
    const f = path.join(P.ch(n), '关卡表.md');
    if (await ask('\n  写入关卡表？[Y/n] ')) {
      if (read(f)) write(path.join(S, 'raw', `ch${n}`, `关卡表-${Date.now()}.md`), read(f));
      write(f, body + '\n');
      st.planChat = true; saveState(st);
      banner('已写入');
      steps([`打开 ${rel(f)} 按你的想法修改${holes.length ? '（先补上面标 ✗ 的地方）' : ''}`, '改完双击「剧情-发送.bat」，开始写剧本（还在同一个对话里）']);
      reveal(f);
    } else console.log('  没有写入。可以在 Gemini 里让它改，再复制、接收一次。');
    return;
  }

  // 账本
  if (/^#\s*账本/.test(body)) {
    const old = read(P.ledger), d = lineDiff(old, body + '\n');
    banner(`账本更新（第 ${n} 章）`);
    for (const l of d.del) console.log(C.r('  - ' + l));
    for (const l of d.add) console.log(C.g('  + ' + l));
    if (!d.add.length && !d.del.length) console.log('  （没有变化）');
    if (await ask('\n  写入账本？[Y/n] ')) {
      write(path.join(S, 'raw', `账本-第${n}章前.md`), old);
      write(P.ledger, body + '\n');
      st.ledgerDone = true; saveState(st);
      console.log(C.g('  已写入。旧账本备份在 story/raw/。') + ' 下一步：双击「剧情-发送.bat」进入下一章。');
    } else console.log('  没有写入。可以在 Gemini 里让它改，再复制、接收一次。');
    return;
  }

  const parts = splitStages(body);
  if (!parts.length) {
    banner('没找到剧本');
    console.log('  剪贴板里没有「## 1-03 ……」这样的关卡标题。请确认复制的是 Gemini 的代码块。');
    return;
  }
  const plan = new Map(planOf(n).map(p => [p.id, p]));
  const failed: { id: string; issues: Issue[] }[] = [];
  const kept: string[] = [];
  banner(`收到 ${parts.length} 关：${parts.map(p => p.id).join(' ')}`);
  for (const p of parts) {
    if (!p.id.startsWith(`${n}-`) || !plan.has(p.id)) { console.log(C.y(`  ${p.id} 不在第 ${n} 章关卡表里，跳过`)); continue; }
    const rf = rawFile(n, p.id), ff = finalFile(n, p.id);
    const oldRaw = read(rf);
    if (oldRaw && norm(oldRaw) !== norm(p.text)) {
      let v = 1; while (fs.existsSync(path.join(P.raw(n), `${p.id}.v${v}.md`))) v++;
      fs.renameSync(rf, path.join(P.raw(n), `${p.id}.v${v}.md`));
    }
    write(rf, p.text);
    if (!fs.existsSync(ff) || norm(read(ff)) === norm(oldRaw)) write(ff, p.text);
    else { write(path.join(P.ch(n), `${p.id}.新稿.md`), p.text); kept.push(p.id); }
    const s = checkStage(p.text, plan.get(p.id));
    printIssues(p.id, s.issues);
    if (s.issues.some(x => x.level === 'error')) failed.push({ id: p.id, issues: s.issues.filter(x => x.level === 'error') });
  }
  const missing = st.lastBatch.filter(id => !fs.existsSync(rawFile(n, id)));
  if (kept.length) console.log(C.y(`  ${kept.join('、')} 你已经改过定稿，新稿另存为「编号.新稿.md」，请自己挑着合并后删掉它。`));

  if (failed.length || missing.length) {
    let prompt = '下面几关没有通过格式检查，请只重写这几关（每关完整输出），整批放在一个代码块里：\n';
    for (const f of failed) prompt += `\n${f.id}：\n` + f.issues.map(x => `- 第 ${x.line} 行：${x.msg}`).join('\n') + '\n';
    if (missing.length) prompt += `\n另外缺少：${missing.join('、')}，请补写。\n`;
    write(path.join(P.send, '提示词.txt'), prompt); clipSet(prompt);
    banner('需要 Gemini 修正');
    steps(['回到同一个 Gemini 对话，粘贴（剪贴板里已经是修正提示词）并发送', '复制它的代码块 → 再双击「剧情-接收.bat」']);
    return;
  }
  banner('通过 ✓');
  steps([
    `去 ${rel(P.ch(n))}/ 修改这几关的定稿（原稿留在 story/raw/ 作对照，不用动）`,
    '改完双击「剧情-发送.bat」，继续下一批',
  ]);
  reveal(finalFile(n, parts[0].id));
}

/* ---------------- 总览（给人读的排版） ---------------- */
function overview(n: number): string {
  const planText = read(path.join(P.ch(n), '关卡表.md')).replace(/<!--[\s\S]*?-->/g, '');
  const beatText = new Map<string, string>();
  for (const m of planText.matchAll(/^\s*-\s*(B\d+-\d+[a-z])\s*[:：]\s*(.+)$/gm)) beatText.set(m[1], m[2].trim());
  const plan = planOf(n);
  const count = (t: string) => plan.filter(p => p.type === t).length;
  const out: string[] = [`# 第 ${n} 章 · 剧本总览`, '',
    `> 共 ${plan.length} 关：` + TYPES.filter(t => count(t)).map(t => `${t} ${count(t)}`).join(' · ') + `　（由 npm run story -- overview ${n} 生成，改剧本请改各关定稿）`, '',
    '## 目录', '', ...plan.map(p => `- ${p.id} ${p.title || '（未命名）'}〔${p.type}〕`), ''];
  for (const p of plan) {
    const t = read(finalFile(n, p.id));
    if (!t) { out.push(`---`, '', `## ${p.id} ${p.title}〔${p.type}〕`, '', '*（还没有定稿）*', ''); continue; }
    const head = t.match(/^##\s+(\d+-\d+)\s*(.*?)\s*[\[［](.+?)[\]］]/m);
    out.push('---', '', `## ${p.id} ${head?.[2] || p.title}〔${head?.[3] ?? p.type}〕`, '');
    const meta: string[] = [];
    const body: string[] = [];
    for (const raw of t.split('\n')) {
      const l = raw.trim();
      if (!l || l.startsWith('## ') || l.startsWith('//')) continue;
      const at = l.match(/^@(\S+)\s*(.*)$/);
      if (at) {
        const [k, v] = [at[1], at[2].trim().replace(/\\\|/g, '|')];
        if (k === '场景') meta.push(`**场景**　${stageByKey(v)?.name ?? v}`);
        else if (k === '开场') meta.push(`**开场**　${v.replace(/[(（](.+?)[)）]/g, '（$1）').split(/\s+/).join('、')}`);
        else if (k === '线索') meta.push(`**线索**　${v}`);
        else if (k === '节拍') meta.push(`**节拍**　` + v.split(/\s+/).map(b => beatText.has(b) ? `${b}（${beatText.get(b)}）` : b).join('；'));
        else if (k === '战斗') body.push(`> ⚔ **战斗**　${v.split('|').map(x => x.trim()).join('　｜　')}`);
        continue;
      }
      if (l.startsWith('---')) { body.push('', '**— 战后 —**'); continue; }
      if (l.startsWith('>')) { body.push(`*〔${l.slice(1).trim()}〕*`); continue; }
      const d = l.match(/^([^:：\[［(（]+?)\s*(?:[(（](.+?)[)）])?\s*(?:[\[［](.+?)[\]］])?\s*[:：]\s*(.*)$/);
      if (d) {
        const [, who, tag, pose, line] = d;
        const deco = (tag ? `（${tag}）` : '') + (pose ? `〈${pose}〉` : '');
        body.push(who === '旁白' ? `*${line}*` : `**${who}**${deco}　${line}`);
        continue;
      }
      body.push(l);
    }
    // 每行之间空一行：Markdown 预览里相邻行会被并成一段
    out.push(meta.join('<br>'), '', ...body.flatMap(x => [x, '']));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

/* ---------------- 入口 ---------------- */
const [cmd, arg] = process.argv.slice(2);
const main = async () => {
  if (cmd === 'seal') { for (const id of process.argv.slice(3).filter(x => /^\d+-\d+$/.test(x))) seal(id); }
  else if (cmd === 'rehearse') rehearseArg(arg ?? '1', process.argv.includes('--issues'));
  else if (cmd === 'send') await send();
  else if (cmd === 'recv') await recv();
  else if (cmd === 'check') {
    const file = arg && fs.existsSync(arg) ? arg : '';
    if (file) {
      const s = checkStage(read(file));
      printIssues(s.id || path.basename(file), s.issues);
      console.log(s.issues.some(x => x.level === 'error') ? C.r('有错误') : C.g('通过'));
      process.exitCode = s.issues.some(x => x.level === 'error') ? 1 : 0;
    } else {
      const n = Number(arg) || loadState().chapter;
      const e = checkFinals(n, planOf(n).map(p => p.id));
      console.log(e ? C.r(`第 ${n} 章定稿有 ${e} 处错误`) : C.g(`第 ${n} 章定稿通过`));
      process.exitCode = e ? 1 : 0;
    }
  } else if (cmd === 'cards') {
    const n = Number(arg) || loadState().chapter;
    const a = ensureCards(n);
    console.log(a.length ? `已补上：${a.join('、')}` : '角色卡已是最新');
  } else if (cmd === 'overview') {
    const n = Number(arg) || loadState().chapter;
    const f = path.join(P.ch(n), `第${n}章-总览.md`);
    write(f, overview(n));
    console.log(C.g(`已生成 ${rel(f)}`)); reveal(f);
  } else console.log('用法：story.ts send | recv | check [章号或文件] | cards [章号] | overview [章号] | rehearse 章号或编号 [--issues] | seal 编号…');
};
main().catch(e => { console.error(C.r(String(e?.stack ?? e))); process.exitCode = 1; });
