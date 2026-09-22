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
    view: { kind: 'sprite', common: '/sprites/anon2.png', special: '/sprites/gale-special.png', height: 181 },
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
    view: { kind: 'sprite', common: '/sprites/ember-common.png', special: '/sprites/ember-special.png', height: 181 },
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
    view: { kind: 'sprite', common: '/sprites/boulder-common.png', special: '/sprites/boulder-special.png', height: 181 },
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
    view: { kind: 'sprite', common: '/sprites/sakiko-common.png', special: '/sprites/sakiko-special.png', height: 181 },
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
      kind: 'sprite', common: '/sprites/mutsumi-common.png', special: '/sprites/mutsumi-special.png', height: 181,
      extras: ['/sprites/mutsumi-cucumber.png', '/sprites/mutsumi-note.png', '/sprites/mutsumi-mortis.png'],
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
];

export const ROSTER_BY_ID = new Map(ROSTER.map(c => [c.id, c]));
