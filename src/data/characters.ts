import type { CharacterData, Trait } from './types.ts';
import { skill } from './skills.ts';

/* Original placeholder cast. Sheets are ~7.3-head colour-block girls until img2img lands. */

const passives: Record<Trait, [string, string]> = {
  rush: ['追击节奏', '每第 3 次命中额外获得 14 气'],
  armor: ['硬派身躯', '受到的伤害降低 10%'],
  focus: ['远距专注', '飞行道具速度提高 15%'],
};

const stats = (trait: Trait) => ({
  trait,
  passive: passives[trait],
  hp: trait === 'armor' ? 1080 : 1000,
  speed: trait === 'rush' ? 248 : trait === 'armor' ? 195 : 225,
  power: trait === 'armor' ? 1.06 : 1,
});

export const ROSTER: CharacterData[] = [
  {
    id: 'gale', name: '疾风', title: '快攻 / 连击', quote: '跟上我的速度。', color: '#7ee0ff',
    ...stats('rush'),
    view: { kind: 'sprite', common: '/sprites/gale/common.png', special: '/sprites/gale/special.png', height: 181 },
    skills: [
      skill(0, 'light', '快拳'),
      skill(1, 'heavy', '回旋踢'),
      skill(2, 'dash', '疾步突进'),
      skill(3, 'upper', '旋风升龙'),
      skill(4, 'grab', '缠抱摔'),
      skill(5, 'dash', '风暴穿刺'),
    ],
  },
  {
    id: 'ember', name: '星火', title: '远程 / 牵制', quote: '保持距离，慢慢烧。', color: '#ffb35c',
    ...stats('focus'),
    view: { kind: 'sprite', common: '/sprites/ember/common.png', special: '/sprites/ember/special.png', height: 181 },
    skills: [
      skill(0, 'light', '拨火'),
      skill(1, 'heavy', '重杖'),
      skill(2, 'projectile', '火球'),
      skill(3, 'launch', '焰柱上挑'),
      skill(4, 'dash', '焰步', { damage: 44, desc: '短距离突进，用于拉开或贴近' }),
      skill(5, 'projectile', '三连星火'),
    ],
  },
  {
    id: 'boulder', name: '磐石', title: '重装 / 压制', quote: '站稳了再说。', color: '#b7ff6e',
    ...stats('armor'),
    view: { kind: 'sprite', common: '/sprites/boulder/common.png', special: '/sprites/boulder/special.png', height: 181 },
    skills: [
      skill(0, 'light', '重拳'),
      skill(1, 'heavy', '砸拳'),
      skill(2, 'grab', '熊抱'),
      skill(3, 'endure', '磐石冲肩'),
      skill(4, 'sweep', '地裂扫腿'),
      skill(5, 'grab', '大地抱摔'),
    ],
  },
  {
    id: 'sakiko', name: '丰川祥子', title: '近身 / 奏鸣', quote: '我毋畏遗忘。', color: '#7799CC',
    ...stats('rush'),
    view: { kind: 'sprite', common: '/sprites/sakiko/common.png', special: '/sprites/sakiko/special.png', height: 181 },
    skills: [
      skill(0, 'light', '礼掌', { desc: '掌缘轻点；命中可接 J / K' }),
      skill(1, 'heavy', '拂踢', { range: 132, desc: '横踢带开对手；可接在轻击后' }),
      skill(2, 'dash', '忘却步', { range: 120, desc: '踏步前冲，掌击身前' }),
      skill(3, 'light', '轮舞', { damage: 22, range: 150, start: .08, duration: .64, cd: 5, count: 3, interval: .11, desc: '绕身连打三下' }),
      skill(4, 'launch', '月牙踢', { range: 126, fx: 'crescent', desc: '月牙上踢，命中将对手送上空中' }),
      skill(5, 'projectile', '忘却奏鸣', {
        damage: 40, count: 8, interval: .075, speed: 540, size: 40, start: .3, duration: 1.2, life: 2.2, fx: 'note',
        desc: '召出键盘，连发八枚音符；消耗 100 气',
      }),
    ],
  },
  {
    id: 'mutsumi', name: '若叶睦', title: '沉默 / 园艺', quote: '我弹得太差了……', color: '#779977',
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/mutsumi/common.png', special: '/sprites/mutsumi/special.png', height: 181,
      extras: ['/sprites/mutsumi/cucumber.png', '/sprites/mutsumi/note.png', '/sprites/mutsumi/mortis.png'],
    },
    skills: [
      skill(0, 'light', '点拨'),
      skill(1, 'heavy', '拂踢'),
      skill(2, 'projectile', '回旋黄瓜', { fx: 'cucumber', speed: 420, size: 48, life: 2.4, desc: '掷出黄瓜，飞到尽头后折返' }),
      skill(3, 'heavy', '轮奏', { range: 150, start: .16, duration: .7, cd: 5, desc: '抱琴转身横扫，把身前的人撞开' }),
      skill(4, 'projectile', '三音', {
        damage: 28, count: 3, interval: .16, speed: 520, size: 36, start: .2, duration: .85, fx: 'mutsumi-note',
        desc: '原地拨弦，向前连发三枚音符',
      }),
      skill(5, 'grab', '墨缇丝', {
        damage: 48, range: 280, start: .34, duration: 1.35, count: 4, interval: .12, fx: 'mortis',
        desc: '唤出墨缇丝前冲，抓住后连打四下；消耗 100 气',
      }),
    ],
  },
  {
    id: 'uika', name: '三角初华', title: '忠犬 / 悲伤', quote: '我毋畏悲伤。', color: '#BB9955',
    ...stats('rush'),
    view: { kind: 'sprite', common: '/sprites/uika/common.png', special: '/sprites/uika/special.png', height: 181 },
    skills: [
      skill(0, 'light', '轻唤'),
      skill(1, 'heavy', '靴踢'),
      skill(2, 'dash', '爬行', { damage: 18, cd: 1.2, speed: 420, duration: .72, fx: 'crawl', desc: '短冷却的低伤害前冲，打中站着的人' }),
      skill(3, 'projectile', '悲鸣', {
        damage: 26, interval: .12, start: .2, duration: .95, size: 36, fx: 'wail',
        desc: '血量高于 75% / 50% / 25% 时发 1 / 2 / 3 枚，否则 4 枚',
      }),
      skill(4, 'grab', '别走'),
      skill(5, 'grab', '推落', { fx: 'shove', speed: 700, duration: 2.2, desc: '前冲抓住，冲刺留下金色残影，顿一下再甩飞；对手会转向自己；消耗 100 气' }),
    ],
  },
  {
    id: 'umiri', name: '八幡海铃', title: '雇佣 / 恐惧', quote: '我毋畏恐惧。', color: '#335566',
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/umiri/common.png', special: '/sprites/umiri/special.png', height: 181,
      extras: ['/sprites/umiri/milk.png', '/sprites/umiri/bag.png'],
    },
    skills: [
      skill(0, 'light', '点指'),
      skill(1, 'heavy', '靴踢'),
      skill(2, 'projectile', '报价', {
        damage: 16, speed: 560, size: 36, life: 1.6, start: .12, duration: .45, fx: 'milk',
        desc: '抛物线扔出巧克力奶。贴脸和下落能中，中距离飞过头顶。落地 3 秒内捡起回复 26 气',
      }),
      skill(3, 'projectile', '扫货', {
        damage: 9, count: 6, interval: .05, size: 40, start: .12, duration: .7, cd: 4.5, life: 1.5, fx: 'bag',
        desc: '六只购物袋抛物线飞出，落地即消失。贴脸可全中，主要造成僵直',
      }),
      skill(4, 'endure', '恐湖', {
        damage: 32, range: 300, start: .26, duration: .85, cd: 8, fx: 'ripple',
        desc: '贴地波纹，前后都打，伤害低、击退强。吃必杀连击时按下可无敌脱出',
      }),
      skill(5, 'grab', '信用', {
        damage: 175, range: 110, start: .16, duration: 1.15, speed: 220, fx: 'slam',
        desc: '双手前抓，再向反方向摔到地上。消耗 100 气',
      }),
    ],
  },
  {
    id: 'nyamu', name: '祐天寺喵梦', title: '鼓手 / 恋爱', quote: '我毋畏恋爱。', color: '#C6B4E3',
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/nyamu/common.png', special: '/sprites/nyamu/special.png', height: 181,
      extras: ['/sprites/nyamu/kit.png'],
    },
    skills: [
      skill(0, 'light', '轻点'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'launch', '回旋踢', { range: 130, desc: '转腰横踢，命中将对手挑上空中' }),
      skill(3, 'sweep', '扫膛腿'),
      skill(4, 'heavy', '月牙踢', { range: 190, cd: 5, fx: 'arc-kick', desc: '腿扫过四分之三圆后砸下，范围大，带残影' }),
      skill(5, 'projectile', '满场', {
        damage: 36, count: 8, interval: .1, size: 36, start: .28, duration: 1.8, life: 2.4, fx: 'drums',
        desc: '坐下敲鼓，先击退身前的人，音符从天而降铺满全场；消耗 100 气',
      }),
    ],
  },
  {
    id: 'anon', name: '千早爱音', title: '跑女 / 扫弦', quote: '是又怎样？', color: '#FF8899',
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/anon/common.png', special: '/sprites/anon/special.png', height: 181,
      extras: ['/sprites/anon/note.png', '/sprites/anon/heart.png', '/sprites/anon/guitar.png'],
    },
    skills: [
      skill(0, 'light', '轻点'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'dash', '羽丘跑女', {
        damage: 22, cd: 2.2, speed: 1450, start: .08, duration: .46, range: 100,
        desc: '低伤害短冷却的长冲刺，大约横跨半个战场，留下残影',
      }),
      skill(3, 'projectile', 'C和弦', {
        damage: 11, count: 12, interval: .11, speed: 420, size: 36, start: .16, duration: 1.64, cd: 5.5, life: 1.6, fx: 'chord',
        desc: '劈腿扫弦。点按三发追踪音符，按住最多十二发，伤害低并击退',
      }),
      skill(4, 'projectile', '爱音之光', {
        damage: 28, speed: 460, size: 56, start: .35, duration: .9, cd: 7, life: 2.2, fx: 'heart',
        desc: 'wink 后放出爱心。命中后 3 秒不能移动，其间再被击中两次则解除',
      }),
      skill(5, 'light', '不会再逃避了', {
        damage: 40, range: 300, start: .28, duration: 1.26, count: 6, interval: .14, fx: 'spin',
        desc: '掏出吉他转两圈，打满一周身。前几下留在圈里，最后一下击飞。消耗 100 气',
      }),
    ],
  },
];

/** Select screen. gale, ember and boulder stay on ROSTER for the headless checks. */
export const PLAYABLE = ROSTER.filter(c => c.id === 'sakiko' || c.id === 'mutsumi' || c.id === 'uika' || c.id === 'nyamu' || c.id === 'umiri' || c.id === 'anon');

export const ROSTER_BY_ID = new Map(ROSTER.map(c => [c.id, c]));
