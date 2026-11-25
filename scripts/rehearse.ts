/* 剧情排练：npm run story -- rehearse 3（整章）/ rehearse 3-01（一关）/ 加 --issues 只看问题。
 * 在后台按指令把整关走一遍，每次有人上下台、走位、换人说话时打出一行舞台状态：
 *   L12 ▶素世   [左]睦→  [中左]祥子→  [中]素世←
 * 走位、让位、铺开、自动朝向都调用 src/story/stage.ts，和游戏里的演出是同一份规则。
 * 自动标出：✗ 错误（演不出来）  ! 要看一眼  △ 可能是问题。 */

import fs from 'node:fs';
import path from 'node:path';
import { parseScript, type Cmd } from '../src/story/parse.ts';
import { SHORT_NAMES } from '../src/data/shortNames.ts';
import { SLOT_X, ahead, block, enter, openStage, reaim, type Body } from '../src/story/stage.ts';
import { PROPS, PROP_VERBS } from '../src/story/props.ts';
import { FX_NAMES, FX_NEED_ACTOR, FX_NEED_ARG, FX_LASTING } from '../src/story/fx.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

interface Actor extends Body { nightmare: boolean; phantom: boolean; enteredAt: number; spoke: boolean; away?: boolean }
type Level = '✗' | '!' | '△';
interface Issue { level: Level; line: number; msg: string }
interface Src { cmd: Cmd; line: number; post: boolean }

const C = { b: (s: string) => `\x1b[1m${s}\x1b[0m`, d: (s: string) => `\x1b[2m${s}\x1b[0m`, y: (s: string) => `\x1b[33m${s}\x1b[0m`, r: (s: string) => `\x1b[31m${s}\x1b[0m`, c: (s: string) => `\x1b[36m${s}\x1b[0m`, g: (s: string) => `\x1b[32m${s}\x1b[0m` };
const SHORTS = Object.values(SHORT_NAMES).filter(Boolean).sort((a, b) => b.length - a.length);
const OFFSTAGE_OK = new Set(['旁白', '织萌', '？？？']);

/** 定稿逐行拆成指令，带上源文件行号。 */
function sources(text: string): Src[] {
  const out: Src[] = [];
  let post = false;
  text.replace(/\r\n/g, '\n').split('\n').forEach((raw, i) => {
    const l = raw.trim();
    if (l.startsWith('---')) { post = true; return; }
    if (!l || l.startsWith('#') || l.startsWith('@')) return;
    for (const cmd of parseScript(l).pre) out.push({ cmd, line: i + 1, post });
  });
  return out;
}

const slotOf = (x: number) => {
  for (const [k, v] of Object.entries(SLOT_X)) if (Math.abs(v - x) < 25) return k;
  return String(Math.round(x));
};
const arrow = (a: Actor) => a.face > 0 ? '→' : '←';
function stateLine(cast: Actor[], speaker?: string): string {
  return [...cast].sort((p, q) => p.x - q.x).map(a => {
    const nm = a.name === speaker ? C.b(a.name) : a.name;
    return `[${slotOf(a.x)}]${nm}${arrow(a)}${a.lock ? '*' : ''}${a.pose === 'down' ? '(倒)' : a.pose === 'block' ? '(防)' : ''}${a.revealed ? '(背面)' : ''}`;
  }).join('  ') || C.d('（空台）');
}

/* 台词 / 旁白里写了动作、指令里却没有：关键词 → 能对上的指令。 */
const CUES: { re: RegExp; verbs: string[]; label: string }[] = [
  { re: /转身|转过身|背过身|回过身|回头|背对/, verbs: ['转身', '背对', '面向'], label: '转身' },
  { re: /冲上|冲向|冲过去|扑向|扑上|扑过来|逼近|上前|走近|凑近|靠了过来|挡在.{0,4}(身前|面前)/, verbs: ['靠近', '走到', '走入'], label: '上前' },
  { re: /倒下|倒在|倒地|跪倒|瘫倒|摔倒|跌坐|跪了下/, verbs: ['倒下', '换'], label: '倒下' },
  { re: /后退|退后|退了.步|连退/, verbs: ['后退', '走到'], label: '后退' },
  { re: /离开|走开|跑开|退下|转身离去|消散|消失在/, verbs: ['退场', '倒下', '消散'], label: '离开' },
  { re: /走进|走来|走了进来|赶来|赶到|出现在|现身|跑了过来|冲了进来/, verbs: ['走入'], label: '登场' },
];

