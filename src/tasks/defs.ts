/* 任务表。专辑 = 一个乐队（+ 最后一张「精选集」通用成就）。每条任务是数据 + 一个判定：
   test 读一场比赛的事实（tasks/facts.ts），返回这场给的进度增量；abs 时返回绝对值（取历史最大）；
   distinct 时返回本场符合的角色 id，进度 = 去重后的个数。
   乐队任务大部分按模板生成，成员多少自动决定要不要「全员」类任务；另有少量按角色关系手写的招牌任务。
   引用的角色不在公开名册里时该条自动不生成，改名单不会坏表。 */

import { BANDS, type BandId } from '../data/bands.ts';
import { PUBLIC_ROSTER } from '../data/characters.ts';
import type { MatchFacts } from './facts.ts';

export interface TaskCtx { streak: number; stamps: number; masterStamps: number }

export interface TaskDef {
  id: string;
  album: string;
  name: string;
  desc: string;
  goal: number;
  reward: number;
  test?(f: MatchFacts, c: TaskCtx): number;
  abs?: boolean;
  /** 只看累计数据（印章数），不需要比赛：打开任务页时也会重算。 */
  passive?: boolean;
  distinct?(f: MatchFacts): string[];
}

export interface AlbumDef {
  id: string;
  name: string;
  en: string;
  color: string;
  members: string[];
  /** 全清奖励：碎片 + 专属头像框。 */
  bonus: number;
  frame: string;
}

const NAME = new Map(PUBLIC_ROSTER.map(c => [c.id, c.name]));
const has = (id: string) => NAME.has(id);
const nm = (id: string) => NAME.get(id) ?? id;

const vsCpu = (f: MatchFacts) => f.diff != null && (f.kind === 'cpu' || f.kind === 'team' || f.kind === 'challenge');
const wonCpu = (f: MatchFacts) => vsCpu(f) && f.win === true;
const wonAny = (f: MatchFacts) => f.win === true && f.kind !== 'training' && f.kind !== 'watch';
const any = (ids: readonly string[], set: readonly string[]) => ids.some(id => set.includes(id));

const members = (b: BandId) => PUBLIC_ROSTER.filter(c => c.bands?.includes(b)).map(c => c.id);

/* 招牌任务：[专辑, id 后缀, 名字, 用谁, 击败谁（null = 任意）, 额外条件, 条件说明, 奖励] */
type Sig = [BandId, string, string, string, string | null, ((f: MatchFacts) => boolean) | null, string, number];
const SIGS: Sig[] = [
  ['ave-mujica', 'reunion', '再一次的合奏', 'sakiko', 'mutsumi', null, '', 40],
  ['ave-mujica', 'heat', '蹭到热度了', 'nyamu', 'sakiko', null, '', 40],
  ['mygo', 'warn', '立希的警告', 'taki', 'anon', null, '', 40],
  ['mygo', 'haruhikage', '春日影的执念', 'soyo', 'sakiko', null, '', 40],
  ['poppin-party', 'kirakira', '闪闪发光的心跳', 'kasumi', 'arisa', null, '', 40],
  ['poppin-party', 'bakery', '面包与巧克力螺', 'saaya', 'rimi', null, '', 40],
  ['pastel-palettes', 'lecture', '说教时间', 'chisato', 'aya', null, '', 40],
  ['pastel-palettes', 'onee', '姐姐看我！', 'hina', 'sayo', null, '', 40],
  ['roselia', 'twins', '双子对决', 'sayo', 'hina', null, '', 40],
  ['roselia', 'surpass', '超越姐姐', 'ako', 'tomoe', null, '', 40],
  ['hello-happy', 'bear', '熊也有脾气', 'misaki', 'kokoro', null, '', 40],
  ['hello-happy', 'notlost', '这次没迷路', 'kanon', null, f => (f.diff ?? 0) >= 1, '（标准或以上）', 40],
  ['sumimi', 'civil', 'sumimi 内战', 'mana', 'uika', null, '', 40],
  ['afterglow', 'rival', '宿敌·蓝蔷薇', 'mitake', 'yukina', null, '', 40],
  ['afterglow', 'face', '大姐头的面子', 'tomoe', 'ako', null, '', 40],
  ['raise-a-suilen', 'down', '打倒 Roselia！', 'chuchu', 'yukina', null, '', 40],
  ['raise-a-suilen', 'senpai', '前辈的关照', 'masking', 'lock', null, '', 40],
  ['morfonica', 'stage', '本小姐的主场', 'toko', 'mashiro', null, '', 40],
  ['morfonica', 'leader', '队长的威严', 'tsukushi', null, f => (f.diff ?? 0) >= 1, '（标准或以上）', 40],
  ['millsage', 'wolf', '狼王降临', 'natsume', null, f => f.finKey === 'L', '，并以必杀终结', 40],
  ['ikka-dumb-rock', 'family', '笨蛋一家', 'raika', 'miku', null, '', 40],
  ['ikka-dumb-rock', 'top', '头号人物', 'chieri', null, f => f.diff === 2, '（大师）', 50],
  ['kessoku-band', 'hero', '吉他英雄', 'bocchi', null, f => f.diff === 2, '（大师）', 50],
  ['kessoku-band', 'comeback', '社恐的逆袭', 'bocchi', null, f => f.hp <= 10, '，且剩余血量不超过 10%', 40],
];

