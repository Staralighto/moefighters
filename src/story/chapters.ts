/* 剧情闯关的关卡数据：剧本（story/chN/*.md）之外、只有游戏需要的部分——
   地图上的位置、无剧透简介、每场战斗的规则和附加目标、哪些人是复制体。
   剧本里的 @战斗 只写意图；这里把意图翻成规则（设计记录第 2 节「靠关卡规则拉开差距」）。
   每章导入时按关卡表补一份。 */

import type { ChallengeMods } from '../game/game.ts';
import type { StageType } from './script.ts';

/** 附加目标。第一个永远是「获胜」，所以一关最多 3 个、拿满 3 个是粉星。 */
export type Goal =
  /** label：生存关写「撑过 N 秒」。 */
  | { k: 'win'; label?: string }
  /** 我操控的角色剩余体力 ≥ v%。 */
  | { k: 'hp'; v: number }
  /** 我方两人都没有倒下。 */
  | { k: 'ally' }
  /** v 秒内获胜。 */
  | { k: 'time'; v: number }
  /** 用 L 必杀收尾。 */
  | { k: 'finL' }
  /** 打出 v 连击。 */
  | { k: 'combo'; v: number }
  /** 不用 L 必杀获胜。 */
  | { k: 'noL' };

export function goalText(g: Goal): string {
  switch (g.k) {
    case 'win': return g.label ?? '获胜';
    case 'hp': return `剩余体力 ≥ ${g.v}%`;
    case 'ally': return '我方两人都没有倒下';
    case 'time': return `${g.v} 秒内获胜`;
    case 'finL': return '用 L 必杀收尾';
    case 'combo': return `打出 ${g.v} 连击`;
    case 'noL': return '不用 L 必杀获胜';
  }
}

export interface Foe {
  id: string;
  /** 体力倍率（2 打 1 时给对面补血）。 */
  hp?: number;
  mods?: ChallengeMods;
  /** 梦魇（复制体）：战斗里压暗偏紫 + 紫描边 + 深影子，血条写「梦魇·名字」。 */
  nightmare?: boolean;
}

export interface StoryBattle {
  /** 我方出战（角色 id，第一个是玩家操控）。不写 = 第 1 章的祥子 + 初华，可在地图上切换操控。 */
  us?: string[];
  /** 玩家角色的规则（封印技能、开场满气等）。 */
  usMods?: ChallengeMods;
  /** 生存关：撑过这么多秒就算赢（倒计时从这里开始）。 */
  survive?: number;
  foes: Foe[];
  /** 0 轻松 1 标准 2 大师。队友永远是大师脑子（ai.ts）。 */
  difficulty: number;
  /** 结算三颗星：第一颗必须是 win。 */
  goals: [Goal, Goal, Goal];
  /** 规则提示：详情面板上、星标列表上方的一行小字。 */
  rule?: string;
}

export interface StoryStage {
  id: string;
  title: string;
  type: StageType;
  scene: string;
  /** 地图上的行：0 上、1 下，0.5 居中。 */
  row: number;
  teaser: string;
  /** 战前战后出现的人（详情面板头像）。战斗关用 battle.foes。 */
  cast: string[];
  battle?: StoryBattle;
  /** 复制体（剧本简称）。'always'：从一上场影子就深；字符串：等第一句含这段字的台词出现时影子才变深。 */
  copies?: Record<string, 'always' | string>;
}

export interface Chapter {
  no: number;
  name: string;
  en: string;
  stages: StoryStage[];
}

const win = { k: 'win' } as const;