/* 文字里写了特效能演的东西，前后却没有对应的「特效」（或者它已经开着）：只作提示 △。 */
const FX_CUES: { re: RegExp; fx: string }[] = [
  { re: /裂缝|裂隙|撕裂.{0,2}空间|空间.{0,2}撕裂/, fx: '裂隙' },
  { re: /法阵/, fx: '法阵' },
  { re: /屏障|护盾/, fx: '屏障' },
  { re: /黑雾/, fx: '黑雾' },
  { re: /(光点|星光|光芒).{0,8}(流失|抽干|抽取|掠夺|流走)|(抽干|抽取|掠夺).{0,6}(星光|光芒)/, fx: '星光流失' },
];

export function rehearse(file: string, onlyIssues: boolean): Issue[] {
  const text = fs.readFileSync(file, 'utf8');
  const s = parseScript(text);
  const src = sources(text);
  const issues: Issue[] = [];
  const out: string[] = [];
  const flag = (level: Level, line: number, msg: string) => { issues.push({ level, line, msg }); out.push(`    ${level === '✗' ? C.r(level) : level === '!' ? C.y(level) : C.d(level)} L${line} ${msg}`); };

  let actors: Actor[] = [];
  const cast = () => actors.filter(a => !a.leaving);
  const find = (n: string) => actors.find(a => a.name === n && !a.leaving);
  let warm = true; // 战前段：游戏里战后会以「跳过」方式重放一遍，用于战后开场站位
  const turnTo = (a: Actor, dir: number) => { if (a.face === dir || a.lock || a.revealed || a.leaving || a.pose === 'down') return; a.face = dir; };
  const place = (name: string, slot: string, line: number): Actor => {
    const x = SLOT_X[slot] ?? 640;
    const a: Actor = { name, x, to: x, face: x < 640 ? 1 : -1, pose: 'idle', leaving: false, revealed: false, lock: false, flip: null, nightmare: name.startsWith('梦魇'), phantom: name === '墨提斯', enteredAt: line, spoke: false };
    actors = actors.filter(o => o.name !== name).concat(a);
    return a;
  };
  /** 等所有人走到位、翻面做完（settleActors），然后背对全场的人转向最近的人。 */
  const settle = () => {
    for (const a of actors) { a.x = a.to; if (a.flip) { if (a.flip.to === 'back') a.revealed = true; else a.face = a.flip.to; a.flip = null; } }
    actors = actors.filter(a => !a.leaving);
    reaim(cast(), turnTo);
  };
  let printed = '';
  const show = (tag: string, speaker?: string) => {
    const st = stateLine(cast(), speaker);
    if (st === printed && !speaker) return;
    printed = st;
    if (!onlyIssues) out.push(`  ${tag.padEnd(14)} ${st}`);
  };

  for (const p of s.opening) place(p.who, p.slot, 0);
  openStage(actors);
  out.push(C.c(`\n${s.id} ${s.title} [${s.type}]  @${s.scene}`));
  show('开场');

  let lastSpeaker: string | null = null;
  let spokeAny = false;
  /** 开着的持续特效：名字 → 开在第几行。 */
  const fxOn = new Map<string, number>();
  let listenAway = 0;
  let section = false;
  const linesOf = (from: number, to: number) => src.slice(Math.max(0, from), Math.min(src.length, to));

  for (let i = 0; i < src.length; i++) {
    const { cmd: c, line, post } = src[i];
    if (post && !section) {
      section = true; warm = false;
      out.push(C.d('  ———— 战斗 ————'));
      lastSpeaker = null; printed = ''; spokeAny = false; // 持续特效会随战前段重放带到战后（theatre 的 warm），不清
      show('战后');
    }
    if (c.k === 'act') {
      const prev = src[i - 1]?.cmd;
      if (c.verb === '走入') {
        if (find(c.who)) flag('!', line, `${c.who} 已经在台上，又「走入」：会先消失再从台外走进来`);
        const a = place(c.who, c.arg ?? '中', line);
        enter(cast(), a, c.arg);
        if (a.phantom) a.x = a.to; // 墨提斯在站位上成形，不是从台外走进来
      } else {
        const a = find(c.who);
        if (!a) { flag('✗', line, `${c.who} 不在台上，「${c.verb}」演不出来`); continue; }
        const target = (c.verb === '靠近' || c.verb === '背对' || c.verb === '面向') && c.arg ? find(c.arg) : undefined;
        if ((c.verb === '靠近' || c.verb === '面向' || (c.verb === '背对' && c.arg)) && !target) flag('✗', line, `${c.who} ${c.verb} ${c.arg}：${c.arg} 不在台上`);
        if (c.verb === '走到' && SLOT_X[c.arg ?? ''] !== undefined && Math.abs(SLOT_X[c.arg!] - a.to) < 1) flag('△', line, `${c.who} 走到 ${c.arg}：已经站在那里，原地不动`);
        if ((c.verb === '退场' || c.verb === '消散') && !a.spoke && !a.nightmare && !a.phantom && a.enteredAt > 0) flag('△', line, `${c.who} 上台（L${a.enteredAt}）后一句没说就${c.verb}`);
        if (c.verb === '虚化' && a.phantom) flag('△', line, '墨提斯本来就是半透明的');
        const turn = c.verb === '退场' && a.phantom && !c.arg ? (a.leaving = true, null) : block(cast(), a, c.verb, c.arg, { target, afterEnter: prev?.k === 'act' && prev.who === c.who && prev.verb === '走入', instant: !spokeAny });
        if (turn) { a.face = turn.from; a.flip = { to: turn.to }; }
        // 「背对」是有意的背身（护着身后的人、赌气），背着回应身后的人只作提示。
        a.away = c.verb === '背对' ? true : c.verb === '转身' ? false : a.away;
        switch (c.verb) {
          case '倒下': a.pose = 'down'; if (a.nightmare) a.leaving = true; break;
          case '起身': a.pose = 'idle'; break;
          case '换': { const p = ({ 平常: 'idle', 防备: 'block', 倒地: 'down' } as const)[c.arg as '平常']; if (p) a.pose = p; break; }
          case '复制体翻面': a.flip = { to: 'back' }; break;
        }
      }
      // 游戏里：连着的走位指令一起出发，最后一条之后才等大家站定再转向。
      if (src[i + 1]?.cmd.k !== 'act' || src[i + 1]?.post !== post) {
        settle();
        const tag = `L${line} ${c.who}${c.verb}${c.arg ? ' ' + c.arg : ''}`;
        show(tag);
        const list = cast().sort((p, q) => p.x - q.x);
        for (let k = 1; k < list.length; k++) if (list[k].x - list[k - 1].x < 100) flag('!', line, `${list[k - 1].name} 和 ${list[k].name} 几乎叠在一起（相距 ${Math.round(list[k].x - list[k - 1].x)}）`);
      }
      continue;
    }
    if (c.k === 'stage') continue;
    if (c.k === 'fx') {
      const name = c.verb === '收' ? c.arg ?? '' : c.verb;
      if (c.verb === '收') {
        if (!FX_LASTING.includes(name)) flag('✗', line, `「特效 收」后面要写 ${FX_LASTING.join(' / ')}`);
        else if (!fxOn.has(name)) flag('!', line, `收掉「${name}」，但它没有开着`);
        fxOn.delete(name);
      } else if (!FX_NAMES.includes(name)) flag('✗', line, `没有叫「${name}」的特效（可用：${FX_NAMES.join('、')}）`);
      else {
        if (FX_NEED_ARG.includes(name) && !c.arg) flag('✗', line, `特效「${name}」后面要写对象`);
        else if (c.arg && SLOT_X[c.arg] === undefined && !find(c.arg)) flag('✗', line, `特效「${name}」的对象 ${c.arg} 不在台上`);
        else if (c.arg && FX_NEED_ACTOR.includes(name) && SLOT_X[c.arg] !== undefined) flag('✗', line, `特效「${name}」要写角色，不能写位置`);
        if (FX_LASTING.includes(name)) fxOn.set(name, line);
      }
      if (!onlyIssues) out.push(`  ${('L' + line + ' 特效').padEnd(14)} ${c.verb}${c.arg ? ' ' + c.arg : ''}`);
      continue;
    }
    if (c.k === 'prop') {
      if (!PROPS[c.name]) flag('✗', line, `没有叫「${c.name}」的道具（可用：${Object.keys(PROPS).join('、')}）`);
      else if (!PROP_VERBS.includes(c.verb)) flag('✗', line, `道具动作「${c.verb}」不认识（可用：${PROP_VERBS.join('、')}）`);
      else if ((c.verb === '随' || ((c.verb === '摆' || c.verb === '落') && c.arg && SLOT_X[c.arg] === undefined && !PROPS[c.arg])) && c.arg && !find(c.arg)) flag('✗', line, `${c.name} ${c.verb} ${c.arg}：${c.arg} 不在台上`);
      if (!onlyIssues) out.push(`  ${('L' + line + ' 道具').padEnd(14)} ${c.name} ${c.verb}${c.arg ? ' ' + c.arg : ''}`);
      continue;
    }

    // 台词
    if (c.who && !OFFSTAGE_OK.has(c.who) && c.tag !== '广播' && c.tag !== '心声' && !find(c.who)) {
      flag(c.tag === '伪装' ? '✗' : '!', line, `${c.who} 不在台上却在说话${c.tag ? `（${c.tag}）` : ''}：「${c.text.slice(0, 14)}…」`);
    }
    const a = c.who && !c.tag ? find(c.who) : undefined;
    if (c.who) spokeAny = true;
    if (a) {
      a.spoke = true;
      const prevA = lastSpeaker && lastSpeaker !== a.name ? find(lastSpeaker) : undefined;
      if (prevA && !ahead(a, prevA) && Math.abs(prevA.x - a.x) > 1) turnTo(a, Math.sign(prevA.x - a.x));
      if (c.pose && c.pose !== 'hurt' && c.pose !== 'jump') a.pose = c.pose;
      const others = cast().filter(o => o !== a && Math.abs(o.x - a.x) > 1);
      if (!a.lock) a.away = false;
      // 台词里点名叫了身前的人（「虹夏，快把那块石头收好」）：她是在对那个人说，不算背对上一位说话的人。
      const named = cast().some(o => o !== a && ahead(a, o) && c.text.includes(o.name));
      if (prevA && !ahead(a, prevA) && named) { /* 对着点名的人说 */ }
      else if (prevA && !ahead(a, prevA) && a.lock && a.away) flag('△', line, `${a.name} 背对着回应身后的 ${prevA.name}（写了「背对」，有意为之）`);
      else if (prevA && !ahead(a, prevA)) flag('!', line, `${a.name} 背对着在回应的 ${prevA.name}${a.lock ? '（转身锁着朝向）' : a.pose === 'down' ? '（倒地不转身）' : ''}`);
      else if (others.length && !others.some(o => ahead(a, o))) flag('△', line, `${a.name} 身前没人，对着空处说话`);
      if (prevA && !ahead(prevA, a) && prevA.pose !== 'down' && !prevA.revealed) {
        // 夹在中间的人只能朝一边：身后的人接话时她还背着，轮到她说时才转。整关数一下，--issues 时合成一行。
        listenAway++;
        if (!onlyIssues) flag('△', line, `${prevA.name} 背对着跟她说话的 ${a.name}`);
      }
      const changed = lastSpeaker !== a.name;
      lastSpeaker = a.name;
      if (changed) show(`L${line} ▶${a.name}`, a.name);
    }
    // 台词 / 旁白里的动作词
    if (!c.who || c.tag === '心声' || !c.who) {
      for (const cue of CUES) {
        const m = c.text.match(cue.re);
        if (!m) continue;
        // 否定（「一步也没有离开过」）和不是人的东西（「木门出现在眼前」）不算。
        if (/(没有|没|不|未|别)[^，。！？]{0,3}$/.test(c.text.slice(0, m.index))) continue;
        if (c.text[m.index! + m[0].length] === '的' && cue.label !== '转身') continue;
        if (cue.label === '登场' && !SHORTS.some(n => c.text.includes(n)) && !/身影|人影|梦魇|有人|少女/.test(c.text)) continue;
        // 主语：动作词前面只出现一个人名时才认定是她（「祥子与初华……却见熟悉的身影正背对」这种认不出来，就不限定是谁）。
        const before = SHORTS.filter(n => c.text.slice(0, m.index).includes(n));
        const subj = SHORTS.find(n => c.text.includes(n + m[0])) ?? (before.length === 1 ? before[0] : undefined);
        // 前后有这类指令就算对上（主语靠字面猜不准：「祥子瞥向倒地的睦」里倒地的是睦）。
        const near = linesOf(i - 5, i + 4).map(x => x.cmd).filter(x => x.k === 'act' && cue.verbs.includes(x.verb));
        void subj;
        if (!near.length) flag('!', line, `${c.who ? c.who + '(心声)' : '旁白'}写了「${m[0]}」${subj ? `（${subj}）` : ''}，前后没有「${cue.verbs[0]}」指令：「${c.text.slice(0, 18)}…」`);
      }
    }
  }
  void warm;
  // 文字里写到的特效
  src.forEach(({ cmd: c, line }, i) => {
    if (c.k !== 'line') return;
    for (const cue of FX_CUES) {
      const m = c.text.match(cue.re);
      if (!m) continue;
      // 前后 5 条指令里有这个特效（或者它之前已经开着、之后才收），就算对上了。
      const opened = src.slice(0, i + 6).some(x => x.cmd.k === 'fx' && x.cmd.verb === cue.fx);
      const closed = src.slice(0, i).some(x => x.cmd.k === 'fx' && x.cmd.verb === '收' && x.cmd.arg === cue.fx && src.slice(0, i).findLastIndex(y => y.cmd.k === 'fx' && y.cmd.verb === cue.fx) < src.indexOf(x));
      const near = src.slice(Math.max(0, i - 5), i + 6).some(x => x.cmd.k === 'fx' && (x.cmd.verb === cue.fx || x.cmd.arg === cue.fx));
      if (!near && (!opened || closed)) flag('△', line, `写了「${m[0]}」，可以用「特效 ${cue.fx}」：「${c.text.slice(0, 18)}…」`);
    }
  });
  if (onlyIssues && listenAway) { issues.push({ level: '△', line: 0, msg: '' }); out.push(C.d(`    △ 听的人背对说话人 ×${listenAway}（多半是夹在中间的人朝着另一边，轮到她说时会转过来）`)); }
  if (!onlyIssues || issues.length) console.log(out.join('\n'));
  return issues;
}

export function rehearseArg(arg: string, onlyIssues: boolean): void {
  const [ch, st] = arg.split('-');
  const dir = path.join(ROOT, 'story', `ch${ch}`);
  const files = fs.readdirSync(dir).filter(f => /^\d+-\d+\.md$/.test(f) && (!st || f === `${arg}.md`)).sort((a, b) => +a.split('-')[1].replace('.md', '') - +b.split('-')[1].replace('.md', ''));
  if (!files.length) { console.log(C.r(`找不到 story/ch${ch}/${st ? arg + '.md' : ''}`)); return; }
  const sum = { '✗': 0, '!': 0, '△': 0 };
  for (const f of files) for (const iss of rehearse(path.join(dir, f), onlyIssues)) sum[iss.level]++;
  console.log(`\n${C.b('排练完')}：${files.length} 关  ${C.r('✗ ' + sum['✗'])}  ${C.y('! ' + sum['!'])}  ${C.d('△ ' + sum['△'])}`);
  console.log(C.d('✗ 演不出来  ! 要看一眼  △ 可能是问题；状态行 [站位]名字→/← 是朝向，* 是转身锁住朝向'));
}
