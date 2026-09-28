import type { CharacterData, Trait } from './types.ts';
import { skill } from './skills.ts';

/* Original placeholder cast. Sheets are ~7.3-head colour-block girls until img2img lands. */

const passives: Record<Trait, [string, string]> = {
  rush: ['追击节奏', '每第 3 次命中额外获得 14 气'],
  armor: ['硬派身躯', '受到的伤害降低 10%'],
  focus: ['远距专注', '飞行道具速度提高 15%'],
  beat: ['鼓点', '命中叠节拍（至多 8 层），每层冷却加快 6%、移速提高 2%；被击中掉 2 层'],
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
  {
    id: 'soyo', name: '长崎素世', title: '贝斯 / 假面', quote: '为什么要演奏春日影！', color: '#FFDD88',
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/soyo/common.png', special: '/sprites/soyo/special.png', height: 181,
      frenzy: '/sprites/soyo/frenzy.png',
      extras: ['/sprites/soyo/note.png'],
    },
    skills: [
      skill(0, 'light', '挥手'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'grab', '求你了！', {
        damage: 66, range: 130, start: .18, duration: 1.2, cd: 7, speed: 520, fx: 'onegai',
        desc: '冲刺抓住对方，停顿后头撞击飞；无视格挡',
      }),
      skill(3, 'endure', '就由我来结束一切', {
        damage: 0, start: .42, duration: .9, cd: 10, fx: 'resolve',
        desc: '霸体表情，震开周围敌人；8 秒内攻速大增，轻击三连后自动接重击',
      }),
      skill(4, 'projectile', '不甘的演奏', {
        damage: 30, count: 2, interval: .34, speed: 380, size: 52, start: .3, duration: 1.0, cd: 2, life: 2.2, fx: 'sob',
        desc: '哭奏贝斯，两枚贴地音符；跳起可躲',
      }),
      skill(5, 'projectile', '为什么要演奏春日影', {
        damage: 72, speed: 430, size: 150, start: .34, duration: 1.15, life: .56, fx: 'shout',
        desc: '音波推进四分之一战场，出手即可行动；定身 4 秒，受击两次解除',
      }),
    ],
  },
  {
    id: 'tomori', name: '高松灯', title: '主唱 / 迷子', quote: '那……能陪我组一辈子的乐队吗？', color: '#77BBDD',
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/tomori/common.png', special: '/sprites/tomori/special.png', height: 181,
      extras: ['/sprites/tomori/stone.png', '/sprites/tomori/plaster.png'],
    },
    skills: [
      skill(0, 'light', '轻拍'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'projectile', '飞砾谱', {
        damage: 12, knock: 380, speed: 540, size: 44, start: .16, duration: .5, life: 1.5, cd: .8, fx: 'stone',
        desc: '花坛捡来的小石头；命中强击退，专打断起手',
      }),
      skill(3, 'endure', '绊创膏', {
        damage: 0, start: .3, duration: .85, cd: 9, breakout: true, fx: 'plaster',
        desc: '解控；贴上企鹅创可贴震开周围敌人，6 秒内不易被打断、受伤降低 33%',
      }),
      skill(4, 'projectile', '奇独点', {
        damage: 8, knock: 0, interval: .2, start: .3, duration: .75, cd: 8, life: 1.4, size: 150, fx: 'blackhole',
        desc: '前方生成黑洞，吸住敌人并多段低伤，1.4 秒后消失；出手后即可行动，跳出可躲伤害，冲刺可脱',
      }),
      skill(5, 'endure', '诗超绊', {
        damage: 0, start: 1.0, duration: 1.35, fx: 'poem',
        desc: '原地歌唱 1 秒震退对手，随后召唤 1 名 MyGO 队友并肩 12 秒；队友生命只有两成，被击败提前退场',
      }),
    ],
  },
  {
    id: 'rana', name: '要乐奈', title: '吉他 / 野良猫', quote: '有趣的女人。', color: '#77DD77',
    ...stats('rush'),
    view: {
      kind: 'sprite', common: '/sprites/rana/common.png', special: '/sprites/rana/special.png', height: 181,
      extras: ['/sprites/rana/parfait.png', '/sprites/rana/matcha.png'],
    },
    skills: [
      skill(0, 'light', '轻挠'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'light', '吉他激奏', {
        damage: 12, count: 10, interval: .42, range: 240, start: .35, duration: 4.6, cd: 2, knock: 240, fx: 'riff',
        desc: '以自身为中心的圆形音波；按住一直弹，越弹越广也越疼；点按更省冷却',
      }),
      skill(3, 'dash', '来去如风', {
        damage: 0, range: 192, start: .1, duration: .34, cd: 2.4, invuln: .1, fx: 'wind',
        desc: '原地消失，再从别处出现；穿过一切',
      }),
      skill(4, 'launch', '高踢腿', { damage: 24, range: 180, cd: 4.5, desc: '兴致上来的高踢，把人踢上天' }),
      skill(5, 'projectile', '抹茶大芭菲', {
        damage: 14, count: 22, interval: .28, start: .45, duration: .85, life: 6.5, size: 56, knock: 90, fx: 'parfait',
        desc: '放下大芭菲，像火山一样喷发抹茶熔岩',
      }),
    ],
  },
  {
    id: 'taki', name: '椎名立希', title: '鼓手 / 护灯', quote: '我发誓，和灯在一起的话，一辈子也可以。', color: '#7777AA',
    ...stats('beat'),
    view: { kind: 'sprite', common: '/sprites/taki/common.png', special: '/sprites/taki/special.png', height: 181 },
    skills: [
      skill(0, 'light', '点打'),
      skill(1, 'heavy', '怪力横扫'),
      skill(2, 'projectile', '离灯远点', {
        damage: 14, speed: 520, size: 44, life: .5, start: .2, duration: .5, cd: 4, knock: 120, drain: 20, fx: 'abuse',
        desc: '毒舌气泡；命中削去对方 20 气',
      }),
      skill(3, 'endure', '哈？', {
        damage: 34, range: 280, start: .26, duration: .85, cd: 8, knock: 620, breakout: true, fx: 'huh',
        desc: '解控；一声「哈？」把周围的人震开',
      }),
      skill(4, 'dash', '我要拉黑他', {
        damage: 30, speed: 820, start: .1, duration: .45, range: 115, cd: 9, fx: 'ban',
        desc: '冲刺拉黑：对方完全禁足 3 秒，期间受伤减半',
      }),
      skill(5, 'grab', '和灯在一起的话，一辈子也可以', {
        damage: 28, range: 200, start: .3, duration: 2.05, speed: 500, fx: 'vow',
        desc: '抓住手腕，把对方当鼓由慢到快连打七击；残血时换台词',
      }),
    ],
  },
  {
    id: 'arale', name: '仲町阿拉蕾', title: '主唱 / 梦想', quote: '夢はパワー！', color: '#FFEE55',
    ...stats('focus'),
    frenzy: { rate: 1.18, rangeMul: 1.3, cdMul: 1, chain: false, time: 10, tint: '#ffe98a' },
    view: {
      kind: 'sprite', common: '/sprites/arale/common.png', special: '/sprites/arale/special.png', height: 181,
      frenzy: '/sprites/arale/frenzy.png',
    },
    skills: [
      skill(0, 'light', '拍拍'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'light', '高能量！', {
        damage: 14, count: 7, interval: .1, range: 160, start: .15, duration: 1.2, cd: 5,
        gain: 4, knock: 560, fx: 'flurry',
        desc: '七连快拳钉住对手；末拳强击退',
      }),
      skill(3, 'projectile', '高音量！', {
        damage: 13, count: 3, interval: .5, speed: 300, size: 150, life: 2.7,
        start: .25, duration: 1.5, cd: 7, knock: 120, fx: 'mega',
        desc: '慢速音波推进全场，把人推着走；跳起可躲',
      }),
      skill(4, 'endure', '高肌肉！', {
        damage: 0, range: 190, start: .35, duration: .9, cd: 10, fx: 'muscle',
        desc: '震开周围；7 秒内伤害提高 30%',
      }),
      skill(5, 'endure', '梦想即力量！', {
        damage: 0, range: 220, start: .5, duration: .9, fx: 'dream',
        desc: '狂化 10 秒：J/K 更快更长，真霸体，期间无法获得气',
      }),
    ],
  },
  {
    id: 'miyako', name: '藤都子', title: '键盘 / 阴角', quote: '临！兵！斗！者！皆！阵！烈！在！前！', color: '#9977CC',
    ...stats('focus'),
    view: {
      kind: 'sprite', common: '/sprites/miyako/common.png', special: '/sprites/miyako/special.png', height: 181,
      extras: ['/sprites/miyako/seal.png'],
    },
    skills: [
      skill(0, 'light', '轻点'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'heavy', '巨羊羹砸击', {
        damage: 20, range: 186, start: .24, duration: .58, cd: .7, knock: 120, fx: 'yokan',
        frail: 2, frailBonus: .2,
        desc: '从背后掏出羊羹下砸；打实后 2 秒内受伤增加 20%',
      }),
      skill(3, 'heavy', '秋叶原马拉松', {
        damage: 0, range: 0, start: .28, duration: .65, cd: 9, fx: 'marathon',
        desc: '摆出架势；完成后 4.5 秒内移速提高，普通攻击打不断',
      }),
      skill(4, 'heavy', '满月嚎叫', {
        damage: 70, range: 87, start: .4, duration: .72, cd: 7, knock: 580, fx: 'howl',
        desc: '贴身圆形音波，高伤强击退；放出时真霸体，跳到最高可出圈',
      }),
      skill(5, 'projectile', '九字真言', {
        // focus multiplies shot speed by 1.15; 366 lands on about 421, and 0.7s of that is ~295px.
        damage: 36, count: 1, speed: 366, size: 140, life: .7, interval: .07,
        start: .55, duration: .9, knock: 0, fx: 'seal',
        desc: '短距法阵穿透多段；打实后 3 秒不能格挡和后撤',
      }),
    ],
  },
  {
    id: 'ritsu', name: '峰月律', title: '节奏吉他 / 肉盾', quote: '10磅！七分熟！其中5磅配蒜香酱！剩下的配和风夏里亚宾酱！', color: '#4477CC',
    ...stats('armor'),
    view: {
      kind: 'sprite', common: '/sprites/ritsu/common.png', special: '/sprites/ritsu/special.png', height: 181,
    },
    skills: [
      skill(0, 'light', '轻拍'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'sweep', '超级带骨肉', {
        // Three sheet frames. A long hold on each one reads as a freeze, so the swing is short.
        damage: 64, range: 176, start: .2, duration: .5, cd: 8, knock: 520, fx: 'rib',
        desc: '朝地面砸下带骨肉，击倒；跳起可躲',
      }),
      skill(3, 'dash', '肉串刺击', {
        // 69 active frames at 668 px/s is 384px, four tenths of the 960-wide stage.
        damage: 36, range: 100, start: .12, duration: .78, cd: 6, speed: 668, knock: 160, fx: 'skewer',
        desc: '持肉串前冲约四成画面，穿过敌人；跳起可躲',
      }),
      skill(4, 'heavy', '大份牛排', {
        damage: 0, range: 0, start: .36, duration: .8, cd: 8, fx: 'steak',
        desc: '啃一口回复 60，霸体 4 秒；前摇被打中则作废',
      }),
      skill(5, 'endure', '超恢复', {
        damage: 0, range: 0, start: .45, duration: .9, fx: 'feast',
        desc: '6 秒内霸体、每秒回复 36，期间不能使用 J/K',
      }),
    ],
  },
  {
    id: 'nonoka', name: '宫永野乃花', title: '吉他 / 国王', quote: '对半分！', color: '#FFBBCC',
    ...stats('rush'),
    frenzy: { rate: 1, rangeMul: 1.65, cdMul: 2, damageMul: 1.55, chain: false, air: true, lock: true, time: 7, tint: '#ffd0dc' },
    view: {
      kind: 'sprite', common: '/sprites/nonoka/common.png', special: '/sprites/nonoka/special.png', height: 181,
      king: '/sprites/nonoka/king.png',
      // Staff fills the cell, so the body reads short. Playback only; feet stay on the cell bottom.
      kingScale: 1.1,
    },
    skills: [
      skill(0, 'light', '轻拍'),
      skill(1, 'heavy', '横踢'),
      skill(2, 'grab', '食兔者', {
        damage: 18, range: 175, start: .18, duration: 1.4, cd: 7, speed: 580, knock: 0, fx: 'rabbit',
        desc: '前冲约两成场地，贴脸停住连咬三口并锁住；不击倒',
      }),
      skill(3, 'grab', '抱抱还是亲亲', {
        damage: 10, range: 90, start: .16, duration: 2.05, cd: 9, speed: 420, knock: 110, fx: 'kiss',
        desc: '短冲抱住，1.5 秒内亲 5 下，最后一下击倒',
      }),
      skill(4, 'endure', '对半分', {
        damage: 0, range: 0, start: .35, duration: .85, cd: 10, fx: 'half',
        desc: '敌人身后召出半透明的自己：只普攻，伤害三成，血量两成，6 秒',
      }),
      skill(5, 'endure', 'Nono国王', {
        damage: 0, range: 160, start: .4, duration: .85, fx: 'king',
        desc: '发光后披风王冠权杖 7 秒：只剩普攻，范围和伤害提高，冷却加倍，无法获得气',
      }),
    ],
  },
];

/** Select screen. gale, ember and boulder stay on ROSTER for the headless checks. */
export const PLAYABLE = ROSTER.filter(c => c.id === 'sakiko' || c.id === 'mutsumi' || c.id === 'uika' || c.id === 'nyamu' || c.id === 'umiri' || c.id === 'anon' || c.id === 'soyo' || c.id === 'tomori' || c.id === 'taki' || c.id === 'rana' || c.id === 'arale' || c.id === 'miyako' || c.id === 'ritsu' || c.id === 'nonoka');

export const ROSTER_BY_ID = new Map(ROSTER.map(c => [c.id, c]));