function bandTasks(b: BandId, name: string): TaskDef[] {
  const m = members(b);
  const id = (s: string) => `${b}:${s}`;
  const out: TaskDef[] = [
    { id: id('win3'), album: b, name: '初登台', desc: `用 ${name} 的成员战胜人机 3 次`, goal: 3, reward: 20, test: f => wonCpu(f) && any(f.mine, m) ? 1 : 0 },
    { id: id('std'), album: b, name: '正式公演', desc: `用 ${name} 的成员击败标准或以上难度的人机`, goal: 1, reward: 30, test: f => wonCpu(f) && (f.diff ?? 0) >= 1 && any(f.mine, m) ? 1 : 0 },
    { id: id('master'), album: b, name: '巅峰对决', desc: `用 ${name} 的成员击败大师难度的人机`, goal: 1, reward: 60, test: f => wonCpu(f) && f.diff === 2 && any(f.mine, m) ? 1 : 0 },
    { id: id('ult'), album: b, name: '压轴', desc: `用 ${name} 的成员以必杀（L）终结一场胜利`, goal: 1, reward: 30, test: f => wonAny(f) && f.finKey === 'L' && any(f.mine, m) ? 1 : 0 },
  ];
  if (m.length >= 2) {
    out.push(
      { id: id('each'), album: b, name: '轮番上阵', desc: `用每一位 ${name} 成员各战胜一次人机`, goal: m.length, reward: 50, distinct: f => wonCpu(f) ? f.mine.filter(x => m.includes(x)) : [] },
      { id: id('all'), album: b, name: '全员点名', desc: `击败每一位 ${name} 成员（人机）`, goal: m.length, reward: 50, distinct: f => wonCpu(f) ? f.foes.filter(x => m.includes(x)) : [] },
      { id: id('duo'), album: b, name: '同台', desc: `两位 ${name} 成员组队，在 2V2 中战胜人机`, goal: 1, reward: 40, test: f => wonCpu(f) && f.mine.length >= 2 && f.mine.filter(x => m.includes(x)).length >= 2 ? 1 : 0 },
    );
  }
  for (const [band, key, title, user, foe, extra, extraText, reward] of SIGS) {
    if (band !== b || !has(user) || (foe && !has(foe))) continue;
    out.push({
      id: id(key), album: b, name: title,
      desc: foe ? `用 ${nm(user)} 击败 ${nm(foe)}（人机）${extraText}` : `用 ${nm(user)} 战胜人机${extraText}`,
      goal: 1, reward,
      test: f => wonCpu(f) && f.mine.includes(user) && (!foe || f.foes.includes(foe)) && (!extra || extra(f)) ? 1 : 0,
    });
  }
  return out;
}

