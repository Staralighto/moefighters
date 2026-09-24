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
      skill(4, 'dash', '焰步', { damage: 44, desc: '短距离突进' }),
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
      skill(0, 'light', '礼掌', { desc: '命中可接 J / K' }),
      skill(1, 'heavy', '拂踢', { range: 132, desc: '轻击后可接' }),
      skill(2, 'dash', '忘却步', { range: 120, desc: '前冲掌击' }),
      skill(3, 'light', '轮舞', { damage: 22, range: 188, start: .08, duration: .64, cd: 3, count: 3, interval: .11, desc: '绕身连打三下' }),
      skill(4, 'launch', '月牙踢', { range: 126, fx: 'crescent', desc: '命中挑空' }),
      skill(5, 'projectile', '忘却奏鸣', {
        damage: 40, count: 8, interval: .075, speed: 540, size: 40, start: .3, duration: 1.2, life: 2.2, fx: 'note',
        desc: '连发八枚音符',
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
      skill(2, 'projectile', '回旋黄瓜', { fx: 'cucumber', speed: 420, size: 48, life: 2.4, desc: '飞到尽头折返' }),
      skill(3, 'heavy', '轮奏', { range: 188, start: .16, duration: .7, cd: 5, knock: 320, breakout: true, invuln: .8, desc: '击退身前；吃必杀可解控，无敌 0.8 秒' }),
      skill(4, 'projectile', '三音', {
        damage: 28, count: 3, interval: .16, speed: 520, size: 36, start: .2, duration: .85, fx: 'mutsumi-note',
        desc: '向前连发三枚',
      }),
      skill(5, 'grab', '墨缇丝', {
        damage: 48, range: 280, start: .34, duration: 1.35, count: 4, interval: .12, fx: 'mortis',
        desc: '前冲抓取，连打四下',
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
      skill(2, 'dash', '爬行', { damage: 18, cd: 1.2, speed: 420, duration: .72, fx: 'crawl', desc: '前冲；只打站立目标' }),
      skill(3, 'projectile', '悲鸣', {
        damage: 26, interval: .12, start: .2, duration: .95, size: 36, fx: 'wail',
        desc: '血越少枚数越多（1～4）',
      }),
      skill(4, 'grab', '别走'),
      skill(5, 'grab', '推落', { fx: 'shove', speed: 700, duration: 2.2, desc: '前冲抓取并甩飞' }),
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
        desc: '抛物线，中段从头顶过；落地可捡回气',
      }),
      skill(3, 'projectile', '扫货', {
        damage: 9, count: 6, interval: .05, size: 40, start: .12, duration: .7, cd: 4.5, life: 1.5, fx: 'bag',
        desc: '抛物线六连发，落地消失；贴脸全中',
      }),
      skill(4, 'endure', '恐湖', {
        damage: 32, range: 300, start: .26, duration: .85, cd: 8, fx: 'ripple', breakout: true,
        desc: '前后都打，强击退；吃必杀可脱出',
      }),
      skill(5, 'grab', '信用', {
        damage: 175, range: 110, start: .16, duration: 1.15, speed: 220, fx: 'slam',
        desc: '抓住向后摔',
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
      skill(2, 'launch', '回旋踢', { range: 130, desc: '命中挑空' }),
      skill(3, 'sweep', '扫膛腿'),
      skill(4, 'heavy', '月牙踢', { range: 190, cd: 5, fx: 'arc-kick', desc: '大范围下砸' }),
      skill(5, 'projectile', '满场', {
        damage: 36, count: 16, interval: .09, size: 36, start: .28, duration: 2.6, life: 2.4, fx: 'drums',
        desc: '大招持续弹开近身；音符分两次铺满全场',
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
        desc: '超长距离冲刺',
      }),
      skill(3, 'projectile', 'C和弦', {
        damage: 11, count: 12, interval: .11, speed: 420, size: 36, start: .16, duration: 1.64, cd: 5.5, life: 1.6, fx: 'chord',
        desc: '追踪音符；按住连发至十二发',
      }),
      skill(4, 'projectile', '爱音之光', {
        damage: 28, speed: 460, size: 56, start: .35, duration: .9, cd: 7, life: 2.2, fx: 'heart',
        desc: '命中定身 3 秒；再受击两次解除',
      }),
      skill(5, 'light', '不会再逃避了', {
        damage: 40, range: 300, start: .28, duration: 1.26, count: 6, interval: .14, fx: 'spin',
        desc: '一周身连打，最后击飞',
      }),
    ],
  },
];

/** Select screen. gale, ember and boulder stay on ROSTER for the headless checks. */
export const PLAYABLE = ROSTER.filter(c => c.id === 'sakiko' || c.id === 'mutsumi' || c.id === 'uika' || c.id === 'nyamu' || c.id === 'umiri' || c.id === 'anon');

export const ROSTER_BY_ID = new Map(ROSTER.map(c => [c.id, c]));