export const CHAPTERS: Chapter[] = [{
  no: 1,
  name: '梦幻泡影',
  en: 'CHAPTER 01',
  stages: [
    { id: '1-01', title: '陌生的钟声', type: '剧情', scene: 'tsukinomori', row: 0, cast: ['sakiko', 'uika'],
      teaser: '醒来时，校门口安静得出奇。天空中传来一个陌生的声音。' },
    { id: '1-02', title: '失控的琴音', type: '战斗', scene: 'tsukinomori', row: 1, cast: [],
      teaser: '校门边的那个人，好像听不见她们说话。',
      copies: { 睦: 'always' },
      battle: { foes: [{ id: 'mutsumi', hp: 1.7, mods: { damage: 1.1 } }], difficulty: 1,
        goals: [win, { k: 'hp', v: 50 }, { k: 'time', v: 45 }], rule: '二对一 · 对手体力加强' } },
    { id: '1-03', title: '偶遇的迷途者', type: '剧情', scene: 'tsukinomori', row: 1, cast: ['sakiko', 'uika', 'soyo', 'anon'],
      teaser: '在校门外遇到了两个熟悉的身影——她们也不知道这里是哪里。' },
    { id: '1-04', title: '暴雨中的拦路客', type: '战斗', scene: 'lot-rain', row: 0, cast: [],
      teaser: '暴雨里的空地，有人早就等在那里。她们说，这是为了尽快凑齐积分。',
      battle: { foes: [{ id: 'yukina' }, { id: 'sayo' }], difficulty: 1,
        goals: [win, { k: 'ally' }, { k: 'combo', v: 8 }], rule: '二对二' } },
    { id: '1-05', title: '雨幕下的认同', type: '战斗', scene: 'lot-rain', row: 1, cast: [],
      teaser: '雨还没有停。这一次，双方都想看清对方的底细。',
      battle: { foes: [{ id: 'yukina', mods: { damage: 1.1, cdMul: .85 } }, { id: 'sayo', mods: { damage: 1.1, cdMul: .85 } }], difficulty: 1,
        goals: [win, { k: 'finL' }, { k: 'hp', v: 40 }], rule: '二对二 · 对手技能冷却缩短' } },
    { id: '1-06', title: '错位的夜色', type: '剧情', scene: 'ring', row: 0, cast: ['sakiko', 'uika', 'soyo', 'anon'],
      teaser: '走出雨幕，眼前却不是要去的地方。' },
    { id: '1-07', title: '咖啡厅的戒备', type: '战斗', scene: 'ring-cafe', row: 0, cast: [],
      teaser: '咖啡厅的角落里，有人等着推门进来的人。',
      battle: { foes: [{ id: 'mitake', mods: { damage: 1.15, moveMul: 1.12, cdMul: .8 } }, { id: 'moca' }], difficulty: 1,
        goals: [win, { k: 'time', v: 40 }, { k: 'ally' }], rule: '二对二 · 兰攻势急促' } },
    { id: '1-08', title: '星屑暴走之夜', type: '战斗', scene: 'asukayama', row: 1, cast: [],
      teaser: '飞鸟山的夜空亮得不正常，像有星星在坠落。',
      battle: { foes: [{ id: 'kasumi', hp: 1.2, mods: { damage: 1.2, energyMul: 1.6 } }, { id: 'arisa' }], difficulty: 1,
        goals: [win, { k: 'hp', v: 50 }, { k: 'combo', v: 10 }], rule: '二对二 · 香澄闪耀之力失控' } },
    { id: '1-09', title: '强硬的狩猎者', type: '战斗', scene: 'ring', row: 0, cast: [],
      teaser: 'RiNG 门口，有人在找能打的对手。',
      battle: { foes: [{ id: 'chuchu', hp: 1.1, mods: { damage: 1.15 } }, { id: 'pareo', hp: 1.1, mods: { damage: 1.15 } }], difficulty: 1,
        goals: [win, { k: 'ally' }, { k: 'finL' }], rule: '二对二 · 对手全面加强' } },
    { id: '1-10', title: '冰冷的倒影', type: '战斗', scene: 'ring-cafe', row: 1, cast: [],
      teaser: '回到约好的咖啡厅，熟悉的两个人已经在等了。',
      copies: { 爱音: 'always', 素世: 'always' },
      battle: { foes: [{ id: 'anon', hp: 1.15, mods: { stunMul: .75, damage: 1.1 } }, { id: 'soyo', hp: 1.15, mods: { stunMul: .75, damage: 1.1 } }], difficulty: 1,
        goals: [win, { k: 'hp', v: 50 }, { k: 'time', v: 45 }], rule: '二对二 · 对手受击硬直缩短' } },
    { id: '1-11', title: '虚空舞台的幻影', type: 'Boss', scene: 'yumemita', row: .5, cast: [],
      teaser: '空间裂开了。舞台中央站着的，是她们认识的人。',
      copies: { 睦: 'always' },
      battle: { foes: [{ id: 'mutsumi', hp: 2.6, mods: { damage: 1.25, cdMul: .7, stunMul: .55, escapeCombo: 4, energyMul: 1.3 } }], difficulty: 1,
        goals: [win, { k: 'ally' }, { k: 'finL' }], rule: 'BOSS · 体力大幅加强 · 霸体 · 冷却缩短' } },
    { id: '1-12', title: '脚下的暗影', type: '章末', scene: 'tsukinomori', row: .5, cast: ['sakiko', 'uika', 'soyo', 'anon'],
      teaser: '天快亮了。终于可以松一口气了吗？',
      copies: { 初华: '影子却黑得吓人' } },
  ],
}, {
  no: 2,
  name: '镜中梦魇',
  en: 'CHAPTER 02',
  // 第 2 章起每场战斗我方只上 1 人（us），用一打二、封印、镜像和 Boss 加强拉开难度。
  // 一对一不给对面加血：霸体、冷却缩短这类不对称优势已经够强。
  stages: [
    { id: '2-01', title: '暗影随行', type: '剧情', scene: 'tsukinomori', row: 0, cast: ['sakiko', 'uika'],
      teaser: '阳光很好。只是有件事，祥子不知道该不该说出口。',
      copies: { 初华: 'always' } },
    { id: '2-02', title: '琴房里的真相', type: '剧情', scene: 'sanctuary', row: 1, cast: ['sakiko', 'uika', 'mutsumi'],
      teaser: '音乐室里有人在等。她知道一些别人还不知道的事。',
      copies: { 初华: 'always' } },
    { id: '2-03', title: '三人的分岔路', type: '剧情', scene: 'tsukinomori', row: 0, cast: ['mutsumi', 'umiri', 'nyamu'],
      teaser: '时间回到刚来到这个世界的时候。那时，她们三个还在一起。' },
    { id: '2-04', title: '镜像的截击', type: '战斗', scene: 'lot-rain', row: 1, cast: [],
      teaser: '暴雨里拦路的那个人，有一张再熟悉不过的脸。',
      battle: { us: ['umiri'], foes: [{ id: 'umiri', nightmare: true, mods: { damage: 1.1, cdMul: .85 } }], difficulty: 1,
        goals: [win, { k: 'hp', v: 50 }, { k: 'time', v: 45 }], rule: '镜像对局 · 梦魇攻势凌厉' } },
    { id: '2-05', title: '断后的抉择', type: '剧情', scene: 'ring', row: 0, cast: ['mutsumi', 'umiri', 'nyamu'],
      teaser: '夜晚的街区，追兵又近了。总得有人留下来。' },
    { id: '2-06', title: '刻意的分道', type: '剧情', scene: 'tsukinomori', row: 1, cast: ['sakiko', 'uika', 'mutsumi'],
      teaser: '分头行动，效率更高——这句话是真心的吗？',
      copies: { 初华: 'always' } },
    { id: '2-07', title: '失踪的疑云', type: '战斗', scene: 'ring-cafe', row: 0, cast: [],
      teaser: '咖啡厅里只有两个人。说好的第三个人去了哪里？',
      battle: { us: ['sakiko'], foes: [{ id: 'taki' }, { id: 'soyo' }], difficulty: 1,
        goals: [win, { k: 'hp', v: 40 }, { k: 'noL' }], rule: '一对二' } },
    { id: '2-08', title: '孤身陷重围', type: '战斗', scene: 'ring', row: 1, cast: [],
      teaser: '跑得快是她的强项。可这一次，对面站着的是她认识的人。',
      copies: { 祥子: 'always', 喵梦: 'always' },
      battle: { us: ['anon'], usMods: { seal: true }, survive: 40,
        foes: [{ id: 'sakiko', nightmare: true, mods: { damage: .85 } }, { id: 'nyamu', nightmare: true, mods: { damage: .85 } }], difficulty: 1,
        goals: [{ k: 'win', label: '撑过 40 秒' }, { k: 'hp', v: 30 }, { k: 'combo', v: 6 }], rule: '一对二 · 闪耀之力未觉醒，只能用 J / K · 撑过 40 秒' } },
    { id: '2-09', title: '绝境的微光', type: '战斗', scene: 'asukayama', row: 0, cast: [],
      teaser: '飞鸟山的尽头，已经没有路了。',
      battle: { us: ['anon'], usMods: { startEnergy: 999 }, foes: [{ id: 'anon', nightmare: true, mods: { damage: 1.1 } }], difficulty: 1,
        goals: [win, { k: 'finL' }, { k: 'hp', v: 50 }], rule: '镜像对局 · 觉醒：开场满气' } },
    { id: '2-10', title: '宿命的镜影', type: 'Boss', scene: 'yumemita', row: .5, cast: [],
      teaser: '虚空舞台上有人在等她——用她自己的样子。',
      copies: { 初华: 'always' },
      battle: { us: ['sakiko'], foes: [{ id: 'sakiko', nightmare: true, mods: { damage: 1.15, cdMul: .75, stunMul: .6, escapeCombo: 4, energyMul: 1.3 } }], difficulty: 2,
        goals: [win, { k: 'hp', v: 30 }, { k: 'finL' }], rule: 'BOSS · 大师人机 · 霸体 · 冷却缩短' } },
    { id: '2-11', title: '星光的真相', type: '章末', scene: 'tsukinomori', row: .5, cast: ['sakiko', 'uika', 'mutsumi', 'soyo'],
      teaser: '舞台塌了。有些话，终于到了要说出口的时候。',
      copies: { 初华: 'always' } },
  ],
}];

export const ALL_STAGES: StoryStage[] = CHAPTERS.flatMap(c => c.stages);
export const stageById = (id: string): StoryStage | undefined => ALL_STAGES.find(s => s.id === id);
export const chapterOf = (id: string): Chapter | undefined => CHAPTERS.find(c => c.stages.some(s => s.id === id));
export const isFight = (s: StoryStage): boolean => !!s.battle;
/** 我方：主视角祥子 + 初华。 */
export const HEROES = ['sakiko', 'uika'] as const;