const BEST: TaskDef[] = [
  { id: 'best:first', album: 'best', name: '第一场演出', desc: '赢下任意一场对战', goal: 1, reward: 20, test: f => wonAny(f) ? 1 : 0 },
  { id: 'best:flawless', album: 'best', name: '完美演出', desc: '无伤战胜人机', goal: 1, reward: 40, test: f => wonCpu(f) && f.hp >= 100 ? 1 : 0 },
  { id: 'best:encore', album: 'best', name: '绝境安可', desc: '剩余血量不超过 10% 时战胜人机', goal: 1, reward: 40, test: f => wonCpu(f) && f.hp <= 10 ? 1 : 0 },
  { id: 'best:shutout', album: 'best', name: '一气呵成', desc: '一个回合都不丢，战胜标准或以上难度的人机', goal: 1, reward: 40, test: f => wonCpu(f) && f.shutout && (f.diff ?? 0) >= 1 ? 1 : 0 },
  { id: 'best:streak', album: 'best', name: '连续公演', desc: '连续战胜人机 5 次', goal: 5, reward: 50, abs: true, test: (_f, c) => c.streak },
  { id: 'best:master10', album: 'best', name: '大师的认可', desc: '击败大师难度的人机 10 次', goal: 10, reward: 100, test: f => wonCpu(f) && f.diff === 2 ? 1 : 0 },
  { id: 'best:combo', album: 'best', name: '连段大师', desc: '一场对战中打出 30 连击', goal: 1, reward: 40, test: f => f.kind !== 'training' && f.kind !== 'watch' && f.combo >= 30 ? 1 : 0 },
  { id: 'best:ults', album: 'best', name: '火力全开', desc: '一场胜利中放出 3 次必杀', goal: 1, reward: 30, test: f => wonAny(f) && f.ults >= 3 ? 1 : 0 },
  { id: 'best:rankS', album: 'best', name: 'S 级演出', desc: '拿到 10 次 S 评级', goal: 10, reward: 50, test: f => wonAny(f) && f.rank === 'S' ? 1 : 0 },
  { id: 'best:cast', album: 'best', name: '百变舞台', desc: '用 10 位不同的角色战胜人机', goal: 10, reward: 60, distinct: f => wonCpu(f) ? f.mine : [] },
  { id: 'best:team', album: 'best', name: '双人舞台', desc: '在 2V2 中战胜人机 5 次', goal: 5, reward: 40, test: f => wonCpu(f) && f.kind === 'team' ? 1 : 0 },
  { id: 'best:pvp', album: 'best', name: '同屏对决', desc: '进行 5 场本地双人对战', goal: 5, reward: 30, test: f => f.kind === 'pvp' ? 1 : 0 },
  { id: 'best:online', album: 'best', name: '远方的对手', desc: '完成 5 场联机对战', goal: 5, reward: 50, test: f => f.kind === 'online' && f.win !== null ? 1 : 0 },
  { id: 'best:climb', album: 'best', name: '无尽之路', desc: '在无尽模式中通过第 10 关', goal: 10, reward: 60, abs: true, test: f => f.kind === 'challenge' && f.win === true ? f.stage : 0 },
  { id: 'best:stamps', album: 'best', name: '印章收藏家', desc: '集齐 20 枚印章', goal: 20, reward: 60, abs: true, passive: true, test: (_f, c) => c.stamps },
  { id: 'best:gold', album: 'best', name: '金色印章', desc: '集齐 10 枚大师印章', goal: 10, reward: 80, abs: true, passive: true, test: (_f, c) => c.masterStamps },
];

export const ALBUMS: readonly AlbumDef[] = [
  ...BANDS.map(b => ({ id: b.id, name: b.name, en: b.name.toUpperCase(), color: b.color, members: members(b.id), bonus: 150, frame: `frame:${b.id}` }))
    .filter(a => a.members.length),
  { id: 'best', name: '精选集', en: 'GREATEST HITS', color: '#E9C46A', members: [], bonus: 200, frame: 'frame:best' },
];

export const TASKS: readonly TaskDef[] = [
  ...ALBUMS.filter(a => a.id !== 'best').flatMap(a => bandTasks(a.id as BandId, a.name)),
  ...BEST,
];

export const TASK_BY_ID: ReadonlyMap<string, TaskDef> = new Map(TASKS.map(t => [t.id, t]));
export const tasksOf = (album: string) => TASKS.filter(t => t.album === album);
